/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useRef, useState } from 'react';
import { CameraMode, TouchControls } from './components/TouchControls';
import type { KartInputState } from './kart/kartPhysics';
import { GoKartTrackCanvas } from './scene/GoKartTrackCanvas';

export default function App() {
  const [cameraMode, setCameraMode] = useState<CameraMode>('spectator');
  const touchInputRef = useRef<KartInputState>({
    accelerate: false,
    brakeReverse: false,
    steerLeft: false,
    steerRight: false,
  });

  const handleToggleCamera = useCallback(() => {
    setCameraMode((prev) => (prev === 'spectator' ? 'follow' : 'spectator'));
  }, []);

  const handleTouchInput = useCallback(
    (key: keyof KartInputState, pressed: boolean) => {
      touchInputRef.current[key] = pressed;
    },
    [],
  );

  return (
    <main className="relative h-screen w-screen overflow-hidden select-none">
      <GoKartTrackCanvas
        cameraMode={cameraMode}
        touchInputRef={touchInputRef}
        onToggleCamera={handleToggleCamera}
      />
      <TouchControls
        cameraMode={cameraMode}
        onToggleCamera={handleToggleCamera}
        onInputChange={handleTouchInput}
      />
    </main>
  );
}
