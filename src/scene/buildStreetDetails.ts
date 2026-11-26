import * as THREE from 'three';
import { TOWN_BLOCKS, TOWN_BOUNDS, TOWN_BUILDINGS, TOWN_ROADS } from './townLayout';
import { mergeParts, paintGeometry, transformGeo } from './townSculptor';

/** Small-scale, metre-sized details. Merged geometry keeps the draw-call cost flat. */
export function buildStreetDetails() {
  const group = new THREE.Group();
  group.name = 'STREET_AND_ARCHITECTURAL_DETAILS';
  const parts: THREE.BufferGeometry[] = [];
  const resources: { dispose: () => void }[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: number) => {
    const raw = new THREE.BoxGeometry(w, h, d);
    parts.push(transformGeo(paintGeometry(raw, color, { bottomAO: .08 }), { pos: [x, y, z] }));
    raw.dispose();
  };
  const cylinder = (r: number, h: number, x: number, y: number, z: number, color: number) => {
    const raw = new THREE.CylinderGeometry(r, r, h, 16);
    parts.push(transformGeo(paintGeometry(raw, color), { pos: [x, y, z] }));
    raw.dispose();
  };
  const roadY = TOWN_BOUNDS.roadSurfaceY;
  const walkY = TOWN_BOUNDS.sidewalkSurfaceY;

  for (const b of TOWN_BLOCKS) {
    // Stone expansion joints and individually segmented curb blocks.
    for (let x = b.xMin + 1.4; x < b.xMax; x += 1.8) {
      for (const z of [b.zMin + .8, b.zMax - .8]) {
        box(.025, .012, 1.55, x, walkY + .027, z, 0x9a9383);
      }
    }
    for (let z = b.zMin + 1.4; z < b.zMax; z += 1.8) {
      for (const x of [b.xMin + .8, b.xMax - .8]) {
        box(1.55, .012, .025, x, walkY + .027, z, 0x9a9383);
      }
    }
    // Storm-water grates sit flush with the road, not floating above it.
    for (const z of [b.zMin + 5, b.zMax - 5]) {
      const x = b.xMin - .35;
      box(.52, .025, .9, x, roadY + .025, z, 0x323c3c);
      for (let i = 0; i < 6; i++) box(.42, .008, .035, x, roadY + .042, z - .35 + i * .14, 0x79807b);
    }
  }

  for (const r of TOWN_ROADS.filter(r => r.axis === 'ns')) {
    const x = (r.xMin + r.xMax) / 2 + .85;
    for (let z = 246; z < 402; z += 47) {
      cylinder(.43, .018, x, roadY + .021, z, 0x505954);
      cylinder(.36, .021, x, roadY + .024, z, 0x39433f);
      for (const offset of [-.18, 0, .18]) box(.48, .008, .025, x, roadY + .04, z + offset, 0x69726a);
    }
  }

  for (const b of TOWN_BUILDINGS) {
    // Copper downpipes and brackets, continuous metal gutters and stone courses.
    for (const side of [-1, 1]) {
      const x = b.x + side * (b.w / 2 - .6);
      const z = b.z + b.d / 2 + .2;
      cylinder(.065, b.h, x, walkY + b.h / 2, z, 0x53635d);
      for (let y = 1.2; y < b.h; y += 3) box(.2, .08, .14, x, walkY + y, z, 0x80877c);
    }
    for (const side of [-1, 1]) {
      box(b.w + .4, .13, .2, b.x, walkY + b.h + .65, b.z + side * (b.d / 2 + .2), 0x5a625b);
      box(.2, .13, b.d, b.x + side * (b.w / 2 + .2), walkY + b.h + .65, b.z, 0x5a625b);
      for (let y = .22; y < 1.3; y += .32) {
        box(b.w, .018, .035, b.x, walkY + y, b.z + side * (b.d / 2 + .19), 0xa49b89);
        box(.035, .018, b.d, b.x + side * (b.w / 2 + .19), walkY + y, b.z, 0xa49b89);
      }
    }
  }

  // Familiar European 30 km/h signs and named streets with actual typeset text.
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#e7e5d9';
  ctx.fillRect(0, 0, 1024, 512);
  ctx.fillStyle = '#a54a3b';
  ctx.beginPath(); ctx.arc(256, 256, 220, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#eeeadd';
  ctx.beginPath(); ctx.arc(256, 256, 184, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#29302e'; ctx.font = '600 220px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('30', 256, 273);
  ctx.fillStyle = '#2a403b'; ctx.fillRect(512, 0, 512, 512);
  ctx.strokeStyle = '#c4c7b6'; ctx.lineWidth = 5; ctx.strokeRect(530, 22, 476, 468);
  ctx.fillStyle = '#eeeadd'; ctx.font = '500 44px Arial'; ctx.fillText('MAIN', 768, 218); ctx.fillText('AVENUE', 768, 285);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
  resources.push(texture);
  const signMat = new THREE.MeshStandardMaterial({ map: texture, roughness: .7, side: THREE.DoubleSide });
  resources.push(signMat);
  for (const [x, z, yaw] of [[11.8, 291, 0], [-11.8, 249, Math.PI], [11.8, 345, 0]]) {
    cylinder(.045, 3.4, x, walkY + 1.7, z, 0x787b70);
    const geo = new THREE.PlaneGeometry(.92, .92);
    const uv = geo.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * .5);
    const sign = new THREE.Mesh(geo, signMat); sign.position.set(x, walkY + 2.9, z); sign.rotation.y = yaw;
    group.add(sign); resources.push(geo);
    const streetGeo = new THREE.PlaneGeometry(1.35, .66);
    const streetUv = streetGeo.getAttribute('uv');
    for (let i = 0; i < streetUv.count; i++) streetUv.setX(i, .5 + streetUv.getX(i) * .5);
    const street = new THREE.Mesh(streetGeo, signMat); street.position.set(x, walkY + 3.7, z); street.rotation.y = yaw;
    group.add(street); resources.push(streetGeo);
  }
  const merged = mergeParts(parts);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .86 });
  const mesh = new THREE.Mesh(merged, material); mesh.receiveShadow = true; group.add(mesh);
  resources.push(merged, material);
  return { group, dispose: () => resources.forEach(r => r.dispose()) };
}
