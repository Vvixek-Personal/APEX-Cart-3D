import * as THREE from 'three';
import {
  BANNER_TOTAL_HEIGHT,
  FIELD_HALF,
  PARK_HALF,
  STADIUM_NORTH_CANOPY_HEIGHT,
  STADIUM_TOWER_HEIGHT,
  STADIUM_TOWER_OFFSET,
  TRACK_LAYOUT_SCALE,
} from '../track/trackLayout';

export interface SpectatorCameraConfig {
  /** Elevated camera angle above the horizontal XZ plane in degrees (35–55 recommended). */
  spectatorElevation: number;
  /** Initial horizontal azimuth around Y in degrees (0 = +Z South, +34 = SE three-quarter). */
  spectatorAzimuth: number;
  /** Optional fixed distance override; null lets intelligent framing compute distance. */
  spectatorDistance: number | null;
  /** Vertical target anchor height above the ground plane for skyline framing. */
  spectatorTargetHeight: number;
  /** Cinematic lens vertical field of view in degrees. */
  spectatorFov: number;
  /** Subtle architectural pitch tilt in degrees (negative tilts slightly toward horizon). */
  spectatorTilt: number;
  /** Exponential smoothing damping rate (1/sec) for position, target, and rotation. */
  spectatorDamping: number;
  /** Subtle continuous orbital drift rate in degrees/second (0 disables drift). */
  spectatorOrbitSpeed: number;
  /** Viewport edge padding fraction in NDC space (0.04–0.20). */
  spectatorFramingPadding: number;
}

export const DEFAULT_SPECTATOR_CAMERA_CONFIG: SpectatorCameraConfig = {
  spectatorElevation: 36,
  spectatorAzimuth: 36,
  spectatorDistance: null,
  spectatorTargetHeight: 6.5,
  spectatorFov: 42,
  spectatorTilt: -5.5,
  spectatorDamping: 3.6,
  spectatorOrbitSpeed: 0.55,
  spectatorFramingPadding: 0.048,
};

export interface SpectatorSceneBounds {
  trackHalfExtent: number;
  stadiumHalfExtent: number;
  parkHalfExtent: number;
}

export const DEFAULT_SPECTATOR_SCENE_BOUNDS: SpectatorSceneBounds = {
  trackHalfExtent: 104,
  stadiumHalfExtent: 166,
  parkHalfExtent: PARK_HALF,
};

export interface SpectatorPoseOutput {
  position: THREE.Vector3;
  target: THREE.Vector3;
  lookTarget: THREE.Vector3;
  fov: number;
  near: number;
  far: number;
  distance: number;
  elevationDeg: number;
  azimuthDeg: number;
}

/**
 * Pure helper to clamp and resolve effective elevation/padding for responsive viewports.
 */
export function resolveResponsiveSpectatorParams(
  aspect: number,
  config: SpectatorCameraConfig,
): {
  elevationDeg: number;
  fov: number;
  tiltDeg: number;
  padding: number;
  kartBiasWeight: number;
  kartBiasMaxOffset: number;
  prioritizeTrackAndKart: boolean;
} {
  const safeAspect = Math.max(aspect, 0.35);
  const isPortrait = safeAspect < 0.92;
  const isCompactLandscape = safeAspect >= 0.92 && safeAspect < 1.35;

  // Keep camera strictly inside the 35–55 degree diagonal window across all viewports.
  // Portrait phones lift slightly (~42 deg) so the full circuit & kart stay legible.
  const baseElev = THREE.MathUtils.clamp(config.spectatorElevation, 35, 55);
  const responsiveElev = isPortrait
    ? THREE.MathUtils.clamp(baseElev + 5.0, 35, 55)
    : isCompactLandscape
      ? THREE.MathUtils.clamp(baseElev + 2.0, 35, 55)
      : baseElev;

  // Desktop keeps cinematic 40 deg vertical FOV; narrow portrait screens gently widen
  // vertical FOV so horizontal track/stadium span stays large and legible.
  const portraitMix = THREE.MathUtils.clamp((1.0 - safeAspect) / 0.55, 0, 1);
  const responsiveFov = THREE.MathUtils.lerp(
    config.spectatorFov,
    Math.min(config.spectatorFov + 10, 50),
    portraitMix,
  );

  // Reduce upward horizon tilt on portrait phones so the circuit stays cleanly above mobile controls.
  const tiltDeg = isPortrait ? config.spectatorTilt * 0.42 : config.spectatorTilt;

  const padding = isPortrait
    ? Math.max(0.045, config.spectatorFramingPadding * 0.85)
    : config.spectatorFramingPadding;

  return {
    elevationDeg: responsiveElev,
    fov: responsiveFov,
    tiltDeg,
    padding,
    kartBiasWeight: isPortrait ? 0.14 : 0.09,
    kartBiasMaxOffset: isPortrait ? 18 : 12,
    prioritizeTrackAndKart: isPortrait,
  };
}

/**
 * Stateful, GC-free cinematic aerial skyline spectator camera controller.
 * Computes intelligent three-quarter framing from track + stadium + kart + viewport,
 * and applies smooth exponential damping to position, target, and orientation.
 */
export class SpectatorCameraController {
  public readonly config: SpectatorCameraConfig;
  public readonly bounds: SpectatorSceneBounds;

  private readonly anchors: THREE.Vector3[] = [];
  private readonly probeCam = new THREE.PerspectiveCamera(38, 1.6, 10, 5000);
  private readonly dirScratch = new THREE.Vector3();
  private readonly targetScratch = new THREE.Vector3();
  private readonly lookTargetScratch = new THREE.Vector3();
  private readonly posScratch = new THREE.Vector3();
  private readonly projScratch = new THREE.Vector3();
  private readonly lookMatrixScratch = new THREE.Matrix4();
  private readonly desiredQuatScratch = new THREE.Quaternion();
  private readonly upVec = new THREE.Vector3(0, 1, 0);

  private readonly smoothedPos = new THREE.Vector3();
  private readonly smoothedTarget = new THREE.Vector3();
  private readonly smoothedLookTarget = new THREE.Vector3();
  private smoothedFov: number;
  private smoothedNear = 14;
  private smoothedDistance = 720;
  private initialized = false;
  private elapsedOrbitSeconds = 0;

  constructor(
    config: Partial<SpectatorCameraConfig> = {},
    bounds: SpectatorSceneBounds = DEFAULT_SPECTATOR_SCENE_BOUNDS,
  ) {
    this.config = { ...DEFAULT_SPECTATOR_CAMERA_CONFIG, ...config };
    this.bounds = bounds;
    this.smoothedFov = this.config.spectatorFov;

    // Pre-allocate framing anchor slots (track, banners, stands, pavilion, towers, kart)
    for (let i = 0; i < 25; i++) {
      this.anchors.push(new THREE.Vector3());
    }
  }

  public resetDrift(): void {
    this.elapsedOrbitSeconds = 0;
  }

  /**
   * Populates framing anchor points (zero allocations) and solves the optimal camera distance
   * so track, kart, and surrounding stadium framing stay cleanly inside the viewport.
   */
  public computeDesiredPose(
    aspect: number,
    kartX: number,
    kartZ: number,
    driftSeconds: number,
    out: SpectatorPoseOutput,
  ): void {
    const safeAspect = Math.max(aspect, 0.35);
    const resp = resolveResponsiveSpectatorParams(safeAspect, this.config);

    // Subtle elevation variation over ~40s + gentle bounded three-quarter orbital drift
    const elevWave = 0.85 * Math.sin(driftSeconds * 0.16);
    const elevationDeg = THREE.MathUtils.clamp(resp.elevationDeg + elevWave, 35, 55);
    const orbitArcDeg = 22;
    const azimuthOffsetDeg =
      this.config.spectatorOrbitSpeed === 0
        ? 0
        : orbitArcDeg * Math.sin((driftSeconds * this.config.spectatorOrbitSpeed) / orbitArcDeg);
    const azimuthDeg = this.config.spectatorAzimuth + azimuthOffsetDeg;

    const elevRad = THREE.MathUtils.degToRad(elevationDeg);
    const azimRad = THREE.MathUtils.degToRad(azimuthDeg);
    const cosElev = Math.cos(elevRad);

    this.dirScratch
      .set(
        cosElev * Math.sin(azimRad),
        Math.sin(elevRad),
        cosElev * Math.cos(azimRad),
      )
      .normalize();

    // Subtle kart composition pull (shifts gently south when kart is in town so both town & stadium stay framed)
    const biasX = THREE.MathUtils.clamp(
      kartX * resp.kartBiasWeight,
      -resp.kartBiasMaxOffset,
      resp.kartBiasMaxOffset,
    );
    const townCenterPull = kartZ > 156 ? 165 : 0;
    const biasZ = THREE.MathUtils.clamp(
      townCenterPull + kartZ * resp.kartBiasWeight,
      -resp.kartBiasMaxOffset,
      215,
    );
    this.targetScratch.set(biasX, this.config.spectatorTargetHeight, biasZ);

    // Build framing anchors:
    // 0..3: Track outer envelope (always kept fully visible)
    const tH = this.bounds.trackHalfExtent;
    this.anchors[0].set(-tH, 0.2, -tH);
    this.anchors[1].set(tH, 0.2, -tH);
    this.anchors[2].set(-tH, 0.2, tH);
    this.anchors[3].set(tH, 0.2, tH);

    // 4..5: START & FINISH banners
    this.anchors[4].set(40 * TRACK_LAYOUT_SCALE, BANNER_TOTAL_HEIGHT, 10 * TRACK_LAYOUT_SCALE);
    this.anchors[5].set(40 * TRACK_LAYOUT_SCALE, BANNER_TOTAL_HEIGHT, 31 * TRACK_LAYOUT_SCALE);

    // 6: Live kart position (always stays clearly inside viewport)
    this.anchors[6].set(kartX, 1.5, kartZ);

    // 7..14: Grass field & core stadium architectural silhouettes
    const sH = resp.prioritizeTrackAndKart
      ? FIELD_HALF + 12
      : this.bounds.stadiumHalfExtent;
    this.anchors[7].set(-sH, 0, -sH);
    this.anchors[8].set(sH, 0, -sH);
    this.anchors[9].set(-sH, 0, sH);
    this.anchors[10].set(sH, 0, sH);

    // North Multi-tier Grandstand canopy, East Pavilion, West Stand, South Stand
    this.anchors[11].set(-98, STADIUM_NORTH_CANOPY_HEIGHT, -172);
    this.anchors[12].set(98, STADIUM_NORTH_CANOPY_HEIGHT, -172);
    this.anchors[13].set(162, 15, 0);
    this.anchors[14].set(-156, 14, 0);

    // 15..20: Scoreboard + Corner floodlight towers
    const towerY = resp.prioritizeTrackAndKart ? 18 : STADIUM_TOWER_HEIGHT;
    const towerXZ = resp.prioritizeTrackAndKart ? FIELD_HALF + 14 : STADIUM_TOWER_OFFSET;
    this.anchors[15].set(-124, 24, -142);
    this.anchors[16].set(-towerXZ, towerY, -towerXZ);
    this.anchors[17].set(towerXZ, towerY, -towerXZ);
    this.anchors[18].set(-towerXZ, towerY, towerXZ);
    this.anchors[19].set(towerXZ, towerY, towerXZ);
    this.anchors[20].set(0, 8, 150);

    // 21..24: Extend anchors to include the widened Town District when kart is in town
    const outerExt = resp.prioritizeTrackAndKart ? sH : this.bounds.stadiumHalfExtent;
    const sideExt = kartZ > 156 ? Math.max(outerExt, 252) : outerExt;
    const southExt = kartZ > 156 ? 540 : outerExt;
    this.anchors[21].set(-sideExt, 0, -outerExt);
    this.anchors[22].set(sideExt, 0, -outerExt);
    this.anchors[23].set(-sideExt, 0, southExt);
    this.anchors[24].set(sideExt, 0, southExt);

    const maxAllowedNdc = 1 - resp.padding;
    const fov = resp.fov;
    const tiltRad = THREE.MathUtils.degToRad(-resp.tiltDeg);

    let distance = this.config.spectatorDistance ?? 640;
    if (this.config.spectatorDistance === null) {
      this.probeCam.fov = fov;
      this.probeCam.aspect = safeAspect;
      this.probeCam.near = 12;
      this.probeCam.far = 4800;
      this.probeCam.updateProjectionMatrix();

      let low = 240;
      let high = 2800;
      for (let iter = 0; iter < 26; iter++) {
        const mid = (low + high) * 0.5;
        this.posScratch.copy(this.targetScratch).addScaledVector(this.dirScratch, mid);
        const tiltOffsetY = mid * Math.tan(tiltRad);
        this.lookTargetScratch.copy(this.targetScratch);
        this.lookTargetScratch.y += tiltOffsetY;

        this.probeCam.position.copy(this.posScratch);
        this.probeCam.lookAt(this.lookTargetScratch);
        this.probeCam.updateMatrixWorld(true);

        let maxAbsNdc = 0;
        for (let i = 0; i < this.anchors.length; i++) {
          this.projScratch.copy(this.anchors[i]).project(this.probeCam);
          const ax = Math.abs(this.projScratch.x);
          const ay = Math.abs(this.projScratch.y);
          if (ax > maxAbsNdc) maxAbsNdc = ax;
          if (ay > maxAbsNdc) maxAbsNdc = ay;
        }

        if (maxAbsNdc > maxAllowedNdc) {
          low = mid;
        } else {
          high = mid;
        }
      }
      distance = high;
    }

    const tiltOffsetY = distance * Math.tan(tiltRad);
    out.position.copy(this.targetScratch).addScaledVector(this.dirScratch, distance);
    out.target.copy(this.targetScratch);
    out.lookTarget.copy(this.targetScratch);
    out.lookTarget.y += tiltOffsetY;
    out.fov = fov;
    out.near = Math.max(12, distance * 0.035);
    out.far = 4800;
    out.distance = distance;
    out.elevationDeg = elevationDeg;
    out.azimuthDeg = azimuthDeg;
  }

  private readonly poseScratch: SpectatorPoseOutput = {
    position: new THREE.Vector3(),
    target: new THREE.Vector3(),
    lookTarget: new THREE.Vector3(),
    fov: 38,
    near: 14,
    far: 4800,
    distance: 720,
    elevationDeg: 39,
    azimuthDeg: 34,
  };

  /**
   * Snap camera & internal damped state immediately to the current cinematic skyline pose.
   */
  public snapToPose(
    camera: THREE.PerspectiveCamera,
    aspect: number,
    kartX: number,
    kartZ: number,
    orbitTargetOut?: THREE.Vector3,
  ): SpectatorPoseOutput {
    this.computeDesiredPose(aspect, kartX, kartZ, this.elapsedOrbitSeconds, this.poseScratch);

    this.smoothedPos.copy(this.poseScratch.position);
    this.smoothedTarget.copy(this.poseScratch.target);
    this.smoothedLookTarget.copy(this.poseScratch.lookTarget);
    this.smoothedFov = this.poseScratch.fov;
    this.smoothedNear = this.poseScratch.near;
    this.smoothedDistance = this.poseScratch.distance;
    this.initialized = true;

    camera.position.copy(this.smoothedPos);
    camera.fov = this.smoothedFov;
    camera.near = this.smoothedNear;
    camera.far = this.poseScratch.far;
    camera.lookAt(this.smoothedLookTarget);
    camera.updateProjectionMatrix();

    if (orbitTargetOut) {
      orbitTargetOut.copy(this.smoothedLookTarget);
    }
    return this.poseScratch;
  }

  /**
   * Advances smooth damped spectator camera motion without per-frame heap allocations.
   */
  public update(
    camera: THREE.PerspectiveCamera,
    aspect: number,
    kartX: number,
    kartZ: number,
    dt: number,
    orbitTargetOut?: THREE.Vector3,
    isReturningFromFollow = false,
  ): { converged: boolean; distance: number; elevationDeg: number; azimuthDeg: number } {
    this.elapsedOrbitSeconds += dt;
    this.computeDesiredPose(aspect, kartX, kartZ, this.elapsedOrbitSeconds, this.poseScratch);

    if (!this.initialized) {
      this.snapToPose(camera, aspect, kartX, kartZ, orbitTargetOut);
      return {
        converged: true,
        distance: this.smoothedDistance,
        elevationDeg: this.poseScratch.elevationDeg,
        azimuthDeg: this.poseScratch.azimuthDeg,
      };
    }

    // Blend quickly when transitioning back from follow mode so switching feels crisp
    const rate = isReturningFromFollow
      ? Math.max(this.config.spectatorDamping * 3.8, 14)
      : this.config.spectatorDamping;
    const posAlpha = 1 - Math.exp(-rate * dt);
    const rotAlpha = 1 - Math.exp(-(rate * 1.15) * dt);

    if (isReturningFromFollow) {
      this.smoothedPos.copy(camera.position).lerp(this.poseScratch.position, posAlpha);
      this.smoothedFov = THREE.MathUtils.lerp(camera.fov, this.poseScratch.fov, posAlpha);
      this.smoothedNear = THREE.MathUtils.lerp(camera.near, this.poseScratch.near, posAlpha);
    } else {
      this.smoothedPos.lerp(this.poseScratch.position, posAlpha);
      this.smoothedFov = THREE.MathUtils.lerp(this.smoothedFov, this.poseScratch.fov, posAlpha);
      this.smoothedNear = THREE.MathUtils.lerp(this.smoothedNear, this.poseScratch.near, posAlpha);
    }

    this.smoothedTarget.lerp(this.poseScratch.target, posAlpha);
    this.smoothedLookTarget.lerp(this.poseScratch.lookTarget, posAlpha);
    this.smoothedDistance = THREE.MathUtils.lerp(
      this.smoothedDistance,
      this.poseScratch.distance,
      posAlpha,
    );

    camera.position.copy(this.smoothedPos);

    let projDirty = false;
    if (Math.abs(camera.fov - this.smoothedFov) > 0.02) {
      camera.fov = this.smoothedFov;
      projDirty = true;
    }
    if (Math.abs(camera.near - this.smoothedNear) > 0.05) {
      camera.near = this.smoothedNear;
      projDirty = true;
    }
    if (camera.far !== this.poseScratch.far) {
      camera.far = this.poseScratch.far;
      projDirty = true;
    }
    if (projDirty) {
      camera.updateProjectionMatrix();
    }

    // Damped rotational slerp toward smoothed look target
    this.lookMatrixScratch.lookAt(this.smoothedPos, this.smoothedLookTarget, this.upVec);
    this.desiredQuatScratch.setFromRotationMatrix(this.lookMatrixScratch);
    camera.quaternion.slerp(this.desiredQuatScratch, rotAlpha);

    if (orbitTargetOut) {
      orbitTargetOut.copy(this.smoothedLookTarget);
    }

    const distToGoal = camera.position.distanceTo(this.poseScratch.position);
    const fovDiff = Math.abs(camera.fov - this.poseScratch.fov);
    return {
      converged:
        distToGoal < Math.max(3.5, this.poseScratch.distance * 0.005) &&
        fovDiff < 0.25,
      distance: this.smoothedDistance,
      elevationDeg: this.poseScratch.elevationDeg,
      azimuthDeg: this.poseScratch.azimuthDeg,
    };
  }
}
