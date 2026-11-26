import type { PointerEvent as ReactPointerEvent } from 'react';
import { useRef } from 'react';
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
  { id: 'cockpit', label: '1st Person', shortLabel: '1st POV' },
  { id: 'hood', label: 'Hood / Action', shortLabel: 'Hood' },
  { id: 'wide', label: 'Wide', shortLabel: 'Wide' },
];

export interface PlayerHudInfo {
  mode: PlayerControlMode;
  activeVehicleId: string | null;
  activeVehicleName: string | null;
  activeVehicleTagline: string | null;
  nearbyVehicleId: string | null;
  nearbyVehicleName: string | null;
  nearbyVehicleTagline: string | null;
  speedUnits: number;
}

interface TouchControlsProps {
  cameraMode: CameraMode;
  perspective: FollowPerspective;
  playerInfo: PlayerHudInfo;
  onSelectPerspective: (perspective: FollowPerspective) => void;
  onCyclePerspective: () => void;
  onToggleFollow: () => void;
  onToggleFreeCam: () => void;
  onResetSpectator: () => void;
  onVehicleInteract: () => void;
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
  perspective,
  playerInfo,
  onSelectPerspective,
  onCyclePerspective,
  onToggleFollow,
  onToggleFreeCam,
  onResetSpectator,
  onVehicleInteract,
  onKartInputChange,
  onFreeCamInputChange,
}: TouchControlsProps) {
  const stopCanvasPointer = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
  };

  const currentPerspectiveMeta =
    PERSPECTIVE_OPTIONS.find((opt) => opt.id === perspective) ?? PERSPECTIVE_OPTIONS[0];

  const isWalking = playerInfo.mode === 'walking';
  const canInteractVehicle =
    playerInfo.mode === 'driving' || playerInfo.nearbyVehicleName !== null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-2.5 sm:p-5"
      style={{ touchAction: 'none' }}
    >
      {/* Top bar: perspective selector + camera mode & reset controls (single compact row on mobile) */}
      <div className="flex items-center justify-end gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar">
        {/* Desktop segmented perspective switcher */}
        <div
          role="group"
          aria-label="Camera perspective"
          className="pointer-events-auto hidden md:flex items-center rounded-xl border border-white/20 bg-[rgba(22,28,36,0.86)] p-1 shadow-md"
        >
          {PERSPECTIVE_OPTIONS.map((opt, idx) => {
            const active = cameraMode === 'follow' && perspective === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onSelectPerspective(opt.id)}
                onPointerDown={stopCanvasPointer}
                aria-label={`Perspective ${opt.label}`}
                aria-pressed={active}
                className={`whitespace-nowrap shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                  active
                    ? 'bg-sky-500 text-white shadow'
                    : 'text-white/80 hover:bg-white/10 hover:text-white'
                }`}
              >
                {opt.label}
                <span className="ml-1 hidden xl:inline text-[10px] opacity-70">{idx + 1}</span>
              </button>
            );
          })}
        </div>

        {/* Mobile/tablet compact perspective cycle button */}
        <button
          type="button"
          onClick={onCyclePerspective}
          onPointerDown={stopCanvasPointer}
          aria-label="Cycle camera perspective"
          data-testid="cycle-perspective-btn"
          style={{ touchAction: 'none' }}
          className={`pointer-events-auto md:hidden whitespace-nowrap shrink-0 select-none flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-semibold text-white shadow-md active:scale-95 transition-transform duration-75 ${
            cameraMode === 'follow'
              ? 'border-sky-300/60 bg-[rgba(14,116,144,0.9)]'
              : 'border-white/25 bg-[rgba(22,28,36,0.84)]'
          }`}
        >
          <span>POV: {currentPerspectiveMeta.shortLabel}</span>
        </button>

        {cameraMode === 'free' && (
          <button
            type="button"
            onClick={onResetSpectator}
            onPointerDown={stopCanvasPointer}
            aria-label="Return to default spectator view"
            style={{ touchAction: 'none' }}
            className="pointer-events-auto whitespace-nowrap shrink-0 select-none flex items-center gap-1.5 rounded-xl border border-white/25 bg-[rgba(22,28,36,0.84)] px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm font-semibold text-white shadow-md hover:bg-[rgba(30,38,49,0.92)] active:scale-95 transition-transform duration-75"
          >
            <span>Reset</span>
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
          className={`pointer-events-auto whitespace-nowrap shrink-0 select-none flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm font-semibold text-white shadow-md active:scale-95 transition-transform duration-75 ${
            cameraMode === 'free'
              ? 'border-sky-300/65 bg-[rgba(29,95,214,0.92)] hover:bg-[rgba(36,106,230,0.96)]'
              : 'border-white/25 bg-[rgba(22,28,36,0.84)] hover:bg-[rgba(30,38,49,0.92)]'
          }`}
        >
          <svg
            width="15"
            height="15"
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
          <span>{cameraMode === 'free' ? 'Free On' : 'Free Cam'}</span>
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
          className={`pointer-events-auto whitespace-nowrap shrink-0 select-none flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm font-semibold text-white shadow-md active:scale-95 transition-transform duration-75 ${
            cameraMode === 'follow'
              ? 'border-emerald-300/65 bg-[rgba(26,127,55,0.92)] hover:bg-[rgba(31,148,65,0.96)]'
              : 'border-white/25 bg-[rgba(22,28,36,0.84)] hover:bg-[rgba(30,38,49,0.92)]'
          }`}
        >
          <svg
            width="15"
            height="15"
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
          <span>{cameraMode === 'follow' ? 'Aerial' : 'Follow'}</span>
          <span className="hidden lg:inline-block rounded bg-white/15 px-1.5 py-0.5 text-xs font-bold tracking-wide text-white/90">
            C
          </span>
        </button>
      </div>

      {/* Bottom area: Interactive Enter/Exit Vehicle prompt + Desktop Hint + Mobile Touch Pads */}
      <div className="flex flex-col gap-2">
        {/* Contextual Enter / Exit Vehicle button (desktop + mobile) */}
        {cameraMode !== 'free' && canInteractVehicle && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={onVehicleInteract}
              onPointerDown={stopCanvasPointer}
              data-testid="vehicle-interact-btn"
              style={{ touchAction: 'none' }}
              className={`pointer-events-auto whitespace-nowrap shrink-0 select-none flex items-center gap-2 rounded-2xl border px-4 py-2 text-xs sm:text-sm font-extrabold text-white shadow-xl active:scale-95 transition-transform duration-75 ${
                playerInfo.mode === 'driving'
                  ? 'border-amber-300/60 bg-[rgba(180,83,9,0.92)] hover:bg-[rgba(217,119,6,0.95)]'
                  : 'border-sky-300/70 bg-[rgba(2,132,199,0.94)] hover:bg-[rgba(14,165,233,0.98)]'
              }`}
            >
              <span>
                {playerInfo.mode === 'driving'
                  ? `Exit ${playerInfo.activeVehicleName ?? 'Vehicle'}`
                  : `Drive ${playerInfo.nearbyVehicleName}`}
              </span>
              <span className="hidden lg:inline-block rounded bg-black/30 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white">
                E
              </span>
            </button>
          </div>
        )}

        {/* Desktop compact control legend */}
        {cameraMode === 'free' ? (
          <div className="hidden lg:flex justify-center pb-1">
            <div className="rounded-lg border border-white/15 bg-[rgba(22,28,36,0.8)] px-3.5 py-1.5 text-xs font-medium text-white/90 shadow">
              WASD/Arrows: Move &middot; R/F: Height &middot; Right-Drag: Look &middot; Mid-Drag: Pan &middot; Wheel: Dolly &middot; Shift/Ctrl: Speed &middot; Home: Reset
            </div>
          </div>
        ) : (
          <div className="hidden lg:flex justify-center pb-1">
            <div className="rounded-lg border border-white/15 bg-[rgba(22,28,36,0.78)] px-3.5 py-1.5 text-xs font-medium text-white/90 shadow">
              {isWalking
                ? 'WASD/Arrows: Walk & Turn · Shift: Sprint · E: Drive Nearby Car · P or 1-4: Perspectives · C: Aerial · V: Free Cam'
                : 'WASD/Arrows: Drive · E: Exit Car · P or 1-4: Perspectives · C: Aerial · V: Free Cam'}
            </div>
          </div>
        )}

        {/* Mobile & tablet controls: separated strictly between Movement/Driving and Free Camera */}
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
                className="h-12 w-12 rounded-xl border-sky-300/40 bg-[rgba(22,28,36,0.85)] text-white active:bg-[#2563eb]"
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
                className="h-12 w-12 rounded-xl border-sky-300/40 bg-[rgba(22,28,36,0.85)] text-white active:bg-[#2563eb]"
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
                className="h-12 w-12 rounded-xl border-sky-300/40 bg-[rgba(22,28,36,0.85)] text-white active:bg-[#2563eb]"
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
                className="h-12 w-12 rounded-xl border-sky-300/40 bg-[rgba(22,28,36,0.85)] text-white active:bg-[#2563eb]"
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
                className="h-12 w-16 rounded-xl border-sky-300/45 bg-[rgba(29,95,214,0.86)] text-white active:bg-[#2972f5]"
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
                className="h-12 w-16 rounded-xl border-sky-300/45 bg-[rgba(22,28,36,0.85)] text-white active:bg-[#2a3442]"
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
            {/* Left: Steering / Turning buttons */}
            <div className="flex items-center gap-2.5 sm:gap-3">
              <HoldButton
                label={isWalking ? 'Turn Left' : 'Steer Left'}
                inputKey="steerLeft"
                onInputChange={onKartInputChange}
                className="h-15 w-15 sm:h-20 sm:w-20 border-white/30 bg-[rgba(22,28,36,0.82)] text-white active:bg-[#2a3442]"
              >
                <svg
                  width="30"
                  height="30"
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
                label={isWalking ? 'Turn Right' : 'Steer Right'}
                inputKey="steerRight"
                onInputChange={onKartInputChange}
                className="h-15 w-15 sm:h-20 sm:w-20 border-white/30 bg-[rgba(22,28,36,0.82)] text-white active:bg-[#2a3442]"
              >
                <svg
                  width="30"
                  height="30"
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

            {/* Right: Back/Brake & Walk/Gas buttons */}
            <div className="flex items-center gap-2.5 sm:gap-3">
              <HoldButton
                label={isWalking ? 'Walk Backward' : 'Brake or Reverse'}
                inputKey="brakeReverse"
                onInputChange={onKartInputChange}
                className="h-15 w-15 sm:h-20 sm:w-20 border-amber-300/40 bg-[rgba(184,50,39,0.88)] text-white active:bg-[#d63e32]"
              >
                <div className="flex flex-col items-center">
                  <svg
                    width="24"
                    height="24"
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
                    {isWalking ? 'Back' : 'Brake'}
                  </span>
                </div>
              </HoldButton>
              <HoldButton
                label={isWalking ? 'Walk Forward' : 'Accelerate'}
                inputKey="accelerate"
                onInputChange={onKartInputChange}
                className="h-15 w-15 sm:h-20 sm:w-20 border-emerald-300/45 bg-[rgba(32,139,58,0.9)] text-white active:bg-[#29a848]"
              >
                <div className="flex flex-col items-center">
                  <svg
                    width="24"
                    height="24"
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
                    {isWalking ? 'Walk' : 'Gas'}
                  </span>
                </div>
              </HoldButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
