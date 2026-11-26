import * as THREE from 'three';
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
  highlightRing: THREE.Mesh;
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

  const shadowW = spec.bodyStyle === 'kart' ? 3.55 : 3.2;
  const shadowL = spec.bodyStyle === 'kart' ? 5.15 : 5.45;
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

  // Proximity selection ring (shown only when player character walks nearby)
  const ringGeo = new THREE.RingGeometry(2.35, 2.72, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const highlightRing = new THREE.Mesh(ringGeo, ringMat);
  highlightRing.position.set(0, 0.04, 0);
  highlightRing.visible = false;
  group.add(highlightRing);
  geometries.push(ringGeo);
  materials.push(ringMat);

  // Shared PBR material palette per vehicle (polished clearcoat-like automotive sheen)
  const bodyPaintMat = new THREE.MeshStandardMaterial({
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
    color: 0x7dd3fc,
    roughness: 0.09,
    metalness: 0.42,
    transparent: true,
    opacity: 0.64,
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
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = true;
    tire.receiveShadow = true;
    const hub = new THREE.Mesh(hubGeo, hubMat);
    tire.add(hub);

    const spokeGeoA = new THREE.BoxGeometry(wheelWidth + 0.035, spokeRadius * 1.72, spokeRadius * 0.24);
    const spokeGeoB = new THREE.BoxGeometry(wheelWidth + 0.035, spokeRadius * 0.24, spokeRadius * 1.72);
    geometries.push(spokeGeoA, spokeGeoB);
    const spokeA = new THREE.Mesh(spokeGeoA, chassisMat);
    const spokeB = new THREE.Mesh(spokeGeoB, chassisMat);
    tire.add(spokeA, spokeB);

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

  let driverGroup: THREE.Group;
  let driverHead: THREE.Group;
  let steeringWheel: THREE.Object3D | null = null;

  if (spec.bodyStyle === 'kart') {
    const KART_SCALE = 1.92;
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

    const noseGeo = new THREE.BoxGeometry(0.66, 0.26, 0.72);
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

    const sidepodGeo = new THREE.BoxGeometry(0.27, 0.25, 0.94);
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
  } else {
    const isCruiser = spec.bodyStyle === 'cruiser';
    const isRally = spec.bodyStyle === 'rally';
    const bodyW = isCruiser ? 2.38 : 2.32;
    const bodyL = isRally ? 4.35 : 4.7;
    const lowerH = isCruiser ? 0.88 : 0.72;

    const lowerGeo = new THREE.BoxGeometry(bodyW, lowerH, bodyL);
    const lowerMesh = new THREE.Mesh(lowerGeo, bodyPaintMat);
    lowerMesh.position.set(0, 0.34 + lowerH * 0.5, 0);
    lowerMesh.castShadow = true;
    lowerMesh.receiveShadow = true;
    bodyGroup.add(lowerMesh);
    geometries.push(lowerGeo);

    const stripeGeo = new THREE.BoxGeometry(0.38, 0.04, bodyL * 0.88);
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
      hl.position.set(side, 0.68, bodyL * 0.5 + 0.02);
      const tl = new THREE.Mesh(lightGeo, taillightMat);
      tl.position.set(side, 0.68, -bodyL * 0.5 - 0.02);
      bodyGroup.add(hl, tl);
    }

    const cabW = bodyW - 0.28;
    const cabL = isCruiser ? 2.75 : isRally ? 2.25 : 2.1;
    const cabH = isCruiser ? 0.72 : 0.58;
    const cabZ = isCruiser ? -0.25 : -0.22;

    const cabGeo = new THREE.BoxGeometry(cabW, cabH, cabL);
    const cabMesh = new THREE.Mesh(cabGeo, isCruiser ? accentMat : bodyPaintMat);
    cabMesh.position.set(0, 0.34 + lowerH + cabH * 0.5 - 0.02, cabZ);
    cabMesh.castShadow = true;
    bodyGroup.add(cabMesh);
    geometries.push(cabGeo);

    const glassGeo = new THREE.BoxGeometry(cabW + 0.04, cabH * 0.72, cabL - 0.18);
    const glassMesh = new THREE.Mesh(glassGeo, glassMat);
    glassMesh.position.set(0, 0.34 + lowerH + cabH * 0.46, cabZ);
    bodyGroup.add(glassMesh);
    geometries.push(glassGeo);

    if (spec.bodyStyle === 'sport' || isRally) {
      const wingStayGeo = new THREE.BoxGeometry(0.08, 0.28, 0.18);
      geometries.push(wingStayGeo);
      for (const side of [-0.66, 0.66]) {
        const stay = new THREE.Mesh(wingStayGeo, chassisMat);
        stay.position.set(side, 0.34 + lowerH + 0.14, -bodyL * 0.45);
        bodyGroup.add(stay);
      }
      const wingGeo = new THREE.BoxGeometry(bodyW - 0.08, 0.08, 0.34);
      const wing = new THREE.Mesh(wingGeo, isRally ? accentMat : bodyPaintMat);
      wing.position.set(0, 0.34 + lowerH + 0.3, -bodyL * 0.46);
      wing.rotation.x = -0.14;
      wing.castShadow = true;
      bodyGroup.add(wing);
      geometries.push(wingGeo);
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

    const wRad = spec.stats.wheelRadius;
    const tireGeo = new THREE.CylinderGeometry(wRad, wRad, 0.34, 18);
    tireGeo.rotateZ(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(wRad * 0.56, wRad * 0.56, 0.36, 14);
    hubGeo.rotateZ(Math.PI / 2);
    geometries.push(tireGeo, hubGeo);

    const trackHalfW = bodyW * 0.5 + 0.06;
    const axleZ = bodyL * 0.32;

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

  return {
    group,
    chassisGroup,
    frontLeftPivot,
    frontRightPivot,
    wheels,
    driverGroup,
    driverHead,
    steeringWheel,
    highlightRing,
    setBrakeLights: (braking: boolean, active = true) => {
      headlightMat.emissiveIntensity = active ? 0.65 : 0.2;
      taillightMat.emissiveIntensity = braking ? 2.4 : active ? 0.5 : 0.2;
    },
    dispose: () => {
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
