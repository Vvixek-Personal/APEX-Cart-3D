import type { RaceState } from '../game/raceRules';
import { generateCheckpoints } from '../game/raceRules';
import { createTrackCurve, getBannerPlacements, sampleTrackFrames } from '../track/trackLayout';
import { TOWN_BLOCKS, TOWN_BUILDINGS, TOWN_PARKING_LOTS, TOWN_ROADS } from '../scene/townLayout';
import { TOWN_VEHICLE_SPAWNS } from '../kart/vehicleCatalog';
import type { PlayerHudInfo } from './TouchControls';

interface RaceHUDProps {
  raceState: RaceState;
  playerInfo: PlayerHudInfo;
  onRestart: () => void;
}

// Equal scale on both axes, covering the entire drivable world. Never clamp the
// player to an invented road: this is the same layout the physics/rendering use.
const mx = (x: number) => (x + 220) * 0.5;
const my = (z: number) => (z + 240) * 0.5;
const curve = createTrackCurve();
const trackPath = curve.getSpacedPoints(160).map((p, i) => `${i ? 'L' : 'M'}${mx(p.x)},${my(p.z)}`).join(' ') + ' Z';
const checkpoints = generateCheckpoints(sampleTrackFrames(curve, 640), 6);
const finish = getBannerPlacements(curve).finish.position;

function formatTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—';
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
}

export function RaceHUD({ raceState: race, playerInfo: player, onRestart }: RaceHUDProps) {
  const driving = player.mode === 'driving';
  const speed = Math.round(Math.abs(player.speedUnits) * 3.6);
  const racing = race.status !== 'waiting';
  const next = checkpoints[race.currentCheckpointIndex]?.position ?? finish;
  const gear = player.speedUnits < -0.15 ? 'R' : speed < 1 ? 'N' : String(player.gear ?? 1);
  const heading = 180 - (player.heading ?? 0) * 180 / Math.PI;
  return <div className="drive-hud">
    <header className="drive-brand hud-surface" data-testid="race-hud">
      <div className="brand-mark">A<span>/</span></div>
      <div><h1>APEX <span>DRIVE CLUB</span></h1><p><i />{racing ? 'CIRCUIT SESSION' : 'TOWN DISTRICT'}<b> / </b>{driving ? 'DRIVING' : 'ON FOOT'}</p></div>
    </header>

    {racing && !race.isFinished && <section className="session-strip hud-surface" aria-label="Race timing">
      <div><small>LAP</small><strong>{Math.min(race.lap, race.maxLaps)} <em>/ {race.maxLaps}</em></strong></div>
      <div><small>SESSION</small><strong>{formatTime(race.elapsedTime)}</strong></div>
      <div><small>BEST LAP</small><strong>{formatTime(race.bestLapTime)}</strong></div>
      <div><small>CHECKPOINT</small><strong>{Math.min(race.currentCheckpointIndex + 1, race.totalCheckpoints)} <em>/ {race.totalCheckpoints}</em></strong></div>
    </section>}

    {race.isWrongWay && race.status === 'racing' && <div className="drive-warning" data-testid="wrong-way-banner">WRONG WAY <span>Turn around safely</span></div>}
    {race.status === 'countdown' && <div className="drive-countdown"><span>CIRCUIT SESSION</span><strong>{Math.ceil(race.countdownSeconds) > 3 ? 'READY' : Math.ceil(race.countdownSeconds) || 'GO'}</strong><p>Turn left onto the circuit · Clockwise laps</p></div>}

    <aside className="navigation-panel hud-surface" data-testid="circuit-minimap">
      <div className="panel-heading"><span>DISTRICT MAP</span><span className="north-label">N ↑</span></div>
      <svg className="district-map" viewBox="0 0 220 350" role="img" aria-label="Live map of town streets, parks, buildings, parked vehicles and circuit">
        <rect x="0" y="0" width="220" height="350" fill="#172126" />
        <rect x={mx(-120)} y={my(-120)} width="120" height="120" rx="10" fill="#263b32" stroke="#46534d" strokeWidth="9" />
        {TOWN_BLOCKS.map(b => <rect key={b.id} x={mx(b.xMin)} y={my(b.zMin)} width={(b.xMax-b.xMin)*.5} height={(b.zMax-b.zMin)*.5} rx="1" fill={b.kind.includes('park') ? '#365448' : b.kind === 'market' ? '#6a604c' : '#303b3e'} />)}
        {TOWN_ROADS.map(r => <rect key={r.id} x={mx(r.xMin)} y={my(r.zMin)} width={(r.xMax-r.xMin)*.5} height={(r.zMax-r.zMin)*.5} fill="#647278" />)}
        {TOWN_PARKING_LOTS.map(p => <rect key={p.id} x={mx(p.xMin)} y={my(p.zMin)} width={(p.xMax-p.xMin)*.5} height={(p.zMax-p.zMin)*.5} fill="#45505a" />)}
        {TOWN_BUILDINGS.map(b => <rect key={b.id} x={mx(b.x-b.w/2)} y={my(b.z-b.d/2)} width={b.w*.5} height={b.d*.5} fill="#8d8b80" stroke="#172126" strokeWidth=".5" />)}
        <path d={trackPath} fill="none" stroke="#afbbb7" strokeWidth="7" strokeLinejoin="round" />
        <path d={trackPath} fill="none" stroke="#344047" strokeWidth="4.5" />
        <circle cx={mx(finish.x)} cy={my(finish.z)} r="2.5" fill="#f0dfb3" />
        {TOWN_VEHICLE_SPAWNS.filter(v => v.instanceId !== player.activeVehicleId).map(v => <circle key={v.instanceId} cx={mx(v.x)} cy={my(v.z)} r="1.6" fill="#ddc28d" />)}
        <text x="110" y="122" textAnchor="middle" className="map-label">APEX CIRCUIT</text>
        <text x="110" y="216" textAnchor="middle" className="map-label">STADIUM GATE</text>
        <text x="175" y="273" textAnchor="middle" className="map-label">PARK</text>
        {race.status === 'racing' && <circle cx={mx(next.x)} cy={my(next.z)} r="4" fill="#e5bd78" stroke="#fff3d6" strokeWidth="1" />}
        <g transform={`translate(${mx(player.posX ?? 0)},${my(player.posZ ?? 294)}) rotate(${heading})`}>
          <circle r="7" fill="#c5e3d5" opacity=".16" />
          <path d="M0 -5 L3.8 4 L0 2 L-3.8 4Z" fill="#b9e9d1" stroke="#0c211b" strokeWidth="1" />
        </g>
        <path d="M12 334h25m-25-3v6m25-6v6" stroke="#9ba9a9" strokeWidth="1" />
        <text x="43" y="337" className="map-label">50 m</text>
      </svg>
      <div className="map-legend"><span><i />YOU</span><span><i />VEHICLES AT START</span></div>
    </aside>

    <div className="route-hint hud-surface">
      <span className="route-icon">{driving ? '↰' : '↗'}</span>
      <div><strong>{driving ? racing ? 'Follow circuit checkpoints' : 'Stadium entrance' : player.nearbyVehicleName ?? 'Explore the district'}</strong>
      <p>{driving ? racing ? 'Clockwise · Stay on the asphalt' : 'Head north · Turn left to join the circuit' : player.nearbyVehicleName ? 'Press E to drive · WASD to walk' : 'Walk up to a parked vehicle to drive'}</p></div>
    </div>

    {driving && !race.isFinished && <section className="instrument-panel hud-surface" data-testid="telemetry-cluster" aria-label={`Speed ${speed} kilometres per hour, gear ${gear}`}>
      <div className="panel-heading"><span>{player.activeVehicleName}</span><span className="live-dot">LIVE</span></div>
      <div className="speed-readout"><div className="gear-readout"><strong>{gear}</strong><small>GEAR</small></div><strong>{speed.toString().padStart(3, '0')}</strong><span>km/h</span></div>
      <div className="rpm-scale" aria-label="Engine RPM">{Array.from({ length: 24 }, (_, i) => <i key={i} className={i / 24 < (player.rpmNorm ?? .2) ? i > 19 ? 'redline' : 'lit' : ''} />)}</div>
      <div className="instrument-footer"><span>RPM × 1000</span><span>{player.isDrifting ? 'HANDBRAKE' : player.isOffTrack ? 'LOW GRIP' : 'TRACTION NORMAL'}</span></div>
    </section>}

    {race.isFinished && <div className="finish-backdrop"><section className="finish-panel hud-surface"><small>SESSION COMPLETE</small><h2>Across the line.</h2><p>{race.activeVehicleName ?? player.activeVehicleName}</p><dl><div><dt>Total time</dt><dd>{formatTime(race.finalTime ?? race.elapsedTime)}</dd></div><div><dt>Best lap</dt><dd>{formatTime(race.bestLapTime)}</dd></div></dl><button type="button" onClick={onRestart} onPointerDown={e => e.stopPropagation()} aria-label="Restart race">Return to town ↗</button></section></div>}
  </div>;
}
