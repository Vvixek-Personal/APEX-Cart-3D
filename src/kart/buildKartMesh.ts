import * as THREE from 'three';

export interface KartMeshRig {
  group: THREE.Group;
  frontLeftPivot: THREE.Group;
  frontRightPivot: THREE.Group;
  wheels: THREE.Mesh[];
  dispose: () => void;
}

/**
 * Builds a clean, lightweight, composite 3D player go-kart model (THREE.Group)
 * pivoted at bottom-center (y = 0) and facing local +Z.
 */
export function buildKartMesh(contactShadowTexture: THREE.Texture): KartMeshRig {
  const group = new THREE.Group();
  group.name = 'PLAYER_KART';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  // Grounded contact shadow disc directly beneath the kart
  const shadowGeo = new THREE.PlaneGeometry(1.9, 2.75);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowTexture,
    transparent: true,
    depthWrite: false,
    opacity: 0.44,
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.position.set(0, 0.015, 0);
  group.add(shadowMesh);
  geometries.push(shadowGeo);
  materials.push(shadowMat);

  // Varied PBR materials across bodywork, chassis, tires, alloy hubs, and chrome
  const bodyPaintMat = new THREE.MeshStandardMaterial({
    color: 0xe63329,
    roughness: 0.22,
    metalness: 0.14,
  });
  const accentStripeMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.3,
    metalness: 0.08,
  });
  const chassisMat = new THREE.MeshStandardMaterial({
    color: 0x262c35,
    roughness: 0.68,
    metalness: 0.32,
  });
  const seatMat = new THREE.MeshStandardMaterial({
    color: 0x1b2027,
    roughness: 0.85,
    metalness: 0.05,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x1e2228,
    roughness: 0.86,
    metalness: 0.04,
  });
  const hubMat = new THREE.MeshStandardMaterial({
    color: 0xf4c430,
    roughness: 0.26,
    metalness: 0.78,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xdce3ec,
    roughness: 0.18,
    metalness: 0.88,
  });
  materials.push(
    bodyPaintMat,
    accentStripeMat,
    chassisMat,
    seatMat,
    tireMat,
    hubMat,
    chromeMat,
  );

  // 1. Primary Chassis Floorpan (beveled extrusion in XZ via rotation)
  const floorShape = new THREE.Shape();
  floorShape.moveTo(-0.44, -1.02);
  floorShape.lineTo(0.44, -1.02);
  floorShape.lineTo(0.48, 0.35);
  floorShape.lineTo(0.32, 1.05);
  floorShape.lineTo(-0.32, 1.05);
  floorShape.lineTo(-0.48, 0.35);
  floorShape.closePath();

  const floorGeo = new THREE.ExtrudeGeometry(floorShape, {
    depth: 0.1,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 2,
  });
  floorGeo.rotateX(Math.PI / 2);
  const floorMesh = new THREE.Mesh(floorGeo, chassisMat);
  floorMesh.position.y = 0.22;
  floorMesh.castShadow = true;
  floorMesh.receiveShadow = true;
  group.add(floorMesh);
  geometries.push(floorGeo);

  // 2. Sculpted Racing Nose Cone (front fairing)
  const noseGeo = new THREE.BoxGeometry(0.62, 0.24, 0.66);
  const noseMesh = new THREE.Mesh(noseGeo, bodyPaintMat);
  noseMesh.position.set(0, 0.33, 0.78);
  noseMesh.rotation.x = 0.16;
  noseMesh.castShadow = true;
  noseMesh.receiveShadow = true;
  group.add(noseMesh);
  geometries.push(noseGeo);

  const stripeGeo = new THREE.BoxGeometry(0.18, 0.04, 0.62);
  const stripeMesh = new THREE.Mesh(stripeGeo, accentStripeMat);
  stripeMesh.position.set(0, 0.45, 0.78);
  stripeMesh.rotation.x = 0.16;
  group.add(stripeMesh);
  geometries.push(stripeGeo);

  // 3. Twin Racing Sidepods
  const sidepodGeo = new THREE.BoxGeometry(0.24, 0.22, 0.88);
  geometries.push(sidepodGeo);
  for (const side of [-1, 1]) {
    const pod = new THREE.Mesh(sidepodGeo, bodyPaintMat);
    pod.position.set(side * 0.48, 0.29, 0.02);
    pod.castShadow = true;
    pod.receiveShadow = true;
    group.add(pod);
  }

  // 4. Front & Rear Bumpers
  const frontBumperGeo = new THREE.BoxGeometry(1.18, 0.12, 0.12);
  const frontBumper = new THREE.Mesh(frontBumperGeo, chassisMat);
  frontBumper.position.set(0, 0.22, 1.12);
  frontBumper.castShadow = true;
  group.add(frontBumper);
  geometries.push(frontBumperGeo);

  const rearBumperGeo = new THREE.BoxGeometry(1.32, 0.14, 0.12);
  const rearBumper = new THREE.Mesh(rearBumperGeo, chassisMat);
  rearBumper.position.set(0, 0.24, -1.1);
  rearBumper.castShadow = true;
  group.add(rearBumper);
  geometries.push(rearBumperGeo);

  // 5. Bucket Racing Seat
  const seatBaseGeo = new THREE.BoxGeometry(0.46, 0.1, 0.44);
  const seatBase = new THREE.Mesh(seatBaseGeo, seatMat);
  seatBase.position.set(0, 0.29, -0.18);
  group.add(seatBase);
  geometries.push(seatBaseGeo);

  const seatBackGeo = new THREE.BoxGeometry(0.46, 0.48, 0.12);
  const seatBack = new THREE.Mesh(seatBackGeo, seatMat);
  seatBack.position.set(0, 0.5, -0.38);
  seatBack.rotation.x = -0.22;
  seatBack.castShadow = true;
  group.add(seatBack);
  geometries.push(seatBackGeo);

  // 6. Steering Column & Racing Steering Wheel
  const colGeo = new THREE.CylinderGeometry(0.032, 0.038, 0.44, 10);
  const colMesh = new THREE.Mesh(colGeo, chromeMat);
  colMesh.position.set(0, 0.52, 0.36);
  colMesh.rotation.x = 0.65;
  group.add(colMesh);
  geometries.push(colGeo);

  const wheelRimGeo = new THREE.TorusGeometry(0.15, 0.028, 10, 20);
  const wheelRim = new THREE.Mesh(wheelRimGeo, seatMat);
  wheelRim.position.set(0, 0.66, 0.23);
  wheelRim.rotation.x = -0.6;
  group.add(wheelRim);
  geometries.push(wheelRimGeo);

  // 7. Rear Engine Block & Chrome Exhausts
  const engineGeo = new THREE.BoxGeometry(0.36, 0.28, 0.36);
  const engineMesh = new THREE.Mesh(engineGeo, chassisMat);
  engineMesh.position.set(0, 0.38, -0.78);
  engineMesh.castShadow = true;
  group.add(engineMesh);
  geometries.push(engineGeo);

  const exhaustGeo = new THREE.CylinderGeometry(0.045, 0.055, 0.32, 10);
  exhaustGeo.rotateX(Math.PI / 2);
  geometries.push(exhaustGeo);
  for (const side of [-0.14, 0.14]) {
    const pipe = new THREE.Mesh(exhaustGeo, chromeMat);
    pipe.position.set(side, 0.42, -1.0);
    pipe.castShadow = true;
    group.add(pipe);
  }

  // 8. Four Racing Wheels (front steerable pivots, wider rear slicks)
  const frontTireGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.2, 18);
  frontTireGeo.rotateZ(Math.PI / 2);
  const frontHubGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.215, 14);
  frontHubGeo.rotateZ(Math.PI / 2);

  const rearTireGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.28, 18);
  rearTireGeo.rotateZ(Math.PI / 2);
  const rearHubGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.295, 14);
  rearHubGeo.rotateZ(Math.PI / 2);

  geometries.push(frontTireGeo, frontHubGeo, rearTireGeo, rearHubGeo);

  const wheels: THREE.Mesh[] = [];

  const createWheelAssembly = (
    tireGeo: THREE.BufferGeometry,
    hubGeo: THREE.BufferGeometry,
  ): THREE.Mesh => {
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = true;
    tire.receiveShadow = true;
    const hub = new THREE.Mesh(hubGeo, hubMat);
    tire.add(hub);
    wheels.push(tire);
    return tire;
  };

  const frontLeftPivot = new THREE.Group();
  frontLeftPivot.position.set(0.62, 0.22, 0.72);
  frontLeftPivot.add(createWheelAssembly(frontTireGeo, frontHubGeo));
  group.add(frontLeftPivot);

  const frontRightPivot = new THREE.Group();
  frontRightPivot.position.set(-0.62, 0.22, 0.72);
  frontRightPivot.add(createWheelAssembly(frontTireGeo, frontHubGeo));
  group.add(frontRightPivot);

  const rearLeftWheel = createWheelAssembly(rearTireGeo, rearHubGeo);
  rearLeftWheel.position.set(0.66, 0.25, -0.68);
  group.add(rearLeftWheel);

  const rearRightWheel = createWheelAssembly(rearTireGeo, rearHubGeo);
  rearRightWheel.position.set(-0.66, 0.25, -0.68);
  group.add(rearRightWheel);

  return {
    group,
    frontLeftPivot,
    frontRightPivot,
    wheels,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
