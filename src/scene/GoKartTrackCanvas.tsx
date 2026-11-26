import type { MutableRefObject } from 'react';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { KartMeshRig, buildVehicleMesh } from '../kart/buildKartMesh';
import {
  DynamicCircleObstacle,
  KartInputState,
  KartState,
  stepKartPhysics,
} from '../kart/kartPhysics';
import {
  TOWN_VEHICLE_SPAWNS,
  VEHICLE_CATALOG,
  VehicleSpec,
} from '../kart/vehicleCatalog';
import { buildCharacterMesh } from '../player/buildCharacterMesh';
import {
  CHARACTER_PHYSICS,
  CharacterState,
  createInitialCharacterState,
  enterVehicle,
  exitVehicle,
  findNearestVehicle,
  stepCharacterPhysics,
} from '../player/characterPhysics';
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
import type {
  CameraMode,
  FollowPerspective,
  PlayerHudInfo,
} from '../components/TouchControls';
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
const _targetPos = new THREE.Vector3();
const _forwardVec = new THREE.Vector3();
const _sideVec = new THREE.Vector3();

interface WorldVehicle {
  instanceId: string;
  spec: VehicleSpec;
  rig: KartMeshRig;
  state: KartState;
}

interface GoKartTrackCanvasProps {
  cameraMode: CameraMode;
  perspective: FollowPerspective;
  spectatorResetTick: number;
  restartRaceTick: number;
  vehicleInteractTick: number;
  touchInputRef: MutableRefObject<KartInputState>;
  freeCamTouchInputRef: MutableRefObject<FreeCameraInputState>;
  onRaceStateChange: (state: RaceState) => void;
  onPlayerInfoChange: (info: PlayerHudInfo) => void;
  onSelectPerspective: (perspective: FollowPerspective) => void;
  onCyclePerspective: () => void;
  onToggleFollow: () => void;
  onToggleFreeCam: () => void;
  onResetSpectator: () => void;
}

export function GoKartTrackCanvas({
  cameraMode,
  perspective,
  spectatorResetTick,
  restartRaceTick,
  vehicleInteractTick,
  touchInputRef,
  freeCamTouchInputRef,
  onRaceStateChange,
  onPlayerInfoChange,
  onSelectPerspective,
  onCyclePerspective,
  onToggleFollow,
  onToggleFreeCam,
  onResetSpectator,
}: GoKartTrackCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cameraModeRef = useRef<CameraMode>(cameraMode);
  const perspectiveRef = useRef<FollowPerspective>(perspective);
  const spectatorResetTickRef = useRef<number>(spectatorResetTick);
  const restartRaceTickRef = useRef<number>(restartRaceTick);
  const vehicleInteractTickRef = useRef<number>(vehicleInteractTick);

  const onRaceStateChangeRef = useRef(onRaceStateChange);
  const onPlayerInfoChangeRef = useRef(onPlayerInfoChange);
  const onSelectPerspectiveRef = useRef(onSelectPerspective);
  const onCyclePerspectiveRef = useRef(onCyclePerspective);
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
    perspectiveRef.current = perspective;
    if (containerRef.current) {
      containerRef.current.setAttribute('data-perspective', perspective);
    }
  }, [perspective]);

  useEffect(() => {
    spectatorResetTickRef.current = spectatorResetTick;
  }, [spectatorResetTick]);

  useEffect(() => {
    restartRaceTickRef.current = restartRaceTick;
  }, [restartRaceTick]);

  useEffect(() => {
    vehicleInteractTickRef.current = vehicleInteractTick;
  }, [vehicleInteractTick]);

  useEffect(() => {
    onRaceStateChangeRef.current = onRaceStateChange;
  }, [onRaceStateChange]);

  useEffect(() => {
    onPlayerInfoChangeRef.current = onPlayerInfoChange;
  }, [onPlayerInfoChange]);

  useEffect(() => {
    onSelectPerspectiveRef.current = onSelectPerspective;
  }, [onSelectPerspective]);

  useEffect(() => {
    onCyclePerspectiveRef.current = onCyclePerspective;
  }, [onCyclePerspective]);

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

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

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

    const disposeAtmosphere = createAtmosphericEffects(scene);

    // Enlarged 2x track environment, stadium, town district & banners
    const curve = createTrackCurve();
    const frames = sampleTrackFrames(curve, 640);
    const bannerPlacements = getBannerPlacements(curve);
    const checkpoints = generateCheckpoints(frames, 6);
    const finishPos = bannerPlacements.finish.position;
    const finishTangent = bannerPlacements.finish.tangent;

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

    // Build all interactive drivable vehicles (oversized Mega Kart + showcase & parking cars)
    const createWorldVehicles = (): WorldVehicle[] =>
      TOWN_VEHICLE_SPAWNS.map((spawn) => {
        const spec = VEHICLE_CATALOG[spawn.specId] ?? VEHICLE_CATALOG.big_kart;
        const rig = buildVehicleMesh(spec, textures.contactShadow);
        const y = getWorldGroundY(spawn.x, spawn.z) + 0.03;
        rig.group.position.set(spawn.x, y, spawn.z);
        rig.group.rotation.y = spawn.yaw;
        scene.add(rig.group);
        return {
          instanceId: spawn.instanceId,
          spec,
          rig,
          state: {
            x: spawn.x,
            z: spawn.z,
            yaw: spawn.yaw,
            speed: 0,
            steerAngle: 0,
            wheelSpin: 0,
            onTrack: true,
          },
        };
      });

    const worldVehicles = createWorldVehicles();

    const resetWorldVehicles = () => {
      for (let i = 0; i < worldVehicles.length; i++) {
        const spawn = TOWN_VEHICLE_SPAWNS[i];
        const v = worldVehicles[i];
        v.state = {
          x: spawn.x,
          z: spawn.z,
          yaw: spawn.yaw,
          speed: 0,
          steerAngle: 0,
          wheelSpin: 0,
          onTrack: true,
        };
        const vy = getWorldGroundY(spawn.x, spawn.z) + 0.03;
        v.rig.group.position.set(spawn.x, vy, spawn.z);
        v.rig.group.rotation.y = spawn.yaw;
        v.rig.driverGroup.visible = false;
        v.rig.highlightRing.visible = false;
      }
    };

    // Articulated walkable player character standing on Main Ave beside Mega Kart & cars
    const charRig = buildCharacterMesh(textures.contactShadow);
    let charState: CharacterState = createInitialCharacterState();
    const initialCharY = getWorldGroundY(charState.x, charState.z);
    charRig.group.position.set(charState.x, initialCharY, charState.z);
    charRig.group.rotation.y = charState.yaw;
    scene.add(charRig.group);

    // Pre-allocated obstacle & proximity lists for GC-free frame updates
    const obstacleScratch: DynamicCircleObstacle[] = [];
    const proximityScratch: Array<{
      instanceId: string;
      x: number;
      z: number;
      yaw: number;
      radius: number;
      ref: WorldVehicle;
    }> = worldVehicles.map((v) => ({
      instanceId: v.instanceId,
      x: v.state.x,
      z: v.state.z,
      yaw: v.state.yaw,
      radius: v.spec.stats.kartRadius,
      ref: v,
    }));

    const findVehicleById = (id: string | null): WorldVehicle | null => {
      if (!id) return null;
      for (let i = 0; i < worldVehicles.length; i++) {
        if (worldVehicles[i].instanceId === id) return worldVehicles[i];
      }
      return null;
    };

    let raceState = createInitialRaceState(3, 6);

    // Camera controllers (Spectator aerial, Free cam, plus Multi-perspective Follow)
    const spectatorCtrl = new SpectatorCameraController();
    const freeCamCtrl = new FreeCameraController();
    const camera = new THREE.PerspectiveCamera(46, currentAspect, 0.4, 4800);

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
      charState.x,
      charState.z,
      controls.target,
    );

    if (cameraModeRef.current === 'follow') {
      _targetPos.set(charState.x, initialCharY, charState.z);
      _forwardVec.set(Math.sin(charState.yaw), 0, Math.cos(charState.yaw));
      camera.position
        .copy(_targetPos)
        .addScaledVector(_forwardVec, -7.4)
        .setY(initialCharY + 3.45);
      controls.target
        .copy(_targetPos)
        .addScaledVector(_forwardVec, 4.5)
        .setY(initialCharY + 1.45);
      camera.fov = 46;
      camera.near = 0.4;
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
    let prevPerspective: FollowPerspective = perspectiveRef.current;
    let snapFollowNextFrame = false;
    let prevResetTick = spectatorResetTickRef.current;
    let prevRestartTick = restartRaceTickRef.current;
    let prevInteractTick = vehicleInteractTickRef.current;

    let lastHudSyncAt = 0;
    let lastHudStatus = raceState.status;
    let lastHudLap = raceState.lap;
    let lastHudCp = raceState.currentCheckpointIndex;
    let lastHudFinished = raceState.isFinished;
    let lastHudCountdownCeil = Math.ceil(raceState.countdownSeconds);

    let lastPlayerHudSyncAt = 0;
    let lastHudPlayerMode = charState.mode;
    let lastHudActiveVehId: string | null = charState.activeVehicleId;
    let lastHudNearbyVehId: string | null = null;
    let nearbyVehRef: WorldVehicle | null = null;

    // Keyboard input states (character/vehicle + free camera)
    const keyInput: KartInputState = {
      accelerate: false,
      brakeReverse: false,
      steerLeft: false,
      steerRight: false,
    };
    const freeKeyInput: FreeCameraInputState = createEmptyFreeCameraInput();
    let interactQueued = false;

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
        case 'KeyE':
          if (!e.repeat) {
            e.preventDefault();
            interactQueued = true;
          }
          break;
        case 'KeyP':
          if (!e.repeat) {
            e.preventDefault();
            onCyclePerspectiveRef.current();
          }
          break;
        case 'Digit1':
          if (!e.repeat) {
            e.preventDefault();
            onSelectPerspectiveRef.current('chase');
          }
          break;
        case 'Digit2':
          if (!e.repeat) {
            e.preventDefault();
            onSelectPerspectiveRef.current('cockpit');
          }
          break;
        case 'Digit3':
          if (!e.repeat) {
            e.preventDefault();
            onSelectPerspectiveRef.current('hood');
          }
          break;
        case 'Digit4':
          if (!e.repeat) {
            e.preventDefault();
            onSelectPerspectiveRef.current('wide');
          }
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

    // Free-camera desktop mouse & mobile multi-touch gestures
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
        const activeVeh = findVehicleById(charState.activeVehicleId);
        const focusX = activeVeh ? activeVeh.state.x : charState.x;
        const focusZ = activeVeh ? activeVeh.state.z : charState.z;
        const resizedPose = spectatorCtrl.snapToPose(
          camera,
          currentAspect,
          focusX,
          focusZ,
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

    function syncAttributes(mode: CameraMode, activePersp: FollowPerspective) {
      if (!container) return;
      const activeVeh = findVehicleById(charState.activeVehicleId);
      const focusX = activeVeh ? activeVeh.state.x : charState.x;
      const focusZ = activeVeh ? activeVeh.state.z : charState.z;
      const focusSpeed = activeVeh ? activeVeh.state.speed : charState.speed;

      container.setAttribute('data-camera-mode', mode);
      container.setAttribute('data-perspective', activePersp);
      container.setAttribute('data-player-mode', charState.mode);
      container.setAttribute('data-vehicle-id', activeVeh ? activeVeh.instanceId : 'none');
      container.setAttribute('data-nearby-vehicle', nearbyVehRef ? nearbyVehRef.instanceId : 'none');
      container.setAttribute('data-on-track', String(activeVeh ? activeVeh.state.onTrack : true));
      container.setAttribute('data-kart-speed', focusSpeed.toFixed(2));
      container.setAttribute('data-kart-x', focusX.toFixed(2));
      container.setAttribute('data-kart-z', focusZ.toFixed(2));
      container.setAttribute('data-player-x', charState.x.toFixed(2));
      container.setAttribute('data-player-z', charState.z.toFixed(2));
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
      const activePersp = perspectiveRef.current;
      const resetTick = spectatorResetTickRef.current;
      const restartTick = restartRaceTickRef.current;
      const interactTick = vehicleInteractTickRef.current;

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
          snapFollowNextFrame = true;
        }
      }

      if (activePersp !== prevPerspective) {
        prevPerspective = activePersp;
        snapFollowNextFrame = true;
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
        resetWorldVehicles();
        charState = createInitialCharacterState();
        const resetY = getWorldGroundY(charState.x, charState.z);
        charRig.group.position.set(charState.x, resetY, charState.z);
        charRig.group.rotation.y = charState.yaw;
        charRig.group.visible = true;
        snapFollowNextFrame = true;
        onRaceStateChangeRef.current(raceState);
      }

      // Check Enter / Exit vehicle interaction (via KeyE or UI button)
      const wantsInteract = interactQueued || interactTick !== prevInteractTick;
      interactQueued = false;
      prevInteractTick = interactTick;

      if (wantsInteract && mode !== 'free' && !raceState.isFinished) {
        if (charState.mode === 'walking') {
          // Update proximity cache first
          for (let i = 0; i < worldVehicles.length; i++) {
            const v = worldVehicles[i];
            proximityScratch[i].x = v.state.x;
            proximityScratch[i].z = v.state.z;
            proximityScratch[i].yaw = v.state.yaw;
          }
          const near = findNearestVehicle(
            charState.x,
            charState.z,
            proximityScratch,
            CHARACTER_PHYSICS.enterRange,
          );
          if (near) {
            const targetVeh = near.vehicle.ref;
            charState = enterVehicle(charState, near.vehicle);
            charRig.group.visible = false;
            targetVeh.rig.driverGroup.visible = true;
            targetVeh.rig.highlightRing.visible = false;
            snapFollowNextFrame = true;
          }
        } else if (charState.mode === 'driving') {
          const activeVeh = findVehicleById(charState.activeVehicleId);
          if (activeVeh) {
            activeVeh.state.speed = 0;
            activeVeh.state.steerAngle = 0;
            obstacleScratch.length = 0;
            for (let i = 0; i < worldVehicles.length; i++) {
              const other = worldVehicles[i];
              if (other.instanceId !== activeVeh.instanceId) {
                obstacleScratch.push({
                  x: other.state.x,
                  z: other.state.z,
                  radius: other.spec.stats.kartRadius,
                });
              }
            }
            charState = exitVehicle(
              charState,
              {
                instanceId: activeVeh.instanceId,
                x: activeVeh.state.x,
                z: activeVeh.state.z,
                yaw: activeVeh.state.yaw,
                radius: activeVeh.spec.stats.kartRadius,
              },
              obstacleScratch,
            );
            activeVeh.rig.driverGroup.visible = false;
            charRig.group.visible = true;
            snapFollowNextFrame = true;
          }
        }
      }

      // Gather player movement / driving input
      const controlActive =
        (raceState.status === 'waiting' || raceState.status === 'racing') &&
        !raceState.isFinished &&
        mode !== 'free';

      if (!controlActive) {
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

      // Step character OR active vehicle physics
      const activeVeh = findVehicleById(charState.activeVehicleId);
      if (charState.mode === 'driving' && activeVeh) {
        obstacleScratch.length = 0;
        for (let i = 0; i < worldVehicles.length; i++) {
          const other = worldVehicles[i];
          if (other.instanceId !== activeVeh.instanceId) {
            obstacleScratch.push({
              x: other.state.x,
              z: other.state.z,
              radius: other.spec.stats.kartRadius,
            });
          }
        }

        activeVeh.state = stepKartPhysics(
          activeVeh.state,
          mergedKartInput,
          dt,
          frames,
          activeVeh.spec.stats,
          obstacleScratch,
        );

        charState.x = activeVeh.state.x;
        charState.z = activeVeh.state.z;
        charState.yaw = activeVeh.state.yaw;
        charState.speed = activeVeh.state.speed;

        // Hide driver's helmet only in cockpit 1st-person view so view over dash/wheel is unobstructed
        activeVeh.rig.driverGroup.visible = true;
        activeVeh.rig.driverHead.visible = !(mode === 'follow' && activePersp === 'cockpit');

        const vehGroundY = getWorldGroundY(activeVeh.state.x, activeVeh.state.z);
        activeVeh.rig.group.position.set(activeVeh.state.x, vehGroundY + 0.03, activeVeh.state.z);
        activeVeh.rig.group.rotation.y = activeVeh.state.yaw;

        const visualSteer = activeVeh.state.steerAngle * 0.42;
        activeVeh.rig.frontLeftPivot.rotation.y = visualSteer;
        activeVeh.rig.frontRightPivot.rotation.y = visualSteer;
        for (const w of activeVeh.rig.wheels) {
          w.rotation.x = activeVeh.state.wheelSpin;
        }

        nearbyVehRef = null;
        for (let i = 0; i < worldVehicles.length; i++) {
          worldVehicles[i].rig.highlightRing.visible = false;
        }
      } else {
        // Walking mode
        obstacleScratch.length = 0;
        for (let i = 0; i < worldVehicles.length; i++) {
          const v = worldVehicles[i];
          obstacleScratch.push({
            x: v.state.x,
            z: v.state.z,
            radius: v.spec.stats.kartRadius,
          });
          proximityScratch[i].x = v.state.x;
          proximityScratch[i].z = v.state.z;
          proximityScratch[i].yaw = v.state.yaw;
        }

        const sprint = freeKeyInput.faster;
        charState = stepCharacterPhysics(
          charState,
          mergedKartInput,
          sprint,
          dt,
          obstacleScratch,
        );

        const charGroundY = getWorldGroundY(charState.x, charState.z);
        charRig.group.position.set(charState.x, charGroundY, charState.z);
        charRig.group.rotation.y = charState.yaw;
        charRig.group.visible = true;
        charRig.setWalkPose(charState.walkCycle, charState.speed);
        charRig.setFirstPersonHidden(mode === 'follow' && activePersp === 'cockpit');

        const near = findNearestVehicle(
          charState.x,
          charState.z,
          proximityScratch,
          CHARACTER_PHYSICS.enterRange,
        );
        nearbyVehRef = near ? near.vehicle.ref : null;

        const pulse = 1 + 0.05 * Math.sin(performance.now() * 0.006);
        for (let i = 0; i < worldVehicles.length; i++) {
          const v = worldVehicles[i];
          const isNear = nearbyVehRef === v;
          v.rig.highlightRing.visible = isNear;
          if (isNear) {
            v.rig.highlightRing.scale.setScalar(pulse);
          }
        }
      }

      // Race state machine (triggers only when driving a vehicle through the Stadium Gate!)
      if (charState.mode === 'driving' && activeVeh) {
        raceState = updateRaceState(
          raceState,
          activeVeh.state.x,
          activeVeh.state.z,
          activeVeh.state.speed,
          activeVeh.state.yaw,
          dt,
          checkpoints,
          finishPos,
          finishTangent,
        );
      } else if (raceState.status === 'racing' || raceState.status === 'countdown') {
        // Keep race timer advancing cleanly if player momentarily steps out mid-race
        raceState = updateRaceState(
          raceState,
          charState.x,
          charState.z,
          0,
          charState.yaw,
          dt,
          checkpoints,
          finishPos,
          finishTangent,
        );
      }

      // Sync React HUD state efficiently
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

      const activeId = activeVeh ? activeVeh.instanceId : null;
      const nearbyId = nearbyVehRef ? nearbyVehRef.instanceId : null;
      const playerHudDiscrete =
        charState.mode !== lastHudPlayerMode ||
        activeId !== lastHudActiveVehId ||
        nearbyId !== lastHudNearbyVehId;

      if (playerHudDiscrete || nowMs - lastPlayerHudSyncAt >= 120) {
        lastHudPlayerMode = charState.mode;
        lastHudActiveVehId = activeId;
        lastHudNearbyVehId = nearbyId;
        lastPlayerHudSyncAt = nowMs;
        onPlayerInfoChangeRef.current({
          mode: charState.mode,
          activeVehicleId: activeId,
          activeVehicleName: activeVeh ? activeVeh.spec.name : null,
          activeVehicleTagline: activeVeh ? activeVeh.spec.tagline : null,
          nearbyVehicleId: nearbyId,
          nearbyVehicleName: nearbyVehRef ? nearbyVehRef.spec.name : null,
          nearbyVehicleTagline: nearbyVehRef ? nearbyVehRef.spec.tagline : null,
          speedUnits: activeVeh ? activeVeh.state.speed : charState.speed,
        });
      }

      // Update camera position & orientation
      const focusX = activeVeh ? activeVeh.state.x : charState.x;
      const focusZ = activeVeh ? activeVeh.state.z : charState.z;
      const focusYaw = activeVeh ? activeVeh.state.yaw : charState.yaw;
      const focusY = getWorldGroundY(focusX, focusZ);

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
        _targetPos.set(focusX, focusY, focusZ);
        _forwardVec.set(Math.sin(focusYaw), 0, Math.cos(focusYaw));
        _sideVec.set(Math.cos(focusYaw), 0, -Math.sin(focusYaw));

        let targetFov = 46;
        let targetNear = 0.45;
        let posRate = 10.0;
        let lookRate = 13.0;

        if (charState.mode === 'driving' && activeVeh) {
          const sp = activeVeh.spec;
          const speedRatio = Math.min(1, Math.abs(activeVeh.state.speed) / sp.stats.maxForwardSpeed);

          if (activePersp === 'cockpit') {
            const seatX = sp.bodyStyle === 'kart' || sp.bodyStyle === 'formula' ? 0 : 0.32;
            _desiredCamPos
              .copy(_targetPos)
              .addScaledVector(_sideVec, seatX)
              .addScaledVector(_forwardVec, sp.cockpitEyeZ)
              .setY(focusY + sp.cockpitEyeY);
            _desiredCamTarget
              .copy(_targetPos)
              .addScaledVector(_sideVec, seatX)
              .addScaledVector(_forwardVec, 26.0)
              .setY(focusY + sp.cockpitEyeY - 0.14);
            targetFov = 62 + speedRatio * 4.5;
            targetNear = 0.16;
            posRate = 40;
            lookRate = 40;
          } else if (activePersp === 'hood') {
            _desiredCamPos
              .copy(_targetPos)
              .addScaledVector(_forwardVec, sp.hoodCamZ)
              .setY(focusY + sp.hoodCamY);
            _desiredCamTarget
              .copy(_targetPos)
              .addScaledVector(_forwardVec, 28.0)
              .setY(focusY + sp.hoodCamY - 0.15);
            targetFov = 60 + speedRatio * 5.0;
            targetNear = 0.2;
            posRate = 36;
            lookRate = 36;
          } else if (activePersp === 'wide') {
            _desiredCamPos
              .copy(_targetPos)
              .addScaledVector(_forwardVec, -20.5)
              .setY(focusY + 9.5);
            _desiredCamTarget
              .copy(_targetPos)
              .addScaledVector(_forwardVec, 7.5)
              .setY(focusY + 1.4);
            targetFov = 44 + speedRatio * 3.0;
            targetNear = 0.5;
            posRate = 8.5;
            lookRate = 11.0;
          } else {
            // 'chase'
            _desiredCamPos
              .copy(_targetPos)
              .addScaledVector(_forwardVec, -sp.chaseDist)
              .setY(focusY + sp.chaseHeight);
            _desiredCamTarget
              .copy(_targetPos)
              .addScaledVector(_forwardVec, 6.0)
              .setY(focusY + 1.35);
            targetFov = 48 + speedRatio * 4.5;
            targetNear = 0.45;
          }
        } else {
          // Walking character perspectives
          if (activePersp === 'cockpit') {
            _desiredCamPos
              .copy(_targetPos)
              .addScaledVector(_forwardVec, 0.18)
              .setY(focusY + 1.84);
            _desiredCamTarget
              .copy(_targetPos)
              .addScaledVector(_forwardVec, 20.0)
              .setY(focusY + 1.62);
            targetFov = 64;
            targetNear = 0.15;
            posRate = 40;
            lookRate = 40;
          } else if (activePersp === 'hood') {
            // Over-the-shoulder action cam while walking
            _desiredCamPos
              .copy(_targetPos)
              .addScaledVector(_forwardVec, -3.1)
              .addScaledVector(_sideVec, -1.1)
              .setY(focusY + 2.05);
            _desiredCamTarget
              .copy(_targetPos)
              .addScaledVector(_forwardVec, 11.0)
              .setY(focusY + 1.55);
            targetFov = 52;
            targetNear = 0.25;
            posRate = 18;
            lookRate = 20;
          } else if (activePersp === 'wide') {
            _desiredCamPos
              .copy(_targetPos)
              .addScaledVector(_forwardVec, -12.5)
              .setY(focusY + 6.2);
            _desiredCamTarget
              .copy(_targetPos)
              .addScaledVector(_forwardVec, 5.0)
              .setY(focusY + 1.35);
            targetFov = 44;
            targetNear = 0.5;
            posRate = 9;
            lookRate = 11;
          } else {
            // 'chase'
            _desiredCamPos
              .copy(_targetPos)
              .addScaledVector(_forwardVec, -7.4)
              .setY(focusY + 3.45);
            _desiredCamTarget
              .copy(_targetPos)
              .addScaledVector(_forwardVec, 4.5)
              .setY(focusY + 1.45);
            targetFov = 46;
            targetNear = 0.4;
          }
        }

        if (snapFollowNextFrame) {
          camera.position.copy(_desiredCamPos);
          controls.target.copy(_desiredCamTarget);
          camera.fov = targetFov;
          camera.near = targetNear;
          camera.updateProjectionMatrix();
          snapFollowNextFrame = false;
        } else {
          const posAlpha = 1 - Math.exp(-posRate * dt);
          const lookAlpha = 1 - Math.exp(-lookRate * dt);
          camera.position.lerp(_desiredCamPos, posAlpha);
          controls.target.lerp(_desiredCamTarget, lookAlpha);

          let projDirty = false;
          if (Math.abs(camera.near - targetNear) > 0.03) {
            camera.near = targetNear;
            projDirty = true;
          }
          if (Math.abs(camera.fov - targetFov) > 0.05) {
            camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-10 * dt));
            projDirty = true;
          }
          if (projDirty) {
            camera.updateProjectionMatrix();
          }
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
          focusX,
          focusZ,
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

      attrTickCounter++;
      const attrCadence = isSoftwareGl ? 2 : 6;
      if (attrTickCounter % attrCadence === 0 && container) {
        syncAttributes(mode, activePersp);
      }

      renderer.render(scene, camera);
      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    container.setAttribute('data-state', 'ready');
    syncAttributes(cameraModeRef.current, perspectiveRef.current);

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
      charRig.dispose();
      for (const v of worldVehicles) {
        v.rig.dispose();
      }
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
