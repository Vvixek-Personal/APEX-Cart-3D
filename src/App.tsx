/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FreeCameraInputState,
  createEmptyFreeCameraInput,
} from './camera/freeCamera';
import {
  CameraMode,
  FollowPerspective,
  PERSPECTIVE_OPTIONS,
  PlayerHudInfo,
  TouchActionInputState,
  TouchControls,
} from './components/TouchControls';
import { RaceHUD } from './components/RaceHUD';
import { PauseMenu } from './components/PauseMenu';
import {
  RaceState,
  createInitialRaceState,
} from './game/raceRules';
import { createInitialCharacterState } from './player/characterPhysics';
import { DayNightSample } from './scene/dayNight';
import { GoKartTrackCanvas } from './scene/GoKartTrackCanvas';

const DEFAULT_MAP_KEY = 'KeyM';

const _initialChar = createInitialCharacterState();

const INITIAL_PLAYER_HUD: PlayerHudInfo = {
  mode: 'walking',
  activeVehicleId: null,
  activeVehicleName: null,
  activeVehicleTagline: null,
  nearbyVehicleId: 'veh_mega_kart',
  nearbyVehicleName: 'Apex Mega Kart',
  nearbyVehicleTagline: 'Oversized Twin-Engine Kart',
  speedUnits: 0,
  gear: 1,
  rpmNorm: 0.2,
  isDrifting: false,
  driftCharge: 0,
  boostTimer: 0,
  isOffTrack: false,
  posX: _initialChar.x,
  posZ: _initialChar.z,
  heading: _initialChar.yaw,
};

const INITIAL_DAY_NIGHT: DayNightSample = {
  nightFactor: 0,
  duskGlow: 0,
  clockLabel: '09:40',
};

function mapKeyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Space') return 'Space';
  if (code === 'Tab') return 'Tab';
  if (code.startsWith('Arrow')) return code.slice(5);
  return code;
}

export default function App() {
  const [cameraMode, setCameraMode] = useState<CameraMode>('follow');
  const [perspective, setPerspective] = useState<FollowPerspective>('chase');
  const [isMuted, setIsMuted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [mapKey, setMapKey] = useState(DEFAULT_MAP_KEY);
  const [isRebindingMapKey, setIsRebindingMapKey] = useState(false);
  const [spectatorResetTick, setSpectatorResetTick] = useState(0);
  const [restartRaceTick, setRestartRaceTick] = useState(0);
  const [vehicleInteractTick, setVehicleInteractTick] = useState(0);
  const [pauseTick, setPauseTick] = useState(0);
  const [raceState, setRaceState] = useState<RaceState>(() =>
    createInitialRaceState(3, 6),
  );
  const [playerInfo, setPlayerInfo] = useState<PlayerHudInfo>(INITIAL_PLAYER_HUD);
  const [dayNight, setDayNight] = useState<DayNightSample>(INITIAL_DAY_NIGHT);

  const touchInputRef = useRef<TouchActionInputState>({
    accelerate: false,
    brakeReverse: false,
    steerLeft: false,
    steerRight: false,
    drift: false,
    sprint: false,
  });

  const freeCamTouchInputRef = useRef<FreeCameraInputState>(
    createEmptyFreeCameraInput(),
  );

  const mapKeyRef = useRef(mapKey);
  const isRebindingRef = useRef(false);
  const isPausedRef = useRef(false);
  const isMapOpenRef = useRef(false);
  useEffect(() => {
    mapKeyRef.current = mapKey;
    isRebindingRef.current = isRebindingMapKey;
    isPausedRef.current = isPaused;
    isMapOpenRef.current = isMapOpen;
  }, [mapKey, isRebindingMapKey, isPaused, isMapOpen]);

  const setPaused = useCallback((next: boolean) => {
    setIsPaused(next);
    setPauseTick((n) => n + 1);
  }, []);

  const togglePause = useCallback(() => {
    setPaused(!isPausedRef.current);
  }, [setPaused]);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const handleToggleFollow = useCallback(() => {
    setCameraMode((prev) => (prev === 'follow' ? 'spectator' : 'follow'));
  }, []);

  const handleToggleFreeCam = useCallback(() => {
    setCameraMode((prev) => (prev === 'free' ? 'spectator' : 'free'));
  }, []);

  const handleCyclePerspective = useCallback(() => {
    setPerspective((prev) => {
      const idx = PERSPECTIVE_OPTIONS.findIndex((o) => o.id === prev);
      return PERSPECTIVE_OPTIONS[(idx + 1) % PERSPECTIVE_OPTIONS.length].id;
    });
    setCameraMode('follow');
  }, []);

  const handleSelectPerspective = useCallback((next: FollowPerspective) => {
    setPerspective(next);
    setCameraMode('follow');
  }, []);

  const handleRestartRace = useCallback(() => {
    setRestartRaceTick((n) => n + 1);
    setRaceState(createInitialRaceState(3, 6));
    setPaused(false);
  }, [setPaused]);

  // ESC toggles pause (and closes the full map first); the map key opens the map.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isRebindingRef.current) {
        e.preventDefault();
        e.stopPropagation();
        if (e.code !== 'Escape') {
          setMapKey(e.code);
        }
        setIsRebindingMapKey(false);
        return;
      }
      const target = e.target as { tagName?: string } | null;
      const tag = target?.tagName?.toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Escape' && !e.repeat) {
        e.preventDefault();
        if (isMapOpenRef.current) {
          setIsMapOpen(false);
        } else {
          togglePause();
        }
        return;
      }
      if (e.code === mapKeyRef.current && !e.repeat) {
        e.preventDefault();
        setIsMapOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePause]);

  const handleVehicleInteract = useCallback(() => {
    setVehicleInteractTick((n) => n + 1);
  }, []);

  const handleRaceStateChange = useCallback((state: RaceState) => {
    setRaceState(state);
  }, []);

  const handlePlayerInfoChange = useCallback((info: PlayerHudInfo) => {
    setPlayerInfo(info);
  }, []);

  const handleDayNightChange = useCallback((sample: DayNightSample) => {
    setDayNight(sample);
  }, []);

  const handleKartTouchInput = useCallback(
    (key: keyof TouchActionInputState, pressed: boolean) => {
      touchInputRef.current[key] = pressed;
    },
    [],
  );

  const handleFreeCamTouchInput = useCallback(
    (key: keyof FreeCameraInputState, pressed: boolean) => {
      freeCamTouchInputRef.current[key] = pressed;
    },
    [],
  );

  return (
    <main className="relative h-screen w-screen overflow-hidden select-none">
      <GoKartTrackCanvas
        cameraMode={cameraMode}
        perspective={perspective}
        isMuted={isMuted}
        isPaused={isPaused || isMapOpen}
        pauseTick={pauseTick + (isMapOpen ? 1 : 0)}
        spectatorResetTick={spectatorResetTick}
        restartRaceTick={restartRaceTick}
        vehicleInteractTick={vehicleInteractTick}
        touchInputRef={touchInputRef}
        freeCamTouchInputRef={freeCamTouchInputRef}
        onRaceStateChange={handleRaceStateChange}
        onPlayerInfoChange={handlePlayerInfoChange}
        onDayNightChange={handleDayNightChange}
        onSelectPerspective={handleSelectPerspective}
        onCyclePerspective={handleCyclePerspective}
        onToggleFollow={handleToggleFollow}
        onToggleFreeCam={handleToggleFreeCam}
        onToggleMute={handleToggleMute}
        onResetSpectator={() => {
          setCameraMode('spectator');
          setSpectatorResetTick((n) => n + 1);
        }}
      />
      <RaceHUD
        raceState={raceState}
        playerInfo={playerInfo}
        dayNight={dayNight}
        isMapOpen={isMapOpen}
        onCloseMap={() => setIsMapOpen(false)}
      />
      <TouchControls
        cameraMode={cameraMode}
        perspective={perspective}
        playerInfo={playerInfo}
        onPause={togglePause}
        onVehicleInteract={handleVehicleInteract}
        onKartInputChange={handleKartTouchInput}
        onFreeCamInputChange={handleFreeCamTouchInput}
      />
      {isPaused && (
        <PauseMenu
          mapKeyLabel={mapKeyLabel(mapKey)}
          isRebindingMapKey={isRebindingMapKey}
          onRequestRebindMapKey={() => setIsRebindingMapKey(true)}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
          perspective={perspective}
          onSelectPerspective={handleSelectPerspective}
          onResume={() => setPaused(false)}
          onRestartRace={handleRestartRace}
          onOpenFullMap={() => {
            setPaused(false);
            setIsMapOpen(true);
          }}
          clockLabel={dayNight.clockLabel}
        />
      )}
    </main>
  );
}
