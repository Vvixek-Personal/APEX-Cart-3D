/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useRef, useState } from 'react';
import {
  FreeCameraInputState,
  createEmptyFreeCameraInput,
} from './camera/freeCamera';
import { CameraMode, TouchControls } from './components/TouchControls';
import type { KartInputState } from './kart/kartPhysics';
import { GoKartTrackCanvas } from './scene/GoKartTrackCanvas';

export default function App() {
  const [cameraMode, setCameraMode] = useState<CameraMode>('spectator');
  const [spectatorResetTick, setSpectatorResetTick] = useState(0);

  const touchInputRef = useRef<KartInputState>({
    accelerate: false,
    brakeReverse: false,
    steerLeft: false,
    steerRight: false,
  });

  const freeCamTouchInputRef = useRef<FreeCameraInputState>(
    createEmptyFreeCameraInput(),
  );

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

  const handleKartTouchInput = useCallback(
    (key: keyof KartInputState, pressed: boolean) => {
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
        spectatorResetTick={spectatorResetTick}
        touchInputRef={touchInputRef}
        freeCamTouchInputRef={freeCamTouchInputRef}
        onToggleFollow={handleToggleFollow}
        onToggleFreeCam={handleToggleFreeCam}
        onResetSpectator={handleResetSpectator}
      />
      <TouchControls
        cameraMode={cameraMode}
        onToggleFollow={handleToggleFollow}
        onToggleFreeCam={handleToggleFreeCam}
        onResetSpectator={handleResetSpectator}
        onKartInputChange={handleKartTouchInput}
        onFreeCamInputChange={handleFreeCamTouchInput}
      />
    </main>
  );
}
