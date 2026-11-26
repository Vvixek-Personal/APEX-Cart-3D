import type { PointerEvent as ReactPointerEvent } from 'react';
import type { RaceState } from '../game/raceRules';
import type { PlayerHudInfo } from './TouchControls';

interface RaceHUDProps {
  raceState: RaceState;
  playerInfo: PlayerHudInfo;
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

export function RaceHUD({ raceState, playerInfo, onRestart }: RaceHUDProps) {
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

  const speedKmh = Math.round(Math.abs(playerInfo.speedUnits) * 3.6);

  return (
    <>
      {/* Countdown overlay (only triggers after entering Stadium Gate in a vehicle) */}
      {raceState.status === 'countdown' && (
        <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center">
          <div className="flex flex-col items-center">
            <span className="text-7xl sm:text-9xl font-black tracking-tighter text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.85)]">
              {countdownText}
            </span>
            <span className="mt-2 text-lg sm:text-2xl font-bold uppercase tracking-widest text-sky-200 drop-shadow-[0_4px_12px_rgba(0,0,0,0.7)]">
              {countdownVal > 0 ? 'Stadium Race Starting' : 'Go!'}
            </span>
          </div>
        </div>
      )}

      {/* Compact Top-Left HUD Card (rgba fill, zero backdrop-blur for fast WebGL compositing) */}
      <div
        data-testid="race-hud"
        className="pointer-events-none fixed top-13 left-2.5 right-2.5 z-20 flex flex-col gap-1 rounded-2xl border border-white/20 bg-[rgba(22,28,36,0.88)] p-2.5 text-white shadow-xl sm:top-4 sm:left-4 sm:right-auto sm:min-w-[240px] sm:max-w-[330px] sm:gap-1.5 sm:p-3.5"
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-sky-400">
            {raceState.status === 'waiting' ? 'Town District' : 'Apex Grand Prix'}
          </span>
          {raceState.status === 'waiting' ? (
            <span className="text-xs font-bold tracking-wide text-emerald-300 tabular-nums">
              {playerInfo.mode === 'driving'
                ? `${playerInfo.activeVehicleName ?? 'Vehicle'} · ${speedKmh} km/h`
                : 'On Foot · Free Roam'}
            </span>
          ) : (
            <span className="text-xs font-extrabold tracking-wide text-sky-200 tabular-nums">
              Lap {Math.min(raceState.lap, raceState.maxLaps)}/{raceState.maxLaps} · {speedKmh} km/h
            </span>
          )}
        </div>

        {raceState.status === 'waiting' ? (
          <div className="pt-0.5 text-xs leading-snug text-white/85">
            {playerInfo.mode === 'walking' ? (
              playerInfo.nearbyVehicleName ? (
                <span>
                  Beside <strong className="text-sky-300">{playerInfo.nearbyVehicleName}</strong>
                  {' · '}
                  {playerInfo.nearbyVehicleTagline}. Press <strong className="text-white">E</strong> to drive.
                </span>
              ) : (
                <span>
                  Walk up to the Mega Kart or any parked car &amp; press <strong className="text-white">E</strong> to drive.
                </span>
              )
            ) : (
              <span>
                Driving <strong className="text-emerald-300">{playerInfo.activeVehicleName}</strong>. Head north through the Stadium Gate to race!
              </span>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs pt-1 tabular-nums">
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
        )}
      </div>

      {/* Race Finished Modal */}
      {raceState.isFinished && (
        <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-[rgba(8,12,18,0.78)] p-4">
          <div className="flex w-full max-w-md flex-col items-center rounded-3xl border border-white/25 bg-[rgba(22,28,36,0.96)] p-6 sm:p-8 text-center text-white shadow-2xl">
            <span className="text-xs font-bold uppercase tracking-widest text-amber-400">
              Grand Prix Completed
            </span>
            <h2 className="mt-1 text-3xl sm:text-4xl font-black tracking-tight text-white">
              Race Finished!
            </h2>

            <div className="my-6 w-full rounded-2xl border border-white/10 bg-white/5 p-4 tabular-nums">
              <div className="flex justify-between py-1.5 border-b border-white/10 text-sm">
                <span className="text-white/70">Vehicle</span>
                <span className="font-bold text-emerald-300">
                  {playerInfo.activeVehicleName ?? 'Apex Mega Kart'}
                </span>
              </div>
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
              className="w-full rounded-2xl bg-emerald-600 py-3.5 text-base font-extrabold text-white shadow-lg hover:bg-emerald-500 active:scale-95 transition-transform duration-75"
            >
              Return to Town
            </button>
          </div>
        </div>
      )}
    </>
  );
}
