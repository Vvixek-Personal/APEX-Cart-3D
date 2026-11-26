import type { FollowPerspective } from './TouchControls';
import { PERSPECTIVE_OPTIONS } from './TouchControls';

interface PauseMenuProps {
  mapKeyLabel: string;
  isRebindingMapKey: boolean;
  onRequestRebindMapKey: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  perspective: FollowPerspective;
  onSelectPerspective: (p: FollowPerspective) => void;
  onResume: () => void;
  onRestartRace: () => void;
  onOpenFullMap: () => void;
  clockLabel: string;
}

/**
 * ESC pause screen: the single place for the guide, controls, settings and
 * keybinds. Nothing equivalent lives on the gameplay screen itself.
 */
export function PauseMenu({
  mapKeyLabel,
  isRebindingMapKey,
  onRequestRebindMapKey,
  isMuted,
  onToggleMute,
  perspective,
  onSelectPerspective,
  onResume,
  onRestartRace,
  onOpenFullMap,
  clockLabel,
}: PauseMenuProps) {
  return (
    <div className="pause-backdrop" data-testid="pause-menu" role="dialog" aria-label="Paused">
      <div className="pause-panel">
        <header className="pause-head">
          <h1>APEX DRIVE CLUB</h1>
          <span className="pause-clock">{clockLabel}</span>
        </header>

        <button type="button" className="pause-resume" onClick={onResume} data-testid="resume-btn">
          Resume
          <kbd>ESC</kbd>
        </button>

        <section className="pause-section">
          <h2>How to play</h2>
          <ul className="pause-guide">
            <li>Walk up to any parked vehicle and press <kbd>E</kbd> (or the round button) to drive it.</li>
            <li>Drive north through the stadium gate to start the 3-lap Grand Prix.</li>
            <li>Grass slows you down — sidewalks, plazas and footpaths never do.</li>
            <li>Hold <kbd>Space</kbd> while cornering to powerslide; release to regain grip.</li>
            <li>Press the map key or tap the corner map to open the full district map.</li>
            <li>Day turns to night as you play — street lamps and headlights come on.</li>
          </ul>
        </section>

        <section className="pause-section">
          <h2>Controls</h2>
          <dl className="pause-controls">
            <div><dt>Walk / Drive · Steer</dt><dd><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrows</dd></div>
            <div><dt>Sprint (on foot)</dt><dd><kbd>Shift</kbd></dd></div>
            <div><dt>Handbrake powerslide</dt><dd><kbd>Space</kbd></dd></div>
            <div><dt>Enter / exit vehicle</dt><dd><kbd>E</kbd></dd></div>
            <div><dt>Full map</dt><dd><kbd>{mapKeyLabel}</kbd></dd></div>
            <div><dt>Camera: aerial / follow</dt><dd><kbd>C</kbd></dd></div>
            <div><dt>Free-roam camera</dt><dd><kbd>V</kbd></dd></div>
            <div><dt>Perspective cycle / pick</dt><dd><kbd>P</kbd> · <kbd>1</kbd>–<kbd>4</kbd></dd></div>
            <div><dt>Reset aerial view</dt><dd><kbd>Home</kbd></dd></div>
            <div><dt>Pause</dt><dd><kbd>ESC</kbd></dd></div>
          </dl>
        </section>

        <section className="pause-section">
          <h2>Settings</h2>
          <div className="pause-settings">
            <button
              type="button"
              className={isRebindingMapKey ? 'setting-btn rebinding' : 'setting-btn'}
              onClick={onRequestRebindMapKey}
              data-testid="rebind-map-key-btn"
            >
              {isRebindingMapKey ? 'Press any key…' : `Map key: ${mapKeyLabel}`}
            </button>
            <button type="button" className="setting-btn" onClick={onToggleMute} data-testid="pause-mute-btn">
              Sound: {isMuted ? 'Off' : 'On'}
            </button>
            <button type="button" className="setting-btn" onClick={onOpenFullMap}>
              Full map
            </button>
          </div>
          <div className="pause-persp" role="group" aria-label="Camera perspective">
            {PERSPECTIVE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={perspective === opt.id ? 'persp-btn active' : 'persp-btn'}
                onClick={() => onSelectPerspective(opt.id)}
                aria-pressed={perspective === opt.id}
              >
                {opt.shortLabel}
              </button>
            ))}
          </div>
        </section>

        <button type="button" className="pause-restart" onClick={onRestartRace} data-testid="pause-restart-btn">
          Restart circuit session
        </button>
      </div>
    </div>
  );
}
