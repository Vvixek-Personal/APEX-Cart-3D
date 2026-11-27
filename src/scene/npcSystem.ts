import * as THREE from 'three';
import {
  COASTAL_SIGNALS,
  NPC_ROUTES,
  SIGNAL_PHASE_OFFSETS,
  sampleSignalPhase,
} from './coastalCityLayout';
import { getWorldGroundY } from './townLayout';

/**
 * Instanced pedestrian system. Every NPC owns a private routine:
 *  - a fixed looping route (sidewalk-sampled splines in either city),
 *  - a personal walking speed, stride, side-of-path offset and body scale,
 *  - scheduled errand stops along its route (shop windows, vending, benches)
 *    with individual durations, then it picks the next errand,
 *  - traffic-signal obedience: it halts before any junction whose light is
 *    red/amber for its direction of travel, re-checking until it turns green,
 *  - a personal night cutoff: as `nightFactor` rises past it the NPC fades
 *    out headed home, so streets thin after dark (a few night owls remain).
 *
 * All bodies render through seven InstancedMeshes (one draw call each) with
 * preallocated Matrix4/Quaternion scratch — zero per-frame allocation.
 */

export interface NpcSystem {
  group: THREE.Group;
  update: (elapsedSeconds: number, dt: number, nightFactor: number) => void;
  dispose: () => void;
}

interface RouteData {
  xs: Float32Array;
  zs: Float32Array;
  cum: Float32Array; // cumulative arc length at each point (length n)
  segLen: Float32Array; // length of segment i → i+1 (length n)
  total: number;
  /** Road half-width the route follows; NPCs walk on its sidewalk. */
  halfWidth: number;
}

const NPC_COUNT = 60;
/** Per-route head-count: coastal routes busier, town promenade moderate. */
const ROUTE_WEIGHTS = [9, 8, 8, 8, 7, 7, 7, 6]; // sums to 60

const SHIRT_COLORS = [
  0x3b82f6, 0xef4444, 0xf59e0b, 0x10b981, 0x8b5cf6, 0xec4899,
  0x06b6d4, 0xf97316, 0x84cc16, 0x64748b, 0x1d4ed8, 0xbe123c,
];
const PANT_COLORS = [
  0x1f2937, 0x374151, 0x1e3a8a, 0x3f2d1e, 0x4b5563, 0x111827, 0x5b4636,
];
const SKIN_COLORS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0xd9a066];
const HAIR_COLORS = [0x2b1d0e, 0x4a2f1a, 0x111111, 0x7a4a21, 0xd6b46a, 0x555555, 0x8c1c13];

function buildRouteData(): RouteData[] {
  return NPC_ROUTES.map((route) => {
    const n = route.loop.length;
    const xs = new Float32Array(n);
    const zs = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      xs[i] = route.loop[i].x;
      zs[i] = route.loop[i].z;
    }
    const cum = new Float32Array(n);
    const segLen = new Float32Array(n);
    let total = 0;
    for (let i = 0; i < n; i++) {
      cum[i] = total;
      const j = (i + 1) % n;
      const len = Math.hypot(xs[j] - xs[i], zs[j] - zs[i]);
      segLen[i] = len;
      total += len;
    }
    return { xs, zs, cum, segLen, total, halfWidth: route.halfWidth };
  });
}

export function createNpcSystem(): NpcSystem {
  const group = new THREE.Group();
  group.name = 'NPC_PEDESTRIAN_SYSTEM';

  const routes = buildRouteData();

  // ---- Per-NPC routine state (preallocated, GC-free) ----
  const routeIdx = new Uint8Array(NPC_COUNT);
  const dist = new Float32Array(NPC_COUNT);
  const speed = new Float32Array(NPC_COUNT);
  const sideSign = new Float32Array(NPC_COUNT); // ±1 which sidewalk
  const sideDist = new Float32Array(NPC_COUNT); // metres from centerline
  const bodyScale = new Float32Array(NPC_COUNT);
  const yaw = new Float32Array(NPC_COUNT);
  const walkPhase = new Float32Array(NPC_COUNT);
  const swing = new Float32Array(NPC_COUNT); // eased limb amplitude 0..1
  const nightCutoff = new Float32Array(NPC_COUNT);
  const alive = new Uint8Array(NPC_COUNT); // 1 = matrices currently written
  const stopIn = new Float32Array(NPC_COUNT); // metres until next errand stop
  const stopEndsAt = new Float32Array(NPC_COUNT); // sim time the pause ends
  const stopping = new Uint8Array(NPC_COUNT);
  const stopKind = new Uint8Array(NPC_COUNT); // 1 = errand, 2 = signal wait

  const rand = (() => {
    let s = 0x9e3779b9;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  })();

  // Assign NPCs across routes with individual routine parameters
  let npc = 0;
  for (let r = 0; r < routes.length && npc < NPC_COUNT; r++) {
    const weight = ROUTE_WEIGHTS[r] ?? 6;
    for (let k = 0; k < weight && npc < NPC_COUNT; k++, npc++) {
      const route = routes[r];
      routeIdx[npc] = r;
      dist[npc] = rand() * route.total;
      const jogger = rand() < 0.12;
      speed[npc] = jogger ? 2.3 + rand() * 0.5 : 1.05 + rand() * 0.65;
      // Walk on a sidewalk: just outside the curb, nudged toward the center
      // of the walkway so nobody clips buildings or wanders mid-asphalt.
      // Routes with halfWidth 0 already follow a sidewalk line (town loop),
      // so they only get a small personal wobble.
      sideSign[npc] = rand() < 0.5 ? -1 : 1;
      sideDist[npc] =
        route.halfWidth > 0 ? route.halfWidth + 1.5 + rand() * 1.5 : 0.6 + rand() * 0.8;
      const child = rand() < 0.12;
      bodyScale[npc] = child ? 0.68 + rand() * 0.1 : 0.93 + rand() * 0.13;
      // Most people head home as night falls; ~18% are night owls.
      nightCutoff[npc] = rand() < 0.18 ? 0.86 + rand() * 0.12 : 0.28 + rand() * 0.4;
      stopIn[npc] = 18 + rand() * 90;
      stopping[npc] = 0;
      stopKind[npc] = 0;
      alive[npc] = 0;
      yaw[npc] = 0;
      walkPhase[npc] = rand() * Math.PI * 2;
      swing[npc] = 1;
    }
  }

  // ---- Instanced body parts (7 draw calls total) ----
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const makeBox = (w: number, h: number, d: number, pivotTop = false): THREE.BufferGeometry => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (pivotTop) g.translate(0, -h * 0.5, 0); // origin at joint (hip/shoulder)
    geometries.push(g);
    return g;
  };

  const skinMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72 });
  const pantMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 });
  materials.push(skinMat, shirtMat, pantMat, hairMat);

  const legGeo = makeBox(0.16, 0.8, 0.18, true);
  const armGeo = makeBox(0.12, 0.52, 0.13, true);
  const torsoGeo = makeBox(0.4, 0.56, 0.24);
  const headGeo = makeBox(0.25, 0.26, 0.25);
  const hairGeo = makeBox(0.27, 0.14, 0.27);

  const legL = new THREE.InstancedMesh(legGeo, pantMat, NPC_COUNT);
  const legR = new THREE.InstancedMesh(legGeo, pantMat, NPC_COUNT);
  const armL = new THREE.InstancedMesh(armGeo, shirtMat, NPC_COUNT);
  const armR = new THREE.InstancedMesh(armGeo, shirtMat, NPC_COUNT);
  const torso = new THREE.InstancedMesh(torsoGeo, shirtMat, NPC_COUNT);
  const head = new THREE.InstancedMesh(headGeo, skinMat, NPC_COUNT);
  const hair = new THREE.InstancedMesh(hairGeo, hairMat, NPC_COUNT);

  const parts = [legL, legR, armL, armR, torso, head, hair];
  for (const p of parts) {
    p.castShadow = true;
    p.frustumCulled = false; // instances span the whole world
    group.add(p);
  }

  // One-time per-instance colors
  const cTmp = new THREE.Color();
  for (let i = 0; i < NPC_COUNT; i++) {
    const shirt = SHIRT_COLORS[Math.floor(rand() * SHIRT_COLORS.length)];
    const pants = PANT_COLORS[Math.floor(rand() * PANT_COLORS.length)];
    const skin = SKIN_COLORS[Math.floor(rand() * SKIN_COLORS.length)];
    const hairC = HAIR_COLORS[Math.floor(rand() * HAIR_COLORS.length)];
    cTmp.setHex(shirt);
    torso.setColorAt(i, cTmp);
    armL.setColorAt(i, cTmp);
    armR.setColorAt(i, cTmp);
    cTmp.setHex(pants);
    legL.setColorAt(i, cTmp);
    legR.setColorAt(i, cTmp);
    cTmp.setHex(skin);
    head.setColorAt(i, cTmp);
    cTmp.setHex(hairC);
    hair.setColorAt(i, cTmp);
  }
  for (const p of parts) {
    if (p.instanceColor) p.instanceColor.needsUpdate = true;
  }

  // ---- Scratch objects (zero allocation in update) ----
  const mBase = new THREE.Matrix4();
  const mLocal = new THREE.Matrix4();
  const mFinal = new THREE.Matrix4();
  const qYaw = new THREE.Quaternion();
  const qSwing = new THREE.Quaternion();
  const vPos = new THREE.Vector3();
  const vScale = new THREE.Vector3();
  const vOne = new THREE.Vector3(1, 1, 1);
  const vZero = new THREE.Vector3(0, 0, 0);
  const vOff = new THREE.Vector3();
  const eSwing = new THREE.Euler();
  const AXIS_Y = new THREE.Vector3(0, 1, 0);
  const hiddenPos = new THREE.Vector3(0, -80, 0);

  /** Sample route position + travel direction at arc-length `d`. */
  const sampleRoute = (
    r: RouteData,
    d: number,
    out: { x: number; z: number; dx: number; dz: number },
  ) => {
    const total = r.total;
    let dd = d % total;
    if (dd < 0) dd += total;
    const n = r.xs.length;
    // Find segment: last i with cum[i] <= dd (routes ≤ 32 points)
    let i = 0;
    for (let s = 0; s < n; s++) {
      if (r.cum[s] <= dd) i = s;
      else break;
    }
    const j = (i + 1) % n;
    const segLen = r.segLen[i];
    const t = segLen > 1e-5 ? (dd - r.cum[i]) / segLen : 0;
    const ax = r.xs[i];
    const az = r.zs[i];
    const bx = r.xs[j];
    const bz = r.zs[j];
    out.x = ax + (bx - ax) * t;
    out.z = az + (bz - az) * t;
    const len = segLen > 1e-5 ? segLen : 1;
    out.dx = (bx - ax) / len;
    out.dz = (bz - az) / len;
  };

  const posSample = { x: 0, z: 0, dx: 0, dz: 0 };

  const hideNPC = (i: number) => {
    mBase.compose(hiddenPos, qYaw, vZero);
    for (const p of parts) p.setMatrixAt(i, mBase);
    alive[i] = 0;
  };

  const update = (elapsedSeconds: number, dt: number, nightFactor: number) => {
    const step = Math.min(Math.max(dt, 0), 0.1);

    for (let i = 0; i < NPC_COUNT; i++) {
      const route = routes[routeIdx[i]];
      const cutoff = nightCutoff[i];

      // --- Night thinning: appear/disappear around this NPC's cutoff ---
      // appear = 1 well below cutoff, 0 above it (0.06-wide fade band).
      let appear = 1;
      if (nightFactor > cutoff - 0.04) {
        appear = 1 - (nightFactor - (cutoff - 0.04)) / 0.06;
        if (appear < 0) appear = 0;
        else if (appear > 1) appear = 1;
      }
      if (appear <= 0.02) {
        if (alive[i]) hideNPC(i);
        continue;
      }

      // --- Routine state machine ---
      if (stopping[i]) {
        if (elapsedSeconds >= stopEndsAt[i]) {
          stopping[i] = 0;
          if (stopKind[i] === 1) {
            // Finished an errand — pick the next one further along
            stopIn[i] = route.total * (0.12 + rand() * 0.33);
          }
          stopKind[i] = 0;
        }
      } else {
        // Advance toward the next errand stop
        dist[i] += speed[i] * step;
        stopIn[i] -= speed[i] * step;
        if (stopIn[i] <= 0) {
          stopping[i] = 1;
          stopKind[i] = 1;
          stopEndsAt[i] = elapsedSeconds + 2.5 + rand() * 6;
        } else {
          // --- Signal obedience: probe ahead; halt on red/amber ---
          sampleRoute(route, dist[i], posSample);
          const aheadX = posSample.x + posSample.dx * 7;
          const aheadZ = posSample.z + posSample.dz * 7;
          const axis: 'ns' | 'ew' =
            Math.abs(posSample.dz) >= Math.abs(posSample.dx) ? 'ns' : 'ew';
          for (let s = 0; s < COASTAL_SIGNALS.length; s++) {
            const sig = COASTAL_SIGNALS[s];
            const ddx = sig.x - aheadX;
            const ddz = sig.z - aheadZ;
            if (ddx * ddx + ddz * ddz < 484) {
              // within 22 m of the junction ahead
              const phase = sampleSignalPhase(elapsedSeconds, SIGNAL_PHASE_OFFSETS[s], axis);
              if (phase !== 'green') {
                stopping[i] = 1;
                stopKind[i] = 2;
                stopEndsAt[i] = elapsedSeconds + 0.7; // re-check the light
                break;
              }
            }
          }
        }
      }

      // --- Pose the body on its sidewalk ---
      sampleRoute(route, dist[i], posSample);
      const nx = -posSample.dz; // left normal of travel
      const nz = posSample.dx;
      const off = sideDist[i] * sideSign[i];
      const px = posSample.x + nx * off;
      const pz = posSample.z + nz * off;
      const py = getWorldGroundY(px, pz);

      const targetYaw = Math.atan2(posSample.dx, posSample.dz);
      let dy = targetYaw - yaw[i];
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      yaw[i] += dy * Math.min(1, step * 9);

      const walking = stopping[i] ? 0 : 1;
      swing[i] += (walking - swing[i]) * Math.min(1, step * 6);
      walkPhase[i] += speed[i] * step * 2.1 * swing[i];

      vPos.set(px, py, pz);
      qYaw.setFromAxisAngle(AXIS_Y, yaw[i]);
      vScale.setScalar(bodyScale[i] * appear);
      mBase.compose(vPos, qYaw, vScale);

      const amp = 0.55 * swing[i];
      const sw = Math.sin(walkPhase[i]) * amp;
      const bob = Math.abs(Math.cos(walkPhase[i])) * 0.03 * swing[i];

      const writePart = (
        mesh: THREE.InstancedMesh,
        ox: number,
        oy: number,
        oz: number,
        swingAng: number,
      ) => {
        vOff.set(ox, oy + bob, oz);
        eSwing.set(swingAng, 0, 0);
        qSwing.setFromEuler(eSwing);
        mLocal.compose(vOff, qSwing, vOne);
        mFinal.multiplyMatrices(mBase, mLocal);
        mesh.setMatrixAt(i, mFinal);
      };

      writePart(legL, 0.1, 0.85, 0, sw);
      writePart(legR, -0.1, 0.85, 0, -sw);
      writePart(armL, 0.27, 1.36, 0, -sw * 0.8);
      writePart(armR, -0.27, 1.36, 0, sw * 0.8);
      writePart(torso, 0, 1.13, 0, 0);
      writePart(head, 0, 1.56, 0, 0);
      writePart(hair, 0, 1.66, 0, 0);
      alive[i] = 1;
    }

    for (const p of parts) p.instanceMatrix.needsUpdate = true;
  };

  // Start every NPC hidden; first update() positions them
  qYaw.identity();
  for (let i = 0; i < NPC_COUNT; i++) hideNPC(i);
  for (const p of parts) p.instanceMatrix.needsUpdate = true;

  return {
    group,
    update,
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      for (const p of parts) p.dispose();
    },
  };
}
