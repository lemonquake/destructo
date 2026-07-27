import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BEDLAM } from '../../data/mapSurfaces.js';

// ── BUMPER-TO-BUMPER BEDLAM ──────────────────────────────────────────────────
// A twelve-district megacity built entirely from authored geometry on dead-flat
// ground (World.heightAt returns 0 for this map), which is what lets kerbs,
// decks, ramps and plinths meet without a single gap.
//
// Four vertical layers, each reachable from the one below:
//    0.00  carriageway — 18-wide asphalt on a 60-unit street grid
//    0.35  pavement    — one kerbed slab per block, a free step up from the road
//   14.00  viaduct     — a cross of elevated expressway with four off-ramps
//   34.00  skyline     — four civic tower roofs linked by skybridges
//
// Collision contract (see World.registerCollider):
//   walkable, !blocking             stand on it, walk under and past it
//   walkable + blocking + elevated  a solid building: roof on top, wall below
//   shape:'ramp'                    walkable surface sloping along local +Z
//   navBlock                        player route kept out of the AI's 2-D plan
//   navIgnore + bottom              blocks only at its own height (parapets)
//
// Anything rising 1.0 or less per step needs no ramp at all: that is under
// World.STEP_UP, so units simply walk up it. Kerbs, plaza steps, stadium
// terracing and the drive-in berms all rely on that.

const { lines: STREETS, blockHalf: BLOCK_HALF, curbHeight: CURB, ring: RING, outskirt: OUTSKIRT, baseRadius: BASE_RING } = BEDLAM;
const BLOCKS = [-150, -90, -30, 30, 90, 150];
const BLOCK_STEP = 60;

const VIADUCT_Y = 14;
const VIADUCT_HALF = 11;
const VIADUCT_REACH = 190;
const VIADUCT_RAMP_RUN = 44;
const SKYLINE_Y = 34;
const CIVIC_HALF = 12;
const MAX_SLOPE = .36;
// A rail shorter than World.STEP_UP (1.05) is simply stepped over, so every
// parapet in the city is authored above that threshold on purpose.
const RAIL = 1.6;

const FACADES = ['urban_brick', 'neon_concrete', 'city_glass', 'corrugated_steel', 'concrete', 'brick'];

const DISTRICTS = new Map([
  ['-30,-30', 'civic'], ['30,-30', 'civic'], ['-30,30', 'civic'], ['30,30', 'civic'],
  ['90,-90', 'parking'], ['-90,90', 'transit'], ['90,90', 'mall'], ['-90,-90', 'foundry'],
  ['-150,150', 'park'], ['150,-150', 'park'], ['150,150', 'stadium'], ['-150,-150', 'construction'],
]);

// One themed compound per base, in ring order starting due north.
const BASE_DISTRICTS = [
  { name: 'FIRE HOUSE 1', facade: 'urban_brick', roof: 14, mast: 'ladder' },
  { name: 'PRECINCT 12', facade: 'concrete', roof: 12, mast: 'antenna' },
  { name: 'MERCY GENERAL', facade: 'city_glass', roof: 17, mast: 'helipad' },
  { name: 'KBDM BROADCAST', facade: 'neon_concrete', roof: 13, mast: 'antenna' },
  { name: 'CENTRAL DEPOT', facade: 'corrugated_steel', roof: 11, mast: 'silo' },
  { name: 'NIGHT MARKET', facade: 'brick', roof: 10, mast: 'ladder' },
  { name: 'GRID STATION 9', facade: 'vehicle_metal', roof: 15, mast: 'silo' },
  { name: 'BEDLAM POLYTECH', facade: 'sandstone', roof: 16, mast: 'antenna' },
  { name: 'ST. RATCHET', facade: 'cobble', roof: 19, mast: 'spire' },
  { name: 'THE LUCKY LUG', facade: 'neon_concrete', roof: 13, mast: 'spire' },
  { name: 'UNION TERMINAL', facade: 'marble', roof: 15, mast: 'helipad' },
  { name: 'REFINERY EAST', facade: 'corrugated_steel', roof: 12, mast: 'silo' },
];

// Which block a coordinate falls in, and how much pavement is left beyond it.
const blockCentre = value => Math.round((value - 30) / BLOCK_STEP) * BLOCK_STEP + 30;
const insideGrid = (x, z) => Math.abs(x) < 175 && Math.abs(z) < 175;

export class BedlamCity {
  constructor(world) {
    this.world = world;
    this.scene = world.scene;
    this.random = world.seeded(90210);
    this.materials = new Map();
    this.batches = new Map();
    this.landmarks = [];
  }

  // ── static batching ───────────────────────────────────────────────────────
  // Kerbs, stadium terracing, lamp columns and the horizon are hundreds of
  // boxes that never move, never die and never change material. Baking them
  // into one mesh per material turns a few hundred draw calls into a handful.
  // Anything that needs collision gets a bodiless anchor at the same place —
  // the collider system only ever asks an object for its world transform.
  batchSlab(x, z, base, w, d, h, texture, options = {}) {
    const { repeat = 3, material, rotation = 0, anchor = true } = options;
    const resolved = material || this.mat(texture, repeat);
    const geometry = new THREE.BoxGeometry(w, h, d);
    geometry.rotateY(rotation);
    geometry.translate(x, base + h / 2, z);
    const bucket = this.batches.get(resolved);
    if (bucket) bucket.push(geometry); else this.batches.set(resolved, [geometry]);
    if (!anchor) return null;
    const marker = new THREE.Object3D();
    marker.position.set(x, base + h / 2, z);
    marker.rotation.y = rotation;
    this.scene.add(marker);
    return marker;
  }
  flushBatches() {
    for (const [material, geometries] of this.batches) {
      const merged = mergeGeometries(geometries, false);
      for (const geometry of geometries) geometry.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      mesh.name = 'bedlam-static-batch';
      mesh.castShadow = false; mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      this.scene.add(mesh);
    }
    this.batches.clear();
  }

  // ── primitives ────────────────────────────────────────────────────────────
  mat(texture, repeat = 3, options = null) {
    const key = `${texture}|${repeat}|${options ? JSON.stringify(options) : ''}`;
    let material = this.materials.get(key);
    if (!material) { material = this.world.materials.building(texture, { repeat, ...(options || {}) }); this.materials.set(key, material); }
    return material;
  }
  // A box placed by its *bottom* face, so stacked levels can never drift apart.
  slab(x, z, base, w, d, h, texture, options = {}) {
    const { repeat = 3, material, rotation = 0, shadow = true, parent = null } = options;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material || this.mat(texture, repeat));
    mesh.position.set(x, base + h / 2, z);
    if (rotation) mesh.rotation.y = rotation;
    mesh.castShadow = mesh.receiveShadow = shadow;
    (parent || this.scene).add(mesh);
    return mesh;
  }
  // Register the top face of a slab built above as a standing surface.
  standOn(mesh, w, d, h, options = {}) {
    this.world.registerCollider(mesh, {
      shape: 'box', halfX: w / 2, halfZ: d / 2, top: h / 2,
      blocking: options.blocking === true, walkable: options.walkable !== false,
      elevated: Boolean(options.elevated), navBlock: Boolean(options.navBlock),
      navIgnore: Boolean(options.navIgnore),
    }, options.entity || null);
    return mesh;
  }
  // A sloped plate. `solid` fills it to the ground for street-level embankments;
  // otherwise it is a constant-thickness deck you can walk underneath.
  ramp(x, z, yaw, fromY, toY, run, width, texture, options = {}) {
    const rise = toY - fromY, thickness = options.thickness ?? .75;
    const geometry = new THREE.BoxGeometry(width, 1, run);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const surface = rise * ((position.getZ(i) + run / 2) / run);
      position.setY(i, position.getY(i) > 0 ? surface : (options.solid ? 0 : surface - thickness));
    }
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, this.mat(texture, options.repeat ?? 3));
    mesh.position.set(x, fromY, z); mesh.rotation.y = yaw;
    mesh.castShadow = mesh.receiveShadow = true; this.scene.add(mesh);
    this.world.registerCollider(mesh, {
      shape: 'ramp', halfX: width / 2, halfZ: run / 2, rampLow: 0, rampHigh: rise, top: rise,
      rampThickness: options.solid ? Infinity : thickness,
      // A solid embankment is filled to the ground and *is* the ground. A
      // floating plate is not: you can walk and shoot underneath one, so it may
      // only carry a body already at its level, whatever height it starts from.
      blocking: false, walkable: true, elevated: !options.solid, navBlock: options.navBlock !== false,
    });
    return mesh;
  }
  // A rail that only stops bodies at its own level, leaving the street below clear.
  parapet(x, z, base, w, d, texture = 'hazard', height = RAIL, options = {}) {
    const mesh = this.slab(x, z, base, w, d, height, texture, { repeat: 2, shadow: false, parent: options.parent });
    this.world.registerCollider(mesh, {
      shape: 'box', halfX: w / 2, halfZ: d / 2, top: height / 2, bottom: -height / 2,
      blocking: true, walkable: false, navIgnore: true,
    }, options.entity || null);
    return mesh;
  }
  pillar(x, z, base, radius, height, texture, { blocking = true } = {}) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.12, height, 8), this.mat(texture, 2));
    mesh.position.set(x, base + height / 2, z);
    mesh.castShadow = mesh.receiveShadow = true; this.scene.add(mesh);
    if (blocking) this.world.registerCollider(mesh, { shape: 'cylinder', radius: radius * 1.05, top: height / 2, blocking: true, walkable: false });
    return mesh;
  }
  // Make a mesh a destructible prop. Always register the collider *after* this
  // so the entity owns it — otherwise the physics resolver would push units out
  // of both the collider box and a phantom circle of the same prop.
  prop(mesh, hp, radius, subtype = 'city') {
    const entity = { id: crypto.randomUUID(), type: 'prop', subtype, group: mesh, hp, maxHp: hp, radius, dead: false, jellyStrength: .3 };
    mesh.traverse(object => { if (object.isMesh) object.userData.entity = entity; });
    this.world.destructibles.push(entity);
    return entity;
  }

  // ── buildings ─────────────────────────────────────────────────────────────
  // A destructible tower whose roof is a real standing surface. One collider
  // does both jobs — it blocks anyone below the roofline and supports anyone on
  // it — and it dies with the building.
  building(x, z, w, d, roofY, facade, options = {}) {
    const { parapet = false, hp, rotation = 0 } = options;
    const group = new THREE.Group(); group.position.set(x, 0, z); group.rotation.y = rotation; group.name = 'bedlam-building';
    const bodyHeight = roofY - .55;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, bodyHeight, d), this.mat(facade, Math.max(2, Math.round(Math.max(w, d) / 7))));
    body.position.y = bodyHeight / 2; body.castShadow = body.receiveShadow = true; group.add(body);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w, .55, d), this.mat('rooftop', 3));
    cap.position.y = roofY - .275; cap.castShadow = cap.receiveShadow = true; group.add(cap);
    const band = new THREE.Mesh(new THREE.BoxGeometry(w + .5, .3, d + .5), this.mat('neon_concrete', 3));
    band.position.y = roofY - .9; group.add(band);
    this.scene.add(group);
    const health = hp ?? Math.round(720 + roofY * 32 + Math.max(w, d) * 11);
    const entity = { id: crypto.randomUUID(), type: 'prop', subtype: 'building', group, hp: health, maxHp: health, radius: Math.max(w, d) * .45, dead: false, jellyStrength: .22, attachments: [cap, band] };
    group.traverse(object => { if (object.isMesh) object.userData.entity = entity; });
    this.world.destructibles.push(entity);
    this.world.registerCollider(body, { shape: 'box', halfX: w / 2, halfZ: d / 2, top: roofY - bodyHeight / 2, blocking: true, walkable: true, elevated: true }, entity);
    const rails = [];
    if (parapet) {
      // Parented to the building so the rails vanish with it. Stored in the same
      // order roofStair searches faces (+Z, +X, -Z, -X) so the stair it picks can
      // knock its own rail out and leave the top of the climb open.
      for (const [px, pz, pw, pd] of [[0, d / 2 - .3, w, .6], [w / 2 - .3, 0, .6, d - 1.2], [0, -d / 2 + .3, w, .6], [-w / 2 + .3, 0, .6, d - 1.2]]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(pw, RAIL, pd), this.mat('corrugated_steel', 2));
        rail.position.set(px, roofY + RAIL / 2, pz); group.add(rail);
        rail.userData.entity = entity; entity.attachments.push(rail);
        const collider = this.world.registerCollider(rail, { shape: 'box', halfX: pw / 2, halfZ: pd / 2, top: RAIL / 2, bottom: -RAIL / 2, blocking: true, walkable: false, navIgnore: true }, entity);
        rails.push({ rail, collider });
      }
    }
    return { x, z, w, d, roofY, yaw: rotation, group, entity, rails };
  }

  // ── ramps and stairs ──────────────────────────────────────────────────────
  // A switchback stair tower bolted to one face. Flights alternate between two
  // lanes and stack vertically, exactly like a fire escape; the top landing
  // overlaps the surface it serves by a metre, so the two meet with no seam.
  //
  // `faceYaw` is the world yaw of the outward wall normal (0 = +Z, PI/2 = +X).
  // Local frame: the wall sits at local x = 0 and the stairs hang off local +X.
  switchback(centre, faceYaw, wallOffset, baseY, topY, options = {}) {
    const lane = options.lane ?? 4.6, landing = options.landing ?? 5, run = options.run ?? 20;
    const flights = options.flights ?? Math.max(2, Math.ceil((topY - baseY) / (run * MAX_SLOPE)));
    const step = (topY - baseY) / flights, texture = options.texture ?? 'plating';
    const cos = Math.cos(faceYaw), sin = Math.sin(faceYaw);
    // local +X → outward normal, local +Z → along the wall
    const place = (lx, lz) => ({
      x: centre.x + sin * (wallOffset + lx) + cos * lz,
      z: centre.z + cos * (wallOffset + lx) - sin * lz,
    });
    const laneX = [lane * .5, lane * 1.5];
    const landingWidth = lane * 2 + 2, landingZ = run / 2 + landing / 2;
    let last = null;
    for (let k = 0; k < flights; k++) {
      const fromY = baseY + step * k, toY = fromY + step, climbing = k % 2 === 0;
      const at = place(laneX[k % 2], 0);
      // uphill along local +Z is world yaw faceYaw + PI/2
      this.ramp(at.x, at.z, faceYaw + (climbing ? Math.PI / 2 : -Math.PI / 2), fromY, toY, run, lane, texture, { navBlock: true, repeat: 2 });
      const end = place(lane, climbing ? landingZ : -landingZ);
      // The pad top sits 2cm low so it tucks under whatever surface it meets
      // instead of z-fighting with it; the step is far below anything walkable.
      const pad = this.slab(end.x, end.z, toY - .77, landing, landingWidth, .75, texture, { repeat: 2, rotation: faceYaw });
      this.standOn(pad, landing, landingWidth, .75, { elevated: true, navBlock: true });
      last = { x: end.x, z: end.z, y: toY };
    }
    for (const lz of [-landingZ, landingZ]) {
      const post = place(lane * 2 + 1, lz);
      this.slab(post.x, post.z, baseY, .5, .5, topY - baseY, 'vehicle_metal', { repeat: 2, rotation: faceYaw, shadow: false });
    }
    return last;
  }
  // Fit a stair tower to whichever face of `target` has the room for one.
  // `faceOrder` rotates the search so a second stair on the same building, or
  // four identical civic towers, do not all end up on the same wall.
  roofStair(target, options = {}) {
    const yaw = target.yaw || 0;
    const faces = [
      { yaw: yaw, half: target.d / 2, along: target.w, axis: 'z', sign: 1 },
      { yaw: yaw + Math.PI / 2, half: target.w / 2, along: target.d, axis: 'x', sign: 1 },
      { yaw: yaw + Math.PI, half: target.d / 2, along: target.w, axis: 'z', sign: -1 },
      { yaw: yaw - Math.PI / 2, half: target.w / 2, along: target.d, axis: 'x', sign: -1 },
    ];
    const baseY = options.baseY ?? CURB, start = options.faceOrder ?? 0;
    for (let i = 0; i < faces.length; i++) {
      const face = faces[(i + start) % faces.length];
      const room = options.margin ?? this.pavementRoom(target, face);
      const lane = Math.min(options.lane ?? 4.6, (room - 1.5) / 2);
      const landing = Math.min(options.landing ?? 5, (face.along - 7) / 2);
      const run = Math.min(options.run ?? 20, face.along - landing * 2 - .5);
      if (lane < 2.4 || landing < 3 || run < 6) continue;
      this.switchback(target, face.yaw, face.half - 1, baseY, target.roofY, { run, lane, landing, texture: options.texture ?? 'plating' });
      this.openRail(target, (i + start) % faces.length);
      return true;
    }
    return false;
  }
  // Take the parapet off the wall a stair just arrived at. Without this the
  // climb ends against a rail that is taller than the step-over tolerance —
  // a roof you can see but never actually walk onto.
  openRail(target, faceIndex) {
    const entry = target.rails?.[faceIndex];
    if (!entry) return;
    entry.rail.parent?.remove(entry.rail);
    entry.collider.enabled = false;
    this.world.colliderIndexDirty = true;
    const attachments = target.entity?.attachments;
    if (attachments) attachments.splice(attachments.indexOf(entry.rail) >>> 0, attachments.includes(entry.rail) ? 1 : 0);
    target.rails[faceIndex] = null;
  }
  // How far a stair may reach out from one face before it leaves the pavement.
  // Measured per-face, because a building pushed to one side of its block has a
  // generous back yard and no front one.
  pavementRoom(target, face) {
    if (!insideGrid(target.x, target.z)) return 14;
    const axis = face.axis === 'x' ? target.x : target.z, centre = blockCentre(axis);
    const wall = axis + face.sign * face.half;
    return (face.sign > 0 ? (centre + BLOCK_HALF) - wall : wall - (centre - BLOCK_HALF)) - .5;
  }
  // A flat elevated walkway between two points at the same height.
  skybridge(ax, az, bx, bz, y, width = 6, texture = 'plating') {
    const dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz);
    if (length < .5) return null;
    const yaw = Math.atan2(dx, dz), cx = (ax + bx) / 2, cz = (az + bz) / 2;
    const deck = this.slab(cx, cz, y - .5, width, length, .5, texture, { repeat: 2, rotation: yaw });
    this.standOn(deck, width, length, .5, { elevated: true, navIgnore: true });
    const offset = width / 2 - .25, cos = Math.cos(yaw), sin = Math.sin(yaw);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(.4, RAIL, length), this.mat('hazard', 2));
      rail.position.set(cx + side * offset * cos, y + RAIL / 2, cz - side * offset * sin);
      rail.rotation.y = yaw; this.scene.add(rail);
      this.world.registerCollider(rail, { shape: 'box', halfX: .2, halfZ: length / 2, top: RAIL / 2, bottom: -RAIL / 2, blocking: true, walkable: false, navIgnore: true });
    }
    return deck;
  }

  // ── the build ─────────────────────────────────────────────────────────────
  build() {
    this.buildPavements();
    this.buildBlocks();
    this.buildViaduct();
    this.buildSkyline();
    this.buildOutskirts();
    this.buildBaseDistricts();
    this.buildStreetLife();
    this.buildHorizon();
    this.flushBatches();
    return this.landmarks;
  }

  // One kerbed slab per block. The 0.35 kerb is below the step-over tolerance,
  // so getting from road to pavement never needs a ramp anywhere in the city.
  buildPavements() {
    const span = BLOCK_HALF * 2;
    for (const cx of BLOCKS) for (const cz of BLOCKS) {
      const kerb = this.batchSlab(cx, cz, 0, span + 1, span + 1, CURB - .08, 'concrete', { repeat: 5 });
      this.standOn(kerb, span + 1, span + 1, CURB - .08, { navIgnore: true });
      // Green blocks are turfed rather than paved — the block deck is the only
      // thing you ever see here, so the surface art underneath it would be lost.
      const district = DISTRICTS.get(`${cx},${cz}`), green = district === 'park' || district === 'stadium';
      const deck = green
        ? this.batchSlab(cx, cz, 0, span, span, CURB, 'grass', { repeat: 9, material: this.mat('grass', 9, { color: 0x7ba463 }) })
        : this.batchSlab(cx, cz, 0, span, span, CURB, 'sidewalk', { repeat: 7 });
      this.standOn(deck, span, span, CURB, { navIgnore: true });
    }
  }

  buildBlocks() {
    for (const cx of BLOCKS) for (const cz of BLOCKS) {
      const district = DISTRICTS.get(`${cx},${cz}`);
      if (district === 'civic') this.civicTower(cx, cz);
      else if (district === 'parking') this.parkingDeck(cx, cz);
      else if (district === 'mall') this.mall(cx, cz);
      else if (district === 'foundry') this.foundryRow(cx, cz);
      else if (district === 'transit') this.transitPlaza(cx, cz);
      else if (district === 'stadium') this.stadium(cx, cz);
      else if (district === 'park') this.park(cx, cz);
      else if (district === 'construction') this.constructionSite(cx, cz);
      else this.genericBlock(cx, cz);
    }
  }

  // Ordinary blocks pick one of five hand-checked footprints; all of them keep a
  // pavement margin so nothing ever overhangs a kerb into the carriageway.
  genericBlock(cx, cz) {
    const ring = Math.max(Math.abs(cx), Math.abs(cz));
    const seed = Math.abs(cx * 31 + cz * 7) / 60 | 0;
    const floor = ring <= 90 ? 20 : 11, spread = ring <= 90 ? 14 : 9;
    const height = index => floor + ((seed + index * 3) % 4) * (spread / 3);
    const facade = index => FACADES[(seed + index) % FACADES.length];
    const built = [];
    // Every third block is an access block: its footprint is deliberately kept
    // clear on one side so a stair tower actually fits on the pavement.
    if (seed % 3 === 0) {
      const tower = this.building(cx, cz - 2, 24, 24, height(0) + 6, facade(0), { parapet: true });
      for (const sx of [-1, 1]) this.building(cx + sx * 13.5, cz - 17.5, 13, 6, 5 + (seed % 3), facade(1));
      if (this.roofStair(tower, { lane: 4.5, landing: 5, run: 13.5 })) this.landmarks.push({ kind: 'roof', x: tower.x, z: tower.z, y: tower.roofY });
      return [tower];
    }
    switch (seed % 5) {
      case 0: built.push(this.building(cx, cz, 28, 28, height(0), facade(0))); break;
      case 1: for (const s of [-1, 1]) built.push(this.building(cx, cz + s * 9.5, 30, 15, height(s > 0 ? 1 : 2), facade(s > 0 ? 1 : 2))); break;
      case 2: for (const s of [-1, 1]) built.push(this.building(cx + s * 9.5, cz, 15, 30, height(s > 0 ? 1 : 2), facade(s > 0 ? 1 : 2))); break;
      case 3: {
        let index = 0;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) built.push(this.building(cx + sx * 9.5, cz + sz * 9.5, 15, 15, height(index++), facade(index)));
        break;
      }
      default:
        built.push(this.building(cx, cz - 7, 30, 16, height(0), facade(0)));
        built.push(this.building(cx + 8.5, cz + 11, 15, 14, height(1), facade(2)));
        built.push(this.building(cx - 8.5, cz + 11, 15, 14, height(2), facade(3)));
    }
    return built;
  }

  // ── the four civic towers and the skyline they carry ──────────────────────
  civicTower(cx, cz) {
    const tower = this.building(cx, cz, CIVIC_HALF * 2, CIVIC_HALF * 2, SKYLINE_Y, 'city_glass', { parapet: true });
    // Each tower climbs a different wall, so the quartet reads as four buildings.
    const faceOrder = (cx > 0 ? 1 : 0) + (cz > 0 ? 2 : 0);
    this.roofStair(tower, { lane: 3.5, landing: 4.6, run: 14, faceOrder });
    const plant = this.slab(cx, cz, SKYLINE_Y, 7, 7, 6, 'neon_concrete', { repeat: 2, material: this.mat('neon_concrete', 2, { emissive: 0xff2fbd, emissiveIntensity: .5 }) });
    this.world.registerCollider(plant, { shape: 'box', halfX: 3.5, halfZ: 3.5, top: 3, blocking: true, walkable: true, elevated: true });
    this.landmarks.push({ kind: 'roof', x: cx, z: cz, y: SKYLINE_Y });
    return tower;
  }
  buildSkyline() {
    const reach = 30 - CIVIC_HALF + 1; // 1 unit of overlap onto each tower roof
    this.skybridge(-reach, 30, reach, 30, SKYLINE_Y, 6);
    this.skybridge(-reach, -30, reach, -30, SKYLINE_Y, 6);
    // Two ramps lift the viaduct up to roof height, one per east/west arm, and
    // each crest fans out to the two towers on its side. Together with the
    // bridges above, the four roofs form a closed loop.
    for (const side of [-1, 1]) {
      const foot = side * 96, crest = side * 34;
      this.ramp((foot + crest) / 2, 0, side < 0 ? Math.PI / 2 : -Math.PI / 2, VIADUCT_Y, SKYLINE_Y, Math.abs(foot - crest), 10, 'concrete', { navBlock: true, repeat: 3 });
      const pad = this.slab(crest, 0, SKYLINE_Y - .6, 12, 14, .6, 'plating', { repeat: 2 });
      this.standOn(pad, 12, 14, .6, { elevated: true, navIgnore: true });
      for (const sz of [-1, 1]) this.skybridge(crest, sz * 6, crest, sz * (30 - CIVIC_HALF + 1), SKYLINE_Y, 5);
    }
  }

  // ── the viaduct ───────────────────────────────────────────────────────────
  // A cross of elevated expressway over the two central avenues. The deck never
  // blocks: the streets below stay open, only the pylons are solid.
  buildViaduct() {
    const deck = (x, z, w, d) => {
      const mesh = this.slab(x, z, VIADUCT_Y - 1, w, d, 1, 'concrete', { repeat: Math.max(2, Math.round(Math.max(w, d) / 9)), material: this.mat('concrete', Math.max(2, Math.round(Math.max(w, d) / 9)), { color: 0xa9aeb5 }) });
      this.standOn(mesh, w, d, 1, { elevated: true, navIgnore: true });
      return mesh;
    };
    deck(0, 0, VIADUCT_REACH * 2, VIADUCT_HALF * 2);
    const armLength = VIADUCT_REACH - VIADUCT_HALF;
    for (const side of [-1, 1]) deck(0, side * (VIADUCT_HALF + armLength / 2), VIADUCT_HALF * 2, armLength);
    const paint = this.mat('road_lines', 30, { color: 0xe8d79a });
    this.slab(0, 0, VIADUCT_Y, VIADUCT_REACH * 2, 3, .06, 'road_lines', { material: paint, shadow: false });
    for (const side of [-1, 1]) this.slab(0, side * (VIADUCT_HALF + armLength / 2), VIADUCT_Y, 3, armLength, .06, 'road_lines', { material: paint, shadow: false });
    for (const side of [-1, 1]) for (const [from, to] of [[-VIADUCT_REACH, -VIADUCT_HALF], [VIADUCT_HALF, VIADUCT_REACH]]) {
      this.parapet((from + to) / 2, side * (VIADUCT_HALF - .4), VIADUCT_Y, to - from, .8, 'hazard');
      this.parapet(side * (VIADUCT_HALF - .4), (from + to) / 2, VIADUCT_Y, .8, to - from, 'hazard');
    }
    // Pylons stand mid-carriageway, well clear of both kerbs.
    for (let offset = 40; offset <= 160; offset += 40) for (const side of [-1, 1]) {
      this.pillar(side * offset, 0, 0, 2.3, VIADUCT_Y - 1, 'vehicle_metal');
      this.pillar(0, side * offset, 0, 2.3, VIADUCT_Y - 1, 'vehicle_metal');
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.pillar(sx * 14, sz * 14, 0, 2.1, VIADUCT_Y - 1, 'vehicle_metal');
    // Four solid off-ramps touch down on the ring boulevard, one per arm.
    const mid = VIADUCT_REACH + VIADUCT_RAMP_RUN / 2;
    for (const [dx, dz, yaw] of [[-1, 0, Math.PI / 2], [1, 0, -Math.PI / 2], [0, -1, 0], [0, 1, Math.PI]]) {
      this.ramp(dx * mid, dz * mid, yaw, 0, VIADUCT_Y, VIADUCT_RAMP_RUN, VIADUCT_HALF * 2, 'concrete', { solid: true, navBlock: true, repeat: 4 });
      this.landmarks.push({ kind: 'viaduct', x: dx * mid, z: dz * mid, y: VIADUCT_Y / 2 });
    }
  }

  // ── set-piece districts ───────────────────────────────────────────────────
  // Three open decks on columns, with a stacked vehicle ramp up the east side.
  parkingDeck(cx, cz) {
    const half = 15, levels = [4.8, 9.25, 13.7];
    for (const sx of [-1, 0, 1]) for (const sz of [-1, 0, 1]) this.pillar(cx + sx * (half - 2), cz + sz * (half - 2), 0, 1.1, levels[2] - .55, 'concrete');
    levels.forEach((y, index) => {
      const deck = this.slab(cx, cz, y - .55, half * 2, half * 2, .55, index === 2 ? 'rooftop' : 'concrete', { repeat: 6 });
      this.standOn(deck, half * 2, half * 2, .55, { elevated: true, navIgnore: true });
      // No rail on the east face: that is where the helix arrives.
      this.parapet(cx - (half - .4), cz, y, .8, half * 2, 'corrugated_steel');
      for (const side of [-1, 1]) this.parapet(cx, cz + side * (half - .4), y, half * 2 - 1.6, .8, 'corrugated_steel');
    });
    // The helix: three flights in one lane outside the east wall, landings
    // alternating ends, each landing overlapping the deck it feeds.
    const laneX = cx + half + 3.5, run = 22;
    let from = CURB;
    levels.forEach((y, index) => {
      const climbing = index % 2 === 0;
      this.ramp(laneX, cz, climbing ? 0 : Math.PI, from, y, run, 7, 'concrete', { navBlock: true, repeat: 3 });
      const pad = this.slab(laneX - 2, cz + (climbing ? 1 : -1) * (run / 2 + 3), y - .57, 11, 6, .55, 'concrete', { repeat: 2 });
      this.standOn(pad, 11, 6, .55, { elevated: true, navBlock: true });
      from = y;
    });
    this.landmarks.push({ kind: 'roof', x: cx, z: cz, y: levels[2] });
  }

  // A wide low retail box: big walkable roof, glowing atrium, two stair towers.
  mall(cx, cz) {
    const shell = this.building(cx, cz, 26, 26, 12, 'city_glass', { parapet: true });
    this.roofStair(shell, { lane: 3, landing: 4.4, run: 16.5 });
    this.roofStair(shell, { lane: 3, landing: 4.4, run: 16.5, faceOrder: 2 });
    const atrium = this.slab(cx, cz, 12, 11, 11, 4.2, 'crystal', { repeat: 2, material: this.mat('crystal', 2, { emissive: 0x1780b0, emissiveIntensity: .6 }) });
    this.world.registerCollider(atrium, { shape: 'box', halfX: 5.5, halfZ: 5.5, top: 2.1, bottom: -2.1, blocking: true, walkable: false, navIgnore: true });
    this.landmarks.push({ kind: 'roof', x: cx, z: cz, y: 12 });
  }

  // Two warehouses at a shared roof height, stitched together by a catwalk.
  foundryRow(cx, cz) {
    const roofY = 10, halls = [];
    for (const offset of [-10, 10]) halls.push(this.building(cx + offset, cz, 16, 26, roofY, 'corrugated_steel', { parapet: true }));
    this.skybridge(cx - 3, cz, cx + 3, cz, roofY, 5, 'vehicle_metal');
    this.roofStair(halls[0], { lane: 3.2, landing: 4, run: 8, texture: 'corrugated_steel' });
    for (const offset of [-10, 10]) {
      const stack = this.slab(cx + offset, cz + 15, 0, 3, 3, 22, 'vehicle_metal', { repeat: 4 });
      const entity = this.prop(stack, 420, 2, 'chimney');
      this.world.registerCollider(stack, { shape: 'box', halfX: 1.5, halfZ: 1.5, top: 11, blocking: true, walkable: false }, entity);
    }
    this.landmarks.push({ kind: 'roof', x: cx, z: cz, y: roofY });
  }

  // An elevated rail stop: viaduct segment, platform, stairs and a parked train.
  transitPlaza(cx, cz) {
    const deckY = 9, length = BLOCK_HALF * 2 - 2;
    for (let offset = -15; offset <= 15; offset += 10) this.pillar(cx + offset, cz, 0, 1.5, deckY - .8, 'concrete');
    const track = this.slab(cx, cz, deckY - .8, length, 13, .8, 'vehicle_metal', { repeat: 5 });
    this.standOn(track, length, 13, .8, { elevated: true, navIgnore: true });
    this.parapet(cx, cz - 6.1, deckY, length, .7, 'hazard');   // far edge only — the stair lands on the near one
    const train = this.slab(cx - 3, cz, deckY, 26, 4.2, 4, 'plating', { repeat: 4 });
    const entity = this.prop(train, 900, 6, 'railcar');
    this.world.registerCollider(train, { shape: 'box', halfX: 13, halfZ: 2.1, top: 2, bottom: -2, blocking: true, walkable: false, navIgnore: true }, entity);
    this.switchback({ x: cx, z: cz }, 0, 5.5, CURB, deckY, { run: 16, lane: 4.4, landing: 5, texture: 'concrete' });
    for (const sx of [-1, 1]) {
      const shelter = this.slab(cx + sx * 15, cz - 15, CURB, 11, 6, 3.4, 'urban_brick', { repeat: 2 });
      const kiosk = this.prop(shelter, 320, 5, 'kiosk');
      this.world.registerCollider(shelter, { shape: 'box', halfX: 5.5, halfZ: 3, top: 1.7, blocking: true, walkable: true, elevated: true }, kiosk);
    }
    this.landmarks.push({ kind: 'roof', x: cx, z: cz, y: deckY });
  }

  // Terraced stands around a pitch. Every riser is 1.0 — under the step-over
  // tolerance — so the whole bowl is climbable without a single ramp.
  stadium(cx, cz) {
    const pitchHalf = 11, steps = 6, depth = 1.5;
    for (let step = 0; step < steps; step++) {
      const y = CURB + step, inset = pitchHalf + 1.4 + step * depth;
      for (const side of [-1, 1]) {
        const across = this.batchSlab(cx, cz + side * (inset + depth / 2), y, (inset + depth) * 2, depth, 1, 'concrete', { repeat: 3 });
        this.standOn(across, (inset + depth) * 2, depth, 1, { navIgnore: true });
        const along = this.batchSlab(cx + side * (inset + depth / 2), cz, y, depth, inset * 2, 1, 'concrete', { repeat: 3 });
        this.standOn(along, depth, inset * 2, 1, { navIgnore: true });
      }
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      this.slab(cx + sx * 19, cz + sz * 19, CURB, 2.6, 2.6, 20, 'vehicle_metal', { repeat: 2 });
      this.slab(cx + sx * 19, cz + sz * 19, 20, 5, 5, 1.1, 'hazard', { repeat: 1, shadow: false, material: this.mat('hazard', 1, { emissive: 0xffe08a, emissiveIntensity: .8 }) });
    }
    const board = this.slab(cx, cz - 19.5, CURB, 15, 1.6, 13, 'neon_concrete', { repeat: 2 });
    const entity = this.prop(board, 520, 8, 'scoreboard');
    this.world.registerCollider(board, { shape: 'box', halfX: 7.5, halfZ: .8, top: 6.5, blocking: true, walkable: false }, entity);
    this.landmarks.push({ kind: 'plaza', x: cx, z: cz, y: CURB });
  }

  park(cx, cz) {
    for (let i = 0; i < 10; i++) {
      const angle = i / 10 * Math.PI * 2 + this.random(), radius = 11 + this.random() * 8;
      this.world.createTree(cx + Math.cos(angle) * radius, cz + Math.sin(angle) * radius, .9 + this.random() * .7);
    }
    // A bandstand on 1.0 steps: climbable, and a solid sightline break.
    for (let step = 0; step < 2; step++) {
      const size = 13 - step * 3;
      const plinth = this.slab(cx, cz, CURB + step, size, size, 1, 'marble', { repeat: 2 });
      this.standOn(plinth, size, size, 1, { navIgnore: true });
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.slab(cx + sx * 3.4, cz + sz * 3.4, CURB + 2, .6, .6, 4, 'marble', { repeat: 1, shadow: false });
    const roof = this.slab(cx, cz, CURB + 6, 11, 11, .8, 'rooftile', { repeat: 2 });
    this.world.registerCollider(roof, { shape: 'box', halfX: 5.5, halfZ: 5.5, top: .4, bottom: -.4, blocking: true, walkable: false, navIgnore: true });
    this.landmarks.push({ kind: 'plaza', x: cx, z: cz, y: CURB });
  }

  // Open scaffolding: three floating decks joined by a freestanding switchback.
  constructionSite(cx, cz) {
    const levels = [6, 12, 18], half = 13;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.pillar(cx + sx * (half - 1), cz + sz * (half - 1), 0, .8, 19, 'vehicle_metal');
    for (const y of levels) {
      const deck = this.slab(cx, cz, y - .5, half * 2, half * 2, .5, 'plating', { repeat: 5 });
      this.standOn(deck, half * 2, half * 2, .5, { elevated: true, navIgnore: true });
      // The switchback climbs the west face, so that rail is left open.
      this.parapet(cx + (half - .4), cz, y, .6, half * 2, 'hazard');
      for (const side of [-1, 1]) this.parapet(cx, cz + side * (half - .4), y, half * 2 - 1.2, .6, 'hazard');
    }
    this.switchback({ x: cx, z: cz }, -Math.PI / 2, half - 1, CURB, levels[2], { run: 16, lane: 4, landing: 4.6, texture: 'plating' });
    const crane = this.slab(cx + 17, cz - 17, 0, 2.2, 2.2, 34, 'hazard', { repeat: 4 });
    this.world.registerCollider(crane, { shape: 'box', halfX: 1.1, halfZ: 1.1, top: 17, blocking: true, walkable: false });
    this.slab(cx + 17, cz - 5, 32, 2, 26, 1.6, 'hazard', { repeat: 3, shadow: false });
    this.landmarks.push({ kind: 'roof', x: cx, z: cz, y: levels[2] });
  }

  // ── beyond the grid ───────────────────────────────────────────────────────
  buildOutskirts() {
    this.containerPort(-OUTSKIRT, 70);
    this.industrialPark(OUTSKIRT, -70);
    this.driveIn(-70, -OUTSKIRT);
    this.marina(70, OUTSKIRT);
  }

  // Stacked freight: a two-high apron reached by a loading ramp, with taller
  // stacks behind it that have to be jumped or climbed from the apron.
  containerPort(cx, cz) {
    const colors = ['corrugated_steel', 'vehicle_metal', 'urban_brick', 'plating'];
    let index = 0;
    for (let row = -2; row <= 2; row++) for (let column = -1; column <= 1; column++) {
      const x = cx + column * 15, z = cz + row * 19, stack = column === 1 ? 2 : 1 + ((index + row + 3) % 3);
      for (let level = 0; level < stack; level++) {
        const box = this.slab(x, z, level * 3.2, 13, 5.4, 3.2, colors[(index + level) % colors.length], { repeat: 2 });
        this.world.registerCollider(box, { shape: 'box', halfX: 6.5, halfZ: 2.7, top: 1.6, blocking: true, walkable: true, elevated: level > 0 });
      }
      index++;
    }
    // Loading ramp landing on the consistently two-high eastern row.
    this.ramp(cx + 31, cz, -Math.PI / 2, 0, 6.4, 20, 5.4, 'concrete', { solid: true, navBlock: true, repeat: 3 });
    for (const side of [-1, 1]) this.pillar(cx + side * 20, cz + 48, 0, 1.6, 21, 'hazard');
    this.slab(cx, cz + 48, 21, 44, 2.6, 2.2, 'hazard', { repeat: 6, shadow: false });
    this.landmarks.push({ kind: 'yard', x: cx, z: cz, y: 0 });
  }

  industrialPark(cx, cz) {
    const hall = this.building(cx, cz + 26, 34, 30, 13, 'corrugated_steel', { parapet: true });
    this.roofStair(hall, { run: 18 });
    for (let i = 0; i < 3; i++) {
      const z = cz - 30 + i * 17;
      const silo = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 20, 12), this.mat('vehicle_metal', 3));
      silo.position.set(cx, 10, z); silo.castShadow = silo.receiveShadow = true; this.scene.add(silo);
      const entity = this.prop(silo, 720, 5.2, 'silo');
      this.world.registerCollider(silo, { shape: 'cylinder', radius: 5.2, top: 10, blocking: true, walkable: false }, entity);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(5.4, 4, 12), this.mat('plating', 2));
      cone.position.set(cx, 22, z); this.scene.add(cone);
    }
    for (const side of [-1, 1]) this.slab(cx + side * 17, cz - 12, 8, 2, 46, 1.2, 'vehicle_metal', { repeat: 6, shadow: false });
    this.landmarks.push({ kind: 'yard', x: cx, z: cz, y: 0 });
  }

  driveIn(cx, cz) {
    const screen = this.slab(cx - 40, cz, 0, 2, 40, 22, 'concrete', { repeat: 5 });
    const entity = this.prop(screen, 900, 11, 'screen');
    this.world.registerCollider(screen, { shape: 'box', halfX: 1, halfZ: 20, top: 11, blocking: true, walkable: false }, entity);
    // Viewing berms: 1.0 risers again, so they are simply walked up.
    for (let step = 0; step < 4; step++) {
      const berm = this.batchSlab(cx - 20 + step * 13, cz, 0, 8, 44 - step * 5, step + 1, 'dirt', { repeat: 4 });
      this.standOn(berm, 8, 44 - step * 5, step + 1, { navIgnore: true });
    }
    const booth = this.slab(cx + 40, cz + 18, 0, 8, 8, 5, 'urban_brick', { repeat: 2 });
    const kiosk = this.prop(booth, 320, 5, 'booth');
    this.world.registerCollider(booth, { shape: 'box', halfX: 4, halfZ: 4, top: 2.5, blocking: true, walkable: true, elevated: true }, kiosk);
    this.landmarks.push({ kind: 'yard', x: cx, z: cz, y: 0 });
  }

  marina(cx, cz) {
    const quay = this.slab(cx, cz - 16, 0, 96, 14, 1.6, 'concrete', { repeat: 8 });
    this.standOn(quay, 96, 14, 1.6, { navIgnore: true });
    for (let i = -2; i <= 2; i++) {
      const jetty = this.slab(cx + i * 22, cz + 8, 1.05, 5, 42, .55, 'wood', { repeat: 4 });
      this.standOn(jetty, 5, 42, .55, { elevated: true, navIgnore: true });
      this.pillar(cx + i * 22, cz + 27, 0, .5, 9, 'wood');
    }
    const warehouse = this.building(cx - 34, cz - 16, 22, 16, 11, 'urban_brick', { parapet: true });
    this.roofStair(warehouse, { run: 13 });
    for (const side of [-1, 1]) this.pillar(cx + side * 40, cz - 16, 1.6, 1.4, 18, 'hazard');
    this.landmarks.push({ kind: 'yard', x: cx, z: cz, y: 0 });
  }

  // ── the twelve base districts ─────────────────────────────────────────────
  // Each compound gets its own silhouette so you can tell whose front door you
  // are kicking in from across the map. Everything stays outside the 27-unit
  // compound foundation and clear of the inward approach the AI drives down.
  buildBaseDistricts() {
    (this.world.teams || []).forEach((team, index) => {
      const base = this.world.basePositions[team.id];
      if (!base) return;
      const district = BASE_DISTRICTS[index % BASE_DISTRICTS.length];
      const outward = new THREE.Vector3(base.x, 0, base.z).normalize();
      const side = new THREE.Vector3(-outward.z, 0, outward.x);
      const at = (out, across) => ({ x: base.x + outward.x * out + side.x * across, z: base.z + outward.z * out + side.z * across });
      const yaw = Math.atan2(outward.x, outward.z);

      const head = at(26, 0);
      const hall = this.building(head.x, head.z, 30, 18, district.roof, district.facade, { parapet: true, rotation: yaw });
      this.roofStair(hall, { margin: 12, lane: 4, landing: 4.4, run: 13 });

      for (const across of [-30, 30]) {
        const wing = at(18, across);
        const block = this.slab(wing.x, wing.z, 0, 16, 12, 6.5, district.facade, { repeat: 3, rotation: yaw });
        const entity = this.prop(block, 540, 8, 'outbuilding');
        this.standOn(block, 16, 12, 6.5, { blocking: true, elevated: true, entity });
      }
      for (const across of [-13, 13]) {
        const post = at(-33, across);
        this.pillar(post.x, post.z, 0, 1.1, 5.5, 'hazard');
      }

      if (district.mast === 'antenna') {
        this.slab(head.x, head.z, district.roof, 1.4, 1.4, 20, 'vehicle_metal', { repeat: 4, shadow: false });
        const dish = new THREE.Mesh(new THREE.SphereGeometry(3.4, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.mat('plating', 2));
        dish.position.set(head.x, district.roof + 20, head.z); dish.rotation.x = Math.PI * .82; this.scene.add(dish);
      } else if (district.mast === 'spire') {
        const spire = new THREE.Mesh(new THREE.ConeGeometry(5, 20, 8), this.mat(district.facade, 3));
        spire.position.set(head.x, district.roof + 10, head.z); spire.castShadow = true; this.scene.add(spire);
      } else if (district.mast === 'silo') {
        for (const across of [-22, 22]) {
          const point = at(40, across);
          this.pillar(point.x, point.z, 0, 4.2, 18, 'vehicle_metal');
        }
      } else if (district.mast === 'helipad') {
        const pad = this.slab(head.x, head.z, district.roof, 12, 12, .4, 'hazard', { repeat: 1, rotation: yaw });
        this.standOn(pad, 12, 12, .4, { elevated: true, navIgnore: true });
      } else {
        // A loading ramp climbing the outer wing's roof, not a wall.
        const point = at(33, 30);
        this.ramp(point.x, point.z, yaw + Math.PI, 0, 6.5, 20, 8, 'plating', { solid: true, navBlock: true, repeat: 2 });
      }

      const sign = at(-30, 0);
      this.districtSign(district.name, sign.x, sign.z, team.color ?? 0xffd23f);
      this.landmarks.push({ kind: 'district', name: district.name, x: base.x, z: base.z, y: 0 });
    });
  }
  districtSign(text, x, z, color) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
    const context = canvas.getContext('2d');
    context.fillStyle = 'rgba(8,12,22,.9)'; context.fillRect(4, 4, 504, 120);
    context.strokeStyle = `#${color.toString(16).padStart(6, '0')}`; context.lineWidth = 8; context.strokeRect(7, 7, 498, 114);
    context.fillStyle = '#fff'; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.font = `900 ${Math.max(28, Math.min(52, 900 / Math.max(8, text.length)))}px Impact,system-ui`;
    context.fillText(text, 256, 66);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
    sprite.position.set(x, 6.4, z); sprite.scale.set(13, 3.25, 1);
    this.scene.add(sprite);
  }

  // ── street dressing ───────────────────────────────────────────────────────
  buildStreetLife() {
    const lampHead = this.mat('hazard', 1, { emissive: 0xffd88a, emissiveIntensity: .8 });
    const onCarriageway = value => Math.abs(((value % BLOCK_STEP) + 90) % BLOCK_STEP - 30) > BLOCK_HALF - 2;
    // Lamp columns down the two central avenues, on the pavement side of the kerb.
    for (let offset = -168; offset <= 168; offset += 48) {
      if (onCarriageway(offset)) continue;
      for (const side of [-1, 1]) for (const [x, z] of [[offset, side * 12.4], [side * 12.4, offset]]) {
        if (Math.abs(x) < 17 && Math.abs(z) < 17) continue;
        this.batchSlab(x, z, CURB, .38, .38, 6.2, 'vehicle_metal', { repeat: 1, anchor: false });
        this.batchSlab(x, z, CURB + 6.2, 1.5, .6, .35, 'hazard', { material: lampHead, anchor: false });
      }
    }
    // Ring-boulevard lighting on the outer verge.
    for (let i = 0; i < 16; i++) {
      const angle = i / 16 * Math.PI * 2, radius = RING + 20;
      const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
      if (this.world.nearBase(x, z, 40)) continue;
      this.batchSlab(x, z, 0, .4, .4, 7, 'vehicle_metal', { repeat: 1, anchor: false });
      this.batchSlab(x, z, 7, 1.6, 1.6, .4, 'hazard', { material: lampHead, anchor: false });
    }
    // Traffic left where it stopped. Every spot is on tarmac, never a pavement.
    const paint = [0x39a8ff, 0xff4f66, 0xffcc38, 0x65e27c, 0xa06bff, 0xe8ecf2];
    let index = 0;
    for (const line of STREETS) for (const along of [-165, -105, -45, 45, 105, 165]) {
      for (const [x, z, rotation] of [[line + 5.2, along, 0], [along, line - 5.2, Math.PI / 2]]) {
        if (index++ % 3 || this.world.nearBase(x, z, 36)) continue;
        if (Math.abs(x) < 14 && Math.abs(z) < 14) continue;
        this.world.cars.push(this.world.factory.createCar(new THREE.Vector3(x, 0, z), rotation, paint[index % paint.length]));
      }
    }
    for (const [x, z, rotation] of [[-57, -137, .3], [63, 141, -2.6], [141, -57, 1.4], [-143, 63, -1.1], [-125, -5, 0], [125, 5, Math.PI]]) {
      this.world.motorcycles.push(this.world.factory.createMotorcycle(new THREE.Vector3(x, 0, z), rotation));
    }
    // Skips on alternating block corners: cheap cover that makes the kerbs read.
    let corner = 0;
    for (const cx of BLOCKS) for (const cz of BLOCKS) {
      if (++corner % 2) continue;
      const bin = this.slab(cx + 17.5, cz - 17.5, CURB, 3.4, 2.2, 2.2, 'vehicle_metal', { repeat: 1 });
      const entity = this.prop(bin, 140, 2, 'skip');
      this.world.registerCollider(bin, { shape: 'box', halfX: 1.7, halfZ: 1.1, top: 1.1, blocking: true, walkable: true }, entity);
    }
  }
}

// A silhouette skyline outside the play boundary. It carries no collision and
// no destructibles: it exists so the ground plane never simply stops against
// the sky, and so a city of this size reads as part of something bigger.
BedlamCity.prototype.buildHorizon = function buildHorizon() {
  const facades = ['urban_brick', 'neon_concrete', 'city_glass', 'concrete'];
  for (let i = 0; i < 52; i++) {
    const angle = i / 52 * Math.PI * 2;
    const radius = 344 + (i % 5) * 13;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    const height = 26 + ((i * 7) % 9) * 7, width = 24 + (i % 4) * 9;
    this.batchSlab(x, z, 0, width, width * .8, height, facades[i % facades.length], { repeat: 4, rotation: -angle, anchor: false });
    this.batchSlab(x, z, height, width + 1, width * .8 + 1, .8, 'rooftop', { repeat: 2, rotation: -angle, anchor: false });
  }
};

export function buildBedlamCity(world) { return new BedlamCity(world).build(); }
