import type { PointerEvent as ReactPointerEvent } from 'react';
import type { RaceState } from '../game/raceRules';
import { createTrackCurve } from '../track/trackLayout';
import type { PlayerHudInfo } from './TouchControls';

interface RaceHUDProps {
  raceState: RaceState;
  playerInfo: PlayerHudInfo;
  onRestart: () => void;
}

// Precompute compact SVG minimap geometry once at module load (world X in [-115..115], Z in [-110..365])
const MINIMAP_W = 84;
const MINIMAP_H = 112;
const WORLD_X_MIN = -115;
const WORLD_X_SPAN = 230;
const WORLD_Z_MIN = -112;
const WORLD_Z_SPAN = 480;

function worldToMapX(wx: number): number {
  const clamped = Math.max(WORLD_X_MIN, Math.min(WORLD_X_MIN + WORLD_X_SPAN, wx));
  return ((clamped - WORLD_X_MIN) / WORLD_X_SPAN) * (MINIMAP_W - 10) + 5;
}

function worldToMapY(wz: number): number {
  const clamped = Math.max(WORLD_Z_MIN, Math.min(WORLD_Z_MIN + WORLD_Z_SPAN, wz));
  return ((clamped - WORLD_Z_MIN) / WORLD_Z_SPAN) * (MINIMAP_H - 10) + 5;
}

interface MinimapStaticData {
  trackPath: string;
  checkpointCoords: ReadonlyArray<{ x: number; y: number }>;
  finishCoord: { x: number; y: number };
}

const MINIMAP_STATIC: MinimapStaticData = (() => {
  const curve = createTrackCurve();
  const pts: string[] = [];
  const samples = 64;
  for (let i = 0; i < samples; i++) {
    const p = curve.getPointAt(i / samples);
    const mx = worldToMapX(p.x).toFixed(1);
    const my = worldToMapY(p.z).toFixed(1);
    pts.push(`${i === 0 ? 'M' : 'L'}${mx} ${my}`);
  }
  pts.push('Z');

  // Match the 6 evenly-spaced race checkpoints + finish strip
  const checkpointCoords: Array<{ x: number; y: number }> = [];
  const totalCheckpoints = 6;
  const finishU = 0.04; // approximate top-right finish straight u
  for (let i = 0; i < totalCheckpoints; i++) {
    const u = (finishU + ((i + 1) / (totalCheckpoints + 1))) % 1;
    const cp = curve.getPointAt(u);
    checkpointCoords.push({ x: worldToMapX(cp.x), y: worldToMapY(cp.z) });
  }
  const fp = curve.getPointAt(0.02);
  return {
    trackPath: pts.join(' '),
    checkpointCoords,
    finishCoord: { x: worldToMapX(fp.x), y: worldToMapY(fp.z) },
  };
})();

function formatTime(seconds: number): string {
  if (seconds < 0 || Number.isNaN(seconds)) return '00:00.00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const centi = Math.floor((seconds % 1) * 100);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(mins)}:${pad(secs)}.${pad(centi)}`;
}

const RPM_SEGMENTS = 14;

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
  const gear = playerInfo.gear ?? 1;
  const gearLabel =
    playerInfo.speedUnits < -0.5 || gear === 0
      ? 'R'
      : speedKmh < 2 && (playerInfo.rpmNorm ?? 0) < 0.28
        ? 'N'
        : String(gear);
  const rpmNorm = Math.max(0, Math.min(1, playerInfo.rpmNorm ?? 0));
  const activeRpmBars = Math.round(rpmNorm * RPM_SEGMENTS);
  const driftCharge = Math.max(0, Math.min(1, playerInfo.driftCharge ?? 0));
  const isBoostActive = (playerInfo.boostTimer ?? 0) > 0.02;

  const px = worldToMapX(playerInfo.posX ?? 0);
  const py = worldToMapY(playerInfo.posZ ?? 242);
  const headingDeg = (-((playerInfo.heading ?? 0) * 180) / Math.PI) + 180;

  const nextCpCoord =
    raceState.status === 'racing'
      ? raceState.currentCheckpointIndex < MINIMAP_STATIC.checkpointCoords.length
        ? MINIMAP_STATIC.checkpointCoords[raceState.currentCheckpointIndex]
        : MINIMAP_STATIC.finishCoord
      : null;

  return (
    <>
      {/* Wrong-Way High-Contrast Motorsport Warning */}
      {raceState.isWrongWay && raceState.status === 'racing' && (
        <div
          data-testid="wrong-way-banner"
          className="pointer-events-none fixed top-28 sm:top-20 inset-x-0 z-30 flex justify-center px-4"
        >
          <div className="flex items-center gap-2.5 rounded-2xl border-2 border-rose-400/90 bg-[rgba(153,27,27,0.94)] px-5 py-2 text-white shadow-2xl animate-pulse">
            <span className="text-base sm:text-xl font-black uppercase tracking-widest">
              Wrong Way! Turn Around
            </span>
          </div>
        </div>
      )}

      {/* Countdown overlay (triggers after entering Stadium Gate in a vehicle) */}
      {raceState.status === 'countdown' && (
        <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center">
          <div className="flex flex-col items-center">
            <span className="text-7xl sm:text-9xl font-black tracking-tighter text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.85)]">
              {countdownText}
            </span>
            <span className="mt-2 text-lg sm:text-2xl font-bold uppercase tracking-widest text-sky-200 drop-shadow-[0_4px_12px_rgba(0,0,0,0.7)]">
              {countdownVal > 0 ? 'Clockwise Grand Prix · Get Ready' : 'Green Flag — Go!'}
            </span>
          </div>
        </div>
      )}

      {/* Compact Top-Left HUD Card + Live Circuit Minimap */}
      <div
        data-testid="race-hud"
        className="pointer-events-none fixed top-13 left-2.5 right-2.5 z-20 flex items-stretch gap-2.5 rounded-2xl border border-white/20 bg-[rgba(18,24,32,0.9)] p-2.5 text-white shadow-xl sm:top-4 sm:left-4 sm:right-auto sm:min-w-[300px] sm:max-w-[395px] sm:p-3.5"
      >
        <div className="flex flex-1 flex-col justify-between gap-1 sm:gap-1.5 min-w-0">
          <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-sky-400 truncate">
              {raceState.status === 'waiting' ? 'Town District' : 'Apex Grand Prix'}
            </span>
            {raceState.status === 'waiting' ? (
              <span className="text-xs font-bold tracking-wide text-emerald-300 tabular-nums shrink-0">
                {playerInfo.mode === 'driving'
                  ? `${playerInfo.activeVehicleName ?? 'Vehicle'} · ${speedKmh} km/h`
                  : 'On Foot · Free Roam'}
              </span>
            ) : (
              <span className="text-xs font-extrabold tracking-wide text-sky-200 tabular-nums shrink-0">
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
                  Driving <strong className="text-emerald-300">{playerInfo.activeVehicleName}</strong>. Head north through the Stadium Gate (turn left onto circuit) to race!
                </span>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-1 pt-0.5">
              {playerInfo.mode === 'walking' && (
                <div className="rounded-lg bg-amber-500/20 border border-amber-400/40 px-2 py-1 text-[11px] font-semibold text-amber-200">
                  On foot — press <strong>E</strong> beside a vehicle to continue your lap!
                </div>
              )}
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs tabular-nums">
                <span className="text-white/70">Checkpoint:</span>
                <span className="font-bold text-right text-emerald-300">
                  {raceState.currentCheckpointIndex}/{raceState.totalCheckpoints}
                </span>

                <span className="text-white/70">Race Time:</span>
                <span className="font-mono font-bold text-right text-white">
                  {formatTime(raceState.elapsedTime)}
                </span>

                <span className="text-white/70">Last Lap:</span>
                <span className="font-mono font-bold text-right text-sky-300">
                  {raceState.lastLapTime !== null ? formatTime(raceState.lastLapTime) : '--:--.--'}
                </span>

                <span className="text-white/70">Best Lap:</span>
                <span className="font-mono font-bold text-right text-amber-300">
                  {raceState.bestLapTime !== null ? formatTime(raceState.bestLapTime) : '--:--.--'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Compact Live Circuit + Town Minimap */}
        <div
          data-testid="circuit-minimap"
          className="hidden xs:flex sm:flex shrink-0 items-center justify-center rounded-xl border border-white/15 bg-[rgba(10,15,22,0.85)] p-1"
        >
          <svg
            width={MINIMAP_W}
            height={MINIMAP_H}
            viewBox={`0 0 ${MINIMAP_W} ${MINIMAP_H}`}
            aria-label="Circuit and town minimap"
          >
            {/* Town district grid hint */}
            <rect
              x={worldToMapX(-95)}
              y={worldToMapY(215)}
              width={worldToMapX(95) - worldToMapX(-95)}
              height={worldToMapY(355) - worldToMapY(215)}
              rx="3"
              fill="rgba(148,163,184,0.12)"
              stroke="rgba(148,163,184,0.22)"
              strokeWidth="1"
            />
            {/* Main Avenue connector from South Gate to Town */}
            <line
              x1={worldToMapX(0)}
              y1={worldToMapY(92)}
              x2={worldToMapX(0)}
              y2={worldToMapY(355)}
              stroke="rgba(148,163,184,0.45)"
              strokeWidth="2.4"
            />
            {/* Sampled stadium asphalt loop */}
            <path
              d={MINIMAP_STATIC.trackPath}
              fill="none"
              stroke="rgba(226,232,240,0.68)"
              strokeWidth="3.2"
              strokeLinejoin="round"
            />
            {/* Finish line marker */}
            <circle
              cx={MINIMAP_STATIC.finishCoord.x}
              cy={MINIMAP_STATIC.finishCoord.y}
              r="2.6"
              fill="#f8fafc"
              stroke="#ef4444"
              strokeWidth="1.2"
            />
            {/* Active next-checkpoint target beacon */}
            {nextCpCoord && (
              <circle
                cx={nextCpCoord.x}
                cy={nextCpCoord.y}
                r="3.2"
                fill="#22d3ee"
                stroke="#083344"
                strokeWidth="1"
              />
            )}
            {/* Live player directional arrow */}
            <g transform={`translate(${px.toFixed(1)}, ${py.toFixed(1)}) rotate(${headingDeg.toFixed(1)})`}>
              <polygon
                points="0,-4.6 3.5,3.6 0,1.9 -3.5,3.6"
                fill="#10b981"
                stroke="#ffffff"
                strokeWidth="0.9"
              />
            </g>
          </svg>
        </div>
      </div>

      {/* Motorsport Digital Tachometer, Gear & Drift Telemetry Cluster (Driving Mode) */}
      {playerInfo.mode === 'driving' && !raceState.isFinished && (
        <div
          data-testid="telemetry-cluster"
          className="pointer-events-none hidden sm:flex fixed bottom-14 right-5 z-20 flex-col gap-1.5 rounded-2xl border border-white/20 bg-[rgba(16,22,30,0.9)] px-4 py-3 text-white shadow-2xl min-w-[215px]"
        >
          {/* Segmented LED RPM bar */}
          <div className="flex items-center gap-1" aria-hidden="true">
            {Array.from({ length: RPM_SEGMENTS }).map((_, i) => {
              const lit = i < activeRpmBars;
              const segColor =
                i >= 11
                  ? lit
                    ? 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.8)]'
                    : 'bg-white/10'
                  : i >= 7
                    ? lit
                      ? 'bg-amber-400'
                      : 'bg-white/10'
                    : lit
                      ? 'bg-emerald-400'
                      : 'bg-white/10';
              return <span key={i} className={`h-2 flex-1 rounded-xs ${segColor}`} />;
            })}
          </div>

          {/* Gear + Digital Speed */}
          <div className="flex items-baseline justify-between gap-3 pt-0.5">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-white/10 font-mono text-xl font-black text-amber-300">
                {gearLabel}
              </span>
              <div className="flex flex-col leading-tight">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/55">
                  Gear
                </span>
                <span className="text-[11px] font-semibold text-sky-300 truncate max-w-[105px]">
                  {playerInfo.activeVehicleName ?? 'Kart'}
                </span>
              </div>
            </div>

            <div className="flex items-baseline gap-1 tabular-nums">
              <span className="font-mono text-3xl font-black tracking-tight text-white">
                {speedKmh}
              </span>
              <span className="text-[11px] font-bold uppercase text-white/60">km/h</span>
            </div>
          </div>

          {/* Status pills: Drift Charge / Boost / Turf Grip */}
          {(playerInfo.isDrifting || driftCharge > 0.05 || isBoostActive || playerInfo.isOffTrack) && (
            <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-1.5 text-[10px] font-extrabold uppercase tracking-wider">
              {isBoostActive ? (
                <span className="w-full rounded-md bg-cyan-500/30 border border-cyan-300/60 px-2 py-0.5 text-center text-cyan-200">
                  Apex Turbo Boost!
                </span>
              ) : playerInfo.isDrifting || driftCharge > 0.05 ? (
                <div className="flex w-full items-center gap-2">
                  <span className={driftCharge >= 1 ? 'text-cyan-300' : 'text-amber-300'}>
                    {driftCharge >= 1 ? 'Boost Ready' : 'Drift'}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
                    <div
                      className={`h-full transition-all duration-75 ${
                        driftCharge >= 1 ? 'bg-cyan-400' : 'bg-amber-400'
                      }`}
                      style={{ width: `${Math.round(driftCharge * 100)}%` }}
                    />
                  </div>
                </div>
              ) : null}
              {playerInfo.isOffTrack && !isBoostActive && (
                <span className="shrink-0 rounded bg-lime-600/40 border border-lime-400/50 px-1.5 py-0.5 text-lime-200">
                  Turf
                </span>
              )}
            </div>
          )}
        </div>
      )}

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
                  {raceState.activeVehicleName ?? playerInfo.activeVehicleName ?? 'Apex Mega Kart'}
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
