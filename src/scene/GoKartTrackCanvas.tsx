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
import {
  FreeCameraController,
  FreeCameraInputState,
  createEmptyFreeCameraInput,
} from '../camera/freeCamera';
import { SpectatorCameraController } from '../camera/spectatorCamera';
import {
  createTrackCurve,
  getBannerPlacements,
  sampleTrackFrames,
} from '../track/trackLayout';
import {
  RaceState,
  createInitialRaceState,
  generateCheckpoints,
  updateRaceState,
} from '../game/raceRules';
import type { CameraMode } from '../components/TouchControls';
import { buildTrackBanners } from './buildBanners';
import { buildStadiumArchitecture } from './buildStadium';
import { buildMarketDistrict } from './buildMarketDistrict';
import { getWorldGroundY } from './townLayout';
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

function createAtmosphericEffects(scene: THREE.Scene): () => void {
  // Soft glowing sun flare sprite near directional light position
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255, 255, 240, 0.95)');
  grad.addColorStop(0.3, 'rgba(255, 220, 140, 0.6)');
  grad.addColorStop(0.7, 'rgba(255, 180, 80, 0.15)');
  grad.addColorStop(1, 'rgba(255, 150, 50, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  const flareTex = new THREE.CanvasTexture(canvas);
  const flareMat = new THREE.SpriteMaterial({
    map: flareTex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sunSprite = new THREE.Sprite(flareMat);
  sunSprite.position.set(-165, 280, 195);
  sunSprite.scale.set(130, 130, 1);
  scene.add(sunSprite);

  // Distant hazy cloud particles high above scene
  const cloudCount = 20;
  const cloudGeo = new THREE.BufferGeometry();
  const cloudPositions = new Float32Array(cloudCount * 3);
  for (let i = 0; i < cloudCount; i++) {
    cloudPositions[i * 3] = (Math.random() - 0.5) * 1500;
    cloudPositions[i * 3 + 1] = 290 + Math.random() * 80;
    cloudPositions[i * 3 + 2] = (Math.random() - 0.5) * 1500;
  }
  cloudGeo.setAttribute('position', new THREE.BufferAttribute(cloudPositions, 3));

  const cloudCanvas = document.createElement('canvas');
  cloudCanvas.width = 64;
  cloudCanvas.height = 64;
  const cCtx = cloudCanvas.getContext('2d')!;
  const cGrad = cCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
  cGrad.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
  cGrad.addColorStop(0.5, 'rgba(240, 246, 255, 0.28)');
  cGrad.addColorStop(1, 'rgba(230, 240, 255, 0)');
  cCtx.fillStyle = cGrad;
  cCtx.fillRect(0, 0, 64, 64);

  const cloudTex = new THREE.CanvasTexture(cloudCanvas);
  const cloudMat = new THREE.PointsMaterial({
    size: 240,
    map: cloudTex,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const cloudPoints = new THREE.Points(cloudGeo, cloudMat);
  scene.add(cloudPoints);

  return () => {
    flareTex.dispose();
    flareMat.dispose();
    scene.remove(sunSprite);
    cloudGeo.dispose();
    cloudTex.dispose();
    cloudMat.dispose();
    scene.remove(cloudPoints);
  };
}

// Pre-allocated scratch math objects to keep the render loop GC-free
const _desiredCamPos = new THREE.Vector3();
const _desiredCamTarget = new THREE.Vector3();
const _kartPos = new THREE.Vector3();
const _forwardVec = new THREE.Vector3();

interface GoKartTrackCanvasProps {
  cameraMode: CameraMode;
  spectatorResetTick: number;
  restartRaceTick: number;
  touchInputRef: MutableRefObject<KartInputState>;
  freeCamTouchInputRef: MutableRefObject<FreeCameraInputState>;
  onRaceStateChange: (state: RaceState) => void;
  onToggleFollow: () => void;
  onToggleFreeCam: () => void;
  onResetSpectator: () => void;
}

export function GoKartTrackCanvas({
  cameraMode,
  spectatorResetTick,
  restartRaceTick,
  touchInputRef,
  freeCamTouchInputRef,
  onRaceStateChange,
  onToggleFollow,
  onToggleFreeCam,
  onResetSpectator,
}: GoKartTrackCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cameraModeRef = useRef<CameraMode>(cameraMode);
  const spectatorResetTickRef = useRef<number>(spectatorResetTick);
  const restartRaceTickRef = useRef<number>(restartRaceTick);
  const onRaceStateChangeRef = useRef(onRaceStateChange);
  const onToggleFollowRef = useRef(onToggleFollow);
  const onToggleFreeCamRef = useRef(onToggleFreeCam);
  const onResetSpectatorRef = useRef(onResetSpectator);

  useEffect(() => {
    cameraModeRef.current = cameraMode;
    if (containerRef.current) {
      containerRef.current.setAttribute('data-camera-mode', cameraMode);
    }
  }, [cameraMode]);

  useEffect(() => {
    spectatorResetTickRef.current = spectatorResetTick;
  }, [spectatorResetTick]);

  useEffect(() => {
    restartRaceTickRef.current = restartRaceTick;
  }, [restartRaceTick]);

  useEffect(() => {
    onRaceStateChangeRef.current = onRaceStateChange;
  }, [onRaceStateChange]);

  useEffect(() => {
    onToggleFollowRef.current = onToggleFollow;
  }, [onToggleFollow]);

  useEffect(() => {
    onToggleFreeCamRef.current = onToggleFreeCam;
  }, [onToggleFreeCam]);

  useEffect(() => {
    onResetSpectatorRef.current = onResetSpectator;
  }, [onResetSpectator]);

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
    renderer.shadowMap.enabled = !isSoftwareGl;
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

    // Bright, soft daylight lighting rig covering both stadium and town district
    const hemiLight = new THREE.HemisphereLight(0xd9efff, 0x3b8f2e, 0.65);
    hemiLight.position.set(0, 180, 0);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff5e0, 1.45);
    sunLight.position.set(-165, 340, 295);
    sunLight.target.position.set(0, 0, 110);
    scene.add(sunLight.target);
    sunLight.castShadow = !isSoftwareGl;
    sunLight.shadow.mapSize.set(1024, 1024);
    sunLight.shadow.camera.near = 25;
    sunLight.shadow.camera.far = 1100;
    sunLight.shadow.camera.left = -280;
    sunLight.shadow.camera.right = 280;
    sunLight.shadow.camera.top = 340;
    sunLight.shadow.camera.bottom = -340;
    sunLight.shadow.bias = -0.0008;
    sunLight.shadow.normalBias = 0.18;
    sunLight.shadow.radius = 2.5;
    scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight(0xdceeff, 0.25);
    fillLight.position.set(160, 120, -150);
    scene.add(fillLight);

    // Subtle atmospheric effect (distant hazy clouds & sun flare)
    const disposeAtmosphere = createAtmosphericEffects(scene);

    // Enlarged 2x track environment, banners, and empty open-air stadium outside grass field
    const curve = createTrackCurve();
    const frames = sampleTrackFrames(curve, 640);
    const bannerPlacements = getBannerPlacements(curve);
    const checkpoints = generateCheckpoints(frames, 6);
    const finishPos = bannerPlacements.finish.position;
    const finishTangent = bannerPlacements.finish.tangent;

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

    const marketBuild = buildMarketDistrict(textures);
    scene.add(marketBuild.group);

    const bannerBuild = buildTrackBanners(bannerPlacements, textures);
    scene.add(bannerBuild.group);

    // Lightweight 3D player go-kart placed on the Town Main Avenue road facing North
    const kartRig = buildKartMesh(textures.contactShadow);
    let kartState = createInitialKartState(curve);
    const initialKartY = getWorldGroundY(kartState.x, kartState.z) + 0.04;
    kartRig.group.position.set(kartState.x, initialKartY, kartState.z);
    kartRig.group.rotation.y = kartState.yaw;
    scene.add(kartRig.group);

    // Race state management (starts in 'waiting' town free-roam until entering stadium)
    let raceState = createInitialRaceState(3, 6);

    // Cinematic elevated three-quarter city skyline spectator camera & upright free-camera
    const spectatorCtrl = new SpectatorCameraController();
    const freeCamCtrl = new FreeCameraController();
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

    if (cameraModeRef.current === 'follow') {
      _kartPos.set(kartState.x, initialKartY, kartState.z);
      _forwardVec.set(Math.sin(kartState.yaw), 0, Math.cos(kartState.yaw));
      camera.position
        .copy(_kartPos)
        .addScaledVector(_forwardVec, -11.5)
        .setY(initialKartY + 4.9);
      controls.target
        .copy(_kartPos)
        .addScaledVector(_forwardVec, 5.0)
        .setY(initialKartY + 1.2);
      camera.fov = 46;
      camera.near = 0.5;
      camera.updateProjectionMatrix();
      camera.lookAt(controls.target);
    }

    freeCamCtrl.syncFromCamera(camera);

    let specElevDeg = initialPose.elevationDeg;
    let specAzimDeg = initialPose.azimuthDeg;
    let specDist = initialPose.distance;
    horizonFog.near = cameraModeRef.current === 'follow' ? 620 : Math.max(540, initialPose.distance * 1.12);
    horizonFog.far = cameraModeRef.current === 'follow' ? 2100 : Math.max(1250, initialPose.distance * 2.02);

    let userMovedOrbit = false;
    let returningToSpectator = false;
    let prevCameraMode: CameraMode = cameraModeRef.current;
    let prevResetTick = spectatorResetTickRef.current;
    let prevRestartTick = restartRaceTickRef.current;
    let lastHudSyncAt = 0;
    let lastHudStatus = raceState.status;
    let lastHudLap = raceState.lap;
    let lastHudCp = raceState.currentCheckpointIndex;
    let lastHudFinished = raceState.isFinished;
    let lastHudCountdownCeil = Math.ceil(raceState.countdownSeconds);

    // Keyboard input states (kart + free camera)
    const keyInput: KartInputState = {
      accelerate: false,
      brakeReverse: false,
      steerLeft: false,
      steerRight: false,
    };
    const freeKeyInput: FreeCameraInputState = createEmptyFreeCameraInput();

    const clearAllInputs = () => {
      keyInput.accelerate = false;
      keyInput.brakeReverse = false;
      keyInput.steerLeft = false;
      keyInput.steerRight = false;
      touchInputRef.current.accelerate = false;
      touchInputRef.current.brakeReverse = false;
      touchInputRef.current.steerLeft = false;
      touchInputRef.current.steerRight = false;

      freeKeyInput.moveForward = false;
      freeKeyInput.moveBackward = false;
      freeKeyInput.moveLeft = false;
      freeKeyInput.moveRight = false;
      freeKeyInput.rise = false;
      freeKeyInput.descend = false;
      freeKeyInput.faster = false;
      freeKeyInput.slower = false;

      freeCamTouchInputRef.current.moveForward = false;
      freeCamTouchInputRef.current.moveBackward = false;
      freeCamTouchInputRef.current.moveLeft = false;
      freeCamTouchInputRef.current.moveRight = false;
      freeCamTouchInputRef.current.rise = false;
      freeCamTouchInputRef.current.descend = false;
      freeCamTouchInputRef.current.faster = false;
      freeCamTouchInputRef.current.slower = false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      freeKeyInput.faster = e.shiftKey;
      freeKeyInput.slower = e.ctrlKey;

      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          e.preventDefault();
          keyInput.accelerate = true;
          freeKeyInput.moveForward = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          e.preventDefault();
          keyInput.brakeReverse = true;
          freeKeyInput.moveBackward = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          e.preventDefault();
          keyInput.steerLeft = true;
          freeKeyInput.moveLeft = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          e.preventDefault();
          keyInput.steerRight = true;
          freeKeyInput.moveRight = true;
          break;
        case 'KeyR':
          if (cameraModeRef.current === 'free') {
            e.preventDefault();
          }
          freeKeyInput.rise = true;
          break;
        case 'KeyF':
          if (cameraModeRef.current === 'free') {
            e.preventDefault();
          }
          freeKeyInput.descend = true;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          freeKeyInput.faster = true;
          break;
        case 'ControlLeft':
        case 'ControlRight':
          freeKeyInput.slower = true;
          break;
        case 'KeyC':
          if (!e.repeat) {
            e.preventDefault();
            onToggleFollowRef.current();
          }
          break;
        case 'KeyV':
          if (!e.repeat) {
            e.preventDefault();
            onToggleFreeCamRef.current();
          }
          break;
        case 'Home':
          if (!e.repeat) {
            e.preventDefault();
            onResetSpectatorRef.current();
          }
          break;
        case 'Space':
          e.preventDefault();
          break;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      freeKeyInput.faster = e.shiftKey;
      freeKeyInput.slower = e.ctrlKey;

      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          keyInput.accelerate = false;
          freeKeyInput.moveForward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          keyInput.brakeReverse = false;
          freeKeyInput.moveBackward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          keyInput.steerLeft = false;
          freeKeyInput.moveLeft = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          keyInput.steerRight = false;
          freeKeyInput.moveRight = false;
          break;
        case 'KeyR':
          freeKeyInput.rise = false;
          break;
        case 'KeyF':
          freeKeyInput.descend = false;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          freeKeyInput.faster = false;
          break;
        case 'ControlLeft':
        case 'ControlRight':
          freeKeyInput.slower = false;
          break;
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) clearAllInputs();
    };

    // Free-camera desktop mouse & mobile multi-touch gestures (disabled when not in 'free' mode)
    const activeTouches = new Map<number, { x: number; y: number }>();
    let activeMouseButton: number | null = null;
    let lastMouseX = 0;
    let lastMouseY = 0;

    const getFirstTwoTouches = (): [{ x: number; y: number }, { x: number; y: number }] | null => {
      const iter = activeTouches.values();
      const first = iter.next();
      const second = iter.next();
      if (first.done || second.done) return null;
      return [first.value, second.value];
    };

    const onCanvasContextMenu = (e: MouseEvent) => {
      if (cameraModeRef.current === 'free') {
        e.preventDefault();
      }
    };

    const onCanvasMouseDown = (e: MouseEvent) => {
      if (cameraModeRef.current === 'free' && e.button === 1) {
        e.preventDefault();
      }
    };

    const onCanvasPointerDown = (e: PointerEvent) => {
      if (cameraModeRef.current !== 'free') return;

      if (e.pointerType === 'touch') {
        activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        try {
          renderer.domElement.setPointerCapture(e.pointerId);
        } catch {
          // Ignore synthetic pointer events
        }
      } else if (e.button === 2 || e.button === 1) {
        e.preventDefault();
        activeMouseButton = e.button;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        try {
          renderer.domElement.setPointerCapture(e.pointerId);
        } catch {
          // Ignore synthetic pointer events
        }
      }
    };

    const onCanvasPointerMove = (e: PointerEvent) => {
      if (cameraModeRef.current !== 'free') return;

      if (e.pointerType === 'touch') {
        const prev = activeTouches.get(e.pointerId);
        if (!prev) return;

        if (activeTouches.size === 1) {
          const dx = e.clientX - prev.x;
          const dy = e.clientY - prev.y;
          prev.x = e.clientX;
          prev.y = e.clientY;
          freeCamCtrl.addLookDelta(dx, dy, true);
        } else {
          const pairBefore = getFirstTwoTouches();
          if (!pairBefore) {
            prev.x = e.clientX;
            prev.y = e.clientY;
            return;
          }
          const oldMidX = (pairBefore[0].x + pairBefore[1].x) * 0.5;
          const oldMidY = (pairBefore[0].y + pairBefore[1].y) * 0.5;
          const oldDist = Math.hypot(
            pairBefore[1].x - pairBefore[0].x,
            pairBefore[1].y - pairBefore[0].y,
          );

          prev.x = e.clientX;
          prev.y = e.clientY;

          const pairAfter = getFirstTwoTouches()!;
          const newMidX = (pairAfter[0].x + pairAfter[1].x) * 0.5;
          const newMidY = (pairAfter[0].y + pairAfter[1].y) * 0.5;
          const newDist = Math.hypot(
            pairAfter[1].x - pairAfter[0].x,
            pairAfter[1].y - pairAfter[0].y,
          );

          freeCamCtrl.addPanDelta(newMidX - oldMidX, newMidY - oldMidY);
          freeCamCtrl.addDolly((newDist - oldDist) * freeCamCtrl.config.pinchSensitivity);
        }
      } else if (activeMouseButton !== null) {
        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;

        if (activeMouseButton === 2 || (e.buttons & 2) !== 0) {
          freeCamCtrl.addLookDelta(dx, dy, false);
        } else if (activeMouseButton === 1 || (e.buttons & 4) !== 0) {
          freeCamCtrl.addPanDelta(dx, dy);
        }
      }
    };

    const onCanvasPointerUpOrCancel = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        activeTouches.delete(e.pointerId);
      } else if (e.button === activeMouseButton || e.type === 'pointercancel') {
        activeMouseButton = null;
      }
    };

    const onCanvasWheel = (e: WheelEvent) => {
      if (cameraModeRef.current !== 'free') return;
      e.preventDefault();
      const unitScale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 120 : 1;
      const dollyDelta = -e.deltaY * unitScale * freeCamCtrl.config.dollySensitivity;
      freeCamCtrl.addDolly(dollyDelta);
    };

    renderer.domElement.addEventListener('contextmenu', onCanvasContextMenu);
    renderer.domElement.addEventListener('mousedown', onCanvasMouseDown);
    renderer.domElement.addEventListener('pointerdown', onCanvasPointerDown);
    renderer.domElement.addEventListener('pointermove', onCanvasPointerMove);
    renderer.domElement.addEventListener('pointerup', onCanvasPointerUpOrCancel);
    renderer.domElement.addEventListener('pointercancel', onCanvasPointerUpOrCancel);
    renderer.domElement.addEventListener('lostpointercapture', onCanvasPointerUpOrCancel);
    renderer.domElement.addEventListener('wheel', onCanvasWheel, { passive: false });

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
    const mergedKartInput: KartInputState = {
      accelerate: false,
      brakeReverse: false,
      steerLeft: false,
      steerRight: false,
    };
    const mergedFreeInput: FreeCameraInputState = createEmptyFreeCameraInput();

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

    function syncAttributes(mode: CameraMode) {
      if (!container) return;
      container.setAttribute('data-camera-mode', mode);
      container.setAttribute('data-on-track', String(kartState.onTrack));
      container.setAttribute('data-kart-speed', kartState.speed.toFixed(2));
      container.setAttribute('data-kart-x', kartState.x.toFixed(2));
      container.setAttribute('data-kart-z', kartState.z.toFixed(2));
      container.setAttribute('data-cam-x', camera.position.x.toFixed(2));
      container.setAttribute('data-cam-y', camera.position.y.toFixed(2));
      container.setAttribute('data-cam-z', camera.position.z.toFixed(2));
      container.setAttribute('data-spectator-elevation', specElevDeg.toFixed(1));
      container.setAttribute('data-spectator-azimuth', specAzimDeg.toFixed(1));
      container.setAttribute('data-spectator-distance', specDist.toFixed(1));
      container.setAttribute('data-race-status', raceState.status);
      container.setAttribute('data-race-lap', String(raceState.lap));
      container.setAttribute('data-race-cp', String(raceState.currentCheckpointIndex));
    }

    function tick() {
      if (disposed) return;

      const rawDt = clock.getDelta();
      const dt = Math.min(rawDt, 0.05);

      const mode = cameraModeRef.current;
      const resetTick = spectatorResetTickRef.current;
      const restartTick = restartRaceTickRef.current;

      // Mode & explicit Home reset / Restart transitions
      if (mode !== prevCameraMode) {
        prevCameraMode = mode;
        activeMouseButton = null;
        activeTouches.clear();
        clearAllInputs();

        if (mode === 'free') {
          controls.enabled = false;
          returningToSpectator = false;
          userMovedOrbit = false;
          freeCamCtrl.syncFromCamera(camera);
        } else if (mode === 'spectator') {
          returningToSpectator = true;
          userMovedOrbit = false;
        } else {
          returningToSpectator = false;
        }
      }

      if (resetTick !== prevResetTick) {
        prevResetTick = resetTick;
        if (mode === 'spectator') {
          userMovedOrbit = false;
          returningToSpectator = true;
          spectatorCtrl.resetDrift();
        }
      }

      if (restartTick !== prevRestartTick) {
        prevRestartTick = restartTick;
        raceState = createInitialRaceState(3, 6);
        kartState = createInitialKartState(curve);
        const resetY = getWorldGroundY(kartState.x, kartState.z) + 0.04;
        kartRig.group.position.set(kartState.x, resetY, kartState.z);
        kartRig.group.rotation.y = kartState.yaw;
        onRaceStateChangeRef.current(raceState);
      }

      // Update race state machine
      raceState = updateRaceState(
        raceState,
        kartState.x,
        kartState.z,
        kartState.speed,
        kartState.yaw,
        dt,
        checkpoints,
        finishPos,
        finishTangent,
      );

      // Throttle React HUD state updates (immediate on phase/lap/checkpoint changes, <=10Hz for timers)
      const nowMs = performance.now();
      const cdCeil = Math.ceil(raceState.countdownSeconds);
      const discreteChanged =
        raceState.status !== lastHudStatus ||
        raceState.lap !== lastHudLap ||
        raceState.currentCheckpointIndex !== lastHudCp ||
        raceState.isFinished !== lastHudFinished ||
        (raceState.status === 'countdown' && cdCeil !== lastHudCountdownCeil);
      if (discreteChanged || (raceState.status === 'racing' && nowMs - lastHudSyncAt >= 100)) {
        lastHudStatus = raceState.status;
        lastHudLap = raceState.lap;
        lastHudCp = raceState.currentCheckpointIndex;
        lastHudFinished = raceState.isFinished;
        lastHudCountdownCeil = cdCeil;
        lastHudSyncAt = nowMs;
        onRaceStateChangeRef.current(raceState);
      }

      // Kart physics: active during Town Free Roam ('waiting') AND active race ('racing')
      const drivingActive =
        (raceState.status === 'waiting' || raceState.status === 'racing') &&
        !raceState.isFinished &&
        mode !== 'free';
      if (!drivingActive) {
        mergedKartInput.accelerate = false;
        mergedKartInput.brakeReverse = false;
        mergedKartInput.steerLeft = false;
        mergedKartInput.steerRight = false;
      } else {
        const touch = touchInputRef.current;
        mergedKartInput.accelerate = keyInput.accelerate || touch.accelerate;
        mergedKartInput.brakeReverse = keyInput.brakeReverse || touch.brakeReverse;
        mergedKartInput.steerLeft = keyInput.steerLeft || touch.steerLeft;
        mergedKartInput.steerRight = keyInput.steerRight || touch.steerRight;
      }

      kartState = stepKartPhysics(kartState, mergedKartInput, dt, frames);

      // Update 3D kart transform & wheel animations (world itself never moves/rotates/scales)
      const kartGroundY = getWorldGroundY(kartState.x, kartState.z);
      const kartY = kartGroundY + 0.04;
      kartRig.group.position.set(kartState.x, kartY, kartState.z);
      kartRig.group.rotation.y = kartState.yaw;

      const visualSteer = kartState.steerAngle * 0.42;
      kartRig.frontLeftPivot.rotation.y = visualSteer;
      kartRig.frontRightPivot.rotation.y = visualSteer;
      for (const w of kartRig.wheels) {
        w.rotation.x = kartState.wheelSpin;
      }

      // Update camera position & orientation only
      if (mode === 'free') {
        controls.enabled = false;
        const touchFree = freeCamTouchInputRef.current;
        mergedFreeInput.moveForward = freeKeyInput.moveForward || touchFree.moveForward;
        mergedFreeInput.moveBackward = freeKeyInput.moveBackward || touchFree.moveBackward;
        mergedFreeInput.moveLeft = freeKeyInput.moveLeft || touchFree.moveLeft;
        mergedFreeInput.moveRight = freeKeyInput.moveRight || touchFree.moveRight;
        mergedFreeInput.rise = freeKeyInput.rise || touchFree.rise;
        mergedFreeInput.descend = freeKeyInput.descend || touchFree.descend;
        mergedFreeInput.faster = freeKeyInput.faster || touchFree.faster;
        mergedFreeInput.slower = freeKeyInput.slower || touchFree.slower;

        freeCamCtrl.update(camera, mergedFreeInput, dt);

        const fogAlpha = 1 - Math.exp(-3.6 * dt);
        horizonFog.near = THREE.MathUtils.lerp(
          horizonFog.near,
          Math.max(580, camera.position.y * 1.4),
          fogAlpha,
        );
        horizonFog.far = THREE.MathUtils.lerp(
          horizonFog.far,
          Math.max(1550, camera.position.y * 2.8),
          fogAlpha,
        );
      } else if (mode === 'follow') {
        controls.enabled = false;
        _kartPos.set(kartState.x, kartY, kartState.z);
        _forwardVec.set(Math.sin(kartState.yaw), 0, Math.cos(kartState.yaw));

        _desiredCamPos
          .copy(_kartPos)
          .addScaledVector(_forwardVec, -11.5)
          .setY(kartY + 4.9);
        _desiredCamTarget
          .copy(_kartPos)
          .addScaledVector(_forwardVec, 5.0)
          .setY(kartY + 1.2);

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
        syncAttributes(mode);
      }

      renderer.render(scene, camera);
      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    container.setAttribute('data-state', 'ready');
    syncAttributes(cameraModeRef.current);

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      renderer.domElement.removeEventListener('contextmenu', onCanvasContextMenu);
      renderer.domElement.removeEventListener('mousedown', onCanvasMouseDown);
      renderer.domElement.removeEventListener('pointerdown', onCanvasPointerDown);
      renderer.domElement.removeEventListener('pointermove', onCanvasPointerMove);
      renderer.domElement.removeEventListener('pointerup', onCanvasPointerUpOrCancel);
      renderer.domElement.removeEventListener('pointercancel', onCanvasPointerUpOrCancel);
      renderer.domElement.removeEventListener('lostpointercapture', onCanvasPointerUpOrCancel);
      renderer.domElement.removeEventListener('wheel', onCanvasWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearAllInputs);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('resize', onResize);
      controls.removeEventListener('start', onControlsStart);
      controls.dispose();
      disposeAtmosphere();
      kartRig.dispose();
      stadiumBuild.dispose();
      marketBuild.dispose();
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
  }, [touchInputRef, freeCamTouchInputRef]);

  return (
    <div
      ref={containerRef}
      data-testid="scene-container"
      className="fixed inset-0 w-screen h-screen overflow-hidden bg-[#cbe8fb]"
      style={{ touchAction: 'none' }}
    />
  );
}
