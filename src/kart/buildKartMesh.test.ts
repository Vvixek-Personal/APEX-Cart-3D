import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildVehicleMesh } from './buildKartMesh';
import { VEHICLE_CATALOG } from './vehicleCatalog';

test('all vehicle variants build finite meshes, articulated wheels, brake calipers and release GPU resources', () => {
  const shadow = new THREE.Texture();
  for (const spec of Object.values(VEHICLE_CATALOG)) {
    const rig = buildVehicleMesh(spec, shadow);
    assert.equal(rig.wheels.length, 4, spec.name);
    assert.ok(rig.steeringWheel);
    assert.equal(rig.frontLeftPivot.children.includes(rig.wheels[0]), true);
    assert.equal(rig.frontRightPivot.children.includes(rig.wheels[1]), true);
    let calipers = 0;
    let disposedGeometry = 0;
    let disposedInstances = 0;
    const geometries = new Set<THREE.BufferGeometry>();
    rig.group.traverse(object => {
      if (object.name === 'BRAKE_CALIPER') calipers++;
      if (object instanceof THREE.InstancedMesh) object.addEventListener('dispose', () => disposedInstances++);
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      const positions = object.geometry.getAttribute('position');
      for (const value of positions.array) assert.ok(Number.isFinite(value), spec.name);
    });
    assert.equal(calipers, 4);
    for (const geo of geometries) geo.addEventListener('dispose', () => disposedGeometry++);
    rig.setBrakeLights(true);
    rig.setBrakeLights(false, false);
    rig.dispose();
    assert.equal(disposedGeometry, geometries.size);
    assert.equal(disposedInstances, 8);
  }
  shadow.dispose();
});
