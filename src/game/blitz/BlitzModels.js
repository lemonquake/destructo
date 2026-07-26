// Low-poly models for Crate Blitz: the Destructo, the three obstacle materials,
// the Charge Crate, the power-up pickups and the effects.
//
// There is one character now, so the Destructo is built from the base game's
// silhouette and simply painted in the player's colour — the colour IS the
// identity in this mode. The power-up pickups are 3D restatements of the SVG
// badges in src/data/blitzPowerups.js, so what you learn in the menu is what
// you recognise on the floor.

import * as THREE from 'three';
import { TILE_SIZE, OBSTACLES, TILE } from '../../data/blitzArenas.js';

const mat = (color, options = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.72, metalness: 0.14, ...options });
const glow = color => new THREE.MeshBasicMaterial({ color, toneMapped: false });
const box = (w, h, d, material, x = 0, y = 0, z = 0) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
};
const cyl = (rt, rb, h, seg, material, x = 0, y = 0, z = 0) => {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
};

// Darkens a hex colour for trim, so every paint job gets a matching shadow tone
// without needing a second entry in the palette.
function shade(hex, amount = 0.45) {
  const color = new THREE.Color(hex);
  color.multiplyScalar(amount);
  return color.getHex();
}

// ── the Destructo ──────────────────────────────────────────────────────────
export function createDestructoModel(playerColor = 0x2fb4ff) {
  const bodyMat = mat(playerColor, { metalness: 0.2, emissive: playerColor, emissiveIntensity: 0.12 });
  const trimMat = mat(shade(playerColor, 0.4), { metalness: 0.3 });
  const skinMat = mat(0xf6c99a);
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);

  rig.add(box(1.5, 1.6, 1.1, bodyMat, 0, 1.55, 0));               // torso
  const head = box(1.35, 1.35, 1.35, bodyMat, 0, 2.48, 0);        // crate head
  rig.add(head);
  // The crate head's banding, so it still reads as a crate at any paint job.
  rig.add(box(1.42, 0.16, 0.16, trimMat, 0, 2.48, 0.6));
  rig.add(box(0.16, 1.42, 0.16, trimMat, 0.6, 2.48, 0.6));
  rig.add(box(1.0, 0.28, 0.1, glow(0x11f0d0), 0, 2.46, 0.7));     // visor
  const legL = box(0.44, 1.0, 0.52, trimMat, -0.4, 0.55, 0);
  const legR = box(0.44, 1.0, 0.52, trimMat, 0.4, 0.55, 0);
  rig.add(legL, legR);
  const armL = box(0.34, 1.0, 0.34, skinMat, -0.94, 1.6, 0.1);
  const armR = box(0.34, 1.0, 0.34, skinMat, 0.94, 1.6, 0.1);
  rig.add(armL, armR);
  // Little shoulder pads in the paint colour, so allies read from behind too.
  rig.add(box(0.6, 0.3, 0.7, bodyMat, -0.9, 2.15, 0));
  rig.add(box(0.6, 0.3, 0.7, bodyMat, 0.9, 2.15, 0));

  const aura = new THREE.Mesh(
    new THREE.RingGeometry(1.35, 2.0, 20),
    new THREE.MeshBasicMaterial({ color: playerColor, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })
  );
  aura.rotation.x = -Math.PI / 2;
  aura.position.y = 0.06;
  root.add(aura);

  root.userData = { rig, legs: [legL, legR], arms: [armL, armR], head, aura, materials: { bodyMat, trimMat, skinMat } };
  return root;
}

// The bobbing "this is you" arrow that drops in every minute or two.
export function createPlayerArrow(color = 0xffd23f) {
  const group = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.95, 2.0, 4), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
  cone.rotation.x = Math.PI;          // point down at the head
  cone.rotation.y = Math.PI / 4;
  group.add(cone);
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.5, 0.55), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
  shaft.position.y = 1.6;
  shaft.rotation.y = Math.PI / 4;
  group.add(shaft);
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(1.2, 1.7, 18),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 2.6;
  group.add(halo);
  group.position.y = 6.2;
  group.renderOrder = 24;
  group.userData = { cone, shaft, halo };
  return group;
}

// ── tile furniture ─────────────────────────────────────────────────────────
export function createPillarMesh(materials) {
  const group = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(TILE_SIZE, 7.5, TILE_SIZE), materials.pillar);
  shaft.position.y = 3.75;
  shaft.castShadow = shaft.receiveShadow = true;
  group.add(shaft);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(TILE_SIZE * 1.04, 0.6, TILE_SIZE * 1.04), materials.pillarCap);
  cap.position.y = 7.75;
  group.add(cap);
  return group;
}

// One builder for all three breakables; the material record decides how it
// looks, so adding a fourth obstacle kind is a data change, not a code change.
export function createObstacleMesh(tile, materials) {
  const spec = OBSTACLES[tile];
  const group = new THREE.Group();
  if (!spec) return group;
  const bodyMat = materials.obstacle[spec.id];
  const trimMat = materials.obstacleTrim[spec.id];

  if (spec.id === 'wood') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(TILE_SIZE * 0.9, 5.2, TILE_SIZE * 0.9), bodyMat);
    body.position.y = 2.6;
    body.castShadow = body.receiveShadow = true;
    group.add(body);
    // Crate battens, the same language as the base game's crates.
    for (const [w, h, d, y, z] of [[TILE_SIZE * 0.94, 0.45, TILE_SIZE * 0.2, 4.6, 0], [TILE_SIZE * 0.94, 0.45, TILE_SIZE * 0.2, 0.6, 0]]) {
      group.add(box(w, h, d, trimMat, 0, y, z));
    }
    const diagonal = box(TILE_SIZE * 0.94, 0.4, 0.4, trimMat, 0, 2.6, TILE_SIZE * 0.46);
    diagonal.rotation.z = 0.62;
    group.add(diagonal);
  } else if (spec.id === 'brick') {
    // Three offset courses so a brick block is unmistakable at a glance — and
    // so the mesh has somewhere to visibly crack when it survives a blast.
    const courses = [];
    for (let i = 0; i < 3; i++) {
      const course = new THREE.Mesh(new THREE.BoxGeometry(TILE_SIZE * 0.92, 1.7, TILE_SIZE * 0.92), bodyMat);
      course.position.y = 0.95 + i * 1.8;
      course.rotation.y = i % 2 === 0 ? 0 : 0.06;
      course.castShadow = course.receiveShadow = true;
      group.add(course);
      courses.push(course);
      group.add(box(TILE_SIZE * 0.96, 0.18, TILE_SIZE * 0.96, trimMat, 0, 1.82 + i * 1.8, 0));
    }
    group.userData.courses = courses;
  } else {
    // Scrap pile: a scatter of slabs, deliberately messy and a bit shorter so
    // sightlines over debris read differently to sightlines over stock.
    const chunks = [
      [3.4, 2.2, 3.0, -0.7, 1.1, 0.5, 0.4],
      [2.8, 1.8, 3.4, 1.0, 0.9, -0.8, -0.7],
      [2.4, 2.6, 2.2, 0.2, 2.4, 1.0, 0.9],
      [3.0, 1.4, 2.4, -0.9, 3.1, -0.6, -0.3],
    ];
    for (const [w, h, d, x, y, z, rot] of chunks) {
      const chunk = box(w, h, d, bodyMat, x, y, z);
      chunk.rotation.y = rot;
      chunk.receiveShadow = true;
      group.add(chunk);
    }
    group.add(box(TILE_SIZE * 0.8, 0.4, TILE_SIZE * 0.8, trimMat, 0, 0.2, 0));
  }
  group.userData.spec = spec;
  return group;
}

export function createSuddenMesh(materials) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(TILE_SIZE, 8.5, TILE_SIZE), materials.sudden);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

// The Charge Crate: the base game's crate, wired to explode.
export function createChargeMesh(color) {
  const group = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.BoxGeometry(3.6, 3.6, 3.6), mat(0x8a5a2c, { metalness: 0.2 }));
  shell.position.y = 1.9;
  shell.castShadow = true;
  group.add(shell);
  const bandMat = mat(0x40474f, { metalness: 0.6 });
  group.add(box(3.7, 0.55, 0.55, bandMat, 0, 1.9, 0));
  group.add(box(0.55, 0.55, 3.7, bandMat, 0, 1.9, 0));
  const fuse = cyl(0.12, 0.12, 1.1, 6, mat(0x2a2a2a), 0.5, 4.2, 0);
  fuse.rotation.z = -0.4;
  group.add(fuse);
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), glow(color));
  core.position.set(0.75, 4.7, 0);
  group.add(core);
  group.userData = { core, shell };
  return group;
}

// ── power-up pickups ───────────────────────────────────────────────────────
// A distinct solid per upgrade, matching its SVG badge. The animation (bounce,
// pulse, shine sweep) lives in BlitzMode so every pickup breathes in step.
const SOLIDS = {
  star(material) {
    // A four-point blast bloom: two crossed stretched octahedra.
    const group = new THREE.Group();
    for (const rotation of [0, Math.PI / 4]) {
      const spike = new THREE.Mesh(new THREE.OctahedronGeometry(1.35, 0), material);
      spike.scale.set(1, 0.45, 1);
      spike.rotation.y = rotation;
      group.add(spike);
    }
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 0), material);
    group.add(core);
    return group;
  },
  cube(material) {
    const group = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.0, 1.7), material);
    base.position.y = -0.35;
    group.add(base);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.85, 1.1), material);
    top.position.y = 0.55;
    top.rotation.y = 0.5;
    group.add(top);
    return group;
  },
  wedge(material) {
    const group = new THREE.Group();
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.5, 1.4), material);
    group.add(boot);
    const toe = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), material);
    toe.position.set(0, -0.5, 1.0);
    group.add(toe);
    const thrust = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 4), material);
    thrust.rotation.x = Math.PI / 2;
    thrust.position.z = -1.3;
    group.add(thrust);
    return group;
  },
  shell(material) {
    const group = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.15, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), material);
    group.add(dome);
    const skirt = new THREE.Mesh(new THREE.ConeGeometry(1.15, 1.1, 12), material);
    skirt.position.y = -0.72;
    skirt.rotation.x = Math.PI;
    group.add(skirt);
    return group;
  },
  fist(material) {
    const group = new THREE.Group();
    const knuckle = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 1.2), material);
    group.add(knuckle);
    for (const x of [-0.45, 0.45]) {
      const finger = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.6), material);
      finger.position.set(x, 0.5, 0.75);
      group.add(finger);
    }
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.6, 0.6, 8), material);
    cuff.position.set(0, -0.2, -0.9);
    cuff.rotation.x = Math.PI / 2;
    group.add(cuff);
    return group;
  },
  cross(material) {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.72, 0.72), material));
    group.add(new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.9, 0.72), material));
    group.add(new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.72, 1.9), material));
    return group;
  },
};

export function createPowerupMesh(def) {
  const color = def.color;
  const group = new THREE.Group();
  // A high emissive plus low roughness is what makes these read as "shiny" the
  // moment they land, before the pulse animation even starts.
  const body = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 1.05,
    flatShading: true, metalness: 0.55, roughness: 0.16,
  });
  const solid = (SOLIDS[def.solid] || SOLIDS.star)(body);
  const bob = new THREE.Group();          // bounce + spin live here
  bob.add(solid);
  bob.position.y = 1.9;
  group.add(bob);

  // Landing pad, so a drop is visible from across the board even when the solid
  // is at the top of its bounce.
  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(2.1, 18),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false })
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.09;
  group.add(pad);

  // The shine: a bright halo that swells with the pulse.
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(1.5, 2.4, 20),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.16;
  group.add(halo);

  group.userData = { bob, solid, pad, halo, body, kind: def.id };
  return group;
}

// ── effects ────────────────────────────────────────────────────────────────
export function createBlastMesh(color, cellCount) {
  const geometry = new THREE.BoxGeometry(TILE_SIZE * 0.94, 5.6, TILE_SIZE * 0.94);
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false });
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, cellCount));
  mesh.frustumCulled = false;
  return mesh;
}

// The plume that goes up where a Destructo just died — a bright expanding
// sphere and a ring, on their own short life.
export function createDeathBurst(color) {
  const group = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.2, 1),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 1, toneMapped: false, depthWrite: false })
  );
  core.position.y = 2.2;
  group.add(core);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.2, 2.2, 22),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, side: THREE.DoubleSide, toneMapped: false, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.6;
  group.add(ring);
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 12, 10),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, toneMapped: false, depthWrite: false, wireframe: true })
  );
  shell.position.y = 2.2;
  group.add(shell);
  group.userData = { core, ring, shell };
  return group;
}

export function disposeTree(root) {
  root.traverse(object => {
    object.geometry?.dispose?.();
    if (Array.isArray(object.material)) object.material.forEach(m => m.dispose?.());
    else object.material?.dispose?.();
  });
}

export const blitzModelIds = Object.freeze({ solids: Object.keys(SOLIDS), obstacleTiles: [TILE.WOOD, TILE.BRICK, TILE.DEBRIS] });
