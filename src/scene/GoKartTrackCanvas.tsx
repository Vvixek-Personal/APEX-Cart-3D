import type { MutableRefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  ProceduralSoundEngine,
  computeSimulatedGearAndRpm,
} from '../audio/soundEngine';
import { FollowCameraController } from '../camera/followCamera';
import {
  FreeCameraController,
  FreeCameraInputState,
  createEmptyFreeCameraInput,
} from '../camera/freeCamera';
import { SpectatorCameraController } from '../camera/spectatorCamera';
import type {
  CameraMode,
  FollowPerspective,
  PlayerHudInfo,
  TouchActionInputState,
} from '../components/TouchControls';
import {
  RaceState,
  createInitialRaceState,
  generateCheckpoints,
  updateRaceState,
} from '../game/raceRules';
import { KeyboardInputTracker } from '../input/playerInput';
import { KartMeshRig, buildVehicleMesh } from '../kart/buildKartMesh';
import {
  DynamicCircleObstacle,
  KartInputState,
  KartState,
  createInitialKartState,
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
  createTrackCurve,
  getBannerPlacements,
  sampleTrackFrames,
} from '../track/trackLayout';
import { buildTrackBanners } from './buildBanners';
import { buildCheckpointMarkers } from './buildCheckpoints';
import { buildMarketDistrict } from './buildMarketDistrict';
import { buildStadiumArchitecture } from './buildStadium';
import { buildTrackEnvironment } from './buildTrackMesh';
import { createProceduralTextures } from './textures';
import { getWorldGroundSlope, getWorldGroundY } from './townLayout';
import { VehicleEffectsSystem } from './vehicleEffects';

let cachedSoftwareWebGL: boolean | null = null;

function detectSoftwareWebGL(): boolean {
  if (cachedSoftwareWebGL !== null) return cachedSoftwareWebGL;
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2');
    if (!gl) {
      cachedSoftwareWebGL = true;
      return true;
    }
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    cachedSoftwareWebGL = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    cachedSoftwareWebGL = true;
  }
  return cachedSoftwareWebGL;
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
  let seed = 7717;
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < cloudCount; i++) {
    cloudPositions[i * 3] = (nextRand() - 0.5) * 1500;
    cloudPositions[i * 3 + 1] = 290 + nextRand() * 80;
    cloudPositions[i * 3 + 2] = (nextRand() - 0.5) * 1500;
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

interface WorldVehicle {
  instanceId: string;
  spec: VehicleSpec;
  rig: KartMeshRig;
  state: KartState;
}

interface GoKartTrackCanvasProps {
  cameraMode: CameraMode;
  perspective: FollowPerspective;
  isMuted: boolean;
  spectatorResetTick: number;
  restartRaceTick: number;
  vehicleInteractTick: number;
  touchInputRef: MutableRefObject<TouchActionInputState>;
  freeCamTouchInputRef: MutableRefObject<FreeCameraInputState>;
  onRaceStateChange: (state: RaceState) => void;
  onPlayerInfoChange: (info: PlayerHudInfo) => void;
  onSelectPerspective: (perspective: FollowPerspective) => void;
  onCyclePerspective: () => void;
  onToggleFollow: () => void;
  onToggleFreeCam: () => void;
  onToggleMute: () => void;
  onResetSpectator: () => void;
}

export function GoKartTrackCanvas({
  cameraMode,
  perspective,
  isMuted,
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
  onToggleMute,
  onResetSpectator,
}: GoKartTrackCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [contextLost, setContextLost] = useState(false);

  const cameraModeRef = useRef<CameraMode>(cameraMode);
  const perspectiveRef = useRef<FollowPerspective>(perspective);
  const isMutedRef = useRef<boolean>(isMuted);
  const spectatorResetTickRef = useRef<number>(spectatorResetTick);
  const restartRaceTickRef = useRef<number>(restartRaceTick);
  const vehicleInteractTickRef = useRef<number>(vehicleInteractTick);
  const soundEngineRef = useRef<ProceduralSoundEngine | null>(null);

  const onRaceStateChangeRef = useRef(onRaceStateChange);
  const onPlayerInfoChangeRef = useRef(onPlayerInfoChange);
  const onSelectPerspectiveRef = useRef(onSelectPerspective);
  const onCyclePerspectiveRef = useRef(onCyclePerspective);
  const onToggleFollowRef = useRef(onToggleFollow);
  const onToggleFreeCamRef = useRef(onToggleFreeCam);
  const onToggleMuteRef = useRef(onToggleMute);
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
    isMutedRef.current = isMuted;
    soundEngineRef.current?.setMuted(isMuted);
  }, [isMuted]);

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
    onToggleMuteRef.current = onToggleMute;
  }, [onToggleMute]);

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

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'WebGL 2 graphics context could not be initialized on this device.';
      container.setAttribute('data-state', 'webgl-error');
      setWebglError(msg);
      return;
    }

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

    const soundEngine = new ProceduralSoundEngine();
    soundEngine.setMuted(isMutedRef.current);
    soundEngineRef.current = soundEngine;

    const unlockAudio = () => {
      soundEngine.unlock();
    };
    window.addEventListener('pointerdown', unlockAudio, { passive: true });

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

    // Track curve, stadium, town district, banners & 3D checkpoint markers
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

    const checkpointBuild = buildCheckpointMarkers(checkpoints);
    scene.add(checkpointBuild.group);

    const stadiumBuild = buildStadiumArchitecture(textures);
    scene.add(stadiumBuild.group);

    const marketBuild = buildMarketDistrict(textures);
    scene.add(marketBuild.group);

    const bannerBuild = buildTrackBanners(bannerPlacements, textures);
    scene.add(bannerBuild.group);

    const vehicleEffects = new VehicleEffectsSystem();
    scene.add(vehicleEffects.group);

    const alignVehiclePose = (v: WorldVehicle) => {
      const groundY = getWorldGroundY(v.state.x, v.state.z);
      const slope = getWorldGroundSlope(v.state.x, v.state.z, v.state.yaw);

      v.rig.group.position.set(v.state.x, groundY + 0.03, v.state.z);
      v.rig.group.rotation.order = 'YXZ';
      v.rig.group.rotation.set(slope.pitch, v.state.yaw, slope.roll);

      // Suspension squat/dive & lateral roll on chassisGroup
      v.rig.chassisGroup.rotation.x = v.state.pitchTilt ?? 0;
      v.rig.chassisGroup.rotation.z = v.state.rollTilt ?? 0;
      if (v.rig.steeringWheel) {
        v.rig.steeringWheel.rotation.z = -v.state.steerAngle * 2.1;
      }
    };

    const createWorldVehicles = (): WorldVehicle[] =>
      TOWN_VEHICLE_SPAWNS.map((spawn) => {
        const spec = VEHICLE_CATALOG[spawn.specId] ?? VEHICLE_CATALOG.big_kart;
        const rig = buildVehicleMesh(spec, textures.contactShadow);
        const veh: WorldVehicle = {
          instanceId: spawn.instanceId,
          spec,
          rig,
          state: {
            ...createInitialKartState(),
            x: spawn.x,
            z: spawn.z,
            yaw: spawn.yaw,
          },
        };
        alignVehiclePose(veh);
        scene.add(rig.group);
        return veh;
      });

    const worldVehicles = createWorldVehicles();

    const resetWorldVehicles = () => {
      for (let i = 0; i < worldVehicles.length; i++) {
        const spawn = TOWN_VEHICLE_SPAWNS[i];
        const v = worldVehicles[i];
        v.state = {
          ...createInitialKartState(),
          x: spawn.x,
          z: spawn.z,
          yaw: spawn.yaw,
        };
        alignVehiclePose(v);
        v.rig.driverGroup.visible = false;
        v.rig.highlightRing.visible = false;
        v.rig.setBrakeLights(false);
      }
      vehicleEffects.reset();
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

    // Camera controllers (Spectator aerial, Free cam, and Multi-perspective Follow)
    const spectatorCtrl = new SpectatorCameraController();
    const freeCamCtrl = new FreeCameraController();
    const followCamCtrl = new FollowCameraController();
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
      followCamCtrl.update(
        camera,
        controls.target,
        perspectiveRef.current,
        {
          mode: 'walking',
          x: charState.x,
          y: initialCharY,
          z: charState.z,
          yaw: charState.yaw,
          speed: 0,
          vehicleSpec: null,
        },
        0.016,
        true,
      );
    }

    freeCamCtrl.syncFromCamera(camera);

    let specElevDeg = initialPose.elevationDeg;
    let specAzimDeg = initialPose.azimuthDeg;
    let specDist = initialPose.distance;
    horizonFog.near =
      cameraModeRef.current === 'follow' ? 620 : Math.max(540, initialPose.distance * 1.12);
    horizonFog.far =
      cameraModeRef.current === 'follow' ? 2100 : Math.max(1250, initialPose.distance * 2.02);

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
    let lastHudWrongWay = raceState.isWrongWay;
    let lastHudCountdownCeil = Math.ceil(raceState.countdownSeconds);

    // Sound edge-trigger trackers
    let prevSoundCountdownCeil = -1;
    let prevSoundStatus = raceState.status;
    let prevSoundCp = raceState.currentCheckpointIndex;
    let prevSoundLap = raceState.lap;
    let prevSoundWrongWay = false;

    // Diff-gated Player HUD state to eliminate idle React re-renders
    let lastPlayerHudSyncAt = 0;
    let lastHudPlayerMode = charState.mode;
    let lastHudActiveVehId: string | null = charState.activeVehicleId;
    let lastHudNearbyVehId: string | null = null;
    let lastHudSpeed = -999;
    let lastHudGear = -1;
    let lastHudDrifting = false;
    let lastHudDriftBucket = -1;
    let lastHudBoostActive = false;
    let lastHudOffTrack = false;
    let lastHudPosX = -9999;
    let lastHudPosZ = -9999;
    let nearbyVehRef: WorldVehicle | null = null;

    const clearAllTouchInputs = () => {
      touchInputRef.current.accelerate = false;
      touchInputRef.current.brakeReverse = false;
      touchInputRef.current.steerLeft = false;
      touchInputRef.current.steerRight = false;
      touchInputRef.current.drift = false;
      touchInputRef.current.sprint = false;

      freeCamTouchInputRef.current.moveForward = false;
      freeCamTouchInputRef.current.moveBackward = false;
      freeCamTouchInputRef.current.moveLeft = false;
      freeCamTouchInputRef.current.moveRight = false;
      freeCamTouchInputRef.current.rise = false;
      freeCamTouchInputRef.current.descend = false;
      freeCamTouchInputRef.current.faster = false;
      freeCamTouchInputRef.current.slower = false;
    };

    const keyboardTracker = new KeyboardInputTracker({
      getCameraMode: () => cameraModeRef.current,
      onCyclePerspective: () => {
        soundEngine.unlock();
        onCyclePerspectiveRef.current();
      },
      onSelectPerspective: (p) => {
        soundEngine.unlock();
        onSelectPerspectiveRef.current(p);
      },
      onToggleFollow: () => {
        soundEngine.unlock();
        onToggleFollowRef.current();
      },
      onToggleFreeCam: () => {
        soundEngine.unlock();
        onToggleFreeCamRef.current();
      },
      onResetSpectator: () => {
        soundEngine.unlock();
        onResetSpectatorRef.current();
      },
      onToggleMute: () => {
        soundEngine.unlock();
        onToggleMuteRef.current();
      },
    });

    const clearAllInputs = () => {
      keyboardTracker.clear();
      clearAllTouchInputs();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      soundEngine.unlock();
      keyboardTracker.handleKeyDown(e);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keyboardTracker.handleKeyUp(e);
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

    let isContextLost = false;
    const onWebGLContextLost = (e: Event) => {
      e.preventDefault();
      isContextLost = true;
      setContextLost(true);
    };
    const onWebGLContextRestored = () => {
      isContextLost = false;
      setContextLost(false);
      clock.getDelta();
    };

    renderer.domElement.addEventListener('webglcontextlost', onWebGLContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onWebGLContextRestored);
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
    let elapsedSimSeconds = 0;

    const mergedKartInput: KartInputState = {
      accelerate: false,
      brakeReverse: false,
      steerLeft: false,
      steerRight: false,
      drift: false,
    };
    const mergedFreeInput: FreeCameraInputState = createEmptyFreeCameraInput();

    let frameId = 0;
    let disposed = false;
    let attrTickCounter = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 50);
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

      if (isContextLost) {
        frameId = window.setTimeout(tick, 120);
        return;
      }

      // Preserve real-time 1.0x simulation speed even on 10-20 FPS software renderers via sub-stepping
      const rawDt = clock.getDelta();
      const frameDt = Math.min(rawDt, 0.25);
      const subSteps = Math.max(1, Math.ceil(frameDt / 0.05));
      const stepDt = frameDt / subSteps;
      elapsedSimSeconds += frameDt;

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
        prevSoundStatus = raceState.status;
        prevSoundCountdownCeil = -1;
        prevSoundCp = 0;
        prevSoundLap = 1;
        prevSoundWrongWay = false;
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
      const wantsInteract = keyboardTracker.interactQueued || interactTick !== prevInteractTick;
      keyboardTracker.interactQueued = false;
      prevInteractTick = interactTick;

      if (wantsInteract && mode !== 'free' && !raceState.isFinished) {
        if (charState.mode === 'walking') {
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
            soundEngine.playVehicleDoor(true);
            snapFollowNextFrame = true;
          }
        } else if (charState.mode === 'driving') {
          const activeVeh = findVehicleById(charState.activeVehicleId);
          if (activeVeh) {
            activeVeh.state.speed = 0;
            activeVeh.state.steerAngle = 0;
            activeVeh.state.lateralSpeed = 0;
            activeVeh.state.isDrifting = false;
            activeVeh.state.driftCharge = 0;
            activeVeh.rig.setBrakeLights(false);
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
            soundEngine.playVehicleDoor(false);
            snapFollowNextFrame = true;
          }
        }
      }

      // Gather player movement / driving input
      const controlActive =
        (raceState.status === 'waiting' || raceState.status === 'racing') &&
        !raceState.isFinished &&
        mode !== 'free';

      const keyInput = keyboardTracker.kartInput;
      const freeKeyInput = keyboardTracker.freeInput;
      const touch = touchInputRef.current;

      if (!controlActive) {
        mergedKartInput.accelerate = false;
        mergedKartInput.brakeReverse = false;
        mergedKartInput.steerLeft = false;
        mergedKartInput.steerRight = false;
        mergedKartInput.drift = false;
      } else {
        mergedKartInput.accelerate = keyInput.accelerate || touch.accelerate;
        mergedKartInput.brakeReverse = keyInput.brakeReverse || touch.brakeReverse;
        mergedKartInput.steerLeft = keyInput.steerLeft || touch.steerLeft;
        mergedKartInput.steerRight = keyInput.steerRight || touch.steerRight;
        mergedKartInput.drift = Boolean(keyInput.drift || touch.drift);
      }

      const activeVeh = findVehicleById(charState.activeVehicleId);
      let fxInput = null;

      // Sub-step physics & race rules for deterministic real-time accuracy
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

        for (let s = 0; s < subSteps; s++) {
          activeVeh.state = stepKartPhysics(
            activeVeh.state,
            mergedKartInput,
            stepDt,
            frames,
            activeVeh.spec.stats,
            obstacleScratch,
          );

          raceState = updateRaceState(
            raceState,
            activeVeh.state.x,
            activeVeh.state.z,
            activeVeh.state.speed,
            activeVeh.state.yaw,
            stepDt,
            checkpoints,
            finishPos,
            finishTangent,
            {
              isDriving: true,
              vehicleName: activeVeh.spec.name,
              trackFrames: frames,
            },
          );
        }

        charState.x = activeVeh.state.x;
        charState.z = activeVeh.state.z;
        charState.yaw = activeVeh.state.yaw;
        charState.speed = activeVeh.state.speed;

        activeVeh.rig.driverGroup.visible = true;
        activeVeh.rig.driverHead.visible = !(mode === 'follow' && activePersp === 'cockpit');

        alignVehiclePose(activeVeh);

        const visualSteer = activeVeh.state.steerAngle * 0.44;
        activeVeh.rig.frontLeftPivot.rotation.y = visualSteer;
        activeVeh.rig.frontRightPivot.rotation.y = visualSteer;
        for (const w of activeVeh.rig.wheels) {
          w.rotation.x = activeVeh.state.wheelSpin;
        }

        const isBraking =
          mergedKartInput.brakeReverse ||
          Boolean(mergedKartInput.drift && Math.abs(activeVeh.state.speed) > 4);
        activeVeh.rig.setBrakeLights(isBraking);

        const groundY = getWorldGroundY(activeVeh.state.x, activeVeh.state.z);
        fxInput = {
          x: activeVeh.state.x,
          y: groundY,
          z: activeVeh.state.z,
          yaw: activeVeh.state.yaw,
          speed: activeVeh.state.speed,
          lateralSpeed: activeVeh.state.lateralSpeed ?? 0,
          isDrifting: Boolean(activeVeh.state.isDrifting),
          braking: isBraking,
          onAsphalt: activeVeh.state.onTrack,
          boostActive: (activeVeh.state.boostTimer ?? 0) > 0.02,
          rearTrackHalfWidth: activeVeh.spec.stats.kartRadius * 0.62,
          rearAxleOffset: activeVeh.spec.stats.kartRadius * 0.72,
        };

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

        const sprint = freeKeyInput.faster || touch.sprint;
        for (let s = 0; s < subSteps; s++) {
          charState = stepCharacterPhysics(
            charState,
            mergedKartInput,
            sprint,
            stepDt,
            obstacleScratch,
          );

          if (raceState.status === 'racing' || raceState.status === 'countdown') {
            // Advance race clock while preventing on-foot checkpoint/finish exploits
            raceState = updateRaceState(
              raceState,
              charState.x,
              charState.z,
              0,
              charState.yaw,
              stepDt,
              checkpoints,
              finishPos,
              finishTangent,
              {
                isDriving: false,
                trackFrames: frames,
              },
            );
          }
        }

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

        const pulse = 1 + 0.05 * Math.sin(elapsedSimSeconds * 6.0);
        for (let i = 0; i < worldVehicles.length; i++) {
          const v = worldVehicles[i];
          const isNear = nearbyVehRef === v;
          v.rig.highlightRing.visible = isNear;
          if (isNear) {
            v.rig.highlightRing.scale.setScalar(pulse);
          }
        }
      }

      // Step visual FX, animated checkpoint beacon & park fountain
      vehicleEffects.update(fxInput, frameDt);
      checkpointBuild.updateActiveCheckpoint(
        raceState.currentCheckpointIndex,
        raceState.status === 'racing',
        elapsedSimSeconds,
      );
      marketBuild.update(elapsedSimSeconds);

      // Update procedural motorsport & world audio
      const cdCeil = Math.ceil(raceState.countdownSeconds);
      if (raceState.status === 'countdown' && cdCeil !== prevSoundCountdownCeil && cdCeil >= 1 && cdCeil <= 3) {
        prevSoundCountdownCeil = cdCeil;
        soundEngine.playCountdownBeep(false);
      }
      if (prevSoundStatus === 'countdown' && raceState.status === 'racing') {
        soundEngine.playCountdownBeep(true);
      }
      if (raceState.status === 'racing') {
        if (raceState.isFinished && prevSoundStatus !== 'finished') {
          soundEngine.playFinishFanfare();
        } else if (raceState.lap > prevSoundLap) {
          soundEngine.playLapChime();
        } else if (raceState.currentCheckpointIndex > prevSoundCp) {
          soundEngine.playCheckpointChime();
        }
        if (raceState.isWrongWay && !prevSoundWrongWay) {
          soundEngine.playWrongWayAlert();
        }
      } else if (raceState.status === 'finished' && prevSoundStatus !== 'finished') {
        soundEngine.playFinishFanfare();
      }
      prevSoundStatus = raceState.status;
      prevSoundCp = raceState.currentCheckpointIndex;
      prevSoundLap = raceState.lap;
      prevSoundWrongWay = raceState.isWrongWay;

      const gearCount = activeVeh
        ? activeVeh.spec.bodyStyle === 'formula'
          ? 6
          : activeVeh.spec.bodyStyle === 'kart' || activeVeh.spec.bodyStyle === 'cruiser'
            ? 4
            : 5
        : 5;
      const gearRpm = activeVeh
        ? computeSimulatedGearAndRpm(
            Math.abs(activeVeh.state.speed),
            activeVeh.spec.stats.maxForwardSpeed,
            gearCount,
          )
        : { gear: 1, rpmNorm: 0.2 };

      soundEngine.update(
        {
          isDriving: Boolean(charState.mode === 'driving' && activeVeh),
          bodyStyle: activeVeh ? activeVeh.spec.bodyStyle : 'kart',
          speed: activeVeh ? activeVeh.state.speed : 0,
          maxSpeed: activeVeh ? activeVeh.spec.stats.maxForwardSpeed : CHARACTER_PHYSICS.sprintSpeed,
          throttle: mergedKartInput.accelerate,
          braking: mergedKartInput.brakeReverse,
          lateralSlip: activeVeh ? (activeVeh.state.lateralSpeed ?? 0) : 0,
          isDrifting: Boolean(activeVeh?.state.isDrifting),
          onKerb: Boolean(activeVeh?.state.onKerb),
          onAsphalt: activeVeh ? activeVeh.state.onTrack : true,
          walkingSpeed: charState.mode === 'walking' ? charState.speed : 0,
        },
        frameDt,
      );

      // Sync React RaceHUD state
      const nowMs = performance.now();
      const discreteChanged =
        raceState.status !== lastHudStatus ||
        raceState.lap !== lastHudLap ||
        raceState.currentCheckpointIndex !== lastHudCp ||
        raceState.isFinished !== lastHudFinished ||
        raceState.isWrongWay !== lastHudWrongWay ||
        (raceState.status === 'countdown' && cdCeil !== lastHudCountdownCeil);
      if (discreteChanged || (raceState.status === 'racing' && nowMs - lastHudSyncAt >= 100)) {
        lastHudStatus = raceState.status;
        lastHudLap = raceState.lap;
        lastHudCp = raceState.currentCheckpointIndex;
        lastHudFinished = raceState.isFinished;
        lastHudWrongWay = raceState.isWrongWay;
        lastHudCountdownCeil = cdCeil;
        lastHudSyncAt = nowMs;
        onRaceStateChangeRef.current(raceState);
      }

      // Diff-gated Player HUD sync (zero idle React re-renders!)
      const activeId = activeVeh ? activeVeh.instanceId : null;
      const nearbyId = nearbyVehRef ? nearbyVehRef.instanceId : null;
      const curSpeed = activeVeh ? activeVeh.state.speed : charState.speed;
      const curDrifting = Boolean(activeVeh?.state.isDrifting);
      const curDriftCharge = activeVeh ? (activeVeh.state.driftCharge ?? 0) : 0;
      const curDriftBucket = Math.round(curDriftCharge * 20);
      const curBoostActive = Boolean(activeVeh && (activeVeh.state.boostTimer ?? 0) > 0.02);
      const curOffTrack = activeVeh ? !activeVeh.state.onTrack : false;
      const curPosX = activeVeh ? activeVeh.state.x : charState.x;
      const curPosZ = activeVeh ? activeVeh.state.z : charState.z;
      const curHeading = activeVeh ? activeVeh.state.yaw : charState.yaw;

      const playerHudDiscrete =
        charState.mode !== lastHudPlayerMode ||
        activeId !== lastHudActiveVehId ||
        nearbyId !== lastHudNearbyVehId ||
        gearRpm.gear !== lastHudGear ||
        curDrifting !== lastHudDrifting ||
        curBoostActive !== lastHudBoostActive ||
        curOffTrack !== lastHudOffTrack;

      const playerHudContinuousChanged =
        Math.abs(curSpeed - lastHudSpeed) >= 0.08 ||
        curDriftBucket !== lastHudDriftBucket ||
        Math.hypot(curPosX - lastHudPosX, curPosZ - lastHudPosZ) >= 0.6;

      if (
        playerHudDiscrete ||
        (playerHudContinuousChanged && nowMs - lastPlayerHudSyncAt >= 100)
      ) {
        lastHudPlayerMode = charState.mode;
        lastHudActiveVehId = activeId;
        lastHudNearbyVehId = nearbyId;
        lastHudSpeed = curSpeed;
        lastHudGear = gearRpm.gear;
        lastHudDrifting = curDrifting;
        lastHudDriftBucket = curDriftBucket;
        lastHudBoostActive = curBoostActive;
        lastHudOffTrack = curOffTrack;
        lastHudPosX = curPosX;
        lastHudPosZ = curPosZ;
        lastPlayerHudSyncAt = nowMs;

        onPlayerInfoChangeRef.current({
          mode: charState.mode,
          activeVehicleId: activeId,
          activeVehicleName: activeVeh ? activeVeh.spec.name : null,
          activeVehicleTagline: activeVeh ? activeVeh.spec.tagline : null,
          nearbyVehicleId: nearbyId,
          nearbyVehicleName: nearbyVehRef ? nearbyVehRef.spec.name : null,
          nearbyVehicleTagline: nearbyVehRef ? nearbyVehRef.spec.tagline : null,
          speedUnits: curSpeed,
          gear: gearRpm.gear,
          rpmNorm: gearRpm.rpmNorm,
          isDrifting: curDrifting,
          driftCharge: curDriftCharge,
          boostTimer: activeVeh ? (activeVeh.state.boostTimer ?? 0) : 0,
          isOffTrack: curOffTrack,
          posX: curPosX,
          posZ: curPosZ,
          heading: curHeading,
        });
      }

      // Update active camera controller
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

        freeCamCtrl.update(camera, mergedFreeInput, frameDt);

        const fogAlpha = 1 - Math.exp(-3.6 * frameDt);
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
        followCamCtrl.update(
          camera,
          controls.target,
          activePersp,
          {
            mode: charState.mode,
            x: focusX,
            y: focusY,
            z: focusZ,
            yaw: focusYaw,
            speed: activeVeh ? activeVeh.state.speed : charState.speed,
            steerAngle: activeVeh ? activeVeh.state.steerAngle : 0,
            isDrifting: activeVeh?.state.isDrifting,
            boostTimer: activeVeh?.state.boostTimer,
            onKerb: activeVeh?.state.onKerb,
            vehicleSpec: activeVeh ? activeVeh.spec : null,
          },
          frameDt,
          snapFollowNextFrame,
        );
        snapFollowNextFrame = false;

        const fogAlpha = 1 - Math.exp(-4.0 * frameDt);
        horizonFog.near = THREE.MathUtils.lerp(horizonFog.near, 620, fogAlpha);
        horizonFog.far = THREE.MathUtils.lerp(horizonFog.far, 2100, fogAlpha);
      } else if (!userMovedOrbit) {
        controls.enabled = true;
        const specRes = spectatorCtrl.update(
          camera,
          currentAspect,
          focusX,
          focusZ,
          frameDt,
          controls.target,
          returningToSpectator,
        );
        specElevDeg = specRes.elevationDeg;
        specAzimDeg = specRes.azimuthDeg;
        specDist = specRes.distance;
        if (returningToSpectator && specRes.converged) {
          returningToSpectator = false;
        }
        const fogAlpha = 1 - Math.exp(-3.6 * frameDt);
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
        const fogAlpha = 1 - Math.exp(-4.0 * frameDt);
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
      window.removeEventListener('pointerdown', unlockAudio);
      renderer.domElement.removeEventListener('webglcontextlost', onWebGLContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onWebGLContextRestored);
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
      soundEngine.dispose();
      soundEngineRef.current = null;
      disposeAtmosphere();
      vehicleEffects.dispose();
      checkpointBuild.dispose();
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
    >
      {webglError && (
        <div
          role="alert"
          data-testid="webgl-fallback"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 p-6 text-white"
        >
          <div className="max-w-md rounded-3xl border border-white/20 bg-slate-900 p-6 text-center shadow-2xl">
            <h1 className="text-xl font-black tracking-tight text-rose-400">
              3D Graphics Unavailable
            </h1>
            <p className="mt-2 text-sm text-white/80 leading-relaxed">
              APEX Kart 3D requires WebGL 2 hardware or software acceleration. Please enable
              hardware acceleration in your browser settings and reload.
            </p>
            <p className="mt-3 rounded-xl bg-black/40 px-3 py-2 font-mono text-xs text-white/60">
              {webglError}
            </p>
          </div>
        </div>
      )}
      {contextLost && !webglError && (
        <div
          role="status"
          className="pointer-events-none fixed top-20 inset-x-0 z-50 flex justify-center px-4"
        >
          <div className="rounded-2xl border border-amber-400/60 bg-slate-900/95 px-4 py-2 text-xs font-bold text-amber-200 shadow-xl">
            Graphics context paused — restoring 3D scene...
          </div>
        </div>
      )}
    </div>
  );
}
