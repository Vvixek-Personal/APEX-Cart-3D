import { useEffect, useRef } from 'react';
import type { RaceState } from '../game/raceRules';
import type { PlayerHudInfo } from './TouchControls';
import { drawWorldMap, FULL_MAP_BOUNDS } from './mapRender';
import { DayNightSample } from '../scene/dayNight';

interface RaceHUDProps {
  raceState: RaceState;
  playerInfo: PlayerHudInfo;
  dayNight: DayNightSample;
  isMapOpen: boolean;
  onCloseMap: () => void;
}

function formatTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—';
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
}

/**
 * Minimal, text-free driving HUD:
 * - Center speedometer without any background panel (plus vehicle name).
 * - Square local-area minimap pinned bottom-right (tap it or press the map key for the full map).
 * - Full map overlay with zero labels or legends.
 * - Race countdown shown as bare numerals only.
 */
export function RaceHUD({ raceState: race, playerInfo: player, dayNight, isMapOpen, onCloseMap }: RaceHUDProps) {
  const driving = player.mode === 'driving';
  const speed = Math.round(Math.abs(player.speedUnits) * 3.6);
  const gear = player.speedUnits < -0.15 ? 'R' : speed < 1 ? 'N' : String(player.gear ?? 1);

  return (
    <div className="drive-hud">
      {/* Center speedometer — no background, no clutter */}
      {driving && !race.isFinished && (
        <div className="speed-hud" data-testid="speed-hud" aria-label={`Speed ${speed} kilometres per hour, gear ${gear}`}>
          <span className="speed-vehicle">{player.activeVehicleName}</span>
          <strong className="speed-value">{speed}</strong>
          <span className="speed-unit">km/h</span>
          <span className="speed-gear">{gear}</span>
        </div>
      )}

      {/* Bare countdown numerals while the circuit session arms */}
      {race.status === 'countdown' && !race.isFinished && (
        <div className="race-countdown" data-testid="race-countdown">
          {Math.ceil(race.countdownSeconds) > 3 ? '' : Math.ceil(race.countdownSeconds) || 'GO'}
        </div>
      )}

      {/* Bottom-right square minimap: current area, no labels. Tap to open the full map. */}
      <button
        type="button"
        className="minimap-frame"
        aria-label="Open full map"
        onClick={onCloseMap}
        data-testid="minimap"
      >
        <MinimapCanvas player={player} race={race} dayNight={dayNight} />
      </button>

      {/* Full map overlay */}
      {isMapOpen && (
        <div className="fullmap-backdrop" data-testid="full-map" onClick={onCloseMap}>
          <div className="fullmap-panel" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="fullmap-close" aria-label="Close map" onClick={onCloseMap}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
            <FullMapCanvas player={player} race={race} dayNight={dayNight} />
          </div>
        </div>
      )}

      {/* Session-complete modal (only moment the game ever shows results) */}
      {race.isFinished && (
        <div className="finish-backdrop">
          <section className="finish-panel">
            <small>SESSION COMPLETE</small>
            <h2>Across the line.</h2>
            <p>{race.activeVehicleName ?? player.activeVehicleName}</p>
            <dl>
              <div><dt>Total time</dt><dd>{formatTime(race.finalTime ?? race.elapsedTime)}</dd></div>
              <div><dt>Best lap</dt><dd>{formatTime(race.bestLapTime)}</dd></div>
            </dl>
          </section>
        </div>
      )}
    </div>
  );
}

function MinimapCanvas({
  player,
  race,
  dayNight,
}: {
  player: PlayerHudInfo;
  race: RaceState;
  dayNight: DayNightSample;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let last = -1;
    const render = () => {
      rafRef.current = requestAnimationFrame(render);
      // Redraw at ~20 fps; position changes repaint the local window
      const key = Math.round((player.posX ?? 0) * 2) * 73856093 ^
        Math.round((player.posZ ?? 0) * 2) * 19349663 ^
        Math.round((player.heading ?? 0) * 40);
      if (key === last) return;
      last = key;
      drawWorldMap(canvas, {
        centerX: player.posX ?? 0,
        centerZ: player.posZ ?? 296,
        spanX: 190,
        spanZ: 190,
        size: canvas.clientWidth || 172,
        showVehicles: true,
        playerX: player.posX ?? 0,
        playerZ: player.posZ ?? 296,
        playerHeading: player.heading ?? 0,
        race,
        activeVehicleId: player.activeVehicleId,
        nightFactor: dayNight.nightFactor,
      });
    };
    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [player, race, dayNight]);

  return <canvas ref={ref} className="minimap-canvas" />;
}

function FullMapCanvas({
  player,
  race,
  dayNight,
}: {
  player: PlayerHudInfo;
  race: RaceState;
  dayNight: DayNightSample;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const render = () => {
      const size = Math.min(canvas.clientWidth || 520, canvas.clientHeight || 520);
      drawWorldMap(canvas, {
        centerX: (FULL_MAP_BOUNDS.xMin + FULL_MAP_BOUNDS.xMax) / 2,
        centerZ: (FULL_MAP_BOUNDS.zMin + FULL_MAP_BOUNDS.zMax) / 2,
        spanX: FULL_MAP_BOUNDS.xMax - FULL_MAP_BOUNDS.xMin,
        spanZ: FULL_MAP_BOUNDS.zMax - FULL_MAP_BOUNDS.zMin,
        size,
        showVehicles: true,
        playerX: player.posX ?? 0,
        playerZ: player.posZ ?? 296,
        playerHeading: player.heading ?? 0,
        race,
        activeVehicleId: player.activeVehicleId,
        nightFactor: dayNight.nightFactor,
      });
    };
    render();
    const ro = new ResizeObserver(render);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [player, race, dayNight]);

  return <canvas ref={ref} className="fullmap-canvas" />;
}
