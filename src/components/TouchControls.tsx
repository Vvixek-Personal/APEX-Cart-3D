import type { PointerEvent as ReactPointerEvent } from 'react';
import { useRef } from 'react';
import type { KartInputState } from '../kart/kartPhysics';

export type CameraMode = 'spectator' | 'follow';

interface TouchControlsProps {
  cameraMode: CameraMode;
  onToggleCamera: () => void;
  onInputChange: (key: keyof KartInputState, pressed: boolean) => void;
}

interface HoldButtonProps {
  label: string;
  inputKey: keyof KartInputState;
  onInputChange: (key: keyof KartInputState, pressed: boolean) => void;
  className: string;
  children: React.ReactNode;
}

function HoldButton({
  label,
  inputKey,
  onInputChange,
  className,
  children,
}: HoldButtonProps) {
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
  onToggleCamera,
  onInputChange,
}: TouchControlsProps) {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-4 sm:p-5"
      style={{ touchAction: 'none' }}
    >
      {/* Top bar: unobtrusive camera toggle button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onToggleCamera}
          aria-label="Toggle camera view"
          style={{ touchAction: 'none' }}
          className="pointer-events-auto select-none flex items-center gap-2 rounded-xl border border-white/25 bg-[#161c24]/80 px-3.5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-[#1e2631]/90 active:scale-95 transition-transform duration-75"
        >
          <svg
            width="18"
            height="18"
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
          <span>{cameraMode === 'spectator' ? 'Follow Kart' : 'Full Track'}</span>
          <span className="hidden lg:inline-block rounded bg-white/15 px-1.5 py-0.5 text-xs font-bold tracking-wide text-white/90">
            C
          </span>
        </button>
      </div>

      {/* Phone & tablet large touch-and-hold controls */}
      <div className="touch-controls-layer items-end justify-between gap-2 pb-1">
        {/* Left: Steering buttons */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <HoldButton
            label="Steer Left"
            inputKey="steerLeft"
            onInputChange={onInputChange}
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
            onInputChange={onInputChange}
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
            onInputChange={onInputChange}
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
            onInputChange={onInputChange}
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
    </div>
  );
}
