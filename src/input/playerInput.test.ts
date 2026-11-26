import assert from 'node:assert/strict';
import test from 'node:test';
import type { CameraMode, FollowPerspective } from '../components/TouchControls';
import { KeyboardInputTracker, KeyLikeEvent } from './playerInput';

function makeKeyEvent(
  code: string,
  overrides: Partial<Omit<KeyLikeEvent, 'code' | 'preventDefault'>> = {},
): KeyLikeEvent & { prevented: boolean } {
  const ev = {
    code,
    repeat: false,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    target: null,
    prevented: false,
    preventDefault() {
      ev.prevented = true;
    },
    ...overrides,
  };
  return ev;
}

function createHarness(initialMode: CameraMode = 'follow') {
  const mode: CameraMode = initialMode;
  const calls = {
    perspectives: [] as FollowPerspective[],
    cycled: 0,
    toggledFollow: 0,
    toggledFree: 0,
    resetSpectator: 0,
    toggledMute: 0,
  };
  const tracker = new KeyboardInputTracker({
    getCameraMode: () => mode,
    onSelectPerspective: (p) => calls.perspectives.push(p),
    onCyclePerspective: () => {
      calls.cycled++;
    },
    onToggleFollow: () => {
      calls.toggledFollow++;
    },
    onToggleFreeCam: () => {
      calls.toggledFree++;
    },
    onResetSpectator: () => {
      calls.resetSpectator++;
    },
    onToggleMute: () => {
      calls.toggledMute++;
    },
  });
  return { tracker, calls };
}

test('releasing one key of a bound pair (W + ArrowUp) preserves movement until both are released', () => {
  const { tracker } = createHarness();

  tracker.handleKeyDown(makeKeyEvent('KeyW'));
  tracker.handleKeyDown(makeKeyEvent('ArrowUp'));
  assert.equal(tracker.kartInput.accelerate, true);
  assert.equal(tracker.freeInput.moveForward, true);

  // Release KeyW while ArrowUp is still held
  tracker.handleKeyUp(makeKeyEvent('KeyW'));
  assert.equal(
    tracker.kartInput.accelerate,
    true,
    'Accelerate must remain active while ArrowUp is still held',
  );

  // Release ArrowUp -> now false
  tracker.handleKeyUp(makeKeyEvent('ArrowUp'));
  assert.equal(tracker.kartInput.accelerate, false);
  assert.equal(tracker.freeInput.moveForward, false);
});

test('browser/OS shortcuts with Ctrl, Meta, or Alt are never hijacked or preventDefaulted', () => {
  const { tracker, calls } = createHarness('free');

  for (const [code, mod] of [
    ['KeyC', { ctrlKey: true }],
    ['KeyV', { metaKey: true }],
    ['KeyP', { ctrlKey: true }],
    ['KeyR', { metaKey: true }],
    ['KeyF', { ctrlKey: true }],
    ['Digit1', { metaKey: true }],
    ['KeyM', { altKey: true }],
  ] as const) {
    const ev = makeKeyEvent(code, mod);
    tracker.handleKeyDown(ev);
    assert.equal(ev.prevented, false, `${code} with modifier must not call preventDefault()`);
  }

  assert.equal(calls.toggledFollow, 0);
  assert.equal(calls.toggledFree, 0);
  assert.equal(calls.cycled, 0);
  assert.equal(calls.perspectives.length, 0);
  assert.equal(calls.toggledMute, 0);
  assert.equal(tracker.freeInput.rise, false);
  assert.equal(tracker.freeInput.descend, false);
});

test('focused interactive UI elements (<button>, <input>) retain native Space/key activation', () => {
  const { tracker, calls } = createHarness();
  const buttonTarget = { tagName: 'BUTTON', isContentEditable: false };

  const spaceEv = makeKeyEvent('Space', { target: buttonTarget });
  tracker.handleKeyDown(spaceEv);
  assert.equal(spaceEv.prevented, false, 'Space on focused <button> must not be prevented');
  assert.equal(tracker.kartInput.drift, false);

  const keyCEv = makeKeyEvent('KeyC', { target: { tagName: 'INPUT' } });
  tracker.handleKeyDown(keyCEv);
  assert.equal(keyCEv.prevented, false);
  assert.equal(calls.toggledFollow, 0);
});

test('Space engages handbrake drift, KeyE queues interaction, and KeyM toggles mute when canvas has focus', () => {
  const { tracker, calls } = createHarness();

  const spaceDown = makeKeyEvent('Space');
  tracker.handleKeyDown(spaceDown);
  assert.equal(spaceDown.prevented, true);
  assert.equal(tracker.kartInput.drift, true);

  tracker.handleKeyDown(makeKeyEvent('KeyE'));
  assert.equal(tracker.interactQueued, true);

  tracker.handleKeyDown(makeKeyEvent('KeyM'));
  assert.equal(calls.toggledMute, 1);

  tracker.clear();
  assert.equal(tracker.kartInput.drift, false);
  assert.equal(tracker.interactQueued, false);
});
