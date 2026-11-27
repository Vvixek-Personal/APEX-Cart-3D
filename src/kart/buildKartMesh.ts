import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { VEHICLE_CATALOG, VehicleSpec } from './vehicleCatalog';

export interface KartMeshRig {
  group: THREE.Group;
  chassisGroup: THREE.Group;
  frontLeftPivot: THREE.Group;
  frontRightPivot: THREE.Group;
  wheels: THREE.Mesh[];
  driverGroup: THREE.Group;
  driverHead: THREE.Group;
  steeringWheel: THREE.Object3D | null;
  setBrakeLights: (braking: boolean, active?: boolean) => void;
  dispose: () => void;
}

function createSeatedDriver(
  geometries: THREE.BufferGeometry[],
  materials: THREE.Material[],
  scale = 1,
): { driverGroup: THREE.Group; driverHead: THREE.Group } {
  const driverGroup = new THREE.Group();
  driverGroup.scale.setScalar(scale);

  const suitMat = new THREE.MeshStandardMaterial({
    color: 0x1d4ed8,
    roughness: 0.55,
    metalness: 0.08,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.4,
    metalness: 0.05,
  });
  const helmetMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    roughness: 0.22,
    metalness: 0.25,
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.12,
    metalness: 0.82,
  });
  materials.push(suitMat, trimMat, helmetMat, visorMat);

  const torsoGeo = new THREE.BoxGeometry(0.42, 0.48, 0.26);
  const torso = new THREE.Mesh(torsoGeo, suitMat);
  torso.position.set(0, 0.24, 0);
  torso.castShadow = true;
  driverGroup.add(torso);
  geometries.push(torsoGeo);

  const stripeGeo = new THREE.BoxGeometry(0.14, 0.46, 0.28);
  const stripe = new THREE.Mesh(stripeGeo, trimMat);
  stripe.position.set(0, 0.24, 0);
  driverGroup.add(stripe);
  geometries.push(stripeGeo);

  const armGeo = new THREE.BoxGeometry(0.11, 0.12, 0.36);
  geometries.push(armGeo);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, suitMat);
    arm.position.set(side * 0.25, 0.34, 0.18);
    arm.rotation.x = 0.28;
    arm.rotation.y = -side * 0.18;
    driverGroup.add(arm);
  }

  const driverHead = new THREE.Group();
  driverHead.position.set(0, 0.62, 0.02);
  const helmetGeo = new THREE.SphereGeometry(0.19, 14, 12);
  const helmet = new THREE.Mesh(helmetGeo, helmetMat);
  helmet.castShadow = true;
  driverHead.add(helmet);
  geometries.push(helmetGeo);

  const visorGeo = new THREE.BoxGeometry(0.28, 0.1, 0.14);
  const visor = new THREE.Mesh(visorGeo, visorMat);
  visor.position.set(0, 0.02, 0.13);
  driverHead.add(visor);
  geometries.push(visorGeo);

  driverGroup.add(driverHead);
  driverGroup.visible = false;

  return { driverGroup, driverHead };
}

/**
 * Builds an oversized, sculpted 3D vehicle rig (Big Mega Kart, Sports GT,
 * Formula Arrow, Rally Hatch, or Street Cruiser) pivoted at bottom-center (y = 0)
 * and facing local +Z, with articulated suspension chassis, spoked wheels, and active brake lights.
 */
export function buildVehicleMesh(
  spec: VehicleSpec,
  contactShadowTexture: THREE.Texture,
): KartMeshRig {
  const group = new THREE.Group();
  group.name = `VEHICLE_${spec.id.toUpperCase()}`;

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const instances: THREE.InstancedMesh[] = [];

  const isLongHeavy = spec.bodyStyle === 'bus' || spec.bodyStyle === 'firetruck' || spec.bodyStyle === 'truck';
  const shadowW = spec.bodyStyle === 'kart' ? 3.55 : isLongHeavy ? 3.5 : 3.2;
  const shadowL = spec.bodyStyle === 'kart' ? 5.15 : spec.bodyStyle === 'bus' ? 9.8 : isLongHeavy ? 8.4 : 5.45;
  const shadowGeo = new THREE.PlaneGeometry(shadowW, shadowL);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowTexture,
    transparent: true,
    depthWrite: false,
    opacity: 0.48,
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.position.set(0, 0.015, 0);
  group.add(shadowMesh);
  geometries.push(shadowGeo);
  materials.push(shadowMat);

  // Shared PBR material palette per vehicle (polished clearcoat-like automotive sheen)
  const bodyPaintMat = new THREE.MeshPhysicalMaterial({
    clearcoat: 0.9,
    clearcoatRoughness: 0.22,
    color: spec.primaryColor,
    roughness: 0.19,
    metalness: 0.32,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: spec.accentColor,
    roughness: 0.28,
    metalness: 0.16,
  });
  const chassisMat = new THREE.MeshStandardMaterial({
    color: 0x222730,
    roughness: 0.64,
    metalness: 0.38,
  });
  const seatMat = new THREE.MeshStandardMaterial({
    color: 0x171b22,
    roughness: 0.85,
    metalness: 0.05,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x181c22,
    roughness: 0.86,
    metalness: 0.05,
  });
  const hubMat = new THREE.MeshStandardMaterial({
    color: spec.rimColor,
    roughness: 0.24,
    metalness: 0.82,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xdce3ec,
    roughness: 0.16,
    metalness: 0.9,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x354954,
    roughness: 0.09,
    metalness: 0.42,
    transparent: true,
    opacity: 0.78,
  });
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xfef9c3,
    emissive: 0xfde047,
    emissiveIntensity: 0.35,
    roughness: 0.18,
  });
  const taillightMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xdc2626,
    emissiveIntensity: 0.3,
    roughness: 0.22,
  });
  materials.push(
    bodyPaintMat,
    accentMat,
    chassisMat,
    seatMat,
    tireMat,
    hubMat,
    chromeMat,
    glassMat,
    headlightMat,
    taillightMat,
  );

  // Spoke bar geometry shared per wheel size so rotational motion reads clearly
  const wheels: THREE.Mesh[] = [];
  const createWheelAssembly = (
    tireGeo: THREE.BufferGeometry,
    hubGeo: THREE.BufferGeometry,
    spokeRadius: number,
    wheelWidth: number,
  ): THREE.Mesh => {
    tireGeo.computeBoundingBox();
    const radius = tireGeo.boundingBox!.max.y;
    const half = wheelWidth / 2;
    // Hollow, rounded rubber sidewalls, not solid cylinders behind the spokes.
    const profile = [
      [spokeRadius * .95, -half], [radius * .86, -half],
      [radius * .98, -half * .72], [radius, 0],
      [radius * .98, half * .72], [radius * .86, half],
      [spokeRadius * .95, half], [spokeRadius * .95, -half],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const rubberGeo = new THREE.LatheGeometry(profile, 32);
    rubberGeo.rotateZ(Math.PI / 2);
    geometries.push(rubberGeo);
    const tire = new THREE.Mesh(rubberGeo, tireMat);
    tire.castShadow = true;
    tire.receiveShadow = true;
    const hub = new THREE.Mesh(hubGeo, chassisMat);
    hub.scale.set(1, .3, .3);
    tire.add(hub);

    const spokeGeo = new THREE.BoxGeometry(wheelWidth + .045, spokeRadius * .83, .035);
    const boltGeo = new THREE.SphereGeometry(.022, 6, 4);
    const rimGeo = new THREE.TorusGeometry(spokeRadius * 1.03, .024, 6, 32);
    rimGeo.rotateY(Math.PI / 2);
    const discGeo = new THREE.CylinderGeometry(spokeRadius * .92, spokeRadius * .92, .022, 24);
    discGeo.rotateZ(Math.PI / 2);
    geometries.push(spokeGeo, boltGeo, rimGeo, discGeo);
    const spokes = new THREE.InstancedMesh(spokeGeo, hubMat, 5);
    const bolts = new THREE.InstancedMesh(boltGeo, chromeMat, 10);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5;
      dummy.position.set(0, Math.cos(angle) * spokeRadius * .55, Math.sin(angle) * spokeRadius * .55);
      dummy.rotation.set(angle, 0, 0); dummy.updateMatrix(); spokes.setMatrixAt(i, dummy.matrix);
      for (const side of [-1, 1]) {
        dummy.position.set(side * (half + .035), Math.cos(angle) * .075, Math.sin(angle) * .075);
        dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); bolts.setMatrixAt(i * 2 + (side === 1 ? 1 : 0), dummy.matrix);
      }
    }
    instances.push(spokes, bolts);
    tire.add(spokes, bolts);
    for (const side of [-1, 1]) {
      const rim = new THREE.Mesh(rimGeo, hubMat); rim.position.x = side * (half + .008);
      const disc = new THREE.Mesh(discGeo, chromeMat); disc.position.x = side * half * .72;
      tire.add(rim, disc);
    }

    wheels.push(tire);
    return tire;
  };

  const frontLeftPivot = new THREE.Group();
  const frontRightPivot = new THREE.Group();

  // Sprung chassis group tilts cleanly on suspension springs without lifting tires or shadow
  const chassisGroup = new THREE.Group();
  chassisGroup.position.set(0, 0.32, 0);
  group.add(chassisGroup);

  const bodyGroup = new THREE.Group();
  bodyGroup.position.set(0, -0.32, 0);
  chassisGroup.add(bodyGroup);

  const detailBox = (parent: THREE.Object3D, size: [number, number, number], pos: [number, number, number], mat: THREE.Material, radius = .015) => {
    const geo = new RoundedBoxGeometry(...size, 1, Math.min(radius, ...size.map(s => s / 3)));
    geometries.push(geo);
    const mesh = new THREE.Mesh(geo, mat); mesh.position.set(...pos); mesh.castShadow = true; parent.add(mesh); return mesh;
  };
  const detailTube = (parent: THREE.Object3D, radius: number, length: number, pos: [number, number, number], mat: THREE.Material) => {
    const geo = new THREE.CylinderGeometry(radius, radius, length, 12, 1, true); geo.rotateX(Math.PI / 2);
    geometries.push(geo); const mesh = new THREE.Mesh(geo, mat); mesh.position.set(...pos); parent.add(mesh); return mesh;
  };

  let driverGroup: THREE.Group;
  let driverHead: THREE.Group;
  let steeringWheel: THREE.Object3D | null = null;

  if (spec.bodyStyle === 'kart') {
    const KART_SCALE = 1.92;
    for (const side of [-1, 1]) {
      detailBox(bodyGroup, [.24, .23, .34], [side * .37, .4, -.73], chassisMat);
      for (let i = 0; i < 6; i++) detailBox(bodyGroup, [.26, .015, .3], [side * .37, .34 + i * .035, -.73], chromeMat);
      detailTube(bodyGroup, .045, .4, [side * .49, .3, -.99], chromeMat);
      detailBox(bodyGroup, [.045, .38, .035], [side * .15, .59, -.45], accentMat);
    }
    detailBox(bodyGroup, [1.25, .045, .045], [0, .24, -.7], chromeMat);

    bodyGroup.scale.setScalar(KART_SCALE);

    const floorShape = new THREE.Shape();
    floorShape.moveTo(-0.46, -1.04);
    floorShape.lineTo(0.46, -1.04);
    floorShape.lineTo(0.5, 0.36);
    floorShape.lineTo(0.34, 1.08);
    floorShape.lineTo(-0.34, 1.08);
    floorShape.lineTo(-0.5, 0.36);
    floorShape.closePath();

    const floorGeo = new THREE.ExtrudeGeometry(floorShape, {
      depth: 0.11,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.03,
      bevelSegments: 2,
    });
    floorGeo.rotateX(Math.PI / 2);
    const floorMesh = new THREE.Mesh(floorGeo, chassisMat);
    floorMesh.position.y = 0.23;
    floorMesh.castShadow = true;
    floorMesh.receiveShadow = true;
    bodyGroup.add(floorMesh);
    geometries.push(floorGeo);

    const noseGeo = new RoundedBoxGeometry(0.66, 0.26, 0.72, 2, .07);
    const noseMesh = new THREE.Mesh(noseGeo, bodyPaintMat);
    noseMesh.position.set(0, 0.35, 0.8);
    noseMesh.rotation.x = 0.15;
    noseMesh.castShadow = true;
    bodyGroup.add(noseMesh);
    geometries.push(noseGeo);

    const stripeGeo = new THREE.BoxGeometry(0.2, 0.045, 0.66);
    const stripeMesh = new THREE.Mesh(stripeGeo, accentMat);
    stripeMesh.position.set(0, 0.48, 0.8);
    stripeMesh.rotation.x = 0.15;
    bodyGroup.add(stripeMesh);
    geometries.push(stripeGeo);

    const sidepodGeo = new RoundedBoxGeometry(0.27, 0.25, 0.94, 2, .06);
    geometries.push(sidepodGeo);
    for (const side of [-1, 1]) {
      const pod = new THREE.Mesh(sidepodGeo, bodyPaintMat);
      pod.position.set(side * 0.5, 0.31, 0.02);
      pod.castShadow = true;
      bodyGroup.add(pod);
    }

    const frontBumperGeo = new THREE.BoxGeometry(1.24, 0.13, 0.13);
    const frontBumper = new THREE.Mesh(frontBumperGeo, chassisMat);
    frontBumper.position.set(0, 0.23, 1.15);
    frontBumper.castShadow = true;
    bodyGroup.add(frontBumper);
    geometries.push(frontBumperGeo);

    const hlGeo = new THREE.BoxGeometry(0.14, 0.08, 0.06);
    geometries.push(hlGeo);
    for (const side of [-0.36, 0.36]) {
      const hl = new THREE.Mesh(hlGeo, headlightMat);
      hl.position.set(side, 0.34, 1.14);
      bodyGroup.add(hl);
    }

    const rearBumperGeo = new THREE.BoxGeometry(1.38, 0.15, 0.13);
    const rearBumper = new THREE.Mesh(rearBumperGeo, chassisMat);
    rearBumper.position.set(0, 0.25, -1.12);
    rearBumper.castShadow = true;
    bodyGroup.add(rearBumper);
    geometries.push(rearBumperGeo);

    // Twin rear LED brake light pods on Mega Kart rear bumper
    const brakePodGeo = new THREE.BoxGeometry(0.22, 0.09, 0.06);
    geometries.push(brakePodGeo);
    for (const side of [-0.44, 0.44]) {
      const tl = new THREE.Mesh(brakePodGeo, taillightMat);
      tl.position.set(side, 0.28, -1.17);
      bodyGroup.add(tl);
    }

    const wingPillarGeo = new THREE.BoxGeometry(0.06, 0.36, 0.12);
    geometries.push(wingPillarGeo);
    for (const side of [-0.34, 0.34]) {
      const pillar = new THREE.Mesh(wingPillarGeo, chassisMat);
      pillar.position.set(side, 0.56, -0.96);
      bodyGroup.add(pillar);
    }
    const wingBladeGeo = new THREE.BoxGeometry(1.16, 0.06, 0.24);
    const wingBlade = new THREE.Mesh(wingBladeGeo, bodyPaintMat);
    wingBlade.position.set(0, 0.75, -0.98);
    wingBlade.rotation.x = -0.14;
    wingBlade.castShadow = true;
    bodyGroup.add(wingBlade);
    geometries.push(wingBladeGeo);

    const seatBaseGeo = new THREE.BoxGeometry(0.48, 0.11, 0.46);
    const seatBase = new THREE.Mesh(seatBaseGeo, seatMat);
    seatBase.position.set(0, 0.3, -0.18);
    bodyGroup.add(seatBase);
    geometries.push(seatBaseGeo);

    const seatBackGeo = new THREE.BoxGeometry(0.48, 0.5, 0.12);
    const seatBack = new THREE.Mesh(seatBackGeo, seatMat);
    seatBack.position.set(0, 0.52, -0.39);
    seatBack.rotation.x = -0.22;
    seatBack.castShadow = true;
    bodyGroup.add(seatBack);
    geometries.push(seatBackGeo);

    const colGeo = new THREE.CylinderGeometry(0.035, 0.042, 0.46, 10);
    const colMesh = new THREE.Mesh(colGeo, chromeMat);
    colMesh.position.set(0, 0.54, 0.38);
    colMesh.rotation.x = 0.65;
    bodyGroup.add(colMesh);
    geometries.push(colGeo);

    const wheelPivot = new THREE.Group();
    wheelPivot.position.set(0, 0.68, 0.24);
    wheelPivot.rotation.x = -0.6;
    const wheelRimGeo = new THREE.TorusGeometry(0.16, 0.03, 10, 20);
    const wheelRim = new THREE.Mesh(wheelRimGeo, seatMat);
    const wheelSpokeGeo = new THREE.BoxGeometry(0.3, 0.04, 0.025);
    const wheelSpoke = new THREE.Mesh(wheelSpokeGeo, chromeMat);
    wheelPivot.add(wheelRim, wheelSpoke);
    bodyGroup.add(wheelPivot);
    steeringWheel = wheelPivot;
    geometries.push(wheelRimGeo, wheelSpokeGeo);

    const engineGeo = new THREE.BoxGeometry(0.4, 0.3, 0.4);
    const engineMesh = new THREE.Mesh(engineGeo, chassisMat);
    engineMesh.position.set(0, 0.39, -0.8);
    engineMesh.castShadow = true;
    bodyGroup.add(engineMesh);
    geometries.push(engineGeo);

    const exhaustGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.36, 10);
    exhaustGeo.rotateX(Math.PI / 2);
    geometries.push(exhaustGeo);
    for (const side of [-0.15, 0.15]) {
      const pipe = new THREE.Mesh(exhaustGeo, chromeMat);
      pipe.position.set(side, 0.43, -1.03);
      pipe.castShadow = true;
      bodyGroup.add(pipe);
    }

    const frontTireGeo = new THREE.CylinderGeometry(0.23 * KART_SCALE, 0.23 * KART_SCALE, 0.22 * KART_SCALE, 18);
    frontTireGeo.rotateZ(Math.PI / 2);
    const frontHubGeo = new THREE.CylinderGeometry(0.12 * KART_SCALE, 0.12 * KART_SCALE, 0.235 * KART_SCALE, 14);
    frontHubGeo.rotateZ(Math.PI / 2);

    const rearTireGeo = new THREE.CylinderGeometry(0.27 * KART_SCALE, 0.27 * KART_SCALE, 0.31 * KART_SCALE, 18);
    rearTireGeo.rotateZ(Math.PI / 2);
    const rearHubGeo = new THREE.CylinderGeometry(0.14 * KART_SCALE, 0.14 * KART_SCALE, 0.325 * KART_SCALE, 14);
    rearHubGeo.rotateZ(Math.PI / 2);
    geometries.push(frontTireGeo, frontHubGeo, rearTireGeo, rearHubGeo);

    frontLeftPivot.position.set(0.65 * KART_SCALE, 0.23 * KART_SCALE, 0.74 * KART_SCALE);
    frontLeftPivot.add(createWheelAssembly(frontTireGeo, frontHubGeo, 0.12 * KART_SCALE, 0.22 * KART_SCALE));
    group.add(frontLeftPivot);

    frontRightPivot.position.set(-0.65 * KART_SCALE, 0.23 * KART_SCALE, 0.74 * KART_SCALE);
    frontRightPivot.add(createWheelAssembly(frontTireGeo, frontHubGeo, 0.12 * KART_SCALE, 0.22 * KART_SCALE));
    group.add(frontRightPivot);

    const rearLeftWheel = createWheelAssembly(rearTireGeo, rearHubGeo, 0.14 * KART_SCALE, 0.31 * KART_SCALE);
    rearLeftWheel.position.set(0.69 * KART_SCALE, 0.27 * KART_SCALE, -0.7 * KART_SCALE);
    group.add(rearLeftWheel);

    const rearRightWheel = createWheelAssembly(rearTireGeo, rearHubGeo, 0.14 * KART_SCALE, 0.31 * KART_SCALE);
    rearRightWheel.position.set(-0.69 * KART_SCALE, 0.27 * KART_SCALE, -0.7 * KART_SCALE);
    group.add(rearRightWheel);

    const dvr = createSeatedDriver(geometries, materials, 1.38);
    driverGroup = dvr.driverGroup;
    driverHead = dvr.driverHead;
    driverGroup.position.set(0, 0.56 - 0.32, -0.26);
    chassisGroup.add(driverGroup);
  } else if (spec.bodyStyle === 'formula') {
    const tubGeo = new THREE.BoxGeometry(1.06, 0.44, 3.6);
    const tub = new THREE.Mesh(tubGeo, bodyPaintMat);
    tub.position.set(0, 0.54, 0.05);
    tub.castShadow = true;
    bodyGroup.add(tub);
    geometries.push(tubGeo);

    const noseGeo = new THREE.BoxGeometry(0.64, 0.28, 1.15);
    const nose = new THREE.Mesh(noseGeo, bodyPaintMat);
    nose.position.set(0, 0.46, 1.85);
    nose.rotation.x = 0.14;
    nose.castShadow = true;
    bodyGroup.add(nose);
    geometries.push(noseGeo);

    const fWingGeo = new THREE.BoxGeometry(2.38, 0.1, 0.46);
    const fWing = new THREE.Mesh(fWingGeo, accentMat);
    fWing.position.set(0, 0.24, 2.26);
    fWing.castShadow = true;
    bodyGroup.add(fWing);
    geometries.push(fWingGeo);

    const sidepodGeo = new THREE.BoxGeometry(0.46, 0.36, 1.65);
    geometries.push(sidepodGeo);
    for (const side of [-1, 1]) {
      const pod = new THREE.Mesh(sidepodGeo, bodyPaintMat);
      pod.position.set(side * 0.72, 0.46, -0.1);
      pod.castShadow = true;
      bodyGroup.add(pod);
    }

    const airboxGeo = new THREE.BoxGeometry(0.42, 0.42, 0.9);
    const airbox = new THREE.Mesh(airboxGeo, accentMat);
    airbox.position.set(0, 0.92, -0.68);
    airbox.castShadow = true;
    bodyGroup.add(airbox);
    geometries.push(airboxGeo);

    // Formula cockpit steering yoke
    const yokePivot = new THREE.Group();
    yokePivot.position.set(0, 0.86, 0.32);
    yokePivot.rotation.x = -0.35;
    const yokeGeo = new THREE.BoxGeometry(0.34, 0.18, 0.04);
    const yokeMesh = new THREE.Mesh(yokeGeo, seatMat);
    yokePivot.add(yokeMesh);
    bodyGroup.add(yokePivot);
    steeringWheel = yokePivot;
    geometries.push(yokeGeo);

    const rWingPillarGeo = new THREE.BoxGeometry(0.08, 0.55, 0.28);
    const rWingPillar = new THREE.Mesh(rWingPillarGeo, chassisMat);
    rWingPillar.position.set(0, 0.85, -1.96);
    bodyGroup.add(rWingPillar);
    geometries.push(rWingPillarGeo);

    // FIA rear rain / brake light beacon
    const fiaBrakeGeo = new THREE.BoxGeometry(0.18, 0.22, 0.08);
    const fiaBrake = new THREE.Mesh(fiaBrakeGeo, taillightMat);
    fiaBrake.position.set(0, 0.54, -2.08);
    bodyGroup.add(fiaBrake);
    geometries.push(fiaBrakeGeo);

    const rWingGeo = new THREE.BoxGeometry(2.15, 0.1, 0.42);
    const rWing = new THREE.Mesh(rWingGeo, accentMat);
    rWing.position.set(0, 1.15, -2.02);
    rWing.rotation.x = -0.15;
    rWing.castShadow = true;
    bodyGroup.add(rWing);
    geometries.push(rWingGeo);

    const frontTireGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.34, 18);
    frontTireGeo.rotateZ(Math.PI / 2);
    const frontHubGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.36, 14);
    frontHubGeo.rotateZ(Math.PI / 2);

    const rearTireGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.46, 18);
    rearTireGeo.rotateZ(Math.PI / 2);
    const rearHubGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.48, 14);
    rearHubGeo.rotateZ(Math.PI / 2);
    geometries.push(frontTireGeo, frontHubGeo, rearTireGeo, rearHubGeo);

    frontLeftPivot.position.set(1.06, 0.4, 1.48);
    frontLeftPivot.add(createWheelAssembly(frontTireGeo, frontHubGeo, 0.22, 0.34));
    group.add(frontLeftPivot);

    frontRightPivot.position.set(-1.06, 0.4, 1.48);
    frontRightPivot.add(createWheelAssembly(frontTireGeo, frontHubGeo, 0.22, 0.34));
    group.add(frontRightPivot);

    const rl = createWheelAssembly(rearTireGeo, rearHubGeo, 0.24, 0.46);
    rl.position.set(1.08, 0.44, -1.42);
    const rr = createWheelAssembly(rearTireGeo, rearHubGeo, 0.24, 0.46);
    rr.position.set(-1.08, 0.44, -1.42);
    group.add(rl, rr);

    const dvr = createSeatedDriver(geometries, materials, 1.15);
    driverGroup = dvr.driverGroup;
    driverHead = dvr.driverHead;
    driverGroup.position.set(0, 0.48 - 0.32, -0.05);
    chassisGroup.add(driverGroup);
  } else if (spec.bodyStyle === 'bus') {
    // Long single-deck city bus: high glazed body, doors, roof AC pod & destination box
    const busW = 2.5;
    const busL = 9.6;
    const floorY = 0.62;
    const bodyH = 2.5;
    const bodyCenterY = floorY + bodyH * 0.5;

    const busBodyGeo = new RoundedBoxGeometry(busW, bodyH, busL, 2, 0.16);
    const busBody = new THREE.Mesh(busBodyGeo, bodyPaintMat);
    busBody.position.set(0, bodyCenterY, 0);
    busBody.castShadow = true;
    busBody.receiveShadow = true;
    bodyGroup.add(busBody);
    geometries.push(busBodyGeo);

    // Continuous glazed upper band + window pillar strips on both sides
    const bandGeo = new THREE.BoxGeometry(busW + 0.06, 1.02, busL - 1.7);
    const band = new THREE.Mesh(bandGeo, glassMat);
    band.position.set(0, bodyCenterY + 0.62, 0);
    bodyGroup.add(band);
    geometries.push(bandGeo);
    const pillarGeo = new THREE.BoxGeometry(busW + 0.09, 1.02, 0.16);
    geometries.push(pillarGeo);
    for (let i = 0; i < 7; i++) {
      const pillar = new THREE.Mesh(pillarGeo, bodyPaintMat);
      pillar.position.set(0, bodyCenterY + 0.62, -busL * 0.36 + i * (busL * 0.72 / 6));
      bodyGroup.add(pillar);
    }

    // Two-tone skirt stripe
    const skirtGeo = new THREE.BoxGeometry(busW + 0.05, 0.34, busL - 0.5);
    const skirt = new THREE.Mesh(skirtGeo, accentMat);
    skirt.position.set(0, floorY + 0.34, 0);
    bodyGroup.add(skirt);
    geometries.push(skirtGeo);

    // Destination display box & flat windshield
    const destGeo = new THREE.BoxGeometry(1.7, 0.36, 0.1);
    const dest = new THREE.Mesh(destGeo, chassisMat);
    dest.position.set(0, bodyCenterY + bodyH * 0.5 - 0.16, busL * 0.5 - 0.02);
    bodyGroup.add(dest);
    geometries.push(destGeo);
    const wsGeo = new THREE.BoxGeometry(2.28, 1.1, 0.09);
    const windshield = new THREE.Mesh(wsGeo, glassMat);
    windshield.position.set(0, bodyCenterY + 0.55, busL * 0.5 + 0.01);
    bodyGroup.add(windshield);
    geometries.push(wsGeo);

    // Roof AC pod + emergency hatch
    const acGeo = new RoundedBoxGeometry(1.8, 0.3, 3.4, 1, 0.1);
    const acPod = new THREE.Mesh(acGeo, chassisMat);
    acPod.position.set(0, bodyCenterY + bodyH * 0.5 + 0.14, -0.6);
    acPod.castShadow = true;
    bodyGroup.add(acPod);
    geometries.push(acGeo);

    // Bumpers, lights & mirrors
    const busBumpGeo = new THREE.BoxGeometry(busW + 0.08, 0.4, 0.26);
    geometries.push(busBumpGeo);
    for (const end of [1, -1]) {
      const bump = new THREE.Mesh(busBumpGeo, chassisMat);
      bump.position.set(0, 0.72, end * (busL * 0.5 + 0.06));
      bump.castShadow = true;
      bodyGroup.add(bump);
    }
    const busLightGeo = new THREE.BoxGeometry(0.46, 0.18, 0.09);
    geometries.push(busLightGeo);
    for (const side of [-0.82, 0.82]) {
      const hl = new THREE.Mesh(busLightGeo, headlightMat);
      hl.position.set(side, 1.02, busL * 0.5 + 0.02);
      const tl = new THREE.Mesh(busLightGeo, taillightMat);
      tl.position.set(side, 1.02, -busL * 0.5 - 0.02);
      bodyGroup.add(hl, tl);
    }
    for (const side of [-1, 1]) {
      detailBox(bodyGroup, [0.06, 0.34, 0.06], [side * (busW * 0.5 + 0.18), bodyCenterY + 0.85, busL * 0.5 - 0.6], chassisMat);
      detailBox(bodyGroup, [0.3, 0.14, 0.1], [side * (busW * 0.5 + 0.3), bodyCenterY + 0.98, busL * 0.5 - 0.6], chassisMat);
    }

    const busTireGeo = new THREE.CylinderGeometry(0.52, 0.52, 0.42, 18);
    busTireGeo.rotateZ(Math.PI / 2);
    const busHubGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.44, 14);
    busHubGeo.rotateZ(Math.PI / 2);
    geometries.push(busTireGeo, busHubGeo);
    const busHalfW = busW * 0.5 + 0.03;
    frontLeftPivot.position.set(busHalfW, 0.52, busL * 0.33);
    frontLeftPivot.add(createWheelAssembly(busTireGeo, busHubGeo, 0.28, 0.42));
    group.add(frontLeftPivot);
    frontRightPivot.position.set(-busHalfW, 0.52, busL * 0.33);
    frontRightPivot.add(createWheelAssembly(busTireGeo, busHubGeo, 0.28, 0.42));
    group.add(frontRightPivot);
    const busRl = createWheelAssembly(busTireGeo, busHubGeo, 0.28, 0.42);
    busRl.position.set(busHalfW, 0.52, -busL * 0.3);
    const busRr = createWheelAssembly(busTireGeo, busHubGeo, 0.28, 0.42);
    busRr.position.set(-busHalfW, 0.52, -busL * 0.3);
    group.add(busRl, busRr);

    // Upright bus steering wheel in front of the driver seat
    const busWheelPivot = new THREE.Group();
    busWheelPivot.position.set(0.62, 2.02, 3.42);
    busWheelPivot.rotation.x = -0.82;
    const busRimGeo = new THREE.TorusGeometry(0.27, 0.032, 8, 22);
    const busRim = new THREE.Mesh(busRimGeo, seatMat);
    const busSpokeGeo = new THREE.BoxGeometry(0.5, 0.045, 0.03);
    const busSpoke = new THREE.Mesh(busSpokeGeo, chassisMat);
    busWheelPivot.add(busRim, busSpoke);
    bodyGroup.add(busWheelPivot);
    steeringWheel = busWheelPivot;
    geometries.push(busRimGeo, busSpokeGeo);

    const dvr = createSeatedDriver(geometries, materials, 1.12);
    driverGroup = dvr.driverGroup;
    driverHead = dvr.driverHead;
    driverGroup.position.set(0.62, 1.62 - 0.32, 2.9);
    chassisGroup.add(driverGroup);
  } else if (spec.bodyStyle === 'firetruck' || spec.bodyStyle === 'truck') {
    const isFire = spec.bodyStyle === 'firetruck';
    const trW = 2.48;
    const trL = isFire ? 8.4 : 7.9;
    const wheelR = spec.stats.wheelRadius;

    // Heavy C-channel steel frame rails + rear axle mudflaps
    detailBox(bodyGroup, [trW * 0.72, 0.34, trL * 0.94], [0, 0.68, 0], chassisMat, 0.04);
    for (const side of [-1, 1]) {
      detailBox(bodyGroup, [0.58, 0.42, 0.08], [side * (trW * 0.38), 0.56, -trL * 0.45], seatMat, 0.02);
    }

    if (isFire) {
      // Tall cab-over crew cabin + pump house + equipment lockers + overhead aerial ladder
      const cabGeo = new RoundedBoxGeometry(trW, 2.05, 2.45, 2, 0.14);
      const cab = new THREE.Mesh(cabGeo, bodyPaintMat);
      cab.position.set(0, 1.88, trL * 0.33);
      cab.castShadow = true;
      bodyGroup.add(cab);
      geometries.push(cabGeo);

      const wsGeo = new THREE.BoxGeometry(trW - 0.24, 0.85, 0.09);
      const ws = new THREE.Mesh(wsGeo, glassMat);
      ws.position.set(0, 2.26, trL * 0.33 + 1.24);
      bodyGroup.add(ws);
      geometries.push(wsGeo);

      // Chrome front grille & heavy chrome bumper
      detailBox(bodyGroup, [trW + 0.14, 0.38, 0.28], [0, 0.74, trL * 0.5 + 0.08], chromeMat, 0.05);
      detailBox(bodyGroup, [1.55, 0.52, 0.08], [0, 1.32, trL * 0.33 + 1.24], chromeMat, 0.03);

      // Equipment body with brushed aluminum roll-up bay doors & high-vis yellow stripe
      const eqGeo = new RoundedBoxGeometry(trW, 1.95, 5.1, 1, 0.1);
      const eqBody = new THREE.Mesh(eqGeo, bodyPaintMat);
      eqBody.position.set(0, 1.82, -1.2);
      eqBody.castShadow = true;
      bodyGroup.add(eqBody);
      geometries.push(eqGeo);

      detailBox(bodyGroup, [trW + 0.05, 0.18, 7.6], [0, 1.22, -0.2], accentMat, 0.02);
      for (const side of [-1, 1]) {
        for (const bz of [-2.8, -1.35, 0.15]) {
          detailBox(bodyGroup, [0.06, 1.25, 1.15], [side * (trW * 0.5 + 0.02), 1.72, bz], chromeMat, 0.02);
        }
      }

      // Extended turntable + folded overhead aerial ladder assembly
      detailBox(bodyGroup, [1.2, 0.36, 1.2], [0, 2.95, -2.5], chromeMat, 0.05);
      for (const side of [-0.42, 0.42]) {
        detailBox(bodyGroup, [0.1, 0.22, 6.2], [side, 3.24, -0.35], chromeMat, 0.02);
      }
      for (let r = 0; r < 12; r++) {
        detailBox(bodyGroup, [0.84, 0.08, 0.08], [0, 3.24, -3.1 + r * 0.5], chromeMat, 0.01);
      }

      // Emergency red roof strobe lightbar
      const fireBeaconMat = new THREE.MeshStandardMaterial({
        color: 0xff2222,
        emissive: 0xef4444,
        emissiveIntensity: 1.4,
        roughness: 0.2,
      });
      materials.push(fireBeaconMat);
      detailBox(bodyGroup, [1.8, 0.22, 0.34], [0, 3.0, trL * 0.33 + 0.7], fireBeaconMat, 0.05);
    } else {
      // Heavy Semi / Cargo Rig: tall hood cab + sun visor + twin chrome exhaust stacks + enclosed cargo box
      const noseGeo = new RoundedBoxGeometry(trW - 0.14, 1.15, 1.75, 2, 0.12);
      const nose = new THREE.Mesh(noseGeo, bodyPaintMat);
      nose.position.set(0, 1.38, trL * 0.38);
      nose.castShadow = true;
      bodyGroup.add(nose);
      geometries.push(noseGeo);

      const cabGeo = new RoundedBoxGeometry(trW - 0.08, 1.98, 2.05, 2, 0.14);
      const cab = new THREE.Mesh(cabGeo, bodyPaintMat);
      cab.position.set(0, 1.88, 1.25);
      cab.castShadow = true;
      bodyGroup.add(cab);
      geometries.push(cabGeo);

      // Chrome radiator grille + sun visor + windshield
      detailBox(bodyGroup, [1.5, 0.82, 0.09], [0, 1.42, trL * 0.38 + 0.88], chromeMat, 0.03);
      detailBox(bodyGroup, [trW - 0.06, 0.18, 0.32], [0, 2.75, 2.34], chromeMat, 0.03);
      const wsGeo = new THREE.BoxGeometry(trW - 0.26, 0.72, 0.08);
      const ws = new THREE.Mesh(wsGeo, glassMat);
      ws.position.set(0, 2.34, 2.29);
      bodyGroup.add(ws);
      geometries.push(wsGeo);

      // Twin tall vertical chrome smokestacks behind cab
      for (const side of [-1, 1]) {
        const stackGeo = new THREE.CylinderGeometry(0.085, 0.085, 2.55, 10);
        geometries.push(stackGeo);
        const stack = new THREE.Mesh(stackGeo, chromeMat);
        stack.position.set(side * (trW * 0.5 + 0.04), 2.35, 0.28);
        stack.castShadow = true;
        bodyGroup.add(stack);
      }

      // Metallic cargo box / hauler deck behind cab
      const cargoGeo = new RoundedBoxGeometry(trW + 0.06, 2.05, 4.15, 1, 0.08);
      const cargo = new THREE.Mesh(cargoGeo, accentMat);
      cargo.position.set(0, 1.92, -1.75);
      cargo.castShadow = true;
      bodyGroup.add(cargo);
      geometries.push(cargoGeo);

      detailBox(bodyGroup, [trW + 0.14, 0.36, 0.28], [0, 0.72, trL * 0.5 + 0.08], chromeMat, 0.05);
    }

    const trBumpGeo = new THREE.BoxGeometry(trW + 0.08, 0.34, 0.24);
    geometries.push(trBumpGeo);
    const rBump = new THREE.Mesh(trBumpGeo, chassisMat);
    rBump.position.set(0, 0.72, -trL * 0.5 - 0.04);
    bodyGroup.add(rBump);

    const trLightGeo = new THREE.BoxGeometry(0.42, 0.18, 0.09);
    geometries.push(trLightGeo);
    for (const side of [-0.84, 0.84]) {
      const hl = new THREE.Mesh(trLightGeo, headlightMat);
      hl.position.set(side, 1.02, trL * 0.5 - 0.04);
      const tl = new THREE.Mesh(trLightGeo, taillightMat);
      tl.position.set(side, 1.0, -trL * 0.5 - 0.02);
      bodyGroup.add(hl, tl);
    }

    const trTireGeo = new THREE.CylinderGeometry(wheelR, wheelR, 0.42, 18);
    trTireGeo.rotateZ(Math.PI / 2);
    const trHubGeo = new THREE.CylinderGeometry(wheelR * 0.56, wheelR * 0.56, 0.44, 14);
    trHubGeo.rotateZ(Math.PI / 2);
    geometries.push(trTireGeo, trHubGeo);
    const trHalfW = trW * 0.5 + 0.05;
    frontLeftPivot.position.set(trHalfW, wheelR, trL * 0.32);
    frontLeftPivot.add(createWheelAssembly(trTireGeo, trHubGeo, wheelR * 0.54, 0.42));
    group.add(frontLeftPivot);
    frontRightPivot.position.set(-trHalfW, wheelR, trL * 0.32);
    frontRightPivot.add(createWheelAssembly(trTireGeo, trHubGeo, wheelR * 0.54, 0.42));
    group.add(frontRightPivot);
    const trRl = createWheelAssembly(trTireGeo, trHubGeo, wheelR * 0.54, 0.42);
    trRl.position.set(trHalfW, wheelR, -trL * 0.32);
    const trRr = createWheelAssembly(trTireGeo, trHubGeo, wheelR * 0.54, 0.42);
    trRr.position.set(-trHalfW, wheelR, -trL * 0.32);
    group.add(trRl, trRr);

    const tWheelPivot = new THREE.Group();
    tWheelPivot.position.set(0.55, 2.02, isFire ? trL * 0.33 + 0.72 : 1.75);
    tWheelPivot.rotation.x = -0.78;
    const tRimGeo = new THREE.TorusGeometry(0.24, 0.03, 8, 20);
    const tRim = new THREE.Mesh(tRimGeo, seatMat);
    const tSpokeGeo = new THREE.BoxGeometry(0.44, 0.04, 0.03);
    const tSpoke = new THREE.Mesh(tSpokeGeo, chromeMat);
    tWheelPivot.add(tRim, tSpoke);
    bodyGroup.add(tWheelPivot);
    steeringWheel = tWheelPivot;
    geometries.push(tRimGeo, tSpokeGeo);

    const dvr = createSeatedDriver(geometries, materials, 1.1);
    driverGroup = dvr.driverGroup;
    driverHead = dvr.driverHead;
    driverGroup.position.set(0.55, 1.66 - 0.32, isFire ? trL * 0.33 + 0.2 : 1.25);
    chassisGroup.add(driverGroup);
  } else if (spec.bodyStyle === 'van' || spec.bodyStyle === 'pickup' || spec.bodyStyle === 'ambulance') {
    // Panel delivery van, open-bed pickup, & high-visibility emergency ambulance
    const isPickup = spec.bodyStyle === 'pickup';
    const isAmbulance = spec.bodyStyle === 'ambulance';
    const vW = isAmbulance ? 2.34 : isPickup ? 2.12 : 2.16;
    const vL = isAmbulance ? 6.0 : isPickup ? 5.5 : 5.4;
    const wheelR = spec.stats.wheelRadius;

    // Low chassis skirt with wheel arches
    const skirtGeo = new THREE.BoxGeometry(vW, 0.52, vL * 0.96);
    const skirt = new THREE.Mesh(skirtGeo, chassisMat);
    skirt.position.set(0, 0.62, 0);
    skirt.castShadow = true;
    bodyGroup.add(skirt);
    geometries.push(skirtGeo);

    if (isPickup) {
      // Cab with glass cabin + open cargo bed with walls & tailgate
      const cabGeo = new RoundedBoxGeometry(vW, 1.06, 1.85, 1, 0.1);
      const cab = new THREE.Mesh(cabGeo, bodyPaintMat);
      cab.position.set(0, 1.36, 0.85);
      cab.castShadow = true;
      bodyGroup.add(cab);
      geometries.push(cabGeo);
      const bedFloorGeo = new THREE.BoxGeometry(vW - 0.16, 0.14, 2.6);
      const bedFloor = new THREE.Mesh(bedFloorGeo, chassisMat);
      bedFloor.position.set(0, 1.06, -1.25);
      bodyGroup.add(bedFloor);
      geometries.push(bedFloorGeo);
      const wallGeo = new THREE.BoxGeometry(0.1, 0.55, 2.6);
      geometries.push(wallGeo);
      for (const side of [-1, 1]) {
        const wall = new THREE.Mesh(wallGeo, bodyPaintMat);
        wall.position.set(side * (vW * 0.5 - 0.05), 1.38, -1.25);
        wall.castShadow = true;
        bodyGroup.add(wall);
      }
      const tailGeo = new THREE.BoxGeometry(vW - 0.12, 0.55, 0.1);
      const tail = new THREE.Mesh(tailGeo, bodyPaintMat);
      tail.position.set(0, 1.38, -2.54);
      bodyGroup.add(tail);
      geometries.push(tailGeo);
      const barGeo = new THREE.CylinderGeometry(0.05, 0.05, vW - 0.3, 8);
      barGeo.rotateZ(Math.PI / 2);
      const bar = new THREE.Mesh(barGeo, chassisMat);
      bar.position.set(0, 1.98, 0.85);
      bodyGroup.add(bar);
      geometries.push(barGeo);
      const vwsGeo = new THREE.BoxGeometry(vW - 0.24, 0.62, 0.08);
      const vws = new THREE.Mesh(vwsGeo, glassMat);
      vws.position.set(0, 1.62, 1.79);
      vws.rotation.x = -0.12;
      bodyGroup.add(vws);
      geometries.push(vwsGeo);
    } else if (isAmbulance) {
      // Forward cab + tall patient rescue box + red cross emblems + roof strobe bar
      const hoodGeo = new RoundedBoxGeometry(vW - 0.1, 0.72, 1.05, 1, 0.1);
      const hood = new THREE.Mesh(hoodGeo, bodyPaintMat);
      hood.position.set(0, 1.06, 2.38);
      hood.castShadow = true;
      bodyGroup.add(hood);
      geometries.push(hoodGeo);

      const cabGeo = new RoundedBoxGeometry(vW - 0.1, 1.48, 1.25, 1, 0.1);
      const cab = new THREE.Mesh(cabGeo, bodyPaintMat);
      cab.position.set(0, 1.56, 1.55);
      cab.castShadow = true;
      bodyGroup.add(cab);
      geometries.push(cabGeo);

      const boxGeo = new RoundedBoxGeometry(vW, 2.15, 3.85, 1, 0.12);
      const box = new THREE.Mesh(boxGeo, bodyPaintMat);
      box.position.set(0, 1.88, -0.95);
      box.castShadow = true;
      bodyGroup.add(box);
      geometries.push(boxGeo);

      const vwsGeo = new THREE.BoxGeometry(vW - 0.28, 0.7, 0.09);
      const vws = new THREE.Mesh(vwsGeo, glassMat);
      vws.position.set(0, 1.82, 2.18);
      vws.rotation.x = -0.15;
      bodyGroup.add(vws);
      geometries.push(vwsGeo);

      // Crimson rescue stripe + twin side Red Cross emblems
      detailBox(bodyGroup, [vW + 0.05, 0.24, 3.85], [0, 1.25, -0.95], accentMat, 0.02);
      for (const side of [-1, 1]) {
        detailBox(bodyGroup, [0.06, 0.68, 0.22], [side * (vW * 0.5 + 0.03), 2.15, -0.95], accentMat, 0.02);
        detailBox(bodyGroup, [0.06, 0.22, 0.68], [side * (vW * 0.5 + 0.03), 2.15, -0.95], accentMat, 0.02);
      }

      // Roof red/white strobe lightbar
      const emsRedMat = new THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: 0xdc2626,
        emissiveIntensity: 1.35,
        roughness: 0.2,
      });
      materials.push(emsRedMat);
      detailBox(bodyGroup, [1.6, 0.2, 0.34], [0, 3.06, 0.72], emsRedMat, 0.04);
      detailBox(bodyGroup, [0.46, 0.22, 0.36], [0, 3.06, 0.72], bodyPaintMat, 0.04);
    } else {
      // One-box panel van: short hood, big cargo box
      const hoodGeo = new RoundedBoxGeometry(vW, 0.7, 1.0, 1, 0.1);
      const hood = new THREE.Mesh(hoodGeo, bodyPaintMat);
      hood.position.set(0, 1.06, 2.15);
      hood.castShadow = true;
      bodyGroup.add(hood);
      geometries.push(hoodGeo);
      const cargoGeo = new RoundedBoxGeometry(vW, 2.05, 3.6, 1, 0.12);
      const cargo = new THREE.Mesh(cargoGeo, bodyPaintMat);
      cargo.position.set(0, 1.78, -0.6);
      cargo.castShadow = true;
      bodyGroup.add(cargo);
      geometries.push(cargoGeo);
      const vwsGeo = new THREE.BoxGeometry(vW - 0.2, 0.78, 0.09);
      const vws = new THREE.Mesh(vwsGeo, glassMat);
      vws.position.set(0, 1.72, 1.62);
      vws.rotation.x = -0.14;
      bodyGroup.add(vws);
      geometries.push(vwsGeo);
      const stripeGeo = new THREE.BoxGeometry(vW + 0.05, 0.22, 3.6);
      const stripeM = new THREE.Mesh(stripeGeo, accentMat);
      stripeM.position.set(0, 1.16, -0.6);
      bodyGroup.add(stripeM);
      geometries.push(stripeGeo);
      detailBox(bodyGroup, [0.06, 1.7, 0.06], [0, 1.78, -2.42], chassisMat, 0.02);
    }

    const vBumpGeo = new THREE.BoxGeometry(vW + 0.06, 0.26, 0.24);
    geometries.push(vBumpGeo);
    for (const end of [1, -1]) {
      const bump = new THREE.Mesh(vBumpGeo, chassisMat);
      bump.position.set(0, 0.66, end * (vL * 0.5 + 0.05));
      bodyGroup.add(bump);
    }
    const vLightGeo = new THREE.BoxGeometry(0.4, 0.16, 0.08);
    geometries.push(vLightGeo);
    for (const side of [-0.72, 0.72]) {
      const hl = new THREE.Mesh(vLightGeo, headlightMat);
      hl.position.set(side, 0.98, vL * 0.5 + 0.02);
      const tl = new THREE.Mesh(vLightGeo, taillightMat);
      tl.position.set(side, 1.0, -vL * 0.5 - 0.02);
      bodyGroup.add(hl, tl);
    }

    const vTireGeo = new THREE.CylinderGeometry(wheelR, wheelR, 0.36, 18);
    vTireGeo.rotateZ(Math.PI / 2);
    const vHubGeo = new THREE.CylinderGeometry(wheelR * 0.55, wheelR * 0.55, 0.38, 14);
    vHubGeo.rotateZ(Math.PI / 2);
    geometries.push(vTireGeo, vHubGeo);
    const vHalfW = vW * 0.5 + 0.05;
    frontLeftPivot.position.set(vHalfW, wheelR, vL * 0.31);
    frontLeftPivot.add(createWheelAssembly(vTireGeo, vHubGeo, wheelR * 0.55, 0.36));
    group.add(frontLeftPivot);
    frontRightPivot.position.set(-vHalfW, wheelR, vL * 0.31);
    frontRightPivot.add(createWheelAssembly(vTireGeo, vHubGeo, wheelR * 0.55, 0.36));
    group.add(frontRightPivot);
    const vRl = createWheelAssembly(vTireGeo, vHubGeo, wheelR * 0.55, 0.36);
    vRl.position.set(vHalfW, wheelR, -vL * 0.32);
    const vRr = createWheelAssembly(vTireGeo, vHubGeo, wheelR * 0.55, 0.36);
    vRr.position.set(-vHalfW, wheelR, -vL * 0.32);
    group.add(vRl, vRr);

    const vWheelPivot = new THREE.Group();
    vWheelPivot.position.set(isPickup ? 0.34 : 0.5, 1.5, isPickup ? 1.32 : isAmbulance ? 1.65 : 1.24);
    vWheelPivot.rotation.x = -0.62;
    const vRimGeo = new THREE.TorusGeometry(0.19, 0.028, 8, 20);
    const vRim = new THREE.Mesh(vRimGeo, seatMat);
    const vSpokeGeo = new THREE.BoxGeometry(0.36, 0.04, 0.03);
    const vSpoke = new THREE.Mesh(vSpokeGeo, chassisMat);
    vWheelPivot.add(vRim, vSpoke);
    bodyGroup.add(vWheelPivot);
    steeringWheel = vWheelPivot;
    geometries.push(vRimGeo, vSpokeGeo);

    const dvr = createSeatedDriver(geometries, materials, 1.05);
    driverGroup = dvr.driverGroup;
    driverHead = dvr.driverHead;
    driverGroup.position.set(isPickup ? 0.34 : 0.5, 1.42 - 0.32, isPickup ? 0.85 : isAmbulance ? 1.55 : 1.3);
    chassisGroup.add(driverGroup);
  } else if (spec.bodyStyle === 'buggy') {
    // Open-frame off-road desert dune buggy with tubular roll cage, roof LED bar, and rear spare tire
    const wheelR = spec.stats.wheelRadius;
    detailBox(bodyGroup, [1.38, 0.24, 3.65], [0, 0.52, -0.05], chassisMat, 0.06);
    detailBox(bodyGroup, [1.26, 0.36, 1.45], [0, 0.76, 1.05], bodyPaintMat, 0.1);
    detailBox(bodyGroup, [1.46, 0.14, 0.24], [0, 0.52, 1.88], accentMat, 0.04);

    // Tubular external roll cage & side rails
    for (const side of [-1, 1]) {
      const sideX = side * 0.66;
      const aArm = detailBox(bodyGroup, [0.58, 0.07, 0.09], [side * 0.78, 0.48, 1.38], accentMat, 0.02);
      aArm.rotation.z = side * -0.14;
      detailBox(bodyGroup, [0.09, 0.09, 2.75], [sideX, 0.88, -0.15], accentMat, 0.03);
      const aPillar = detailBox(bodyGroup, [0.08, 1.05, 0.08], [sideX, 1.32, 0.45], accentMat, 0.03);
      aPillar.rotation.x = -0.45;
      detailBox(bodyGroup, [0.08, 0.08, 1.45], [sideX, 1.72, -0.45], accentMat, 0.03);
      const bPillar = detailBox(bodyGroup, [0.08, 1.15, 0.08], [sideX, 1.24, -1.25], accentMat, 0.03);
      bPillar.rotation.x = 0.34;
      detailBox(bodyGroup, [0.36, 0.42, 0.42], [side * 0.34, 0.84, -0.18], seatMat, 0.06);
    }
    detailBox(bodyGroup, [1.38, 0.09, 0.09], [0, 1.72, 0.22], accentMat, 0.03);
    detailBox(bodyGroup, [1.38, 0.09, 0.09], [0, 1.72, -1.12], accentMat, 0.03);
    detailBox(bodyGroup, [1.18, 0.14, 0.18], [0, 1.84, 0.2], headlightMat, 0.04);

    // Exposed rear engine block & twin angled chrome exhaust pipes + spare tire
    detailBox(bodyGroup, [0.76, 0.48, 0.65], [0, 0.86, -1.45], chassisMat, 0.05);
    for (const side of [-0.26, 0.26]) {
      detailTube(bodyGroup, 0.06, 0.56, [side, 1.06, -1.82], chromeMat);
    }
    const spareGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.28, 18);
    spareGeo.rotateX(Math.PI / 2);
    geometries.push(spareGeo);
    const spare = new THREE.Mesh(spareGeo, tireMat);
    spare.position.set(0, 1.36, -1.52);
    spare.rotation.x = 0.58;
    bodyGroup.add(spare);

    for (const side of [-0.45, 0.45]) {
      detailBox(bodyGroup, [0.24, 0.15, 0.08], [side, 0.86, 1.78], headlightMat, 0.02);
      detailBox(bodyGroup, [0.24, 0.14, 0.08], [side, 0.86, -1.86], taillightMat, 0.02);
    }

    const bTireGeo = new THREE.CylinderGeometry(wheelR, wheelR, 0.4, 18);
    bTireGeo.rotateZ(Math.PI / 2);
    const bHubGeo = new THREE.CylinderGeometry(wheelR * 0.5, wheelR * 0.5, 0.42, 14);
    bHubGeo.rotateZ(Math.PI / 2);
    geometries.push(bTireGeo, bHubGeo);
    frontLeftPivot.position.set(1.06, wheelR, 1.38);
    frontLeftPivot.add(createWheelAssembly(bTireGeo, bHubGeo, wheelR * 0.5, 0.4));
    group.add(frontLeftPivot);
    frontRightPivot.position.set(-1.06, wheelR, 1.38);
    frontRightPivot.add(createWheelAssembly(bTireGeo, bHubGeo, wheelR * 0.5, 0.4));
    group.add(frontRightPivot);
    const brl = createWheelAssembly(bTireGeo, bHubGeo, wheelR * 0.5, 0.4);
    brl.position.set(1.08, wheelR, -1.35);
    const brr = createWheelAssembly(bTireGeo, bHubGeo, wheelR * 0.5, 0.4);
    brr.position.set(-1.08, wheelR, -1.35);
    group.add(brl, brr);

    const bWheelGeo = new THREE.TorusGeometry(0.17, 0.028, 8, 18);
    geometries.push(bWheelGeo);
    const bSteering = new THREE.Mesh(bWheelGeo, seatMat);
    bSteering.position.set(0.34, 1.14, 0.36);
    bSteering.rotation.x = -0.5;
    bodyGroup.add(bSteering);
    steeringWheel = bSteering;

    const dvr = createSeatedDriver(geometries, materials, 1.02);
    driverGroup = dvr.driverGroup;
    driverHead = dvr.driverHead;
    driverGroup.position.set(0.34, 0.88 - 0.32, -0.05);
    chassisGroup.add(driverGroup);
  } else if (spec.bodyStyle === 'vintage') {
    // Classic 1962 Open-Top Roadster Convertible with raked windshield, cream interior & tailfins
    const bodyW = 2.24;
    const bodyL = 4.75;
    const wheelR = spec.stats.wheelRadius;
    const axleZ = bodyL * 0.32;
    const archR = wheelR + 0.1;
    const profile = new THREE.Shape();
    profile.moveTo(-bodyL / 2, 0.32);
    for (const axle of [-axleZ, axleZ]) {
      profile.lineTo(axle - archR, 0.32);
      profile.lineTo(axle - archR, wheelR);
      profile.absarc(axle, wheelR, archR, Math.PI, 0, true);
      profile.lineTo(axle + archR, 0.32);
    }
    profile.lineTo(bodyL / 2, 0.32);
    profile.lineTo(bodyL / 2 - 0.15, 0.92);
    profile.lineTo(0.85, 0.96);
    profile.lineTo(0.65, 0.72); // Open cockpit cutout
    profile.lineTo(-0.85, 0.72);
    profile.lineTo(-1.15, 0.96);
    profile.lineTo(-bodyL / 2 + 0.08, 1.06); // Classic tailfin kickup
    profile.lineTo(-bodyL / 2, 0.82);
    profile.closePath();
    const lowerGeo = new THREE.ExtrudeGeometry(profile, {
      depth: bodyW,
      bevelEnabled: true,
      bevelSize: 0.05,
      bevelThickness: 0.04,
      bevelSegments: 2,
      curveSegments: 16,
    });
    lowerGeo.translate(0, 0, -bodyW / 2);
    lowerGeo.rotateY(Math.PI / 2);
    const lowerMesh = new THREE.Mesh(lowerGeo, bodyPaintMat);
    lowerMesh.castShadow = true;
    lowerMesh.receiveShadow = true;
    bodyGroup.add(lowerMesh);
    geometries.push(lowerGeo);

    // Chrome bumpers, side spears, raked open windshield & cream convertible seats
    detailBox(bodyGroup, [bodyW + 0.14, 0.18, 0.22], [0, 0.42, bodyL * 0.5 + 0.06], chromeMat, 0.05);
    detailBox(bodyGroup, [bodyW + 0.14, 0.18, 0.22], [0, 0.42, -bodyL * 0.5 - 0.06], chromeMat, 0.05);
    detailBox(bodyGroup, [1.25, 0.28, 0.08], [0, 0.68, bodyL * 0.5 + 0.02], chromeMat, 0.03);
    for (const side of [-1, 1]) {
      detailBox(bodyGroup, [0.05, 0.07, bodyL * 0.76], [side * (bodyW * 0.5 + 0.02), 0.72, 0], chromeMat, 0.02);
      detailBox(bodyGroup, [0.18, 0.34, 0.55], [side * (bodyW * 0.44), 1.1, -bodyL * 0.41], bodyPaintMat, 0.04);
      detailBox(bodyGroup, [0.54, 0.5, 0.52], [side * 0.46, 0.88, -0.35], accentMat, 0.08);
      detailBox(bodyGroup, [0.16, 0.12, 0.18], [side * (bodyW * 0.48), 1.04, 0.65], chromeMat, 0.04);
      detailTube(bodyGroup, 0.06, 0.3, [side * 0.66, 0.36, -bodyL * 0.5 - 0.12], chromeMat);
    }

    // Raked chrome windshield frame with tinted glass
    const wsFrameGeo = new THREE.BoxGeometry(bodyW - 0.2, 0.54, 0.06);
    const wsFrame = new THREE.Mesh(wsFrameGeo, glassMat);
    wsFrame.position.set(0, 1.18, 0.68);
    wsFrame.rotation.x = -0.38;
    bodyGroup.add(wsFrame);
    geometries.push(wsFrameGeo);
    const topChrome = detailBox(bodyGroup, [bodyW - 0.16, 0.06, 0.08], [0, 1.42, 0.58], chromeMat, 0.02);
    topChrome.rotation.x = -0.38;

    const rdLightGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.08, 12);
    rdLightGeo.rotateX(Math.PI / 2);
    geometries.push(rdLightGeo);
    for (const side of [-0.78, 0.78]) {
      const hl = new THREE.Mesh(rdLightGeo, headlightMat);
      hl.position.set(side, 0.74, bodyL * 0.5 + 0.01);
      const tl = new THREE.Mesh(rdLightGeo, taillightMat);
      tl.position.set(side, 0.86, -bodyL * 0.5 - 0.01);
      bodyGroup.add(hl, tl);
    }

    const rTireGeo = new THREE.CylinderGeometry(wheelR, wheelR, 0.3, 18);
    rTireGeo.rotateZ(Math.PI / 2);
    const rHubGeo = new THREE.CylinderGeometry(wheelR * 0.62, wheelR * 0.62, 0.32, 14);
    rHubGeo.rotateZ(Math.PI / 2);
    geometries.push(rTireGeo, rHubGeo);
    const trackHalfW = bodyW * 0.5 + 0.05;
    frontLeftPivot.position.set(trackHalfW, wheelR, axleZ);
    frontLeftPivot.add(createWheelAssembly(rTireGeo, rHubGeo, wheelR * 0.62, 0.3));
    group.add(frontLeftPivot);
    frontRightPivot.position.set(-trackHalfW, wheelR, axleZ);
    frontRightPivot.add(createWheelAssembly(rTireGeo, rHubGeo, wheelR * 0.62, 0.3));
    group.add(frontRightPivot);
    const rrl = createWheelAssembly(rTireGeo, rHubGeo, wheelR * 0.62, 0.3);
    rrl.position.set(trackHalfW, wheelR, -axleZ);
    const rrr = createWheelAssembly(rTireGeo, rHubGeo, wheelR * 0.62, 0.3);
    rrr.position.set(-trackHalfW, wheelR, -axleZ);
    group.add(rrl, rrr);

    const vSteerGeo = new THREE.TorusGeometry(0.18, 0.025, 6, 20);
    geometries.push(vSteerGeo);
    const vSteer = new THREE.Mesh(vSteerGeo, chromeMat);
    vSteer.position.set(0.36, 1.12, 0.32);
    vSteer.rotation.x = -0.45;
    bodyGroup.add(vSteer);
    steeringWheel = vSteer;

    const dvr = createSeatedDriver(geometries, materials, 1.0);
    driverGroup = dvr.driverGroup;
    driverHead = dvr.driverHead;
    driverGroup.position.set(0.36, 0.78 - 0.32, -0.15);
    chassisGroup.add(driverGroup);
  } else {
    const isCruiser = spec.bodyStyle === 'cruiser';
    const isRally = spec.bodyStyle === 'rally';
    const isTaxi = spec.bodyStyle === 'taxi';
    const isSupercar = spec.bodyStyle === 'supercar';
    const isMuscle = spec.bodyStyle === 'muscle';
    const isPolice = spec.bodyStyle === 'police';
    const bodyW = isSupercar ? 2.46 : isMuscle ? 2.4 : isCruiser ? 2.38 : isPolice ? 2.34 : isTaxi ? 2.28 : 2.32;
    const bodyL = isMuscle ? 4.82 : isSupercar ? 4.78 : isPolice ? 4.72 : isRally ? 4.35 : isTaxi ? 4.5 : 4.7;
    const lowerH = isSupercar ? 0.56 : isCruiser ? 0.88 : isMuscle ? 0.76 : isTaxi || isPolice ? 0.68 : 0.72;

    const wRad = spec.stats.wheelRadius;
    const axleZ = bodyL * .32;
    const archR = wRad + .105;
    const profile = new THREE.Shape();
    profile.moveTo(-bodyL / 2, .34);
    for (const axle of [-axleZ, axleZ]) {
      profile.lineTo(axle - archR, .34);
      profile.lineTo(axle - archR, wRad);
      profile.absarc(axle, wRad, archR, Math.PI, 0, true);
      profile.lineTo(axle + archR, .34);
    }
    profile.lineTo(bodyL / 2, .34);
    profile.lineTo(bodyL / 2, .34 + lowerH - (isSupercar ? 0.22 : 0.12));
    profile.lineTo(bodyL / 2 - (isSupercar ? 0.72 : 0.35), .34 + lowerH);
    profile.lineTo(-bodyL / 2 + .18, .34 + lowerH);
    profile.lineTo(-bodyL / 2, .34 + lowerH - .1);
    profile.closePath();
    const lowerGeo = new THREE.ExtrudeGeometry(profile, { depth: bodyW, bevelEnabled: true, bevelSize: .045, bevelThickness: .035, bevelSegments: 2, curveSegments: 16 });
    lowerGeo.translate(0, 0, -bodyW / 2); lowerGeo.rotateY(Math.PI / 2);
    const lowerMesh = new THREE.Mesh(lowerGeo, bodyPaintMat);
    lowerMesh.castShadow = true; lowerMesh.receiveShadow = true;
    bodyGroup.add(lowerMesh); geometries.push(lowerGeo);

    const stripeGeo = new THREE.BoxGeometry(isMuscle ? 0.58 : 0.38, 0.04, bodyL * 0.88);
    const stripe = new THREE.Mesh(stripeGeo, accentMat);
    stripe.position.set(0, 0.34 + lowerH + 0.015, 0.08);
    bodyGroup.add(stripe);
    geometries.push(stripeGeo);

    const bumperGeo = new THREE.BoxGeometry(bodyW + 0.08, 0.24, 0.24);
    geometries.push(bumperGeo);
    const fBump = new THREE.Mesh(bumperGeo, chassisMat);
    fBump.position.set(0, 0.36, bodyL * 0.5 + 0.05);
    const rBump = new THREE.Mesh(bumperGeo, chassisMat);
    rBump.position.set(0, 0.36, -bodyL * 0.5 - 0.05);
    bodyGroup.add(fBump, rBump);

    const lightGeo = new THREE.BoxGeometry(0.42, 0.16, 0.08);
    geometries.push(lightGeo);
    for (const side of [-0.78, 0.78]) {
      const hl = new THREE.Mesh(lightGeo, headlightMat);
      hl.position.set(side, isSupercar ? 0.6 : 0.68, bodyL * 0.5 + 0.02);
      const tl = new THREE.Mesh(lightGeo, taillightMat);
      tl.position.set(side, isSupercar ? 0.68 : 0.68, -bodyL * 0.5 - 0.02);
      bodyGroup.add(hl, tl);
    }

    const cabW = bodyW - 0.28;
    const cabL = isCruiser ? 2.75 : isSupercar ? 2.35 : isPolice ? 2.4 : isMuscle ? 2.15 : isRally ? 2.25 : isTaxi ? 2.3 : 2.1;
    const cabH = isCruiser ? 0.72 : isSupercar ? 0.44 : isTaxi || isPolice ? 0.58 : 0.56;
    const cabZ = isCruiser ? -0.25 : isSupercar ? -0.08 : -0.22;

    const baseY = .34 + lowerH;
    const roofY = baseY + cabH;
    const roofHalfL = cabL * (isMuscle ? 0.26 : 0.32);
    const roofHalfW = cabW * 0.42;
    const cabinVerts = [
      [-cabW/2,baseY,cabZ-cabL/2], [cabW/2,baseY,cabZ-cabL/2],
      [cabW/2,baseY,cabZ+cabL/2], [-cabW/2,baseY,cabZ+cabL/2],
      [-roofHalfW,roofY,cabZ-roofHalfL], [roofHalfW,roofY,cabZ-roofHalfL],
      [roofHalfW,roofY,cabZ+roofHalfL], [-roofHalfW,roofY,cabZ+roofHalfL],
    ];
    const glassGeo = new THREE.BufferGeometry();
    glassGeo.setAttribute('position', new THREE.Float32BufferAttribute(cabinVerts.flat(), 3));
    glassGeo.setIndex([0,4,5,0,5,1, 1,5,6,1,6,2, 2,6,7,2,7,3, 3,7,4,3,4,0]);
    glassGeo.computeVertexNormals();
    glassMat.side = THREE.DoubleSide;
    bodyGroup.add(new THREE.Mesh(glassGeo, glassMat)); geometries.push(glassGeo);
    detailBox(bodyGroup, [roofHalfW * 2 + .08, .09, roofHalfL * 2 + .08], [0, roofY, cabZ], isCruiser || isPolice ? accentMat : bodyPaintMat, .04);
    for (const side of [-1, 1]) {
      for (const end of [-1, 1]) {
        const a = new THREE.Vector3(side * cabW/2, baseY, cabZ + end * cabL/2);
        const b = new THREE.Vector3(side * roofHalfW, roofY, cabZ + end * roofHalfL);
        const pillar = detailBox(bodyGroup, [.065, a.distanceTo(b), .065], a.clone().add(b).multiplyScalar(.5).toArray() as [number, number, number], bodyPaintMat);
        pillar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
      }
      detailBox(bodyGroup, [.065, cabH, .075], [side * (cabW/2 + roofHalfW)/2, baseY + cabH/2, cabZ], chassisMat);
      detailBox(bodyGroup, [.04, .1, .22], [side * (bodyW/2 + .025), baseY - .15, -.05], chromeMat);
      detailBox(bodyGroup, [.23, .14, .29], [side * (bodyW/2 + .16), baseY + .2, cabZ + cabL * .4], bodyPaintMat, .05);
      detailBox(bodyGroup, [.2, .105, .015], [side * (bodyW/2 + .16), baseY + .2, cabZ + cabL * .4 - .15], chromeMat);
      detailBox(bodyGroup, [.03, lowerH * .68, .018], [side * (bodyW/2 + .04), .34 + lowerH * .55, .4], chassisMat);
      detailTube(bodyGroup, .075, .28, [side * .75, .35, -bodyL/2 - .14], chromeMat);
      detailTube(bodyGroup, .052, .285, [side * .75, .35, -bodyL/2 - .15], seatMat);
      detailBox(bodyGroup, [.48, .48, .46], [side * .48, baseY + .15, cabZ - .2], seatMat, .08);
    }
    detailBox(bodyGroup, [cabW * .85, .15, .35], [0, baseY + .08, cabZ + cabL * .38], chassisMat);
    for (let i = 0; i < 5; i++) detailBox(bodyGroup, [1.1, .023, .025], [0, .5 + i * .05, bodyL/2 + .02], chassisMat);
    detailBox(bodyGroup, [.55, .19, .025], [0, .58, -bodyL/2 - .09], accentMat);
    for (const x of [-.65, -.32, 0, .32, .65]) detailBox(bodyGroup, [.035, .14, .38], [x, .28, -bodyL/2 + .02], chassisMat);
    const steeringGeo = new THREE.TorusGeometry(.17, .025, 6, 20); geometries.push(steeringGeo);
    const steering = new THREE.Mesh(steeringGeo, seatMat); steering.position.set(.32, baseY + .24, cabZ + cabL * .3);
    steering.rotation.x = -.4; bodyGroup.add(steering); steeringWheel = steering;

    if (spec.bodyStyle === 'sport' || isRally || isSupercar) {
      const wingStayGeo = new THREE.BoxGeometry(0.08, isSupercar ? 0.34 : 0.28, 0.18);
      geometries.push(wingStayGeo);
      for (const side of [-0.66, 0.66]) {
        const stay = new THREE.Mesh(wingStayGeo, chassisMat);
        stay.position.set(side, 0.34 + lowerH + (isSupercar ? 0.17 : 0.14), -bodyL * 0.45);
        bodyGroup.add(stay);
      }
      const wingGeo = new THREE.BoxGeometry(bodyW - (isSupercar ? 0.02 : 0.08), 0.08, isSupercar ? 0.42 : 0.34);
      const wing = new THREE.Mesh(wingGeo, isRally || isSupercar ? accentMat : bodyPaintMat);
      wing.position.set(0, 0.34 + lowerH + (isSupercar ? 0.36 : 0.3), -bodyL * 0.46);
      wing.rotation.x = -0.14;
      wing.castShadow = true;
      bodyGroup.add(wing);
      geometries.push(wingGeo);
    }

    if (isSupercar) {
      // Carbon front splitter + side skirts + rear engine bay louvers
      detailBox(bodyGroup, [bodyW + 0.14, 0.07, 0.45], [0, 0.26, bodyL * 0.48], chassisMat, 0.02);
      for (const side of [-1, 1]) {
        detailBox(bodyGroup, [0.1, 0.08, bodyL * 0.6], [side * (bodyW * 0.5 + 0.04), 0.28, 0], chassisMat, 0.02);
      }
      for (let li = 0; li < 4; li++) {
        detailBox(bodyGroup, [0.92, 0.06, 0.14], [0, baseY + 0.06, -1.25 - li * 0.22], chassisMat, 0.02);
      }
    }

    if (isMuscle) {
      // Protruding chrome V8 supercharger blower + scoop + rear ducktail spoiler
      detailBox(bodyGroup, [0.56, 0.24, 0.72], [0, baseY + 0.1, 1.1], chromeMat, 0.04);
      detailBox(bodyGroup, [0.46, 0.16, 0.26], [0, baseY + 0.28, 1.24], accentMat, 0.03);
      for (const bx of [-0.14, 0, 0.14]) {
        detailBox(bodyGroup, [0.09, 0.1, 0.06], [bx, baseY + 0.28, 1.38], headlightMat, 0.02);
      }
      const duckGeo = new THREE.BoxGeometry(bodyW - 0.1, 0.2, 0.22);
      const duck = new THREE.Mesh(duckGeo, accentMat);
      duck.position.set(0, baseY + 0.12, -bodyL * 0.47);
      duck.rotation.x = -0.35;
      bodyGroup.add(duck);
      geometries.push(duckGeo);
    }

    if (isPolice) {
      // Heavy steel push-bar (bullbar) + white two-tone doors + red/blue roof lightbar + whip antenna
      detailBox(bodyGroup, [1.5, 0.09, 0.14], [0, 0.66, bodyL * 0.5 + 0.24], chassisMat, 0.02);
      detailBox(bodyGroup, [1.5, 0.09, 0.14], [0, 0.9, bodyL * 0.5 + 0.22], chassisMat, 0.02);
      for (const side of [-0.52, 0.52]) {
        detailBox(bodyGroup, [0.12, 0.62, 0.16], [side, 0.62, bodyL * 0.5 + 0.22], chassisMat, 0.02);
        // White patrol doors
        detailBox(bodyGroup, [0.05, lowerH * 0.85, 2.05], [side * (bodyW * 0.5 + 0.02), 0.34 + lowerH * 0.5, 0.0], accentMat, 0.02);
      }
      const polRedMat = new THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: 0xdc2626,
        emissiveIntensity: 1.4,
        roughness: 0.2,
      });
      const polBlueMat = new THREE.MeshStandardMaterial({
        color: 0x3b82f6,
        emissive: 0x2563eb,
        emissiveIntensity: 1.4,
        roughness: 0.2,
      });
      materials.push(polRedMat, polBlueMat);
      detailBox(bodyGroup, [0.64, 0.16, 0.32], [0.34, roofY + 0.14, cabZ + 0.1], polRedMat, 0.03);
      detailBox(bodyGroup, [0.64, 0.16, 0.32], [-0.34, roofY + 0.14, cabZ + 0.1], polBlueMat, 0.03);
      detailBox(bodyGroup, [0.04, 0.9, 0.04], [-bodyW * 0.42, baseY + 0.45, -bodyL * 0.42], chromeMat, 0.01);
    }

    if (isRally) {
      const scoopGeo = new THREE.BoxGeometry(0.44, 0.14, 0.52);
      const scoop = new THREE.Mesh(scoopGeo, accentMat);
      scoop.position.set(0, 0.34 + lowerH + cabH + 0.04, 0.2);
      bodyGroup.add(scoop);
      geometries.push(scoopGeo);
    }

    if (isCruiser) {
      const railGeo = new THREE.BoxGeometry(0.08, 0.08, 2.1);
      geometries.push(railGeo);
      for (const side of [-0.72, 0.72]) {
        const rail = new THREE.Mesh(railGeo, chromeMat);
        rail.position.set(side, 0.34 + lowerH + cabH + 0.04, cabZ);
        bodyGroup.add(rail);
      }
    }

    if (isTaxi) {
      // Illuminated roof taxi sign + livery band along the flanks
      const signGeo = new RoundedBoxGeometry(0.66, 0.22, 0.32, 1, 0.04);
      geometries.push(signGeo);
      const signMat = new THREE.MeshStandardMaterial({
        color: 0xfde047,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.55,
        roughness: 0.3,
      });
      materials.push(signMat);
      const sign = new THREE.Mesh(signGeo, signMat);
      sign.position.set(0, roofY + 0.16, cabZ);
      bodyGroup.add(sign);
      const bandGeo = new THREE.BoxGeometry(0.05, 0.14, bodyL * 0.58);
      geometries.push(bandGeo);
      for (const side of [-1, 1]) {
        const band = new THREE.Mesh(bandGeo, accentMat);
        band.position.set(side * (bodyW * 0.5 + 0.02), 0.34 + lowerH * 0.55, 0.1);
        bodyGroup.add(band);
      }
    }

    const tireGeo = new THREE.CylinderGeometry(wRad, wRad, 0.34, 18);
    tireGeo.rotateZ(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(wRad * 0.56, wRad * 0.56, 0.36, 14);
    hubGeo.rotateZ(Math.PI / 2);
    geometries.push(tireGeo, hubGeo);

    const trackHalfW = bodyW * 0.5 + 0.06;

    frontLeftPivot.position.set(trackHalfW, wRad, axleZ);
    frontLeftPivot.add(createWheelAssembly(tireGeo, hubGeo, wRad * 0.56, 0.34));
    group.add(frontLeftPivot);

    frontRightPivot.position.set(-trackHalfW, wRad, axleZ);
    frontRightPivot.add(createWheelAssembly(tireGeo, hubGeo, wRad * 0.56, 0.34));
    group.add(frontRightPivot);

    const rl = createWheelAssembly(tireGeo, hubGeo, wRad * 0.56, 0.34);
    rl.position.set(trackHalfW, wRad, -axleZ);
    const rr = createWheelAssembly(tireGeo, hubGeo, wRad * 0.56, 0.34);
    rr.position.set(-trackHalfW, wRad, -axleZ);
    group.add(rl, rr);

    const dvr = createSeatedDriver(geometries, materials, 1.0);
    driverGroup = dvr.driverGroup;
    driverHead = dvr.driverHead;
    driverGroup.position.set(0.32, 0.78 - 0.32, 0.05);
    chassisGroup.add(driverGroup);
  }

  // Calipers turn with the steering uprights but never spin with the wheels.
  for (const wheel of wheels) {
    const side = wheel.parent === frontRightPivot || wheel.position.x < 0 ? -1 : 1;
    const caliper = detailBox(wheel.parent!, [.06, .17, .11], [wheel.position.x + side * .12, wheel.position.y + .04, wheel.position.z - spec.stats.wheelRadius * .42], accentMat);
    caliper.name = 'BRAKE_CALIPER';
  }

  return {
    group,
    chassisGroup,
    frontLeftPivot,
    frontRightPivot,
    wheels,
    driverGroup,
    driverHead,
    steeringWheel,
    setBrakeLights: (braking: boolean, active = true) => {
      headlightMat.emissiveIntensity = active ? 0.65 : 0.2;
      taillightMat.emissiveIntensity = braking ? 2.4 : active ? 0.5 : 0.2;
    },
    dispose: () => {
      instances.forEach((m) => m.dispose());
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}

/**
 * Convenience wrapper building the signature oversized Apex Mega Kart.
 */
export function buildKartMesh(contactShadowTexture: THREE.Texture): KartMeshRig {
  return buildVehicleMesh(VEHICLE_CATALOG.big_kart, contactShadowTexture);
}
