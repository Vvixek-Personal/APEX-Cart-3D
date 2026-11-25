import type { PointerEvent as ReactPointerEvent } from 'react';
import { useRef } from 'react';
import type { FreeCameraInputState } from '../camera/freeCamera';
import type { KartInputState } from '../kart/kartPhysics';

export type CameraMode = 'spectator' | 'follow' | 'free';

interface TouchControlsProps {
  cameraMode: CameraMode;
  onToggleFollow: () => void;
  onToggleFreeCam: () => void;
  onResetSpectator: () => void;
  onKartInputChange: (key: keyof KartInputState, pressed: boolean) => void;
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

export function TouchControls({
  cameraMode,
  onToggleFollow,
  onToggleFreeCam,
  onResetSpectator,
  onKartInputChange,
  onFreeCamInputChange,
}: TouchControlsProps) {
  const stopCanvasPointer = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
  };

  return (
    <div
      className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-3 sm:p-5"
      style={{ touchAction: 'none' }}
    >
      {/* Top bar: unobtrusive camera mode & reset controls */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {cameraMode === 'free' && (
          <button
            type="button"
            onClick={onResetSpectator}
            onPointerDown={stopCanvasPointer}
            aria-label="Return to default spectator view"
            style={{ touchAction: 'none' }}
            className="pointer-events-auto select-none flex items-center gap-1.5 rounded-xl border border-white/25 bg-[#161c24]/82 px-3 py-2 text-xs sm:text-sm font-semibold text-white shadow-md hover:bg-[#1e2631]/90 active:scale-95 transition-transform duration-75"
          >
            <span>Reset View</span>
            <span className="hidden lg:inline-block rounded bg-white/15 px-1.5 py-0.5 text-xs font-bold tracking-wide text-white/90">
              Home
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={onToggleFreeCam}
          onPointerDown={stopCanvasPointer}
          aria-label="Toggle free camera"
          aria-pressed={cameraMode === 'free'}
          style={{ touchAction: 'none' }}
          className={`pointer-events-auto select-none flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs sm:text-sm font-semibold text-white shadow-md active:scale-95 transition-transform duration-75 ${
            cameraMode === 'free'
              ? 'border-sky-300/65 bg-[#1d5fd6]/90 hover:bg-[#246ae6]/95'
              : 'border-white/25 bg-[#161c24]/80 hover:bg-[#1e2631]/90'
          }`}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 9l-3 3 3 3" />
            <path d="M9 5l3-3 3 3" />
            <path d="M15 19l-3 3-3-3" />
            <path d="M19 9l3 3-3 3" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <line x1="12" y1="2" x2="12" y2="22" />
          </svg>
          <span>{cameraMode === 'free' ? 'Free Cam On' : 'Free Cam'}</span>
          <span className="hidden lg:inline-block rounded bg-white/15 px-1.5 py-0.5 text-xs font-bold tracking-wide text-white/90">
            V
          </span>
        </button>

        <button
          type="button"
          onClick={onToggleFollow}
          onPointerDown={stopCanvasPointer}
          aria-label="Toggle camera view"
          style={{ touchAction: 'none' }}
          className={`pointer-events-auto select-none flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs sm:text-sm font-semibold text-white shadow-md active:scale-95 transition-transform duration-75 ${
            cameraMode === 'follow'
              ? 'border-emerald-300/65 bg-[#1a7f37]/90 hover:bg-[#1f9441]/95'
              : 'border-white/25 bg-[#161c24]/80 hover:bg-[#1e2631]/90'
          }`}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
            <circle cx="12" cy="13" r="3" />
          </svg>
          <span>{cameraMode === 'follow' ? 'Full Track' : 'Follow Kart'}</span>
          <span className="hidden lg:inline-block rounded bg-white/15 px-1.5 py-0.5 text-xs font-bold tracking-wide text-white/90">
            C
          </span>
        </button>
      </div>

      {/* Desktop compact Free-Cam shortcut bar (bottom center, non-interactive) */}
      {cameraMode === 'free' && (
        <div className="hidden lg:flex justify-center pb-1">
          <div className="rounded-lg border border-white/15 bg-[#161c24]/75 px-3.5 py-1.5 text-xs font-medium text-white/90 shadow">
            WASD/Arrows: Move &middot; R/F: Height &middot; Right-Drag: Look &middot; Mid-Drag: Pan &middot; Wheel: Dolly &middot; Shift/Ctrl: Speed &middot; Home: Reset
          </div>
        </div>
      )}

      {/* Mobile & tablet controls: separated strictly between Kart Driving and Free Camera */}
      {cameraMode === 'free' ? (
        <div
          className="touch-controls-layer items-end justify-between gap-2 pb-1"
          data-testid="freecam-touch-controls"
        >
          {/* Compact XZ ground-plane movement pad */}
          <div className="grid grid-cols-3 gap-1.5">
            <div />
            <HoldButton
              label="Move Camera Forward"
              inputKey="moveForward"
              onInputChange={onFreeCamInputChange}
              className="h-12 w-12 rounded-xl border-sky-300/40 bg-[#161c24]/82 text-white active:bg-[#2563eb]"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m18 15-6-6-6 6" />
              </svg>
            </HoldButton>
            <div />
            <HoldButton
              label="Move Camera Left"
              inputKey="moveLeft"
              onInputChange={onFreeCamInputChange}
              className="h-12 w-12 rounded-xl border-sky-300/40 bg-[#161c24]/82 text-white active:bg-[#2563eb]"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
            </HoldButton>
            <HoldButton
              label="Move Camera Backward"
              inputKey="moveBackward"
              onInputChange={onFreeCamInputChange}
              className="h-12 w-12 rounded-xl border-sky-300/40 bg-[#161c24]/82 text-white active:bg-[#2563eb]"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </HoldButton>
            <HoldButton
              label="Move Camera Right"
              inputKey="moveRight"
              onInputChange={onFreeCamInputChange}
              className="h-12 w-12 rounded-xl border-sky-300/40 bg-[#161c24]/82 text-white active:bg-[#2563eb]"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </HoldButton>
          </div>

          {/* Compact Y-axis rise/descend controls */}
          <div className="flex flex-col gap-1.5">
            <HoldButton
              label="Rise Camera"
              inputKey="rise"
              onInputChange={onFreeCamInputChange}
              className="h-12 w-16 rounded-xl border-sky-300/45 bg-[#1d5fd6]/82 text-white active:bg-[#2972f5]"
            >
              <div className="flex flex-col items-center leading-none">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m18 15-6-6-6 6" />
                </svg>
                <span className="text-[10px] font-bold uppercase tracking-wider">Up</span>
              </div>
            </HoldButton>
            <HoldButton
              label="Descend Camera"
              inputKey="descend"
              onInputChange={onFreeCamInputChange}
              className="h-12 w-16 rounded-xl border-sky-300/45 bg-[#161c24]/82 text-white active:bg-[#2a3442]"
            >
              <div className="flex flex-col items-center leading-none">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
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
          {/* Left: Kart steering buttons */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            <HoldButton
              label="Steer Left"
              inputKey="steerLeft"
              onInputChange={onKartInputChange}
              className="h-16 w-16 sm:h-22 sm:w-22 border-white/30 bg-[#161c24]/78 text-white active:bg-[#2a3442]"
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
            </HoldButton>
            <HoldButton
              label="Steer Right"
              inputKey="steerRight"
              onInputChange={onKartInputChange}
              className="h-16 w-16 sm:h-22 sm:w-22 border-white/30 bg-[#161c24]/78 text-white active:bg-[#2a3442]"
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </HoldButton>
          </div>

          {/* Right: Brake/Reverse and Accelerate buttons */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            <HoldButton
              label="Brake or Reverse"
              inputKey="brakeReverse"
              onInputChange={onKartInputChange}
              className="h-16 w-16 sm:h-22 sm:w-22 border-amber-300/40 bg-[#b83227]/85 text-white active:bg-[#d63e32]"
            >
              <div className="flex flex-col items-center">
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  Brake
                </span>
              </div>
            </HoldButton>
            <HoldButton
              label="Accelerate"
              inputKey="accelerate"
              onInputChange={onKartInputChange}
              className="h-16 w-16 sm:h-22 sm:w-22 border-emerald-300/45 bg-[#208b3a]/88 text-white active:bg-[#29a848]"
            >
              <div className="flex flex-col items-center">
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m18 15-6-6-6 6" />
                </svg>
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  Gas
                </span>
              </div>
            </HoldButton>
          </div>
        </div>
      )}
    </div>
  );
}
