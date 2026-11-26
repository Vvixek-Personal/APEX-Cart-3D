import * as THREE from 'three';

export interface CharacterMeshRig {
  group: THREE.Group;
  bodyGroup: THREE.Group;
  headGroup: THREE.Group;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  leftLegPivot: THREE.Group;
  rightLegPivot: THREE.Group;
  setWalkPose: (walkCycle: number, speed: number) => void;
  setFirstPersonHidden: (hidden: boolean) => void;
  dispose: () => void;
}

/**
 * Builds an articulated 3D playable character (~2.15 units tall, pivoted at y = 0, facing +Z)
 * with racing street jacket, visor cap, swinging arms/legs, and contact shadow.
 */
export function buildCharacterMesh(contactShadowTexture: THREE.Texture): CharacterMeshRig {
  const group = new THREE.Group();
  group.name = 'PLAYER_CHARACTER';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const shadowGeo = new THREE.PlaneGeometry(1.35, 1.35);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowTexture,
    transparent: true,
    depthWrite: false,
    opacity: 0.42,
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.position.y = 0.02;
  group.add(shadowMesh);
  geometries.push(shadowGeo);
  materials.push(shadowMat);

  const jacketMat = new THREE.MeshStandardMaterial({
    color: 0x1d4ed8,
    roughness: 0.52,
    metalness: 0.1,
  });
  const stripeMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.38,
    metalness: 0.05,
  });
  const pantsMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.78,
    metalness: 0.04,
  });
  const shoeMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    roughness: 0.5,
    metalness: 0.08,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xf1c27d,
    roughness: 0.65,
    metalness: 0.02,
  });
  const hairCapMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.35,
    metalness: 0.12,
  });
  const shadesMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.15,
    metalness: 0.75,
  });
  materials.push(jacketMat, stripeMat, pantsMat, shoeMat, skinMat, hairCapMat, shadesMat);

  const bodyGroup = new THREE.Group();
  group.add(bodyGroup);

  // Legs (hip pivot at y = 0.86)
  const legGeo = new THREE.BoxGeometry(0.22, 0.74, 0.24);
  const shoeGeo = new THREE.BoxGeometry(0.24, 0.14, 0.34);
  geometries.push(legGeo, shoeGeo);

  const buildLeg = (xOffset: number): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(xOffset, 0.86, 0);
    const leg = new THREE.Mesh(legGeo, pantsMat);
    leg.position.set(0, -0.37, 0);
    leg.castShadow = true;
    const shoe = new THREE.Mesh(shoeGeo, shoeMat);
    shoe.position.set(0, -0.79, 0.05);
    shoe.castShadow = true;
    pivot.add(leg, shoe);
    bodyGroup.add(pivot);
    return pivot;
  };

  const leftLegPivot = buildLeg(0.14);
  const rightLegPivot = buildLeg(-0.14);

  // Torso (y = 0.86..1.58)
  const torsoGeo = new THREE.BoxGeometry(0.54, 0.72, 0.32);
  const torso = new THREE.Mesh(torsoGeo, jacketMat);
  torso.position.set(0, 1.22, 0);
  torso.castShadow = true;
  bodyGroup.add(torso);
  geometries.push(torsoGeo);

  const chestStripeGeo = new THREE.BoxGeometry(0.16, 0.7, 0.34);
  const chestStripe = new THREE.Mesh(chestStripeGeo, stripeMat);
  chestStripe.position.set(0, 1.22, 0);
  bodyGroup.add(chestStripe);
  geometries.push(chestStripeGeo);

  // Backpack / Collar accent
  const packGeo = new THREE.BoxGeometry(0.38, 0.44, 0.14);
  const pack = new THREE.Mesh(packGeo, pantsMat);
  pack.position.set(0, 1.24, -0.21);
  pack.castShadow = true;
  bodyGroup.add(pack);
  geometries.push(packGeo);

  // Arms (shoulder pivot at y = 1.50)
  const armGeo = new THREE.BoxGeometry(0.17, 0.56, 0.18);
  const handGeo = new THREE.BoxGeometry(0.15, 0.14, 0.15);
  geometries.push(armGeo, handGeo);

  const buildArm = (xOffset: number): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(xOffset, 1.5, 0);
    const sleeve = new THREE.Mesh(armGeo, jacketMat);
    sleeve.position.set(0, -0.26, 0);
    sleeve.castShadow = true;
    const hand = new THREE.Mesh(handGeo, skinMat);
    hand.position.set(0, -0.58, 0);
    pivot.add(sleeve, hand);
    bodyGroup.add(pivot);
    return pivot;
  };

  const leftArmPivot = buildArm(0.37);
  const rightArmPivot = buildArm(-0.37);

  // Head + Racing Cap (y = 1.64..2.12)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.82, 0);
  bodyGroup.add(headGroup);

  const headGeo = new THREE.BoxGeometry(0.36, 0.36, 0.36);
  const headMesh = new THREE.Mesh(headGeo, skinMat);
  headMesh.castShadow = true;
  headGroup.add(headMesh);
  geometries.push(headGeo);

  const shadesGeo = new THREE.BoxGeometry(0.32, 0.1, 0.08);
  const shades = new THREE.Mesh(shadesGeo, shadesMat);
  shades.position.set(0, 0.04, 0.18);
  headGroup.add(shades);
  geometries.push(shadesGeo);

  const capCrownGeo = new THREE.BoxGeometry(0.39, 0.16, 0.39);
  const capCrown = new THREE.Mesh(capCrownGeo, hairCapMat);
  capCrown.position.set(0, 0.19, 0);
  capCrown.castShadow = true;
  headGroup.add(capCrown);
  geometries.push(capCrownGeo);

  const capBrimGeo = new THREE.BoxGeometry(0.36, 0.05, 0.22);
  const capBrim = new THREE.Mesh(capBrimGeo, shadesMat);
  capBrim.position.set(0, 0.14, 0.24);
  headGroup.add(capBrim);
  geometries.push(capBrimGeo);

  return {
    group,
    bodyGroup,
    headGroup,
    leftArmPivot,
    rightArmPivot,
    leftLegPivot,
    rightLegPivot,
    setWalkPose: (walkCycle: number, speed: number) => {
      const amp = Math.min(1, Math.abs(speed) / 8.0) * 0.65;
      const swing = Math.sin(walkCycle) * amp;
      leftLegPivot.rotation.x = swing;
      rightLegPivot.rotation.x = -swing;
      leftArmPivot.rotation.x = -swing * 0.85;
      rightArmPivot.rotation.x = swing * 0.85;
      bodyGroup.position.y = Math.abs(Math.cos(walkCycle)) * amp * 0.08;
    },
    setFirstPersonHidden: (hidden: boolean) => {
      bodyGroup.visible = !hidden;
    },
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
