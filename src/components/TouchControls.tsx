import type { PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useRef } from 'react';
import type { FreeCameraInputState } from '../camera/freeCamera';
import type { KartInputState } from '../kart/kartPhysics';
import type { PlayerControlMode } from '../player/characterPhysics';

export type CameraMode = 'spectator' | 'follow' | 'free';
export type FollowPerspective = 'chase' | 'cockpit' | 'hood' | 'wide';

export const PERSPECTIVE_OPTIONS: ReadonlyArray<{
  id: FollowPerspective;
  label: string;
  shortLabel: string;
}> = [
  { id: 'chase', label: 'Chase', shortLabel: 'Chase' },
  { id: 'cockpit', label: '1st Person', shortLabel: '1st' },
  { id: 'hood', label: 'Hood / Action', shortLabel: 'Hood' },
  { id: 'wide', label: 'Wide', shortLabel: 'Wide' },
];

export type TouchActionInputState = KartInputState & {
  sprint: boolean;
};

export interface PlayerHudInfo {
  mode: PlayerControlMode;
  activeVehicleId: string | null;
  activeVehicleName: string | null;
  activeVehicleTagline: string | null;
  nearbyVehicleId: string | null;
  nearbyVehicleName: string | null;
  nearbyVehicleTagline: string | null;
  speedUnits: number;
  gear?: number;
  rpmNorm?: number;
  isDrifting?: boolean;
  driftCharge?: number;
  boostTimer?: number;
  isOffTrack?: boolean;
  posX?: number;
  posZ?: number;
  heading?: number;
}

interface TouchControlsProps {
  cameraMode: CameraMode;
  perspective: FollowPerspective;
  playerInfo: PlayerHudInfo;
  onPause: () => void;
  onVehicleInteract: () => void;
  onKartInputChange: (key: keyof TouchActionInputState, pressed: boolean) => void;
  onFreeCamInputChange: (key: keyof FreeCameraInputState, pressed: boolean) => void;
}

interface HoldButtonProps<K extends string> {
  label: string;
  inputKey: K;
  onInputChange: (key: K, pressed: boolean) => void;
  className: string;
  children: React.ReactNode;
}

function HoldButton<K extends string>({
  label,
  inputKey,
  onInputChange,
  className,
  children,
}: HoldButtonProps<K>) {
  const activePointers = useRef<Set<number>>(new Set());
  const latestKeyRef = useRef(inputKey);
  const latestCallbackRef = useRef(onInputChange);
  latestKeyRef.current = inputKey;
  latestCallbackRef.current = onInputChange;

  useEffect(() => {
    const keyAtMount = inputKey;
    const pointers = activePointers.current;
    return () => {
      if (pointers.size > 0) {
        pointers.clear();
        latestCallbackRef.current(keyAtMount, false);
      }
    };
  }, [inputKey]);

  const press = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic events without active pointer capture
    }
    activePointers.current.add(e.pointerId);
    onInputChange(inputKey, true);
  };

  const release = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size === 0) {
      onInputChange(inputKey, false);
    }
  };

  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}
      style={{ touchAction: 'none' }}
      className={`pointer-events-auto select-none flex items-center justify-center rounded-2xl border-2 shadow-lg active:scale-95 transition-transform duration-75 ${className}`}
    >
      {children}
    </button>
  );
}

const stopCanvasPointer = (e: ReactPointerEvent<HTMLButtonElement>) => {
  e.stopPropagation();
};

/**
 * Clean gameplay-layer controls. Every text button lives in the pause menu now:
 * only icon-only inputs (pause, enter/exit vehicle, touch driving pads) remain.
 */
export function TouchControls({
  cameraMode,
  playerInfo,
  onPause,
  onVehicleInteract,
  onKartInputChange,
  onFreeCamInputChange,
}: TouchControlsProps) {
  const isWalking = playerInfo.mode === 'walking';
  const canInteractVehicle =
    playerInfo.mode === 'driving' || playerInfo.nearbyVehicleId !== null;

  return (
    <div
      className="game-controls pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-2.5 sm:p-5"
      style={{ touchAction: 'none' }}
    >
      {/* Single icon-only pause button (desktop ESC works too) */}
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={onPause}
          onPointerDown={stopCanvasPointer}
          aria-label="Pause game"
          data-testid="pause-btn"
          style={{ touchAction: 'none' }}
          className="pointer-events-auto select-none flex items-center justify-center rounded-xl border border-white/20 bg-[rgba(22,28,36,0.82)] w-10 h-10 text-white shadow-md active:scale-95 transition-transform duration-75"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="6" y="4" width="4" height="16" rx="1.2" />
            <rect x="14" y="4" width="4" height="16" rx="1.2" />
          </svg>
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {/* Icon-only enter / exit vehicle button (works on touch; desktop uses E) */}
        {cameraMode !== 'free' && canInteractVehicle && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={onVehicleInteract}
              onPointerDown={stopCanvasPointer}
              data-testid="vehicle-interact-btn"
              aria-label={playerInfo.mode === 'driving' ? 'Exit vehicle' : 'Enter vehicle'}
              style={{ touchAction: 'none' }}
              className="pointer-events-auto select-none flex items-center justify-center rounded-full border-2 w-14 h-14 shadow-xl active:scale-95 transition-transform duration-75"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {playerInfo.mode === 'driving' ? (
                  <>
                    <path d="M14.5 5h-5L7 8H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-3l-2.5-3z" />
                    <path d="M8 19l1.2-3.4A2 2 0 0 1 11.1 14h1.8a2 2 0 0 1 1.9 1.6L16 19" />
                  </>
                ) : (
                  <>
                    <path d="M5 17h14l-1.6-5.2A3 3 0 0 0 14.5 9.6h-5A3 3 0 0 0 6.6 11.8L5 17z" />
                    <path d="M7 17v2M17 17v2" />
                    <path d="M9.5 13h5" />
                  </>
                )}
              </svg>
            </button>
          </div>
        )}

        {/* Mobile & tablet controls: separated strictly between Movement/Driving and Free Camera */}
        {cameraMode === 'free' ? (
          <div
            className="touch-controls-layer items-end justify-between gap-2 pb-1"
            data-testid="freecam-touch-controls"
          >
            <div className="grid grid-cols-3 gap-1.5">
              <div />
              <HoldButton
                label="Move Camera Forward"
                inputKey="moveForward"
                onInputChange={onFreeCamInputChange}
                className="h-12 w-12 rounded-xl border-sky-300/40 bg-[rgba(22,28,36,0.85)] text-white active:bg-[#2563eb]"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m18 15-6-6-6 6" />
                </svg>
              </HoldButton>
              <div />
              <HoldButton
                label="Move Camera Left"
                inputKey="moveLeft"
                onInputChange={onFreeCamInputChange}
                className="h-12 w-12 rounded-xl border-sky-300/40 bg-[rgba(22,28,36,0.85)] text-white active:bg-[#2563eb]"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </HoldButton>
              <HoldButton
                label="Move Camera Backward"
                inputKey="moveBackward"
                onInputChange={onFreeCamInputChange}
                className="h-12 w-12 rounded-xl border-sky-300/40 bg-[rgba(22,28,36,0.85)] text-white active:bg-[#2563eb]"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </HoldButton>
              <HoldButton
                label="Move Camera Right"
                inputKey="moveRight"
                onInputChange={onFreeCamInputChange}
                className="h-12 w-12 rounded-xl border-sky-300/40 bg-[rgba(22,28,36,0.85)] text-white active:bg-[#2563eb]"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </HoldButton>
            </div>

            <div className="flex flex-col gap-1.5">
              <HoldButton
                label="Rise Camera"
                inputKey="rise"
                onInputChange={onFreeCamInputChange}
                className="h-12 w-16 rounded-xl border-sky-300/45 bg-[rgba(29,95,214,0.86)] text-white active:bg-[#2972f5]"
              >
                <div className="flex flex-col items-center leading-none">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m18 15-6-6-6 6" />
                  </svg>
                  <span className="text-[10px] font-bold uppercase tracking-wider">Up</span>
                </div>
              </HoldButton>
              <HoldButton
                label="Descend Camera"
                inputKey="descend"
                onInputChange={onFreeCamInputChange}
                className="h-12 w-16 rounded-xl border-sky-300/45 bg-[rgba(22,28,36,0.85)] text-white active:bg-[#2a3442]"
              >
                <div className="flex flex-col items-center leading-none">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                  <span className="text-[10px] font-bold uppercase tracking-wider">Down</span>
                </div>
              </HoldButton>
            </div>
          </div>
        ) : (
          <div
            className="touch-controls-layer items-end justify-between gap-2 pb-1"
            data-testid="kart-touch-controls"
          >
            <div className="flex items-center gap-2 sm:gap-3">
              <HoldButton
                label={isWalking ? 'Turn Left' : 'Steer Left'}
                inputKey="steerLeft"
                onInputChange={onKartInputChange}
                className="h-14 w-14 sm:h-20 sm:w-20 border-white/30 bg-[rgba(22,28,36,0.82)] text-white active:bg-[#2a3442]"
              >
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </HoldButton>
              <HoldButton
                label={isWalking ? 'Turn Right' : 'Steer Right'}
                inputKey="steerRight"
                onInputChange={onKartInputChange}
                className="h-14 w-14 sm:h-20 sm:w-20 border-white/30 bg-[rgba(22,28,36,0.82)] text-white active:bg-[#2a3442]"
              >
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </HoldButton>
            </div>

            <div className="flex items-end gap-2 sm:gap-3">
              <HoldButton
                label={isWalking ? 'Sprint' : 'Handbrake Drift'}
                inputKey={isWalking ? 'sprint' : 'drift'}
                onInputChange={onKartInputChange}
                className={`h-14 w-14 sm:h-16 sm:w-16 text-white ${
                  isWalking
                    ? 'border-sky-300/45 bg-[rgba(2,132,199,0.86)] active:bg-[#0ea5e9]'
                    : 'border-amber-300/55 bg-[rgba(217,119,6,0.88)] active:bg-[#f59e0b]'
                }`}
              >
                <div className="flex flex-col items-center leading-tight">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {isWalking ? (
                      <>
                        <circle cx="13.5" cy="4.5" r="1.8" />
                        <path d="M7 20l3-6 2.5-2.5L11 7l3 2 2.5 3" />
                        <path d="M5.5 12.5 7 20" opacity="0" />
                        <path d="M4 20l3-7 3.5-2" />
                      </>
                    ) : (
                      <>
                        <path d="M3 14h4l2-4 3 7 2.5-5H21" />
                        <path d="M4 20h16" opacity="0.5" />
                      </>
                    )}
                  </svg>
                </div>
              </HoldButton>
              <HoldButton
                label={isWalking ? 'Walk Backward' : 'Brake or Reverse'}
                inputKey="brakeReverse"
                onInputChange={onKartInputChange}
                className="h-14 w-14 sm:h-20 sm:w-20 border-amber-300/40 bg-[rgba(184,50,39,0.88)] text-white active:bg-[#d63e32]"
              >
                <div className="flex flex-col items-center">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>
              </HoldButton>
              <HoldButton
                label={isWalking ? 'Walk Forward' : 'Accelerate'}
                inputKey="accelerate"
                onInputChange={onKartInputChange}
                className="h-14 w-14 sm:h-20 sm:w-20 border-emerald-300/45 bg-[rgba(32,139,58,0.9)] text-white active:bg-[#29a848]"
              >
                <div className="flex flex-col items-center">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m18 15-6-6-6 6" />
                  </svg>
                </div>
              </HoldButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
