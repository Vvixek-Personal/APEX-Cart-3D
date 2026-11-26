/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useRef, useState } from 'react';
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
import {
  RaceState,
  createInitialRaceState,
} from './game/raceRules';
import { GoKartTrackCanvas } from './scene/GoKartTrackCanvas';

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
  posX: -5.4,
  posZ: 242.0,
  heading: Math.PI,
};

export default function App() {
  const [cameraMode, setCameraMode] = useState<CameraMode>('follow');
  const [perspective, setPerspective] = useState<FollowPerspective>('chase');
  const [isMuted, setIsMuted] = useState(false);
  const [spectatorResetTick, setSpectatorResetTick] = useState(0);
  const [restartRaceTick, setRestartRaceTick] = useState(0);
  const [vehicleInteractTick, setVehicleInteractTick] = useState(0);
  const [raceState, setRaceState] = useState<RaceState>(() =>
    createInitialRaceState(3, 6),
  );
  const [playerInfo, setPlayerInfo] = useState<PlayerHudInfo>(INITIAL_PLAYER_HUD);

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

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const handleToggleFollow = useCallback(() => {
    setCameraMode((prev) => (prev === 'follow' ? 'spectator' : 'follow'));
  }, []);

  const handleToggleFreeCam = useCallback(() => {
    setCameraMode((prev) => (prev === 'free' ? 'spectator' : 'free'));
  }, []);

  const handleResetSpectator = useCallback(() => {
    setCameraMode('spectator');
    setSpectatorResetTick((n) => n + 1);
  }, []);

  const handleSelectPerspective = useCallback((next: FollowPerspective) => {
    setPerspective(next);
    setCameraMode('follow');
  }, []);

  const handleCyclePerspective = useCallback(() => {
    setPerspective((prev) => {
      const idx = PERSPECTIVE_OPTIONS.findIndex((o) => o.id === prev);
      const next = PERSPECTIVE_OPTIONS[(idx + 1) % PERSPECTIVE_OPTIONS.length].id;
      return next;
    });
    setCameraMode('follow');
  }, []);

  const handleVehicleInteract = useCallback(() => {
    setVehicleInteractTick((n) => n + 1);
  }, []);

  const handleRestartRace = useCallback(() => {
    setRestartRaceTick((n) => n + 1);
    setRaceState(createInitialRaceState(3, 6));
  }, []);

  const handleRaceStateChange = useCallback((state: RaceState) => {
    setRaceState(state);
  }, []);

  const handlePlayerInfoChange = useCallback((info: PlayerHudInfo) => {
    setPlayerInfo(info);
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
        spectatorResetTick={spectatorResetTick}
        restartRaceTick={restartRaceTick}
        vehicleInteractTick={vehicleInteractTick}
        touchInputRef={touchInputRef}
        freeCamTouchInputRef={freeCamTouchInputRef}
        onRaceStateChange={handleRaceStateChange}
        onPlayerInfoChange={handlePlayerInfoChange}
        onSelectPerspective={handleSelectPerspective}
        onCyclePerspective={handleCyclePerspective}
        onToggleFollow={handleToggleFollow}
        onToggleFreeCam={handleToggleFreeCam}
        onToggleMute={handleToggleMute}
        onResetSpectator={handleResetSpectator}
      />
      <RaceHUD
        raceState={raceState}
        playerInfo={playerInfo}
        onRestart={handleRestartRace}
      />
      <TouchControls
        cameraMode={cameraMode}
        perspective={perspective}
        playerInfo={playerInfo}
        isMuted={isMuted}
        onToggleMute={handleToggleMute}
        onSelectPerspective={handleSelectPerspective}
        onCyclePerspective={handleCyclePerspective}
        onToggleFollow={handleToggleFollow}
        onToggleFreeCam={handleToggleFreeCam}
        onResetSpectator={handleResetSpectator}
        onVehicleInteract={handleVehicleInteract}
        onKartInputChange={handleKartTouchInput}
        onFreeCamInputChange={handleFreeCamTouchInput}
      />
    </main>
  );
}
