import * as THREE from 'three';
import { createWaterMaterial } from './Materials.js';
import { rollCrateType, CRATE_TYPES } from '../data/gameData.js';

export class World {
  constructor(scene, materials, factory) { this.scene = scene; this.materials = materials; this.factory = factory; this.waterMaterial = createWaterMaterial(materials.textures.water); this.destructibles = []; this.crates = []; this.wildlife = []; this.pickups = []; this.bounds = 48; }
  build() {
    this.scene.background = new THREE.Color(0x9fd8ff); this.scene.fog = new THREE.FogExp2(0xbfe4f5, .008);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100, 1, 1), this.materials.grass); ground.name = 'generated-grass-ground'; ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.scene.add(ground);
    // decals get graded y-offsets + polygonOffset so they never z-fight the ground
    const path = new THREE.Mesh(new THREE.PlaneGeometry(15, 88), this.materials.dirt); path.name = 'generated-dirt-path'; path.rotation.x = -Math.PI / 2; path.rotation.z = -.68; path.position.y = .04; path.material.polygonOffset = true; path.material.polygonOffsetFactor = -1; path.material.polygonOffsetUnits = -2; path.receiveShadow = true; this.scene.add(path);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(100, 11, 40, 8), this.waterMaterial); water.rotation.x = -Math.PI / 2; water.position.set(0, .12, 3); water.renderOrder = 1; this.scene.add(water); this.water = water;
    this.createBridge(-9); this.createBridge(14);
    this.blueFactory = this.factory.createFactory('blue', new THREE.Vector3(-34, 0, -31));
    this.redFactory = this.factory.createFactory('red', new THREE.Vector3(33, 0, 31));
    this.builderPositions = { blue: new THREE.Vector3(-25, .08, -30), red: new THREE.Vector3(25, .08, 29) };
    this.builderPosition = this.builderPositions.blue; // legacy alias
    this.createBuilderPad(this.builderPositions.blue, 0x39c4ff, 0x0d5f8e);
    this.createBuilderPad(this.builderPositions.red, 0xff6b78, 0x8e1a26);
    this.createCave(new THREE.Vector3(2, 0, -16));
    this.populate(); this.buildStructures(); return this;
  }
  createBridge(x) {
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(8, .65, 14), this.materials.building('plating', { repeat: 2 })); bridge.position.set(x, .28, 3); bridge.receiveShadow = bridge.castShadow = true; this.scene.add(bridge);
    for (const sx of [-3.7, 3.7]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(.24, 1.3, 14), this.materials.building('hazard')); rail.position.set(x + sx, 1, 3); this.scene.add(rail); }
  }
  createBuilderPad(position, glow, glowDark) {
    const pad = new THREE.Group(); pad.position.copy(position);
    const base = new THREE.Mesh(new THREE.BoxGeometry(4.6, .28, 4.6), this.materials.building('plating')); base.receiveShadow = true; pad.add(base);
    const gridMat = this.materials.color(glow, { emissive: glowDark, emissiveIntensity: .7 });
    for (const x of [-.7, .7]) for (const z of [-.7, .7]) { const cell = new THREE.Mesh(new THREE.BoxGeometry(1.3, .12, 1.3), gridMat); cell.position.set(x, .18, z); pad.add(cell); }
    this.scene.add(pad); this.builderPad = this.builderPad || pad;
  }
  createCave(position) { this.cavePosition = position.clone(); const group = new THREE.Group(); group.position.copy(position); const dark = new THREE.MeshBasicMaterial({ color: 0x111522 }); const mouth = new THREE.Mesh(new THREE.CircleGeometry(3.15, 12), dark); mouth.position.set(0, 2.75, .12); group.add(mouth); const arch = new THREE.Mesh(new THREE.TorusGeometry(3.35, .82, 6, 14, Math.PI), this.materials.building('cobble')); arch.position.y = 2.65; arch.castShadow = true; group.add(arch); for (const x of [-2.2, 2.2]) { const pillar = new THREE.Mesh(new THREE.CylinderGeometry(.82, 1.05, 3.1, 7), this.materials.building('cobble')); pillar.position.set(x, 1.45, 0); pillar.castShadow = true; group.add(pillar); } const crystalMat = this.materials.building('crystal', { emissive: 0x1780b0, emissiveIntensity: .9 }); for (const [x, z, s] of [[-4, -1, .7], [3.8, .3, .9], [4.5, -1.4, .55]]) { const c = new THREE.Mesh(new THREE.ConeGeometry(.48, 1.7, 5), crystalMat); c.position.set(x, .85, z); c.scale.setScalar(s); group.add(c); } const ring = new THREE.Mesh(new THREE.RingGeometry(5.1, 5.45, 40), new THREE.MeshBasicMaterial({ color: 0x5bd9ff, transparent: true, opacity: .5, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })); ring.rotation.x = -Math.PI / 2; ring.position.y = .1; group.add(ring); this.caveRing = ring; this.caveGroup = group; this.scene.add(group); }
  populate() {
    const random = this.seeded(8021);
    for (let i = 0; i < 46; i++) {
      let x = random() * 88 - 44, z = random() * 88 - 44; if (Math.abs(z - 3) < 9 || new THREE.Vector2(x + 34, z + 31).length() < 10 || new THREE.Vector2(x - 33, z - 31).length() < 10) { i--; continue; }
      if (i < 24) this.createTree(x, z, .75 + random() * .65); else this.createRock(x, z, .6 + random() * 1.5);
    }
    const cratePositions = [[-20, -22], [-15, -14], [-7, -9], [8, -10], [17, -19], [5, 15], [16, 13], [23, 22], [-17, 17], [-28, 10], [-2, 26], [27, -4]];
    cratePositions.forEach(([x, z]) => this.crates.push(this.factory.createCrate(new THREE.Vector3(x, 0, z), rollCrateType(random))));
    this.createSandbags(new THREE.Vector3(-13, 0, -8), 0.4); this.createSandbags(new THREE.Vector3(15, 0, 14), -2.5);
    [['sheep', -8, 22], ['sheep', 12, -28], ['wolf', 2, 14], ['wolf', 18, 2], ['slime', -5, 30]].forEach(([kind, x, z]) => this.wildlife.push(this.factory.createWildlife(kind, new THREE.Vector3(x, 0, z))));
  }
  // Structures showing off the 10 generated building textures
  buildStructures() {
    const add = (geo, tex, x, y, z, opts = {}) => { const m = new THREE.Mesh(geo, this.materials.building(tex, opts.mat)); m.position.set(x, y, z); if (opts.ry) m.rotation.y = opts.ry; m.castShadow = m.receiveShadow = true; this.scene.add(m); if (opts.hp) { const d = { id: crypto.randomUUID(), type: 'prop', subtype: tex, group: m, hp: opts.hp, maxHp: opts.hp, radius: opts.radius || 2, dead: false }; m.userData.entity = d; this.destructibles.push(d); } return m; };
    // brick ruin walls near midfield
    add(new THREE.BoxGeometry(6, 2.6, .8), 'brick', -6, 1.3, -24, { hp: 260, radius: 3 });
    add(new THREE.BoxGeometry(.8, 2, 4.5), 'brick', -2.6, 1, -21.5, { hp: 200, radius: 2.3 });
    // concrete bunker
    add(new THREE.BoxGeometry(5, 2.4, 4), 'concrete', 12, 1.2, 24, { hp: 420, radius: 3 });
    add(new THREE.BoxGeometry(5.4, .5, 4.4), 'hazard', 12, 2.65, 24);
    // watchtower: cobble base, sandstone shaft, blue rooftile roof
    add(new THREE.CylinderGeometry(2.2, 2.6, 1.4, 8), 'cobble', -24, .7, 12, { hp: 380, radius: 2.6 });
    add(new THREE.CylinderGeometry(1.5, 1.9, 5.2, 8), 'sandstone', -24, 4, 12);
    add(new THREE.ConeGeometry(2.4, 2, 8), 'rooftile', -24, 7.6, 12);
    // marble obelisk at cave approach
    add(new THREE.BoxGeometry(1.2, 5.4, 1.2), 'marble', 6.5, 2.7, -12, { hp: 300, radius: 1.4 });
    add(new THREE.ConeGeometry(.95, 1.2, 4), 'marble', 6.5, 6, -12);
    // plating supply depot
    add(new THREE.BoxGeometry(4, 2.2, 3), 'plating', -14, 1.1, 26, { hp: 340, radius: 2.6 });
    // crystal outcrop
    for (const [cx, cz, s] of [[24, -14, 1.4], [25.6, -12.6, .9], [22.8, -12.2, 1.1]]) add(new THREE.ConeGeometry(.7 * s, 2.4 * s, 5), 'crystal', cx, 1.1 * s, cz, { mat: { emissive: 0x1780b0, emissiveIntensity: .8 }, hp: 180, radius: 1.2 });
    // lava vent ring (hazard decoration)
    add(new THREE.CylinderGeometry(1.6, 2, .5, 9), 'lava', -30, .25, 34, { mat: { emissive: 0xff5a1c, emissiveIntensity: .55 } });
  }
  createTree(x, z, scale) {
    const group = new THREE.Group(); group.position.set(x, 0, z); group.scale.setScalar(scale);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.35, .5, 2.9, 6), this.materials.wood); trunk.position.y = 1.45; trunk.castShadow = true; group.add(trunk);
    for (const [dx, dy, dz, s] of [[0, 3.3, 0, 1.5], [-.7, 2.8, .2, 1], [.65, 2.85, -.2, 1.1]]) { const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), this.materials.color(0x4bb84f)); crown.position.set(dx, dy, dz); crown.castShadow = true; group.add(crown); }
    const d = { id: crypto.randomUUID(), type: 'prop', subtype: 'tree', group, hp: 85, maxHp: 85, radius: 1.1 * scale, dead: false }; group.traverse(o => { if (o.isMesh) o.userData.entity = d; }); this.destructibles.push(d); this.scene.add(group);
  }
  createRock(x, z, scale) { const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(scale, 0), this.materials.stone); rock.position.set(x, scale * .55, z); rock.scale.y = .65; rock.rotation.set(Math.random(), Math.random(), Math.random()); rock.castShadow = rock.receiveShadow = true; const d = { id: crypto.randomUUID(), type: 'prop', subtype: 'rock', group: rock, hp: 140, maxHp: 140, radius: scale, dead: false }; rock.userData.entity = d; this.destructibles.push(d); this.scene.add(rock); }
  createSandbags(position, rotation) { const group = new THREE.Group(); group.position.copy(position); group.rotation.y = rotation; for (let i = -2; i <= 2; i++) for (let y = 0; y < 2; y++) { const bag = new THREE.Mesh(new THREE.CapsuleGeometry(.42, .75, 2, 5), this.materials.building('sandstone')); bag.rotation.z = Math.PI / 2; bag.position.set(i * .82 + (y ? .4 : 0), .45 + y * .55, 0); bag.castShadow = true; group.add(bag); } const d = { id: crypto.randomUUID(), type: 'prop', subtype: 'sandbags', group, hp: 220, maxHp: 220, radius: 2.7, dead: false }; group.traverse(o => { if (o.isMesh) o.userData.entity = d; }); this.destructibles.push(d); this.scene.add(group); }
  // crates parachute in from the sky, Team Buddies style
  airdropCrate(random = Math.random) {
    let x = 0, z = 0, tries = 0;
    do { x = random() * 70 - 35; z = random() * 70 - 35; tries++; } while (tries < 12 && (Math.abs(z - 3) < 7 || new THREE.Vector2(x + 34, z + 31).length() < 9 || new THREE.Vector2(x - 33, z - 31).length() < 9));
    const crate = this.factory.createCrate(new THREE.Vector3(x, 16, z), rollCrateType(random));
    crate.falling = true; this.crates.push(crate); return crate;
  }
  update(time, dt = 0) {
    this.waterMaterial.uniforms.uTime.value = time;
    for (const c of this.crates) {
      if (c.falling) { c.group.position.y = Math.max(0, c.group.position.y - dt * 7); c.group.rotation.y += dt * 2; if (c.group.position.y <= 0) { c.falling = false; c.group.rotation.y = 0; } }
      else if (!c.carried && !c.placed) c.group.rotation.y += .002;
    }
    for (const p of this.pickups) { p.group.rotation.y += dt * 2.4; p.group.position.y = Math.sin(time * 3 + p.bobSeed) * .12 + .05; }
  }
  isWater(position) { return Math.abs(position.z - 3) < 5.5 && !((Math.abs(position.x + 9) < 4.2) || (Math.abs(position.x - 14) < 4.2)); }
  clamp(position) { position.x = THREE.MathUtils.clamp(position.x, -this.bounds, this.bounds); position.z = THREE.MathUtils.clamp(position.z, -this.bounds, this.bounds); }
  seeded(seed) { return () => ((seed = Math.imul(seed, 1664525) + 1013904223 | 0) >>> 0) / 4294967296; }
  dispose() { this.waterMaterial.dispose(); }
}
