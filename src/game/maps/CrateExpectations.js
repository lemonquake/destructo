import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CANDY, CANDY_DISTRICTS, candyIsSyrup, distanceToPath } from '../../data/mapSurfaces.js';
import { DEATHMATCH_SECRET_PLANS } from '../../data/maps.js';
import { CRATE_TYPES } from '../../data/gameData.js';

// ── CRATE EXPECTATIONS · CANDYLAND ──────────────────────────────────────────
// Built the way Bumper-to-Bumper Bedlam and The Very Hungry Wilderness are
// built: authored geometry standing on a heightfield both sides agree on
// (CANDY/candyHeight in src/data/mapSurfaces.js). Nothing here is scattered
// blind — every lollipop, road deck, pylon and bridge landing samples
// world.heightAt, so the map has no floating props and no sunk ones.
//
// Four vertical layers, each reachable from the one below:
//    ~8-16   the buttercream floor — ring road, six districts, the cocoa run
//    12.5    MOUNT GUMDROP tier 0, the cake plate: open from every bearing
//    22.0    tier 1 — walled, reached by the Grand Spiral or the Wafer Steps
//    33.0    tier 2 — walled, same two ways up, plus the rainbow bridges
//    44.0    THE CRATE CROWN — the summit crate drop, and the whole point
//
// Collision contract is Bedlam's (see World.registerCollider):
//   walkable, !blocking             stand on it, walk under and past it
//   walkable + blocking + elevated  solid mass: roof on top, wall below
//   shape:'ramp'                    walkable surface sloping along local +Z
//   navBlock / navIgnore            kept out of the AI's flat 2-D route plan
//   motionPad                       broadphase slack for a collider that moves
//
// Terrain steepness alone never stops anyone in this engine — a body walking
// into a cliff is simply snapped to the ground height on the far side. So the
// cake tiers are walled with real blocking frosting, and the only holes in
// those walls are the ones the Grand Spiral and the Wafer Steps cut for
// themselves. Those gaps are *derived* from the road, never hand-typed: change
// a spiral node and the wall opens somewhere else to match.

const { tiers: TIERS, plunge: PLUNGE, lake: LAKE, fallCrag: CRAG, river: RIVER, riverHalf: RIVER_HALF,
  syrupY: SYRUP_Y, flosswood: FLOSSWOOD, peppermint: PEPPERMINT, village: VILLAGE, quarry: QUARRY, mire: MIRE } = CANDY;

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
// A rail shorter than World.STEP_UP (1.05) is simply stepped over, so every
// rail on every candy road is authored above that threshold on purpose.
const RAIL = 1.6;
// Steeper than this stops reading as a road you can drive a Destructo up.
const MAX_SLOPE = .34;
// Anything rising 1.0 or less per tread needs no ramp: that is under
// World.STEP_UP, which is what makes the Wafer Steps climbable without a
// single authored slope.
const STEP_RISE = 1;

// The candy palette. Hard candies, jelly beans and gumballs cycle through this
// when they are shot, which is the map's signature reaction — and it is one
// shared list so a gumball, a gumdrop and a sprinkle are never off-key.
const CANDY_COLORS = Object.freeze([
  0xff3b6e, 0xff8a2b, 0xffd93b, 0x5fe87e, 0x3fbaff, 0x8b6bff, 0xff6bc5, 0xffffff,
]);
const CANDY_DARKS = Object.freeze([
  0x8e0f31, 0x8f3d06, 0x8f7100, 0x1c7a34, 0x0a5c8e, 0x3a2494, 0x8e1f66, 0x8a8494,
]);

// MOUNT GUMDROP's crown, and the tier a landmark refers to. Indexed the same
// way CANDY.tiers is: 0 is the outermost plate, 3 is the summit.
const CROWN_Y = TIERS[3].level;

// ── THE GRAND SPIRAL ────────────────────────────────────────────────────────
// One continuous candy road that leaves the ring road in the north, wraps the
// cake one and a third times, and arrives at the crate drop. `tier` is which
// cake tier the node stands on; `null` means "wherever the ground is", which
// is only ever true of the very first node, out on the buttercream.
//
// Bearings run *negative* on purpose: they decrease monotonically so the
// interpolator can sweep straight through them without wrapping, and the road
// therefore never doubles back on itself.
//
// Every climb crests *outside* the skirt of the tier it is climbing, and the
// leg after it is dead level and crosses the wall. That split is not
// cosmetic. A tier's terrain cliff is 3.6 metres wide and nine to eleven tall,
// so a road still gaining height inside that band is simply buried — the
// ground overtakes the deck and the climb vanishes. Cresting first and
// crossing level means the road always arrives at the lip already at the lip's
// height, which is also what a spiral road on a cake actually looks like.
// A climb also has to stay clear of the wall *band* — the blocks are set a
// couple of metres outside the boundary and are several metres deep, so a road
// that gains height alongside them gets shouldered off. Hence WALL_CLEAR: every
// climb runs outside boundary + this, and only the level radial leg after it
// steps through the door.
const WALL_CLEAR = 11;
const SPIRAL_NODES = Object.freeze([
  Object.freeze({ a: 100, r: 100, tier: null }),  // off the ring road
  Object.freeze({ a: 100, r: 80, tier: 0 }),      // onto the cake plate
  Object.freeze({ a: 30, r: 78, tier: 0 }),
  Object.freeze({ a: -30, r: 78, tier: 0 }),      // foot of the first climb
  Object.freeze({ a: -96, r: 72, tier: 1 }),      // crest, clear of tier 1's wall
  Object.freeze({ a: -96, r: 56, tier: 1 }),      // level, radial, through the door
  Object.freeze({ a: -160, r: 54, tier: 1 }),
  Object.freeze({ a: -220, r: 56, tier: 1 }),     // foot of the second climb
  Object.freeze({ a: -286, r: 51, tier: 2 }),     // crest, clear of tier 2's wall
  Object.freeze({ a: -286, r: 35, tier: 2 }),     // level, radial, through the door
  Object.freeze({ a: -350, r: 33, tier: 2 }),
  Object.freeze({ a: -410, r: 34, tier: 2 }),     // foot of the third climb
  Object.freeze({ a: -476, r: 31, tier: 3 }),     // crest, clear of the crown wall
  Object.freeze({ a: -476, r: 14, tier: 3 }),     // level, radial, onto the crown
]);
const SPIRAL_WIDTH = 9;
// The road rides a kerb's height above whatever tier it crosses, so it reads as
// a laid road rather than as paint flush with the icing.
const SPIRAL_LIFT = .35;

// The Wafer Steps are not given bearings: they are *found*. A flight is
// eighteen metres long in plan, so a hand-picked bearing that merely looks
// far from where the spiral crosses the same wall still lands the staircase
// across the road one tier down. buildWaferSteps searches instead, and takes
// the bearing whose whole footprint sits furthest from the finished spiral.
const STAIR_WIDTH = 9;
const STAIR_TREAD = 1.7;

export class CrateExpectations {
  constructor(world) {
    this.world = world;
    this.scene = world.scene;
    this.random = world.seeded(60418);
    this.materials = new Map();
    this.batches = new Map();
    this.landmarks = [];
    // Everything the per-frame animator owns. Gumballs are the only entries
    // that move themselves; the rest breathe, spin, scroll or glow.
    this.animated = { gumballs: [], candies: [], spinners: [], bobbers: [], flames: [], sheets: [], glows: [], bubbles: [] };
    // Bearings the cake walls must leave open, keyed by the tier they wall in.
    // Filled by the road and stair builders and consumed by buildCake, so a
    // wall can never seal the road that runs through it.
    this.wallGaps = new Map();
    // Every road node laid so far, with the half-width it needs kept clear.
    // The planter reads this so no lollipop ever grows through a carriageway.
    this._roadKeepOut = [];
  }

  ground(x, z) { return this.world.heightAt(x, z); }
  tierY(index) { return TIERS[index].level; }

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
  // A material nobody else shares, for anything that repaints itself at
  // runtime. Colour-changing candies must not reach through a cache and
  // recolour every other candy on the map.
  ownColor(color, options = null) { return this.world.materials.color(color, options || {}); }
  get palette() {
    if (!this._palette) this._palette = {
      stick: this.tint(0xfff6fa, { roughness: .55 }),
      caneStick: this.mat('candy_cane', 1),
      bark: this.mat('chocolate', 2),
      cone: this.mat('waffle_cone', 2),
      cream: this.tint(0xfff2e0, { roughness: .7 }),
      floss: this.tint(0xff9ed4, { roughness: 1 }),
      flossPale: this.tint(0xffd6ec, { roughness: 1 }),
      flossBlue: this.tint(0xa9dcff, { roughness: 1 }),
      leaf: this.tint(0x5fe87e, { roughness: .8 }),
      mint: this.tint(0x8ff0c6, { roughness: .8 }),
      licorice: this.mat('licorice', 2),
      icing: this.mat('sprinkle_icing', 2),
      jelly: this.tint(0xff2f6d, { roughness: .25, metalness: .1 }),
      cherry: this.tint(0xff2f4d, { roughness: .2, metalness: .15, emissive: 0x6b0010, emissiveIntensity: .35 }),
    };
    return this._palette;
  }

  // ── static batching ───────────────────────────────────────────────────────
  // Sprinkles, sugar tufts, wrappers, pebbles and the horizon lollipop wall are
  // thousands of pieces that never move, never die and never change material.
  // Baking them into one mesh per material turns thousands of draw calls into a
  // handful. Only things a shell can destroy or repaint stay individual.
  batch(geometry, material) {
    const normalized = geometry.index ? geometry.toNonIndexed() : geometry;
    if (normalized !== geometry) geometry.dispose();
    const bucket = this.batches.get(material);
    if (bucket) bucket.push(normalized); else this.batches.set(material, [normalized]);
  }
  // A slab that is static, indestructible and only needs a *collider* — cake
  // walls, road decks, plaza plates. The geometry joins the batch and the
  // caller gets a bodiless anchor at the same transform, because the collider
  // system only ever asks an object where it is.
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
      mesh.name = 'candyland-static-batch';
      mesh.castShadow = false; mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      this.scene.add(mesh);
    }
    this.batches.clear();
  }

  // ── primitives ────────────────────────────────────────────────────────────
  // A box placed by its *bottom* face, so stacked cake layers can never drift.
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
  // A sloped plate. `solid` fills it to the ground for an icing embankment;
  // otherwise it is a constant-thickness deck you can walk and shoot under —
  // which is what a candy road on pylons actually is.
  ramp(x, z, yaw, fromY, toY, run, width, texture, options = {}) {
    const rise = toY - fromY, thickness = options.thickness ?? .8;
    const geometry = new THREE.BoxGeometry(width, 1, run);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const surface = rise * ((position.getZ(i) + run / 2) / run);
      position.setY(i, position.getY(i) > 0 ? surface : (options.solid ? -Math.abs(rise) - 14 : surface - thickness));
    }
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, options.material || this.mat(texture, options.repeat ?? 3));
    mesh.position.set(x, fromY, z); mesh.rotation.y = yaw;
    mesh.castShadow = mesh.receiveShadow = true;
    this.scene.add(mesh);
    // Piped-icing balustrades and roof trim are sloped *decoration*. Giving
    // them a ramp collider would offer every eave and handrail as a walkable
    // surface whose lower end hangs in mid-air over the ground below.
    if (options.collider === false) return mesh;
    this.world.registerCollider(mesh, {
      shape: 'ramp', halfX: width / 2, halfZ: run / 2, rampLow: 0, rampHigh: rise, top: rise,
      rampThickness: options.solid ? Infinity : thickness,
      blocking: false, walkable: true, elevated: options.elevated !== false, navBlock: options.navBlock !== false,
    });
    return mesh;
  }
  // A rail that only stops bodies at its own level, leaving the ground clear.
  parapet(x, z, base, w, d, texture = 'licorice', height = RAIL, options = {}) {
    const mesh = this.slab(x, z, base, w, d, height, texture, { repeat: 1, shadow: false, rotation: options.rotation || 0, material: options.material });
    this.world.registerCollider(mesh, {
      shape: 'box', halfX: w / 2, halfZ: d / 2, top: height / 2, bottom: -height / 2,
      blocking: true, walkable: false, navIgnore: true,
    });
    return mesh;
  }
  pillar(x, z, base, radius, height, texture, { blocking = true, repeat = 2, material = null, taper = 1.1, sides = 10 } = {}) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * taper, height, sides), material || this.mat(texture, repeat));
    mesh.position.set(x, base + height / 2, z);
    mesh.castShadow = mesh.receiveShadow = true; this.scene.add(mesh);
    if (blocking) this.world.registerCollider(mesh, { shape: 'cylinder', radius: radius * 1.05, top: height / 2, blocking: true, walkable: false });
    return mesh;
  }
  prop(mesh, hp, radius, subtype = 'candy', jellyStrength = .55) {
    const entity = { id: crypto.randomUUID(), type: 'prop', subtype, group: mesh, hp, maxHp: hp, radius, dead: false, jellyStrength };
    mesh.traverse(object => { if (object.isMesh) object.userData.entity = entity; });
    this.world.destructibles.push(entity);
    return entity;
  }

  // ── roads, spirals and rainbow bridges ────────────────────────────────────
  // One primitive builds all of them. Give it a list of {x, z, y} nodes and it
  // lays a continuous ribbon: level runs become slabs, climbing runs become
  // ramps, and every joint gets a landing pad wide enough to cover the wedge a
  // chain of straight segments leaves on the outside of a turn.
  //
  // `elevated` decides whether the deck is offered to a body walking beneath
  // it. A rainbow bridge is elevated; a kerb-height candy road laid on a cake
  // tier is not, because you are meant to step on and off it anywhere.
  road(nodes, options = {}) {
    const { width = 7, texture = 'sprinkle_icing', elevated = true, rails = true, pylons = true,
      railTexture = 'licorice', railMaterial = null, deckMaterial = null, thickness = .5, landings = true } = options;
    const decks = [];
    for (const node of nodes) this._roadKeepOut.push({ x: node.x, z: node.z, r: width * .75 });
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i], b = nodes[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z, run = Math.hypot(dx, dz);
      if (run < .5) continue;
      const yaw = Math.atan2(dx, dz), cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2;
      if (Math.abs(b.y - a.y) < .06) {
        const deck = this.slab(cx, cz, (a.y + b.y) / 2 - thickness, width, run + .6, thickness, texture, {
          repeat: Math.max(2, Math.round(run / 7)), rotation: yaw, material: deckMaterial,
        });
        this.standOn(deck, width, run + .6, thickness, { elevated, navIgnore: elevated, navBlock: false });
        decks.push(deck);
      } else {
        // The ramp's own origin is its low end, so it is placed there rather
        // than at the segment's midpoint.
        const low = a.y < b.y ? a : b, high = a.y < b.y ? b : a;
        const rampYaw = Math.atan2(high.x - low.x, high.z - low.z);
        this.ramp(cx, cz, rampYaw, low.y, high.y, run + .6, width, texture, {
          repeat: Math.max(2, Math.round(run / 7)), material: deckMaterial, elevated, navBlock: elevated,
        });
      }
      if (landings) {
        const pad = this.slab(b.x, b.z, b.y - thickness, width * 1.12, width * 1.12, thickness, texture, {
          repeat: 2, rotation: yaw, material: deckMaterial,
        });
        this.standOn(pad, width * 1.12, width * 1.12, thickness, { elevated, navIgnore: elevated });
      }
      if (rails) {
        const offset = width / 2 - .18, cos = Math.cos(yaw), sin = Math.sin(yaw);
        for (const side of [-1, 1]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(.3, RAIL, run + .6), railMaterial || this.mat(railTexture, 1));
          rail.position.set(cx + side * offset * cos, (a.y + b.y) / 2 + RAIL / 2, cz - side * offset * sin);
          rail.rotation.y = yaw; rail.castShadow = false; this.scene.add(rail);
          this.world.registerCollider(rail, { shape: 'box', halfX: .15, halfZ: (run + .6) / 2, top: RAIL / 2, bottom: -RAIL / 2, blocking: true, walkable: false, navIgnore: true });
        }
      }
      if (pylons) {
        const under = this.ground(b.x, b.z);
        if (b.y - under > 2.4) {
          this.pillar(b.x, b.z, under - .6, .82, b.y - under - thickness + .6, 'candy_cane', { blocking: false, taper: 1.22, sides: 8 });
          // A peppermint disc capping each pylon, so the underside of a
          // rainbow bridge is as decorated as the top of it.
          const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, .34, 14), this.mat('peppermint', 1));
          cap.position.set(b.x, b.y - thickness - .2, b.z); cap.castShadow = false; this.scene.add(cap);
        }
      }
    }
    return decks;
  }

  // A flight of one-metre wafer treads. Nothing here is a ramp: every riser is
  // under World.STEP_UP, which is what lets the AI walk it without the 2-D
  // planner ever having to know the cake has floors.
  stairs(x, z, yaw, fromY, toY, width = STAIR_WIDTH, options = {}) {
    const rise = toY - fromY;
    if (rise <= 0) return null;
    const count = Math.max(2, Math.round(rise / STEP_RISE));
    const step = rise / count, depth = options.depth ?? 1.7;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const textures = options.textures || ['wafer', 'white_chocolate'];
    // `lead` shifts the whole flight along its own bearing. A staircase set
    // across a cliff cannot work: the terrain rises faster inside the cliff
    // band than any tread can, so the ground wins and the climb breaks. The
    // flight therefore stands entirely on the low side, with only its top tread
    // or two reaching over the lip — which is how a real staircase leans on a
    // wall rather than being buried in it.
    const lead = options.lead ?? 0;
    for (let k = 0; k < count; k++) {
      // Local +Z climbs, so tread k sits k treads along the bearing.
      const along = (k - (count - 1) / 2) * depth + lead;
      const px = x + sin * along, pz = z + cos * along;
      const top = fromY + step * (k + 1);
      const base = Math.min(top - .45, this.ground(px, pz) - 1.2);
      const tread = this.slab(px, pz, base, width, depth + .05, top - base, textures[k % textures.length], { repeat: 2, rotation: yaw });
      // Elevated: a tread is only offered to a body already at its level. A
      // flight leaning on a cake wall reaches a long way out over the tier
      // below, and without this any road or unit passing beneath its upper
      // treads would be snapped five metres into the air.
      this.standOn(tread, width, depth + .05, top - base, { elevated: true });
    }
    // Piped-icing balustrades so the flight reads as a stair from a distance.
    for (const side of [-1, 1]) {
      const bx = x + cos * side * (width / 2 + .35) + sin * lead, bz = z - sin * side * (width / 2 + .35) + cos * lead;
      const length = count * depth;
      const rail = this.ramp(bx, bz, yaw, fromY + .9, toY + .9, length, .5, 'frosting', { repeat: 2, thickness: 1.1, collider: false });
      rail.castShadow = false;
    }
    return { count, top: toY, depth: count * depth };
  }

  // Record a hole the cake wall has to leave open. `half` is the angular
  // half-width of the physical opening measured at the wall's own radius.
  openWall(tierIndex, bearing, half) {
    const list = this.wallGaps.get(tierIndex) || [];
    list.push({ bearing: ((bearing % TAU) + TAU) % TAU, half });
    this.wallGaps.set(tierIndex, list);
  }
  // Shortest angular distance, written the boring way on purpose. The clever
  // modulo one-liner this replaces resolved to the *opposite* bearing, which
  // opens every door on the far side of the mountain from the road that asked
  // for it — a failure that is invisible until you walk into a wall where the
  // map plainly shows a gateway.
  wallGapped(tierIndex, bearing, margin = 0) {
    const gaps = this.wallGaps.get(tierIndex);
    if (!gaps) return false;
    const normalized = ((bearing % TAU) + TAU) % TAU;
    return gaps.some(gap => {
      let delta = Math.abs(normalized - gap.bearing) % TAU;
      if (delta > Math.PI) delta = TAU - delta;
      return delta < gap.half + margin;
    });
  }

  // ── species: the candy trees ──────────────────────────────────────────────
  // Every tree is merged into one mesh with a handful of material groups. A
  // candyland needs hundreds of them; two or three draw calls each instead of
  // ten is the difference between a forest and a slideshow.
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
  plant(x, z, pieces, materials, { hp, radius, subtype, blocking = true, collider = 'cylinder', halfX = radius, halfZ = radius, top = 2, jellyStrength = .55 }) {
    const mesh = this.mergedMesh(pieces, materials);
    if (!mesh) return null;
    mesh.position.set(x, this.ground(x, z), z);
    mesh.castShadow = mesh.receiveShadow = true;
    this.scene.add(mesh);
    const entity = this.prop(mesh, hp, radius, subtype, jellyStrength);
    if (blocking) this.world.registerCollider(mesh, collider === 'cylinder'
      ? { shape: 'cylinder', radius, top, blocking: true, walkable: false }
      : { shape: 'box', halfX, halfZ, top, blocking: true, walkable: false }, entity);
    return { mesh, entity };
  }

  // The signature tree: a striped stick under a disc the size of a wagon wheel,
  // which turns on its stick all match long.
  lollipopTree(x, z, scale = 1) {
    const height = (7 + this.random() * 5) * scale, head = (2.6 + this.random() * 1.8) * scale;
    const stickMaterial = this.random() < .5 ? this.palette.stick : this.palette.caneStick;
    const pieces = [this.piece(new THREE.CylinderGeometry(.3 * scale, .34 * scale, height, 7), 0, [0, height / 2, 0])];
    const mesh = this.mergedMesh(pieces, [stickMaterial]);
    mesh.position.set(x, this.ground(x, z), z);
    mesh.castShadow = mesh.receiveShadow = true;
    this.scene.add(mesh);
    const index = Math.floor(this.random() * CANDY_COLORS.length);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(head, head, .55 * scale, 20),
      this.mat('lollipop_swirl', 1, { color: CANDY_COLORS[index] }));
    disc.rotation.x = Math.PI / 2;
    disc.position.y = height + head * .55;
    disc.castShadow = true;
    mesh.add(disc);
    const entity = this.prop(mesh, 120, 1.1 * scale, 'lollipop');
    this.world.registerCollider(mesh, { shape: 'cylinder', radius: .8 * scale, top: height, blocking: true, walkable: false }, entity);
    this.animated.spinners.push({ mesh: disc, axis: 'y', rate: (this.random() < .5 ? -1 : 1) * (.5 + this.random() * .9), entity });
    return entity;
  }
  // Stacked gumdrops on a licorice trunk, each one a different flavour.
  gumdropTree(x, z, scale = 1) {
    const pieces = [], height = (5.5 + this.random() * 3) * scale;
    pieces.push(this.piece(new THREE.CylinderGeometry(.42 * scale, .58 * scale, height, 7), 0, [0, height / 2, 0]));
    const blobs = 3 + Math.floor(this.random() * 3);
    for (let i = 0; i < blobs; i++) {
      const radius = (1.9 - i * .28 + this.random() * .5) * scale;
      const sphere = new THREE.SphereGeometry(radius, 10, 8, 0, TAU, 0, Math.PI * .62);
      pieces.push(this.piece(sphere, 1 + (i % 3), [
        (this.random() - .5) * 1.4 * scale, height - .4 + i * radius * 1.05, (this.random() - .5) * 1.4 * scale,
      ], null, { x: 1, y: 1.25, z: 1 }));
    }
    const flavours = [0, 1, 2].map(offset => this.mat('gumdrop', 1, { color: CANDY_COLORS[(Math.floor(this.random() * 8) + offset) % 8] }));
    return this.plant(x, z, pieces, [this.palette.licorice, ...flavours],
      { hp: 150, radius: 1.5 * scale, subtype: 'gumdrop-tree', top: height * .8 });
  }
  // A candy cane the size of a lamppost, hook and all.
  candyCaneTree(x, z, scale = 1) {
    const pieces = [], height = (8 + this.random() * 6) * scale, radius = .46 * scale;
    pieces.push(this.piece(new THREE.CylinderGeometry(radius, radius * 1.15, height, 8), 0, [0, height / 2, 0]));
    const hook = new THREE.TorusGeometry(1.7 * scale, radius, 6, 14, Math.PI * 1.15);
    pieces.push(this.piece(hook, 0, [1.7 * scale, height, 0], { y: Math.PI / 2, z: -Math.PI / 2 }));
    return this.plant(x, z, pieces, [this.mat('candy_cane', 2)],
      { hp: 165, radius: .9 * scale, subtype: 'cane-tree', top: height });
  }
  // Cotton candy: a paper stick under three clouds of spun floss that breathe.
  cottonCandyTree(x, z, scale = 1) {
    const height = (4.5 + this.random() * 3.5) * scale;
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(.24 * scale, .3 * scale, height, 6), this.palette.stick);
    const group = new THREE.Group();
    group.position.set(x, this.ground(x, z), z);
    stick.position.y = height / 2; stick.castShadow = true; group.add(stick);
    const flossMaterials = [this.palette.floss, this.palette.flossPale, this.palette.flossBlue];
    const puffs = [];
    const clouds = 3 + Math.floor(this.random() * 3);
    for (let i = 0; i < clouds; i++) {
      const radius = (1.9 + this.random() * 1.5) * scale;
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 1), flossMaterials[Math.floor(this.random() * 3)]);
      puff.position.set((this.random() - .5) * 2.6 * scale, height + (this.random() - .2) * 1.8 * scale, (this.random() - .5) * 2.6 * scale);
      puff.scale.set(1.25, .85, 1.25);
      puff.castShadow = true;
      group.add(puff);
      puffs.push({ mesh: puff, base: puff.position.y, phase: this.random() * TAU, drift: .6 + this.random() * .8 });
    }
    this.scene.add(group);
    const entity = this.prop(group, 95, 2 * scale, 'cotton-candy', .8);
    this.world.registerCollider(group, { shape: 'cylinder', radius: .9 * scale, top: height, blocking: true, walkable: false }, entity);
    this.animated.bobbers.push({ parts: puffs, entity });
    return entity;
  }
  // A cocoa trunk carrying slabs of chocolate instead of leaves.
  chocolateTree(x, z, scale = 1) {
    const pieces = [], height = (6.5 + this.random() * 4) * scale;
    pieces.push(this.piece(new THREE.CylinderGeometry(.5 * scale, .78 * scale, height, 7), 0, [0, height / 2, 0]));
    const bars = 4 + Math.floor(this.random() * 4);
    for (let i = 0; i < bars; i++) {
      const angle = i / bars * TAU + this.random() * .6, reach = (1.5 + this.random() * 1.8) * scale;
      pieces.push(this.piece(new THREE.BoxGeometry(3.2 * scale, .5 * scale, 2.1 * scale), 1 + (i % 2), [
        Math.cos(angle) * reach, height + this.random() * 2.4 * scale - .6, Math.sin(angle) * reach,
      ], { y: angle, z: (this.random() - .5) * .5 }));
    }
    return this.plant(x, z, pieces, [this.mat('chocolate', 2), this.mat('chocolate', 1), this.mat('white_chocolate', 1)],
      { hp: 190, radius: 1.6 * scale, subtype: 'chocolate-tree', top: height * .85 });
  }
  // An upturned waffle cone with scoops stacked on it and a cherry on top.
  iceCreamTree(x, z, scale = 1) {
    const pieces = [], height = (5 + this.random() * 3) * scale;
    pieces.push(this.piece(new THREE.ConeGeometry(1.5 * scale, height, 9), 0, [0, height / 2, 0], { x: Math.PI }));
    const scoops = 2 + Math.floor(this.random() * 3);
    const scoopSlots = [1, 2, 3];
    for (let i = 0; i < scoops; i++) {
      const radius = (1.7 - i * .17) * scale;
      pieces.push(this.piece(new THREE.IcosahedronGeometry(radius, 1), scoopSlots[i % 3], [
        (this.random() - .5) * .7 * scale, height + radius * (.55 + i * 1.15), (this.random() - .5) * .7 * scale,
      ], null, { x: 1.12, y: .95, z: 1.12 }));
    }
    pieces.push(this.piece(new THREE.SphereGeometry(.55 * scale, 8, 6), 4, [0, height + 1.1 * scale * scoops + .5, 0]));
    return this.plant(x, z, pieces, [
      this.palette.cone,
      this.tint(0xfff0d2, { roughness: .75 }),
      this.tint(0xffb4d8, { roughness: .75 }),
      this.tint(0xb6ecff, { roughness: .75 }),
      this.palette.cherry,
    ], { hp: 130, radius: 1.7 * scale, subtype: 'ice-cream-tree', top: height });
  }
  // A black twist of licorice with a shock of red laces at the crown.
  licoriceTree(x, z, scale = 1) {
    const pieces = [], height = (7 + this.random() * 4) * scale;
    const twists = 5;
    for (let i = 0; i < twists; i++) {
      const t = i / twists;
      pieces.push(this.piece(new THREE.CylinderGeometry(.4 * scale, .4 * scale, height / twists + .3, 6), 0, [
        Math.cos(t * 7) * .55 * scale, height * t + height / twists / 2, Math.sin(t * 7) * .55 * scale,
      ], { z: (this.random() - .5) * .3 }));
    }
    for (let i = 0; i < 7; i++) {
      const angle = i / 7 * TAU;
      pieces.push(this.piece(new THREE.CylinderGeometry(.16 * scale, .12 * scale, 2.6 * scale, 5), 1, [
        Math.cos(angle) * 1.3 * scale, height + 1.1 * scale, Math.sin(angle) * 1.3 * scale,
      ], { x: .7, y: -angle }));
    }
    return this.plant(x, z, pieces, [this.palette.licorice, this.tint(0xd8123c, { roughness: .55 })],
      { hp: 145, radius: 1.1 * scale, subtype: 'licorice-tree', top: height });
  }
  // A donut on a stick — the silliest tree on the map, and the one people
  // shoot through for the hole.
  donutTree(x, z, scale = 1) {
    const pieces = [], height = (5 + this.random() * 3.5) * scale, ring = (2.3 + this.random() * .9) * scale;
    pieces.push(this.piece(new THREE.CylinderGeometry(.3 * scale, .36 * scale, height, 6), 0, [0, height / 2, 0]));
    pieces.push(this.piece(new THREE.TorusGeometry(ring, ring * .42, 8, 18), 1, [0, height + ring * .5, 0], { x: Math.PI / 2 }));
    for (let i = 0; i < 12; i++) {
      const angle = this.random() * TAU, reach = ring + (this.random() - .5) * ring * .5;
      pieces.push(this.piece(new THREE.BoxGeometry(.5 * scale, .16 * scale, .16 * scale), 2, [
        Math.cos(angle) * reach, height + ring * .5 + ring * .38, Math.sin(angle) * reach,
      ], { y: this.random() * TAU }));
    }
    return this.plant(x, z, pieces, [
      this.palette.stick,
      this.mat('frosting', 1, { color: CANDY_COLORS[Math.floor(this.random() * CANDY_COLORS.length)] }),
      this.tint(0xfff6c4, { roughness: .6 }),
    ], { hp: 110, radius: 1.4 * scale, subtype: 'donut-tree', top: height });
  }
  // A giant cupcake: wrapper, dome of frosting, cherry. Cover you can hide
  // behind and, eventually, eat.
  cupcake(x, z, scale = 1) {
    const pieces = [], base = 3.4 * scale;
    pieces.push(this.piece(new THREE.CylinderGeometry(base, base * .72, 3 * scale, 16), 0, [0, 1.5 * scale, 0]));
    pieces.push(this.piece(new THREE.SphereGeometry(base * 1.05, 14, 10, 0, TAU, 0, Math.PI * .55), 1, [0, 3 * scale, 0], null, { x: 1, y: .9, z: 1 }));
    pieces.push(this.piece(new THREE.SphereGeometry(base * .68, 12, 8, 0, TAU, 0, Math.PI * .6), 1, [0, 4.3 * scale, 0], null, { x: 1, y: .9, z: 1 }));
    pieces.push(this.piece(new THREE.SphereGeometry(.6 * scale, 8, 6), 2, [0, 5.5 * scale, 0]));
    return this.plant(x, z, pieces, [
      this.mat('wafer', 2), this.mat('frosting', 2, { color: CANDY_COLORS[Math.floor(this.random() * CANDY_COLORS.length)] }), this.palette.cherry,
    ], { hp: 320, radius: base, subtype: 'cupcake', top: 4.4 * scale, jellyStrength: .45 });
  }
  // A tower of macarons, leaning slightly, as they do.
  macaronStack(x, z, scale = 1) {
    const pieces = [], count = 4 + Math.floor(this.random() * 4);
    for (let i = 0; i < count; i++) {
      const radius = (2.2 - i * .12) * scale, lean = (this.random() - .5) * .5 * scale;
      pieces.push(this.piece(new THREE.CylinderGeometry(radius, radius, .78 * scale, 16), i % 3, [lean, i * 1.15 * scale + .4, lean * .6]));
      pieces.push(this.piece(new THREE.CylinderGeometry(radius * .92, radius * .92, .34 * scale, 16), 3, [lean, i * 1.15 * scale + .95, lean * .6]));
    }
    return this.plant(x, z, pieces, [
      this.tint(0xffc7dd, { roughness: .8 }), this.tint(0xd6f0a8, { roughness: .8 }), this.tint(0xffe3a8, { roughness: .8 }), this.palette.cream,
    ], { hp: 210, radius: 2.3 * scale, subtype: 'macaron-stack', top: count * 1.15 * scale });
  }
  // Rock candy: crystallised sugar shards, the map's boulders.
  rockCandy(x, z, scale = 1) {
    const pieces = [], shards = 3 + Math.floor(this.random() * 4);
    for (let i = 0; i < shards; i++) {
      const angle = i / shards * TAU + this.random(), reach = this.random() * 1.5 * scale;
      pieces.push(this.piece(new THREE.ConeGeometry((.55 + this.random() * .5) * scale, (2.2 + this.random() * 2.6) * scale, 5), i % 3, [
        Math.cos(angle) * reach, (1.1 + this.random() * 1.2) * scale, Math.sin(angle) * reach,
      ], { x: (this.random() - .5) * .5, z: (this.random() - .5) * .5 }));
    }
    const flavour = Math.floor(this.random() * CANDY_COLORS.length);
    return this.plant(x, z, pieces, [
      this.mat('stone', 1, { color: CANDY_COLORS[flavour] }),
      this.mat('stone', 1, { color: CANDY_COLORS[(flavour + 3) % CANDY_COLORS.length] }),
      this.tint(0xfff4fb, { roughness: .35 }),
    ], { hp: 230, radius: 1.5 * scale, subtype: 'rock-candy', top: 2.4 * scale, jellyStrength: .3 });
  }

  // ── the two reactive species ──────────────────────────────────────────────
  // GIANT GUMBALL. Shoot it and it rolls: the hit direction becomes velocity,
  // the terrain gradient pulls it downhill, and its collider travels with it,
  // so a gumball coming down a cake tier physically shoves whatever is in the
  // way. `motionPad` is what makes that affordable — the broadphase indexes it
  // over its whole possible travel once, at build time, instead of the world
  // rebuilding its collider index every frame something is in motion.
  gumball(x, z, radius = 2.6, options = {}) {
    const index = options.color ?? Math.floor(this.random() * CANDY_COLORS.length);
    const base = this.ground(x, z);
    const group = new THREE.Group();
    group.position.set(x, base + radius, z);
    const shell = new THREE.Mesh(new THREE.SphereGeometry(radius, 18, 14),
      this.ownColor(CANDY_COLORS[index], { roughness: .28, metalness: .05, emissive: CANDY_DARKS[index], emissiveIntensity: .18 }));
    shell.castShadow = shell.receiveShadow = true;
    group.add(shell);
    // A gloss highlight that keeps facing up however far the ball has rolled.
    const gloss = new THREE.Mesh(new THREE.SphereGeometry(radius * .3, 8, 6),
      this.tint(0xffffff, { transparent: true, opacity: .45, roughness: .05 }));
    gloss.position.set(-radius * .42, radius * .55, radius * .42);
    group.add(gloss);
    this.scene.add(group);
    const entity = this.prop(group, 260 + radius * 40, radius, 'gumball', .22);
    const rollLimit = options.rollLimit ?? 30;
    this.world.registerCollider(group, {
      shape: 'cylinder', radius: radius * .95, top: radius, blocking: true, walkable: false, motionPad: rollLimit,
    }, entity);
    const roller = {
      entity, group, shell, gloss, radius, rollLimit,
      home: new THREE.Vector2(x, z),
      velocity: new THREE.Vector3(),
      spin: new THREE.Vector3(0, 1, 0),
      phase: this.random() * TAU,
      colorIndex: index,
    };
    // The reaction itself. Damage is converted to a shove, so a rocket sends a
    // gumball further than a pistol round does.
    entity.onHit = (amount, source, direction) => {
      if (entity.dead) return;
      const push = Math.min(26, 4 + amount * .5) * (radius > 3 ? 2.6 / radius : 1);
      if (direction && Number.isFinite(direction.x)) {
        const flat = new THREE.Vector3(direction.x, 0, direction.z);
        if (flat.lengthSq() > 1e-6) roller.velocity.addScaledVector(flat.normalize(), push);
      } else {
        roller.velocity.x += (this.random() - .5) * push;
        roller.velocity.z += (this.random() - .5) * push;
      }
    };
    this.animated.gumballs.push(roller);
    return entity;
  }
  // COLOUR-CHANGING CANDY. Every hit advances it one step round the candy
  // palette and lights it up, so a firefight in a sweet shop is visibly a
  // firefight in a sweet shop. Its material is its own, never a cached one, or
  // a single hit would repaint every candy on the map.
  reactiveCandy(x, z, kind, scale = 1) {
    const index = Math.floor(this.random() * CANDY_COLORS.length);
    const material = this.ownColor(CANDY_COLORS[index], { roughness: .22, metalness: .08, emissive: CANDY_DARKS[index], emissiveIntensity: .25 });
    const wrapper = this.tint(0xfff6fb, { roughness: .5, transparent: true, opacity: .85 });
    const group = new THREE.Group();
    group.position.set(x, this.ground(x, z), z);
    let radius = 1.2 * scale, top = 1.6 * scale, hp = 90;
    if (kind === 'wrapped') {
      // A boiled sweet: a fat disc with a twist of cellophane at each end.
      const body = new THREE.Mesh(new THREE.SphereGeometry(1.5 * scale, 14, 10), material);
      body.scale.set(1, .78, 1); body.position.y = 1.3 * scale; body.castShadow = true; group.add(body);
      for (const side of [-1, 1]) {
        const twist = new THREE.Mesh(new THREE.ConeGeometry(.95 * scale, 1.5 * scale, 7), wrapper);
        twist.rotation.z = side * Math.PI / 2; twist.position.set(side * 2.1 * scale, 1.3 * scale, 0); group.add(twist);
      }
      radius = 1.6 * scale; top = 2.2 * scale; hp = 110;
    } else if (kind === 'bean') {
      const body = new THREE.Mesh(new THREE.SphereGeometry(1.3 * scale, 12, 9), material);
      body.scale.set(1.5, .9, .95); body.position.y = 1.15 * scale; body.castShadow = true; group.add(body);
      radius = 1.7 * scale; top = 2 * scale; hp = 85;
    } else if (kind === 'bear') {
      // A gummy bear: a body, a head, four stubs and two dots for eyes.
      const body = new THREE.Mesh(new THREE.SphereGeometry(1.35 * scale, 12, 9), material);
      body.scale.set(1, 1.25, .85); body.position.y = 1.7 * scale; body.castShadow = true; group.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(.95 * scale, 12, 9), material);
      head.position.y = 3.4 * scale; group.add(head);
      for (const side of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.SphereGeometry(.34 * scale, 8, 6), material);
        ear.position.set(side * .72 * scale, 4 * scale, 0); group.add(ear);
        const arm = new THREE.Mesh(new THREE.SphereGeometry(.5 * scale, 8, 6), material);
        arm.position.set(side * 1.35 * scale, 2.2 * scale, 0); group.add(arm);
        const leg = new THREE.Mesh(new THREE.SphereGeometry(.55 * scale, 8, 6), material);
        leg.position.set(side * .72 * scale, .6 * scale, 0); group.add(leg);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(.14 * scale, 6, 5), this.tint(0x2a1420));
        eye.position.set(side * .34 * scale, 3.55 * scale, .8 * scale); group.add(eye);
      }
      radius = 1.5 * scale; top = 4.2 * scale; hp = 140;
    } else {
      // A conical gumdrop, sugar-crusted.
      const body = new THREE.Mesh(new THREE.SphereGeometry(1.6 * scale, 14, 10, 0, TAU, 0, Math.PI * .62), material);
      body.scale.set(1, 1.35, 1); body.position.y = .1; body.castShadow = true; group.add(body);
      radius = 1.6 * scale; top = 2.1 * scale; hp = 100;
    }
    this.scene.add(group);
    const entity = this.prop(group, hp, radius, `candy-${kind}`, .85);
    this.world.registerCollider(group, { shape: 'cylinder', radius: radius * .82, top, blocking: true, walkable: false }, entity);
    const reactor = { entity, material, index, flash: 0, group, phase: this.random() * TAU };
    entity.onHit = () => {
      if (entity.dead) return;
      reactor.index = (reactor.index + 1) % CANDY_COLORS.length;
      material.color.setHex(CANDY_COLORS[reactor.index]);
      material.emissive.setHex(CANDY_DARKS[reactor.index]);
      reactor.flash = 1;
    };
    this.animated.candies.push(reactor);
    return entity;
  }

  // ── batched ground cover ──────────────────────────────────────────────────
  // None of this is destructible, none of it collides and all of it is merged
  // into one mesh per material, so the ground can be knee-deep in confectionery
  // for the cost of a handful of draw calls.
  sprinkles(x, z, spread = 3, count = 10) {
    for (let i = 0; i < count; i++) {
      const angle = this.random() * TAU, reach = this.random() * spread;
      const px = x + Math.cos(angle) * reach, pz = z + Math.sin(angle) * reach;
      const geometry = new THREE.BoxGeometry(.6, .16, .16);
      geometry.rotateY(this.random() * TAU);
      geometry.translate(px, this.ground(px, pz) + .1, pz);
      this.batch(geometry, this.tint(CANDY_COLORS[Math.floor(this.random() * CANDY_COLORS.length)], { roughness: .5 }));
    }
  }
  sugarTuft(x, z, scale = 1) {
    const material = this.tint([0x8ff0c6, 0xa8f5b4, 0x7fe0b8][Math.floor(this.random() * 3)], { roughness: .95 });
    const base = this.ground(x, z);
    for (let i = 0; i < 5; i++) {
      const angle = this.random() * TAU, lean = .28 + this.random() * .3;
      const blade = new THREE.ConeGeometry(.14 * scale, (1.1 + this.random() * .8) * scale, 4);
      blade.rotateZ(Math.cos(angle) * lean); blade.rotateX(Math.sin(angle) * lean);
      blade.translate(x + Math.cos(angle) * .35, base + .55 * scale, z + Math.sin(angle) * .35);
      this.batch(blade, material);
    }
  }
  miniGumdrops(x, z, spread = 2.5, count = 6) {
    for (let i = 0; i < count; i++) {
      const angle = this.random() * TAU, reach = this.random() * spread;
      const px = x + Math.cos(angle) * reach, pz = z + Math.sin(angle) * reach, radius = .3 + this.random() * .4;
      const geometry = new THREE.SphereGeometry(radius, 7, 5, 0, TAU, 0, Math.PI * .6);
      geometry.scale(1, 1.3, 1);
      geometry.translate(px, this.ground(px, pz), pz);
      this.batch(geometry, this.tint(CANDY_COLORS[Math.floor(this.random() * CANDY_COLORS.length)], { roughness: .35 }));
    }
  }
  marshmallowPuffs(x, z, spread = 3, count = 5) {
    const material = this.tint(this.random() < .5 ? 0xfff6f8 : 0xffd6e4, { roughness: .95 });
    for (let i = 0; i < count; i++) {
      const angle = this.random() * TAU, reach = this.random() * spread;
      const px = x + Math.cos(angle) * reach, pz = z + Math.sin(angle) * reach, radius = .55 + this.random() * .8;
      const geometry = new THREE.CylinderGeometry(radius, radius, radius * 1.25, 9);
      geometry.translate(px, this.ground(px, pz) + radius * .6, pz);
      this.batch(geometry, material);
    }
  }
  licoriceReeds(x, z, count = 8) {
    const material = this.mat('licorice', 1);
    const base = this.ground(x, z);
    for (let i = 0; i < count; i++) {
      const angle = this.random() * TAU, reach = this.random() * 1.9, height = 1.4 + this.random() * 2.2;
      const reed = new THREE.CylinderGeometry(.1, .13, height, 4);
      reed.rotateZ((this.random() - .5) * .45);
      reed.translate(x + Math.cos(angle) * reach, base + height / 2, z + Math.sin(angle) * reach);
      this.batch(reed, material);
    }
  }
  sugarCrystals(x, z, spread = 2.4, count = 7) {
    const material = this.tint(0xfff2fb, { roughness: .2, metalness: .05 });
    for (let i = 0; i < count; i++) {
      const angle = this.random() * TAU, reach = this.random() * spread;
      const px = x + Math.cos(angle) * reach, pz = z + Math.sin(angle) * reach, size = .22 + this.random() * .35;
      const shard = new THREE.OctahedronGeometry(size, 0);
      shard.rotateY(this.random() * TAU);
      shard.translate(px, this.ground(px, pz) + size * .7, pz);
      this.batch(shard, material);
    }
  }
  wrapperLitter(x, z, spread = 3, count = 4) {
    for (let i = 0; i < count; i++) {
      const angle = this.random() * TAU, reach = this.random() * spread;
      const px = x + Math.cos(angle) * reach, pz = z + Math.sin(angle) * reach;
      const geometry = new THREE.PlaneGeometry(.7 + this.random() * .6, .5 + this.random() * .4);
      geometry.rotateX(-Math.PI / 2 + (this.random() - .5) * .4);
      geometry.rotateY(this.random() * TAU);
      geometry.translate(px, this.ground(px, pz) + .06, pz);
      this.batch(geometry, this.tint(CANDY_COLORS[Math.floor(this.random() * CANDY_COLORS.length)], { roughness: .3, metalness: .4, side: THREE.DoubleSide }));
    }
  }

  // ── syrup ─────────────────────────────────────────────────────────────────
  // Chocolate and fizzy soda are drawn the same way the rainforest draws its
  // water: a flat sheet laid down by *rotating the mesh*, never by baking the
  // rotation into the geometry, so a scrolling map still scrolls along the
  // surface instead of shoving it sideways.
  layFlat(mesh) { mesh.rotation.x = -Math.PI / 2; mesh.renderOrder = 1; this.scene.add(mesh); return mesh; }
  syrupMaterial(texture, color, options = {}) {
    const source = this.world.materials.textures?.[texture] || this.world.materials.textures?.water;
    const map = source?.clone?.() || null;
    if (map) {
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(options.repeat ?? 8, options.repeat ?? 8);
      map.needsUpdate = true;
      this.world.materials.ownedTextures?.push(map);
    }
    const material = new THREE.MeshStandardMaterial({
      map, color, roughness: options.roughness ?? .18, metalness: options.metalness ?? .12,
      transparent: true, opacity: options.opacity ?? .93, depthWrite: false,
      emissive: options.emissive ?? 0x000000, emissiveIntensity: options.emissiveIntensity ?? 0,
    });
    this.world.materials.dynamicMaterials?.push(material);
    if (map) this.animated.sheets.push({ map, speed: options.speed ?? .04, sway: options.sway ?? .01 });
    return material;
  }
  syrupDisc(cx, cz, radius, material, segments = 48) {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, segments), material);
    mesh.position.set(cx, SYRUP_Y, cz);
    return this.layFlat(mesh);
  }
  // A ribbon of syrup following the authored channel. It runs past both ends of
  // the polyline: upstream it hides under the plunge pool, downstream under the
  // lake. Stopping exactly on the last control point leaves a rectangular
  // end-cap of chocolate sitting on the bank, which is the single most obvious
  // tell that a river is a decal.
  syrupRibbon(source, halfWidth, material) {
    const extend = (from, toward, distance) => {
      const dx = from[0] - toward[0], dz = from[1] - toward[1], length = Math.hypot(dx, dz) || 1;
      return [from[0] + dx / length * distance, from[1] + dz / length * distance];
    };
    const path = [extend(source[0], source[1], 14), ...source, extend(source[source.length - 1], source[source.length - 2], 14)];
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
        // local (x, y, 0); the mesh's -90 degree X rotation maps it to world (x, 0, -y).
        positions.push(centres[i][0] + rx * halfWidth * side, -(centres[i][1] + rz * halfWidth * side), 0);
        uvs.push(side < 0 ? 0 : 1, i / (centres.length - 1));
      }
    }
    for (let i = 0; i < centres.length - 1; i++) { const a = i * 2, b = a + 2; indices.push(b + 1, b, a, a + 1, b + 1, a); }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = SYRUP_Y;
    return this.layFlat(mesh);
  }
  // A falling sheet of chocolate: three scrolling planes at slightly different
  // speeds, so the fall has depth instead of reading as one sliding decal.
  curtain(x, z, yaw, top, bottom, width, options = {}) {
    const height = Math.max(1, top - bottom);
    const colors = options.colors || [0x8a4a24, 0x6f3818, 0xc98d54];
    for (let layer = 0; layer < 3; layer++) {
      const source = this.world.materials.textures?.[options.texture || 'chocolate'] || this.world.materials.textures?.water;
      const map = source?.clone?.() || null;
      if (map) {
        map.wrapS = map.wrapT = THREE.RepeatWrapping;
        map.repeat.set(1 + layer * .4, Math.max(2, height / 6));
        map.needsUpdate = true;
        this.world.materials.ownedTextures?.push(map);
      }
      const material = new THREE.MeshStandardMaterial({
        map, color: colors[layer], roughness: .2, metalness: .12, transparent: true,
        opacity: layer === 2 ? .45 : .92, side: THREE.DoubleSide, depthWrite: false,
      });
      this.world.materials.dynamicMaterials?.push(material);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width * (1 - layer * .12), height, 6, 10), material);
      mesh.position.set(x + Math.sin(yaw) * layer * .5, (top + bottom) / 2, z + Math.cos(yaw) * layer * .5);
      mesh.rotation.y = yaw;
      mesh.renderOrder = 2 + layer;
      this.scene.add(mesh);
      if (map) this.animated.sheets.push({ map, speed: (options.speed ?? 1) * (1.5 + layer * .5), sway: 0 });
    }
  }
  // Fizz: bubbles that rise out of the soda and pop at the surface. Kept to a
  // handful of shared-material spheres, because transparent overdraw is the
  // most expensive thing a scene this size can do.
  fizz(cx, cz, radius, count = 14) {
    const material = new THREE.MeshBasicMaterial({ color: 0xfff3d0, transparent: true, opacity: .38, depthWrite: false });
    this.world.materials.dynamicMaterials?.push(material);
    for (let i = 0; i < count; i++) {
      const angle = this.random() * TAU, reach = Math.sqrt(this.random()) * radius, size = .28 + this.random() * .55;
      const bubble = new THREE.Mesh(new THREE.SphereGeometry(size, 7, 5), material);
      bubble.position.set(cx + Math.cos(angle) * reach, SYRUP_Y, cz + Math.sin(angle) * reach);
      bubble.renderOrder = 5;
      this.scene.add(bubble);
      this.animated.bubbles.push({ mesh: bubble, base: SYRUP_Y, rise: 1.4 + this.random() * 2.4, top: 3.5 + this.random() * 3, offset: this.random() * 6 });
    }
  }

  // ── the build ─────────────────────────────────────────────────────────────
  build() {
    this.buildSyrupWays();
    this.buildChocolateFalls();
    this.buildSpiral();          // must run before the walls: it cuts their doors
    this.buildWaferSteps();      // ditto
    this.buildRainbowBridges();  // ditto — its landings need clear parapet
    this.buildCake();
    this.buildSummit();
    this.buildRingRoad();
    this.buildFlosswood();
    this.buildPeppermintMesa();
    this.buildGingerbreadRow();
    this.buildJawbreakerBowl();
    this.buildMarshmallowMire();
    this.buildFizzLake();
    this.plantCandyland();
    this.buildRimLollipops();
    this.flushBatches();
    this.world.candyAnimation = this.animator();
    return this.landmarks;
  }

  // The cocoa run, the plunge pool and the fizz lake, plus everything that
  // lives at the syrup line. Syrup is not a collider: it is waded
  // (World.isWater halves movement) and shots stop on its surface, so a
  // crossing is a real decision rather than a texture.
  buildSyrupWays() {
    const cocoa = this.syrupMaterial('chocolate', 0x8a4a24, { repeat: 10, opacity: .96, speed: .05 });
    this.syrupRibbon(RIVER, RIVER_HALF + 5, cocoa);
    this.syrupDisc(PLUNGE.x, PLUNGE.z, PLUNGE.radius + 6, cocoa, 40);
    const soda = this.syrupMaterial('soda_fizz', 0xffab52, { repeat: 7, opacity: .88, speed: .03, emissive: 0x7a3a00, emissiveIntensity: .25 });
    this.syrupDisc(LAKE.x, LAKE.z, LAKE.radius + 7, soda, 56);
    this.fizz(LAKE.x, LAKE.z, LAKE.radius - 6, 16);
    this.fizz(PLUNGE.x, PLUNGE.z, PLUNGE.radius - 4, 6);
    this.landmarks.push({ kind: 'river', name: 'THE COCOA RUN', x: RIVER[4][0], z: RIVER[4][1], y: SYRUP_Y });

    // Four crossings. Every one is a dry surface above the syrup line, because
    // a crossing you have to wade is not a crossing, it is a kill box.
    const crossings = [
      { t: .1, name: 'THE WAFER PLANKS', kind: 'wafer' },
      { t: .38, name: 'THE LICORICE ARCH', kind: 'arch' },
      { t: .63, name: 'THE CANDY BUTTON BRIDGE', kind: 'buttons' },
      { t: .87, name: 'THE NOUGAT CAUSEWAY', kind: 'nougat' },
    ];
    for (const crossing of crossings) {
      const at = this.pointOnRiver(crossing.t), ahead = this.pointOnRiver(Math.min(.999, crossing.t + .02));
      const along = Math.atan2(ahead.x - at.x, ahead.z - at.z), across = along + Math.PI / 2;
      const deckY = SYRUP_Y + 2.1, span = (RIVER_HALF + 7) * 2;
      if (crossing.kind === 'buttons') {
        // Stepping stones: candy buttons, each its own little island.
        for (let i = -3; i <= 3; i++) {
          const px = at.x + Math.sin(across) * i * 4.6, pz = at.z + Math.cos(across) * i * 4.6;
          const button = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.5, deckY - SYRUP_Y + 2.4, 14),
            this.mat('gumdrop', 1, { color: CANDY_COLORS[(i + 3) % CANDY_COLORS.length] }));
          button.position.set(px, deckY - (deckY - SYRUP_Y + 2.4) / 2, pz);
          button.castShadow = button.receiveShadow = true;
          this.scene.add(button);
          this.world.registerCollider(button, { shape: 'cylinder', radius: 2.3, top: (deckY - SYRUP_Y + 2.4) / 2, blocking: false, walkable: true });
        }
      } else {
        const deck = this.slab(at.x, at.z, deckY - .6, span, 7.5, .6,
          crossing.kind === 'wafer' ? 'wafer' : crossing.kind === 'arch' ? 'licorice' : 'marshmallow',
          { repeat: 4, rotation: across });
        this.standOn(deck, span, 7.5, .6, { elevated: false });
        for (const side of [-1, 1]) {
          this.parapet(at.x + Math.cos(across) * side * 3.5, at.z - Math.sin(across) * side * 3.5, deckY, span, .4,
            'candy_cane', RAIL, { rotation: across });
        }
        for (const i of [-1, 1]) {
          const px = at.x + Math.sin(across) * i * (RIVER_HALF + 2), pz = at.z + Math.cos(across) * i * (RIVER_HALF + 2);
          this.pillar(px, pz, SYRUP_Y - 3, .9, deckY - SYRUP_Y + 2.4, 'candy_cane', { blocking: false, sides: 8 });
        }
        if (crossing.kind === 'arch') {
          const arch = new THREE.Mesh(new THREE.TorusGeometry(span * .46, 1.1, 8, 22, Math.PI), this.mat('licorice', 2));
          arch.position.set(at.x, deckY, at.z); arch.rotation.y = across; arch.castShadow = true;
          this.scene.add(arch);
        }
      }
      this.landmarks.push({ kind: 'crossing', name: crossing.name, x: at.x, z: at.z, y: deckY });
    }
  }
  pointOnRiver(t) {
    const span = (RIVER.length - 1) * Math.min(.9999, Math.max(0, t));
    const index = Math.min(RIVER.length - 2, Math.floor(span)), local = span - index;
    return {
      x: RIVER[index][0] + (RIVER[index + 1][0] - RIVER[index][0]) * local,
      z: RIVER[index][1] + (RIVER[index + 1][1] - RIVER[index][1]) * local,
    };
  }

  // ── the chocolate falls ───────────────────────────────────────────────────
  // The crag pours a fourteen-metre chocolate fall into the plunge pool, and
  // there is a dry ledge behind the sheet with the map's authored red cache on
  // it. Everything is laid out in the crag's own polar frame; placing a
  // waterfall in world XZ is how you end up with one inside the hill.
  buildChocolateFalls() {
    const outward = Math.atan2(PLUNGE.x - CRAG.x, PLUNGE.z - CRAG.z);
    const at = (radius, across) => ({
      x: CRAG.x + Math.sin(outward) * radius + Math.cos(outward) * across,
      z: CRAG.z + Math.cos(outward) * radius - Math.sin(outward) * across,
    });
    const lipY = CRAG.level;
    const FACE = CRAG.core + 1, LEDGE = CRAG.core + 8, VEIL = CRAG.core + 11;
    // The wet face the chocolate runs down. Deliberately deep: the terrain's
    // blend between the crag table and the plunge basin resolves into a jagged
    // wedge at the terrain mesh's quad size, and a shallow facade leaves that
    // wedge poking through the fall.
    for (let i = -3; i <= 3; i++) {
      const point = at(FACE, i * 4.4);
      this.slab(point.x, point.z, SYRUP_Y - 4, 5, 11, lipY - SYRUP_Y + 4.4, 'chocolate', { repeat: 3, rotation: outward });
    }
    const veil = at(VEIL, 0);
    this.curtain(veil.x, veil.z, outward, lipY + .4, SYRUP_Y - .3, 18, { speed: 1 });
    const lip = at(CRAG.core - 1.5, 0);
    const lipSheet = this.slab(lip.x, lip.z, lipY - .22, 16, 9, .35, 'chocolate', {
      repeat: 2, rotation: outward, material: this.tint(0x8a4a24, { roughness: .15, metalness: .18 }),
    });
    lipSheet.renderOrder = 2;
    const brow = at(CRAG.core + 2.4, 0);
    this.curtain(brow.x, brow.z, outward, lipY + .4, lipY - 8, 14, { speed: 1.3 });

    // The dry ledge behind the fall, and the chamber at the end of it.
    const ledgeY = SYRUP_Y + 1.2;
    for (let i = -3; i <= 3; i++) {
      const point = at(LEDGE, i * 4.2);
      const ledge = this.slab(point.x, point.z, ledgeY - 3.2, 4.4, 6.2, 3.2, 'white_chocolate', { repeat: 2, rotation: outward });
      this.standOn(ledge, 4.4, 6.2, 3.2, { elevated: true, navIgnore: true });
    }
    for (let step = 0; step < 2; step++) {
      const point = at(LEDGE + 4 + step * 3.2, -15 - step * 3);
      const shelf = this.slab(point.x, point.z, SYRUP_Y - 1.6, 6, 5, 2 - step * .6, 'wafer', { repeat: 2, rotation: outward });
      this.standOn(shelf, 6, 5, 2 - step * .6, { navIgnore: true });
    }
    const cave = at(LEDGE + 1, 19);
    const floor = this.slab(cave.x, cave.z, ledgeY - 3.2, 13, 11, 3.2, 'white_chocolate', { repeat: 3, rotation: outward });
    this.standOn(floor, 13, 11, 3.2, { elevated: true, navIgnore: true });
    for (const [across, radius, w, d] of [[6.8, 0, 1.6, 11], [0, -5.8, 13, 1.6], [0, 5.8, 13, 1.6]]) {
      const point = at(LEDGE + 1 + radius, 19 + across);
      const wall = this.slab(point.x, point.z, ledgeY, w, d, 6, 'chocolate', { repeat: 2, rotation: outward });
      this.world.registerCollider(wall, { shape: 'box', halfX: w / 2, halfZ: d / 2, top: 3, blocking: true, walkable: false });
    }
    const roof = this.slab(cave.x, cave.z, ledgeY + 6, 14, 12, 1.4, 'chocolate', { repeat: 3, rotation: outward });
    this.standOn(roof, 14, 12, 1.4, { elevated: true, navIgnore: true });
    // Rock candy lighting the chamber, so the cache is findable in the gloom.
    const crystalMat = this.tint(0xff8ad8, { emissive: 0xa8137a, emissiveIntensity: 1.2, roughness: .2 });
    for (let i = 0; i < 7; i++) {
      const angle = this.random() * TAU, reach = 1.5 + this.random() * 3.4;
      const shard = new THREE.Mesh(new THREE.ConeGeometry(.42, 1.8 + this.random() * 1.4, 5), crystalMat);
      shard.position.set(cave.x + Math.cos(angle) * reach, ledgeY + .9, cave.z + Math.sin(angle) * reach);
      shard.rotation.z = (this.random() - .5) * .5;
      this.scene.add(shard);
    }
    const caveLight = new THREE.PointLight(0xff8ad8, 12, 26, 2);
    caveLight.position.set(cave.x, ledgeY + 3, cave.z);
    this.scene.add(caveLight);
    const glow = new THREE.PointLight(0xffd7a8, 24, 52, 2);
    glow.position.set(veil.x, SYRUP_Y + 7, veil.z);
    this.scene.add(glow);
    this.animated.glows.push({ light: glow, base: 20, swing: 7, rate: 1.3 });

    const cachePosition = new THREE.Vector3(cave.x, ledgeY, cave.z);
    this.world.secretPlaces.push({ name: 'BEHIND THE CHOCOLATE FALLS', position: cachePosition.clone(), radius: 11 });
    const crate = this.world.factory?.createCrate?.(cachePosition.clone(), CRATE_TYPES.red);
    if (crate) { crate.noAI = true; crate.sourceDropZoneId = 'candy-falls'; this.world.crates.push(crate); }

    // The crag top: a cocoa vat that reads as the source of the whole river.
    const vat = new THREE.Mesh(new THREE.CylinderGeometry(7, 8, 3.4, 18), this.mat('white_chocolate', 3));
    vat.position.set(CRAG.x, lipY + 1.2, CRAG.z); vat.castShadow = vat.receiveShadow = true;
    this.scene.add(vat);
    this.world.registerCollider(vat, { shape: 'cylinder', radius: 7.4, top: 1.7, blocking: true, walkable: false });
    const pour = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 6.4, .5, 18), this.tint(0x6f3818, { roughness: .12, metalness: .2 }));
    pour.position.set(CRAG.x, lipY + 2.7, CRAG.z);
    this.scene.add(pour);
    this.animated.spinners.push({ mesh: pour, axis: 'y', rate: .45 });
    this.landmarks.push({ kind: 'waterfall', name: 'THE CHOCOLATE FALLS', x: veil.x, z: veil.z, y: lipY });
  }

  // ── the Grand Spiral ──────────────────────────────────────────────────────
  // The road that gives the map its shape: it leaves the ring road in the
  // north, wraps MOUNT GUMDROP one and a third times, threads the wall of every
  // tier it crosses, and finishes on the crate drop. The holes it needs in
  // those walls are computed here from the road itself.
  spiralNodes() {
    const nodes = [];
    for (let leg = 0; leg < SPIRAL_NODES.length - 1; leg++) {
      const from = SPIRAL_NODES[leg], to = SPIRAL_NODES[leg + 1];
      const fromY = from.tier === null ? null : this.tierY(from.tier) + SPIRAL_LIFT;
      const toY = this.tierY(to.tier) + SPIRAL_LIFT;
      // A climb is chorded into four sub-steps so the road curves with the
      // cake; a level run and the approach off the buttercream stay single
      // straight segments, which is what keeps their slope exactly what the
      // authored endpoints say it is.
      const steps = from.tier !== null && from.tier !== to.tier ? 4 : 1;
      for (let step = 1; step <= steps; step++) {
        const t = step / steps;
        const angle = (from.a + (to.a - from.a) * t) * DEG, radius = from.r + (to.r - from.r) * t;
        const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
        const y = fromY === null ? toY : fromY + (toY - fromY) * t;
        nodes.push({ x, z, y, radius, angle });
      }
      if (leg === 0) {
        const angle = from.a * DEG;
        nodes.unshift({ x: Math.cos(angle) * from.r, z: Math.sin(angle) * from.r, y: this.ground(Math.cos(angle) * from.r, Math.sin(angle) * from.r), radius: from.r, angle });
      }
      // Wherever any leg passes a tier boundary — which, by the layout above,
      // is always the level leg after a climb — open that tier's wall at the
      // bearing the road actually crosses it. Derived, never typed: move a
      // spiral node and the door moves with it.
      for (let tier = 1; tier < TIERS.length; tier++) {
        const boundary = TIERS[tier].core;
        const t = (from.r - boundary) / (from.r - to.r);
        if (!Number.isFinite(t) || t <= 0 || t >= 1) continue;
        const bearing = (from.a + (to.a - from.a) * t) * DEG;
        this.openWall(tier, bearing, (SPIRAL_WIDTH / 2 + 2) / boundary);
      }
    }
    return nodes;
  }
  buildSpiral() {
    const nodes = this.spiralNodes();
    // Kept so the Wafer Steps can be sited where the road is not.
    this._spiralPath = nodes.map(node => [node.x, node.z]);
    // Elevated throughout: the legs that cross a cake wall hang nine metres
    // over the tier below, and a non-elevated deck there would snap anyone
    // walking underneath straight up onto the road.
    this.road(nodes, {
      width: SPIRAL_WIDTH, texture: 'sprinkle_icing', elevated: true, rails: true, pylons: true,
      railTexture: 'candy_cane', thickness: .55,
    });
    // Lamp posts down the outside of the whole climb: a striped pole with a
    // gumdrop lantern, spaced so the spiral reads at night and from the air.
    for (let i = 1; i < nodes.length; i += 2) {
      const node = nodes[i], out = node.radius ? (node.radius + SPIRAL_WIDTH / 2 + 1.4) / node.radius : 1;
      const px = node.x * out, pz = node.z * out;
      this.pillar(px, pz, node.y, .22, 4.2, 'candy_cane', { blocking: false, sides: 6, taper: 1 });
      const lantern = new THREE.Mesh(new THREE.SphereGeometry(.72, 10, 8),
        this.tint(CANDY_COLORS[i % CANDY_COLORS.length], { emissive: CANDY_DARKS[i % CANDY_DARKS.length], emissiveIntensity: 1.1, roughness: .3 }));
      lantern.position.set(px, node.y + 4.6, pz);
      this.scene.add(lantern);
      this.animated.bobbers.push({ parts: [{ mesh: lantern, base: lantern.position.y, phase: i, drift: 1.4 }] });
    }
    this.landmarks.push({ kind: 'road', name: 'THE GRAND SPIRAL', x: nodes[0].x, z: nodes[0].z, y: nodes[0].y });
    const crest = nodes[nodes.length - 1];
    this.landmarks.push({ kind: 'road', name: 'THE SUGAR SUMMIT ROAD', x: crest.x, z: crest.z, y: crest.y });
  }

  // ── the Wafer Steps ───────────────────────────────────────────────────────
  // The second way up, one flight per cake wall, always on the far side of the
  // mountain from wherever the spiral crossed the same wall.
  // The bearing whose flight footprint keeps the most room from the spiral.
  // Sampled rather than solved: the road is a polyline, the flight is a radial
  // strip, and eighteen candidate bearings is plenty to separate them.
  clearestStairBearing(boundary, run) {
    const path = this._spiralPath || [];
    if (!path.length) return 0;
    let best = 0, bestClearance = -Infinity;
    for (let i = 0; i < 72; i++) {
      const bearing = i / 72 * TAU;
      let clearance = Infinity;
      for (let reach = boundary - 2; reach <= boundary + run; reach += 2.5) {
        clearance = Math.min(clearance, distanceToPath(Math.cos(bearing) * reach, Math.sin(bearing) * reach, path));
      }
      if (clearance > bestClearance) { bestClearance = clearance; best = bearing; }
    }
    return best;
  }
  buildWaferSteps() {
    for (let tier = 1; tier < TIERS.length; tier++) {
      const boundary = TIERS[tier].core;
      const lowY = this.tierY(tier - 1), highY = this.tierY(tier);
      const depth = STAIR_TREAD;
      const count = Math.max(2, Math.round((highY - lowY) / STEP_RISE)), run = count * depth;
      const bearing = this.clearestStairBearing(boundary, run);
      // The flight stands out on the tier below and reaches over the lip: its
      // top tread lands one metre inside the upper tier, so the terrain cliff
      // is covered by treads that are already above it rather than by treads
      // the ground has overtaken.
      const radius = boundary - 1 + run / 2;
      const x = Math.cos(bearing) * radius, z = Math.sin(bearing) * radius;
      // Local +Z has to climb *inward*, so the yaw points at the mountain.
      const yaw = Math.atan2(-x, -z);
      this.stairs(x, z, yaw, lowY, highY, STAIR_WIDTH, { depth });
      // The doorway is measured at the wall the flight passes through, not at
      // the flight's own centre — those are now sixteen metres apart.
      this.openWall(tier, bearing, (STAIR_WIDTH / 2 + 2) / boundary);
      this._roadKeepOut.push({ x, z, r: STAIR_WIDTH / 2 + run / 2 });
      // A gumdrop newel either side of the bottom tread, so the flight is
      // findable from the tier below.
      const footRadius = radius + run / 2;
      for (const side of [-1, 1]) {
        const px = Math.cos(bearing) * footRadius + Math.cos(bearing + Math.PI / 2) * side * (STAIR_WIDTH / 2 + 1.6);
        const pz = Math.sin(bearing) * footRadius + Math.sin(bearing + Math.PI / 2) * side * (STAIR_WIDTH / 2 + 1.6);
        this.pillar(px, pz, lowY, 1, 3.4, 'peppermint', { sides: 12, taper: 1.05 });
        const knob = new THREE.Mesh(new THREE.SphereGeometry(1.35, 12, 9), this.mat('gumdrop', 1, { color: CANDY_COLORS[tier * 2 % CANDY_COLORS.length] }));
        knob.position.set(px, lowY + 4.2, pz); knob.castShadow = true; this.scene.add(knob);
      }
      this.landmarks.push({ kind: 'stair', name: tier === 1 ? 'THE WAFER STEPS' : `THE WAFER STEPS ${tier}`, x, z, y: highY, bearing, run });
    }
  }

  // ── the rainbow bridges ───────────────────────────────────────────────────
  // Three sky roads reaching the cake from the districts around it. Each one
  // lands *inside* the tier it serves, so its deck never fights the wall it
  // flies over, and its wall bearing is opened anyway for good measure.
  buildRainbowBridges() {
    const rainbow = this.mat('rainbow_road', 3);
    const spans = [
      // The Peppermint Span: dead level, mesa lip to tier 1, both at 22.
      {
        name: 'THE PEPPERMINT SPAN', tier: 1,
        from: { x: PEPPERMINT.x + 20, z: PEPPERMINT.z + 5, y: PEPPERMINT.level },
        to: { x: -55, z: -12, y: this.tierY(1) },
        segments: 5,
      },
      // The Flosswood Skyway: down out of the cotton candy canopy onto tier 1.
      {
        name: 'THE FLOSSWOOD SKYWAY', tier: 1,
        from: { x: FLOSSWOOD.x + 12, z: FLOSSWOOD.z - 18, y: this.ground(FLOSSWOOD.x + 12, FLOSSWOOD.z - 18) + 17 },
        to: { x: -14, z: 54, y: this.tierY(1) },
        segments: 6,
      },
      // The Jawbreaker Causeway: the long one, bowl rim to tier 2.
      {
        name: 'THE JAWBREAKER CAUSEWAY', tier: 2,
        from: { x: QUARRY.x - 22, z: QUARRY.z - 14, y: this.ground(QUARRY.x - 22, QUARRY.z - 14) + 13 },
        to: { x: 24, z: 18, y: this.tierY(2) },
        segments: 8,
      },
    ];
    for (const span of spans) {
      const nodes = [];
      for (let i = 0; i <= span.segments; i++) {
        const t = i / span.segments;
        nodes.push({
          x: span.from.x + (span.to.x - span.from.x) * t,
          z: span.from.z + (span.to.z - span.from.z) * t,
          // A gentle arc: a rainbow that is a straight plank is not a rainbow.
          y: span.from.y + (span.to.y - span.from.y) * t + Math.sin(t * Math.PI) * 3.4,
        });
      }
      this.road(nodes, { width: 7.5, texture: 'rainbow_road', deckMaterial: rainbow, elevated: true, rails: true, pylons: true, railTexture: 'frosting', thickness: .5 });
      // A tower at the outer end so the bridge starts on something, and a
      // landing plate at the inner end so it finishes on something.
      const startGround = this.ground(span.from.x, span.from.z);
      const tower = this.slab(span.from.x, span.from.z, startGround - 1, 11, 11, span.from.y - startGround + 1 - .5, 'candy_cane', { repeat: 3 });
      this.standOn(tower, 11, 11, span.from.y - startGround + 1 - .5, { blocking: true, elevated: true, navBlock: true });
      this.stairs(span.from.x + 8.5, span.from.z, Math.atan2(-1, 0), startGround, span.from.y, 6, { depth: 1.6, textures: ['frosting', 'wafer'] });
      const bearing = Math.atan2(span.to.z, span.to.x);
      this.openWall(span.tier, bearing, 7.75 / Math.max(8, TIERS[span.tier].core));
      this.landmarks.push({ kind: 'bridge', name: span.name, x: (span.from.x + span.to.x) / 2, z: (span.from.z + span.to.z) / 2, y: (span.from.y + span.to.y) / 2 + 3.4 });
    }
  }

  // ── MOUNT GUMDROP ─────────────────────────────────────────────────────────
  // Four tiers of cake. Each wall is a ring of blocking frosting standing from
  // the tier below to the tier above, with the doors the spiral, the steps and
  // the bridges asked for cut out of it — and nothing else. Radius, width and
  // crest are jittered: a ring of identical blocks reads as a cooling tower,
  // not as a cake.
  buildCake() {
    const bakes = [
      { wall: 'chocolate', drip: 0x6f3818 },
      { wall: 'wafer', drip: 0xf0dfbb },
      { wall: 'frosting', drip: 0xff9ec9 },
      { wall: 'sprinkle_icing', drip: 0xffffff },
    ];
    for (let tier = 1; tier < TIERS.length; tier++) {
      const boundary = TIERS[tier].core, lowY = this.tierY(tier - 1), highY = this.tierY(tier);
      const bake = bakes[tier];
      const segments = Math.max(18, Math.round(TAU * boundary / 9));
      // Each block is half again as wide as the pitch it stands on, so adjacent
      // blocks genuinely overlap. Blocks cut exactly to the pitch leave a
      // hairline of open bearing between every pair of them, and a cliff you
      // can walk through in forty places is not a cliff.
      const pitch = TAU * boundary / segments;
      let open = 0;
      for (let i = 0; i < segments; i++) {
        const bearing = i / segments * TAU;
        const radius = boundary + 1.6 + this.random() * .9;
        const width = pitch * 1.55, depth = 5 + this.random() * 2;
        // `margin` is how far the *edge* of this block reaches beyond its own
        // centre bearing, so a wide slab never overhangs the door beside it.
        if (this.wallGapped(tier, bearing, width / 3 / radius)) { open++; continue; }
        const x = Math.cos(bearing) * radius, z = Math.sin(bearing) * radius;
        const crest = highY + .25 + this.random() * .5;
        // A Y rotation maps a box's local +Z to (sin phi, cos phi), so the yaw
        // that points a block's *depth* radially outward is PI/2 - bearing.
        // Using -bearing instead leaves every block square-on to the wrong
        // bearing except due east, which is how a ring of forty blocks ends up
        // with forty gaps you can walk through.
        const wall = this.batchSlab(x, z, lowY - 5, width, depth, crest - lowY + 5, bake.wall, { repeat: 2, rotation: Math.PI / 2 - bearing });
        this.world.registerCollider(wall, {
          shape: 'box', halfX: width / 2, halfZ: depth / 2, top: (crest - lowY + 5) / 2,
          blocking: true, walkable: true, elevated: true,
        });
        // Frosting oozing over the lip of every layer.
        if (i % 2 === 0) {
          const drop = 2.6 + this.random() * 4.4;
          const drip = new THREE.Mesh(new THREE.CapsuleGeometry(1 + this.random() * .7, drop, 4, 8),
            this.tint(bake.drip, { roughness: .55 }));
          drip.position.set(Math.cos(bearing) * (radius + depth * .4), highY - drop * .4, Math.sin(bearing) * (radius + depth * .4));
          drip.castShadow = false;
          this.scene.add(drip);
        }
      }
      this.landmarks.push({ kind: 'tier', name: `MOUNT GUMDROP TIER ${tier}`, x: 0, z: 0, y: highY, doors: open > 0 });
    }
    // The cake plate: a doily rim round the bottom tier, walkable, so the
    // mountain sits on something instead of growing out of the ground.
    const plateRadius = TIERS[0].core + 2.5;
    for (let i = 0; i < 64; i++) {
      const bearing = i / 64 * TAU;
      const x = Math.cos(bearing) * plateRadius, z = Math.sin(bearing) * plateRadius;
      const base = Math.min(this.ground(x, z), this.tierY(0)) - 1.4;
      const scallop = this.batchSlab(x, z, base, 9.5, 3.4, this.tierY(0) - base - .1, 'white_chocolate', { repeat: 1, rotation: Math.PI / 2 - bearing });
      this.world.registerCollider(scallop, { shape: 'box', halfX: 4.75, halfZ: 1.7, top: (this.tierY(0) - base - .1) / 2, blocking: false, walkable: true });
    }
    // Dressing on each tier: candles, cherries and piped rosettes standing well
    // clear of the roads and of the drop zone.
    for (let tier = 0; tier < TIERS.length; tier++) {
      // Tier 0 is the outermost plate, so a tier's own ring runs from the wall
      // of the tier *inside* it out to its own core. Reading these the other
      // way round scatters every tier's dressing across the whole cake at the
      // bottom tier's height, which leaves cupcakes buried in the icing three
      // storeys below where they belong.
      const inner = tier + 1 < TIERS.length ? TIERS[tier + 1].core + 7 : 8;
      const outer = TIERS[tier].core - 6;
      if (outer <= inner) continue;
      const count = Math.round((outer - inner) * .7) + 6;
      for (let i = 0; i < count; i++) {
        const bearing = this.random() * TAU, reach = inner + this.random() * (outer - inner);
        const x = Math.cos(bearing) * reach, z = Math.sin(bearing) * reach;
        if (!this.clearOfWorks(x, z, 9)) continue;
        const roll = this.random();
        if (roll < .3) this.birthdayCandle(x, z, this.tierY(tier));
        else if (roll < .5) this.reactiveCandy(x, z, ['wrapped', 'bean', 'bear', 'gumdrop'][Math.floor(this.random() * 4)], .9 + this.random() * .5);
        else if (roll < .62) this.gumball(x, z, 2 + this.random() * 1.6, { rollLimit: 26 });
        else if (roll < .74) this.macaronStack(x, z, .8 + this.random() * .4);
        else if (roll < .86) this.cupcake(x, z, .7 + this.random() * .4);
        else this.rosette(x, z, this.tierY(tier));
        this.sprinkles(x, z, 5, 8);
      }
    }
    this.landmarks.push({ kind: 'mountain', name: 'MOUNT GUMDROP', x: 0, z: 0, y: CROWN_Y });
  }
  // A candle with a flame that flickers. Not destructible — it is a light
  // source and a silhouette, and the cake has enough to shoot already.
  birthdayCandle(x, z, baseY, scale = 1) {
    const height = (5 + this.random() * 4) * scale;
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(.45 * scale, .5 * scale, height, 9), this.mat('candy_cane', 2));
    stick.position.set(x, baseY + height / 2, z); stick.castShadow = true;
    this.scene.add(stick);
    this.world.registerCollider(stick, { shape: 'cylinder', radius: .55 * scale, top: height / 2, blocking: true, walkable: false });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(.42 * scale, 1.4 * scale, 7),
      new THREE.MeshBasicMaterial({ color: 0xffd66b, transparent: true, opacity: .92 }));
    flame.position.set(x, baseY + height + .7 * scale, z);
    this.scene.add(flame);
    this.animated.flames.push({ mesh: flame, phase: this.random() * TAU, base: flame.position.y, scale });
    return stick;
  }
  // A piped rosette of frosting: pure decoration, and cover at knee height.
  rosette(x, z, baseY) {
    const material = this.tint(CANDY_COLORS[Math.floor(this.random() * CANDY_COLORS.length)], { roughness: .7 });
    const group = new THREE.Group();
    group.position.set(x, baseY, z);
    for (let i = 0; i < 4; i++) {
      const radius = 2.2 - i * .45;
      const swirl = new THREE.Mesh(new THREE.TorusGeometry(radius, .55, 6, 14), material);
      swirl.rotation.x = Math.PI / 2; swirl.position.y = .5 + i * .7;
      group.add(swirl);
    }
    group.castShadow = true;
    this.scene.add(group);
    const entity = this.prop(group, 140, 2.4, 'rosette', .9);
    this.world.registerCollider(group, { shape: 'cylinder', radius: 2.4, top: 3.2, blocking: true, walkable: false }, entity);
    this.animated.spinners.push({ mesh: group, axis: 'y', rate: .22, entity });
    return entity;
  }

  // ── the summit ────────────────────────────────────────────────────────────
  // The crate drop sits here, so the crown is authored around it rather than
  // over it: a ring of candles, a cherry throne behind the pad, and a low
  // parapet you can fight from without the pad ever being blocked.
  buildSummit() {
    const y = CROWN_Y;
    // The crown's own furniture answers to the same doors the wall does: the
    // spiral arrives across this ring, and a candle or a merlon planted in the
    // gateway would stand in the road.
    for (let i = 0; i < 12; i++) {
      const bearing = i / 12 * TAU, reach = 15.5;
      if (this.wallGapped(3, bearing, 1.2 / reach)) continue;
      const x = Math.cos(bearing) * reach, z = Math.sin(bearing) * reach;
      this.birthdayCandle(x, z, y, 1.1 + (i % 3) * .18);
    }
    // The cherry: the single silhouette that tells you where the summit is from
    // anywhere on the map.
    // The cherry stands on the north side, opposite where the Grand Spiral
    // arrives: a four-metre sphere planted on the crest of the climb would
    // shoulder anyone reaching the summit straight back off it.
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(.34, .4, 9, 8), this.tint(0x3f8c42, { roughness: .8 }));
    stalk.position.set(0, y + 9.6, 12.5); stalk.rotation.z = .3; this.scene.add(stalk);
    const cherry = new THREE.Mesh(new THREE.SphereGeometry(4.2, 20, 16), this.palette.cherry);
    cherry.position.set(0, y + 16, 12.5); cherry.castShadow = true;
    this.scene.add(cherry);
    this.world.registerCollider(cherry, { shape: 'cylinder', radius: 4.2, top: 4.2, blocking: true, walkable: false });
    const shine = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8), this.tint(0xffffff, { transparent: true, opacity: .55 }));
    shine.position.set(-1.6, y + 17.6, 11); this.scene.add(shine);
    const crownLight = new THREE.PointLight(0xff6bc5, 30, 70, 2);
    crownLight.position.set(0, y + 12, 0);
    this.scene.add(crownLight);
    this.animated.glows.push({ light: crownLight, base: 24, swing: 9, rate: 1.9 });
    // A ring of wafer merlons: cover on the summit that never closes it off,
    // because a king of the hill you cannot get onto is just scenery.
    for (let i = 0; i < 16; i++) {
      const bearing = i / 16 * TAU + .1;
      if (i % 4 === 0) continue;
      if (this.wallGapped(3, bearing, 2.3 / 18.4)) continue;
      const x = Math.cos(bearing) * 18.4, z = Math.sin(bearing) * 18.4;
      const merlon = this.slab(x, z, y, 4.6, 2, 2.2, 'wafer', { repeat: 1, rotation: Math.PI / 2 - bearing });
      this.world.registerCollider(merlon, { shape: 'box', halfX: 2.3, halfZ: 1, top: 1.1, blocking: true, walkable: false, navIgnore: true });
    }
    this.landmarks.push({ kind: 'summit', name: 'THE CRATE CROWN', x: 0, z: 0, y });
  }

  // ── the ring road ─────────────────────────────────────────────────────────
  // A licorice-kerbed candy road round the foot of the cake, with an arch over
  // every spoke out to a compound. It is painted in mapSurfaces; this is the
  // furniture that makes it read as a road at eye level.
  buildRingRoad() {
    const radius = 106;
    for (let i = 0; i < 48; i++) {
      const bearing = i / 48 * TAU;
      for (const side of [-1, 1]) {
        const reach = radius + side * 7;
        const x = Math.cos(bearing) * reach, z = Math.sin(bearing) * reach;
        if (!this.clearOfWorks(x, z, 5)) continue;
        const kerb = this.batchSlab(x, z, this.ground(x, z) - .4, 13, 1.1, .75, 'licorice', { repeat: 1, rotation: Math.PI / 2 - bearing });
        this.world.registerCollider(kerb, { shape: 'box', halfX: 6.5, halfZ: .55, top: .375, blocking: false, walkable: true });
      }
      if (i % 6 === 0) {
        const x = Math.cos(bearing) * (radius + 9), z = Math.sin(bearing) * (radius + 9);
        if (this.clearOfWorks(x, z, 8)) this.candyCaneTree(x, z, 1.2);
      }
    }
    // Five candy-cane arches, one over each spoke to a team compound.
    for (let i = 0; i < 5; i++) {
      const bearing = Math.PI / 2 + i / 5 * TAU;
      const x = Math.cos(bearing) * 128, z = Math.sin(bearing) * 128;
      const base = this.ground(x, z);
      const arch = new THREE.Mesh(new THREE.TorusGeometry(9, 1.3, 8, 24, Math.PI), this.mat('candy_cane', 3));
      arch.position.set(x, base + 5.5, z); arch.rotation.y = -bearing + Math.PI / 2; arch.castShadow = true;
      this.scene.add(arch);
      for (const side of [-1, 1]) {
        const px = x + Math.cos(bearing + Math.PI / 2) * side * 9, pz = z + Math.sin(bearing + Math.PI / 2) * side * 9;
        this.pillar(px, pz, this.ground(px, pz) - .5, 1.35, 6.2, 'candy_cane', { sides: 10 });
      }
      const sign = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 9), this.mat('gumdrop', 1, { color: CANDY_COLORS[i] }));
      sign.position.set(x, base + 15, z); this.scene.add(sign);
      this.animated.spinners.push({ mesh: sign, axis: 'y', rate: .7 });
    }
    this.landmarks.push({ kind: 'road', name: 'THE SUGAR RING ROAD', x: 0, z: radius, y: this.ground(0, radius) });
  }

  // ── FLOSSWOOD ─────────────────────────────────────────────────────────────
  // The cotton candy woods, and the canopy platform the Skyway leaves from.
  buildFlosswood() {
    const { x: cx, z: cz } = FLOSSWOOD;
    for (let i = 0; i < 54; i++) {
      const angle = this.random() * TAU, reach = Math.sqrt(this.random()) * 42;
      const x = cx + Math.cos(angle) * reach, z = cz + Math.sin(angle) * reach;
      if (!this.canPlant(x, z, 3)) continue;
      this.cottonCandyTree(x, z, 1 + this.random() * 1.5);
      if (this.random() < .5) this.sugarTuft(x + (this.random() - .5) * 6, z + (this.random() - .5) * 6, 1.2);
      if (this.random() < .3) this.marshmallowPuffs(x + (this.random() - .5) * 8, z + (this.random() - .5) * 8, 3, 4);
    }
    // The canopy platform: a floss deck on four sticks, the Skyway's abutment.
    const px = cx + 12, pz = cz - 18, base = this.ground(px, pz), deckY = base + 17;
    const deck = this.slab(px, pz, deckY - .6, 15, 15, .6, 'wafer', { repeat: 3 });
    this.standOn(deck, 15, 15, .6, { elevated: true, navIgnore: true });
    for (const dx of [-6, 6]) for (const dz of [-6, 6]) {
      this.pillar(px + dx, pz + dz, this.ground(px + dx, pz + dz) - .5, .8, deckY - base + .5, 'candy_cane', { sides: 8, taper: 1.2 });
    }
    for (const [ox, oz, w, d] of [[0, 7.3, 15, .5], [0, -7.3, 15, .5], [7.3, 0, .5, 15], [-7.3, 0, .5, 15]]) {
      this.parapet(px + ox, pz + oz, deckY, w, d, 'frosting');
    }
    // Floss clouds hanging over the wood, drifting.
    for (let i = 0; i < 14; i++) {
      const angle = this.random() * TAU, reach = Math.sqrt(this.random()) * 40;
      const x = cx + Math.cos(angle) * reach, z = cz + Math.sin(angle) * reach;
      const cloud = new THREE.Mesh(new THREE.IcosahedronGeometry(4 + this.random() * 4, 1),
        this.tint([0xffc4e6, 0xd6c4ff, 0xc4ecff][Math.floor(this.random() * 3)], { roughness: 1, transparent: true, opacity: .85 }));
      cloud.scale.set(1.5, .6, 1.5);
      cloud.position.set(x, this.ground(x, z) + 22 + this.random() * 10, z);
      this.scene.add(cloud);
      this.animated.bobbers.push({ parts: [{ mesh: cloud, base: cloud.position.y, phase: this.random() * TAU, drift: .35 + this.random() * .3 }] });
    }
    this.landmarks.push({ kind: 'district', name: 'FLOSSWOOD', x: cx, z: cz, y: this.ground(cx, cz) });
  }

  // ── the PEPPERMINT MESA ───────────────────────────────────────────────────
  // A striped table west of the cake, level with tier 1 — which is exactly why
  // the Peppermint Span is dead flat and exactly why holding the mesa matters.
  buildPeppermintMesa() {
    const { x: cx, z: cz, core, level } = PEPPERMINT;
    // The mesa is walled by its own terrain skirt; a ring of mint slabs makes
    // that a real wall rather than a slope you can stroll up, with one gap
    // toward the map centre where the span leaves.
    const spanBearing = Math.atan2(-cz, -cx);
    for (let i = 0; i < 30; i++) {
      const bearing = i / 30 * TAU;
      const delta = Math.abs(((bearing - spanBearing) % TAU + TAU * 1.5) % TAU - Math.PI);
      if (Math.PI - delta < .34) continue;            // the span's doorway
      if (i % 7 === 3) continue;                       // scramble routes up
      const radius = core + 1.6 + this.random() * 1.6;
      const x = cx + Math.cos(bearing) * radius, z = cz + Math.sin(bearing) * radius;
      const base = this.ground(x, z) - 3;
      const wall = this.batchSlab(x, z, base, 7.5, 4, level - base + .6, 'peppermint', { repeat: 1, rotation: Math.PI / 2 - bearing });
      this.world.registerCollider(wall, { shape: 'box', halfX: 3.75, halfZ: 2, top: (level - base + .6) / 2, blocking: true, walkable: true, elevated: true });
    }
    // Spinning peppermint drums on the table, and a mint plaza at its centre.
    for (let i = 0; i < 9; i++) {
      const angle = i / 9 * TAU, reach = 6 + (i % 3) * 5.5;
      const x = cx + Math.cos(angle) * reach, z = cz + Math.sin(angle) * reach;
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 1.1 + (i % 3) * 1.4, 20), this.mat('peppermint', 1));
      drum.position.set(x, level + (1.1 + (i % 3) * 1.4) / 2, z);
      drum.castShadow = drum.receiveShadow = true;
      this.scene.add(drum);
      const entity = this.prop(drum, 240, 2.4, 'peppermint-drum', .35);
      this.world.registerCollider(drum, { shape: 'cylinder', radius: 2.4, top: (1.1 + (i % 3) * 1.4) / 2, blocking: true, walkable: true, elevated: true }, entity);
      this.animated.spinners.push({ mesh: drum, axis: 'y', rate: (i % 2 ? -1 : 1) * .5, entity });
    }
    for (let i = 0; i < 12; i++) {
      const angle = this.random() * TAU, reach = Math.sqrt(this.random()) * (core - 3);
      const x = cx + Math.cos(angle) * reach, z = cz + Math.sin(angle) * reach;
      if (!this.clearOfWorks(x, z, 5)) continue;
      if (this.random() < .5) this.candyCaneTree(x, z, .9 + this.random() * .6);
      else this.reactiveCandy(x, z, 'wrapped', 1 + this.random() * .4);
      this.sugarCrystals(x, z, 3, 6);
    }
    this.landmarks.push({ kind: 'district', name: 'PEPPERMINT MESA', x: cx, z: cz, y: level });
  }

  // ── GINGERBREAD ROW ───────────────────────────────────────────────────────
  // The one place on the map with interiors: a row of biscuit houses with icing
  // trim and walkable roofs, around a gumdrop square.
  buildGingerbreadRow() {
    const { x: cx, z: cz, level } = VILLAGE;
    const houses = [
      { dx: -17, dz: -12, w: 13, d: 11, h: 6, yaw: .12 },
      { dx: 2, dz: -17, w: 15, d: 12, h: 7.5, yaw: -.08 },
      { dx: 19, dz: -9, w: 12, d: 11, h: 6, yaw: .22 },
      { dx: -19, dz: 11, w: 14, d: 12, h: 8, yaw: -.18 },
      { dx: 3, dz: 17, w: 16, d: 13, h: 6.5, yaw: .05 },
      { dx: 21, dz: 12, w: 12, d: 10, h: 7, yaw: -.26 },
    ];
    for (const [index, house] of houses.entries()) {
      const x = cx + house.dx, z = cz + house.dz, base = level;
      const body = this.slab(x, z, base, house.w, house.d, house.h, 'gingerbread', { repeat: 2, rotation: house.yaw });
      const entity = this.prop(body, 620 + house.h * 40, Math.max(house.w, house.d) * .45, 'gingerbread-house', .2);
      this.world.registerCollider(body, {
        shape: 'box', halfX: house.w / 2, halfZ: house.d / 2, top: house.h / 2,
        blocking: true, walkable: true, elevated: true,
      }, entity);
      // A stepped icing roof: three courses of frosting, each riser under
      // World.STEP_UP so the roof is a real firing position you walk up onto
      // rather than a pitch that has to be a ramp — and a ramp on a roof always
      // has one end hanging over the eaves with nothing beneath it.
      const roofMat = this.mat('frosting', 2, { color: CANDY_COLORS[index % CANDY_COLORS.length] });
      for (let course = 0; course < 3; course++) {
        const inset = course * 2.2, lift = base + house.h + course * .95;
        const layer = this.slab(x, z, lift, house.w + 1.4 - inset, house.d + 1.4 - inset, .95, 'frosting', { repeat: 2, rotation: house.yaw, material: roofMat });
        this.standOn(layer, house.w + 1.4 - inset, house.d + 1.4 - inset, .95, { elevated: true, navIgnore: true });
      }
      // Icicles of icing along the eaves, gumdrop doorknobs, a candy chimney.
      for (let i = 0; i < 8; i++) {
        const along = (i / 7 - .5) * house.w;
        const drip = new THREE.Mesh(new THREE.ConeGeometry(.34, 1.2 + this.random() * 1.4, 5), this.tint(0xfffdf6, { roughness: .6 }));
        drip.position.set(x + Math.cos(house.yaw) * along, base + house.h - .5, z - Math.sin(house.yaw) * along + house.d / 2);
        drip.rotation.x = Math.PI;
        this.scene.add(drip);
      }
      const chimney = this.slab(x + house.w * .28, z - house.d * .2, base + house.h + 2.4, 2.2, 2.2, 3, 'candy_cane', { repeat: 1, rotation: house.yaw });
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(1.7, 1), this.tint(0xfff0f8, { roughness: 1, transparent: true, opacity: .7 }));
      puff.position.set(chimney.position.x, base + house.h + 7, chimney.position.z);
      this.scene.add(puff);
      this.animated.bobbers.push({ parts: [{ mesh: puff, base: puff.position.y, phase: index, drift: .8 }] });
      const door = this.slab(x, z + house.d / 2 + .1, base, 3, .4, 4.2, 'chocolate', { repeat: 1, rotation: house.yaw });
      door.receiveShadow = false;
      const knob = new THREE.Mesh(new THREE.SphereGeometry(.5, 8, 6), this.mat('gumdrop', 1, { color: CANDY_COLORS[(index + 3) % CANDY_COLORS.length] }));
      knob.position.set(x + 1, base + 2.2, z + house.d / 2 + .5);
      this.scene.add(knob);
      this.wrapperLitter(x, z + house.d / 2 + 4, 4, 4);
    }
    // The square: a bandstand of macarons, a candy-cane fence and lanterns.
    for (let i = 0; i < 10; i++) {
      const angle = i / 10 * TAU;
      const x = cx + Math.cos(angle) * 7.5, z = cz + Math.sin(angle) * 7.5;
      this.pillar(x, z, level, .3, 3.4, 'candy_cane', { blocking: false, sides: 6, taper: 1 });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(.62, 9, 7),
        this.tint(0xffe9a8, { emissive: 0x8a6200, emissiveIntensity: 1.1, roughness: .35 }));
      lamp.position.set(x, level + 3.8, z); this.scene.add(lamp);
    }
    const bandstand = this.slab(cx, cz, level, 9, 9, .7, 'wafer', { repeat: 2 });
    this.standOn(bandstand, 9, 9, .7, {});
    this.macaronStack(cx, cz, 1.4);
    this.landmarks.push({ kind: 'district', name: 'GINGERBREAD ROW', x: cx, z: cz, y: level });
  }

  // ── the JAWBREAKER BOWL ───────────────────────────────────────────────────
  // A scooped quarry of giant gumballs. This is where the map's headline
  // reaction lives: shoot one and it rolls, and a bowl is exactly the shape
  // that makes rolling interesting.
  buildJawbreakerBowl() {
    const { x: cx, z: cz, core } = QUARRY;
    for (let i = 0; i < 26; i++) {
      const angle = this.random() * TAU, reach = Math.sqrt(this.random()) * (core - 2);
      const x = cx + Math.cos(angle) * reach, z = cz + Math.sin(angle) * reach;
      if (!this.canPlant(x, z, 4)) continue;
      this.gumball(x, z, 2.4 + this.random() * 3.2, { rollLimit: 34 });
    }
    // The gumball machine on the rim: a glass dome full of spinning gumballs
    // over a chute, and the abutment the Jawbreaker Causeway leaves from.
    const mx = cx - 22, mz = cz - 14, base = this.ground(mx, mz);
    const pedestal = this.slab(mx, mz, base - 1, 14, 14, 8, 'licorice', { repeat: 3 });
    this.standOn(pedestal, 14, 14, 8, { blocking: true, elevated: true, navBlock: true });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(7, 20, 14),
      this.tint(0xcfeaff, { transparent: true, opacity: .28, roughness: .05, metalness: .3 }));
    dome.position.set(mx, base + 13, mz);
    this.scene.add(dome);
    const innards = new THREE.Group();
    innards.position.copy(dome.position);
    for (let i = 0; i < 26; i++) {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(.9 + this.random() * .6, 10, 8),
        this.tint(CANDY_COLORS[Math.floor(this.random() * CANDY_COLORS.length)], { roughness: .3 }));
      const angle = this.random() * TAU, reach = Math.sqrt(this.random()) * 5.2;
      ball.position.set(Math.cos(angle) * reach, (this.random() - .5) * 8, Math.sin(angle) * reach);
      innards.add(ball);
    }
    this.scene.add(innards);
    this.animated.spinners.push({ mesh: innards, axis: 'y', rate: .3 });
    const crank = new THREE.Mesh(new THREE.TorusGeometry(1.5, .3, 6, 14), this.tint(0xffd93b, { metalness: .6, roughness: .3 }));
    crank.position.set(mx + 7.2, base + 5, mz); crank.rotation.y = Math.PI / 2;
    this.scene.add(crank);
    this.animated.spinners.push({ mesh: crank, axis: 'x', rate: 1.6 });
    // Rock candy scree round the rim.
    for (let i = 0; i < 18; i++) {
      const angle = i / 18 * TAU + this.random() * .2, reach = core + 2 + this.random() * 12;
      const x = cx + Math.cos(angle) * reach, z = cz + Math.sin(angle) * reach;
      if (!this.canPlant(x, z, 3)) continue;
      this.rockCandy(x, z, .9 + this.random() * 1.6);
      this.sugarCrystals(x, z, 4, 8);
    }
    this.landmarks.push({ kind: 'district', name: 'JAWBREAKER BOWL', x: cx, z: cz, y: this.ground(cx, cz) });
    this.landmarks.push({ kind: 'landmark', name: 'THE GUMBALL WORKS', x: mx, z: mz, y: base + 8 });
  }

  // ── the MARSHMALLOW MIRE ──────────────────────────────────────────────────
  // Soft low ground on the cocoa's south bank: fields of puffs, licorice reeds
  // and toasting sticks, with a boardwalk of nougat planks through the middle.
  buildMarshmallowMire() {
    const { x: cx, z: cz, core } = MIRE;
    for (let i = 0; i < 60; i++) {
      const angle = this.random() * TAU, reach = Math.sqrt(this.random()) * (core + 16);
      const x = cx + Math.cos(angle) * reach, z = cz + Math.sin(angle) * reach;
      if (!this.canPlant(x, z, 2)) continue;
      this.marshmallowPuffs(x, z, 4, 6);
      if (this.random() < .4) this.licoriceReeds(x, z, 9);
      if (this.random() < .18) {
        // A toasted marshmallow the size of a car, on a licorice skewer.
        const scale = 1.4 + this.random() * 1.2;
        const pieces = [
          this.piece(new THREE.CylinderGeometry(.2 * scale, .22 * scale, 6 * scale, 5), 0, [0, 3 * scale, 0], { z: .18 }),
          this.piece(new THREE.CylinderGeometry(1.5 * scale, 1.5 * scale, 2.6 * scale, 12), 1, [.9 * scale, 5.2 * scale, 0]),
        ];
        this.plant(x, z, pieces, [this.palette.licorice, this.tint(0xffe0b8, { roughness: .9 })],
          { hp: 90, radius: 1.5 * scale, subtype: 'toasted-marshmallow', top: 5 * scale });
      }
    }
    // The boardwalk: level nougat planks on stubby posts, over the softest part.
    const nodes = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const x = cx - 30 + t * 60, z = cz - 16 + Math.sin(t * Math.PI) * 20;
      nodes.push({ x, z, y: this.ground(cx, cz) + 2.2 });
    }
    this.road(nodes, { width: 5.5, texture: 'marshmallow', elevated: true, rails: false, pylons: true, thickness: .45 });
    this.landmarks.push({ kind: 'district', name: 'MARSHMALLOW MIRE', x: cx, z: cz, y: this.ground(cx, cz) });
  }

  // ── the FIZZ LAKE ─────────────────────────────────────────────────────────
  // A soda lagoon with a straw jetty, bobbing ice-cube rafts, and a fountain of
  // fizz in the middle that you can hear before you see.
  buildFizzLake() {
    const { x: cx, z: cz, radius } = LAKE;
    // The straw pier: a striped jetty out over the soda, ending in a platform.
    const shoreBearing = Math.atan2(-cz, -cx) + Math.PI;
    const shoreX = cx + Math.cos(shoreBearing) * (radius + 6), shoreZ = cz + Math.sin(shoreBearing) * (radius + 6);
    const nodes = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      nodes.push({
        x: shoreX + (cx - shoreX) * t * .82, z: shoreZ + (cz - shoreZ) * t * .82,
        y: SYRUP_Y + 2.6,
      });
    }
    this.road(nodes, { width: 6, texture: 'candy_cane', elevated: true, rails: true, pylons: true, railTexture: 'licorice', thickness: .5 });
    const head = nodes[nodes.length - 1];
    const platform = this.slab(head.x, head.z, SYRUP_Y + 2.1, 14, 14, .5, 'candy_cane', { repeat: 3 });
    this.standOn(platform, 14, 14, .5, { elevated: true, navIgnore: true });
    for (const [ox, oz, w, d] of [[0, 6.8, 14, .5], [0, -6.8, 14, .5], [6.8, 0, .5, 14], [-6.8, 0, .5, 14]]) {
      this.parapet(head.x + ox, head.z + oz, SYRUP_Y + 2.6, w, d, 'licorice');
    }
    // The giant straw, bent, rising out of the platform.
    const straw = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 26, 12), this.mat('candy_cane', 4));
    straw.position.set(head.x, SYRUP_Y + 15, head.z); straw.rotation.z = .22;
    straw.castShadow = true; this.scene.add(straw);
    this.world.registerCollider(straw, { shape: 'cylinder', radius: 1.7, top: 13, blocking: true, walkable: false });
    const bend = new THREE.Mesh(new THREE.TorusGeometry(3.4, 1.5, 8, 16, Math.PI * .6), this.mat('candy_cane', 2));
    bend.position.set(head.x + 2.6, SYRUP_Y + 28, head.z); bend.rotation.y = Math.PI / 2;
    this.scene.add(bend);
    // Ice-cube rafts: walkable, bobbing, and the only dry route across the
    // middle of the lake.
    for (let i = 0; i < 9; i++) {
      const angle = i / 9 * TAU + .3, reach = radius * (.35 + (i % 3) * .18);
      const x = cx + Math.cos(angle) * reach, z = cz + Math.sin(angle) * reach;
      const raft = this.slab(x, z, SYRUP_Y - .3, 6.5, 6.5, 1.5, 'marshmallow', {
        repeat: 1, rotation: this.random() * TAU,
        material: this.tint(0xd8f4ff, { transparent: true, opacity: .82, roughness: .12, metalness: .2 }),
      });
      this.standOn(raft, 6.5, 6.5, 1.5, { navIgnore: true });
      this.animated.bobbers.push({ parts: [{ mesh: raft, base: raft.position.y, phase: i, drift: .8 }], slow: true });
    }
    this.fizz(cx, cz, radius * .5, 12);
    // A lemon-slice sun floating in the middle, because why not.
    const slice = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, .9, 22), this.tint(0xffe14d, { roughness: .5, emissive: 0x8f7100, emissiveIntensity: .3 }));
    slice.position.set(cx, SYRUP_Y + .5, cz);
    this.scene.add(slice);
    this.animated.spinners.push({ mesh: slice, axis: 'y', rate: .15 });
    this.landmarks.push({ kind: 'district', name: 'THE FIZZ LAKE', x: cx, z: cz, y: SYRUP_Y });
  }

  // ── planting ──────────────────────────────────────────────────────────────
  // Everything above is placed by hand. This is the confectionery between it:
  // dense, varied, and kept out of the syrup, off the cake walls and away from
  // anywhere the match actually needs to stay clear.
  clearOfWorks(x, z, clearance = 4) {
    const world = this.world;
    if (world.nearBase?.(x, z, 34) || world.nearDropZone?.(x, z, 12)) return false;
    if (world.cavePosition && Math.hypot(x - world.cavePosition.x, z - world.cavePosition.z) < 16) return false;
    for (const secret of DEATHMATCH_SECRET_PLANS.crown || []) {
      if (Math.hypot(x - secret.x, z - secret.z) < 16) return false;
    }
    // Off the spiral, the ring road and the stairs. The roads are the map's
    // circulation; a lollipop growing through one is a lollipop nobody sees
    // except as the thing that got them killed.
    const radius = Math.hypot(x, z);
    if (Math.abs(radius - 106) < 11 + clearance) return false;
    for (const node of this._roadKeepOut || []) {
      if (Math.hypot(x - node.x, z - node.z) < node.r + clearance) return false;
    }
    return true;
  }
  canPlant(x, z, clearance = 3) {
    const world = this.world;
    if (Math.hypot(x, z) > world.bounds - 10) return false;
    if (candyIsSyrup(x, z) || distanceToPath(x, z, RIVER) < RIVER_HALF + clearance) return false;
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.radius + clearance) return false;
    if (Math.hypot(x - PLUNGE.x, z - PLUNGE.z) < PLUNGE.radius + clearance) return false;
    // The cake walls and their aprons stay clear; the tiers plant themselves in
    // buildCake, where the planter knows which tier it is standing on.
    const radius = Math.hypot(x, z);
    if (radius < TIERS[0].core + 12) return false;
    // The crag is a cliff, not a garden.
    if (Math.hypot(x - CRAG.x, z - CRAG.z) < CRAG.core + 8) return false;
    return this.clearOfWorks(x, z, clearance);
  }
  plantCandyland() {
    // The budget is entities, not trees. Every destructible costs a slot in the
    // per-frame entity sweep, so candyland reads dense through batched cover —
    // sprinkles, tufts, puffs, crystals, wrappers, all free — while the things
    // you can actually shoot down stay near the count the other big maps carry.
    const world = this.world, extent = world.bounds - 16;
    let placed = 0, attempts = 0;
    while (placed < 300 && attempts < 9000) {
      attempts++;
      const x = (this.random() * 2 - 1) * extent, z = (this.random() * 2 - 1) * extent;
      if (!this.canPlant(x, z)) continue;
      placed++;
      const roll = this.random(), radius = Math.hypot(x, z);
      const nearSyrup = distanceToPath(x, z, RIVER) < RIVER_HALF + 26 || Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.radius + 26;
      // The species mix shifts with the ground: chocolate and licorice on the
      // cocoa banks, floss in the north, canes and rock candy on the rim.
      if (nearSyrup && roll < .34) this.chocolateTree(x, z, .9 + this.random() * .7);
      else if (nearSyrup && roll < .5) this.licoriceTree(x, z, .85 + this.random() * .6);
      else if (z > 60 && roll < .34) this.cottonCandyTree(x, z, .9 + this.random() * .9);
      else if (roll < .12) this.lollipopTree(x, z, .9 + this.random() * .8);
      else if (roll < .24) this.gumdropTree(x, z, .85 + this.random() * .6);
      else if (roll < .34) this.candyCaneTree(x, z, .85 + this.random() * .7);
      else if (roll < .43) this.iceCreamTree(x, z, .85 + this.random() * .5);
      else if (roll < .5) this.donutTree(x, z, .85 + this.random() * .5);
      else if (roll < .57) this.rockCandy(x, z, .8 + this.random() * 1.6);
      else if (roll < .64) this.reactiveCandy(x, z, ['wrapped', 'bean', 'bear', 'gumdrop'][Math.floor(this.random() * 4)], .9 + this.random() * .6);
      else if (roll < .69 && radius > 130) this.gumball(x, z, 2 + this.random() * 2.4, { rollLimit: 22 });
      else if (roll < .74) this.macaronStack(x, z, .8 + this.random() * .5);
      else if (roll < .79) this.cupcake(x, z, .7 + this.random() * .5);
      else if (roll < .87) this.lollipopTree(x, z, .8 + this.random() * .6);
      else this.gumdropTree(x, z, .8 + this.random() * .5);
      // Ground cover around whatever just went in — batched, so nearly free.
      const cover = 5 + Math.floor(this.random() * 6);
      for (let i = 0; i < cover; i++) {
        const angle = this.random() * TAU, reach = 2 + this.random() * 7;
        const px = x + Math.cos(angle) * reach, pz = z + Math.sin(angle) * reach;
        if (!this.canPlant(px, pz, 1)) continue;
        const kind = this.random();
        if (kind < .34) this.sugarTuft(px, pz, .8 + this.random() * .8);
        else if (kind < .55) this.sprinkles(px, pz, 3, 9);
        else if (kind < .72) this.miniGumdrops(px, pz, 2.6, 6);
        else if (kind < .84) this.sugarCrystals(px, pz, 2.4, 6);
        else if (kind < .93) this.marshmallowPuffs(px, pz, 2.6, 4);
        else this.wrapperLitter(px, pz, 3, 3);
      }
    }
    this.landmarks.push({ kind: 'forest', name: 'THE SUGAR WILDS', x: 0, z: 0, y: 0, count: placed });
  }

  // A wall of colossal lollipops beyond the base ring. No collision and no
  // destructibles: it exists so candyland closes rather than simply stopping.
  buildRimLollipops() {
    const stickMat = this.tint(0xfff6fa, { roughness: .5 });
    for (let i = 0; i < 96; i++) {
      const angle = i / 96 * TAU + this.random() * .04;
      const reach = 228 + (i % 5) * 9 + this.random() * 6;
      const x = Math.cos(angle) * reach, z = Math.sin(angle) * reach;
      const height = 30 + (i % 7) * 7, head = 9 + (i % 4) * 2.6;
      const stick = new THREE.CylinderGeometry(1.5, 2.2, height, 6);
      stick.translate(x, height / 2, z);
      this.batch(stick, stickMat);
      const disc = new THREE.CylinderGeometry(head, head, 2.4, 16);
      disc.rotateX(Math.PI / 2);
      disc.rotateY(angle);
      disc.translate(x, height + head * .6, z);
      this.batch(disc, this.tint(CANDY_COLORS[i % CANDY_COLORS.length], { roughness: .45 }));
    }
  }

  // ── the animator ──────────────────────────────────────────────────────────
  // The only per-frame work candyland asks for. Gumballs are integrated here
  // rather than in a physics pass because they are the only thing on the map
  // that moves under its own steam, and doing it here keeps the whole reaction
  // — hit, roll, spin, settle — in one readable place.
  animator() {
    const { gumballs, candies, spinners, bobbers, flames, sheets, glows, bubbles } = this.animated;
    const world = this.world;
    const axis = new THREE.Vector3();
    return {
      update(time, dt) {
        // A single non-finite frame time would propagate straight into a light
        // intensity and NaN out every lit material on the map, so the clock is
        // checked once here rather than trusted a dozen times below.
        if (!Number.isFinite(time) || !Number.isFinite(dt)) return;
        const step = Math.min(.05, Math.max(0, dt));

        for (const ball of gumballs) {
          if (ball.entity.dead) continue;
          const position = ball.group.position;
          const speed = Math.hypot(ball.velocity.x, ball.velocity.z);
          if (speed > .08) {
            // Terrain gradient, sampled the same way World samples it for
            // crates: a gumball on a cake tier runs for the edge.
            const sample = .6;
            const gx = (world.heightAt(position.x + sample, position.z) - world.heightAt(position.x - sample, position.z)) / (sample * 2);
            const gz = (world.heightAt(position.x, position.z + sample) - world.heightAt(position.x, position.z - sample)) / (sample * 2);
            ball.velocity.x -= gx * 16 * step;
            ball.velocity.z -= gz * 16 * step;
            position.x += ball.velocity.x * step;
            position.z += ball.velocity.z * step;
            // Stay inside the footprint the broadphase indexed for this ball.
            const dx = position.x - ball.home.x, dz = position.y * 0 + position.z - ball.home.y;
            const drift = Math.hypot(dx, dz);
            if (drift > ball.rollLimit) {
              const scale = ball.rollLimit / drift;
              position.x = ball.home.x + dx * scale;
              position.z = ball.home.y + dz * scale;
              ball.velocity.x *= -.35; ball.velocity.z *= -.35;
            }
            const ground = world.groundAt ? world.groundAt({ x: position.x, y: position.y, z: position.z }, position.y) : world.heightAt(position.x, position.z);
            position.y = ground + ball.radius;
            // Roll the shell about the axis perpendicular to travel, by the
            // distance actually covered, so it never skates.
            const travel = Math.hypot(ball.velocity.x * step, ball.velocity.z * step);
            axis.set(-ball.velocity.z, 0, ball.velocity.x);
            if (axis.lengthSq() > 1e-8) ball.shell.rotateOnWorldAxis(axis.normalize(), travel / ball.radius);
            ball.velocity.multiplyScalar(Math.pow(.36, step));
          } else {
            ball.velocity.set(0, 0, 0);
            // Idle: a barely-there breathing wobble so a still gumball still
            // reads as something soft rather than as a painted sphere.
            const breathe = 1 + Math.sin(time * 1.4 + ball.phase) * .012;
            ball.shell.scale.set(breathe, 2 - breathe, breathe);
          }
          if (ball.gloss) ball.gloss.position.set(-ball.radius * .42, ball.radius * .55, ball.radius * .42);
        }

        for (const candy of candies) {
          if (candy.flash > 0) {
            candy.flash = Math.max(0, candy.flash - step * 2.4);
            candy.material.emissiveIntensity = .25 + candy.flash * 2.2;
          }
        }

        for (const spinner of spinners) {
          if (spinner.entity?.dead) continue;
          if (spinner.axis === 'x') spinner.mesh.rotation.x = time * spinner.rate;
          else spinner.mesh.rotation.y = time * spinner.rate;
        }

        for (const bobber of bobbers) {
          if (bobber.entity?.dead) continue;
          const rate = bobber.slow ? .8 : 1;
          for (const part of bobber.parts) {
            part.mesh.position.y = part.base + Math.sin(time * (part.drift || 1) * rate + (part.phase || 0)) * (bobber.slow ? .3 : .55);
            const breathe = 1 + Math.sin(time * (part.drift || 1) * .7 + (part.phase || 0)) * .05;
            if (!bobber.slow) part.mesh.scale.set(breathe, part.mesh.scale.y, breathe);
          }
        }

        for (const flame of flames) {
          const flicker = .78 + Math.abs(Math.sin(time * 9 + flame.phase)) * .5;
          flame.mesh.scale.set(.8 + flicker * .3, flicker, .8 + flicker * .3);
          flame.mesh.position.y = flame.base + Math.sin(time * 7 + flame.phase) * .1 * flame.scale;
          flame.mesh.material.opacity = .72 + flicker * .24;
        }

        // Syrup scrolls downstream; a chocolate fall scrolls *down*. A fragment
        // at uv.y samples the texture at uv.y + offset.y, so increasing the
        // offset walks the image toward the top of the plane, which is what
        // makes the sheet read as pouring over the lip rather than climbing it.
        for (const sheet of sheets) {
          sheet.map.offset.y += step * sheet.speed;
          if (sheet.sway) sheet.map.offset.x = Math.sin(time * .3) * sheet.sway;
        }

        for (const bubble of bubbles) {
          const cycle = (time * bubble.rise * .25 + bubble.offset) % 1;
          bubble.mesh.position.y = bubble.base + cycle * bubble.top;
          const fade = 1 - cycle;
          bubble.mesh.scale.setScalar(.4 + cycle * 1.1);
          bubble.mesh.material.opacity = .38 * fade;
        }

        for (const glow of glows) {
          const pulse = .5 + .5 * Math.sin(time * (glow.rate || 2));
          if (glow.light && glow.base !== undefined) glow.light.intensity = glow.base + pulse * (glow.swing || 2);
          if (glow.mesh) glow.mesh.scale.setScalar(.9 + pulse * .3);
        }
      },
    };
  }
}

export function buildCrateExpectations(world) { return new CrateExpectations(world).build(); }
