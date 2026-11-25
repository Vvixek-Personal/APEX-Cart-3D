import type { MutableRefObject } from 'react';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildKartMesh } from '../kart/buildKartMesh';
import {
  KartInputState,
  createInitialKartState,
  stepKartPhysics,
} from '../kart/kartPhysics';
import { SpectatorCameraController } from '../camera/spectatorCamera';
import {
  createTrackCurve,
  getBannerPlacements,
  sampleTrackFrames,
} from '../track/trackLayout';
import type { CameraMode } from '../components/TouchControls';
import { buildTrackBanners } from './buildBanners';
import { buildStadiumArchitecture } from './buildStadium';
import { buildTrackEnvironment } from './buildTrackMesh';
import { createProceduralTextures } from './textures';

function detectSoftwareWebGL(): boolean {
  const probe = document.createElement('canvas');
  const gl = probe.getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

// Pre-allocated scratch math objects to keep the render loop GC-free
const _desiredCamPos = new THREE.Vector3();
const _desiredCamTarget = new THREE.Vector3();
const _kartPos = new THREE.Vector3();
const _forwardVec = new THREE.Vector3();

interface GoKartTrackCanvasProps {
  cameraMode: CameraMode;
  touchInputRef: MutableRefObject<KartInputState>;
  onToggleCamera: () => void;
}

export function GoKartTrackCanvas({
  cameraMode,
  touchInputRef,
  onToggleCamera,
}: GoKartTrackCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cameraModeRef = useRef<CameraMode>(cameraMode);
  const onToggleCameraRef = useRef(onToggleCamera);

  useEffect(() => {
    cameraModeRef.current = cameraMode;
    if (containerRef.current) {
      containerRef.current.setAttribute('data-camera-mode', cameraMode);
    }
  }, [cameraMode]);

  useEffect(() => {
    onToggleCameraRef.current = onToggleCamera;
  }, [onToggleCamera]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    let currentAspect = width / Math.max(height, 1);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.96;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.setAttribute('data-testid', 'track-canvas');
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const horizonFog = new THREE.Fog(0xcce9fb, 760, 1750);
    scene.fog = horizonFog;

    // Studio reflection environment for subtle metallic highlights
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

    // Procedural textures
    const maxAnisotropy = isSoftwareGl
      ? 1
      : Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    const textures = createProceduralTextures(maxAnisotropy);
    scene.background = textures.skyBackdrop;

    // Bright, soft daylight lighting rig scaled to cover the 240x240 field and surrounding stadium
    const hemiLight = new THREE.HemisphereLight(0xd9efff, 0x3b8f2e, 0.65);
    hemiLight.position.set(0, 180, 0);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff5e0, 1.45);
    sunLight.position.set(-165, 280, 195);
    sunLight.castShadow = true;
    const shadowSize = isSoftwareGl ? 1024 : 2048;
    sunLight.shadow.mapSize.set(shadowSize, shadowSize);
    sunLight.shadow.camera.near = 25;
    sunLight.shadow.camera.far = 850;
    sunLight.shadow.camera.left = -255;
    sunLight.shadow.camera.right = 255;
    sunLight.shadow.camera.top = 255;
    sunLight.shadow.camera.bottom = -255;
    sunLight.shadow.bias = -0.0008;
    sunLight.shadow.normalBias = 0.18;
    sunLight.shadow.radius = 3.0;
    scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight(0xdceeff, 0.25);
    fillLight.position.set(160, 120, -150);
    scene.add(fillLight);

    // Enlarged 2x track environment, banners, and empty open-air stadium outside grass field
    const curve = createTrackCurve();
    const frames = sampleTrackFrames(curve, 640);
    const bannerPlacements = getBannerPlacements(curve);

    // Subtle expansive distant terrain plane so the stadium park sits grounded in a soft horizon
    const horizonGroundGeo = new THREE.PlaneGeometry(5200, 5200);
    horizonGroundGeo.rotateX(-Math.PI / 2);
    const horizonGroundMat = new THREE.MeshStandardMaterial({
      color: 0x6ca463,
      roughness: 0.96,
      metalness: 0.0,
    });
    const horizonGroundMesh = new THREE.Mesh(horizonGroundGeo, horizonGroundMat);
    horizonGroundMesh.position.y = -4.02;
    horizonGroundMesh.receiveShadow = false;
    scene.add(horizonGroundMesh);

    const trackBuild = buildTrackEnvironment(frames, bannerPlacements, textures);
    scene.add(trackBuild.group);

    const stadiumBuild = buildStadiumArchitecture(textures);
    scene.add(stadiumBuild.group);

    const bannerBuild = buildTrackBanners(bannerPlacements, textures);
    scene.add(bannerBuild.group);

    // Lightweight 3D player go-kart placed on the starting grid facing the track
    const kartRig = buildKartMesh(textures.contactShadow);
    let kartState = createInitialKartState(curve);
    kartRig.group.position.set(kartState.x, 0.04, kartState.z);
    kartRig.group.rotation.y = kartState.yaw;
    scene.add(kartRig.group);

    // Cinematic elevated three-quarter city skyline spectator camera
    const spectatorCtrl = new SpectatorCameraController();
    const camera = new THREE.PerspectiveCamera(38, currentAspect, 14, 4800);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.minPolarAngle = THREE.MathUtils.degToRad(26);
    controls.maxPolarAngle = Math.PI * 0.44;
    controls.minDistance = 80;
    controls.maxDistance = 3000;

    const initialPose = spectatorCtrl.snapToPose(
      camera,
      currentAspect,
      kartState.x,
      kartState.z,
      controls.target,
    );
    let specElevDeg = initialPose.elevationDeg;
    let specAzimDeg = initialPose.azimuthDeg;
    let specDist = initialPose.distance;
    horizonFog.near = Math.max(540, initialPose.distance * 1.12);
    horizonFog.far = Math.max(1250, initialPose.distance * 2.02);

    let userMovedOrbit = false;
    let returningToSpectator = false;
    let prevCameraMode: CameraMode = cameraModeRef.current;

    // Keyboard input state (separated held keys from edge-triggered C toggle)
    const keyInput: KartInputState = {
      accelerate: false,
      brakeReverse: false,
      steerLeft: false,
      steerRight: false,
    };

    const clearAllInputs = () => {
      keyInput.accelerate = false;
      keyInput.brakeReverse = false;
      keyInput.steerLeft = false;
      keyInput.steerRight = false;
      touchInputRef.current.accelerate = false;
      touchInputRef.current.brakeReverse = false;
      touchInputRef.current.steerLeft = false;
      touchInputRef.current.steerRight = false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          e.preventDefault();
          keyInput.accelerate = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          e.preventDefault();
          keyInput.brakeReverse = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          e.preventDefault();
          keyInput.steerLeft = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          e.preventDefault();
          keyInput.steerRight = true;
          break;
        case 'KeyC':
          if (!e.repeat) {
            e.preventDefault();
            onToggleCameraRef.current();
          }
          break;
        case 'Space':
          e.preventDefault();
          break;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          keyInput.accelerate = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          keyInput.brakeReverse = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          keyInput.steerLeft = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          keyInput.steerRight = false;
          break;
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) clearAllInputs();
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearAllInputs);
    document.addEventListener('visibilitychange', onVisibilityChange);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const onControlsStart = () => {
      if (cameraModeRef.current === 'spectator') {
        userMovedOrbit = true;
        returningToSpectator = false;
      }
    };
    controls.addEventListener('start', onControlsStart);

    const onResize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      currentAspect = w / Math.max(h, 1);

      camera.aspect = currentAspect;
      if (cameraModeRef.current === 'spectator' && !userMovedOrbit) {
        const resizedPose = spectatorCtrl.snapToPose(
          camera,
          currentAspect,
          kartState.x,
          kartState.z,
          controls.target,
        );
        specElevDeg = resizedPose.elevationDeg;
        specAzimDeg = resizedPose.azimuthDeg;
        specDist = resizedPose.distance;
        horizonFog.near = Math.max(540, resizedPose.distance * 1.12);
        horizonFog.far = Math.max(1250, resizedPose.distance * 2.02);
        container.setAttribute('data-spectator-elevation', specElevDeg.toFixed(1));
        container.setAttribute('data-spectator-azimuth', specAzimDeg.toFixed(1));
        container.setAttribute('data-spectator-distance', specDist.toFixed(1));
      } else {
        camera.updateProjectionMatrix();
      }
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // Continuous 60fps simulation loop with software-WebGL afterDraw pacing
    const clock = new THREE.Clock();
    const mergedInput: KartInputState = {
      accelerate: false,
      brakeReverse: false,
      steerLeft: false,
      steerRight: false,
    };

    let frameId = 0;
    let disposed = false;
    let attrTickCounter = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;

      const rawDt = clock.getDelta();
      const dt = Math.min(rawDt, 0.05);

      const touch = touchInputRef.current;
      mergedInput.accelerate = keyInput.accelerate || touch.accelerate;
      mergedInput.brakeReverse = keyInput.brakeReverse || touch.brakeReverse;
      mergedInput.steerLeft = keyInput.steerLeft || touch.steerLeft;
      mergedInput.steerRight = keyInput.steerRight || touch.steerRight;

      kartState = stepKartPhysics(kartState, mergedInput, dt, frames);

      // Update 3D kart transform & wheel animations
      kartRig.group.position.set(kartState.x, 0.04, kartState.z);
      kartRig.group.rotation.y = kartState.yaw;

      const visualSteer = kartState.steerAngle * 0.42;
      kartRig.frontLeftPivot.rotation.y = visualSteer;
      kartRig.frontRightPivot.rotation.y = visualSteer;
      for (const w of kartRig.wheels) {
        w.rotation.x = kartState.wheelSpin;
      }

      // Camera mode handling
      const mode = cameraModeRef.current;
      if (mode !== prevCameraMode) {
        prevCameraMode = mode;
        if (mode === 'spectator') {
          returningToSpectator = true;
          userMovedOrbit = false;
        } else {
          returningToSpectator = false;
        }
      }

      if (mode === 'follow') {
        controls.enabled = false;
        _kartPos.set(kartState.x, 0.04, kartState.z);
        _forwardVec.set(Math.sin(kartState.yaw), 0, Math.cos(kartState.yaw));

        _desiredCamPos
          .copy(_kartPos)
          .addScaledVector(_forwardVec, -9.8)
          .setY(4.4);
        _desiredCamTarget
          .copy(_kartPos)
          .addScaledVector(_forwardVec, 3.0)
          .setY(0.95);

        const posAlpha = 1 - Math.exp(-9.5 * dt);
        const lookAlpha = 1 - Math.exp(-12.0 * dt);
        camera.position.lerp(_desiredCamPos, posAlpha);
        controls.target.lerp(_desiredCamTarget, lookAlpha);

        const targetFov = 46;
        let projDirty = false;
        if (Math.abs(camera.near - 0.5) > 0.05) {
          camera.near = 0.5;
          projDirty = true;
        }
        if (Math.abs(camera.fov - targetFov) > 0.05) {
          camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-9 * dt));
          projDirty = true;
        }
        if (projDirty) {
          camera.updateProjectionMatrix();
        }
        camera.lookAt(controls.target);

        const fogAlpha = 1 - Math.exp(-4.0 * dt);
        horizonFog.near = THREE.MathUtils.lerp(horizonFog.near, 620, fogAlpha);
        horizonFog.far = THREE.MathUtils.lerp(horizonFog.far, 2100, fogAlpha);
      } else if (!userMovedOrbit) {
        controls.enabled = true;
        const specRes = spectatorCtrl.update(
          camera,
          currentAspect,
          kartState.x,
          kartState.z,
          dt,
          controls.target,
          returningToSpectator,
        );
        specElevDeg = specRes.elevationDeg;
        specAzimDeg = specRes.azimuthDeg;
        specDist = specRes.distance;
        if (returningToSpectator && specRes.converged) {
          returningToSpectator = false;
        }
        const fogAlpha = 1 - Math.exp(-3.6 * dt);
        horizonFog.near = THREE.MathUtils.lerp(
          horizonFog.near,
          Math.max(540, specRes.distance * 1.12),
          fogAlpha,
        );
        horizonFog.far = THREE.MathUtils.lerp(
          horizonFog.far,
          Math.max(1250, specRes.distance * 2.02),
          fogAlpha,
        );
      } else {
        controls.enabled = true;
        controls.update();
        const userDist = camera.position.distanceTo(controls.target);
        specDist = userDist;
        const fogAlpha = 1 - Math.exp(-4.0 * dt);
        horizonFog.near = THREE.MathUtils.lerp(
          horizonFog.near,
          Math.max(520, userDist * 1.12),
          fogAlpha,
        );
        horizonFog.far = THREE.MathUtils.lerp(
          horizonFog.far,
          Math.max(1250, userDist * 2.02),
          fogAlpha,
        );
      }

      // Expose testable attributes at <= 10Hz without triggering React state renders
      attrTickCounter++;
      if (attrTickCounter % 6 === 0 && container) {
        container.setAttribute('data-camera-mode', mode);
        container.setAttribute('data-on-track', String(kartState.onTrack));
        container.setAttribute('data-kart-speed', kartState.speed.toFixed(2));
        container.setAttribute('data-kart-x', kartState.x.toFixed(2));
        container.setAttribute('data-kart-z', kartState.z.toFixed(2));
        container.setAttribute('data-spectator-elevation', specElevDeg.toFixed(1));
        container.setAttribute('data-spectator-azimuth', specAzimDeg.toFixed(1));
        container.setAttribute('data-spectator-distance', specDist.toFixed(1));
      }

      renderer.render(scene, camera);
      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    container.setAttribute('data-state', 'ready');
    container.setAttribute('data-camera-mode', cameraModeRef.current);
    container.setAttribute('data-on-track', String(kartState.onTrack));
    container.setAttribute('data-kart-speed', '0.00');
    container.setAttribute('data-kart-x', kartState.x.toFixed(2));
    container.setAttribute('data-kart-z', kartState.z.toFixed(2));
    container.setAttribute('data-spectator-elevation', specElevDeg.toFixed(1));
    container.setAttribute('data-spectator-azimuth', specAzimDeg.toFixed(1));
    container.setAttribute('data-spectator-distance', specDist.toFixed(1));

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearAllInputs);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('resize', onResize);
      controls.removeEventListener('start', onControlsStart);
      controls.dispose();
      kartRig.dispose();
      stadiumBuild.dispose();
      trackBuild.dispose();
      bannerBuild.dispose();
      horizonGroundGeo.dispose();
      horizonGroundMat.dispose();
      textures.dispose();
      envTarget.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [touchInputRef]);

  return (
    <div
      ref={containerRef}
      data-testid="scene-container"
      className="fixed inset-0 w-screen h-screen overflow-hidden bg-[#cbe8fb]"
      style={{ touchAction: 'none' }}
    />
  );
}
