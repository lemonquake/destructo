import { describe, expect, it } from 'vitest';
import { DESTRUCTO, PLAYER_COLORS, PLAYER_COLOR_IDS, playerColorById, playerColorAt, BLITZ_CREWS, crewById, MIN_PLAYERS, MAX_PLAYERS } from '../src/data/blitzDestructo.js';
import {
  BLITZ_ARENAS, BLITZ_ARENA_IDS, BLITZ_TEAM_MODES, BLITZ_DIFFICULTIES, BLITZ_LIVES, blitzLivesById,
  TILE, TILE_SIZE, OBSTACLES, DESTRUCTIBLE, WALKABLE, isDestructible, obstacleAt,
  generateGrid, spiralOrder, conveyorDirAt, blitzArenaById, blitzDifficultyById, TREMOR_THRESHOLD,
} from '../src/data/blitzArenas.js';
import {
  BLITZ_POWERUPS, POWERUP_IDS, pickPowerup, rollPowerup, DROP_CHANCE,
  MAX_CHARGES, MAX_POWER, MAX_SPEED_STACKS, MAX_PLATES, SPEED_PER_STACK,
} from '../src/data/blitzPowerups.js';
import { BlitzGrid, BLAST_LIFE } from '../src/game/blitz/BlitzGrid.js';
import {
  createBlitzUnit, stepBlitzUnit, materializeCharge, resetUnitForSpawn,
  occupiedCell, canEnter, placeOnCell, unitSpeed, blitzUnitInternals,
} from '../src/game/blitz/BlitzUnit.js';
import {
  defaultSeats, resizeSeats, enforceUniqueColors, normalizeCrews, buildBlitzRoster,
  createScoreboard, registerKill, resolveKiller, evaluateMatch, livingSides,
  spawnCellFor, allColorsUnique,
} from '../src/game/blitz/BlitzRules.js';
import { BlitzAI } from '../src/game/blitz/BlitzAI.js';
import { shuffled, BGM_TRACKS, blitzAudioInternals, KILL_LAUGH_DELAY } from '../src/game/blitz/BlitzAudio.js';
import { blitzHudInternals } from '../src/game/blitz/BlitzHUD.js';

// Deterministic PRNG so generated lattices and drop rolls are reproducible.
const seeded = seed => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

// A grid with every destructible tile stripped out, so movement and blast tests
// are not at the mercy of the fill.
function openGrid(arenaId = 'foundry', random = seeded(7), hooks = {}) {
  const grid = new BlitzGrid({ arenaDef: blitzArenaById(arenaId), random, hooks });
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      if (isDestructible(grid.tiles[row][col])) grid.tiles[row][col] = TILE.FLOOR;
    }
  }
  return grid;
}

const makeUnit = (grid, overrides = {}) => createBlitzUnit({
  id: overrides.id ?? 0,
  team: overrides.team ?? 'solo-0',
  spawnCell: overrides.spawnCell ?? { col: 2, row: 2 },
  grid,
  isPlayer: overrides.isPlayer ?? false,
  name: overrides.name ?? 'TEST',
  color: overrides.color ?? 0x2fb4ff,
  lives: overrides.lives ?? 3,
});

// Runs a unit forward with fixed orders.
function drive(unit, grid, orders, seconds, dt = 1 / 60) {
  const frames = Math.round(seconds / dt);
  for (let i = 0; i < frames; i++) stepBlitzUnit(unit, orders, grid, dt);
  return frames;
}

// ── the character ───────────────────────────────────────────────────────────
describe('the Destructo', () => {
  it('is the only character in the mode', () => {
    expect(DESTRUCTO.name).toBe('DESTRUCTO');
    expect(DESTRUCTO.stats.maxHp).toBeGreaterThan(0);
    expect(DESTRUCTO.charge.name).toBe('CHARGE CRATE');
  });
  it('offers ten distinct paint jobs, one per possible seat', () => {
    expect(PLAYER_COLORS).toHaveLength(MAX_PLAYERS);
    expect(new Set(PLAYER_COLOR_IDS).size).toBe(MAX_PLAYERS);
    expect(new Set(PLAYER_COLORS.map(c => c.color)).size).toBe(MAX_PLAYERS);
    expect(playerColorById('nope').id).toBe(PLAYER_COLORS[0].id);
    expect(playerColorAt(MAX_PLAYERS).id).toBe(PLAYER_COLORS[0].id);
    expect(playerColorAt(-1).id).toBe(PLAYER_COLORS[MAX_PLAYERS - 1].id);
  });
  it('has four crews for co-op play', () => {
    expect(BLITZ_CREWS).toHaveLength(4);
    expect(crewById('C').name).toBe('SCORCHERS');
    expect(crewById('nope').id).toBe('A');
  });
});

// ── arenas and obstacles ────────────────────────────────────────────────────
describe('arenas', () => {
  it('ships three arenas, each with a pad for every possible player', () => {
    expect(BLITZ_ARENA_IDS).toEqual(['foundry', 'blockparty', 'lattice']);
    for (const arena of Object.values(BLITZ_ARENAS)) {
      expect(arena.spawns).toHaveLength(MAX_PLAYERS);
      expect(new Set(arena.spawns.map(pad => `${pad.col},${pad.row}`)).size).toBe(MAX_PLAYERS);
      for (const pad of arena.spawns) {
        expect(pad.col).toBeGreaterThanOrEqual(0);
        expect(pad.col).toBeLessThan(arena.cols);
        expect(pad.row).toBeGreaterThanOrEqual(0);
        expect(pad.row).toBeLessThan(arena.rows);
      }
    }
    expect(blitzArenaById('nope').id).toBe('foundry');
  });

  it('defines three breakable materials, one of which survives a single blast', () => {
    expect([...DESTRUCTIBLE].sort()).toEqual([TILE.WOOD, TILE.BRICK, TILE.DEBRIS].sort());
    expect(obstacleAt(TILE.WOOD).material).toBe('wood');
    expect(obstacleAt(TILE.BRICK).material).toBe('brick');
    expect(obstacleAt(TILE.DEBRIS).material).toBe('debris');
    expect(obstacleAt(TILE.PILLAR)).toBeNull();
    expect(OBSTACLES[TILE.BRICK].hp).toBe(2);
    expect(OBSTACLES[TILE.WOOD].hp).toBe(1);
    for (const spec of Object.values(OBSTACLES)) expect(WALKABLE.has(spec.tile)).toBe(false);
  });

  it('generates a lattice with several materials and clear spawn pockets', () => {
    for (const arena of Object.values(BLITZ_ARENAS)) {
      const tiles = generateGrid(arena, seeded(3));
      expect(tiles).toHaveLength(arena.rows);
      expect(tiles[0]).toHaveLength(arena.cols);
      const kinds = new Set();
      for (const row of tiles) for (const tile of row) if (isDestructible(tile)) kinds.add(tile);
      expect(kinds.size).toBeGreaterThanOrEqual(2);
      for (const pad of arena.spawns) {
        expect(WALKABLE.has(tiles[pad.row][pad.col])).toBe(true);
        const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => {
          const tile = tiles[pad.row + dz]?.[pad.col + dx];
          return tile !== undefined && WALKABLE.has(tile);
        });
        expect(open.length).toBeGreaterThan(0);
      }
    }
  });

  it('never puts a destructible tile on a pillar', () => {
    const arena = BLITZ_ARENAS.foundry;
    const tiles = generateGrid(arena, seeded(11));
    for (let row = 1; row < arena.rows - 1; row++) {
      for (let col = 1; col < arena.cols - 1; col++) {
        if (arena.pillars(col, row)) expect(tiles[row][col]).toBe(TILE.PILLAR);
      }
    }
  });

  it('walks the sudden-death spiral over every cell exactly once', () => {
    const cells = spiralOrder(15, 15);
    expect(cells).toHaveLength(225);
    expect(new Set(cells.map(c => `${c.col},${c.row}`)).size).toBe(225);
    expect(cells[0]).toEqual({ col: 0, row: 0 });
  });

  it('resolves conveyor directions only inside their belts', () => {
    const arena = BLITZ_ARENAS.blockparty;
    expect(conveyorDirAt(arena, 5, 7)).toEqual({ dx: 1, dz: 0 });
    expect(conveyorDirAt(arena, 5, 5)).toBeNull();
    expect(conveyorDirAt(BLITZ_ARENAS.foundry, 5, 5)).toBeNull();
  });

  it('offers the two battle types and three life counts', () => {
    expect(Object.keys(BLITZ_TEAM_MODES)).toEqual(['ffa', 'coop']);
    expect(BLITZ_LIVES.map(entry => entry.lives)).toEqual([1, 3, 5]);
    expect(blitzLivesById('nope').lives).toBe(3);
    expect(BLITZ_DIFFICULTIES.map(d => d.id)).toEqual(['rookie', 'regular', 'veteran', 'nightmare']);
    expect(blitzDifficultyById('nope').id).toBe('regular');
    expect(TREMOR_THRESHOLD).toBe(3);
  });
});

// ── power-ups ───────────────────────────────────────────────────────────────
describe('power-ups', () => {
  it('ships at least five, each with a unique colour and its own SVG badge', () => {
    expect(POWERUP_IDS.length).toBeGreaterThanOrEqual(5);
    expect(new Set(Object.values(BLITZ_POWERUPS).map(p => p.color)).size).toBe(POWERUP_IDS.length);
    expect(new Set(Object.values(BLITZ_POWERUPS).map(p => p.name)).size).toBe(POWERUP_IDS.length);
    for (const def of Object.values(BLITZ_POWERUPS)) {
      expect(def.svg.startsWith('<svg')).toBe(true);
      expect(def.svg).toContain('viewBox="0 0 64 64"');
      expect(def.description.length).toBeGreaterThan(10);
      expect(def.solid).toBeTruthy();
    }
  });

  it('namespaces every gradient id so badges do not steal each other’s colours', () => {
    const ids = [];
    for (const def of Object.values(BLITZ_POWERUPS)) {
      for (const match of def.svg.matchAll(/id="([^"]+)"/g)) ids.push(match[1]);
      expect(def.svg).not.toContain('%ID%');
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('picks by weight and gates by the drop chance', () => {
    expect(rollPowerup(() => 0.99)).toBeNull();
    expect(rollPowerup(() => 0)).toBeTruthy();
    const counts = new Map();
    const random = seeded(21);
    for (let i = 0; i < 4000; i++) {
      const pick = pickPowerup(random);
      counts.set(pick.id, (counts.get(pick.id) || 0) + 1);
    }
    expect(counts.size).toBe(POWERUP_IDS.length);
    expect(counts.get('power')).toBeGreaterThan(counts.get('heal'));
    expect(DROP_CHANCE).toBeGreaterThan(0);
    expect(DROP_CHANCE).toBeLessThan(1);
  });
});

// ── movement ────────────────────────────────────────────────────────────────
describe('grid-locked movement', () => {
  it('parks a unit exactly on a tile centre when it starts', () => {
    const grid = openGrid();
    const unit = makeUnit(grid, { spawnCell: { col: 4, row: 6 } });
    const centre = grid.centerOf(4, 6);
    expect(unit.x).toBeCloseTo(centre.x, 6);
    expect(unit.z).toBeCloseTo(centre.z, 6);
    expect(occupiedCell(unit)).toEqual({ col: 4, row: 6 });
  });

  it('always ends a step dead-centre on the destination tile', () => {
    const grid = openGrid();
    const unit = makeUnit(grid, { spawnCell: { col: 2, row: 2 } });
    drive(unit, grid, { mx: 1, mz: 0 }, 1.5, 1 / 37);
    for (let i = 0; i < 90; i++) stepBlitzUnit(unit, { mx: 0, mz: 0 }, grid, 1 / 60);
    const centre = grid.centerOf(unit.col, unit.row);
    expect(unit.x).toBeCloseTo(centre.x, 6);
    expect(unit.z).toBeCloseTo(centre.z, 6);
    expect(unit.dir).toBeNull();
    expect(unit.col).toBeGreaterThan(2);
  });

  it('moves at exactly the unit speed regardless of framerate', () => {
    const grid = openGrid();
    const fast = makeUnit(grid, { id: 0, spawnCell: { col: 2, row: 2 } });
    const slow = makeUnit(grid, { id: 1, spawnCell: { col: 2, row: 2 } });
    drive(fast, grid, { mx: 0, mz: 1 }, 1, 1 / 240);
    drive(slow, grid, { mx: 0, mz: 1 }, 1, 1 / 24);
    expect(Math.abs(fast.z - slow.z)).toBeLessThan(TILE_SIZE * 0.25);
    const travelled = Math.abs(fast.z - grid.centerOf(2, 2).z);
    expect(travelled).toBeGreaterThan(unitSpeed(fast) * 0.75);
  });

  it('refuses to enter a blocked tile and stays on the grid', () => {
    const grid = openGrid();
    const unit = makeUnit(grid, { spawnCell: { col: 2, row: 2 } });
    grid.setTile(3, 2, TILE.WOOD);
    drive(unit, grid, { mx: 1, mz: 0 }, 2);
    expect(occupiedCell(unit)).toEqual({ col: 2, row: 2 });
    expect(unit.x).toBeCloseTo(grid.centerOf(2, 2).x, 6);
  });

  it('slides along the free axis when a diagonal is held into a wall', () => {
    const grid = openGrid();
    const unit = makeUnit(grid, { spawnCell: { col: 2, row: 2 } });
    grid.setTile(3, 2, TILE.BRICK);
    drive(unit, grid, { mx: 1, mz: 0.6 }, 1);
    expect(occupiedCell(unit).col).toBe(2);
    expect(occupiedCell(unit).row).toBeGreaterThan(2);
  });

  it('lets a unit walk off the charge it just dropped, and never back on', () => {
    const grid = openGrid();
    const unit = makeUnit(grid, { spawnCell: { col: 2, row: 2 } });
    const charge = materializeCharge(unit, grid, 0);
    expect(charge).toBeTruthy();
    expect(occupiedCell(unit)).toEqual({ col: 2, row: 2 });

    // Walking away is the case that used to wedge the unit permanently.
    drive(unit, grid, { mx: 1, mz: 0 }, 1.2);
    expect(occupiedCell(unit).col).toBeGreaterThan(2);
    expect(canEnter(grid, 2, 2)).toBe(false);

    // Walking back is refused, and the unit is still perfectly on a centre.
    const before = occupiedCell(unit);
    drive(unit, grid, { mx: -1, mz: 0 }, 3);
    expect(occupiedCell(unit).col).toBeGreaterThanOrEqual(3);
    expect(occupiedCell(unit).row).toBe(before.row);
    expect(unit.x).toBeCloseTo(grid.centerOf(unit.col, unit.row).x, 6);
  });

  it('never leaves a unit stuck after dropping a charge, whatever the exit', () => {
    for (const [mx, mz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const grid = openGrid();
      const unit = makeUnit(grid, { spawnCell: { col: 6, row: 6 } });
      materializeCharge(unit, grid, 0);
      drive(unit, grid, { mx, mz }, 1.5);
      const cell = occupiedCell(unit);
      expect(`${cell.col},${cell.row}`).not.toBe('6,6');
    }
  });

  it('snaps onto a tile centre when shoved', () => {
    const grid = openGrid();
    const unit = makeUnit(grid, { spawnCell: { col: 4, row: 4 } });
    drive(unit, grid, { mx: 1, mz: 0 }, 0.1);
    placeOnCell(unit, grid, 7, 7);
    expect(unit.x).toBeCloseTo(grid.centerOf(7, 7).x, 6);
    expect(unit.z).toBeCloseTo(grid.centerOf(7, 7).z, 6);
    expect(unit.dir).toBeNull();
  });

  it('picks the dominant axis first and keeps the other as a fallback', () => {
    const { desiredDirections } = blitzUnitInternals;
    expect(desiredDirections({ mx: 1, mz: 0 })).toEqual([{ dx: 1, dz: 0 }]);
    expect(desiredDirections({ mx: 0, mz: -1 })).toEqual([{ dx: 0, dz: -1 }]);
    expect(desiredDirections({ mx: 0.9, mz: 0.2 })[0]).toEqual({ dx: 1, dz: 0 });
    expect(desiredDirections({ mx: 0.2, mz: 0.9 })[0]).toEqual({ dx: 0, dz: 1 });
    expect(desiredDirections({ mx: 0, mz: 0 })).toEqual([]);
  });

  it('rides a conveyor when nothing is asked of it', () => {
    const grid = openGrid('blockparty');
    const unit = makeUnit(grid, { spawnCell: { col: 5, row: 7 } });
    expect(grid.conveyorAt(5, 7)).toEqual({ dx: 1, dz: 0 });
    drive(unit, grid, { mx: 0, mz: 0 }, 1.5);
    expect(occupiedCell(unit).col).toBeGreaterThan(5);
  });
});

// ── charges and blasts ──────────────────────────────────────────────────────
describe('charges and blasts', () => {
  it('caps live charges and frees the slot on detonation', () => {
    const grid = openGrid();
    const unit = makeUnit(grid, { spawnCell: { col: 2, row: 2 } });
    expect(materializeCharge(unit, grid, 0)).toBeTruthy();
    expect(unit.chargesLive).toBe(1);
    unit.placeCooldown = 0;
    drive(unit, grid, { mx: 1, mz: 0 }, 1);
    unit.placeCooldown = 0;
    expect(materializeCharge(unit, grid, 0)).toBeNull();   // only one allowed
    grid.update(DESTRUCTO.stats.fuse + 0.1, [unit], 1);
    expect(unit.chargesLive).toBe(0);
    expect(grid.charges).toHaveLength(0);
  });

  it('throws a four-lane cross stopped by pillars and obstacles', () => {
    const grid = openGrid();
    grid.setTile(8, 6, TILE.WOOD);
    grid.setTile(6, 4, TILE.PILLAR);
    const plan = grid.blastPlan({ id: -1, col: 6, row: 6, power: 3, color: 0 });
    const has = (col, row) => plan.cells.some(c => c.col === col && c.row === row);
    expect(has(6, 6)).toBe(true);
    expect(has(7, 6)).toBe(true);
    expect(has(8, 6)).toBe(true);     // the obstacle tile itself burns
    expect(has(9, 6)).toBe(false);    // ...and the lane stops there
    expect(has(6, 5)).toBe(true);
    expect(has(6, 4)).toBe(false);    // pillar blocks without burning
    expect(plan.hit).toContainEqual({ col: 8, row: 6 });
  });

  it('kills anybody standing in the blast — rival, crew-mate or the owner', () => {
    for (const team of ['solo-1', 'solo-0']) {
      const grid = openGrid();
      const owner = makeUnit(grid, { id: 0, team: 'solo-0', spawnCell: { col: 6, row: 6 } });
      const victim = makeUnit(grid, { id: 1, team, spawnCell: { col: 7, row: 6 } });
      owner.spawnGrace = 0; victim.spawnGrace = 0;
      grid.detonate(grid.placeCharge(owner, 6, 6, 0), [owner, victim], 0);
      expect(victim.hp).toBeLessThanOrEqual(0);
      expect(owner.hp).toBeLessThanOrEqual(0);   // standing on your own charge is fatal
    }
  });

  it('respects spawn protection and spends a Bubble Plate instead of a life', () => {
    const grid = openGrid();
    const owner = makeUnit(grid, { id: 0, spawnCell: { col: 6, row: 6 } });
    const shielded = makeUnit(grid, { id: 1, team: 'solo-1', spawnCell: { col: 7, row: 6 } });
    const guarded = makeUnit(grid, { id: 2, team: 'solo-2', spawnCell: { col: 5, row: 6 } });
    owner.spawnGrace = 0;
    shielded.spawnGrace = 0; shielded.plates = 1;
    guarded.spawnGrace = 2;
    grid.detonate(grid.placeCharge(owner, 6, 6, 0), [owner, shielded, guarded], 0);
    expect(shielded.hp).toBe(shielded.maxHp);
    expect(shielded.plates).toBe(0);
    expect(guarded.hp).toBe(guarded.maxHp);
  });

  it('needs two blasts for brick and one for wood, and reports which', () => {
    const events = [];
    const grid = openGrid('foundry', seeded(5), {
      onObstacleHit: payload => events.push(['hit', payload.spec.id]),
      onObstacleBroken: payload => events.push(['broken', payload.spec.id]),
    });
    grid.setTile(7, 6, TILE.BRICK);
    grid.setTile(5, 6, TILE.WOOD);
    const owner = makeUnit(grid, { spawnCell: { col: 6, row: 6 } });

    grid.detonate(grid.placeCharge(owner, 6, 6, 0), [], 0);
    expect(grid.tileAt(5, 6)).toBe(TILE.FLOOR);          // wood is gone
    expect(grid.tileAt(7, 6)).toBe(TILE.BRICK);          // brick survived
    expect(grid.obstacleHpAt(7, 6)).toBe(1);
    expect(events).toContainEqual(['broken', 'wood']);
    expect(events).toContainEqual(['hit', 'brick']);

    grid.detonate(grid.placeCharge(owner, 6, 6, 1), [], 1);
    expect(grid.tileAt(7, 6)).toBe(TILE.FLOOR);
    expect(events).toContainEqual(['broken', 'brick']);
  });

  it('reports how many obstacles a blast broke, so the camera can shake', () => {
    let reported = -1;
    const grid = openGrid('foundry', seeded(9), { onBlast: (_blast, _charge, broken) => { reported = broken; } });
    for (const [col, row] of [[7, 6], [5, 6], [6, 7], [6, 5]]) grid.setTile(col, row, TILE.WOOD);
    const owner = makeUnit(grid, { spawnCell: { col: 6, row: 6 } });
    grid.detonate(grid.placeCharge(owner, 6, 6, 0), [], 0);
    expect(reported).toBe(4);
    expect(reported).toBeGreaterThanOrEqual(TREMOR_THRESHOLD);
  });

  it('chains through neighbouring charges without recursing forever', () => {
    const grid = openGrid();
    const a = makeUnit(grid, { id: 0, spawnCell: { col: 4, row: 6 } });
    const b = makeUnit(grid, { id: 1, team: 'solo-1', spawnCell: { col: 6, row: 6 } });
    const first = grid.placeCharge(a, 4, 6, 0);
    grid.placeCharge(b, 6, 6, 0);
    grid.detonate(first, [], 0);
    expect(grid.charges).toHaveLength(0);
    expect(grid.blasts.length).toBeGreaterThanOrEqual(2);
  });

  it('destroys drops caught in a blast rather than letting them be farmed', () => {
    const grid = openGrid();
    grid.powerups.push({ id: 99, col: 7, row: 6, kind: 'power', color: 1, def: BLITZ_POWERUPS.power });
    const owner = makeUnit(grid, { spawnCell: { col: 6, row: 6 } });
    grid.detonate(grid.placeCharge(owner, 6, 6, 0), [], 0);
    expect(grid.powerupAt(7, 6)).toBeNull();
  });

  it('hands a drop to whoever stands on it, once, and caps every stat', () => {
    const grid = openGrid();
    const unit = makeUnit(grid, { spawnCell: { col: 6, row: 6 } });
    grid.powerups.push({ id: 99, col: 6, row: 6, kind: 'power', color: 1, def: BLITZ_POWERUPS.power });
    grid.updatePickups([unit]);
    expect(unit.power).toBe(DESTRUCTO.stats.power + 1);
    expect(unit.powerupsTaken).toBe(1);
    expect(grid.powerups).toHaveLength(0);
    for (let i = 0; i < 40; i++) grid.applyPowerup(unit, 'power');
    expect(unit.power).toBe(MAX_POWER);
    for (let i = 0; i < 40; i++) grid.applyPowerup(unit, 'charge');
    expect(unit.charges).toBe(MAX_CHARGES);
    for (let i = 0; i < 40; i++) grid.applyPowerup(unit, 'speed');
    expect(unit.speedStacks).toBe(MAX_SPEED_STACKS);
    expect(unitSpeed(unit)).toBeCloseTo(DESTRUCTO.stats.speed + MAX_SPEED_STACKS * SPEED_PER_STACK, 5);
    for (let i = 0; i < 40; i++) grid.applyPowerup(unit, 'shield');
    expect(unit.plates).toBe(MAX_PLATES);
  });

  it('expires blasts on their own short life', () => {
    const grid = openGrid();
    const owner = makeUnit(grid, { spawnCell: { col: 6, row: 6 } });
    grid.detonate(grid.placeCharge(owner, 6, 6, 0), [], 0);
    expect(grid.blasts).toHaveLength(1);
    grid.updateBlasts(BLAST_LIFE + 0.01);
    expect(grid.blasts).toHaveLength(0);
  });

  it('slides a kicked charge until something stops it', () => {
    const grid = openGrid();
    const owner = makeUnit(grid, { spawnCell: { col: 4, row: 6 } });
    const charge = grid.placeCharge(owner, 4, 6, 0);
    grid.setTile(8, 6, TILE.PILLAR);
    expect(grid.kickCharge(charge, 1, 0)).toBe(true);
    expect(grid.kickCharge(charge, 1, 0)).toBe(false);   // already sliding
    grid.slideCharge(charge, 3, [], 0);
    expect(charge.col).toBe(7);
    expect(charge.kickDir).toBeNull();
  });

  it('crushes whatever the sudden-death spiral lands on', () => {
    const grid = openGrid();
    const unit = makeUnit(grid, { spawnCell: { col: 0, row: 0 } });
    unit.spawnGrace = 0;
    grid.beginSuddenDeath();
    grid.updateSuddenDeath(1, [unit], 0);
    expect(grid.tileAt(0, 0)).toBe(TILE.SUDDEN);
    expect(unit.hp).toBeLessThanOrEqual(0);
  });

  it('burns anyone standing in a lava seam', () => {
    const grid = openGrid('lattice');
    const unit = makeUnit(grid, { spawnCell: { col: 8, row: 8 } });
    unit.spawnGrace = 0;
    expect(grid.tileAt(8, 8)).toBe(TILE.HAZARD);
    grid.updateHazards(1, [unit], 0);
    expect(unit.hp).toBeLessThan(unit.maxHp);
  });
});

// ── lobby and rules ─────────────────────────────────────────────────────────
describe('lobby and rules', () => {
  it('builds a default lobby with the player in seat one', () => {
    const seats = defaultSeats(4, 2);
    expect(seats).toHaveLength(4);
    expect(seats[0].isPlayer).toBe(true);
    expect(seats.slice(1).every(seat => !seat.isPlayer)).toBe(true);
  });

  it('resizes between two and ten seats without losing choices', () => {
    let seats = defaultSeats(4, 2);
    seats[2].colorId = 'pink';
    seats = resizeSeats(seats, MAX_PLAYERS, 2);
    expect(seats).toHaveLength(MAX_PLAYERS);
    expect(seats[2].colorId).toBe('pink');
    seats = resizeSeats(seats, MIN_PLAYERS, 2);
    expect(seats).toHaveLength(MIN_PLAYERS);
    expect(resizeSeats(seats, 99, 2)).toHaveLength(MAX_PLAYERS);
    expect(resizeSeats(seats, 0, 2)).toHaveLength(MIN_PLAYERS);
  });

  it('never lets two seats wear the same colour', () => {
    const seats = defaultSeats(6, 2).map(seat => ({ ...seat, colorId: 'cyan' }));
    expect(new Set(enforceUniqueColors(seats).map(seat => seat.colorId)).size).toBe(6);
  });

  it('splits co-op crews and never leaves one empty', () => {
    const seats = defaultSeats(6, 2).map(seat => ({ ...seat, crewId: 'A' }));
    const fixed = normalizeCrews(seats, 'coop', 3);
    expect(new Set(fixed.map(seat => seat.crewId)).size).toBe(3);
    for (const id of ['A', 'B', 'C']) expect(fixed.some(seat => seat.crewId === id)).toBe(true);
  });

  it('keeps the crew layout intact through a trip past free-for-all', () => {
    // The setup screen re-normalises on every repaint, so a round trip through
    // free-for-all must not flatten everybody into one crew.
    const seats = defaultSeats(8, 2);
    const before = seats.map(seat => seat.crewId);
    const roundTrip = normalizeCrews(normalizeCrews(seats, 'ffa', 2), 'coop', 2);
    expect(roundTrip.map(seat => seat.crewId)).toEqual(before);
    expect(roundTrip.filter(seat => seat.crewId === 'A')).toHaveLength(4);
    expect(roundTrip.filter(seat => seat.crewId === 'B')).toHaveLength(4);
  });

  it('round-robins seats that have no valid crew instead of stacking them', () => {
    const seats = defaultSeats(8, 2).map(seat => ({ ...seat, crewId: 'zzz' }));
    const fixed = normalizeCrews(seats, 'coop', 2);
    expect(fixed.filter(seat => seat.crewId === 'A')).toHaveLength(4);
    expect(fixed.filter(seat => seat.crewId === 'B')).toHaveLength(4);
  });

  it('gives every seat its own side in free-for-all', () => {
    const roster = buildBlitzRoster({ seats: defaultSeats(MAX_PLAYERS, 2), teamMode: 'ffa', lives: 3 });
    expect(roster).toHaveLength(MAX_PLAYERS);
    expect(new Set(roster.map(entry => entry.team)).size).toBe(MAX_PLAYERS);
    expect(allColorsUnique(roster)).toBe(true);
    expect(roster.every(entry => entry.character === 'DESTRUCTO')).toBe(true);
    expect(roster[0].isPlayer).toBe(true);
  });

  it('shares sides between crew-mates in co-op', () => {
    const roster = buildBlitzRoster({ seats: defaultSeats(6, 2), teamMode: 'coop', crewCount: 2, lives: 3 });
    expect(new Set(roster.map(entry => entry.team)).size).toBe(2);
    expect(allColorsUnique(roster)).toBe(true);
  });

  it('gives every player their own pad, then walks the pads on respawn', () => {
    const arena = BLITZ_ARENAS.foundry;
    const first = Array.from({ length: MAX_PLAYERS }, (_, slot) => spawnCellFor(arena, slot, 0));
    expect(new Set(first.map(pad => `${pad.col},${pad.row}`)).size).toBe(MAX_PLAYERS);
    expect(spawnCellFor(arena, 0, 1)).toEqual(arena.spawns[1]);
    expect(spawnCellFor(arena, 0, MAX_PLAYERS)).toEqual(arena.spawns[0]);
  });

  it('scores kills to the killer and suicides to nobody', () => {
    const roster = buildBlitzRoster({ seats: defaultSeats(3, 2), teamMode: 'ffa', lives: 3 });
    const board = createScoreboard(roster, 'ffa');
    registerKill(board, 1, 0);
    expect(board.players[1].kills).toBe(1);
    expect(board.players[0].deaths).toBe(1);
    registerKill(board, 2, 2);
    expect(board.players[2].kills).toBe(0);
    expect(board.players[2].suicides).toBe(1);
    registerKill(board, null, 0);
    expect(board.players[0].suicides).toBe(1);
  });

  it('credits a crew-mate kill, because the blast does not care whose side you are on', () => {
    const mate = { id: 1, team: 'A' };
    const victim = { id: 0, team: 'A', lastAttacker: null, lastAttackerTime: -99 };
    expect(resolveKiller(victim, mate, [mate], 0)?.id).toBe(1);
    expect(resolveKiller(victim, { id: 0, team: 'A' }, [], 0)).toBeNull();
  });

  it('falls back to the last attacker inside the credit window', () => {
    const attacker = { id: 2, team: 'B' };
    const victim = { id: 0, team: 'A', lastAttacker: 2, lastAttackerTime: 5 };
    expect(resolveKiller(victim, null, [attacker], 8, 6)?.id).toBe(2);
    expect(resolveKiller(victim, null, [attacker], 20, 6)).toBeNull();
  });

  it('ends the match when only one side can still field a body', () => {
    const units = [
      { team: 'A', eliminated: false }, { team: 'A', eliminated: false },
      { team: 'B', eliminated: false },
    ];
    expect(evaluateMatch(units).over).toBe(false);
    units[2].eliminated = true;
    expect(livingSides(units)).toEqual(['A']);
    const verdict = evaluateMatch(units);
    expect(verdict.over).toBe(true);
    expect(verdict.winner).toBe('A');
    units[0].eliminated = true; units[1].eliminated = true;
    expect(evaluateMatch(units).draw).toBe(true);
  });

  it('keeps power-ups through a respawn but takes the plates', () => {
    const grid = openGrid();
    const unit = makeUnit(grid, { spawnCell: { col: 2, row: 2 } });
    unit.power = 5; unit.charges = 4; unit.speedStacks = 2; unit.plates = 2; unit.kick = true;
    resetUnitForSpawn(unit, grid, { col: 8, row: 8 }, 2);
    expect(unit.power).toBe(5);
    expect(unit.charges).toBe(4);
    expect(unit.speedStacks).toBe(2);
    expect(unit.kick).toBe(true);
    expect(unit.plates).toBe(0);
    expect(unit.hp).toBe(unit.maxHp);
    expect(occupiedCell(unit)).toEqual({ col: 8, row: 8 });
  });
});

// ── AI ──────────────────────────────────────────────────────────────────────
describe('CPU Destructos', () => {
  const ai = grid => new BlitzAI({ grid, difficulty: blitzDifficultyById('nightmare'), random: seeded(4) });

  it('walks out of a tile that is about to explode', () => {
    const grid = openGrid();
    const bomber = makeUnit(grid, { id: 0, spawnCell: { col: 6, row: 6 } });
    // Two tiles down the lane: inside the blast, but with a side-street out.
    const victim = makeUnit(grid, { id: 1, team: 'solo-1', spawnCell: { col: 8, row: 6 } });
    const charge = grid.placeCharge(bomber, 6, 6, 0);
    // A full fuse is not an emergency — the AI only bolts once the tile is
    // about to become lethal, so burn it down first.
    charge.fuse = 0.3;
    const orders = ai(grid).think(victim, { enemies: [bomber], allies: [], dt: 0.016 });
    expect(Math.abs(orders.mx) + Math.abs(orders.mz)).toBeGreaterThan(0);
  });

  it('refuses to bomb when it cannot walk away from its own blast', () => {
    const grid = openGrid();
    // A dead-end pocket: the only exit is inside the blast.
    for (const [col, row] of [[5, 6], [7, 6], [6, 5], [6, 7]]) grid.setTile(col, row, TILE.PILLAR);
    const unit = makeUnit(grid, { id: 0, spawnCell: { col: 6, row: 6 } });
    unit.power = 7;
    expect(ai(grid).hasEscape(unit, grid.dangerMap(2))).toBe(false);
  });

  it('will not drop a charge that would catch a crew-mate', () => {
    const grid = openGrid();
    const unit = makeUnit(grid, { id: 0, team: 'A', spawnCell: { col: 6, row: 6 } });
    const mate = makeUnit(grid, { id: 1, team: 'A', spawnCell: { col: 7, row: 6 } });
    const enemy = makeUnit(grid, { id: 2, team: 'B', spawnCell: { col: 5, row: 6 } });
    expect(ai(grid).think(unit, { enemies: [enemy], allies: [mate], dt: 0.016 }).place).toBe(false);
  });

  it('bombs a rival it can reach and escape from', () => {
    const grid = openGrid();
    const unit = makeUnit(grid, { id: 0, team: 'A', spawnCell: { col: 6, row: 6 } });
    const enemy = makeUnit(grid, { id: 1, team: 'B', spawnCell: { col: 7, row: 6 } });
    expect(ai(grid).think(unit, { enemies: [enemy], allies: [], dt: 0.016 }).place).toBe(true);
  });

  it('emits only orthogonal, adjacent steps', () => {
    const grid = openGrid();
    const unit = makeUnit(grid, { id: 0, team: 'A', spawnCell: { col: 2, row: 2 } });
    const enemy = makeUnit(grid, { id: 1, team: 'B', spawnCell: { col: 12, row: 12 } });
    const brain = ai(grid);
    for (let i = 0; i < 60; i++) {
      const orders = brain.think(unit, { enemies: [enemy], allies: [], dt: 0.016 });
      const magnitude = Math.abs(orders.mx) + Math.abs(orders.mz);
      expect(magnitude === 0 || magnitude === 1).toBe(true);
      stepBlitzUnit(unit, orders, grid, 0.05);
    }
  });

  it('marks live charges and lava on the danger map', () => {
    const grid = openGrid('lattice');
    const unit = makeUnit(grid, { spawnCell: { col: 6, row: 6 } });
    grid.placeCharge(unit, 6, 6, 0);
    const danger = grid.dangerMap(3);
    expect(danger.has('6,6')).toBe(true);
    expect(danger.has('8,8')).toBe(true);     // lava seam
  });
});

// ── audio ───────────────────────────────────────────────────────────────────
describe('the Crate Blitz mixer', () => {
  it('uses the mode’s own recorded set', () => {
    expect(blitzAudioInternals.ROOT).toBe('/sounds/crate_blitz');
    const { BANK } = blitzAudioInternals;
    expect(BANK.death).toHaveLength(4);
    expect(BANK.laugh).toHaveLength(4);
    expect(BANK.brick).toEqual(['brick_explode.wav']);
    expect(BANK.wood).toEqual(['wood_explosion.wav']);
    expect(BANK.debris).toEqual(['debris_explode.wav']);
    expect(BGM_TRACKS.length).toBeGreaterThanOrEqual(4);
    expect(KILL_LAUGH_DELAY).toBe(1);
  });

  it('shuffles the playlist without dropping or duplicating a track', () => {
    const order = shuffled(BGM_TRACKS, seeded(13));
    expect(order.slice().sort()).toEqual(BGM_TRACKS.slice().sort());
    expect(order).toHaveLength(BGM_TRACKS.length);
  });
});

// ── HUD helpers ─────────────────────────────────────────────────────────────
describe('HUD helpers', () => {
  it('formats the match clock', () => {
    expect(blitzHudInternals.clock(0)).toBe('00:00');
    expect(blitzHudInternals.clock(75)).toBe('01:15');
    expect(blitzHudInternals.clock(-4)).toBe('00:00');
  });
  it('draws life and charge pips', () => {
    expect(blitzHudInternals.hearts(2, 3).match(/lit/g)).toHaveLength(2);
    expect(blitzHudInternals.pips(1, 3).match(/lit/g)).toHaveLength(1);
    expect(blitzHudInternals.hearts(0, 3)).not.toContain('lit');
  });
});
