import { describe, expect, it, beforeAll } from 'vitest';
import * as THREE from 'three';
import { CrateExpectations } from '../src/game/maps/CrateExpectations.js';
import { CANDY, CANDY_DISTRICTS, candyHeight, candyIsSyrup, distanceToPath } from '../src/data/mapSurfaces.js';
import { World, STEP_UP } from '../src/game/World.js';
import { MAPS, DEATHMATCH_SECRET_PLANS } from '../src/data/maps.js';

// Candyland is authored geometry on an authored heightfield, so its
// correctness is arithmetic and can be checked without a renderer: build it
// against a stub world standing on the real candyHeight, then walk every road
// and confirm both of its ends actually meet something you can stand on.

const BOUNDS = MAPS.crown.bounds;
const MAX_SLOPE = .42;          // steeper than this stops reading as a road

const stubWorld = () => {
  const world = {
    scene: new THREE.Scene(),
    materials: {
      building: () => new THREE.MeshBasicMaterial(),
      color: () => new THREE.MeshStandardMaterial(),
      textures: { water: new THREE.Texture(), chocolate: new THREE.Texture(), soda_fizz: new THREE.Texture() },
      ownedTextures: [], dynamicMaterials: [],
    },
    waterMaterial: new THREE.MeshBasicMaterial(),
    factory: { createCrate: () => ({}) },
    destructibles: [], colliders: [], crates: [], secretPlaces: [],
    interactiveStructures: [], motorcycles: [], cars: [], vehicles: [], wildlife: [], pickups: [],
    factories: {}, baseTurrets: {}, dominationTowers: [], teams: [], basePositions: {},
    colliderCellSize: 24, colliderIndex: new Map(), colliderIndexDirty: true,
    bounds: BOUNDS,
    cavePosition: new THREE.Vector3(96, 0, 34),
    heightAt: (x, z) => candyHeight(x, z),
    nearBase: () => false,
    nearDropZone: () => false,
  };
  for (const name of ['registerCollider', 'colliderFrame', 'colliderContains', 'colliderSurfaceAt', 'toColliderLocal',
    'fromColliderLocal', 'walkableTopAt', 'groundAt', 'collidersNear', 'collidersInBounds', 'rebuildColliderIndex',
    'resolveCollisions', 'seeded']) world[name] = World.prototype[name];
  return world;
};

let world, candyland, ramps;

beforeAll(() => {
  world = stubWorld();
  candyland = new CrateExpectations(world);
  candyland.build();
  world.rebuildColliderIndex();
  ramps = world.colliders.filter(collider => collider.shape === 'ramp');
});

// The two ends of a ramp in world space, plus a probe point just beyond each.
const ends = collider => {
  const frame = world.colliderFrame(collider), reach = collider.halfZ + 1.2;
  const point = lz => {
    const local = world.fromColliderLocal(0, lz, frame.rotation);
    return new THREE.Vector3(frame.position.x + local.x, 0, frame.position.z + local.z);
  };
  return {
    footProbe: point(-reach), footY: frame.position.y + collider.rampLow,
    crestProbe: point(reach), crestY: frame.position.y + collider.rampHigh,
    length: collider.halfZ * 2, rise: collider.rampHigh - collider.rampLow,
  };
};

describe('candyland landform', () => {
  it('stacks four exactly level cake tiers with a cliff between each pair', () => {
    for (const [index, tier] of CANDY.tiers.entries()) {
      for (const bearing of [0, 1.2, 2.5, 3.8, 5.1]) {
        // Just inside a tier's core the ground is that tier's level and nothing
        // else — which is what lets a road, a plaza and a ring of candles all
        // meet it flush.
        const reach = tier.core - 2;
        expect(candyHeight(Math.cos(bearing) * reach, Math.sin(bearing) * reach)).toBeCloseTo(tier.level, 4);
        // …and just outside it, the tier below.
        if (index === 0) continue;
        const foot = tier.core + tier.skirt + 1;
        expect(candyHeight(Math.cos(bearing) * foot, Math.sin(bearing) * foot)).toBeCloseTo(CANDY.tiers[index - 1].level, 1);
      }
    }
  });

  it('carves syrup below the syrup line and keeps the cake above it', () => {
    expect(candyHeight(CANDY.lake.x, CANDY.lake.z)).toBeLessThan(CANDY.syrupY);
    expect(candyHeight(CANDY.plunge.x, CANDY.plunge.z)).toBeLessThan(CANDY.syrupY);
    for (const t of [.1, .35, .6, .85]) {
      const index = Math.min(CANDY.river.length - 2, Math.floor(t * (CANDY.river.length - 1)));
      const local = t * (CANDY.river.length - 1) - index;
      const x = CANDY.river[index][0] + (CANDY.river[index + 1][0] - CANDY.river[index][0]) * local;
      const z = CANDY.river[index][1] + (CANDY.river[index + 1][1] - CANDY.river[index][1]) * local;
      expect(candyHeight(x, z)).toBeLessThan(CANDY.syrupY);
      expect(candyIsSyrup(x, z)).toBe(true);
    }
    // The cocoa run is held clear of the mountain, so the bottom tier survives
    // all the way round and the cake stays assailable from every bearing.
    for (const point of CANDY.river) expect(Math.hypot(point[0], point[1])).toBeGreaterThan(CANDY.tiers[0].core + 12);
  });

  it('never floods the summit, a district plaza or a base ring position', () => {
    expect(candyIsSyrup(0, 0)).toBe(false);
    expect(candyHeight(0, 0)).toBeCloseTo(CANDY.tiers[3].level, 4);
    for (const district of CANDY_DISTRICTS) {
      if (district.id === 'lake') continue;
      expect(candyIsSyrup(district.x, district.z)).toBe(false);
    }
    for (let i = 0; i < MAPS.crown.maxTeams; i++) {
      const angle = Math.PI / 2 + i / MAPS.crown.maxTeams * Math.PI * 2;
      const x = Math.cos(angle) * MAPS.crown.baseRadius, z = Math.sin(angle) * MAPS.crown.baseRadius;
      expect(candyIsSyrup(x, z)).toBe(false);
      expect(Number.isFinite(candyHeight(x, z))).toBe(true);
    }
  });

  it('keeps every authored district and secret clear of the mountain and of each other', () => {
    const places = [...CANDY_DISTRICTS, ...DEATHMATCH_SECRET_PLANS.crown];
    for (const place of places) {
      expect(Math.hypot(place.x, place.z)).toBeGreaterThan(CANDY.tiers[0].core + 20);
      expect(Math.max(Math.abs(place.x), Math.abs(place.z))).toBeLessThan(BOUNDS - 25);
    }
    for (let i = 0; i < places.length; i++) for (let j = i + 1; j < places.length; j++) {
      expect(Math.hypot(places[i].x - places[j].x, places[i].z - places[j].z)).toBeGreaterThan(34);
    }
  });
});

describe('candyland geometry', () => {
  it('builds a dense, fully finite candyland', () => {
    expect(world.destructibles.length).toBeGreaterThan(400);
    expect(ramps.length).toBeGreaterThan(10);
    expect(world.colliders.filter(collider => collider.walkable).length).toBeGreaterThan(150);
    for (const collider of world.colliders) {
      const frame = world.colliderFrame(collider);
      expect(Number.isFinite(frame.position.x + frame.position.y + frame.position.z)).toBe(true);
      expect(Number.isFinite(collider.top + collider.rampLow + collider.rampHigh)).toBe(true);
    }
  });

  it('keeps every authored surface inside the playable boundary', () => {
    for (const collider of world.colliders) {
      if (!collider.walkable) continue;
      const frame = world.colliderFrame(collider);
      const extent = collider.shape === 'cylinder' ? collider.radius : Math.hypot(collider.halfX, collider.halfZ);
      expect(Math.abs(frame.position.x) + extent).toBeLessThanOrEqual(BOUNDS);
      expect(Math.abs(frame.position.z) + extent).toBeLessThanOrEqual(BOUNDS);
    }
  });

  it('never authors a road too steep to read as a road', () => {
    for (const collider of ramps) {
      const { length, rise } = ends(collider);
      expect(rise).toBeGreaterThan(0);
      expect(rise / length).toBeLessThanOrEqual(MAX_SLOPE);
    }
  });

  // The gap test. A road whose foot or crest lands in mid-air is the exact bug
  // that makes a multi-level map feel broken, so check both ends of all of them.
  it('lands every ramp on a real surface at both ends', () => {
    const orphans = [];
    for (const collider of ramps) {
      const { footProbe, footY, crestProbe, crestY } = ends(collider);
      const foot = world.groundAt(footProbe, footY);
      const crest = world.groundAt(crestProbe, crestY);
      if (Math.abs(foot - footY) > STEP_UP) orphans.push(`foot ${footProbe.x.toFixed(1)},${footProbe.z.toFixed(1)} wanted ${footY.toFixed(2)} got ${foot.toFixed(2)}`);
      if (Math.abs(crest - crestY) > STEP_UP) orphans.push(`crest ${crestProbe.x.toFixed(1)},${crestProbe.z.toFixed(1)} wanted ${crestY.toFixed(2)} got ${crest.toFixed(2)}`);
    }
    expect(orphans).toEqual([]);
  });

  // Walk the Grand Spiral the way a player would — one short stride at a time,
  // carrying the height from the previous step — from the buttercream all the
  // way to the crate drop. This is the map's headline promise: a road that
  // spirals upward and connects to every other road on the way.
  it('climbs the Grand Spiral from the ring road to the crate crown without a break', () => {
    const nodes = candyland.spiralNodes();
    let height = world.groundAt(new THREE.Vector3(nodes[0].x, nodes[0].y, nodes[0].z), nodes[0].y);
    let worst = 0, at = null;
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i], b = nodes[i + 1];
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .5));
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const point = new THREE.Vector3(a.x + (b.x - a.x) * t, height, a.z + (b.z - a.z) * t);
        const next = world.groundAt(point, height);
        if (next - height > worst) { worst = next - height; at = `${point.x.toFixed(1)},${point.z.toFixed(1)}`; }
        height = next;
      }
    }
    expect(`${worst.toFixed(2)} at ${at}`).toBe(`${Math.min(worst, STEP_UP).toFixed(2)} at ${at}`);
    expect(height).toBeGreaterThanOrEqual(CANDY.tiers[3].level - .6);
  });

  it('leaves the top of every climb open to walk out of', () => {
    const walled = [];
    for (const collider of ramps) {
      const { crestProbe, crestY } = ends(collider);
      const mover = { group: { position: new THREE.Vector3(crestProbe.x, crestY, crestProbe.z) }, radius: .6 };
      const before = mover.group.position.clone();
      world.resolveCollisions(mover);
      const pushed = Math.hypot(mover.group.position.x - before.x, mover.group.position.z - before.z);
      if (pushed > .35) walled.push(`${before.x.toFixed(1)},${crestY.toFixed(1)},${before.z.toFixed(1)} pushed ${pushed.toFixed(2)}`);
    }
    expect(walled).toEqual([]);
  });

  // Terrain steepness never stops anyone in this engine, so if the cake walls
  // are not real blockers the spiral and the steps are decoration and everyone
  // simply strolls up the side of the mountain.
  it('walls every cake tier except where a road or a stair asked for a door', () => {
    for (let tier = 1; tier < CANDY.tiers.length; tier++) {
      const reach = CANDY.tiers[tier].core + 2.6, below = CANDY.tiers[tier - 1].level;
      let blocked = 0, open = 0;
      for (let i = 0; i < 64; i++) {
        const bearing = i / 64 * Math.PI * 2;
        const point = new THREE.Vector3(Math.cos(bearing) * reach, below, Math.sin(bearing) * reach);
        const mover = { group: { position: point.clone() }, radius: .72 };
        world.resolveCollisions(mover);
        if (Math.hypot(mover.group.position.x - point.x, mover.group.position.z - point.z) > .3) blocked++; else open++;
      }
      expect(blocked, `tier ${tier} is not walled`).toBeGreaterThan(40);
      expect(open, `tier ${tier} has no doors`).toBeGreaterThanOrEqual(2);
    }
  });

  it('climbs the Wafer Steps one tread at a time on every wall they cut', () => {
    const flights = candyland.landmarks.filter(mark => mark.kind === 'stair');
    expect(flights).toHaveLength(CANDY.tiers.length - 1);
    const breaks = [];
    for (const [index, flight] of flights.entries()) {
      const tier = index + 1, boundary = CANDY.tiers[tier].core;
      let height = CANDY.tiers[tier - 1].level, worst = 0, at = 0;
      for (let reach = boundary + flight.run + 3; reach >= boundary - 8; reach -= .5) {
        const point = new THREE.Vector3(Math.cos(flight.bearing) * reach, height, Math.sin(flight.bearing) * reach);
        const next = world.groundAt(point, height);
        if (next - height > worst) { worst = next - height; at = reach; }
        height = next;
      }
      if (worst > STEP_UP) breaks.push(`${flight.name} rises ${worst.toFixed(2)} at r=${at}`);
      if (height < CANDY.tiers[tier].level - .6) breaks.push(`${flight.name} tops out at ${height.toFixed(2)}`);
    }
    expect(breaks).toEqual([]);
  });

  it('never plants a destructible in open syrup', () => {
    const drowned = world.destructibles.filter(entity => {
      const position = entity.group.position;
      return position.y < CANDY.syrupY - .8 && candyIsSyrup(position.x, position.z);
    });
    expect(drowned.map(entity => `${entity.subtype} ${entity.group.position.x.toFixed(0)},${entity.group.position.z.toFixed(0)}`)).toEqual([]);
  });

  it('gives every cocoa crossing a dry surface above the syrup line', () => {
    const crossings = candyland.landmarks.filter(mark => mark.kind === 'crossing');
    expect(crossings.length).toBeGreaterThanOrEqual(4);
    for (const crossing of crossings) {
      expect(distanceToPath(crossing.x, crossing.z, CANDY.river)).toBeLessThan(CANDY.riverHalf + 6);
      const top = world.groundAt(new THREE.Vector3(crossing.x, crossing.y, crossing.z), crossing.y);
      expect(top).toBeGreaterThan(CANDY.syrupY);
    }
  });

  it('flies three rainbow bridges that land on the tier they claim', () => {
    const bridges = candyland.landmarks.filter(mark => mark.kind === 'bridge');
    expect(bridges).toHaveLength(3);
    expect(new Set(bridges.map(mark => mark.name)).size).toBe(3);
    for (const bridge of bridges) {
      const deck = world.groundAt(new THREE.Vector3(bridge.x, bridge.y, bridge.z), bridge.y);
      expect(deck).toBeCloseTo(bridge.y, 0);
      // …and nothing offers that deck to someone walking underneath it.
      expect(world.groundAt(new THREE.Vector3(bridge.x, 1, bridge.z), 1)).toBeLessThan(bridge.y - 3);
    }
  });

  it('names the summit, the mountain, both climbs, the falls and all six districts', () => {
    const named = new Set(candyland.landmarks.map(mark => mark.name));
    for (const district of CANDY_DISTRICTS) expect(named.has(district.name)).toBe(true);
    for (const expected of ['THE CRATE CROWN', 'MOUNT GUMDROP', 'THE GRAND SPIRAL', 'THE WAFER STEPS',
      'THE CHOCOLATE FALLS', 'THE COCOA RUN', 'THE SUGAR RING ROAD', 'THE GUMBALL WORKS',
      'THE PEPPERMINT SPAN', 'THE FLOSSWOOD SKYWAY', 'THE JAWBREAKER CAUSEWAY', 'THE SUGAR WILDS']) {
      expect(named.has(expected), `missing landmark ${expected}`).toBe(true);
    }
  });

  // Every point light is compiled into every lit material's fragment shader.
  // A candyland wants a lantern on every stick and a candle on every tier, and
  // thirty of them silently overruns the uniform budget: the shaders fail to
  // link and the entire map renders black. Set pieces get real lights; the rest
  // glow with emissive materials.
  it('stays inside the fragment shader light budget', () => {
    const lights = [];
    world.scene.traverse(object => { if (object.isPointLight) lights.push(object); });
    expect(lights.length).toBeLessThanOrEqual(8);
    expect(lights.length).toBeGreaterThan(1);
  });

  it('hides one authored cache behind the chocolate falls', () => {
    expect(world.secretPlaces.map(place => place.name)).toContain('BEHIND THE CHOCOLATE FALLS');
    expect(world.crates).toHaveLength(1);
  });
});

describe('candyland reactions', () => {
  const gumballs = () => world.destructibles.filter(entity => entity.subtype === 'gumball');
  const candies = () => world.destructibles.filter(entity => String(entity.subtype).startsWith('candy-'));

  it('scatters giant gumballs and colour-changing candies across the map', () => {
    expect(gumballs().length).toBeGreaterThan(20);
    expect(candies().length).toBeGreaterThan(20);
    for (const entity of [...gumballs(), ...candies()]) expect(typeof entity.onHit).toBe('function');
  });

  it('rolls a gumball away from the shot that hit it, and spins it as it goes', () => {
    const ball = candyland.animated.gumballs.find(entry => !entry.entity.dead);
    const start = ball.group.position.clone();
    const spin = ball.shell.quaternion.clone();
    ball.entity.onHit(40, null, new THREE.Vector3(1, 0, 0));
    expect(ball.velocity.length()).toBeGreaterThan(4);
    for (let i = 0; i < 40; i++) world.candyAnimation.update(i / 60, 1 / 60);
    const travelled = Math.hypot(ball.group.position.x - start.x, ball.group.position.z - start.z);
    expect(travelled).toBeGreaterThan(1.5);
    expect(ball.group.position.x).toBeGreaterThan(start.x);
    expect(ball.shell.quaternion.angleTo(spin)).toBeGreaterThan(.2);
    // It rides the ground it rolls over rather than skating through it.
    expect(ball.group.position.y).toBeCloseTo(world.groundAt(ball.group.position, ball.group.position.y) + ball.radius, 2);
  });

  it('never lets a rolling gumball leave the footprint its collider was indexed over', () => {
    const ball = candyland.animated.gumballs[1];
    for (let i = 0; i < 12; i++) ball.entity.onHit(90, null, new THREE.Vector3(1, 0, 1));
    for (let i = 0; i < 600; i++) world.candyAnimation.update(i / 60, 1 / 60);
    const drift = Math.hypot(ball.group.position.x - ball.home.x, ball.group.position.z - ball.home.y);
    expect(drift).toBeLessThanOrEqual(ball.rollLimit + .01);
    expect(Number.isFinite(ball.group.position.y)).toBe(true);
  });

  it('gives every rolling gumball broadphase slack for its whole travel', () => {
    for (const ball of candyland.animated.gumballs) {
      const collider = ball.entity.colliderHandles.find(handle => handle.motionPad > 0);
      expect(collider, 'a gumball registered no padded collider').toBeTruthy();
      expect(collider.motionPad).toBeGreaterThanOrEqual(ball.rollLimit);
    }
  });

  it('advances a candy one step round the palette on every hit, and lights it up', () => {
    const candy = candyland.animated.candies[0];
    const before = candy.material.color.getHex();
    candy.entity.onHit(12, null, new THREE.Vector3(0, 0, 1));
    expect(candy.material.color.getHex()).not.toBe(before);
    expect(candy.flash).toBe(1);
    world.candyAnimation.update(1, 1 / 60);
    expect(candy.material.emissiveIntensity).toBeGreaterThan(.25);
    // Its material is its own: repainting one candy must not repaint the map.
    const other = candyland.animated.candies[1];
    expect(other.material).not.toBe(candy.material);
    for (let i = 0; i < CANDY_COLORS_LENGTH; i++) candy.entity.onHit(12, null, null);
    expect(candy.material.color.getHex()).not.toBe(0x000000);
  });

  // One bad frame clock would otherwise propagate into a light intensity and
  // NaN out every lit material on the map — a black screen that needs a running
  // match to reproduce.
  it('refuses to animate on a non-finite clock', () => {
    const before = [];
    world.scene.traverse(object => { if (object.isLight) before.push(object.intensity); });
    world.candyAnimation.update(undefined, 1 / 60);
    world.candyAnimation.update(1, NaN);
    const after = [];
    world.scene.traverse(object => { if (object.isLight) after.push(object.intensity); });
    expect(after).toEqual(before);
    world.candyAnimation.update(2, 1 / 60);
    world.scene.traverse(object => { if (object.isLight) expect(Number.isFinite(object.intensity)).toBe(true); });
  });
});

const CANDY_COLORS_LENGTH = 8;
