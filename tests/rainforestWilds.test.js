import { describe, expect, it, beforeAll } from 'vitest';
import * as THREE from 'three';
import { RainforestWilds } from '../src/game/maps/RainforestWilds.js';
import { WILDS, WILDS_TEMPLES, wildsHeight, wildsIsWater, distanceToPath } from '../src/data/mapSurfaces.js';
import { World, STEP_UP } from '../src/game/World.js';
import { MAPS } from '../src/data/maps.js';

// The rainforest is authored geometry on an authored heightfield, so its
// correctness is arithmetic and can be checked without a renderer: build it
// against a stub world standing on the real wildsHeight, then walk every ramp
// and confirm both of its ends actually meet something you can stand on.

const BOUNDS = MAPS.wilds.bounds;
const MAX_SLOPE = .42;          // steeper than this stops reading as a ramp

const stubWorld = () => {
  const world = {
    scene: new THREE.Scene(),
    materials: {
      building: () => new THREE.MeshBasicMaterial(),
      color: () => new THREE.MeshBasicMaterial(),
      textures: { water: new THREE.Texture() },
      ownedTextures: [], dynamicMaterials: [],
    },
    waterMaterial: new THREE.MeshBasicMaterial(),
    factory: { createCrate: () => ({}) },
    destructibles: [], colliders: [], crates: [], secretPlaces: [],
    interactiveStructures: [], motorcycles: [], cars: [], vehicles: [], wildlife: [], pickups: [],
    factories: {}, baseTurrets: {}, dominationTowers: [], teams: [], basePositions: {},
    colliderCellSize: 24, colliderIndex: new Map(), colliderIndexDirty: true,
    bounds: BOUNDS,
    cavePosition: new THREE.Vector3(0, 0, -112),
    heightAt: (x, z) => wildsHeight(x, z),
    nearBase: () => false,
    nearDropZone: () => false,
  };
  for (const name of ['registerCollider', 'colliderFrame', 'colliderContains', 'colliderSurfaceAt', 'toColliderLocal',
    'fromColliderLocal', 'walkableTopAt', 'groundAt', 'collidersNear', 'collidersInBounds', 'rebuildColliderIndex',
    'resolveCollisions', 'seeded']) world[name] = World.prototype[name];
  return world;
};

let world, forest, ramps;

beforeAll(() => {
  world = stubWorld();
  forest = new RainforestWilds(world);
  forest.build();
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

describe('the very hungry wilderness landform', () => {
  it('carves water below the waterline and keeps the plateau above it', () => {
    expect(wildsHeight(WILDS.lagoon.x, WILDS.lagoon.z)).toBeLessThan(WILDS.waterY);
    expect(wildsHeight(WILDS.plunge.x, WILDS.plunge.z)).toBeLessThan(WILDS.waterY);
    for (const t of [.1, .35, .6, .85]) {
      const index = Math.min(WILDS.river.length - 2, Math.floor(t * (WILDS.river.length - 1)));
      const local = t * (WILDS.river.length - 1) - index;
      const x = WILDS.river[index][0] + (WILDS.river[index + 1][0] - WILDS.river[index][0]) * local;
      const z = WILDS.river[index][1] + (WILDS.river[index + 1][1] - WILDS.river[index][1]) * local;
      expect(wildsHeight(x, z)).toBeLessThan(WILDS.waterY);
      expect(wildsIsWater(x, z)).toBe(true);
    }
  });

  it('gives the mesa a genuinely flat top and a cliff, not a hill', () => {
    for (const bearing of [0, 1.1, 2.4, 3.9, 5.2]) {
      for (const reach of [0, 12, 28, WILDS.mesa.core - 2]) {
        const x = WILDS.mesa.x + Math.cos(bearing) * reach, z = WILDS.mesa.z + Math.sin(bearing) * reach;
        expect(wildsHeight(x, z)).toBeCloseTo(WILDS.mesa.level, 4);
      }
      // The skirt drops most of that height inside six metres.
      const foot = WILDS.mesa.core + WILDS.mesa.skirt + 2;
      const x = WILDS.mesa.x + Math.cos(bearing) * foot, z = WILDS.mesa.z + Math.sin(bearing) * foot;
      expect(wildsHeight(x, z)).toBeLessThan(WILDS.mesa.level - 15);
    }
  });

  it('never floods the plateau, the ziggurat plaza or a base ring position', () => {
    expect(wildsIsWater(WILDS.mesa.x, WILDS.mesa.z)).toBe(false);
    expect(wildsIsWater(0, 0)).toBe(false);
    expect(wildsHeight(0, 0)).toBeCloseTo(WILDS.temple.level, 4);
    for (let i = 0; i < 9; i++) {
      const angle = Math.PI / 2 + i / 9 * Math.PI * 2;
      const x = Math.cos(angle) * MAPS.wilds.baseRadius, z = Math.sin(angle) * MAPS.wilds.baseRadius;
      expect(wildsIsWater(x, z)).toBe(false);
      expect(Number.isFinite(wildsHeight(x, z))).toBe(true);
    }
  });
});

describe('the very hungry wilderness geometry', () => {
  it('builds a dense, fully finite rainforest', () => {
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

  it('never authors a ramp too steep to read as a ramp', () => {
    for (const collider of ramps) {
      const { length, rise } = ends(collider);
      expect(rise).toBeGreaterThan(0);
      expect(rise / length).toBeLessThanOrEqual(MAX_SLOPE);
    }
  });

  // The gap test. A ramp whose foot or crest lands in mid-air is the exact bug
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

  // Walk the whole length of every ramp the way a player would — one short
  // stride at a time, carrying the height from the previous step.
  it('climbs smoothly from the foot of every ramp to its crest', () => {
    const breaks = [];
    for (const collider of ramps) {
      const frame = world.colliderFrame(collider), reach = collider.halfZ + 1;
      let height = frame.position.y + collider.rampLow, worst = 0, at = null;
      for (let travel = -reach; travel <= reach; travel += .5) {
        const local = world.fromColliderLocal(0, travel, frame.rotation);
        const point = new THREE.Vector3(frame.position.x + local.x, height, frame.position.z + local.z);
        const next = world.groundAt(point, height);
        const rise = next - height;
        if (rise > worst) { worst = rise; at = travel; }
        height = next;
      }
      if (worst > STEP_UP) breaks.push(`${frame.position.x.toFixed(1)},${frame.position.z.toFixed(1)} rises ${worst.toFixed(2)} at ${at}`);
    }
    expect(breaks).toEqual([]);
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

  // Six one-metre risers: the ziggurat has to be climbable from any bearing
  // without a single authored ramp, which is what makes it hold under fire.
  it('climbs the ziggurat one step at a time from every side', () => {
    const crown = wildsHeight(0, 0) + 5, breaks = [];
    for (const bearing of [0, .8, 1.05, 2.1, 2.4, 3.15, 3.9, 4.2, 5.25, 5.6]) {
      let height = wildsHeight(Math.cos(bearing) * 28, Math.sin(bearing) * 28), worst = 0, at = 0;
      for (let reach = 28; reach >= 0; reach -= .5) {
        const point = new THREE.Vector3(Math.cos(bearing) * reach, height, Math.sin(bearing) * reach);
        const next = world.groundAt(point, height);
        if (next - height > worst) { worst = next - height; at = reach; }
        height = next;
      }
      if (worst > STEP_UP) breaks.push(`bearing ${bearing} rises ${worst.toFixed(2)} at r=${at}`);
      expect(height).toBeGreaterThanOrEqual(crown - .1);
    }
    expect(breaks).toEqual([]);
  });

  // The cliff is the whole point of the mesa: if you can stroll up the terrain
  // the stair and the fallen titan are decoration.
  it('walls the mesa everywhere except its two authored approaches', () => {
    let blocked = 0, open = 0;
    for (let i = 0; i < 48; i++) {
      const bearing = i / 48 * Math.PI * 2;
      const reach = WILDS.mesa.core + 3.4;
      const point = new THREE.Vector3(WILDS.mesa.x + Math.cos(bearing) * reach, wildsHeight(0, 0), WILDS.mesa.z + Math.sin(bearing) * reach);
      const mover = { group: { position: point.clone() }, radius: .72 };
      world.resolveCollisions(mover);
      if (Math.hypot(mover.group.position.x - point.x, mover.group.position.z - point.z) > .3) blocked++; else open++;
    }
    expect(blocked).toBeGreaterThan(34);
    expect(open).toBeGreaterThanOrEqual(3);
  });

  it('never plants a destructible in open water', () => {
    const drowned = world.destructibles.filter(entity => {
      const position = entity.group.position;
      return entity.subtype !== 'raft' && position.y < WILDS.waterY - .8 && wildsIsWater(position.x, position.z);
    });
    expect(drowned.map(entity => `${entity.subtype} ${entity.group.position.x.toFixed(0)},${entity.group.position.z.toFixed(0)}`)).toEqual([]);
  });

  it('gives every river crossing a dry surface above the waterline', () => {
    const crossings = forest.landmarks.filter(mark => mark.kind === 'crossing');
    expect(crossings.length).toBeGreaterThanOrEqual(4);
    for (const crossing of crossings) {
      expect(distanceToPath(crossing.x, crossing.z, WILDS.river)).toBeLessThan(WILDS.riverHalf + 6);
      const top = world.groundAt(new THREE.Vector3(crossing.x, crossing.y, crossing.z), crossing.y);
      expect(top).toBeGreaterThan(WILDS.waterY);
    }
  });

  it('strings a closed canopy loop with ground access', () => {
    const canopy = forest.landmarks.filter(mark => mark.kind === 'canopy');
    expect(canopy).toHaveLength(8);
    expect(new Set(canopy.map(mark => mark.name)).size).toBe(8);
    for (const node of canopy) {
      const deck = world.groundAt(new THREE.Vector3(node.x, node.y, node.z), node.y);
      expect(deck).toBeCloseTo(node.y, 1);
      // …and nothing offers that deck to someone standing underneath it.
      expect(world.groundAt(new THREE.Vector3(node.x, 1, node.z), 1)).toBeLessThan(node.y - 8);
    }
  });

  it('names the four lost temples, the falls, the terraces and both camps', () => {
    const named = new Set(forest.landmarks.map(mark => mark.name));
    for (const temple of WILDS_TEMPLES) expect(named.has(temple.name)).toBe(true);
    for (const expected of ['THE ROARING VEIL', 'THE HUNGRY IDOL', 'THE THOUSAND STEPS', 'THE FALLEN TITAN',
      'BAMBOO TERRACES', 'THE DROWNED ROOTLANDS', 'THE COLD LANTERN', 'THUNDERHEAD OVERLOOK',
      'SURVEYOR CAMP DELTA', 'PORTER CAMP SEVEN']) expect(named.has(expected)).toBe(true);
  });

  // Every point light is compiled into every lit material's fragment shader.
  // A rainforest wants a lantern on each platform and a brazier at each shrine,
  // and thirty of them silently overruns the uniform budget: the shaders fail
  // to link and the entire map renders black. Set pieces get real lights; the
  // rest glow with emissive materials and additive shells.
  it('stays inside the fragment shader light budget', () => {
    const lights = [];
    world.scene.traverse(object => { if (object.isPointLight) lights.push(object); });
    expect(lights.length).toBeLessThanOrEqual(8);
    expect(lights.length).toBeGreaterThan(2);
  });

  // One bad frame clock would otherwise propagate into a light intensity and
  // NaN out every lit material on the map — the same black-screen failure by a
  // different route, and far harder to spot because it needs a running match.
  it('refuses to animate on a non-finite clock', () => {
    const before = [];
    world.scene.traverse(object => { if (object.isLight) before.push(object.intensity); });
    world.wildsAnimation.update(undefined, 1 / 60);
    world.wildsAnimation.update(1, NaN);
    const after = [];
    world.scene.traverse(object => { if (object.isLight) after.push(object.intensity); });
    expect(after).toEqual(before);
    world.wildsAnimation.update(2, 1 / 60);
    world.scene.traverse(object => { if (object.isLight) expect(Number.isFinite(object.intensity)).toBe(true); });
  });

  it('hides one authored cache behind the waterfall', () => {
    expect(world.secretPlaces.map(place => place.name)).toContain('BEHIND THE ROARING VEIL');
    expect(world.crates).toHaveLength(1);
  });
});
