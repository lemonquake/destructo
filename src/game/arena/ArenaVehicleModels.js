// Low-poly models for the ten Destruct-Autos.
//
// Every chassis is hand-built so the silhouettes stay readable at arena
// distances and instantly recognisable in the selection screen. Each model
// returns a group carrying:
//   group.userData.wheels  — meshes to spin with road speed
//   group.userData.turret  — pivot that follows the driver's aim
//   group.userData.muzzle  — world-space anchor for the SMG flash
//   group.userData.driver  — the Destructo sitting inside (never gets out)

import * as THREE from 'three';

const mat = (color, options = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.68, metalness: 0.18, ...options });
const glassMat = color => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.15, metalness: 0.4, transparent: true, opacity: 0.75 });
const glowMat = color => new THREE.MeshBasicMaterial({ color, toneMapped: false });

function boxMesh(w, h, d, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}
function cylMesh(rTop, rBottom, h, segments, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

// A wheel is a cylinder laid on its side plus a hub cap, so spin is readable.
function makeWheel(radius, width, tyreMat, hubMat) {
  const group = new THREE.Group();
  const tyre = cylMesh(radius, radius, width, 10, tyreMat);
  tyre.rotation.z = Math.PI / 2;
  group.add(tyre);
  const hub = cylMesh(radius * 0.45, radius * 0.45, width + 0.12, 6, hubMat);
  hub.rotation.z = Math.PI / 2;
  group.add(hub);
  const spoke = boxMesh(width + 0.14, radius * 0.22, radius * 1.5, hubMat);
  group.add(spoke);
  return group;
}

// The Destructo behind the wheel: a crate-headed torso visible through the
// windscreen. It is welded in — this mode never lets the driver out.
function makeDriver(teamColor) {
  const group = new THREE.Group();
  const skin = mat(0xf6c99a);
  const head = boxMesh(0.85, 0.85, 0.85, mat(teamColor, { emissive: teamColor, emissiveIntensity: 0.22 }), 0, 0.95, 0);
  group.add(head);
  group.add(boxMesh(0.9, 0.9, 0.62, mat(0x2c3550), 0, 0.25, 0));
  group.add(boxMesh(0.22, 0.22, 0.22, skin, -0.2, 1.02, 0.44));
  group.add(boxMesh(0.22, 0.22, 0.22, skin, 0.2, 1.02, 0.44));
  const visor = boxMesh(0.68, 0.2, 0.06, glowMat(0x1a2338), 0, 1.0, 0.44);
  group.add(visor);
  group.add(boxMesh(0.24, 0.5, 0.24, skin, -0.52, 0.4, 0.2));
  group.add(boxMesh(0.24, 0.5, 0.24, skin, 0.52, 0.4, 0.2));
  return group;
}

function addWheels(group, positions, radius, width, tyreMat, hubMat) {
  const wheels = [];
  for (const [x, y, z] of positions) {
    const wheel = makeWheel(radius, width, tyreMat, hubMat);
    wheel.position.set(x, y, z);
    group.add(wheel);
    wheels.push(wheel);
  }
  return wheels;
}

// ── chassis builders ───────────────────────────────────────────────────────
const BUILDERS = {
  // Monster truck: enormous tyres, crate-slab body, roll bar.
  monster(P, body, trim, glass, accent) {
    const group = new THREE.Group();
    group.add(boxMesh(4.4, 1.5, 6.6, body, 0, 2.3, 0));
    group.add(boxMesh(3.6, 1.5, 3.0, body, 0, 3.6, -0.5));
    group.add(boxMesh(3.3, 1.0, 0.25, glass, 0, 3.75, 1.0));
    group.add(boxMesh(4.9, 0.5, 1.1, accent, 0, 1.9, 3.4));   // bull bar
    group.add(boxMesh(0.35, 1.5, 0.35, trim, -1.7, 4.6, -0.4));
    group.add(boxMesh(0.35, 1.5, 0.35, trim, 1.7, 4.6, -0.4));
    group.add(boxMesh(3.9, 0.35, 0.35, trim, 0, 5.3, -0.4));
    group.add(boxMesh(0.8, 1.2, 0.8, trim, -1.1, 3.6, -2.2)); // stacks
    group.add(boxMesh(0.8, 1.2, 0.8, trim, 1.1, 3.6, -2.2));
    const wheels = addWheels(group, [[-2.5, 1.5, 2.3], [2.5, 1.5, 2.3], [-2.5, 1.5, -2.3], [2.5, 1.5, -2.3]], 1.5, 1.0, P.tyre, P.hub);
    return { group, wheels, turretAt: [0, 4.3, 0.2], driverAt: [0, 3.0, -0.4], scale: 0.9 };
  },
  // Dragster: long spine, tiny front wheels, jet nozzle out back.
  dragster(P, body, trim, glass, accent) {
    const group = new THREE.Group();
    group.add(boxMesh(1.5, 0.7, 8.6, body, 0, 1.0, 0));
    group.add(boxMesh(2.6, 0.9, 3.0, body, 0, 1.25, -1.9));
    group.add(boxMesh(1.8, 0.7, 1.4, glass, 0, 1.9, -1.2));
    group.add(boxMesh(3.6, 0.22, 1.3, accent, 0, 2.7, -3.5));  // rear wing
    group.add(boxMesh(0.25, 0.9, 0.25, trim, -1.5, 2.2, -3.5));
    group.add(boxMesh(0.25, 0.9, 0.25, trim, 1.5, 2.2, -3.5));
    group.add(boxMesh(1.9, 0.2, 1.6, accent, 0, 0.85, 4.1));   // front splitter
    const nozzle = cylMesh(0.8, 0.55, 1.6, 8, trim, 0, 1.5, -4.4);
    nozzle.rotation.x = Math.PI / 2;
    group.add(nozzle);
    group.add(cylMesh(0.5, 0.5, 0.5, 8, glowMat(accent.color), 0, 1.5, -5.2));
    const wheels = addWheels(group, [[-1.9, 1.2, -2.6], [1.9, 1.2, -2.6]], 1.2, 1.1, P.tyre, P.hub)
      .concat(addWheels(group, [[-0.95, 0.6, 3.3], [0.95, 0.6, 3.3]], 0.6, 0.35, P.tyre, P.hub));
    return { group, wheels, turretAt: [0, 2.2, 0.4], driverAt: [0, 1.5, -1.2], scale: 0.92 };
  },
  // Buggy: exposed tube frame, missile rack on the roll cage.
  buggy(P, body, trim, glass, accent) {
    const group = new THREE.Group();
    group.add(boxMesh(3.0, 0.7, 5.0, body, 0, 1.2, 0));
    group.add(boxMesh(2.4, 0.8, 1.8, trim, 0, 1.85, -0.6));
    for (const x of [-1.4, 1.4]) {
      group.add(boxMesh(0.22, 1.9, 0.22, trim, x, 2.4, 0.9));
      group.add(boxMesh(0.22, 1.6, 0.22, trim, x, 2.25, -1.6));
    }
    group.add(boxMesh(3.1, 0.22, 0.22, trim, 0, 3.3, 0.9));
    group.add(boxMesh(3.1, 0.22, 0.22, trim, 0, 3.05, -1.6));
    group.add(boxMesh(0.22, 0.22, 2.6, trim, -1.4, 3.2, -0.35));
    group.add(boxMesh(0.22, 0.22, 2.6, trim, 1.4, 3.2, -0.35));
    // missile pods
    for (const x of [-1.1, 1.1]) {
      const pod = boxMesh(0.7, 0.7, 2.2, accent, x, 3.05, -1.0);
      group.add(pod);
      for (const [dx, dy] of [[-0.16, 0.16], [0.16, 0.16], [-0.16, -0.16], [0.16, -0.16]]) {
        group.add(cylMesh(0.13, 0.13, 0.5, 6, glowMat(0xffe066), x + dx, 3.05 + dy, 0.2));
      }
    }
    group.add(boxMesh(3.2, 0.3, 0.9, accent, 0, 1.0, 2.7));
    const wheels = addWheels(group, [[-1.85, 1.0, 1.7], [1.85, 1.0, 1.7], [-1.85, 1.0, -1.7], [1.85, 1.0, -1.7]], 1.0, 0.6, P.tyre, P.hub);
    return { group, wheels, turretAt: [0, 2.6, 0.3], driverAt: [0, 1.75, -0.55], scale: 1.0 };
  },
  // Rig: cab plus armoured trailer, ten visible wheels.
  rig(P, body, trim, glass, accent) {
    const group = new THREE.Group();
    group.add(boxMesh(3.6, 2.6, 3.6, body, 0, 2.5, 2.6));      // cab
    group.add(boxMesh(3.2, 1.1, 0.3, glass, 0, 3.3, 4.35));
    group.add(boxMesh(4.1, 0.7, 0.9, accent, 0, 1.5, 4.6));    // ram bar
    group.add(boxMesh(0.6, 1.6, 0.6, trim, -1.5, 4.3, 1.4));   // stacks
    group.add(boxMesh(0.6, 1.6, 0.6, trim, 1.5, 4.3, 1.4));
    group.add(boxMesh(3.9, 2.9, 7.4, trim, 0, 2.9, -2.8));     // trailer
    group.add(boxMesh(4.05, 0.5, 7.5, accent, 0, 4.2, -2.8));
    for (const z of [-0.4, -2.6, -4.8]) group.add(boxMesh(4.1, 0.3, 0.4, accent, 0, 2.2, z));
    group.add(boxMesh(3.6, 2.2, 0.35, accent, 0, 2.6, -6.5));  // tailgate
    const wheels = addWheels(group, [
      [-2.0, 1.2, 3.0], [2.0, 1.2, 3.0],
      [-2.05, 1.2, -0.4], [2.05, 1.2, -0.4],
      [-2.05, 1.2, -2.2], [2.05, 1.2, -2.2],
      [-2.05, 1.2, -5.0], [2.05, 1.2, -5.0],
    ], 1.2, 0.7, P.tyre, P.hub);
    return { group, wheels, turretAt: [0, 4.4, 2.4], driverAt: [0, 2.9, 2.8], scale: 0.92 };
  },
  // Hatch: friendly little commuter with a very unfriendly coil on the roof.
  hatch(P, body, trim, glass, accent) {
    const group = new THREE.Group();
    group.add(boxMesh(3.0, 1.2, 5.0, body, 0, 1.3, 0));
    group.add(boxMesh(2.7, 1.3, 3.0, body, 0, 2.4, -0.4));
    group.add(boxMesh(2.55, 0.9, 0.22, glass, 0, 2.5, 1.05));
    group.add(boxMesh(0.22, 0.9, 2.6, glass, -1.38, 2.5, -0.4));
    group.add(boxMesh(0.22, 0.9, 2.6, glass, 1.38, 2.5, -0.4));
    group.add(boxMesh(2.55, 0.9, 0.22, glass, 0, 2.5, -1.9));
    const coil = cylMesh(0.55, 0.75, 1.1, 8, trim, 0, 3.6, -0.6);
    group.add(coil);
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), glowMat(accent.color));
    orb.position.set(0, 4.4, -0.6);
    group.add(orb);
    for (const x of [-1.0, 1.0]) group.add(boxMesh(0.35, 0.35, 0.2, glowMat(0xfff2b0), x, 1.5, 2.55));
    const wheels = addWheels(group, [[-1.65, 0.85, 1.6], [1.65, 0.85, 1.6], [-1.65, 0.85, -1.6], [1.65, 0.85, -1.6]], 0.85, 0.5, P.tyre, P.hub);
    return { group, wheels, turretAt: [0, 3.2, 0.6], driverAt: [0, 2.1, 0.1], scale: 1.0 };
  },
  // Muscle car with a plough blade and a hatch-mounted junk cannon.
  muscle(P, body, trim, glass, accent) {
    const group = new THREE.Group();
    group.add(boxMesh(3.4, 1.1, 6.2, body, 0, 1.25, 0));
    group.add(boxMesh(3.0, 1.0, 2.6, body, 0, 2.2, -0.9));
    group.add(boxMesh(2.85, 0.75, 0.22, glass, 0, 2.3, 0.4));
    group.add(boxMesh(2.4, 0.6, 1.4, trim, 0, 2.05, 2.0));      // supercharger scoop
    group.add(boxMesh(1.2, 0.5, 0.8, accent, 0, 2.5, 2.0));
    // plough blade
    const blade = boxMesh(4.6, 1.5, 0.4, accent, 0, 1.3, 3.6);
    blade.rotation.x = -0.28;
    group.add(blade);
    group.add(boxMesh(0.4, 0.5, 1.2, trim, -1.4, 1.1, 3.1));
    group.add(boxMesh(0.4, 0.5, 1.2, trim, 1.4, 1.1, 3.1));
    group.add(boxMesh(3.2, 0.25, 1.0, trim, 0, 2.35, -3.0));    // spoiler
    for (const x of [-1.2, 1.2]) group.add(cylMesh(0.22, 0.22, 1.4, 6, trim, x, 0.9, -3.3));
    const wheels = addWheels(group, [[-1.85, 0.95, 2.0], [1.85, 0.95, 2.0], [-1.9, 1.05, -2.0], [1.9, 1.05, -2.0]], 1.0, 0.7, P.tyre, P.hub);
    return { group, wheels, turretAt: [0, 2.9, -0.8], driverAt: [0, 2.0, -0.3], scale: 0.96 };
  },
  // Half-track: tracked rear, wheeled front, reactor tank on the deck.
  halftrack(P, body, trim, glass, accent) {
    const group = new THREE.Group();
    group.add(boxMesh(3.6, 1.6, 6.4, body, 0, 1.7, 0));
    group.add(boxMesh(3.2, 1.4, 2.4, body, 0, 3.0, 1.4));
    group.add(boxMesh(3.0, 0.9, 0.22, glass, 0, 3.1, 2.6));
    const tank = cylMesh(0.9, 0.9, 3.2, 10, trim, 0, 3.2, -1.6);
    tank.rotation.x = Math.PI / 2;
    group.add(tank);
    group.add(cylMesh(0.95, 0.95, 0.3, 10, accent, 0, 3.2, -3.2));
    for (const z of [-0.6, -1.6, -2.6]) group.add(boxMesh(2.1, 0.2, 0.2, accent, 0, 4.15, z));
    // track housings
    for (const x of [-1.9, 1.9]) {
      group.add(boxMesh(0.9, 1.5, 4.2, trim, x, 1.2, -1.2));
      for (const z of [-2.7, -1.6, -0.5, 0.6]) group.add(cylMesh(0.35, 0.35, 1.0, 8, P.hub, x, 0.65, z));
    }
    const wheels = addWheels(group, [[-1.85, 0.9, 2.5], [1.85, 0.9, 2.5]], 0.9, 0.6, P.tyre, P.hub);
    return { group, wheels, turretAt: [0, 3.9, 1.2], driverAt: [0, 2.7, 1.5], scale: 0.95 };
  },
  // Kart: tiny, open, ludicrously overpowered exhaust.
  kart(P, body, trim, glass, accent) {
    const group = new THREE.Group();
    group.add(boxMesh(2.2, 0.5, 3.8, body, 0, 0.9, 0));
    group.add(boxMesh(1.9, 0.8, 1.3, body, 0, 1.45, -0.6));
    group.add(boxMesh(1.5, 0.7, 0.9, trim, 0, 1.6, -1.6));
    group.add(boxMesh(2.6, 0.24, 0.9, accent, 0, 2.3, -1.9));
    group.add(boxMesh(0.2, 0.6, 0.2, trim, -1.0, 1.95, -1.9));
    group.add(boxMesh(0.2, 0.6, 0.2, trim, 1.0, 1.95, -1.9));
    group.add(boxMesh(2.4, 0.2, 0.7, accent, 0, 0.8, 2.2));
    for (const x of [-0.7, 0.7]) {
      const pipe = cylMesh(0.22, 0.3, 1.5, 6, trim, x, 1.6, -2.3);
      pipe.rotation.x = 1.2;
      group.add(pipe);
      group.add(cylMesh(0.28, 0.28, 0.2, 6, glowMat(accent.color), x, 2.1, -2.7));
    }
    const wheels = addWheels(group, [[-1.35, 0.7, 1.3], [1.35, 0.7, 1.3], [-1.45, 0.8, -1.3], [1.45, 0.8, -1.3]], 0.75, 0.55, P.tyre, P.hub);
    return { group, wheels, turretAt: [0, 1.9, 0.2], driverAt: [0, 1.2, -0.4], scale: 1.0 };
  },
  // Hover platform: no wheels at all, four glowing lift pods.
  hover(P, body, trim, glass, accent) {
    const group = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.1, 1.1, 6), body);
    hull.position.y = 1.9;
    hull.castShadow = true;
    group.add(hull);
    group.add(boxMesh(2.4, 1.2, 2.4, body, 0, 2.9, -0.2));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.25, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass);
    dome.position.set(0, 3.4, -0.2);
    group.add(dome);
    for (const [x, z] of [[-2.3, 2.3], [2.3, 2.3], [-2.3, -2.3], [2.3, -2.3]]) {
      const pod = cylMesh(0.85, 0.65, 0.8, 8, trim, x, 1.5, z);
      group.add(pod);
      const glow = cylMesh(0.7, 0.35, 0.5, 8, glowMat(accent.color), x, 1.0, z);
      group.add(glow);
    }
    const fin = boxMesh(0.3, 1.4, 2.0, accent, 0, 2.9, -2.6);
    group.add(fin);
    return { group, wheels: [], turretAt: [0, 3.1, 1.0], driverAt: [0, 2.6, -0.2], scale: 1.0, hoverPods: true };
  },
  // Armoured ice-cream van with a roof mortar.
  van(P, body, trim, glass, accent) {
    const group = new THREE.Group();
    group.add(boxMesh(3.6, 3.0, 6.6, body, 0, 2.6, -0.3));
    group.add(boxMesh(3.4, 1.6, 1.6, body, 0, 1.9, 3.2));
    group.add(boxMesh(3.1, 0.9, 0.25, glass, 0, 2.6, 3.9));
    group.add(boxMesh(3.7, 0.6, 0.55, accent, 0, 1.3, 4.1));
    // serving window + awning
    group.add(boxMesh(0.25, 1.2, 2.4, glass, 1.82, 2.9, 0.2));
    const awning = boxMesh(1.4, 0.15, 2.6, accent, 2.3, 3.7, 0.2);
    awning.rotation.z = -0.34;
    group.add(awning);
    // cone on the roof
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.6, 8), mat(0xf3c98b));
    cone.position.set(-1.1, 4.9, 1.6);
    cone.rotation.x = Math.PI;
    group.add(cone);
    const scoop = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), mat(0xffb8d8));
    scoop.position.set(-1.1, 5.6, 1.6);
    group.add(scoop);
    // mortar tube
    const tube = cylMesh(0.5, 0.62, 2.6, 8, trim, 0.8, 5.0, -1.2);
    tube.rotation.x = -0.5;
    group.add(tube);
    group.add(boxMesh(1.6, 0.4, 1.6, trim, 0.8, 4.2, -1.2));
    const wheels = addWheels(group, [[-1.9, 1.05, 2.4], [1.9, 1.05, 2.4], [-1.9, 1.05, -2.4], [1.9, 1.05, -2.4]], 1.05, 0.65, P.tyre, P.hub);
    return { group, wheels, turretAt: [0.8, 4.6, -1.0], driverAt: [0, 3.0, 2.8], scale: 0.95 };
  },
};

// A short barrel that sits on the aim pivot for every chassis, so the SMG
// visibly tracks whatever the driver is looking at.
function makeTurret(trimMat, accentColor) {
  const turret = new THREE.Group();
  const mount = cylMesh(0.45, 0.55, 0.35, 8, trimMat, 0, 0, 0);
  turret.add(mount);
  const barrel = cylMesh(0.16, 0.16, 2.2, 8, trimMat, 0, 0.22, 1.0);
  barrel.rotation.x = Math.PI / 2;
  turret.add(barrel);
  turret.add(boxMesh(0.5, 0.32, 0.7, trimMat, 0, 0.22, -0.1));
  const tip = cylMesh(0.24, 0.24, 0.28, 8, glowMat(accentColor), 0, 0.22, 2.05);
  tip.rotation.x = Math.PI / 2;
  turret.add(tip);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.22, 2.25);
  turret.add(muzzle);
  turret.userData.muzzle = muzzle;
  return turret;
}

export function createDestructAutoModel(autoDef, teamColor = 0x2fb4ff) {
  const paint = autoDef.paint;
  const materials = {
    body: mat(paint.body, { metalness: 0.3, roughness: 0.55, emissive: paint.body, emissiveIntensity: 0.12 }),
    trim: mat(paint.trim, { metalness: 0.45, roughness: 0.5, emissive: paint.trim, emissiveIntensity: 0.08 }),
    glass: glassMat(paint.glass),
    accent: mat(paint.accent, { emissive: paint.accent, emissiveIntensity: 0.25 }),
    tyre: mat(0x1b1c22, { roughness: 0.95, metalness: 0 }),
    hub: mat(0xc9d2dd, { metalness: 0.6, roughness: 0.35 }),
  };
  materials.accent.color.setHex(paint.accent);
  const builder = BUILDERS[autoDef.chassis] || BUILDERS.muscle;
  const built = builder(materials, materials.body, materials.trim, materials.glass, materials.accent);
  const root = new THREE.Group();
  const chassis = built.group;
  chassis.scale.setScalar(built.scale || 1);
  root.add(chassis);

  const turret = makeTurret(materials.trim, paint.accent);
  turret.position.set(...built.turretAt);
  chassis.add(turret);

  const driver = makeDriver(teamColor);
  driver.position.set(...built.driverAt);
  chassis.add(driver);

  // Team aura: a flat ring under the vehicle, the same language the on-foot
  // Destructos use so allegiance reads instantly from the chase camera.
  const aura = new THREE.Mesh(
    new THREE.RingGeometry(2.6, 3.6, 20),
    new THREE.MeshBasicMaterial({ color: teamColor, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false })
  );
  aura.rotation.x = -Math.PI / 2;
  aura.position.y = 0.08;
  root.add(aura);

  root.userData = {
    wheels: built.wheels || [],
    turret,
    muzzle: turret.userData.muzzle,
    driver,
    aura,
    materials,
    chassis,
    hoverPods: Boolean(built.hoverPods),
  };
  return root;
}

export function disposeModel(root) {
  root.traverse(object => {
    object.geometry?.dispose?.();
    if (Array.isArray(object.material)) object.material.forEach(m => m.dispose?.());
    else object.material?.dispose?.();
  });
}

export const CHASSIS_BUILDER_IDS = Object.freeze(Object.keys(BUILDERS));
