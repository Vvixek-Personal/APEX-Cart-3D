import * as THREE from 'three';
import type { FollowPerspective } from '../components/TouchControls';
import type { VehicleSpec } from '../kart/vehicleCatalog';
import type { PlayerControlMode } from '../player/characterPhysics';

export interface FollowCameraTargetState {
  mode: PlayerControlMode;
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  lateralSpeed?: number;
  steerAngle?: number;
  isDrifting?: boolean;
  boostTimer?: number;
  onKerb?: boolean;
  vehicleSpec: VehicleSpec | null;
}

export interface FollowCameraPose {
  position: THREE.Vector3;
  lookTarget: THREE.Vector3;
  fov: number;
  near: number;
  posRate: number;
  lookRate: number;
}

/**
 * Stateful, GC-free multi-perspective follow camera controller supporting
 * Chase, Cockpit (1st-person), Hood/Action, and Wide broadcast-follow views
 * for both driving vehicles and walking on foot.
 */
export class FollowCameraController {
  private readonly targetPos = new THREE.Vector3();
  private readonly forwardVec = new THREE.Vector3();
  private readonly sideVec = new THREE.Vector3();
  private readonly desiredPos = new THREE.Vector3();
  private readonly desiredLook = new THREE.Vector3();
  private rumbleTime = 0;

  /**
   * Pure pose solver for testing and snapping.
   */
  public computeDesiredPose(
    perspective: FollowPerspective,
    state: FollowCameraTargetState,
    out: FollowCameraPose,
  ): FollowCameraPose {
    const { x, y, z, yaw, speed, vehicleSpec } = state;
    this.targetPos.set(x, y, z);
    this.forwardVec.set(Math.sin(yaw), 0, Math.cos(yaw));
    this.sideVec.set(Math.cos(yaw), 0, -Math.sin(yaw));

    let targetFov = 46;
    let targetNear = 0.45;
    let posRate = 10.0;
    let lookRate = 13.0;

    if (state.mode === 'driving' && vehicleSpec) {
      const sp = vehicleSpec;
      const absSpeed = Math.abs(speed);
      const speedRatio = Math.min(1.15, absSpeed / sp.stats.maxForwardSpeed);
      const boostExtraFov = (state.boostTimer ?? 0) > 0 ? 4.0 : 0;
      const latSlip = state.lateralSpeed ?? 0;
      const steerPeek = (state.steerAngle ?? 0) * 1.35 + THREE.MathUtils.clamp(latSlip * 0.12, -1.6, 1.6);
      const kerbBob =
        state.onKerb && absSpeed > 3 ? Math.sin(this.rumbleTime * 42) * 0.032 : 0;

      if (perspective === 'cockpit') {
        const seatX = sp.bodyStyle === 'kart' || sp.bodyStyle === 'formula' ? 0 : 0.32;
        out.position
          .copy(this.targetPos)
          .addScaledVector(this.sideVec, seatX)
          .addScaledVector(this.forwardVec, sp.cockpitEyeZ)
          .setY(y + sp.cockpitEyeY + kerbBob);
        out.lookTarget
          .copy(this.targetPos)
          .addScaledVector(this.sideVec, seatX + steerPeek * 1.4)
          .addScaledVector(this.forwardVec, 26.0)
          .setY(y + sp.cockpitEyeY - 0.14 + kerbBob * 0.5);
        targetFov = 62 + speedRatio * 5.0 + boostExtraFov;
        targetNear = 0.16;
        posRate = 42;
        lookRate = 42;
      } else if (perspective === 'hood') {
        out.position
          .copy(this.targetPos)
          .addScaledVector(this.forwardVec, sp.hoodCamZ)
          .setY(y + sp.hoodCamY + kerbBob * 0.8);
        out.lookTarget
          .copy(this.targetPos)
          .addScaledVector(this.sideVec, steerPeek * 1.2)
          .addScaledVector(this.forwardVec, 28.0)
          .setY(y + sp.hoodCamY - 0.15);
        targetFov = 60 + speedRatio * 5.5 + boostExtraFov;
        targetNear = 0.2;
        posRate = 36;
        lookRate = 36;
      } else if (perspective === 'wide') {
        out.position
          .copy(this.targetPos)
          .addScaledVector(this.forwardVec, -20.5)
          .addScaledVector(this.sideVec, -latSlip * 0.16)
          .setY(y + 9.5);
        out.lookTarget
          .copy(this.targetPos)
          .addScaledVector(this.sideVec, steerPeek * 0.9)
          .addScaledVector(this.forwardVec, 7.5)
          .setY(y + 1.4);
        targetFov = 44 + speedRatio * 3.5 + boostExtraFov * 0.7;
        targetNear = 0.5;
        posRate = 8.5;
        lookRate = 11.5;
      } else {
        // 'chase' — swings subtly outward on drifts & peeks toward corner apex
        const driftPullBack = state.isDrifting ? 0.65 : 0;
        out.position
          .copy(this.targetPos)
          .addScaledVector(this.forwardVec, -(sp.chaseDist + driftPullBack))
          .addScaledVector(this.sideVec, -latSlip * 0.2)
          .setY(y + sp.chaseHeight);
        out.lookTarget
          .copy(this.targetPos)
          .addScaledVector(this.sideVec, steerPeek)
          .addScaledVector(this.forwardVec, 6.2)
          .setY(y + 1.35);
        targetFov = 48 + speedRatio * 5.0 + boostExtraFov;
        targetNear = 0.45;
      }
    } else {
      // Walking character perspectives
      if (perspective === 'cockpit') {
        out.position
          .copy(this.targetPos)
          .addScaledVector(this.forwardVec, 0.18)
          .setY(y + 1.84);
        out.lookTarget
          .copy(this.targetPos)
          .addScaledVector(this.forwardVec, 20.0)
          .setY(y + 1.62);
        targetFov = 64;
        targetNear = 0.15;
        posRate = 40;
        lookRate = 40;
      } else if (perspective === 'hood') {
        out.position
          .copy(this.targetPos)
          .addScaledVector(this.forwardVec, -3.1)
          .addScaledVector(this.sideVec, -1.1)
          .setY(y + 2.05);
        out.lookTarget
          .copy(this.targetPos)
          .addScaledVector(this.forwardVec, 11.0)
          .setY(y + 1.55);
        targetFov = 52;
        targetNear = 0.25;
        posRate = 18;
        lookRate = 20;
      } else if (perspective === 'wide') {
        out.position
          .copy(this.targetPos)
          .addScaledVector(this.forwardVec, -12.5)
          .setY(y + 6.2);
        out.lookTarget
          .copy(this.targetPos)
          .addScaledVector(this.forwardVec, 5.0)
          .setY(y + 1.35);
        targetFov = 44;
        targetNear = 0.5;
        posRate = 9;
        lookRate = 11;
      } else {
        out.position
          .copy(this.targetPos)
          .addScaledVector(this.forwardVec, -7.4)
          .setY(y + 3.45);
        out.lookTarget
          .copy(this.targetPos)
          .addScaledVector(this.forwardVec, 4.5)
          .setY(y + 1.45);
        targetFov = 46;
        targetNear = 0.4;
      }
    }

    out.fov = targetFov;
    out.near = targetNear;
    out.posRate = posRate;
    out.lookRate = lookRate;
    return out;
  }

  private readonly poseScratch: FollowCameraPose = {
    position: this.desiredPos,
    lookTarget: this.desiredLook,
    fov: 46,
    near: 0.45,
    posRate: 10,
    lookRate: 13,
  };

  /**
   * Updates or snaps `camera` and `lookAtTarget` to follow the active player/vehicle.
   */
  public update(
    camera: THREE.PerspectiveCamera,
    lookAtTarget: THREE.Vector3,
    perspective: FollowPerspective,
    state: FollowCameraTargetState,
    dt: number,
    snapImmediately = false,
  ): void {
    this.rumbleTime += dt;
    const pose = this.computeDesiredPose(perspective, state, this.poseScratch);

    if (snapImmediately) {
      camera.position.copy(pose.position);
      lookAtTarget.copy(pose.lookTarget);
      camera.fov = pose.fov;
      camera.near = pose.near;
      camera.updateProjectionMatrix();
    } else {
      const posAlpha = 1 - Math.exp(-pose.posRate * dt);
      const lookAlpha = 1 - Math.exp(-pose.lookRate * dt);
      camera.position.lerp(pose.position, posAlpha);
      lookAtTarget.lerp(pose.lookTarget, lookAlpha);

      let projDirty = false;
      if (Math.abs(camera.near - pose.near) > 0.03) {
        camera.near = pose.near;
        projDirty = true;
      }
      if (Math.abs(camera.fov - pose.fov) > 0.05) {
        camera.fov += (pose.fov - camera.fov) * (1 - Math.exp(-10 * dt));
        projDirty = true;
      }
      if (projDirty) {
        camera.updateProjectionMatrix();
      }
    }

    camera.lookAt(lookAtTarget);
  }
}
