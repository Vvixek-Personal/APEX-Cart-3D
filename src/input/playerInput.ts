import {
  FreeCameraInputState,
  createEmptyFreeCameraInput,
} from '../camera/freeCamera';
import type { CameraMode, FollowPerspective } from '../components/TouchControls';
import type { KartInputState } from '../kart/kartPhysics';

export interface PlayerInputCallbacks {
  getCameraMode: () => CameraMode;
  onSelectPerspective: (perspective: FollowPerspective) => void;
  onCyclePerspective: () => void;
  onToggleFollow: () => void;
  onToggleFreeCam: () => void;
  onResetSpectator: () => void;
  onToggleMute?: () => void;
}

export interface KeyLikeEvent {
  code: string;
  repeat: boolean;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  target: unknown;
  preventDefault: () => void;
}

function isTextEntryElement(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as { tagName?: unknown; isContentEditable?: unknown };
  if (el.isContentEditable === true) return true;
  if (typeof el.tagName !== 'string') return false;
  const tag = el.tagName.toUpperCase();
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
}

function isButtonLikeElement(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as { tagName?: unknown };
  if (typeof el.tagName !== 'string') return false;
  const tag = el.tagName.toUpperCase();
  return tag === 'BUTTON' || tag === 'A';
}

const ACCELERATE_CODES = ['KeyW', 'ArrowUp'] as const;
const BRAKE_CODES = ['KeyS', 'ArrowDown'] as const;
const LEFT_CODES = ['KeyA', 'ArrowLeft'] as const;
const RIGHT_CODES = ['KeyD', 'ArrowRight'] as const;

/**
 * Stateful, testable keyboard tracker that:
 * - Preserves held state across paired keys (e.g. holding W + ArrowUp and releasing one)
 * - Never hijacks browser/OS shortcuts (Ctrl/Cmd/Alt + C, V, P, R, F, 1-4, etc.)
 * - Allows focused interactive UI elements (<button>, <input>) to receive Space/Enter naturally
 */
export class KeyboardInputTracker {
  public readonly kartInput: KartInputState = {
    accelerate: false,
    brakeReverse: false,
    steerLeft: false,
    steerRight: false,
    drift: false,
  };

  public readonly freeInput: FreeCameraInputState = createEmptyFreeCameraInput();
  public interactQueued = false;

  private readonly pressedCodes = new Set<string>();
  private readonly callbacks: PlayerInputCallbacks;

  constructor(callbacks: PlayerInputCallbacks) {
    this.callbacks = callbacks;
  }

  private recomputeAxes(): void {
    this.kartInput.accelerate = ACCELERATE_CODES.some((c) => this.pressedCodes.has(c));
    this.kartInput.brakeReverse = BRAKE_CODES.some((c) => this.pressedCodes.has(c));
    this.kartInput.steerLeft = LEFT_CODES.some((c) => this.pressedCodes.has(c));
    this.kartInput.steerRight = RIGHT_CODES.some((c) => this.pressedCodes.has(c));
    this.kartInput.drift = this.pressedCodes.has('Space');

    this.freeInput.moveForward = this.kartInput.accelerate;
    this.freeInput.moveBackward = this.kartInput.brakeReverse;
    this.freeInput.moveLeft = this.kartInput.steerLeft;
    this.freeInput.moveRight = this.kartInput.steerRight;
    this.freeInput.rise = this.pressedCodes.has('KeyR');
    this.freeInput.descend = this.pressedCodes.has('KeyF');
    this.freeInput.faster =
      this.pressedCodes.has('ShiftLeft') || this.pressedCodes.has('ShiftRight');
    this.freeInput.slower =
      this.pressedCodes.has('ControlLeft') || this.pressedCodes.has('ControlRight');
  }

  public handleKeyDown(e: KeyLikeEvent): void {
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      this.pressedCodes.add(e.code);
      this.recomputeAxes();
      return;
    }
    if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
      this.pressedCodes.add(e.code);
      this.recomputeAxes();
      return;
    }

    // Never intercept OS/browser shortcuts (Cmd+*, Alt+*, or Ctrl+letter/digit)
    if (e.metaKey || e.altKey) {
      return;
    }
    if (e.ctrlKey) {
      // Allow Ctrl + Arrow keys for slow Free Cam movement without blocking Ctrl+C/V/R/F/P/1-4/W
      const isArrow =
        e.code === 'ArrowUp' ||
        e.code === 'ArrowDown' ||
        e.code === 'ArrowLeft' ||
        e.code === 'ArrowRight';
      if (!isArrow) {
        return;
      }
    }

    if (isTextEntryElement(e.target)) {
      return;
    }
    if (isButtonLikeElement(e.target) && (e.code === 'Space' || e.code === 'Enter')) {
      return;
    }

    this.freeInput.faster = e.shiftKey || this.pressedCodes.has('ShiftLeft') || this.pressedCodes.has('ShiftRight');
    this.freeInput.slower = e.ctrlKey || this.pressedCodes.has('ControlLeft') || this.pressedCodes.has('ControlRight');

    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
      case 'KeyS':
      case 'ArrowDown':
      case 'KeyA':
      case 'ArrowLeft':
      case 'KeyD':
      case 'ArrowRight':
        e.preventDefault();
        this.pressedCodes.add(e.code);
        this.recomputeAxes();
        break;
      case 'Space':
        e.preventDefault();
        this.pressedCodes.add('Space');
        this.recomputeAxes();
        break;
      case 'KeyE':
        if (!e.repeat) {
          e.preventDefault();
          this.interactQueued = true;
        }
        break;
      case 'KeyP':
        if (!e.repeat) {
          e.preventDefault();
          this.callbacks.onCyclePerspective();
        }
        break;
      case 'Digit1':
        if (!e.repeat) {
          e.preventDefault();
          this.callbacks.onSelectPerspective('chase');
        }
        break;
      case 'Digit2':
        if (!e.repeat) {
          e.preventDefault();
          this.callbacks.onSelectPerspective('cockpit');
        }
        break;
      case 'Digit3':
        if (!e.repeat) {
          e.preventDefault();
          this.callbacks.onSelectPerspective('hood');
        }
        break;
      case 'Digit4':
        if (!e.repeat) {
          e.preventDefault();
          this.callbacks.onSelectPerspective('wide');
        }
        break;
      case 'KeyR':
        if (this.callbacks.getCameraMode() === 'free') {
          e.preventDefault();
        }
        this.pressedCodes.add('KeyR');
        this.recomputeAxes();
        break;
      case 'KeyF':
        if (this.callbacks.getCameraMode() === 'free') {
          e.preventDefault();
        }
        this.pressedCodes.add('KeyF');
        this.recomputeAxes();
        break;
      case 'KeyC':
        if (!e.repeat) {
          e.preventDefault();
          this.callbacks.onToggleFollow();
        }
        break;
      case 'KeyV':
        if (!e.repeat) {
          e.preventDefault();
          this.callbacks.onToggleFreeCam();
        }
        break;
      case 'Home':
        if (!e.repeat) {
          e.preventDefault();
          this.callbacks.onResetSpectator();
        }
        break;
    }
  }

  public handleKeyUp(e: KeyLikeEvent): void {
    this.pressedCodes.delete(e.code);
    this.recomputeAxes();
    if (!e.shiftKey) {
      this.pressedCodes.delete('ShiftLeft');
      this.pressedCodes.delete('ShiftRight');
    }
    if (!e.ctrlKey) {
      this.pressedCodes.delete('ControlLeft');
      this.pressedCodes.delete('ControlRight');
    }
    this.recomputeAxes();
  }

  public clear(): void {
    this.pressedCodes.clear();
    this.recomputeAxes();
    this.interactQueued = false;
  }
}
