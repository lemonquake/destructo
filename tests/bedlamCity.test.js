import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import * as THREE from 'three';
import { BedlamCity } from '../src/game/maps/BedlamCity.js';
import { BEDLAM } from '../src/data/mapSurfaces.js';
import { World, STEP_UP } from '../src/game/World.js';
import { CombatSystem } from '../src/game/CombatSystem.js';
import { MAPS } from '../src/data/maps.js';

// The city is authored geometry, so its correctness is arithmetic and can be
// checked without a renderer: build it against a stub world, then walk every
// ramp and confirm both of its ends actually meet something you can stand on.

const BOUNDS = MAPS.crossroads.bounds;
const MAX_SLOPE = .42;          // steeper than this stops reading as a ramp

const canvasStub = () => ({
  width: 0, height: 0,
  getContext: () => new Proxy({}, { get: () => () => {} }),
});

const stubWorld = (teamCount = 12) => {
  const world = {
    scene: new THREE.Scene(),
    materials: { building: () => new THREE.MeshBasicMaterial() },
    factory: { createCar: () => ({}), createMotorcycle: () => ({}), createWildlife: () => ({}) },
    destructibles: [], colliders: [], cars: [], motorcycles: [],
    interactiveStructures: [], baseTurrets: {}, factories: {},
    colliderCellSize: 24, colliderIndex: new Map(), colliderIndexDirty: true,
    heightAt: () => 0,
    createTree: () => {},
    nearBase: () => false,
    teams: [], basePositions: {},
  };
  for (const name of ['registerCollider', 'colliderFrame', 'colliderContains', 'colliderSurfaceAt', 'toColliderLocal', 'fromColliderLocal', 'walkableTopAt', 'groundAt', 'collidersNear', 'collidersInBounds', 'rebuildColliderIndex', 'resolveCollisions', 'seeded']) world[name] = World.prototype[name];
  for (let i = 0; i < teamCount; i++) {
    const id = `t${i}`, angle = Math.PI / 2 + i / teamCount * Math.PI * 2;
    world.teams.push({ id, color: 0x2fb4ff });
    world.basePositions[id] = new THREE.Vector3(Math.cos(angle) * MAPS.crossroads.baseRadius, 0, Math.sin(angle) * MAPS.crossroads.baseRadius);
  }
  return world;
};

let world, city, ramps;

beforeAll(() => {
  globalThis.document = { createElement: canvasStub };
  world = stubWorld();
  city = new BedlamCity(world);
  city.build();
  world.rebuildColliderIndex();
  ramps = world.colliders.filter(collider => collider.shape === 'ramp');
});
afterAll(() => { delete globalThis.document; });

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

describe('Bumper-to-Bumper Bedlam city geometry', () => {
  it('builds a dense, fully finite city for a twelve-team roster', () => {
    expect(world.destructibles.length).toBeGreaterThan(80);
    expect(ramps.length).toBeGreaterThan(30);
    expect(world.colliders.filter(c => c.walkable).length).toBeGreaterThan(150);
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
  // stride at a time, carrying the height from the previous step. A surface
  // that jumps more than the step-over tolerance anywhere along the way is a
  // ledge the climb dead-ends against.
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

  // The other half of "the ramp works": arriving somewhere you are allowed to
  // stand. A roof parapet or deck rail left across the top of a climb makes a
  // surface you can see, reach, and never actually step onto.
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

  it('steps from carriageway to pavement without a ramp', () => {
    const { curbHeight, roadHalf, blockHalf } = BEDLAM;
    // Mid-carriageway is bare road; a stride onto the block is one kerb up.
    expect(world.groundAt(new THREE.Vector3(0, 0, -150), 0)).toBe(0);
    expect(world.groundAt(new THREE.Vector3(-roadHalf - 2, 0, -150), 0)).toBeCloseTo(curbHeight);
    expect(curbHeight).toBeLessThan(STEP_UP);
    expect(blockHalf * 2 + roadHalf * 2).toBe(60);
  });

  it('leaves the street under the viaduct open and the deck standable', () => {
    // Mid-span, between two pylons: the road below is clear at ground level and
    // the deck only becomes a surface once you are up on it.
    const span = new THREE.Vector3(0, 0, -100);
    expect(world.groundAt(span, 0)).toBe(0);
    expect(world.groundAt(new THREE.Vector3(0, 14.5, -100), 14.5)).toBeGreaterThan(13);
    const mover = { group: { position: span.clone() }, radius: .72 };
    world.resolveCollisions(mover);
    expect(mover.group.position.x).toBeCloseTo(0);
    expect(mover.group.position.z).toBeCloseTo(-100);
    // The pylons themselves still stop you dead.
    const intoPylon = { group: { position: new THREE.Vector3(1, 0, -80) }, radius: .72 };
    world.resolveCollisions(intoPylon);
    expect(Math.hypot(intoPylon.group.position.x, intoPylon.group.position.z + 80)).toBeGreaterThan(3);
  });

  // Ballistics asks the world for "the floor" every step. Without the shooter's
  // own height in that question the world answers with the highest surface over
  // the column — the viaduct deck — and every round fired in the street below
  // detonates immediately against a ceiling it thinks is the ground.
  describe('shooting under elevated structures', () => {
    const combat = () => Object.assign(Object.create(CombatSystem.prototype), { world });

    it('does not treat the deck overhead as the floor', () => {
      const under = new THREE.Vector3(0, 1.6, -100);
      expect(world.groundAt(under, under.y)).toBe(0);
      expect(combat().projectileFloor(under)).toBe(0);
      // …but a round arriving from above still lands on the deck.
      const above = new THREE.Vector3(0, 15, -100);
      expect(combat().projectileFloor(above)).toBeGreaterThan(13);
    });

    it('flies a full burst down the street under the viaduct without impact', () => {
      const shooter = new THREE.Vector3(-60, 1.6, -100), aim = new THREE.Vector3(60, 1.6, -100);
      expect(combat().terrainHit(shooter, aim)).toBeNull();
    });

    it('still stops a round fired down onto the deck from above', () => {
      const hit = combat().terrainHit(new THREE.Vector3(0, 20, -100), new THREE.Vector3(0, 8, -100));
      expect(hit).not.toBeNull();
    });

    // The wedge, not its bounding box: an embankment must not stop a shot
    // crossing the open air above its shallow end.
    it('lets a shot pass over the low end of a ramp', () => {
      const shots = combat();
      const embankment = ramps.find(collider => collider.rampHigh > 10 && collider.rampThickness === Infinity);
      expect(embankment).toBeTruthy();
      const frame = world.colliderFrame(embankment);
      const low = world.fromColliderLocal(0, -embankment.halfZ + 2, frame.rotation);
      const across = world.fromColliderLocal(embankment.halfX + 6, -embankment.halfZ + 2, frame.rotation);
      const height = frame.position.y + embankment.rampLow + 6;   // well above the wedge here
      const start = new THREE.Vector3(frame.position.x + across.x, height, frame.position.z + across.z);
      const end = new THREE.Vector3(frame.position.x + low.x, height, frame.position.z + low.z);
      expect(shots.colliderHit(start, end, embankment)).toBeNull();
      // The same shot at deck height, over the steep end, does connect.
      const highLocal = world.fromColliderLocal(0, embankment.halfZ - 2, frame.rotation);
      const highAcross = world.fromColliderLocal(embankment.halfX + 6, embankment.halfZ - 2, frame.rotation);
      const deckY = frame.position.y + embankment.rampLow + (embankment.rampHigh - embankment.rampLow) * .85;
      expect(shots.colliderHit(
        new THREE.Vector3(frame.position.x + highAcross.x, deckY, frame.position.z + highAcross.z),
        new THREE.Vector3(frame.position.x + highLocal.x, deckY, frame.position.z + highLocal.z),
        embankment)).not.toBeNull();
    });
  });

  it('gives all twelve compounds their own named district', () => {
    const districts = city.landmarks.filter(mark => mark.kind === 'district');
    expect(districts).toHaveLength(12);
    expect(new Set(districts.map(mark => mark.name)).size).toBe(12);
  });

  it('offers roof access all over the map, not just downtown', () => {
    const roofs = city.landmarks.filter(mark => mark.kind === 'roof');
    expect(roofs.length).toBeGreaterThan(8);
    expect(roofs.some(mark => Math.hypot(mark.x, mark.z) > 120)).toBe(true);
    expect(Math.max(...roofs.map(mark => mark.y))).toBeGreaterThanOrEqual(26);
  });
});
