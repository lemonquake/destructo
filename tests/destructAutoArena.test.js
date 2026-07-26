import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DESTRUCT_AUTOS, AUTO_IDS, autoById, statBars, smgDps, ULTIMATE_KINDS } from '../src/data/destructAutos.js';
import { ARENA_MAPS, ARENA_MAP_IDS, WIN_CONDITIONS, winConditionById, ARENA_TEAM_MODES, ARENA_DIFFICULTIES } from '../src/data/arenaMaps.js';
import { ArenaTerrain, rampHeightAt, STEP_HEIGHT } from '../src/game/arena/ArenaTerrain.js';
import { createVehicleState, stepVehicle, collideVehicles, speedOf, forwardSpeedOf, GRAVITY } from '../src/game/arena/ArenaPhysics.js';
import { ArenaCombat } from '../src/game/arena/ArenaCombat.js';
import { ArenaAI } from '../src/game/arena/ArenaAI.js';
import { ArenaMode } from '../src/game/arena/ArenaMode.js';
import { CHASSIS_BUILDER_IDS, createDestructAutoModel } from '../src/game/arena/ArenaVehicleModels.js';
import {
  draftVehicles, splitTeams, buildRoster, createScoreboard, registerKill, resolveKiller, evaluateMatch,
  leaderOf, respawnPointFor, allAutosUnique, MIN_DRIVERS, MAX_DRIVERS, MAX_TEAM_SIZE,
} from '../src/game/arena/ArenaRules.js';

const seeded = seed => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const terrainFor = id => new ArenaTerrain(ARENA_MAPS[id]);
// An empty proving ground: physics, weapons and AI are exercised without arena
// geometry getting in the way of the specific behaviour under test.
const flatTerrain = () => new ArenaTerrain({ bounds: 400, pieces: [] });
const vehicleAt = (autoId, overrides = {}) => {
  const state = createVehicleState({
    id: overrides.id ?? 0, autoDef: autoById(autoId), team: overrides.team ?? 'A',
    spawn: { x: overrides.x ?? 0, y: overrides.y ?? 0, z: overrides.z ?? 0, yaw: overrides.yaw ?? 0 },
  });
  state.dead = false;
  state.slot = state.id;
  return Object.assign(state, { vx: 0, vy: 0, vz: 0 }, overrides.state || {});
};

describe('Destruct-Auto roster', () => {
  it('ships exactly ten battle vehicles with unique identities', () => {
    expect(DESTRUCT_AUTOS).toHaveLength(10);
    expect(new Set(AUTO_IDS).size).toBe(10);
    expect(new Set(DESTRUCT_AUTOS.map(a => a.name)).size).toBe(10);
    expect(new Set(DESTRUCT_AUTOS.map(a => a.chassis)).size).toBe(10);
  });
  it('gives every vehicle a distinct model builder', () => {
    for (const auto of DESTRUCT_AUTOS) {
      expect(CHASSIS_BUILDER_IDS).toContain(auto.chassis);
      const model = createDestructAutoModel(auto, 0x2fb4ff);
      expect(model).toBeDefined();
      expect(model.userData.chassis).toBeDefined();
      expect(model.userData.driver).toBeDefined();
      expect(model.userData.turret).toBeDefined();
      expect(model.userData.aura).toBeDefined();
      expect(model.userData.chassis.children.length).toBeGreaterThan(2);
    }
  });
  it('gives every vehicle its own Ultimate on a cooldown', () => {
    const ultimateIds = DESTRUCT_AUTOS.map(a => a.ultimate.id);
    expect(new Set(ultimateIds).size).toBe(10);
    expect(new Set(DESTRUCT_AUTOS.map(a => a.ultimate.name)).size).toBe(10);
    for (const auto of DESTRUCT_AUTOS) {
      expect(auto.ultimate.cooldown).toBeGreaterThan(5);
      expect(Object.values(ULTIMATE_KINDS)).toContain(auto.ultimate.kind);
      expect(auto.ultimate.description.length).toBeGreaterThan(30);
    }
  });
  it('gives every vehicle an unlimited sub-machine gun with no ammo pool', () => {
    for (const auto of DESTRUCT_AUTOS) {
      expect(auto.smg.rpm).toBeGreaterThan(300);
      expect(auto.smg.damage).toBeGreaterThan(0);
      expect(auto.smg).not.toHaveProperty('ammo');
      expect(auto.smg).not.toHaveProperty('magazine');
      expect(smgDps(auto)).toBeGreaterThan(30);
    }
  });
  it('varies speed, weight and durability across the roster', () => {
    const speeds = DESTRUCT_AUTOS.map(a => a.stats.topSpeed);
    const weights = DESTRUCT_AUTOS.map(a => a.stats.weight);
    const hp = DESTRUCT_AUTOS.map(a => a.stats.maxHp);
    expect(Math.max(...speeds) - Math.min(...speeds)).toBeGreaterThan(15);
    expect(Math.max(...weights) / Math.min(...weights)).toBeGreaterThan(2.5);
    expect(new Set(hp).size).toBeGreaterThan(7);
    // the fastest chassis must not also be the toughest
    const fastest = DESTRUCT_AUTOS.reduce((a, b) => (a.stats.topSpeed > b.stats.topSpeed ? a : b));
    const toughest = DESTRUCT_AUTOS.reduce((a, b) => (a.stats.maxHp > b.stats.maxHp ? a : b));
    expect(fastest.id).not.toBe(toughest.id);
  });
  it('reports 1-10 selection bars for every vehicle', () => {
    for (const auto of DESTRUCT_AUTOS) {
      for (const value of Object.values(statBars(auto))) {
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(10);
      }
    }
  });
});

describe('arena maps', () => {
  it('ships three dedicated arenas and never spawns crates', () => {
    expect(ARENA_MAP_IDS).toEqual(['crateworks', 'overpass', 'magma']);
    for (const map of Object.values(ARENA_MAPS)) {
      expect(map.description.length).toBeGreaterThan(60);
      expect(map.pieces.some(p => p.t === 'crate')).toBe(false);
      expect(map.pieces.some(p => p.kind === 'crate-drop')).toBe(false);
    }
  });
  it('fills every arena with ramps, launch pads and elevated ground', () => {
    for (const map of Object.values(ARENA_MAPS)) {
      const ramps = map.pieces.filter(p => p.t === 'ramp');
      expect(ramps.length).toBeGreaterThanOrEqual(8);
      expect(ramps.some(p => p.launch > 0)).toBe(true);
      const elevated = map.pieces.filter(p => p.t === 'box' && p.base + p.h >= 12);
      expect(elevated.length).toBeGreaterThanOrEqual(4);
    }
  });
  it('rebuilds the first arena as a legible destructible city', () => {
    const city = ARENA_MAPS.crateworks;
    const buildings = city.pieces.filter(piece => piece.building && piece.destructible);
    expect(city.title).toBe('BREAKPOINT CITY');
    expect(city.pieces.filter(piece => piece.t === 'decal').length).toBeGreaterThanOrEqual(12);
    expect(buildings.length).toBeGreaterThanOrEqual(20);
    expect(city.pieces.filter(piece => piece.t === 'ramp').length).toBeGreaterThanOrEqual(12);
    for (const building of buildings) {
      for (const road of [-39, 39]) {
        expect(Math.abs(building.x - road)).toBeGreaterThan(building.w / 2 + 4);
        expect(Math.abs(building.z - road)).toBeGreaterThan(building.d / 2 + 4);
      }
    }
  });
  it('provides five team respawn pads per side and ten free-for-all pads', () => {
    for (const map of Object.values(ARENA_MAPS)) {
      expect(map.spawns.A).toHaveLength(MAX_TEAM_SIZE);
      expect(map.spawns.B).toHaveLength(MAX_TEAM_SIZE);
      expect(map.spawns.ffa).toHaveLength(MAX_DRIVERS);
      for (const spawn of [...map.spawns.A, ...map.spawns.B, ...map.spawns.ffa]) {
        expect(Math.abs(spawn.x)).toBeLessThanOrEqual(map.bounds);
        expect(Math.abs(spawn.z)).toBeLessThanOrEqual(map.bounds);
      }
      // the two crews start apart from each other
      const a = map.spawns.A[0], b = map.spawns.B[0];
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(100);
    }
  });
  it('keeps every Breakpoint City spawn on an open road', () => {
    const city = ARENA_MAPS.crateworks;
    const terrain = terrainFor('crateworks');
    for (const spawn of [...city.spawns.A, ...city.spawns.B, ...city.spawns.ffa]) {
      expect(terrain.solidPieceAt(spawn.x, spawn.z, spawn.y + 1.5)).toBeNull();
      expect(terrain.resolve(spawn.x, spawn.z, spawn.y, 2.9, 3).hit).toBe(false);
    }
  });
  it('offers exactly the requested win conditions', () => {
    expect(WIN_CONDITIONS.map(w => w.id)).toEqual(['time-3', 'time-5', 'time-10', 'race-10', 'race-20', 'race-30', 'race-50']);
    expect(WIN_CONDITIONS.filter(w => w.kind === 'time').map(w => w.seconds)).toEqual([180, 300, 600]);
    expect(WIN_CONDITIONS.filter(w => w.kind === 'score').map(w => w.target)).toEqual([10, 20, 30, 50]);
    expect(winConditionById('nonsense').id).toBe('time-5');
  });
  it('supports team and free-for-all battles from two to ten drivers', () => {
    expect(ARENA_TEAM_MODES.teams.minPlayers).toBe(2);
    expect(ARENA_TEAM_MODES.teams.maxPlayers).toBe(MAX_TEAM_SIZE * 2);
    expect(ARENA_TEAM_MODES.ffa.maxPlayers).toBe(MAX_DRIVERS);
    expect(ARENA_DIFFICULTIES.length).toBeGreaterThanOrEqual(3);
  });
});

describe('arena terrain', () => {
  it('interpolates ramp height along the climb direction', () => {
    const ramp = { t: 'ramp', x: 0, z: 0, w: 10, d: 20, base: 0, rise: 10, dir: 0 };
    expect(rampHeightAt(ramp, 0, -10)).toBeCloseTo(0);
    expect(rampHeightAt(ramp, 0, 0)).toBeCloseTo(5);
    expect(rampHeightAt(ramp, 0, 10)).toBeCloseTo(10);
    const sideways = { ...ramp, w: 20, d: 10, dir: 90 };
    expect(rampHeightAt(sideways, -10, 0)).toBeCloseTo(0);
    expect(rampHeightAt(sideways, 10, 0)).toBeCloseTo(10);
  });
  it('reports the deck under a vehicle without teleporting it onto an overpass', () => {
    const terrain = terrainFor('crateworks');
    const onDeck = terrain.surfaceAt(0, 0, 12);
    expect(onDeck.height).toBeCloseTo(12);
    // standing on the floor beside the deck, the catwalk 22 units up is ignored
    const beside = terrain.surfaceAt(0, -46, 0.5);
    expect(beside.height).toBeLessThan(STEP_HEIGHT + 0.001);
  });
  it('pushes vehicles out of solid geometry and keeps them inside the arena', () => {
    const terrain = terrainFor('crateworks');
    const inside = terrain.resolve(0, 0, 0, 2.9, 3);
    expect(inside.hit).toBe(true);
    expect(Math.hypot(inside.x, inside.z)).toBeGreaterThan(0);
    const escaping = terrain.resolve(400, 400, 0, 2.9, 3);
    expect(Math.abs(escaping.x)).toBeLessThanOrEqual(terrain.bounds);
    expect(Math.abs(escaping.z)).toBeLessThanOrEqual(terrain.bounds);
  });
  it('burns vehicles that sit in a hazard and spares those flying over it', () => {
    const terrain = terrainFor('magma');
    const lava = ARENA_MAPS.magma.pieces.find(p => p.t === 'hazard');
    expect(terrain.hazardAt(lava.x, lava.z, 0).dps).toBeGreaterThan(0);
    expect(terrain.hazardAt(lava.x, lava.z, 30).dps).toBe(0);
  });
  it('blocks line of sight through arena walls', () => {
    const terrain = terrainFor('crateworks');
    expect(terrain.hasLineOfSight(-70, 2, 0, 70, 2, 0)).toBe(false);  // straight through the deck
    expect(terrain.hasLineOfSight(-70, 40, 0, 70, 40, 0)).toBe(true); // over the top of it
  });
  it('removes a destroyed building from collision and line of sight', () => {
    const terrain = terrainFor('crateworks');
    const building = terrain.pieces.find(piece => piece.destructible);
    expect(terrain.solidPieceAt(building.x, building.z, building.base + 2)).toBe(building);
    expect(terrain.removePiece(building)).toBe(true);
    expect(terrain.solidPieceAt(building.x, building.z, building.base + 2)).toBeNull();
  });
});

describe('player arena controls and aim', () => {
  const playerMode = keys => {
    const player = vehicleAt('splinter');
    player.isPlayer = true;
    const game = {
      input: {
        keys: new Set(keys),
        moveAxis: { x: 0, y: 0 },
        aimAxis: { x: 0, y: 0 },
        mouse: { dx: 0, dy: 0, down: false },
        consume: () => false,
      },
      save: { data: { settings: { mouseSensitivity: 1 } } },
    };
    return { mode: { game, player, paused: false, over: false }, player };
  };

  it('maps A/left to a visual left turn and D/right to a visual right turn', () => {
    const left = playerMode(['KeyA']).mode;
    const right = playerMode(['KeyD']).mode;
    expect(ArenaMode.prototype.playerInput.call(left, 1 / 60).steer).toBe(1);
    expect(ArenaMode.prototype.playerInput.call(right, 1 / 60).steer).toBe(-1);
  });

  it('keeps the camera ray locked to aim while the vehicle moves', () => {
    const { mode, player } = playerMode([]);
    Object.assign(mode, {
      camera: new THREE.PerspectiveCamera(),
      cameraGoal: new THREE.Vector3(),
      cameraTarget: new THREE.Vector3(),
      terrain: flatTerrain(),
      aimVector: ArenaMode.prototype.aimVector,
      viewAimVector: ArenaMode.prototype.viewAimVector,
      spectateTarget: ArenaMode.prototype.spectateTarget,
      game: { ...mode.game, save: { data: { settings: { cameraShake: false } } } },
      shake: 0,
    });
    player.aimYaw = 0.7;
    player.aimPitch = -0.08;
    ArenaMode.prototype.updateCamera.call(mode, 1);
    const before = mode.camera.getWorldDirection(new THREE.Vector3());
    player.x += 7;
    player.z += 11;
    ArenaMode.prototype.updateCamera.call(mode, 1 / 60);
    const after = mode.camera.getWorldDirection(new THREE.Vector3());
    const expected = ArenaMode.prototype.viewAimVector.call(mode, player);
    expect(before.dot(new THREE.Vector3(expected.x, expected.y, expected.z))).toBeGreaterThan(0.999);
    expect(after.dot(new THREE.Vector3(expected.x, expected.y, expected.z))).toBeGreaterThan(0.999);
  });
});

describe('arena driving', () => {
  it('accelerates toward the chassis top speed and stops there', () => {
    const terrain = flatTerrain();
    const car = vehicleAt('box-rocket');
    for (let i = 0; i < 300; i++) stepVehicle(car, { throttle: 1, steer: 0 }, terrain, 1 / 60);
    const top = car.autoDef.stats.topSpeed;
    expect(forwardSpeedOf(car)).toBeGreaterThan(top * 0.75);
    expect(forwardSpeedOf(car)).toBeLessThanOrEqual(top + 0.5);
  });
  it('makes the heavy chassis slower than the light one over the same run', () => {
    const terrain = flatTerrain();
    const run = autoId => {
      const car = vehicleAt(autoId);
      for (let i = 0; i < 180; i++) stepVehicle(car, { throttle: 1, steer: 0 }, terrain, 1 / 60);
      return speedOf(car);
    };
    expect(run('box-rocket')).toBeGreaterThan(run('hauler'));
  });
  it('lands vehicles on the ground instead of falling through it', () => {
    const terrain = flatTerrain();
    const car = vehicleAt('splinter', { y: 40 });
    for (let i = 0; i < 300; i++) stepVehicle(car, { throttle: 0, steer: 0 }, terrain, 1 / 60);
    expect(car.grounded).toBe(true);
    expect(car.y).toBeCloseTo(0, 1);
    expect(car.vy).toBe(0);
    expect(GRAVITY).toBeGreaterThan(0);
  });
  it('launches a fast vehicle off a jump ramp', () => {
    const terrain = terrainFor('crateworks');
    const launcher = ARENA_MAPS.crateworks.pieces.find(p => p.launch > 0 && p.dir === 0);
    const car = vehicleAt('magma-mite', { x: launcher.x, z: launcher.z - launcher.d / 2 + 1, yaw: 0 });
    car.vx = 0; car.vz = car.autoDef.stats.topSpeed;
    let launched = false;
    for (let i = 0; i < 20 && !launched; i++) {
      const report = stepVehicle(car, { throttle: 1, steer: 0 }, terrain, 1 / 60);
      if (report.launched) launched = true;
    }
    expect(launched).toBe(true);
    expect(car.vy).toBeGreaterThan(0);
  });
  it('lets the heavier chassis win a ram and take less of the damage', () => {
    const heavy = vehicleAt('hauler', { id: 1, x: 0, z: 0, team: 'A' });
    const light = vehicleAt('box-rocket', { id: 2, x: 5, z: 0, team: 'B' });
    heavy.vx = 40;
    const hit = collideVehicles(heavy, light);
    expect(hit).not.toBeNull();
    expect(hit.bDamage).toBeGreaterThan(hit.aDamage);
    expect(light.vx).toBeGreaterThan(0); // the light car gets thrown
  });
});

describe('arena combat', () => {
  const combatFor = (random = seeded(7)) => new ArenaCombat({ terrain: flatTerrain(), random });

  it('fires the sub-machine gun forever, limited only by rate of fire', () => {
    const combat = combatFor();
    const car = vehicleAt('voltwagen');
    let shots = 0;
    for (let i = 0; i < 2000; i++) {
      if (combat.fireSmg(car, { x: 0, y: 0, z: 1 })) shots++;
      car.fireCooldown = 0; // rate limiter released each tick
    }
    expect(shots).toBe(2000);
    expect(car).not.toHaveProperty('ammo');
  });
  it('rate-limits the sub-machine gun between shots', () => {
    const combat = combatFor();
    const car = vehicleAt('voltwagen');
    expect(combat.fireSmg(car, { x: 0, y: 0, z: 1 })).not.toBeNull();
    expect(combat.fireSmg(car, { x: 0, y: 0, z: 1 })).toBeNull();
    expect(car.fireCooldown).toBeCloseTo(60 / car.autoDef.smg.rpm, 4);
  });
  it('never lets bullets hurt an ally', () => {
    const combat = combatFor();
    const shooter = vehicleAt('splinter', { id: 1, team: 'A' });
    const ally = vehicleAt('hauler', { id: 2, team: 'A', x: 0, z: 20 });
    combat.fireSmg(shooter, { x: 0, y: 0, z: 1 });
    for (let i = 0; i < 60; i++) combat.update(1 / 60, [shooter, ally]);
    expect(ally.hp).toBe(ally.maxHp);
  });
  it('damages a hostile in the line of fire', () => {
    const combat = combatFor();
    const shooter = vehicleAt('splinter', { id: 1, team: 'A' });
    const enemy = vehicleAt('hauler', { id: 2, team: 'B', x: 0, z: 20 });
    combat.fireSmg(shooter, { x: 0, y: 0, z: 1 });
    for (let i = 0; i < 60; i++) combat.update(1 / 60, [shooter, enemy]);
    expect(enemy.hp).toBeLessThan(enemy.maxHp);
  });
  it('routes projectile damage into destructible city buildings', () => {
    const terrain = new ArenaTerrain({
      bounds: 80,
      pieces: [{ t: 'box', x: 0, z: 12, base: 0.35, w: 12, d: 8, h: 18, climbable: false, destructible: true, hp: 100 }],
    });
    const worldHits = [];
    const combat = new ArenaCombat({
      terrain,
      random: () => 0.5,
      hooks: { onWorldHit: (...args) => worldHits.push(args) },
    });
    const shooter = vehicleAt('splinter', { id: 1, team: 'A' });
    combat.fireSmg(shooter, { x: 0, y: 0, z: 1 });
    for (let i = 0; i < 30 && worldHits.length === 0; i++) combat.update(1 / 60, [shooter]);
    expect(worldHits).toHaveLength(1);
    expect(worldHits[0][0]).toBe(terrain.pieces[0]);
    expect(worldHits[0][1]).toBeGreaterThan(0);
  });
  it('puts the Ultimate on cooldown and refuses a second use until it recovers', () => {
    const combat = combatFor();
    const car = vehicleAt('scrapyard-dog');
    const enemy = vehicleAt('hauler', { id: 2, team: 'B', x: 0, z: 10 });
    expect(combat.activateUltimate(car, { x: 0, y: 0, z: 1 }, null, [car, enemy])).toBe(true);
    expect(car.ultimateCooldown).toBe(car.autoDef.ultimate.cooldown);
    expect(combat.activateUltimate(car, { x: 0, y: 0, z: 1 }, null, [car, enemy])).toBe(false);
    const terrain = flatTerrain();
    for (let i = 0; i < 60 * 13; i++) stepVehicle(car, { throttle: 0, steer: 0 }, terrain, 1 / 60);
    expect(car.ultimateCooldown).toBe(0);
    expect(combat.activateUltimate(car, { x: 0, y: 0, z: 1 }, null, [car, enemy])).toBe(true);
  });
  it('chains Tesla Arc between several hostiles with damage falloff', () => {
    const combat = combatFor();
    const volt = vehicleAt('voltwagen', { id: 1, team: 'A' });
    // identical chassis on both links so the falloff is not masked by armour
    const foes = [
      vehicleAt('hauler', { id: 2, team: 'B', x: 0, z: 12 }),
      vehicleAt('hauler', { id: 3, team: 'B', x: 8, z: 22 }),
      vehicleAt('hauler', { id: 4, team: 'B', x: 16, z: 32 }),
    ];
    combat.activateUltimate(volt, { x: 0, y: 0, z: 1 }, null, [volt, ...foes]);
    const lost = foes.map(f => f.maxHp - f.hp);
    expect(lost[0]).toBeGreaterThan(0);
    expect(lost[1]).toBeGreaterThan(0);
    expect(lost[0]).toBeGreaterThan(lost[1]);
    expect(foes[0].stunTimer).toBeGreaterThan(0);
  });
  it('drops mines behind the Hauler that only detonate for hostiles', () => {
    const combat = combatFor();
    const hauler = vehicleAt('hauler', { id: 1, team: 'A' });
    combat.activateUltimate(hauler, { x: 0, y: 0, z: 1 }, null, [hauler]);
    for (let i = 0; i < 120; i++) combat.update(1 / 60, [hauler]);
    const mines = combat.effects.filter(e => e.kind === 'mine');
    expect(mines.length).toBe(hauler.autoDef.ultimate.count);
    const ally = vehicleAt('splinter', { id: 2, team: 'A', x: mines[0].x, z: mines[0].z });
    for (let i = 0; i < 60; i++) combat.update(1 / 60, [hauler, ally]);
    expect(ally.hp).toBe(ally.maxHp);
    const enemy = vehicleAt('splinter', { id: 3, team: 'B', x: mines[0].x, z: mines[0].z });
    combat.update(1 / 60, [hauler, enemy]);
    expect(enemy.hp).toBeLessThan(enemy.maxHp);
  });
  it('makes a freshly respawned chassis untouchable for a moment', () => {
    const combat = combatFor();
    const shooter = vehicleAt('hauler', { id: 1, team: 'A' });
    const fresh = vehicleAt('kart', { id: 2, team: 'B', x: 0, z: 10 });
    fresh.spawnGrace = 1.6;
    expect(combat.applyDamage(fresh, 50, shooter, 'bullet')).toBe(0);
    expect(fresh.hp).toBe(fresh.maxHp);
    const terrain = flatTerrain();
    for (let i = 0; i < 120; i++) stepVehicle(fresh, { throttle: 0, steer: 0 }, terrain, 1 / 60);
    expect(fresh.spawnGrace).toBeLessThanOrEqual(0);
    expect(combat.applyDamage(fresh, 50, shooter, 'bullet')).toBeGreaterThan(0);
  });
  it('freezes hostiles caught in the Cryo Field', () => {
    const combat = combatFor();
    const frost = vehicleAt('frostbite', { id: 1, team: 'A' });
    const enemy = vehicleAt('kart', { id: 2, team: 'B', x: 10, z: 0 });
    combat.activateUltimate(frost, { x: 0, y: 0, z: 1 }, null, [frost, enemy]);
    for (let i = 0; i < 90; i++) combat.update(1 / 60, [frost, enemy]);
    expect(enemy.hp).toBeLessThan(enemy.maxHp);
    expect(enemy.slowFactor).toBeLessThan(1);
    expect(enemy.vulnerability).toBeGreaterThan(1);
  });
});

describe('arena rules', () => {
  it('never hands two drivers the same Destruct-Auto', () => {
    for (let seed = 1; seed < 30; seed++) {
      const picks = draftVehicles('hauler', MAX_DRIVERS, seeded(seed));
      expect(picks[0]).toBe('hauler');
      expect(new Set(picks).size).toBe(picks.length);
      expect(picks).toHaveLength(MAX_DRIVERS);
    }
  });
  it('caps a team battle at five per side and seats the player first', () => {
    const teams = splitTeams(10, 'A');
    expect(teams.filter(t => t === 'A')).toHaveLength(5);
    expect(teams.filter(t => t === 'B')).toHaveLength(5);
    expect(teams[0]).toBe('A');
    expect(splitTeams(MIN_DRIVERS, 'A')).toEqual(['A', 'B']);
    expect(splitTeams(5, 'A').filter(t => t === 'A')).toHaveLength(3);
  });
  it('builds a roster where every driver knows its crew and its chassis', () => {
    const roster = buildRoster({ teamMode: 'teams', driverCount: 8, playerAutoId: 'sky-hook', random: seeded(3) });
    expect(roster).toHaveLength(8);
    expect(allAutosUnique(roster)).toBe(true);
    expect(roster[0].isPlayer).toBe(true);
    expect(roster[0].autoId).toBe('sky-hook');
    expect(roster.filter(d => d.team === 'A')).toHaveLength(4);
    expect(roster.filter(d => d.team === 'B')).toHaveLength(4);
    const ffa = buildRoster({ teamMode: 'ffa', driverCount: 6, playerAutoId: 'kart-missing', random: seeded(4) });
    expect(new Set(ffa.map(d => d.team)).size).toBe(6);
  });
  it('scores kills for the killer crew and penalises self-destruction', () => {
    const roster = buildRoster({ teamMode: 'teams', driverCount: 4, playerAutoId: 'hauler', random: seeded(5) });
    const board = createScoreboard(roster, 'teams');
    registerKill(board, 0, 1);
    registerKill(board, 0, 3);
    expect(board.score.A).toBe(2);
    expect(board.drivers[0].kills).toBe(2);
    expect(board.drivers[1].deaths).toBe(1);
    registerKill(board, null, 0);   // driven into the lava
    expect(board.score.A).toBe(1);
    expect(board.drivers[0].deaths).toBe(1);
    expect(leaderOf(board).side).toBe('A');
  });
  it('ends a race win condition the moment a crew hits the target', () => {
    const roster = buildRoster({ teamMode: 'teams', driverCount: 4, playerAutoId: 'hauler', random: seeded(6) });
    const board = createScoreboard(roster, 'teams');
    for (let i = 0; i < 9; i++) registerKill(board, 0, 1);
    expect(evaluateMatch(board, 'race-10', 30).over).toBe(false);
    expect(evaluateMatch(board, 'race-10', 30).remaining).toBe(1);
    registerKill(board, 0, 1);
    const verdict = evaluateMatch(board, 'race-10', 31);
    expect(verdict.over).toBe(true);
    expect(verdict.winner).toBe('A');
  });
  it('awards a timed match to the crew with the most kills, and forces overtime on a tie', () => {
    const roster = buildRoster({ teamMode: 'teams', driverCount: 4, playerAutoId: 'hauler', random: seeded(8) });
    const board = createScoreboard(roster, 'teams');
    registerKill(board, 0, 1);
    registerKill(board, 1, 0);
    const tie = evaluateMatch(board, 'time-3', 200);
    expect(tie.over).toBe(false);
    expect(tie.overtime).toBe(true);
    registerKill(board, 0, 1);
    const decided = evaluateMatch(board, 'time-3', 200);
    expect(decided.over).toBe(true);
    expect(decided.winner).toBe('A');
    expect(evaluateMatch(board, 'time-3', 60).remaining).toBe(120);
  });
  it('sends wrecked drivers back to their own crew respawn pad', () => {
    const map = ARENA_MAPS.overpass;
    for (let slot = 0; slot < 10; slot++) {
      const side = slot % 2 === 0 ? 'A' : 'B';
      expect(map.spawns[side]).toContain(respawnPointFor(map, 'teams', side, slot, 0));
    }
    // consecutive respawns rotate pads so team-mates do not stack
    const first = respawnPointFor(map, 'teams', 'A', 0, 0);
    const second = respawnPointFor(map, 'teams', 'A', 0, 1);
    expect(first).not.toBe(second);
  });
  it('gives every driver a pad of their own at kickoff', () => {
    for (const map of Object.values(ARENA_MAPS)) {
      // 5v5: each crew's five slots must land on five different pads
      for (const side of ['A', 'B']) {
        const slots = [0, 1, 2, 3, 4].map(seat => seat * 2 + (side === 'A' ? 0 : 1));
        const pads = slots.map(slot => respawnPointFor(map, 'teams', side, slot, 0));
        expect(new Set(pads).size).toBe(5);
      }
      // ten-way free-for-all: ten drivers, ten pads
      const ffa = Array.from({ length: 10 }, (_, slot) => respawnPointFor(map, 'ffa', null, slot, 0));
      expect(new Set(ffa).size).toBe(10);
    }
  });
  it('credits the killer, not the corpse, and never a team-mate', () => {
    const victim = vehicleAt('kart', { id: 5, team: 'B' });
    const shooter = vehicleAt('hauler', { id: 6, team: 'A' });
    const mate = vehicleAt('splinter', { id: 7, team: 'B' });
    const all = [victim, shooter, mate];
    expect(resolveKiller(victim, shooter, all, 10)).toBe(shooter);
    // team-mate splash and self-destruction score for nobody
    expect(resolveKiller(victim, mate, all, 10)).toBeNull();
    expect(resolveKiller(victim, victim, all, 10)).toBeNull();
    // lava kills fall back to the last hostile hit inside the credit window
    victim.lastAttacker = shooter.id;
    victim.lastAttackerTime = 8;
    expect(resolveKiller(victim, null, all, 10)).toBe(shooter);
    expect(resolveKiller(victim, null, all, 20)).toBeNull();
    // the victim being flagged dead must not wipe the credit
    victim.dead = true;
    expect(resolveKiller(victim, shooter, all, 10)).toBe(shooter);
  });
});

describe('arena AI drivers', () => {
  const aiFor = (difficulty = ARENA_DIFFICULTIES[2]) =>
    new ArenaAI({ terrain: flatTerrain(), difficulty, random: seeded(11) });

  it('targets hostiles and never picks an ally', () => {
    const ai = aiFor();
    const self = vehicleAt('scrapyard-dog', { id: 1, team: 'A', x: 0, z: 0 });
    const ally = vehicleAt('splinter', { id: 2, team: 'A', x: 4, z: 4 });
    const enemy = vehicleAt('hauler', { id: 3, team: 'B', x: 30, z: 0 });
    const picked = ai.pickTarget(self, [enemy]);
    expect(picked.id).toBe(3);
    const command = ai.think(self, { allies: [ally], enemies: [enemy], dt: 1 / 60 });
    expect(ai.brain(self).targetId).toBe(3);
    expect(command.throttle).not.toBe(0);
  });
  it('prefers the wounded hostile when two are equally close', () => {
    const ai = aiFor();
    const self = vehicleAt('voltwagen', { id: 1, team: 'A' });
    const healthy = vehicleAt('hauler', { id: 2, team: 'B', x: 30, z: 0 });
    const wounded = vehicleAt('hauler', { id: 3, team: 'B', x: -30, z: 0 });
    wounded.hp = wounded.maxHp * 0.15;
    expect(ai.pickTarget(self, [healthy, wounded]).id).toBe(3);
  });
  it('steers toward its target and opens fire once lined up', () => {
    const ai = aiFor();
    const self = vehicleAt('splinter', { id: 1, team: 'A', x: 0, z: -60, yaw: 0 });
    const enemy = vehicleAt('hauler', { id: 2, team: 'B', x: 0, z: -20 });
    let command = null;
    for (let i = 0; i < 30; i++) {
      command = ai.think(self, { allies: [], enemies: [enemy], dt: 1 / 60 });
      self.aimYaw = command.aimYaw;
    }
    // the gun is pointed up the +Z lane at the target and the trigger is down
    expect(Math.abs(command.aimYaw)).toBeLessThan(0.5);
    expect(command.fire).toBe(true);
  });
  it('spends the Ultimate when the situation matches the weapon', () => {
    const ai = aiFor();
    const dog = vehicleAt('scrapyard-dog', { id: 1, team: 'A' });
    const close = vehicleAt('kart', { id: 2, team: 'B', x: 8, z: 0 });
    expect(ai.shouldUseUltimate(dog, close, [close], 8)).toBe(true);
    const far = vehicleAt('kart', { id: 3, team: 'B', x: 90, z: 0 });
    expect(ai.shouldUseUltimate(dog, far, [far], 90)).toBe(false);
    const maiden = vehicleAt('iron-maiden', { id: 4, team: 'A' });
    expect(ai.shouldUseUltimate(maiden, far, [far], 60)).toBe(true);
    expect(ai.shouldUseUltimate(maiden, close, [close], 8)).toBe(false);
  });
  it('roams the arena when there is nothing to shoot', () => {
    const ai = aiFor();
    const self = vehicleAt('magma-mite', { id: 1, team: 'A', x: -100, z: -100 });
    const command = ai.think(self, { allies: [], enemies: [], dt: 1 / 60 });
    expect(ai.brain(self).mode).toBe('hunt');
    expect(command.fire).toBe(false);
    expect(Math.abs(command.throttle)).toBeGreaterThan(0);
  });
  it('breaks contact when badly hurt and outnumbered', () => {
    const ai = aiFor();
    const self = vehicleAt('box-rocket', { id: 1, team: 'A', x: 0, z: 0 });
    self.hp = self.maxHp * 0.1;
    const foes = [
      vehicleAt('hauler', { id: 2, team: 'B', x: 12, z: 0 }),
      vehicleAt('hauler', { id: 3, team: 'B', x: -12, z: 6 }),
    ];
    ai.think(self, { allies: [], enemies: foes, dt: 1 / 60 });
    expect(ai.brain(self).mode).toBe('retreat');
  });
  it('drives a full ten-car battle for ten seconds without stalling or escaping the arena', () => {
    const terrain = terrainFor('magma');
    const ai = new ArenaAI({ terrain, difficulty: ARENA_DIFFICULTIES[1], random: seeded(21) });
    const combat = new ArenaCombat({ terrain, random: seeded(22) });
    const cars = AUTO_IDS.map((autoId, index) => {
      const spawn = ARENA_MAPS.magma.spawns.ffa[index];
      const car = vehicleAt(autoId, { id: index, team: index % 2 ? 'B' : 'A', x: spawn.x, z: spawn.z, y: spawn.y });
      car.yaw = spawn.yaw;
      return car;
    });
    let shotsFired = 0;
    for (let frame = 0; frame < 600; frame++) {
      for (const car of cars) {
        if (car.dead) continue;
        const command = ai.think(car, {
          allies: cars.filter(c => c !== car && c.team === car.team),
          enemies: cars.filter(c => c.team !== car.team),
          dt: 1 / 60,
        });
        car.aimYaw = command.aimYaw;
        stepVehicle(car, command, terrain, 1 / 60);
        if (command.fire && combat.fireSmg(car, { x: Math.sin(car.aimYaw), y: 0, z: Math.cos(car.aimYaw) })) shotsFired++;
        if (car.hp <= 0) car.dead = true;
      }
      combat.update(1 / 60, cars);
    }
    for (const car of cars) {
      expect(Number.isFinite(car.x)).toBe(true);
      expect(Math.abs(car.x)).toBeLessThanOrEqual(ARENA_MAPS.magma.bounds + 1);
      expect(Math.abs(car.z)).toBeLessThanOrEqual(ARENA_MAPS.magma.bounds + 1);
      expect(car.y).toBeGreaterThan(-5);
    }
    expect(shotsFired).toBeGreaterThan(0);
    expect(cars.some(car => car.hp < car.maxHp)).toBe(true);
  });
});
