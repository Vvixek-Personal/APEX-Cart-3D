import * as THREE from 'three';

export interface VehicleEffectsInput {
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  lateralSpeed: number;
  isDrifting: boolean;
  braking: boolean;
  onAsphalt: boolean;
  boostActive: boolean;
  rearTrackHalfWidth: number;
  rearAxleOffset: number;
}

interface SmokeParticle {
  alive: boolean;
  age: number;
  maxAge: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  sizeStart: number;
  sizeEnd: number;
  r: number;
  g: number;
  b: number;
}

const MAX_SKID_QUADS = 360;
const MAX_PARTICLES = 96;

/**
 * Zero-GC real-time tire skid mark ribbon pool + soft smoke/dust/boost particle emitter.
 */
export class VehicleEffectsSystem {
  public readonly group = new THREE.Group();

  private readonly skidGeo: THREE.BufferGeometry;
  private readonly skidMat: THREE.MeshBasicMaterial;
  private readonly skidPositions: Float32Array;
  private skidHead = 0;
  private lastLeftX = 0;
  private lastLeftZ = 0;
  private lastRightX = 0;
  private lastRightZ = 0;
  private hasPrevSkid = false;

  private readonly particleMesh: THREE.InstancedMesh;
  private readonly particleGeo: THREE.BufferGeometry;
  private readonly particleMat: THREE.MeshBasicMaterial;
  private readonly particles: SmokeParticle[] = [];
  private particleCursor = 0;
  private emitTimer = 0;

  private readonly dummy = new THREE.Object3D();
  private readonly colorScratch = new THREE.Color();

  constructor() {
    this.group.name = 'VEHICLE_EFFECTS';

    // 1. Ring-buffered flat quad pool for asphalt tire skid marks (2 triangles = 6 verts per quad)
    this.skidPositions = new Float32Array(MAX_SKID_QUADS * 6 * 3);
    this.skidGeo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(this.skidPositions, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    this.skidGeo.setAttribute('position', posAttr);

    this.skidMat = new THREE.MeshBasicMaterial({
      color: 0x14181f,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });

    const skidMesh = new THREE.Mesh(this.skidGeo, this.skidMat);
    skidMesh.frustumCulled = false;
    this.group.add(skidMesh);

    // 2. Low-poly puffed smoke / turf dust / boost spark instanced spheres
    this.particleGeo = new THREE.IcosahedronGeometry(0.42, 1);
    this.particleMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    });
    this.particleMesh = new THREE.InstancedMesh(
      this.particleGeo,
      this.particleMat,
      MAX_PARTICLES,
    );
    this.particleMesh.frustumCulled = false;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        alive: false,
        age: 0,
        maxAge: 0.6,
        x: 0,
        y: -100,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        sizeStart: 0.3,
        sizeEnd: 1.2,
        r: 0.9,
        g: 0.92,
        b: 0.95,
      });
      this.dummy.position.set(0, -100, 0);
      this.dummy.scale.setScalar(0.001);
      this.dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, this.dummy.matrix);
      this.particleMesh.setColorAt(i, this.colorScratch.setRGB(1, 1, 1));
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    this.group.add(this.particleMesh);
  }

  public resetStreak(): void {
    this.hasPrevSkid = false;
  }

  private writeSkidSegment(
    ax: number,
    az: number,
    bx: number,
    bz: number,
    y: number,
    halfWidth: number,
  ): void {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 0.05 || len > 4.0) return;

    const nx = (-dz / len) * halfWidth;
    const nz = (dx / len) * halfWidth;
    const base = this.skidHead * 18;
    this.skidHead = (this.skidHead + 1) % MAX_SKID_QUADS;

    const p = this.skidPositions;
    // Tri 1
    p[base] = ax - nx; p[base + 1] = y; p[base + 2] = az - nz;
    p[base + 3] = ax + nx; p[base + 4] = y; p[base + 5] = az + nz;
    p[base + 6] = bx + nx; p[base + 7] = y; p[base + 8] = bz + nz;
    // Tri 2
    p[base + 9] = ax - nx; p[base + 10] = y; p[base + 11] = az - nz;
    p[base + 12] = bx + nx; p[base + 13] = y; p[base + 14] = bz + nz;
    p[base + 15] = bx - nx; p[base + 16] = y; p[base + 17] = bz - nz;

    this.skidGeo.attributes.position.needsUpdate = true;
  }

  private spawnParticle(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    maxAge: number,
    sizeStart: number,
    sizeEnd: number,
    r: number,
    g: number,
    b: number,
  ): void {
    const p = this.particles[this.particleCursor];
    this.particleCursor = (this.particleCursor + 1) % MAX_PARTICLES;
    p.alive = true;
    p.age = 0;
    p.maxAge = maxAge;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.sizeStart = sizeStart;
    p.sizeEnd = sizeEnd;
    p.r = r;
    p.g = g;
    p.b = b;
  }

  public update(activeVehicle: VehicleEffectsInput | null, dt: number): void {
    if (activeVehicle) {
      const fwdX = Math.sin(activeVehicle.yaw);
      const fwdZ = Math.cos(activeVehicle.yaw);
      const sideX = Math.cos(activeVehicle.yaw);
      const sideZ = -Math.sin(activeVehicle.yaw);

      const rearCenterX = activeVehicle.x - fwdX * activeVehicle.rearAxleOffset;
      const rearCenterZ = activeVehicle.z - fwdZ * activeVehicle.rearAxleOffset;

      const lx = rearCenterX + sideX * activeVehicle.rearTrackHalfWidth;
      const lz = rearCenterZ + sideZ * activeVehicle.rearAxleOffset * 0 + sideZ * activeVehicle.rearTrackHalfWidth;
      const rx = rearCenterX - sideX * activeVehicle.rearTrackHalfWidth;
      const rz = rearCenterZ - sideZ * activeVehicle.rearTrackHalfWidth;

      const absSpeed = Math.abs(activeVehicle.speed);
      const absSlip = Math.abs(activeVehicle.lateralSpeed);
      const hardBraking = activeVehicle.braking && activeVehicle.speed > 10;
      const layingRubber =
        activeVehicle.onAsphalt &&
        (activeVehicle.isDrifting || hardBraking || absSlip > 3.2) &&
        absSpeed > 5.5;

      if (layingRubber) {
        if (this.hasPrevSkid) {
          const skidY = activeVehicle.y + 0.085;
          this.writeSkidSegment(this.lastLeftX, this.lastLeftZ, lx, lz, skidY, 0.2);
          this.writeSkidSegment(this.lastRightX, this.lastRightZ, rx, rz, skidY, 0.2);
        }
        this.lastLeftX = lx;
        this.lastLeftZ = lz;
        this.lastRightX = rx;
        this.lastRightZ = rz;
        this.hasPrevSkid = true;
      } else {
        this.hasPrevSkid = false;
      }

      // Emit tire smoke, off-track turf dust, or exit-boost exhaust puffs
      const offTrackKick = !activeVehicle.onAsphalt && absSpeed > 5.0;
      if (layingRubber || offTrackKick || activeVehicle.boostActive) {
        this.emitTimer += dt;
        const interval = activeVehicle.boostActive ? 0.022 : 0.035;
        while (this.emitTimer >= interval) {
          this.emitTimer -= interval;
          const jitter = () => (Math.random() - 0.5) * 1.4;

          if (activeVehicle.boostActive) {
            this.spawnParticle(
              rearCenterX + jitter() * 0.3,
              activeVehicle.y + 0.42,
              rearCenterZ + jitter() * 0.3,
              -fwdX * 4 + jitter(),
              0.9 + Math.random() * 0.8,
              -fwdZ * 4 + jitter(),
              0.32,
              0.35,
              0.95,
              1.0,
              0.72,
              0.22,
            );
          } else if (layingRubber) {
            for (const [wx, wz] of [
              [lx, lz],
              [rx, rz],
            ]) {
              this.spawnParticle(
                wx + jitter() * 0.2,
                activeVehicle.y + 0.25,
                wz + jitter() * 0.2,
                jitter() * 1.2,
                1.1 + Math.random() * 1.1,
                jitter() * 1.2,
                0.55,
                0.42,
                1.65,
                0.92,
                0.95,
                0.98,
              );
            }
          } else if (offTrackKick) {
            const sidePick = Math.random() > 0.5 ? [lx, lz] : [rx, rz];
            this.spawnParticle(
              sidePick[0] + jitter() * 0.25,
              activeVehicle.y + 0.22,
              sidePick[1] + jitter() * 0.25,
              jitter() * 1.1,
              1.0 + Math.random() * 0.9,
              jitter() * 1.1,
              0.48,
              0.35,
              1.25,
              0.55,
              0.68,
              0.42,
            );
          }
        }
      } else {
        this.emitTimer = 0;
      }
    } else {
      this.hasPrevSkid = false;
    }

    // Step active particles
    let anyUpdated = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.alive) continue;
      anyUpdated = true;
      p.age += dt;
      if (p.age >= p.maxAge) {
        p.alive = false;
        this.dummy.position.set(0, -100, 0);
        this.dummy.scale.setScalar(0.001);
        this.dummy.updateMatrix();
        this.particleMesh.setMatrixAt(i, this.dummy.matrix);
        continue;
      }
      const t = p.age / p.maxAge;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy *= Math.exp(-1.8 * dt);

      const scale = THREE.MathUtils.lerp(p.sizeStart, p.sizeEnd, t) * (1 - t * 0.55);
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.scale.setScalar(Math.max(0.02, scale));
      this.dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, this.dummy.matrix);

      const fade = 1 - t * 0.35;
      this.colorScratch.setRGB(p.r * fade, p.g * fade, p.b * fade);
      this.particleMesh.setColorAt(i, this.colorScratch);
    }

    if (anyUpdated) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) {
        this.particleMesh.instanceColor.needsUpdate = true;
      }
    }
  }

  public reset(): void {
    this.skidPositions.fill(0);
    this.skidHead = 0;
    this.hasPrevSkid = false;
    this.skidGeo.attributes.position.needsUpdate = true;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles[i].alive = false;
      this.dummy.position.set(0, -100, 0);
      this.dummy.scale.setScalar(0.001);
      this.dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
  }

  public dispose(): void {
    this.skidGeo.dispose();
    this.skidMat.dispose();
    this.particleGeo.dispose();
    this.particleMat.dispose();
  }
}
