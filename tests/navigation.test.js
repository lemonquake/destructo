import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { NavGrid } from '../src/game/Navigation.js';
import { AIController } from '../src/game/AIController.js';

const makeWorld = (obstacles = [], bounds = 40) => ({
  bounds,
  colliders: [],
  destructibles: obstacles,
  interactiveStructures: [],
  baseTurrets: {},
  factories: {},
  cavePosition: null,
  hasWater: false,
  heightAt: () => 0,
  groundAt: () => 0,
  isWater: () => false,
  clamp: () => {},
  colliderFrame: c => ({ position: c.object.position, rotation: c.object.rotation?.y || 0 }),
});
const rock = (x, z, radius) => ({ dead: false, radius, group: { position: new THREE.Vector3(x, 0, z) } });

describe('NavGrid', () => {
  it('rasterizes obstacles and answers blocked/line queries', () => {
    const world = makeWorld([rock(0, 0, 6)]);
    const nav = new NavGrid(world);
    nav.rebuild();
    expect(nav.blockedAt(0, 0)).toBe(true);
    expect(nav.blockedAt(20, 0)).toBe(false);
    expect(nav.lineClear(new THREE.Vector3(-15, 0, 0), new THREE.Vector3(15, 0, 0))).toBe(false);
    expect(nav.lineClear(new THREE.Vector3(-15, 0, 20), new THREE.Vector3(15, 0, 20))).toBe(true);
  });
  it('routes around a blocking obstacle instead of through it', () => {
    const world = makeWorld([rock(0, 0, 6)]);
    const nav = new NavGrid(world);
    const path = nav.findPath(new THREE.Vector3(-15, 0, 0), new THREE.Vector3(15, 0, 0));
    expect(path).toBeTruthy();
    expect(path.length).toBeGreaterThan(1);
    // the detour must bulge away from the straight line through the rock
    const bulge = Math.max(...path.map(p => Math.abs(p.z)));
    expect(bulge).toBeGreaterThan(5);
    // every leg of the smoothed path is walkable
    let anchor = new THREE.Vector3(-15, 0, 0);
    for (const p of path) { expect(nav.lineClear(anchor, p)).toBe(true); anchor = p; }
  });
  it('frees cells once a destroyed obstacle invalidates the grid', () => {
    const obstacle = rock(0, 0, 6);
    const world = makeWorld([obstacle]);
    const nav = new NavGrid(world);
    nav.rebuild();
    expect(nav.blockedAt(0, 0)).toBe(true);
    obstacle.dead = true;
    nav.invalidate();
    nav.rebuild();
    expect(nav.blockedAt(0, 0)).toBe(false);
    expect(nav.version).toBe(2);
  });
  it('snaps an unreachable goal to the nearest walkable approach', () => {
    const world = makeWorld([rock(10, 0, 5)]);
    const nav = new NavGrid(world);
    const path = nav.findPath(new THREE.Vector3(-10, 0, 0), new THREE.Vector3(10, 0, 0));
    expect(path).toBeTruthy();
    const end = path[path.length - 1];
    expect(nav.blockedAt(end.x, end.z)).toBe(false);
    // the approach point hugs the obstacle rather than giving up far away
    expect(end.distanceTo(new THREE.Vector3(10, 0, 0))).toBeLessThan(9);
  });
});

describe('AI path following', () => {
  it('walks around a wall to reach the goal without getting stuck', () => {
    const obstacle = rock(0, 0, 6);
    const world = makeWorld([obstacle]);
    // real collision: circular pushout exactly like World.resolveCollisions
    world.resolveCollisions = entity => {
      const pos = entity.group.position, min = 6 + (entity.radius || .72);
      const dx = pos.x - 0, dz = pos.z - 0, distSq = dx * dx + dz * dz;
      if (distSq >= min * min) return 0;
      const dist = Math.sqrt(distSq) || .001;
      pos.x += (dx / dist) * (min - dist); pos.z += (dz / dist) * (min - dist);
      return 1;
    };
    world.nav = new NavGrid(world);
    world.nav.rebuild();
    world.findPath = (from, to, radius) => world.nav.findPath(from, to, Math.max(radius, .78));
    world.navLineClear = (from, to, radius, maxDistance) => world.nav.lineClear(from, to, Math.max(radius, .78), maxDistance);
    const agent = { id: 'runner', team: 'blue', radius: .72, classDef: { speed: 6 }, group: { position: new THREE.Vector3(-15, 0, 0), rotation: { y: 0 } }, velocity: new THREE.Vector3(), aim: new THREE.Vector3(0, 0, 1) };
    const ai = new AIController(world, { particles: {} }, {}, null, null, null, null, null, null, () => [agent], null, null, () => .5);
    const goal = new THREE.Vector3(15, 0, 0);
    for (let i = 0; i < 900 && agent.group.position.distanceTo(goal) > 1.5; i++) ai.moveToward(agent, goal, .06);
    expect(agent.group.position.distanceTo(goal)).toBeLessThan(1.5);
  });
});
