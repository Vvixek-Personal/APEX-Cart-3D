import {
  TOWN_BLOCKS,
  TOWN_BUILDINGS,
  TOWN_PARKING_LOTS,
  TOWN_ROADS,
} from '../scene/townLayout';
import { TOWN_VEHICLE_SPAWNS } from '../kart/vehicleCatalog';
import { generateCheckpoints } from '../game/raceRules';
import { createTrackCurve, getBannerPlacements, sampleTrackFrames } from '../track/trackLayout';
import type { RaceState } from '../game/raceRules';

/**
 * Shared world-map painter used by both the corner minimap ("current area")
 * and the full map overlay. Pure canvas 2D, no labels, no legends — just the
 * world: streets, blocks, parks, parking, buildings, circuit, vehicles, player.
 */

const curve = createTrackCurve();
const trackPoints = curve.getSpacedPoints(200);
const checkpoints = generateCheckpoints(sampleTrackFrames(curve, 640), 6);
const finishPos = getBannerPlacements(curve).finish.position;

export const FULL_MAP_BOUNDS = { xMin: -205, xMax: 205, zMin: -215, zMax: 465 };

interface PaintOptions {
  /** World-space center of the view window. */
  centerX: number;
  centerZ: number;
  /** World units visible from edge to edge (square window). */
  spanX: number;
  spanZ: number;
  /** Canvas size in CSS pixels (square). */
  size: number;
  /** Show every vehicle dot (full map) or only nearby ones is handled by clipping. */
  showVehicles: boolean;
  /** Player world position & heading. */
  playerX: number;
  playerZ: number;
  playerHeading: number;
  race: Pick<RaceState, 'status' | 'currentCheckpointIndex' | 'lap' | 'maxLaps'>;
  activeVehicleId: string | null;
  /** Dim for night-time ambience. */
  nightFactor: number;
}

const COLOR_BG = '#11181d';
const COLOR_BLOCK = '#2a3338';
const COLOR_PARK = '#2c4434';
const COLOR_MARKET = '#4a4438';
const COLOR_PARKING = '#3a434b';
const COLOR_ROAD = '#5d666d';
const COLOR_ROAD_MAIN = '#69737b';
const COLOR_BUILDING = '#787d76';
const COLOR_TRACK = '#8b968f';
const COLOR_TRACK_EDGE = '#39423f';
const COLOR_VEHICLE = '#d9be8b';
const COLOR_PLAYER = '#eaf5ec';
const COLOR_CHECKPOINT = '#e3b264';
const COLOR_FINISH = '#efe3bb';

export function drawWorldMap(canvas: HTMLCanvasElement, opts: PaintOptions): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const px = Math.round(opts.size * dpr);
  if (canvas.width !== px) {
    canvas.width = px;
    canvas.height = px;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, opts.size, opts.size);

  // Night-tinted backdrop for the daylight cycle ambience
  const nightMix = opts.nightFactor;
  ctx.fillStyle = nightMix > 0.5 ? '#0b1116' : COLOR_BG;
  ctx.fillRect(0, 0, opts.size, opts.size);

  const sx = opts.size / opts.spanX;
  const sz = opts.size / opts.spanZ;
  const scale = Math.min(sx, sz);

  ctx.save();
  ctx.translate(opts.size / 2, opts.size / 2);
  ctx.scale(scale, scale);
  ctx.translate(-opts.centerX, -opts.centerZ);

  const viewHalfW = opts.spanX / 2 + 4;
  const viewHalfH = opts.spanZ / 2 + 4;
  const inView = (x: number, z: number, margin = 6) =>
    Math.abs(x - opts.centerX) <= viewHalfW + margin && Math.abs(z - opts.centerZ) <= viewHalfH + margin;

  // Circuit under everything else (stadium area)
  ctx.beginPath();
  trackPoints.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.z);
    else ctx.lineTo(p.x, p.z);
  });
  ctx.closePath();
  ctx.strokeStyle = COLOR_TRACK_EDGE;
  ctx.lineWidth = 15 / scale;
  ctx.stroke();
  ctx.strokeStyle = COLOR_TRACK;
  ctx.lineWidth = 10 / scale;
  ctx.stroke();
  ctx.fillStyle = COLOR_FINISH;
  const fr = 3.4 / scale;
  ctx.beginPath();
  ctx.arc(finishPos.x, finishPos.z, Math.max(1.6, fr), 0, Math.PI * 2);
  ctx.fill();

  // City blocks (sidewalk pads), parks & market
  for (const b of TOWN_BLOCKS) {
    if (!inView((b.xMin + b.xMax) / 2, (b.zMin + b.zMax) / 2, 60)) continue;
    let fill = COLOR_BLOCK;
    if (b.kind.includes('park')) fill = COLOR_PARK;
    else if (b.kind === 'market') fill = COLOR_MARKET;
    else if (b.kind === 'parking') fill = COLOR_PARKING;
    ctx.fillStyle = fill;
    ctx.fillRect(b.xMin, b.zMin, b.xMax - b.xMin, b.zMax - b.zMin);
  }

  // Roads on top of pads
  for (const r of TOWN_ROADS) {
    if (!inView((r.xMin + r.xMax) / 2, (r.zMin + r.zMax) / 2, Math.max(r.xMax - r.xMin, r.zMax - r.zMin))) continue;
    ctx.fillStyle = r.isConnector ? COLOR_ROAD_MAIN : COLOR_ROAD;
    ctx.fillRect(r.xMin, r.zMin, r.xMax - r.xMin, r.zMax - r.zMin);
  }
  for (const p of TOWN_PARKING_LOTS) {
    if (!inView((p.xMin + p.xMax) / 2, (p.zMin + p.zMax) / 2, 30)) continue;
    ctx.fillStyle = COLOR_PARKING;
    ctx.fillRect(p.xMin, p.zMin, p.xMax - p.xMin, p.zMax - p.zMin);
  }

  // Buildings
  ctx.fillStyle = COLOR_BUILDING;
  for (const b of TOWN_BUILDINGS) {
    if (!inView(b.x, b.z, 30)) continue;
    ctx.fillRect(b.x - b.w / 2, b.z - b.d / 2, b.w, b.d);
  }

  // Vehicle dots
  if (opts.showVehicles) {
    for (const v of TOWN_VEHICLE_SPAWNS) {
      if (v.instanceId === opts.activeVehicleId) continue;
      if (!inView(v.x, v.z, 2)) continue;
      ctx.fillStyle = COLOR_VEHICLE;
      ctx.beginPath();
      ctx.arc(v.x, v.z, Math.max(1.4, 2.6 / scale), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Race target: next checkpoint
  if (opts.race.status === 'racing' || opts.race.status === 'countdown') {
    const cp = checkpoints[opts.race.currentCheckpointIndex]?.position;
    const target = opts.race.currentCheckpointIndex >= checkpoints.length ? finishPos : cp;
    if (target && inView(target.x, target.z, 4)) {
      ctx.fillStyle = COLOR_CHECKPOINT;
      ctx.beginPath();
      ctx.arc(target.x, target.z, Math.max(2.2, 4.4 / scale), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Player arrow (yaw = PI faces north/up on the map)
  ctx.save();
  ctx.translate(opts.playerX, opts.playerZ);
  ctx.rotate(Math.atan2(Math.sin(opts.playerHeading), -Math.cos(opts.playerHeading)));
  const a = 6.6 / scale;
  ctx.fillStyle = COLOR_PLAYER;
  ctx.strokeStyle = 'rgba(8, 20, 14, 0.85)';
  ctx.lineWidth = a * 0.24;
  ctx.beginPath();
  ctx.moveTo(0, -a);
  ctx.lineTo(0.62 * a, 0.74 * a);
  ctx.lineTo(0, 0.38 * a);
  ctx.lineTo(-0.62 * a, 0.74 * a);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}
