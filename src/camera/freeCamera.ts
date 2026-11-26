import * as THREE from 'three';

export interface FreeCameraInputState {
  moveForward: boolean;
  moveBackward: boolean;
  moveLeft: boolean;
  moveRight: boolean;
  rise: boolean;
  descend: boolean;
  faster: boolean;
  slower: boolean;
}

export interface FreeCameraConfig {
  baseMoveSpeed: number;
  verticalSpeed: number;
  fastMultiplier: number;
  slowMultiplier: number;
  lookSensitivity: number;
  touchLookSensitivity: number;
  panSensitivity: number;
  dollySensitivity: number;
  pinchSensitivity: number;
  positionDamping: number;
  rotationDamping: number;
  fov: number;
  minPitchDeg: number;
  maxPitchDeg: number;
  maxHorizontalExtent: number;
  maxHeight: number;
}

export const DEFAULT_FREE_CAMERA_CONFIG: FreeCameraConfig = {
  baseMoveSpeed: 62,
  verticalSpeed: 48,
  fastMultiplier: 2.6,
  slowMultiplier: 0.32,
  lookSensitivity: 0.0032,
  touchLookSensitivity: 0.0044,
  panSensitivity: 0.14,
  dollySensitivity: 0.065,
  pinchSensitivity: 0.34,
  positionDamping: 12,
  rotationDamping: 18,
  fov: 45,
  minPitchDeg: -87,
  maxPitchDeg: 87,
  maxHorizontalExtent: 900,
  maxHeight: 760,
};

/**
 * Pure ground-clearance helper keeping the free camera upright and above
 * the track/grass field, stadium concourse, outer park, and surrounding terrain.
 */
export function getFreeCameraMinHeight(x: number, z: number): number {
  const ax = Math.abs(x);
  const az = Math.abs(z);
  if (ax <= 122 && az <= 122) {
    return 1.6; // Grass field & asphalt track (y = 0..0.14)
  }
  if (ax <= 180 && az <= 180) {
    return 1.2; // Stadium concourse apron (y = -0.35)
  }
  if (ax <= 214 && (az <= 214 || (z > 212 && z <= 430))) {
    return 0.8; // Outer landscaped park lawn & town district (y = -0.85..-0.64)
  }
  return -2.0; // Surrounding horizon ground plane (y = -4.02)
}

export function createEmptyFreeCameraInput(): FreeCameraInputState {
  return {
    moveForward: false,
    moveBackward: false,
    moveLeft: false,
    moveRight: false,
    rise: false,
    descend: false,
    faster: false,
    slower: false,
  };
}

/**
 * Stateful, GC-free upright free-camera controller.
 * Only mutates camera position, quaternion, fov, near, and far — never mutates world geometry.
 */
export class FreeCameraController {
  public readonly config: FreeCameraConfig;

  public readonly currentPosition = new THREE.Vector3(0, 120, 260);
  public readonly targetPosition = new THREE.Vector3(0, 120, 260);

  public currentYaw = 0;
  public targetYaw = 0;
  public currentPitch = -0.35;
  public targetPitch = -0.35;

  private readonly eulerScratch = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly forwardScratch = new THREE.Vector3();
  private readonly horizForwardScratch = new THREE.Vector3();
  private readonly horizRightScratch = new THREE.Vector3();
  private readonly camUpScratch = new THREE.Vector3();
  private readonly camRightScratch = new THREE.Vector3();

  private readonly minPitchRad: number;
  private readonly maxPitchRad: number;

  constructor(config: Partial<FreeCameraConfig> = {}) {
    this.config = { ...DEFAULT_FREE_CAMERA_CONFIG, ...config };
    this.minPitchRad = THREE.MathUtils.degToRad(this.config.minPitchDeg);
    this.maxPitchRad = THREE.MathUtils.degToRad(this.config.maxPitchDeg);
  }

  /**
   * Initializes free-camera position & upright yaw/pitch seamlessly from an active camera.
   */
  public syncFromCamera(camera: THREE.PerspectiveCamera): void {
    this.currentPosition.copy(camera.position);
    this.targetPosition.copy(camera.position);

    this.forwardScratch.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    const horizLen = Math.hypot(this.forwardScratch.x, this.forwardScratch.z);
    const yaw = Math.atan2(-this.forwardScratch.x, -this.forwardScratch.z);
    const pitch = THREE.MathUtils.clamp(
      Math.atan2(this.forwardScratch.y, Math.max(horizLen, 1e-5)),
      this.minPitchRad,
      this.maxPitchRad,
    );

    this.currentYaw = yaw;
    this.targetYaw = yaw;
    this.currentPitch = pitch;
    this.targetPitch = pitch;

    this.clampPosition(this.targetPosition);
    this.clampPosition(this.currentPosition);
    this.applyOrientation(camera);
  }

  /**
   * Adjusts target yaw & pitch from pointer drag deltas (right mouse or 1-finger touch).
   * Keeps camera strictly upright (roll = 0) with clamped pitch so it never flips.
   */
  public addLookDelta(dx: number, dy: number, isTouch = false): void {
    const sens = isTouch ? this.config.touchLookSensitivity : this.config.lookSensitivity;
    this.targetYaw -= dx * sens;
    this.targetPitch = THREE.MathUtils.clamp(
      this.targetPitch - dy * sens,
      this.minPitchRad,
      this.maxPitchRad,
    );
  }

  /**
   * Pans target position across the camera's local view plane (middle mouse or 2-finger drag).
   */
  public addPanDelta(dx: number, dy: number): void {
    const heightScale = THREE.MathUtils.clamp(
      0.28 + Math.max(this.currentPosition.y, 0) * 0.012,
      0.28,
      3.8,
    );
    const step = this.config.panSensitivity * heightScale;

    this.eulerScratch.set(this.currentPitch, this.currentYaw, 0, 'YXZ');
    this.camRightScratch.set(1, 0, 0).applyEuler(this.eulerScratch);
    this.camUpScratch.set(0, 1, 0).applyEuler(this.eulerScratch);

    this.targetPosition.addScaledVector(this.camRightScratch, -dx * step);
    this.targetPosition.addScaledVector(this.camUpScratch, dy * step);
    this.clampPosition(this.targetPosition);
  }

  /**
   * Dollies camera smoothly forward/backward along its viewing ray (mouse wheel or pinch).
   * Positive amount moves forward (zoom in); negative moves backward (zoom out).
   */
  public addDolly(amount: number): void {
    const distScale = THREE.MathUtils.clamp(
      0.45 + Math.max(this.currentPosition.y, 0) * 0.018,
      0.45,
      5.5,
    );
    this.eulerScratch.set(this.currentPitch, this.currentYaw, 0, 'YXZ');
    this.forwardScratch.set(0, 0, -1).applyEuler(this.eulerScratch);

    this.targetPosition.addScaledVector(this.forwardScratch, amount * distScale);
    this.clampPosition(this.targetPosition);
  }

  /**
   * Advances free-camera movement and exponential damping for position, rotation, and projection.
   */
  public update(
    camera: THREE.PerspectiveCamera,
    input: FreeCameraInputState,
    rawDt: number,
  ): void {
    const dt = Math.min(Math.max(rawDt, 0), 0.05);

    const speedMult =
      (input.faster ? this.config.fastMultiplier : 1) *
      (input.slower ? this.config.slowMultiplier : 1);
    const heightFactor = THREE.MathUtils.clamp(
      0.45 + Math.max(this.currentPosition.y, 0) * 0.0085,
      0.45,
      2.8,
    );
    const horizSpeed = this.config.baseMoveSpeed * heightFactor * speedMult;
    const vertSpeed = this.config.verticalSpeed * heightFactor * speedMult;

    // Ground-plane movement relative to camera's horizontal heading (yaw)
    const fwdAxis = (input.moveForward ? 1 : 0) - (input.moveBackward ? 1 : 0);
    const rightAxis = (input.moveRight ? 1 : 0) - (input.moveLeft ? 1 : 0);
    const vertAxis = (input.rise ? 1 : 0) - (input.descend ? 1 : 0);

    if (fwdAxis !== 0 || rightAxis !== 0) {
      const sinY = Math.sin(this.targetYaw);
      const cosY = Math.cos(this.targetYaw);
      this.horizForwardScratch.set(-sinY, 0, -cosY);
      this.horizRightScratch.set(cosY, 0, -sinY);

      const moveLen = Math.hypot(fwdAxis, rightAxis);
      const normFwd = fwdAxis / moveLen;
      const normRight = rightAxis / moveLen;

      this.targetPosition.addScaledVector(this.horizForwardScratch, normFwd * horizSpeed * dt);
      this.targetPosition.addScaledVector(this.horizRightScratch, normRight * horizSpeed * dt);
    }

    if (vertAxis !== 0) {
      this.targetPosition.y += vertAxis * vertSpeed * dt;
    }

    this.clampPosition(this.targetPosition);

    const posAlpha = 1 - Math.exp(-this.config.positionDamping * dt);
    const rotAlpha = 1 - Math.exp(-this.config.rotationDamping * dt);

    this.currentPosition.lerp(this.targetPosition, posAlpha);
    this.clampPosition(this.currentPosition);

    this.currentYaw += (this.targetYaw - this.currentYaw) * rotAlpha;
    this.currentPitch = THREE.MathUtils.clamp(
      this.currentPitch + (this.targetPitch - this.currentPitch) * rotAlpha,
      this.minPitchRad,
      this.maxPitchRad,
    );

    camera.position.copy(this.currentPosition);
    this.applyOrientation(camera);

    // Smoothly blend FOV & adaptive near plane for zero Z-fighting at altitude and zero close clipping
    const desiredNear = THREE.MathUtils.clamp(
      Math.max(this.currentPosition.y, 0) * 0.025,
      0.5,
      12,
    );
    let projDirty = false;
    if (Math.abs(camera.fov - this.config.fov) > 0.04) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, this.config.fov, posAlpha);
      projDirty = true;
    }
    if (Math.abs(camera.near - desiredNear) > 0.04) {
      camera.near = THREE.MathUtils.lerp(camera.near, desiredNear, posAlpha);
      projDirty = true;
    }
    if (camera.far !== 4800) {
      camera.far = 4800;
      projDirty = true;
    }
    if (projDirty) {
      camera.updateProjectionMatrix();
    }
  }

  private applyOrientation(camera: THREE.PerspectiveCamera): void {
    this.eulerScratch.set(this.currentPitch, this.currentYaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(this.eulerScratch);
  }

  private clampPosition(pos: THREE.Vector3): void {
    const ext = this.config.maxHorizontalExtent;
    pos.x = THREE.MathUtils.clamp(pos.x, -ext, ext);
    pos.z = THREE.MathUtils.clamp(pos.z, -ext, ext);
    const minY = getFreeCameraMinHeight(pos.x, pos.z);
    pos.y = THREE.MathUtils.clamp(pos.y, minY, this.config.maxHeight);
  }
}
