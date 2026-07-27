import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WILDS, WILDS_TEMPLES, wildsIsWater, distanceToPath } from '../../data/mapSurfaces.js';
import { CRATE_TYPES } from '../../data/gameData.js';

// ── THE VERY HUNGRY WILDERNESS ───────────────────────────────────────────────
// A rainforest built the same way Bumper-to-Bumper Bedlam is built: as authored
// geometry standing on a heightfield both sides agree on (WILDS/wildsHeight in
// src/data/mapSurfaces.js). Nothing here is scattered blind — every trunk,
// plinth, jetty and stair samples world.heightAt, so the map has no floating
// props and no sunk ones.
//
// Five vertical layers, each reachable from the one below:
//    ~0.0   the water — river, plunge pool and lagoon, waded at half speed
//     |     jungle floor — trails, temples, boulder fields, the ziggurat
//   ~10.0   ziggurat crown, temple roofs, terrace steps (1.0 risers, no ramps)
//   22.00   the canopy — eight kapok platforms on a closed walkway loop
//   ~29.5   Thunderhead Mesa — cliff plateau, reached by stair or fallen titan
//
// Collision contract is Bedlam's (see World.registerCollider):
//   walkable, !blocking             stand on it, walk under and past it
//   walkable + blocking + elevated  solid mass: roof on top, wall below
//   shape:'ramp'                    walkable surface sloping along local +Z
//   navBlock / navIgnore            kept out of the AI's flat 2-D route plan
//
// Anything rising 1.0 or less per step needs no ramp: that is under
// World.STEP_UP, which is what makes the ziggurat, the bamboo terraces and
// every temple stair climbable without a single authored slope.

const { mesa: MESA, plunge: PLUNGE, lagoon: LAGOON, bamboo: BAMBOO, terrace: TERRACE,
  mire: MIRE, grotto: GROTTO, river: RIVER, riverHalf: RIVER_HALF, waterY: WATER_Y, fallLip: FALL_LIP } = WILDS;

// The canopy deck height. Absolute, not relative to the ground, so every
// walkway in the loop is dead level and a bridge can never tilt.
const CANOPY_Y = 26;
// A rail shorter than World.STEP_UP (1.05) is simply stepped over, so every
// rail in the rainforest is authored above that threshold on purpose.
const RAIL = 1.6;
// Steeper than this stops reading as a climbable slope.
const MAX_SLOPE = .38;

// The canopy loop, in order. Each node carries a kapok with a platform; the
// bridges close the ring, so a squad can circle the whole map without touching
// the ground — and two of the spans cross the river gorge.
//
// `climbYaw` is the bearing the access tower is pushed out along. It is
// authored rather than derived from the node's position, because "away from the
// map centre" happens to point three of these nodes straight into the water.
const CANOPY_NODES = Object.freeze([
  Object.freeze({ name: 'VEIL LOOKOUT', x: -30, z: 60 }),
  Object.freeze({ name: 'HERON ROOST', x: 14, z: 74, climbYaw: .2 }),
  Object.freeze({ name: 'ORCHID CROWN', x: 58, z: 40 }),
  Object.freeze({ name: 'MACAW GALLERY', x: 46, z: -6, climbYaw: 1.6 }),
  Object.freeze({ name: 'SPIDER STEP', x: 34, z: -30 }),
  Object.freeze({ name: 'RIVERWATCH', x: -14, z: -46, climbYaw: 1.4 }),
  Object.freeze({ name: 'TERMITE SPIRE', x: -78, z: -30 }),
  Object.freeze({ name: 'FERN GATE', x: -80, z: 18, climbYaw: -1.4 }),
]);

// Gaps in the cliff band around the mesa, as bearings from its centre. Anywhere
// else the plateau is walled: the stair and the fallen titan are the only ways
// up, and the waterfall notch is the only way the water comes down.
// `half` is the *physical* opening each route needs, as an angle at the cliff
// band: the causeway is six wide, the fallen trunk six, the curtain nineteen.
// Rock is kept clear of a gap by its own angular half-width (see `margin`
// below) rather than by padding these — otherwise every change to the block
// size silently narrows or reopens the routes.
const CLIFF_GAPS = Object.freeze([
  Object.freeze({ bearing: Math.PI / 2, half: .1 }),           // the ancient stair, due north
  Object.freeze({ bearing: Math.PI * 235 / 180, half: .09 }),  // the fallen titan, south-west
  Object.freeze({ bearing: -Math.PI * 42 / 180, half: .22 }),  // the Roaring Veil
]);

const TAU = Math.PI * 2;
// `margin` is how far the *edge* of the thing being placed reaches beyond its
// centre bearing, so a wide block never overhangs the opening it stands beside.
const bearingGapped = (bearing, margin = 0) => CLIFF_GAPS.some(gap => {
  const delta = Math.abs(((bearing - gap.bearing) % TAU + TAU * 1.5) % TAU - Math.PI);
  return Math.PI - delta < gap.half + margin;
});

export class RainforestWilds {
  constructor(world) {
    this.world = world;
    this.scene = world.scene;
    this.random = world.seeded(70714);
    this.materials = new Map();
    this.batches = new Map();
    this.landmarks = [];
    this.animated = { curtains: [], mist: [], glows: [] };
    this.mesaTop = world.heightAt(MESA.x, MESA.z);
  }

  ground(x, z) { return this.world.heightAt(x, z); }

  // ── materials ─────────────────────────────────────────────────────────────
  mat(texture, repeat = 2, options = null) {
    const key = `${texture}|${repeat}|${options ? JSON.stringify(options) : ''}`;
    let material = this.materials.get(key);
    if (!material) { material = this.world.materials.building(texture, { repeat, ...(options || {}) }); this.materials.set(key, material); }
    return material;
  }
  tint(color, options = null) {
    const key = `tint|${color}|${options ? JSON.stringify(options) : ''}`;
    let material = this.materials.get(key);
    if (!material) { material = this.world.materials.color(color, options || {}); this.materials.set(key, material); }
    return material;
  }
  get palette() {
    if (!this._palette) this._palette = {
      bark: this.mat('tree_bark', 2),
      barkPale: this.mat('tree_bark', 3, { color: 0xc8b9a0 }),
      deadwood: this.mat('wood', 2, { color: 0xcfc3ac }),
      canopyDeep: this.tint(0x2f6b38, { roughness: .95 }),
      canopyMid: this.tint(0x3f8c42, { roughness: .92 }),
      canopyLit: this.tint(0x62b04b, { roughness: .9 }),
      frond: this.tint(0x4fa83c, { roughness: .9 }),
    };
    return this._palette;
  }

  // ── static batching ───────────────────────────────────────────────────────
  // Ferns, reeds, flowers, mushrooms, pebbles and the horizon forest are
  // thousands of pieces that never move, never die and never change material.
  // Baking them into one mesh per material turns thousands of draw calls into
  // a handful. Only things a shell can destroy stay individual.
  batch(geometry, material) {
    const normalized = geometry.index ? geometry.toNonIndexed() : geometry;
    if (normalized !== geometry) geometry.dispose();
    const bucket = this.batches.get(material);
    if (bucket) bucket.push(normalized); else this.batches.set(material, [normalized]);
  }
  // A slab that is static, indestructible and only needs a *collider* — cliff
  // rock, terrace lips, temple tower courses. The geometry joins the batch and
  // the caller gets a bodiless anchor at the same transform, because the
  // collider system only ever asks an object where it is. Hundreds of these
  // were hundreds of draw calls; batched they cost one each per material.
  batchSlab(x, z, base, w, d, h, texture, options = {}) {
    const { repeat = 2, material, rotation = 0 } = options;
    const geometry = new THREE.BoxGeometry(w, h, d);
    geometry.rotateY(rotation);
    geometry.translate(x, base + h / 2, z);
    this.batch(geometry, material || this.mat(texture, repeat));
    const anchor = new THREE.Object3D();
    anchor.position.set(x, base + h / 2, z);
    anchor.rotation.y = rotation;
    this.scene.add(anchor);
    return anchor;
  }
  flushBatches() {
    for (const [material, geometries] of this.batches) {
      const merged = mergeGeometries(geometries, false);
      for (const geometry of geometries) geometry.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      mesh.name = 'wilds-static-batch';
      mesh.castShadow = false; mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      this.scene.add(mesh);
    }
    this.batches.clear();
  }

  // ── primitives ────────────────────────────────────────────────────────────
  // A box placed by its *bottom* face, so stacked levels can never drift apart.
  slab(x, z, base, w, d, h, texture, options = {}) {
    const { repeat = 2, material, rotation = 0, shadow = true, parent = null } = options;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material || this.mat(texture, repeat));
    mesh.position.set(x, base + h / 2, z);
    if (rotation) mesh.rotation.y = rotation;
    mesh.castShadow = mesh.receiveShadow = shadow;
    (parent || this.scene).add(mesh);
    return mesh;
  }
  standOn(mesh, w, d, h, options = {}) {
    this.world.registerCollider(mesh, {
      shape: 'box', halfX: w / 2, halfZ: d / 2, top: h / 2,
      blocking: options.blocking === true, walkable: options.walkable !== false,
      elevated: Boolean(options.elevated), navBlock: Boolean(options.navBlock), navIgnore: Boolean(options.navIgnore),
    }, options.entity || null);
    return mesh;
  }
  // A sloped plate. `solid` fills it to the ground for earth embankments;
  // otherwise it is a constant-thickness deck you can walk and shoot under —
  // which is what a fallen trunk leaning on a cliff actually is.
  ramp(x, z, yaw, fromY, toY, run, width, texture, options = {}) {
    const rise = toY - fromY, thickness = options.thickness ?? .8;
    const geometry = new THREE.BoxGeometry(width, 1, run);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const surface = rise * ((position.getZ(i) + run / 2) / run);
      position.setY(i, position.getY(i) > 0 ? surface : (options.solid ? -Math.abs(rise) - 12 : surface - thickness));
    }
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, options.material || this.mat(texture, options.repeat ?? 3));
    mesh.position.set(x, fromY, z); mesh.rotation.y = yaw;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.visible = options.visible !== false;
    this.scene.add(mesh);
    this.world.registerCollider(mesh, {
      shape: 'ramp', halfX: width / 2, halfZ: run / 2, rampLow: 0, rampHigh: rise, top: rise,
      rampThickness: options.solid ? Infinity : thickness,
      blocking: false, walkable: true, elevated: !options.solid, navBlock: options.navBlock !== false,
    });
    return mesh;
  }
  // A rail that only stops bodies at its own level, leaving the ground below clear.
  parapet(x, z, base, w, d, texture = 'wood', height = RAIL, options = {}) {
    const mesh = this.slab(x, z, base, w, d, height, texture, { repeat: 1, shadow: false, rotation: options.rotation || 0 });
    this.world.registerCollider(mesh, {
      shape: 'box', halfX: w / 2, halfZ: d / 2, top: height / 2, bottom: -height / 2,
      blocking: true, walkable: false, navIgnore: true,
    });
    return mesh;
  }
  pillar(x, z, base, radius, height, texture, { blocking = true, repeat = 2, material = null, taper = 1.12 } = {}) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * taper, height, 8), material || this.mat(texture, repeat));
    mesh.position.set(x, base + height / 2, z);
    mesh.castShadow = mesh.receiveShadow = true; this.scene.add(mesh);
    if (blocking) this.world.registerCollider(mesh, { shape: 'cylinder', radius: radius * 1.05, top: height / 2, blocking: true, walkable: false });
    return mesh;
  }
  prop(mesh, hp, radius, subtype = 'jungle') {
    const entity = { id: crypto.randomUUID(), type: 'prop', subtype, group: mesh, hp, maxHp: hp, radius, dead: false, jellyStrength: .32 };
    mesh.traverse(object => { if (object.isMesh) object.userData.entity = entity; });
    this.world.destructibles.push(entity);
    return entity;
  }
  // A flat elevated walkway between two points at the same height, with rails
  // that run *along* travel so they never wall off either end.
  walkway(ax, az, bx, bz, y, width = 5, texture = 'wood', options = {}) {
    const dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz);
    if (length < .6) return null;
    const yaw = Math.atan2(dx, dz), cx = (ax + bx) / 2, cz = (az + bz) / 2;
    const deck = this.slab(cx, cz, y - .45, width, length, .45, texture, { repeat: Math.max(2, Math.round(length / 8)), rotation: yaw });
    this.standOn(deck, width, length, .45, { elevated: true, navIgnore: true });
    if (options.rails !== false) {
      const offset = width / 2 - .2, cos = Math.cos(yaw), sin = Math.sin(yaw);
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(.28, RAIL, length), this.mat('wood', 1, { color: 0xa38a5e }));
        rail.position.set(cx + side * offset * cos, y + RAIL / 2, cz - side * offset * sin);
        rail.rotation.y = yaw; rail.castShadow = false; this.scene.add(rail);
        this.world.registerCollider(rail, { shape: 'box', halfX: .14, halfZ: length / 2, top: RAIL / 2, bottom: -RAIL / 2, blocking: true, walkable: false, navIgnore: true });
      }
      // Hanging vines under the span, so a rope bridge reads as rope.
      const vineMat = this.tint(0x3d7a3a, { roughness: 1 });
      for (let t = .12; t < .9; t += .16) {
        const px = ax + dx * t, pz = az + dz * t, drop = 2.2 + this.random() * 2.6;
        const vine = new THREE.Mesh(new THREE.CylinderGeometry(.09, .05, drop, 4), vineMat);
        vine.position.set(px + (this.random() - .5) * width * .7, y - .45 - drop / 2, pz + (this.random() - .5) * width * .7);
        vine.castShadow = false; this.scene.add(vine);
      }
    }
    return deck;
  }
  // A switchback climb standing free of whatever it serves: flights alternate
  // between two lanes, landings bridge the lanes, and the exit landing is
  // returned so the caller can lay a level deck onto the real destination.
  //
  // `yaw` is the world yaw of local +Z (the direction the first flight climbs).
  climbTower(x, z, yaw, topY, options = {}) {
    const run = options.run ?? 18, lane = options.lane ?? 4.6, landing = options.landing ?? 5;
    const texture = options.texture ?? 'moss_stone';
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const place = (lx, lz) => ({ x: x + lx * cos + lz * sin, z: z - lx * sin + lz * cos });
    const laneX = [-lane / 2, lane / 2];
    const landingZ = run / 2 + landing / 2;
    // The first flight starts at whatever the ground actually is one stride
    // beyond its foot, so the bottom of the climb can never begin in mid-air.
    const foot = place(laneX[0], -(run / 2 + 1.4));
    const baseY = options.baseY ?? this.ground(foot.x, foot.z);
    if (topY - baseY < 2) return null;
    const flights = options.flights ?? Math.max(2, Math.ceil((topY - baseY) / (run * MAX_SLOPE)));
    const step = (topY - baseY) / flights;
    let exit = null;
    for (let k = 0; k < flights; k++) {
      const fromY = baseY + step * k, toY = fromY + step, climbing = k % 2 === 0;
      const at = place(laneX[k % 2], 0);
      this.ramp(at.x, at.z, yaw + (climbing ? 0 : Math.PI), fromY, toY, run, lane, texture, { navBlock: true, repeat: 2 });
      const end = place(0, climbing ? landingZ : -landingZ);
      // The pad top sits 2cm low so it tucks under whatever meets it rather
      // than z-fighting with it.
      const pad = this.slab(end.x, end.z, toY - .72, lane * 2 + .6, landing, .7, texture, { repeat: 2, rotation: yaw });
      this.standOn(pad, lane * 2 + .6, landing, .7, { elevated: true, navBlock: true });
      exit = { x: end.x, z: end.z, y: toY };
    }
    // Trunk posts carrying the whole tower.
    for (const lx of [-lane - .8, lane + .8]) for (const lz of [-landingZ, landingZ]) {
      const post = place(lx, lz);
      this.pillar(post.x, post.z, this.ground(post.x, post.z) - 1, .42, topY - this.ground(post.x, post.z) + 1, 'tree_bark', { blocking: false, taper: 1.3 });
    }
    return exit;
  }

  // ── species ───────────────────────────────────────────────────────────────
  // Every tree is merged into one mesh with two material groups (bark and
  // foliage). A rainforest needs hundreds of them; two draw calls each instead
  // of ten is the difference between a forest and a slideshow.
  piece(geometry, slot, position, rotation = null, scale = null) {
    if (scale) geometry.scale(scale.x ?? scale, scale.y ?? scale, scale.z ?? scale);
    if (rotation) { if (rotation.x) geometry.rotateX(rotation.x); if (rotation.z) geometry.rotateZ(rotation.z); if (rotation.y) geometry.rotateY(rotation.y); }
    geometry.translate(position[0], position[1], position[2]);
    const normalized = geometry.index ? geometry.toNonIndexed() : geometry;
    if (normalized !== geometry) geometry.dispose();
    return { geometry: normalized, slot };
  }
  mergedMesh(pieces, materials) {
    const slots = [];
    for (let slot = 0; slot < materials.length; slot++) {
      const list = pieces.filter(entry => entry.slot === slot).map(entry => entry.geometry);
      if (!list.length) continue;
      const merged = mergeGeometries(list, false);
      for (const geometry of list) geometry.dispose();
      if (merged) slots.push({ merged, material: materials[slot] });
    }
    if (!slots.length) return null;
    if (slots.length === 1) return new THREE.Mesh(slots[0].merged, slots[0].material);
    const geometry = mergeGeometries(slots.map(entry => entry.merged), true);
    for (const entry of slots) entry.merged.dispose();
    return geometry ? new THREE.Mesh(geometry, slots.map(entry => entry.material)) : null;
  }
  plant(x, z, pieces, materials, { hp, radius, subtype, blocking = true, collider = 'cylinder', halfX = radius, halfZ = radius, top = 2 }) {
    const mesh = this.mergedMesh(pieces, materials);
    if (!mesh) return null;
    mesh.position.set(x, this.ground(x, z), z);
    mesh.castShadow = mesh.receiveShadow = true;
    this.scene.add(mesh);
    const entity = this.prop(mesh, hp, radius, subtype);
    if (blocking) this.world.registerCollider(mesh, collider === 'cylinder'
      ? { shape: 'cylinder', radius, top, blocking: true, walkable: false }
      : { shape: 'box', halfX, halfZ, top, blocking: true, walkable: false }, entity);
    return { mesh, entity };
  }

  // The emergent giant: buttress fins, a 20-metre bole and three canopy tiers.
  kapok(x, z, scale = 1) {
    const P = this.palette, pieces = [], height = (19 + this.random() * 7) * scale, radius = .95 * scale;
    for (let i = 0; i < 6; i++) {
      const angle = i / 6 * TAU + this.random() * .4;
      const fin = new THREE.BoxGeometry(.55 * scale, 4.4 * scale, 3.6 * scale);
      pieces.push(this.piece(fin, 0, [Math.cos(angle) * 1.9 * scale, 2.2 * scale, Math.sin(angle) * 1.9 * scale], { y: -angle, x: -.16 }));
    }
    pieces.push(this.piece(new THREE.CylinderGeometry(radius * .62, radius * 1.5, height, 9), 0, [0, height / 2, 0]));
    const crownY = height + 1.4 * scale;
    for (const [dx, dy, dz, s] of [[0, 1.6, 0, 6.4], [-4.2, -.6, 1.4, 4.2], [4, -.3, -1.6, 4.6], [.6, -2.2, 4.1, 3.6], [-1.2, -1.9, -4.3, 3.4]]) {
      const blob = new THREE.IcosahedronGeometry(s * scale * .5, 0);
      pieces.push(this.piece(blob, 1, [dx * scale, crownY + dy * scale, dz * scale], null, { x: 1, y: .58, z: 1 }));
    }
    // Lianas dangling out of the crown.
    for (let i = 0; i < 5; i++) {
      const angle = this.random() * TAU, reach = (1.6 + this.random() * 3.4) * scale, drop = (5 + this.random() * 7) * scale;
      pieces.push(this.piece(new THREE.CylinderGeometry(.11 * scale, .06 * scale, drop, 4), 1,
        [Math.cos(angle) * reach, crownY - 2 * scale - drop / 2, Math.sin(angle) * reach]));
    }
    return this.plant(x, z, pieces, [P.bark, this.tint(0x357a3b, { roughness: .95 })],
      { hp: Math.round(420 * scale), radius: 1.75 * scale, subtype: 'kapok', top: height * .5 });
  }

  // Strangler fig: a hollow cage of fused roots around the host it killed.
  strangler(x, z, scale = 1) {
    const P = this.palette, pieces = [], height = (13 + this.random() * 5) * scale, cage = 2.7 * scale;
    for (let i = 0; i < 8; i++) {
      const angle = i / 8 * TAU, lean = .1 + this.random() * .16;
      pieces.push(this.piece(new THREE.CylinderGeometry(.34 * scale, .62 * scale, height, 6), 0,
        [Math.cos(angle) * cage, height / 2, Math.sin(angle) * cage], { y: -angle, x: lean }));
      if (i % 2 === 0) pieces.push(this.piece(new THREE.TorusGeometry(cage, .22 * scale, 4, 10), 0, [0, height * (.28 + i * .11), 0], { x: Math.PI / 2 }));
    }
    pieces.push(this.piece(new THREE.CylinderGeometry(.5 * scale, .8 * scale, height * .82, 6), 2, [0, height * .41, 0]));
    for (const [dx, dz, s] of [[0, 0, 5.6], [-3.4, 1.2, 3.6], [3.1, -1.4, 3.8], [.8, 3.4, 3.2]]) {
      pieces.push(this.piece(new THREE.IcosahedronGeometry(s * scale * .5, 0), 1, [dx * scale, height + 1.1 * scale, dz * scale], null, { x: 1, y: .62, z: 1 }));
    }
    return this.plant(x, z, pieces, [P.bark, this.tint(0x2f6b38, { roughness: .95 }), P.deadwood],
      { hp: Math.round(360 * scale), radius: 2.9 * scale, subtype: 'strangler', top: height * .5 });
  }

  // Palm: a bent bole of stacked segments under a splayed crown of fronds.
  palm(x, z, scale = 1) {
    const P = this.palette, pieces = [], segments = 7, height = (8 + this.random() * 5) * scale;
    const lean = (this.random() - .5) * .5, heading = this.random() * TAU;
    let cx = 0, cz = 0;
    for (let i = 0; i < segments; i++) {
      const t = i / segments, drift = lean * t * t * 3.2 * scale;
      cx = Math.cos(heading) * drift; cz = Math.sin(heading) * drift;
      pieces.push(this.piece(new THREE.CylinderGeometry((.34 - t * .12) * scale, (.4 - t * .12) * scale, height / segments * 1.12, 6), 0,
        [cx, height * (t + .5 / segments), cz], { z: lean * .34 * Math.cos(heading), x: -lean * .34 * Math.sin(heading) }));
    }
    for (let i = 0; i < 8; i++) {
      const angle = i / 8 * TAU + this.random() * .3, droop = .55 + this.random() * .45;
      pieces.push(this.piece(new THREE.ConeGeometry(.62 * scale, 5.4 * scale, 4), 1,
        [cx + Math.cos(angle) * 2.4 * scale, height + 1.1 * scale - droop * 1.5 * scale, cz + Math.sin(angle) * 2.4 * scale],
        { z: Math.cos(angle) * (1.15 + droop * .3), x: -Math.sin(angle) * (1.15 + droop * .3) }, { x: 1, y: 1, z: .2 }));
    }
    // Coconut cluster.
    for (let i = 0; i < 3; i++) pieces.push(this.piece(new THREE.IcosahedronGeometry(.34 * scale, 0), 0, [cx + (this.random() - .5) * 1.2 * scale, height + .3 * scale, cz + (this.random() - .5) * 1.2 * scale]));
    return this.plant(x, z, pieces, [P.barkPale, this.tint(0x6cbf4a, { roughness: .88 })],
      { hp: Math.round(110 * scale), radius: .8 * scale, subtype: 'palm', top: height * .5 });
  }

  // A bamboo clump: many thin culms, low health, dense enough to hide a squad.
  bambooClump(x, z, count = 9, scale = 1) {
    const pieces = [], culm = this.tint(0x8dbf46, { roughness: .8 }), leaf = this.tint(0x9ed653, { roughness: .85 });
    let tallest = 0;
    for (let i = 0; i < count; i++) {
      const angle = this.random() * TAU, reach = this.random() * 1.9 * scale, height = (10 + this.random() * 7) * scale;
      const px = Math.cos(angle) * reach, pz = Math.sin(angle) * reach;
      tallest = Math.max(tallest, height);
      pieces.push(this.piece(new THREE.CylinderGeometry(.15 * scale, .19 * scale, height, 5), 0, [px, height / 2, pz], { z: (this.random() - .5) * .16 }));
      // The nodes are flat collars, not torus rings. Four tori per culm times a
      // dozen culms times a hundred and fifty clumps was a third of the whole
      // map's triangle count, on a detail nobody can resolve past ten metres.
      for (let node = 1; node < 4; node++) {
        pieces.push(this.piece(new THREE.CylinderGeometry(.24 * scale, .24 * scale, .12 * scale, 5), 0, [px, height * node / 4, pz]));
      }
      for (let f = 0; f < 3; f++) {
        const spray = this.random() * TAU;
        pieces.push(this.piece(new THREE.ConeGeometry(.34 * scale, 2.1 * scale, 3), 1,
          [px + Math.cos(spray) * .8 * scale, height * (.72 + f * .09), pz + Math.sin(spray) * .8 * scale],
          { z: Math.cos(spray) * 1.1, x: -Math.sin(spray) * 1.1 }, { x: 1, y: 1, z: .25 }));
      }
    }
    return this.plant(x, z, pieces, [culm, leaf], { hp: 70, radius: 2.1 * scale, subtype: 'bamboo', top: tallest * .5 });
  }

  // Mangrove: a knot of stilt roots standing out of the shallows.
  mangrove(x, z, scale = 1) {
    const P = this.palette, pieces = [], trunkY = 3.4 * scale, height = (6.5 + this.random() * 3) * scale;
    for (let i = 0; i < 7; i++) {
      const angle = i / 7 * TAU + this.random() * .3;
      pieces.push(this.piece(new THREE.CylinderGeometry(.2 * scale, .3 * scale, 4.6 * scale, 5), 0,
        [Math.cos(angle) * 1.5 * scale, trunkY * .55, Math.sin(angle) * 1.5 * scale], { z: Math.cos(angle) * .55, x: -Math.sin(angle) * .55 }));
    }
    pieces.push(this.piece(new THREE.CylinderGeometry(.5 * scale, .78 * scale, height, 7), 0, [0, trunkY + height / 2, 0]));
    for (const [dx, dy, dz, s] of [[0, .9, 0, 4.6], [-2.4, -.4, .9, 3], [2.2, -.2, -1.1, 3.2]]) {
      pieces.push(this.piece(new THREE.IcosahedronGeometry(s * scale * .5, 0), 1, [dx * scale, trunkY + height + dy * scale, dz * scale], null, { x: 1, y: .55, z: 1 }));
    }
    return this.plant(x, z, pieces, [P.bark, this.tint(0x3c7d4a, { roughness: .95 })],
      { hp: Math.round(240 * scale), radius: 2 * scale, subtype: 'mangrove', top: (trunkY + height) * .5 });
  }

  // Lightning-struck snag: a hollow spar with a shattered crown. Good cover,
  // and the only tree on the map that reads as dead from a hundred metres.
  snag(x, z, scale = 1) {
    const P = this.palette, pieces = [], height = (9 + this.random() * 6) * scale;
    pieces.push(this.piece(new THREE.CylinderGeometry(.55 * scale, 1.05 * scale, height, 7), 0, [0, height / 2, 0]));
    pieces.push(this.piece(new THREE.ConeGeometry(.62 * scale, 2.6 * scale, 5), 0, [0, height + 1 * scale, 0], { x: Math.PI }));
    for (let i = 0; i < 4; i++) {
      const angle = this.random() * TAU, at = height * (.4 + this.random() * .45);
      pieces.push(this.piece(new THREE.CylinderGeometry(.1 * scale, .22 * scale, 2.8 * scale, 4), 0,
        [Math.cos(angle) * 1.1 * scale, at, Math.sin(angle) * 1.1 * scale], { z: Math.cos(angle) * 1.05, x: -Math.sin(angle) * 1.05 }));
    }
    for (let i = 0; i < 5; i++) {
      const angle = this.random() * TAU, at = height * (.2 + this.random() * .6);
      pieces.push(this.piece(new THREE.CylinderGeometry(.9 * scale, .95 * scale, .28 * scale, 7), 1, [Math.cos(angle) * .7 * scale, at, Math.sin(angle) * .7 * scale], { z: .28 }));
    }
    return this.plant(x, z, pieces, [P.deadwood, this.tint(0xd8b45e, { roughness: .85 })],
      { hp: Math.round(200 * scale), radius: 1.15 * scale, subtype: 'snag', top: height * .5 });
  }

  // A fallen trunk. `crossing` makes its upper surface a real standing surface,
  // which is how you get over the river without wading.
  fallenLog(x, z, yaw, length, radius, options = {}) {
    const P = this.palette, pieces = [];
    pieces.push(this.piece(new THREE.CylinderGeometry(radius, radius * 1.14, length, 9), 0, [0, radius, 0], { z: Math.PI / 2 }));
    for (let i = 0; i < 4; i++) {
      const at = (this.random() - .5) * length * .8;
      pieces.push(this.piece(new THREE.CylinderGeometry(.12, .2, 1.9, 4), 0, [at, radius + .5, 0], { x: (this.random() - .5) * 2 }));
    }
    // A crust of moss and shelf fungus along the upper side.
    for (let i = 0; i < 7; i++) {
      const at = (this.random() - .5) * length * .9;
      pieces.push(this.piece(new THREE.SphereGeometry(radius * (.5 + this.random() * .4), 6, 4, 0, TAU, 0, Math.PI / 2), 1, [at, radius * 1.55, (this.random() - .5) * radius]));
    }
    const mesh = this.mergedMesh(pieces, [P.bark, this.tint(0x5f9146, { roughness: 1 })]);
    if (!mesh) return null;
    const baseY = options.baseY ?? this.ground(x, z);
    mesh.position.set(x, baseY, z); mesh.rotation.y = yaw;
    mesh.castShadow = mesh.receiveShadow = true; this.scene.add(mesh);
    const entity = this.prop(mesh, options.hp ?? 340, Math.max(radius, length * .3), 'log');
    if (options.crossing) {
      // Walkable along the top, and elevated so nobody standing beside it in
      // the river gets snapped up onto it.
      this.world.registerCollider(mesh, {
        shape: 'box', halfX: length / 2, halfZ: radius * .92, top: radius * 1.9,
        blocking: false, walkable: true, elevated: true, navBlock: false,
      }, entity);
    } else {
      this.world.registerCollider(mesh, { shape: 'box', halfX: length / 2, halfZ: radius, top: radius * 1.7, blocking: true, walkable: true }, entity);
    }
    return mesh;
  }

  boulder(x, z, scale = 1) {
    const pieces = [];
    pieces.push(this.piece(new THREE.DodecahedronGeometry(scale, 0), 0, [0, scale * .62, 0], { y: this.random() * 3 }, { x: 1.15, y: .78, z: 1 }));
    for (let i = 0; i < 2 + Math.floor(this.random() * 3); i++) {
      const angle = this.random() * TAU, s = scale * (.3 + this.random() * .38);
      pieces.push(this.piece(new THREE.DodecahedronGeometry(s, 0), 0, [Math.cos(angle) * scale * 1.05, s * .55, Math.sin(angle) * scale * 1.05], { y: this.random() * 3 }));
    }
    // Moss cap: rock in a rainforest is never bare on top.
    pieces.push(this.piece(new THREE.SphereGeometry(scale * .82, 7, 4, 0, TAU, 0, Math.PI / 2.4), 1, [0, scale * .92, 0], null, { x: 1.1, y: .34, z: 1 }));
    return this.plant(x, z, pieces, [this.mat('summit_stone', 2, { color: 0x9a9c94 }), this.tint(0x4f8a3f, { roughness: 1 })],
      { hp: Math.round(180 * scale), radius: scale * 1.15, subtype: 'boulder', top: scale * .7 });
  }

  // A carved standing stone. Every one of them faces the ziggurat.
  monolith(x, z, height = 6.5, texture = 'sandstone') {
    const yaw = Math.atan2(-x, -z);
    const mesh = this.slab(x, z, this.ground(x, z), 2.1, 1.1, height, texture, { repeat: 2, rotation: yaw });
    const entity = this.prop(mesh, 480, 1.5, 'idol');
    this.world.registerCollider(mesh, { shape: 'box', halfX: 1.05, halfZ: .55, top: height / 2, blocking: true, walkable: false }, entity);
    const face = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, .18), this.mat('moss_stone', 1, { emissive: 0x1d5e3a, emissiveIntensity: .32 }));
    face.position.set(x + Math.sin(yaw) * .6, this.ground(x, z) + height * .72, z + Math.cos(yaw) * .6);
    face.rotation.y = yaw; this.scene.add(face);
    entity.attachments = [face];
    return mesh;
  }

  // ── batched ground cover ──────────────────────────────────────────────────
  // Undergrowth greens are deliberately drawn from a small palette rather than
  // one colour: a rainforest floor read from above is a mosaic of slightly
  // different greens, and a single flat green makes the whole map look printed.
  frondMaterial(seed) { return this.tint([0x397a33, 0x4e9c3e, 0x2c6330, 0x63ab44][seed & 3], { roughness: .95 }); }
  fern(x, z, scale = 1) {
    const y = this.ground(x, z), material = this.frondMaterial(Math.floor(x * 7 + z * 13));
    for (let i = 0; i < 7; i++) {
      const angle = i / 7 * TAU + this.random(), lift = .7 + this.random() * .5;
      // Wide and low: a frond that fans out over the ground, not a spear.
      const leaf = new THREE.ConeGeometry(.5 * scale, 1.45 * scale, 3);
      leaf.scale(1, 1, .3);
      leaf.rotateZ(Math.cos(angle) * lift); leaf.rotateX(-Math.sin(angle) * lift);
      leaf.translate(x + Math.cos(angle) * .45 * scale, y + .6 * scale, z + Math.sin(angle) * .45 * scale);
      this.batch(leaf, material);
    }
  }
  heliconia(x, z, scale = 1) {
    const y = this.ground(x, z), material = this.frondMaterial(Math.floor(x * 3 + z * 11) + 1);
    for (let i = 0; i < 5; i++) {
      const angle = i / 5 * TAU + this.random();
      const blade = new THREE.BoxGeometry(.34 * scale, 1.9 * scale, .06 * scale);
      blade.rotateZ(Math.cos(angle) * .62); blade.rotateX(-Math.sin(angle) * .62);
      blade.translate(x + Math.cos(angle) * .4 * scale, y + 1 * scale, z + Math.sin(angle) * .4 * scale);
      this.batch(blade, material);
    }
    const flower = new THREE.ConeGeometry(.26 * scale, 1.2 * scale, 4);
    flower.translate(x, y + 1.8 * scale, z);
    this.batch(flower, this.tint(0xff5a2b, { emissive: 0x521000, emissiveIntensity: .32, roughness: .7 }));
  }
  reeds(x, z, count = 9) {
    const y = this.ground(x, z), material = this.tint(0x7fae53, { roughness: .95 });
    for (let i = 0; i < count; i++) {
      const angle = this.random() * TAU, reach = this.random() * 1.5, height = 1.6 + this.random() * 2.1;
      const stalk = new THREE.CylinderGeometry(.05, .08, height, 3);
      stalk.rotateZ((this.random() - .5) * .5);
      stalk.translate(x + Math.cos(angle) * reach, y + height / 2, z + Math.sin(angle) * reach);
      this.batch(stalk, material);
    }
  }
  // Bioluminescent shelf fungus: the rainforest's night-lights.
  glowShelf(x, z) {
    const y = this.ground(x, z), material = this.tint(0x8ef2c6, { emissive: 0x1f8f68, emissiveIntensity: 1.1, roughness: .5 });
    for (let i = 0; i < 5 + Math.floor(this.random() * 5); i++) {
      const angle = this.random() * TAU, reach = this.random() * 1.4, size = .18 + this.random() * .34;
      const cap = new THREE.SphereGeometry(size, 6, 4, 0, TAU, 0, Math.PI / 2);
      cap.scale(1, .5, 1);
      cap.translate(x + Math.cos(angle) * reach, y + .18 + this.random() * .5, z + Math.sin(angle) * reach);
      this.batch(cap, material);
      const stem = new THREE.CylinderGeometry(size * .18, size * .22, .3, 4);
      stem.translate(x + Math.cos(angle) * reach, y + .15, z + Math.sin(angle) * reach);
      this.batch(stem, this.tint(0xdff5e8, { roughness: .8 }));
    }
  }
  termiteMound(x, z, scale = 1) {
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(1.5 * scale, 4.2 * scale, 7), this.mat('root_mud', 2, { color: 0xb08a5f }));
    mesh.position.set(x, this.ground(x, z) + 2.1 * scale, z);
    mesh.rotation.y = this.random() * TAU;
    mesh.castShadow = mesh.receiveShadow = true; this.scene.add(mesh);
    const entity = this.prop(mesh, 190, 1.6 * scale, 'mound');
    this.world.registerCollider(mesh, { shape: 'cylinder', radius: 1.4 * scale, top: 2.1 * scale, blocking: true, walkable: false }, entity);
  }
  pebbles(x, z, spread = 3) {
    const material = this.mat('summit_stone', 1, { color: 0x8d918a });
    for (let i = 0; i < 6; i++) {
      const angle = this.random() * TAU, reach = this.random() * spread, size = .18 + this.random() * .38;
      const px = x + Math.cos(angle) * reach, pz = z + Math.sin(angle) * reach;
      const stone = new THREE.DodecahedronGeometry(size, 0);
      stone.scale(1.2, .55, 1);
      stone.rotateY(this.random() * TAU);
      stone.translate(px, this.ground(px, pz) + size * .3, pz);
      this.batch(stone, material);
    }
  }
  lilyPads(cx, cz, radius, count) {
    const pad = this.tint(0x3f8f4e, { roughness: .9 }), bloom = this.tint(0xffd9ec, { emissive: 0x6b2244, emissiveIntensity: .3, roughness: .6 });
    for (let i = 0; i < count; i++) {
      const angle = this.random() * TAU, reach = Math.sqrt(this.random()) * radius;
      const px = cx + Math.cos(angle) * reach, pz = cz + Math.sin(angle) * reach;
      const disc = new THREE.CylinderGeometry(.7 + this.random() * .9, .7 + this.random() * .9, .08, 7);
      disc.translate(px, WATER_Y + .06, pz);
      this.batch(disc, pad);
      if (this.random() < .3) {
        const flower = new THREE.ConeGeometry(.24, .5, 5);
        flower.translate(px, WATER_Y + .3, pz);
        this.batch(flower, bloom);
      }
    }
  }

  // ── water ─────────────────────────────────────────────────────────────────
  // Water surfaces are built flat in the mesh's *local* XY plane and laid down
  // by rotating the mesh, never by baking the rotation into the geometry. The
  // shared water shader (Materials.createWaterMaterial) swells the surface
  // along local +Z; bake the rotation in and that swell becomes a horizontal
  // shove instead, which tears the sheet sideways into folded grey wedges.
  layFlat(mesh) { mesh.rotation.x = -Math.PI / 2; mesh.renderOrder = 1; this.scene.add(mesh); return mesh; }
  waterDisc(cx, cz, radius, segments = 44) {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, segments), this.world.waterMaterial);
    mesh.position.set(cx, WATER_Y, cz);
    return this.layFlat(mesh);
  }
  waterRibbon(source, halfWidth) {
    // Run the sheet past both ends of the authored channel: upstream it hides
    // under the plunge pool, downstream under the lagoon. Stopping exactly on
    // the last control point leaves a rectangular end-cap of water sitting on
    // the bank, which is the single most obvious tell that a river is a decal.
    const extend = (from, toward, distance) => {
      const dx = from[0] - toward[0], dz = from[1] - toward[1], length = Math.hypot(dx, dz) || 1;
      return [from[0] + dx / length * distance, from[1] + dz / length * distance];
    };
    const path = [extend(source[0], source[1], 16), ...source, extend(source[source.length - 1], source[source.length - 2], 16)];
    const positions = [], uvs = [], indices = [], centres = [];
    for (let s = 0; s < path.length - 1; s++) {
      const [ax, az] = path[s], [bx, bz] = path[s + 1], steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 4));
      for (let i = s ? 1 : 0; i <= steps; i++) centres.push([ax + (bx - ax) * i / steps, az + (bz - az) * i / steps]);
    }
    for (let i = 0; i < centres.length; i++) {
      const before = centres[Math.max(0, i - 1)], after = centres[Math.min(centres.length - 1, i + 1)];
      const dx = after[0] - before[0], dz = after[1] - before[1], length = Math.hypot(dx, dz) || 1;
      const rx = -dz / length, rz = dx / length;
      for (const side of [-1, 1]) {
        // local (x, y, 0); the mesh's -90° X rotation maps it to world (x, 0, -y).
        positions.push(centres[i][0] + rx * halfWidth * side, -(centres[i][1] + rz * halfWidth * side), 0);
        uvs.push(side < 0 ? 0 : 1, i / (centres.length - 1));
      }
    }
    for (let i = 0; i < centres.length - 1; i++) { const a = i * 2, b = a + 2; indices.push(b + 1, b, a, a + 1, b + 1, a); }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, this.world.waterMaterial);
    mesh.position.y = WATER_Y;
    return this.layFlat(mesh);
  }
  // A falling sheet of water: three scrolling planes at slightly different
  // speeds so the curtain has depth instead of reading as one sliding decal.
  curtain(x, z, yaw, top, bottom, width, options = {}) {
    const height = Math.max(1, top - bottom);
    for (let layer = 0; layer < 3; layer++) {
      const map = this.world.materials.textures.water.clone();
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(1 + layer * .4, Math.max(2, height / 7));
      map.needsUpdate = true;
      this.world.materials.ownedTextures.push(map);
      const material = new THREE.MeshBasicMaterial({
        map, color: layer === 2 ? 0xffffff : 0xc9ecfa, transparent: true,
        opacity: layer === 2 ? .3 : .55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.NormalBlending,
      });
      this.world.materials.dynamicMaterials.push(material);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width * (1 - layer * .12), height, 6, 10), material);
      mesh.position.set(x + Math.sin(yaw) * layer * .5, (top + bottom) / 2, z + Math.cos(yaw) * layer * .5);
      mesh.rotation.y = yaw;
      mesh.renderOrder = 2 + layer;
      this.scene.add(mesh);
      this.animated.curtains.push({ map, speed: (options.speed ?? 1) * (1.6 + layer * .55) });
    }
  }
  // Mist at the foot of the falls. This is the *only* additive geometry left on
  // the map: the ambient firefly/pollen clouds and the canopy light shafts were
  // thousands of overlapping transparent fragments for no gameplay value, and
  // transparent overdraw is the most expensive thing a scene this size can do.
  spray(x, y, z, radius, count = 6) {
    const material = new THREE.MeshBasicMaterial({ color: 0xdff4ff, transparent: true, opacity: .06, depthWrite: false, blending: THREE.AdditiveBlending });
    this.world.materials.dynamicMaterials.push(material);
    for (let i = 0; i < count; i++) {
      const angle = this.random() * TAU, reach = this.random() * radius;
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(radius * (.22 + this.random() * .3), 1), material);
      puff.position.set(x + Math.cos(angle) * reach, y + this.random() * radius * .7, z + Math.sin(angle) * reach);
      puff.scale.y = .55; puff.renderOrder = 6;
      this.scene.add(puff);
      this.animated.mist.push({ mesh: puff, phase: this.random() * TAU, base: puff.position.y, drift: .5 + this.random() });
    }
  }

  // ── the build ─────────────────────────────────────────────────────────────
  build() {
    this.buildWaterways();
    this.buildRoaringVeil();
    this.buildMesa();
    this.buildZiggurat();
    this.buildTemples();
    this.buildCanopy();
    this.buildBambooTerraces();
    this.buildMire();
    this.buildGrotto();
    this.buildTrailside();
    this.plantRainforest();
    this.buildRimForest();
    this.flushBatches();
    this.world.wildsAnimation = this.animator();
    return this.landmarks;
  }

  // The river, the plunge pool and the lagoon, plus everything that lives at
  // the waterline. Water is not a collider: it is waded (World.isWater halves
  // movement) and the AI pays a routing surcharge for it, so crossings matter.
  buildWaterways() {
    // Every water surface is drawn wider than the basin it fills. The sheet is
    // flat at WATER_Y, so the surplus disappears inside the bank the moment the
    // ground rises above the waterline — whereas a sheet cut to the nominal
    // radius leaves its own edge hanging in mid-air over the shallows.
    this.waterRibbon(RIVER, RIVER_HALF + 6);
    this.waterDisc(PLUNGE.x, PLUNGE.z, PLUNGE.radius + 7);
    this.waterDisc(LAGOON.x, LAGOON.z, LAGOON.radius + 8, 56);
    this.lilyPads(LAGOON.x, LAGOON.z, LAGOON.radius - 6, 46);
    this.lilyPads(PLUNGE.x + 6, PLUNGE.z - 5, 9, 10);
    // Shoreline dressing: reeds, driftwood and gravel bars right on the margin.
    for (let i = 0; i < 40; i++) {
      const angle = i / 40 * TAU + this.random() * .1, reach = LAGOON.radius + 1.5 + this.random() * 5;
      this.reeds(LAGOON.x + Math.cos(angle) * reach, LAGOON.z + Math.sin(angle) * reach, 7 + Math.floor(this.random() * 6));
      if (i % 4 === 0) this.pebbles(LAGOON.x + Math.cos(angle) * (reach + 3), LAGOON.z + Math.sin(angle) * (reach + 3), 4);
    }
    for (let t = .06; t < .98; t += .045) {
      const side = this.random() < .5 ? -1 : 1;
      const at = this.offsetFromRiver(t, side * (RIVER_HALF + 1.4 + this.random() * 4));
      this.reeds(at.x, at.z, 6 + Math.floor(this.random() * 5));
      if (this.random() < .34) this.pebbles(at.x, at.z, 3.5);
      // Mangroves stand on the margin, not in the channel: their stilt roots
      // are only four metres long and the bed is two below the waterline.
      if (this.random() < .2) { const bank = this.dryBank(t, side); if (bank) this.mangrove(bank.x, bank.z, .8 + this.random() * .5); }
    }
    // Three river crossings, so nobody is ever forced to wade the whole map.
    // Upstream of the lagoon: past about three quarters the river's south bank
    // *is* the lagoon, and a bridge with one abutment in a lake is not a bridge.
    const crossings = [.14, .40, .64];
    for (const [index, t] of crossings.entries()) {
      const a = this.dryBank(t, -1), b = this.dryBank(t, 1);
      if (!a || !b) continue;
      const yaw = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
      const span = Math.hypot(b.x - a.x, b.z - a.z);
      const lift = Math.max(this.ground(a.x, a.z), this.ground(b.x, b.z));
      if (index === 1) {
        // The middle crossing is a proper rope bridge on two stone piers.
        const deckY = lift + 2.6;
        for (const end of [a, b]) this.slab(end.x, end.z, this.ground(end.x, end.z) - 1, 5, 5, deckY - this.ground(end.x, end.z) + 1, 'moss_stone', { repeat: 2 });
        for (const end of [a, b]) this.standOn(this.slab(end.x, end.z, deckY - .5, 5.4, 5.4, .5, 'moss_stone', { repeat: 2 }), 5.4, 5.4, .5, { elevated: true, navIgnore: true });
        this.walkway(a.x, a.z, b.x, b.z, deckY, 4.4, 'wood');
        this.landmarks.push({ kind: 'crossing', name: 'ROPE BRIDGE OF THE SERPENT', x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, y: deckY });
      } else {
        // The others are colossal trunks dropped across the channel.
        const mid = this.pointOnRiver(t);
        this.fallenLog(mid.x, mid.z, yaw, span + 4, 1.5, { baseY: lift - .2, crossing: true, hp: 520 });
        this.landmarks.push({ kind: 'crossing', name: index ? 'DOWNSTREAM DEADFALL' : 'UPSTREAM DEADFALL', x: mid.x, z: mid.z, y: lift + 3 });
      }
      for (const end of [a, b]) { this.pebbles(end.x, end.z, 4); this.reeds(end.x, end.z, 6); }
    }
    // Stepping stones at a fourth, riskier point.
    const stones = this.pointOnRiver(.62);
    for (let i = -3; i <= 3; i++) {
      const at = this.offsetFromRiver(.62, i * 3.2);
      const stone = this.slab(at.x, at.z, WATER_Y - 1.4, 2.6, 2.6, 1.85, 'summit_stone', { repeat: 1, rotation: this.random() * TAU });
      this.standOn(stone, 2.6, 2.6, 1.85, { navIgnore: true });
    }
    this.landmarks.push({ kind: 'crossing', name: 'STEPPING STONES', x: stones.x, z: stones.z, y: WATER_Y + .5 });
    // A half-sunken expedition raft, wrecked on the lagoon shore.
    const wreckAngle = -.9, wreckX = LAGOON.x + Math.cos(wreckAngle) * (LAGOON.radius - 3), wreckZ = LAGOON.z + Math.sin(wreckAngle) * (LAGOON.radius - 3);
    const raft = this.slab(wreckX, wreckZ, WATER_Y - .3, 9, 5.5, .6, 'wood', { repeat: 2, rotation: .6 });
    raft.rotation.z = .12;
    this.standOn(raft, 9, 5.5, .6, { navIgnore: true });
    this.prop(raft, 260, 4, 'raft');
  }
  pointOnRiver(t) {
    const span = (RIVER.length - 1) * t, index = Math.min(RIVER.length - 2, Math.floor(span)), local = span - index;
    return { x: RIVER[index][0] + (RIVER[index + 1][0] - RIVER[index][0]) * local, z: RIVER[index][1] + (RIVER[index + 1][1] - RIVER[index][1]) * local };
  }
  offsetFromRiver(t, distance) {
    const here = this.pointOnRiver(Math.min(.999, t)), ahead = this.pointOnRiver(Math.min(1, t + .01));
    const dx = ahead.x - here.x, dz = ahead.z - here.z, length = Math.hypot(dx, dz) || 1;
    return { x: here.x - dz / length * distance, z: here.z + dx / length * distance };
  }
  // Walk out from the channel until the ground is genuinely above the
  // waterline. The banks are a smooth carve, not a step, so the shoreline sits
  // several metres beyond the nominal channel half-width — assuming otherwise
  // is how a bridge ends up with both abutments underwater.
  dryBank(t, side, clearance = .6) {
    for (let reach = RIVER_HALF + 2; reach < RIVER_HALF + 34; reach += 1.5) {
      const at = this.offsetFromRiver(t, side * reach);
      if (this.ground(at.x, at.z) > WATER_Y + clearance && !wildsIsWater(at.x, at.z)) return at;
    }
    return null;
  }

  // ── the Roaring Veil ──────────────────────────────────────────────────────
  // Twenty-six metres of falling water off the mesa lip into the plunge pool,
  // with a walkable ledge and a hidden cache in the dry chamber behind it.
  buildRoaringVeil() {
    // Everything here is laid out in the mesa's own polar frame: `radius` out
    // from the plateau centre, `across` along the cliff. Placing the falls in
    // world XZ is what buried the first version of this chamber twelve metres
    // inside the hill.
    const outward = Math.atan2(FALL_LIP.x - MESA.x, FALL_LIP.z - MESA.z);
    const at = (radius, across) => ({
      x: MESA.x + Math.sin(outward) * radius + Math.cos(outward) * across,
      z: MESA.z + Math.cos(outward) * radius - Math.sin(outward) * across,
    });
    const lipY = this.mesaTop;
    const FACE = MESA.core + 1, LEDGE = MESA.core + 9, VEIL = MESA.core + 12;
    // The wet rock the water runs down. It is deliberately *deep* — twelve
    // metres of it, spanning the whole radial band from inside the plateau lip
    // out past the cliff foot — because the terrain's near-vertical blend
    // between the plateau table and the plunge basin resolves into a jagged
    // wedge at the mesh's 2.8-metre quad size. A shallow facade leaves that
    // wedge sticking out through the falls; this buries it.
    for (let i = -3; i <= 3; i++) {
      const point = at(FACE, i * 4.6);
      this.slab(point.x, point.z, WATER_Y - 4, 5.2, 12, lipY - WATER_Y + 4.5, 'summit_stone', { repeat: 3, rotation: outward });
    }
    const veil = at(VEIL, 0);
    this.curtain(veil.x, veil.z, outward, lipY + .4, WATER_Y - .3, 19, { speed: 1 });
    // The lip itself: a sheet tipping over the edge, and the pour behind it.
    const lip = at(MESA.core - 1.5, 0);
    const lipSheet = this.slab(lip.x, lip.z, lipY - .22, 17, 9, .35, 'water', {
      repeat: 2, rotation: outward, material: this.tint(0xa8e4f5, { transparent: true, opacity: .8, roughness: .1, metalness: .2 }),
    });
    lipSheet.renderOrder = 2;
    const brow = at(MESA.core + 2.5, 0);
    this.curtain(brow.x, brow.z, outward, lipY + .4, lipY - 9, 15, { speed: 1.35 });
    this.spray(veil.x, WATER_Y + 2.5, veil.z, 9, 6);
    this.spray(lip.x, lipY + 1, lip.z, 4.5, 3);
    const glow = new THREE.PointLight(0x9fe8ff, 26, 54, 2);
    glow.position.set(veil.x, WATER_Y + 7, veil.z);
    this.scene.add(glow);
    this.animated.glows.push({ light: glow, base: 22, swing: 7, rate: 1.4 });

    // A rock shelf between the cliff and the curtain: this is the walk behind
    // the falls, and it is the only way to the chamber at its northern end.
    const ledgeY = WATER_Y + 1.15;
    for (let i = -3; i <= 3; i++) {
      const point = at(LEDGE, i * 4.4);
      const ledge = this.slab(point.x, point.z, ledgeY - 3.4, 4.6, 6.4, 3.4, 'moss_stone', { repeat: 2, rotation: outward });
      this.standOn(ledge, 4.6, 6.4, 3.4, { elevated: true, navIgnore: true });
    }
    // Two stones stepping up out of the pool onto the near end of the shelf.
    for (let step = 0; step < 2; step++) {
      const point = at(LEDGE + 4 + step * 3.4, -16 - step * 3);
      const shelf = this.slab(point.x, point.z, WATER_Y - 1.6, 6, 5, 2 - step * .6, 'summit_stone', { repeat: 2, rotation: outward });
      this.standOn(shelf, 6, 5, 2 - step * .6, { navIgnore: true });
    }

    // The dry chamber, at the far end of the shelf and cut into the cliff. It
    // is the map's authored secret: a red cache behind the falls.
    const cave = at(LEDGE + 1, 20);
    const floor = this.slab(cave.x, cave.z, ledgeY - 3.4, 13, 11, 3.4, 'moss_stone', { repeat: 3, rotation: outward });
    this.standOn(floor, 13, 11, 3.4, { elevated: true, navIgnore: true });
    for (const [across, radius, w, d] of [[6.8, 0, 1.6, 11], [0, -5.8, 13, 1.6], [0, 5.8, 13, 1.6]]) {
      const point = at(LEDGE + 1 + radius, 20 + across);
      const wall = this.slab(point.x, point.z, ledgeY, w, d, 6, 'summit_stone', { repeat: 2, rotation: outward });
      this.world.registerCollider(wall, { shape: 'box', halfX: w / 2, halfZ: d / 2, top: 3, blocking: true, walkable: false });
    }
    const roof = this.slab(cave.x, cave.z, ledgeY + 6, 14, 12, 1.4, 'summit_stone', { repeat: 3, rotation: outward });
    this.standOn(roof, 14, 12, 1.4, { elevated: true, navIgnore: true });
    const crystalMat = this.mat('crystal', 1, { emissive: 0x1f9ad0, emissiveIntensity: 1.1 });
    for (let i = 0; i < 7; i++) {
      const angle = this.random() * TAU, reach = 1.5 + this.random() * 3.6;
      const shard = new THREE.Mesh(new THREE.ConeGeometry(.42, 1.9 + this.random() * 1.5, 5), crystalMat);
      shard.position.set(cave.x + Math.cos(angle) * reach, ledgeY + .9, cave.z + Math.sin(angle) * reach);
      shard.rotation.z = (this.random() - .5) * .5;
      this.scene.add(shard);
    }
    const caveLight = new THREE.PointLight(0x53d5ff, 12, 28, 2);
    caveLight.position.set(cave.x, ledgeY + 3, cave.z);
    this.scene.add(caveLight);
    const cachePosition = new THREE.Vector3(cave.x, ledgeY, cave.z);
    this.world.secretPlaces.push({ name: 'BEHIND THE ROARING VEIL', position: cachePosition.clone(), radius: 11 });
    const crate = this.world.factory.createCrate?.(cachePosition.clone(), CRATE_TYPES.red);
    if (crate) { crate.noAI = true; crate.sourceDropZoneId = 'wilds-veil'; this.world.crates.push(crate); }
    this.landmarks.push({ kind: 'waterfall', name: 'THE ROARING VEIL', x: veil.x, z: veil.z, y: lipY });
  }

  // ── Thunderhead Mesa ──────────────────────────────────────────────────────
  buildMesa() {
    const top = this.mesaTop;
    // The cliff band. Everything but the three authored gaps is walled, so the
    // plateau is a place you earn rather than a hill you stroll up.
    // Radius, width and crest are all jittered: a ring of identical blocks at a
    // fixed radius reads as a cooling tower, not as a cliff.
    for (let i = 0; i < 54; i++) {
      const bearing = i / 54 * TAU;
      const bandRadius = MESA.core + 2 + this.random() * 3.4;
      const width = 6.8 + this.random() * 3.4, depth = 4.2 + this.random() * 3;
      if (bearingGapped(bearing, width / 2 / bandRadius)) continue;
      const px = MESA.x + Math.cos(bearing) * bandRadius, pz = MESA.z + Math.sin(bearing) * bandRadius;
      const groundY = this.ground(px, pz);
      const height = Math.max(3, top - groundY + 1.2 + this.random() * 3.6);
      const face = this.batchSlab(px, pz, groundY - 2, width, depth, height, 'summit_stone', { repeat: 2, rotation: -bearing + (this.random() - .5) * .5 });
      this.world.registerCollider(face, { shape: 'box', halfX: width / 2, halfZ: depth / 2, top: height / 2, blocking: true, walkable: false });
      // Broken slabs shed off the crest, and vines pouring over the lip.
      if (i % 4 === 1) {
        const shard = this.batchSlab(px + Math.cos(bearing) * 3.5, pz + Math.sin(bearing) * 3.5, groundY - 1, 3.4, 3, 2.4 + this.random() * 5, 'summit_stone', { repeat: 1, rotation: this.random() * TAU });
        this.world.registerCollider(shard, { shape: 'box', halfX: 1.7, halfZ: 1.5, top: 1.2, blocking: true, walkable: false });
      }
      if (i % 3 === 0) this.batchedVineFall(px, pz, groundY + height - 2, 5 + this.random() * 9);
    }
    // Talus: broken rock heaped at the foot of the cliff all the way round.
    for (let i = 0; i < 44; i++) {
      const bearing = i / 44 * TAU + this.random() * .1, reach = MESA.core + 7 + this.random() * 8;
      const px = MESA.x + Math.cos(bearing) * reach, pz = MESA.z + Math.sin(bearing) * reach;
      if (wildsIsWater(px, pz)) continue;
      this.boulder(px, pz, 1.1 + this.random() * 1.9);
    }

    // Route one: the ancient stair, due north, climbing outside the cliff and
    // arriving on a level causeway that lands on the plateau rim.
    // The tower stands clear of the cliff on open ground; a level stone
    // causeway carries the last twenty metres in through the gap in the band.
    const stairBase = { x: MESA.x, z: MESA.z + MESA.core + 32 };
    const exit = this.climbTower(stairBase.x, stairBase.z, 0, top, { run: 20, lane: 5, landing: 5.4, texture: 'moss_stone' });
    if (exit) {
      const inward = Math.atan2(MESA.x - exit.x, MESA.z - exit.z);
      const rimX = MESA.x - Math.sin(inward) * (MESA.core - 4), rimZ = MESA.z - Math.cos(inward) * (MESA.core - 4);
      this.walkway(exit.x, exit.z, rimX, rimZ, top, 6, 'moss_stone', { rails: false });
      // Piers under the causeway where it crosses the cliff foot.
      for (let t = .25; t < .95; t += .25) {
        const px = exit.x + (rimX - exit.x) * t, pz = exit.z + (rimZ - exit.z) * t;
        const footHeight = top - this.ground(px, pz) - .45;
        if (footHeight > 1) this.pillar(px, pz, this.ground(px, pz), 1.3, footHeight, 'summit_stone', { blocking: false });
      }
      for (const side of [-1, 1]) {
        const gx = exit.x + Math.cos(inward) * side * 4.6, gz = exit.z - Math.sin(inward) * side * 4.6;
        this.pillar(gx, gz, top, 1.1, 5.5, 'sandstone');
      }
      this.landmarks.push({ kind: 'stair', name: 'THE THOUSAND STEPS', x: exit.x, z: exit.z, y: top });
    }

    // Route two: a fallen giant leaning on the south-west face. It is a
    // floating plate, not an embankment — you can fight underneath it.
    const bearing = Math.PI * 235 / 180;
    const crestReach = MESA.core - 1, footReach = MESA.core + 68;
    const crestX = MESA.x + Math.cos(bearing) * crestReach, crestZ = MESA.z + Math.sin(bearing) * crestReach;
    const footX = MESA.x + Math.cos(bearing) * footReach, footZ = MESA.z + Math.sin(bearing) * footReach;
    const trunkFootY = this.ground(footX, footZ) + .35;
    const run = Math.hypot(crestX - footX, crestZ - footZ);
    const yaw = Math.atan2(crestX - footX, crestZ - footZ);
    const trunkMat = this.mat('tree_bark', 4);
    this.ramp((footX + crestX) / 2, (footZ + crestZ) / 2, yaw, trunkFootY, top, run, 6.2, 'tree_bark', { navBlock: true, repeat: 4, visible: false });
    // The visible trunk is a cylinder laid along the same line; the ramp plate
    // above supplies the surface, so the silhouette can be a tree rather than a box.
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 4.4, run + 4, 10), trunkMat);
    trunk.position.set((footX + crestX) / 2, (trunkFootY + top) / 2 - 2.6, (footZ + crestZ) / 2);
    trunk.rotation.order = 'YXZ';
    trunk.rotation.y = yaw; trunk.rotation.x = Math.PI / 2 - Math.atan2(top - trunkFootY, run);
    trunk.castShadow = trunk.receiveShadow = true;
    this.scene.add(trunk);
    this.prop(trunk, 1500, 5, 'fallen-titan');
    // Root plate at the foot, torn out of the ground when it went over.
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(8.4, 8.9, 1.6, 11), trunkMat);
    plate.position.set(footX - Math.sin(yaw) * 5, trunkFootY + 3.4, footZ - Math.cos(yaw) * 5);
    plate.rotation.x = Math.PI / 2 - .2; plate.rotation.y = yaw;
    plate.castShadow = true; this.scene.add(plate);
    for (let i = 0; i < 5; i++) {
      const at = -.4 + i * .22;
      const px = footX + (crestX - footX) * at, pz = footZ + (crestZ - footZ) * at;
      if (at > 0 && at < 1) this.boulder(px + Math.cos(yaw) * 6, pz - Math.sin(yaw) * 6, 1.4 + this.random());
    }
    this.landmarks.push({ kind: 'stair', name: 'THE FALLEN TITAN', x: (footX + crestX) / 2, z: (footZ + crestZ) / 2, y: (trunkFootY + top) / 2 });

    // The plateau itself: wind-stunted planting, an overlook, and cairns.
    // `canPlant` deliberately excludes the whole mesa, so the top gets its own
    // pass — without it the plateau is a bare stone table.
    for (let i = 0; i < 52; i++) {
      const angle = this.random() * TAU, reach = Math.sqrt(this.random()) * (MESA.core - 5);
      const px = MESA.x + Math.cos(angle) * reach, pz = MESA.z + Math.sin(angle) * reach;
      if (Math.hypot(px - WILDS_TEMPLES[2].x, pz - WILDS_TEMPLES[2].z) < 24) continue;
      if (i % 4 === 0) this.palm(px, pz, .7 + this.random() * .4);
      else if (i % 4 === 1) this.boulder(px, pz, .9 + this.random() * 1.4);
      else if (i % 4 === 2) this.bambooClump(px, pz, 6, .75);
      else this.snag(px, pz, .7 + this.random() * .5);
      for (let n = 0; n < 5; n++) {
        const spread = this.random() * TAU, out = 2 + this.random() * 8;
        const fx = px + Math.cos(spread) * out, fz = pz + Math.sin(spread) * out;
        if (Math.hypot(fx - MESA.x, fz - MESA.z) > MESA.core - 4) continue;
        const kind = this.random();
        if (kind < .55) this.fern(fx, fz, .7 + this.random() * .6);
        else if (kind < .8) this.pebbles(fx, fz, 2.6);
        else this.heliconia(fx, fz, .7 + this.random() * .5);
      }
    }
    for (let i = 0; i < 9; i++) {
      const bearing = i / 9 * TAU, reach = MESA.core - 6;
      const px = MESA.x + Math.cos(bearing) * reach, pz = MESA.z + Math.sin(bearing) * reach;
      if (bearingGapped(bearing)) continue;
      this.monolith(px, pz, 5 + (i % 3), 'summit_stone');
    }
    // A viewing spur hanging out over the falls.
    const overlookYaw = Math.atan2(FALL_LIP.x - MESA.x, FALL_LIP.z - MESA.z);
    const spurX = FALL_LIP.x - Math.sin(overlookYaw) * 5, spurZ = FALL_LIP.z - Math.cos(overlookYaw) * 5;
    const spur = this.slab(spurX, spurZ, top - .6, 13, 9, .6, 'summit_stone', { repeat: 2, rotation: overlookYaw });
    this.standOn(spur, 13, 9, .6, { elevated: true, navIgnore: true });
    for (const side of [-1, 1]) this.parapet(spurX + Math.cos(overlookYaw) * side * 6, spurZ - Math.sin(overlookYaw) * side * 6, top, .6, 9, 'wood', RAIL, { rotation: overlookYaw });
    this.landmarks.push({ kind: 'overlook', name: 'THUNDERHEAD OVERLOOK', x: spurX, z: spurZ, y: top });
  }
  batchedVineFall(x, z, top, length) {
    const material = this.tint(0x3f7f3c, { roughness: 1 });
    for (let i = 0; i < 3; i++) {
      const drop = length * (.6 + this.random() * .5);
      const vine = new THREE.CylinderGeometry(.1, .06, drop, 4);
      vine.translate(x + (this.random() - .5) * 3.4, top - drop / 2, z + (this.random() - .5) * 3.4);
      this.batch(vine, material);
    }
  }

  // ── the ziggurat at the heart of the map ──────────────────────────────────
  // Six tiers with 1.0 risers: under World.STEP_UP, so it climbs from any face
  // without a single authored ramp, from any direction, under fire.
  buildZiggurat() {
    const baseY = this.ground(0, 0), tiers = 6;
    for (let tier = 0; tier < tiers; tier++) {
      const half = 16 - tier * 2.1, y = baseY + tier;
      const texture = tier % 2 ? 'moss_stone' : 'sandstone';
      // Every tier is sunk 1.8 into the one below it. The walking surface is
      // still exactly one step up, but the buried skirt means no corner of a
      // wide slab can ever hang over the slope of the mound it stands on.
      const slab = this.slab(0, 0, y - 1.8, half * 2, half * 2, 1.8, texture, { repeat: Math.max(2, Math.round(half / 3)) });
      this.standOn(slab, half * 2, half * 2, 1.8, { navIgnore: true });
      // Root systems prising the tiers apart.
      for (let i = 0; i < 4; i++) {
        const angle = (tier * 1.7 + i * 1.57), px = Math.cos(angle) * (half - .6), pz = Math.sin(angle) * (half - .6);
        const root = new THREE.CylinderGeometry(.24, .4, 3.4 + this.random() * 2, 5);
        root.rotateZ(Math.cos(angle) * 1.1); root.rotateX(-Math.sin(angle) * 1.1);
        root.translate(px, y + 1.2, pz);
        this.batch(root, this.mat('tree_bark', 1));
      }
    }
    // Tier 0's surface is flush with the mound, so the climb is five real
    // one-metre steps rather than a hidden lip at the bottom.
    const crown = baseY + tiers - 1;
    // The altar and the idol that gives the map its name: a stone maw with jade
    // eyes, which is the last thing a lot of squads see.
    const altar = this.slab(0, 0, crown, 9, 9, .9, 'summit_stone', { repeat: 3 });
    this.standOn(altar, 9, 9, .9, { navIgnore: true });
    const idolMat = this.mat('moss_stone', 2, { color: 0xb4bda3 });
    const head = new THREE.Mesh(new THREE.BoxGeometry(6, 6.4, 5.2), idolMat);
    head.position.set(0, crown + 4.1, 0); head.castShadow = head.receiveShadow = true; this.scene.add(head);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.6, 4.4), idolMat);
    jaw.position.set(0, crown + 1.6, 1.1); this.scene.add(jaw);
    const maw = new THREE.Mesh(new THREE.BoxGeometry(4, 2.1, .5), new THREE.MeshBasicMaterial({ color: 0x120b06 }));
    maw.position.set(0, crown + 3.1, 2.55); this.scene.add(maw);
    const jade = this.tint(0x63f7b6, { emissive: 0x11a06a, emissiveIntensity: 1.4, roughness: .35 });
    const eyes = [];
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.OctahedronGeometry(.72, 0), jade);
      eye.position.set(side * 1.5, crown + 5.4, 2.5); this.scene.add(eye); eyes.push(eye);
    }
    for (let i = 0; i < 6; i++) {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(.32, 1.1, 4), this.mat('summit_stone', 1));
      tooth.position.set(-1.7 + i * .68, crown + 3.8, 2.5); tooth.rotation.x = Math.PI; this.scene.add(tooth);
    }
    const idolEntity = this.prop(head, 2400, 4.5, 'idol');
    idolEntity.attachments = [jaw, maw, ...eyes];
    this.world.registerCollider(head, { shape: 'box', halfX: 3, halfZ: 2.6, top: 3.2, blocking: true, walkable: false }, idolEntity);
    this.animated.glows.push({ meshes: eyes, rate: 2.1 });
    // Braziers at the corners of the crown, still burning after all this time.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const bx = sx * 5.6, bz = sz * 5.6;
      this.pillar(bx, bz, crown + .9, .7, 2.2, 'sandstone', { blocking: false });
      const flame = new THREE.Mesh(new THREE.ConeGeometry(.85, 2.6, 6), new THREE.MeshBasicMaterial({ color: 0xffa23c, transparent: true, opacity: .82, blending: THREE.AdditiveBlending, depthWrite: false }));
      flame.position.set(bx, crown + 4.3, bz); this.scene.add(flame);
      // Two of the four carry a real light; the diagonal pair is enough to lift
      // the idol's face without spending four of the map's six light slots.
      const emberLight = sx === sz ? new THREE.PointLight(0xff9a3c, 9, 26, 2) : null;
      if (emberLight) { emberLight.position.set(bx, crown + 4.6, bz); this.scene.add(emberLight); }
      this.animated.glows.push({ mesh: flame, light: emberLight, base: 8, swing: 4, rate: 6 + this.random() * 3 });
    }
    // The idol ring: twelve monoliths facing in, plus toppled ones outside.
    for (let i = 0; i < 12; i++) {
      const angle = i / 12 * TAU, reach = 24;
      this.monolith(Math.cos(angle) * reach, Math.sin(angle) * reach, 6 + (i % 3) * 1.4, i % 2 ? 'sandstone' : 'moss_stone');
    }
    for (let i = 0; i < 8; i++) {
      const angle = (i + .5) / 8 * TAU, reach = 32 + this.random() * 6;
      const px = Math.cos(angle) * reach, pz = Math.sin(angle) * reach;
      if (wildsIsWater(px, pz)) continue;                     // the gorge runs past the mound's south flank
      this.fallenLog(px, pz, angle + Math.PI / 2, 9, 1.1, { crossing: true, hp: 420 });
    }
    this.landmarks.push({ kind: 'summit', name: 'THE HUNGRY IDOL', x: 0, z: 0, y: crown });
  }

  // ── the four lost temples ─────────────────────────────────────────────────
  buildTemples() {
    for (const [index, temple] of WILDS_TEMPLES.entries()) {
      const baseY = this.ground(temple.x, temple.z), yaw = Math.atan2(-temple.x, -temple.z);
      const at = (dx, dz) => ({ x: temple.x + dx * Math.cos(yaw) + dz * Math.sin(yaw), z: temple.z - dx * Math.sin(yaw) + dz * Math.cos(yaw) });
      // Courtyard wall, broken open on the side facing the ziggurat.
      for (const [dx, dz, w, d] of [[0, -17, 30, 2.2], [-16, 0, 2.2, 32], [16, 0, 2.2, 32], [-11, 17, 9, 2.2], [11, 17, 9, 2.2]]) {
        const point = at(dx, dz);
        const wall = this.slab(point.x, point.z, this.ground(point.x, point.z) - 1, w, d, 5.4, temple.texture, { repeat: 3, rotation: yaw });
        const entity = this.prop(wall, 740, Math.max(w, d) * .5, 'temple-wall');
        this.world.registerCollider(wall, { shape: 'box', halfX: w / 2, halfZ: d / 2, top: 2.2, blocking: true, walkable: false }, entity);
      }
      // Four corner towers with roofs you can climb via 1.0 terrace risers.
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const corner = at(sx * 16, sz * 17);
        const cornerY = this.ground(corner.x, corner.z);
        for (let step = 0; step < 7; step++) {
          const half = 5.4 - step * .42;
          const block = this.batchSlab(corner.x, corner.z, cornerY + step - 1.4, half * 2, half * 2, 2.4, temple.accent, { repeat: 2, rotation: yaw + .1 });
          this.standOn(block, half * 2, half * 2, 2.4, { navIgnore: true });
        }
        const finial = new THREE.Mesh(new THREE.ConeGeometry(1.5, 3.4, 5), this.mat(temple.texture, 2));
        finial.position.set(corner.x, cornerY + 8.4, corner.z); finial.castShadow = true; this.scene.add(finial);
      }
      // The shrine: a stepped plinth with a stone jaguar and an offering bowl.
      for (let step = 0; step < 3; step++) {
        const half = 6.4 - step * 1.5;
        const plinth = this.slab(temple.x, temple.z, baseY + step - 1.4, half * 2, half * 2, 2.4, temple.accent, { repeat: 2, rotation: yaw });
        this.standOn(plinth, half * 2, half * 2, 2.4, { navIgnore: true });
      }
      const beast = this.slab(temple.x, temple.z, baseY + 3, 4.4, 2.6, 2.4, temple.texture, { repeat: 2, rotation: yaw });
      const head = new THREE.Mesh(new THREE.BoxGeometry(2, 1.9, 2.1), this.mat(temple.texture, 1));
      head.position.set(temple.x + Math.sin(yaw) * 1.9, baseY + 5.4, temple.z + Math.cos(yaw) * 1.9); head.rotation.y = yaw;
      head.castShadow = true; this.scene.add(head);
      const shrine = this.prop(beast, 900, 3, 'shrine');
      shrine.attachments = [head];
      this.world.registerCollider(beast, { shape: 'box', halfX: 2.2, halfZ: 1.3, top: 1.2, blocking: true, walkable: false }, shrine);
      // Colonnade: half of it still standing, half of it on the ground.
      for (let i = 0; i < 10; i++) {
        const angle = i / 10 * TAU, reach = 11.5;
        const point = at(Math.cos(angle) * reach, Math.sin(angle) * reach);
        if (wildsIsWater(point.x, point.z)) continue;
        if (i % 3 === 2) this.fallenLog(point.x, point.z, angle, 7.5, .95, { crossing: true, hp: 460 });
        else {
          const column = this.pillar(point.x, point.z, this.ground(point.x, point.z), 1.05, 6 + (i % 3), temple.accent);
          this.prop(column, 520, 1.3, 'column');
        }
      }
      this.templeFlavour(temple, index, at, baseY, yaw);
      this.landmarks.push({ kind: 'temple', name: temple.name, x: temple.x, z: temple.z, y: baseY + 3 });
    }
  }
  templeFlavour(temple, index, at, baseY, yaw) {
    if (index === 0) {
      // Sunken Court of Roots: swallowed by the mire, propped up on stilts.
      for (let i = 0; i < 14; i++) {
        const angle = this.random() * TAU, reach = 12 + this.random() * 16;
        this.mangrove(temple.x + Math.cos(angle) * reach, temple.z + Math.sin(angle) * reach, .9 + this.random() * .6);
      }
      for (let i = 0; i < 5; i++) {
        const point = at((this.random() - .5) * 26, (this.random() - .5) * 26);
        this.slab(point.x, point.z, this.ground(point.x, point.z) - .4, 3.4, 3.4, .5, 'root_mud', { repeat: 1, rotation: this.random() * TAU });
      }
      this.glowShelf(temple.x + 9, temple.z - 6);
      this.glowShelf(temple.x - 11, temple.z + 4);
    } else if (index === 1) {
      // Lagoon Jaguar Shrine: a stone jetty running from the shoreline out over
      // open water, level the whole way, ending well past the drop-off.
      const toward = Math.atan2(LAGOON.x - temple.x, LAGOON.z - temple.z);
      const shore = Math.hypot(LAGOON.x - temple.x, LAGOON.z - temple.z) - LAGOON.radius - 3;
      let jettyX = temple.x, jettyZ = temple.z;
      for (let i = 0; i < 9; i++) {
        const reach = shore + i * 5.4;
        const px = temple.x + Math.sin(toward) * reach, pz = temple.z + Math.cos(toward) * reach;
        const deck = this.slab(px, pz, WATER_Y - .55, 7, 6.2, .65, 'moss_stone', { repeat: 2, rotation: toward });
        this.standOn(deck, 7, 6.2, .65, { elevated: true, navIgnore: true });
        if (i % 2 === 0) this.pillar(px, pz, WATER_Y - 4.2, .55, 3.7, 'sandstone', { blocking: false });
        jettyX = px; jettyZ = pz;
      }
      this.reeds(temple.x + Math.sin(toward) * shore, temple.z + Math.cos(toward) * shore, 12);
      this.landmarks.push({ kind: 'jetty', name: 'JAGUAR JETTY', x: jettyX, z: jettyZ, y: WATER_Y + .1 });
    } else if (index === 2) {
      // Cloud Temple of the Veil: a bell tower on the roof of the world.
      const tower = at(0, 12);
      for (let step = 0; step < 12; step++) {
        const half = 4.6 - step * .18;
        const block = this.slab(tower.x, tower.z, baseY + step - 1.4, half * 2, half * 2, 2.4, 'summit_stone', { repeat: 2, rotation: yaw });
        this.standOn(block, half * 2, half * 2, 2.4, { navIgnore: true });
      }
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.8, 3.4, 9, 1, true), this.mat('vehicle_metal', 2, { color: 0xc9a45c }));
      bell.position.set(tower.x, baseY + 14.6, tower.z); bell.castShadow = true; this.scene.add(bell);
      this.landmarks.push({ kind: 'overlook', name: 'VEIL BELL', x: tower.x, z: tower.z, y: baseY + 12 });
    } else {
      // Bamboo Ossuary: racks of skulls and a wall of standing bamboo.
      for (let i = 0; i < 14; i++) {
        const angle = this.random() * TAU, reach = 20 + this.random() * 16;
        this.bambooClump(temple.x + Math.cos(angle) * reach, temple.z + Math.sin(angle) * reach, 13, 1.15);
      }
      const boneMat = this.tint(0xe6dfc4, { roughness: .8 });
      for (let rack = 0; rack < 3; rack++) {
        const point = at((rack - 1) * 9, -11);
        for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
          const skull = new THREE.IcosahedronGeometry(.42, 0);
          skull.translate(point.x + (col - 1.5) * 1.1, this.ground(point.x, point.z) + 1 + row * 1.05, point.z);
          this.batch(skull, boneMat);
        }
      }
    }
  }

  // ── the canopy ────────────────────────────────────────────────────────────
  buildCanopy() {
    const decks = [];
    for (const node of CANOPY_NODES) {
      // The tree carrying the platform, tall enough that the deck sits in its
      // crown rather than on top of a stump.
      this.kapok(node.x, node.z, 1.35);
      const deck = this.slab(node.x, node.z, CANOPY_Y - .6, 12, 12, .6, 'wood', { repeat: 3, rotation: this.random() * .3 });
      this.standOn(deck, 12, 12, .6, { elevated: true, navIgnore: true });
      // Corner posts and a lantern, so a platform reads from the ground.
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const px = node.x + sx * 5.4, pz = node.z + sz * 5.4;
        this.pillar(px, pz, this.ground(px, pz), .34, CANOPY_Y - this.ground(px, pz), 'tree_bark', { blocking: false, taper: 1.6 });
      }
      // The lantern hangs off a corner post rather than out of the trunk.
      const lanternX = node.x + 5.4, lanternZ = node.z + 5.4;
      const hook = new THREE.Mesh(new THREE.BoxGeometry(.16, 2.4, .16), this.mat('wood', 1));
      hook.position.set(lanternX, CANOPY_Y + 1.4, lanternZ); this.scene.add(hook);
      const lantern = new THREE.Mesh(new THREE.IcosahedronGeometry(.62, 0), this.tint(0xffd39a, { emissive: 0xff9c3c, emissiveIntensity: 1.5, roughness: .4 }));
      lantern.position.set(lanternX, CANOPY_Y + 2.5, lanternZ); this.scene.add(lantern);
      this.animated.glows.push({ mesh: lantern, rate: 2.6 + this.random() });
      decks.push(node);
      this.landmarks.push({ kind: 'canopy', name: node.name, x: node.x, z: node.z, y: CANOPY_Y });
    }
    // Close the loop.
    for (let i = 0; i < decks.length; i++) {
      const a = decks[i], b = decks[(i + 1) % decks.length];
      const length = Math.hypot(b.x - a.x, b.z - a.z), yaw = Math.atan2(b.x - a.x, b.z - a.z);
      const from = { x: a.x + Math.sin(yaw) * 5.5, z: a.z + Math.cos(yaw) * 5.5 };
      const to = { x: b.x - Math.sin(yaw) * 5.5, z: b.z - Math.cos(yaw) * 5.5 };
      this.walkway(from.x, from.z, to.x, to.z, CANOPY_Y, 4.6, 'wood');
      // Mid-span support trunk on the long crossings.
      if (length > 46) {
        const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
        if (!wildsIsWater(mx, mz)) this.pillar(mx, mz, this.ground(mx, mz), .6, CANOPY_Y - this.ground(mx, mz) - .5, 'tree_bark', { blocking: false, taper: 1.9 });
      }
    }
    // Four climbs up from the floor, spread around the loop.
    for (const node of decks.filter(entry => entry.climbYaw !== undefined)) {
      const outward = node.climbYaw;
      const towerX = node.x + Math.sin(outward) * 16, towerZ = node.z + Math.cos(outward) * 16;
      const exit = this.climbTower(towerX, towerZ, outward + Math.PI, CANOPY_Y, { run: 17, lane: 4.4, landing: 5, texture: 'wood' });
      if (exit) this.walkway(exit.x, exit.z, node.x + Math.sin(outward) * 5.5, node.z + Math.cos(outward) * 5.5, CANOPY_Y, 4.6, 'wood', { rails: false });
    }
  }

  // ── the bamboo terraces ───────────────────────────────────────────────────
  buildBambooTerraces() {
    const { x: cx, z: cz } = BAMBOO;
    // Seven retaining steps cut into the hill. Every riser is 1.0, so the whole
    // hillside is a staircase you can fight up from any bearing.
    // Each lip follows the contour it sits on rather than a single flat level,
    // so no retaining wall ever hangs over a gap or buries itself in the hill.
    // The 0.65 they stand proud is under World.STEP_UP: a stride, not a climb.
    for (let step = 0; step < 7; step++) {
      const radius = BAMBOO.core - step * 3.1;
      for (let i = 0; i < 26; i++) {
        const angle = i / 26 * TAU;
        const px = cx + Math.cos(angle) * radius, pz = cz + Math.sin(angle) * radius;
        const wall = this.batchSlab(px, pz, this.ground(px, pz) - .35, 5.2, 2.4, 1, 'moss_stone', { repeat: 1, rotation: -angle });
        this.standOn(wall, 5.2, 2.4, 1, { navIgnore: true });
      }
    }
    for (let i = 0; i < 26; i++) {
      const angle = this.random() * TAU, reach = Math.sqrt(this.random()) * (BAMBOO.core + 16);
      const px = cx + Math.cos(angle) * reach, pz = cz + Math.sin(angle) * reach;
      this.bambooClump(px, pz, 11 + Math.floor(this.random() * 6), .9 + this.random() * .5);
    }
    // A watch platform on the crown, and a dry irrigation channel running off it.
    const crownY = this.ground(cx, cz) + 4.2;
    const platform = this.slab(cx, cz, crownY, 13, 13, .8, 'wood', { repeat: 3 });
    this.standOn(platform, 13, 13, .8, { elevated: true, navIgnore: true });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.pillar(cx + sx * 5.6, cz + sz * 5.6, this.ground(cx, cz) - 1, .38, crownY - this.ground(cx, cz) + 1, 'tree_bark', { blocking: false });
    // The irrigation flume down the west face. Laid as one continuous run of
    // close-set planks following the contour, not as stepping stones: gaps in a
    // built structure read as broken geometry, not as decay.
    for (let i = 0; i <= 20; i++) {
      const t = i / 20, px = cx - 36 * t, pz = cz - 32 * t;
      const flume = this.slab(px, pz, this.ground(px, pz) - .3, 4.2, 3.4, .65, 'wood', { repeat: 1, rotation: Math.atan2(-36, -32) });
      this.standOn(flume, 4.2, 3.4, .65, { navIgnore: true });
      if (i % 4 === 0) for (const side of [-1, 1]) this.pillar(px + side * 2.4, pz, this.ground(px, pz) - .6, .22, 1.5, 'wood', { blocking: false });
    }
    this.landmarks.push({ kind: 'terrace', name: 'BAMBOO TERRACES', x: cx, z: cz, y: crownY });
  }

  // ── the mire ──────────────────────────────────────────────────────────────
  buildMire() {
    const { x: cx, z: cz } = MIRE;
    for (let i = 0; i < 46; i++) {
      const angle = this.random() * TAU, reach = Math.sqrt(this.random()) * (MIRE.core + 20);
      const px = cx + Math.cos(angle) * reach, pz = cz + Math.sin(angle) * reach;
      if (this.world.nearBase(px, pz, 34)) continue;
      if (i % 3 === 0) this.mangrove(px, pz, 1 + this.random() * .7);
      else if (i % 3 === 1) this.snag(px, pz, .9 + this.random() * .8);
      else this.reeds(px, pz, 10);
    }
    // Duckboards: a raised plank walk that keeps you out of the mud, if you
    // trust a hundred-year-old plank.
    const path = [[cx - 34, cz + 20], [cx - 14, cz + 6], [cx + 6, cz - 6], [cx + 26, cz - 20]];
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, az] = path[i], [bx, bz] = path[i + 1];
      const y = Math.max(this.ground(ax, az), this.ground(bx, bz)) + 1.1;
      this.walkway(ax, az, bx, bz, y, 3.6, 'wood', { rails: false });
      for (const [px, pz] of [[ax, az], [bx, bz]]) this.pillar(px, pz, this.ground(px, pz) - 1, .3, y - this.ground(px, pz) + 1, 'wood', { blocking: false });
    }
    // Standing pools of black water and a lot of things glowing in them.
    for (let i = 0; i < 7; i++) {
      const angle = this.random() * TAU, reach = this.random() * MIRE.core;
      const px = cx + Math.cos(angle) * reach, pz = cz + Math.sin(angle) * reach;
      const pool = new THREE.Mesh(new THREE.CircleGeometry(3.5 + this.random() * 4, 18), this.tint(0x1c2f24, { roughness: .18, metalness: .4, transparent: true, opacity: .88 }));
      pool.rotation.x = -Math.PI / 2; pool.position.set(px, this.ground(px, pz) + .1, pz); pool.renderOrder = 1;
      this.scene.add(pool);
      this.glowShelf(px + 4, pz + 2);
    }
    const fogLight = new THREE.PointLight(0x76d9a4, 10, 60, 2);
    fogLight.position.set(cx, this.ground(cx, cz) + 5, cz); this.scene.add(fogLight);
    this.animated.glows.push({ light: fogLight, base: 8, swing: 3, rate: .8 });
    this.landmarks.push({ kind: 'mire', name: 'THE DROWNED ROOTLANDS', x: cx, z: cz, y: this.ground(cx, cz) });
  }

  // ── the grotto ────────────────────────────────────────────────────────────
  // A collapsed sinkhole full of light-bearing fungus, with a spiral of ledges
  // down to a cold pool at the bottom.
  buildGrotto() {
    const { x: cx, z: cz } = GROTTO, floorY = this.ground(cx, cz);
    for (let i = 0; i < 22; i++) {
      const angle = i / 22 * TAU, reach = GROTTO.core + 6;
      const px = cx + Math.cos(angle) * reach, pz = cz + Math.sin(angle) * reach;
      const height = 4 + (i % 3) * 2.2;
      const rock = this.batchSlab(px, pz, this.ground(px, pz) - 1, 5.5, 4.4, height, 'summit_stone', { repeat: 2, rotation: -angle });
      this.world.registerCollider(rock, { shape: 'box', halfX: 2.75, halfZ: 2.2, top: height / 2 - 1, blocking: true, walkable: false });
    }
    // Descending ledges, each a 1.0 step below the last.
    for (let step = 0; step < 5; step++) {
      const angle = step * 1.15, reach = GROTTO.core - step * 2.2;
      const px = cx + Math.cos(angle) * reach, pz = cz + Math.sin(angle) * reach;
      const ledge = this.slab(px, pz, floorY + 2.1 - step, 7, 7, 2.4, 'moss_stone', { repeat: 2, rotation: angle });
      this.standOn(ledge, 7, 7, 2.4, { navIgnore: true });
      this.glowShelf(px, pz);
    }
    const pool = new THREE.Mesh(new THREE.CircleGeometry(7.5, 26), this.tint(0x2b7f96, { roughness: .1, metalness: .5, transparent: true, opacity: .82 }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(cx, floorY + .12, cz); pool.renderOrder = 1; this.scene.add(pool);
    const crystalMat = this.mat('crystal', 1, { emissive: 0x3fd4a0, emissiveIntensity: 1.2 });
    for (let i = 0; i < 10; i++) {
      const angle = this.random() * TAU, reach = 3 + this.random() * 9;
      const shard = new THREE.Mesh(new THREE.ConeGeometry(.5, 2.4 + this.random() * 2.4, 5), crystalMat);
      shard.position.set(cx + Math.cos(angle) * reach, floorY + 1.3, cz + Math.sin(angle) * reach);
      shard.rotation.z = (this.random() - .5) * .6; shard.castShadow = true; this.scene.add(shard);
      this.prop(shard, 160, 1, 'crystal');
    }
    const light = new THREE.PointLight(0x54f0b4, 16, 40, 2);
    light.position.set(cx, floorY + 4, cz); this.scene.add(light);
    this.animated.glows.push({ light, base: 13, swing: 5, rate: 1.1 });
    this.landmarks.push({ kind: 'grotto', name: 'THE COLD LANTERN', x: cx, z: cz, y: floorY });
  }

  // ── things beside the trail ───────────────────────────────────────────────
  buildTrailside() {
    // Two abandoned expedition camps, both looted a long time ago.
    for (const [name, cx, cz] of [['SURVEYOR CAMP DELTA', -118, 118], ['PORTER CAMP SEVEN', 116, -128]]) {
      if (this.world.nearBase(cx, cz, 34)) continue;
      const baseY = this.ground(cx, cz);
      for (let i = 0; i < 3; i++) {
        const angle = i / 3 * TAU + .4;
        const tent = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.4, 4), this.mat('corrugated_steel', 1, { color: 0xb1a07c }));
        tent.position.set(cx + Math.cos(angle) * 5.5, baseY + 1.7, cz + Math.sin(angle) * 5.5);
        tent.rotation.y = angle; tent.castShadow = true; this.scene.add(tent);
        this.prop(tent, 180, 2.4, 'tent');
      }
      const firepit = this.slab(cx, cz, baseY, 3, 3, .5, 'summit_stone', { repeat: 1 });
      this.standOn(firepit, 3, 3, .5, { navIgnore: true });
      const embers = new THREE.Mesh(new THREE.IcosahedronGeometry(.9, 0), new THREE.MeshBasicMaterial({ color: 0xff8a2c, transparent: true, opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false }));
      embers.position.set(cx, baseY + .9, cz); this.scene.add(embers);
      this.animated.glows.push({ mesh: embers, rate: 4.4 });
      for (let i = 0; i < 4; i++) {
        const crate = this.slab(cx + (this.random() - .5) * 12, cz + (this.random() - .5) * 12, baseY, 1.8, 1.8, 1.6, 'wood', { repeat: 1, rotation: this.random() * TAU });
        const entity = this.prop(crate, 150, 1.3, 'supply-box');
        this.world.registerCollider(crate, { shape: 'box', halfX: .9, halfZ: .9, top: .8, blocking: true, walkable: true }, entity);
      }
      this.landmarks.push({ kind: 'camp', name, x: cx, z: cz, y: baseY });
    }
    // Trail shrines: small idol niches along the three worn paths, each with a
    // brazier so the routes read at night.
    for (const [x, z] of [[-104, 22], [-24, 26], [46, 26], [-6, 62], [14, -34], [28, -92], [-58, -50], [30, 16], [78, 52]]) {
      if (this.world.nearBase(x, z, 34) || this.world.nearDropZone(x, z, 12) || wildsIsWater(x, z)) continue;
      const baseY = this.ground(x, z), yaw = Math.atan2(-x, -z);
      const niche = this.slab(x, z, baseY, 3.2, 2, 3.6, 'moss_stone', { repeat: 1, rotation: yaw });
      const entity = this.prop(niche, 360, 2, 'shrine');
      this.world.registerCollider(niche, { shape: 'box', halfX: 1.6, halfZ: 1, top: 1.8, blocking: true, walkable: false }, entity);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(.45, 1.3, 5), new THREE.MeshBasicMaterial({ color: 0x9cffdc, transparent: true, opacity: .78, blending: THREE.AdditiveBlending, depthWrite: false }));
      flame.position.set(x, baseY + 4.3, z); this.scene.add(flame);
      this.animated.glows.push({ mesh: flame, rate: 3.4 + this.random() * 2 });
      entity.attachments = [flame];
    }
  }

  // ── planting ──────────────────────────────────────────────────────────────
  // Everything above is placed by hand. This is the forest between it: dense,
  // varied, and kept out of water, off the cliffs and away from anywhere the
  // match actually needs to stay clear.
  canPlant(x, z, clearance = 3) {
    const world = this.world;
    if (Math.hypot(x, z) > world.bounds - 8) return false;
    if (wildsIsWater(x, z) || distanceToPath(x, z, RIVER) < RIVER_HALF + clearance) return false;
    if (Math.hypot(x - LAGOON.x, z - LAGOON.z) < LAGOON.radius + clearance) return false;
    if (Math.hypot(x - PLUNGE.x, z - PLUNGE.z) < PLUNGE.radius + clearance) return false;
    if (world.nearBase(x, z, 34) || world.nearDropZone(x, z, 12)) return false;
    if (world.cavePosition && Math.hypot(x - world.cavePosition.x, z - world.cavePosition.z) < 16) return false;
    // The mesa cliff band and its talus stay clear; the plateau plants itself.
    const mesaDistance = Math.hypot(x - MESA.x, z - MESA.z);
    if (mesaDistance > MESA.core - 6 && mesaDistance < MESA.core + 18) return false;
    if (mesaDistance <= MESA.core - 6) return false;
    if (Math.hypot(x, z) < 30) return false;                                  // the ziggurat plaza
    for (const temple of WILDS_TEMPLES) if (Math.hypot(x - temple.x, z - temple.z) < 26) return false;
    for (const node of CANOPY_NODES) if (Math.hypot(x - node.x, z - node.z) < 12) return false;
    return true;
  }
  plantRainforest() {
    // The budget is entities, not trees. Every destructible costs a slot in the
    // per-frame entity sweep, so the forest reads dense through batched
    // undergrowth — ferns, heliconia, fungus, gravel, all free — while the
    // things you can actually shoot down stay near the count this map has
    // always carried.
    const world = this.world, extent = world.bounds - 14;
    let placed = 0, attempts = 0;
    while (placed < 235 && attempts < 6000) {
      attempts++;
      const x = (this.random() * 2 - 1) * extent, z = (this.random() * 2 - 1) * extent;
      if (!this.canPlant(x, z)) continue;
      placed++;
      const radius = Math.hypot(x, z), roll = this.random();
      const nearWater = distanceToPath(x, z, RIVER) < RIVER_HALF + 22 || Math.hypot(x - LAGOON.x, z - LAGOON.z) < LAGOON.radius + 24;
      // Species mix shifts with the ground: mangrove and palm at the waterline,
      // bamboo in the east, kapok and fig in the deep interior, snags on the rim.
      if (nearWater && roll < .3) this.mangrove(x, z, .85 + this.random() * .6);
      else if (x > 60 && z > 10 && roll < .42) this.bambooClump(x, z, 7 + Math.floor(this.random() * 6), .85 + this.random() * .5);
      else if (roll < .09) this.kapok(x, z, .9 + this.random() * .7);
      else if (roll < .17) this.strangler(x, z, .85 + this.random() * .55);
      else if (roll < .23) this.snag(x, z, .8 + this.random() * .8);
      else if (roll < .3) this.bambooClump(x, z, 6 + Math.floor(this.random() * 5), .8 + this.random() * .4);
      else if (roll < .52) this.palm(x, z, .8 + this.random() * .7);
      else if (roll < .62) this.boulder(x, z, .8 + this.random() * 1.7);
      else if (roll < .66) this.termiteMound(x, z, .8 + this.random() * .7);
      else if (roll < .72 && radius > 60) this.fallenLog(x, z, this.random() * TAU, 6 + this.random() * 6, .8 + this.random() * .6, { crossing: true });
      else this.palm(x, z, .7 + this.random() * .5);
      // Undergrowth around whatever just went in — batched, so it is nearly free.
      const cover = 5 + Math.floor(this.random() * 6);
      for (let i = 0; i < cover; i++) {
        const angle = this.random() * TAU, reach = 2 + this.random() * 7;
        const px = x + Math.cos(angle) * reach, pz = z + Math.sin(angle) * reach;
        if (!this.canPlant(px, pz, 1)) continue;
        const kind = this.random();
        if (kind < .5) this.fern(px, pz, .8 + this.random() * .8);
        else if (kind < .78) this.heliconia(px, pz, .8 + this.random() * .6);
        else if (kind < .9) this.pebbles(px, pz, 2.5);
        else this.glowShelf(px, pz);
      }
    }
    this.landmarks.push({ kind: 'forest', name: 'THE HUNGRY WILDERNESS', x: 0, z: 0, y: 0, count: placed });
  }

  // A wall of colossal trunks beyond the base ring. No collision and no
  // destructibles: it exists so the jungle closes rather than simply stopping.
  buildRimForest() {
    const bark = this.mat('tree_bark', 4, { color: 0x6d5a45 });
    const canopy = this.tint(0x24512c, { roughness: 1 });
    for (let i = 0; i < 108; i++) {
      const angle = i / 108 * TAU + this.random() * .04;
      const reach = 232 + (i % 5) * 9 + this.random() * 6;
      const x = Math.cos(angle) * reach, z = Math.sin(angle) * reach;
      const height = 34 + (i % 7) * 6;
      const trunk = new THREE.CylinderGeometry(2.2, 3.6, height, 6);
      trunk.translate(x, height / 2, z);
      this.batch(trunk, bark);
      const crown = new THREE.IcosahedronGeometry(11 + (i % 4) * 2.6, 0);
      crown.scale(1, .62, 1);
      crown.translate(x, height + 4, z);
      this.batch(crown, canopy);
    }
  }

  animator() {
    const { curtains, mist, glows } = this.animated;
    return {
      update(time, dt) {
        // A single non-finite frame time would propagate straight into a light
        // intensity and NaN out every lit material on the map, so the clock is
        // checked once here rather than trusted a dozen times below.
        if (!Number.isFinite(time) || !Number.isFinite(dt)) return;
        // Water falls DOWN. A fragment at uv.y samples the texture at
        // uv.y + offset.y, so *increasing* the offset walks the image toward
        // the top of the plane — which is what makes the sheet read as pouring
        // over the lip rather than climbing back up it.
        for (const curtain of curtains) curtain.map.offset.y += dt * curtain.speed;
        for (const puff of mist) {
          puff.mesh.position.y = puff.base + Math.sin(time * puff.drift + puff.phase) * 1.3;
          const breathe = 1 + Math.sin(time * puff.drift * .7 + puff.phase) * .16;
          puff.mesh.scale.set(breathe, .55 * breathe, breathe);
        }
        for (const glow of glows) {
          const pulse = .5 + .5 * Math.sin(time * (glow.rate || 3));
          if (glow.light && glow.base !== undefined) glow.light.intensity = glow.base + pulse * (glow.swing || 2);
          if (glow.mesh) { glow.mesh.scale.setScalar(.85 + pulse * .35); if (glow.mesh.material.opacity !== undefined) glow.mesh.material.opacity = .55 + pulse * .35; }
          if (glow.meshes) for (const [index, mesh] of glow.meshes.entries()) mesh.scale.setScalar(.9 + Math.abs(Math.sin(time * (glow.rate || 2) + index)) * .3);
        }
      },
    };
  }
}

export function buildRainforestWilds(world) { return new RainforestWilds(world).build(); }
