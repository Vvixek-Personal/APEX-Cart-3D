import type { PointerEvent as ReactPointerEvent } from 'react';
import type { RaceState } from '../game/raceRules';

interface RaceHUDProps {
  raceState: RaceState;
  onRestart: () => void;
}

function formatTime(seconds: number): string {
  if (seconds < 0 || isNaN(seconds)) return '00:00.00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const centi = Math.floor((seconds % 1) * 100);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(mins)}:${pad(secs)}.${pad(centi)}`;
}

export function RaceHUD({ raceState, onRestart }: RaceHUDProps) {
  const stopPointer = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
  };

  const countdownVal = Math.ceil(raceState.countdownSeconds);
  const countdownText =
    countdownVal > 3
      ? 'READY'
      : countdownVal === 3
        ? '3'
        : countdownVal === 2
          ? '2'
          : countdownVal === 1
            ? '1'
            : 'GO!';

  return (
    <>
      {/* Countdown overlay */}
      {raceState.status === 'countdown' && (
        <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center">
          <div className="flex flex-col items-center animate-pulse">
            <span className="text-7xl sm:text-9xl font-black tracking-tighter text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.8)]">
              {countdownText}
            </span>
            <span className="mt-2 text-lg sm:text-2xl font-bold uppercase tracking-widest text-sky-200 drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)]">
              {countdownVal > 0 ? 'Prepare for Apex Grand Prix' : 'Race Started!'}
            </span>
          </div>
        </div>
      )}

      {/* Compact Top-Left Race HUD Card */}
      <div className="pointer-events-none fixed top-4 left-4 z-20 flex flex-col gap-1.5 rounded-2xl border border-white/20 bg-[#161c24]/85 p-3.5 text-white shadow-xl backdrop-blur-md sm:min-w-[220px]">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-sky-400">
            Apex Grand Prix
          </span>
          <span className="rounded bg-sky-500/20 px-2 py-0.5 text-xs font-extrabold tracking-wide text-sky-200">
            Lap {Math.min(raceState.lap, raceState.maxLaps)}/{raceState.maxLaps}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs pt-1">
          <span className="text-white/70">Checkpoint:</span>
          <span className="font-bold text-right text-emerald-300">
            {raceState.currentCheckpointIndex}/{raceState.totalCheckpoints}
          </span>

          <span className="text-white/70">Time:</span>
          <span className="font-mono font-bold text-right text-white">
            {formatTime(raceState.elapsedTime)}
          </span>

          <span className="text-white/70">Best Lap:</span>
          <span className="font-mono font-bold text-right text-amber-300">
            {raceState.bestLapTime !== null ? formatTime(raceState.bestLapTime) : '--:--.--'}
          </span>
        </div>
      </div>

      {/* Race Finished Modal */}
      {raceState.isFinished && (
        <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="flex w-full max-w-md flex-col items-center rounded-3xl border border-white/25 bg-[#161c24]/95 p-6 sm:p-8 text-center text-white shadow-2xl">
            <span className="text-xs font-bold uppercase tracking-widest text-amber-400">
              Grand Prix Completed
            </span>
            <h2 className="mt-1 text-3xl sm:text-4xl font-black tracking-tight text-white">
              Race Finished!
            </h2>

            <div className="my-6 w-full rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex justify-between py-1.5 border-b border-white/10 text-sm">
                <span className="text-white/70">Total Race Time</span>
                <span className="font-mono font-bold text-sky-300">
                  {formatTime(raceState.finalTime ?? raceState.elapsedTime)}
                </span>
              </div>
              <div className="flex justify-between py-1.5 text-sm">
                <span className="text-white/70">Best Lap Time</span>
                <span className="font-mono font-bold text-amber-300">
                  {raceState.bestLapTime !== null ? formatTime(raceState.bestLapTime) : '--:--.--'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onRestart}
              onPointerDown={stopPointer}
              aria-label="Restart race"
              className="w-full rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 py-3.5 text-base font-extrabold text-white shadow-lg shadow-emerald-900/40 hover:from-emerald-500 hover:to-emerald-400 active:scale-95 transition-transform duration-75"
            >
              Restart Race
            </button>
          </div>
        </div>
      )}
    </>
  );
}
