// End-to-end simulation of a Crate Blitz match through the pure layers
// (grid + units + AI + rules). No THREE and no DOM, so the whole match loop
// that BlitzMode drives can be exercised in a plain test run.

import { describe, expect, it } from 'vitest';
import { blitzArenaById, blitzDifficultyById, SUDDEN_DEATH } from '../src/data/blitzArenas.js';
import { BlitzGrid } from '../src/game/blitz/BlitzGrid.js';
import { BlitzAI } from '../src/game/blitz/BlitzAI.js';
import { createBlitzUnit, stepBlitzUnit, materializeCharge, resetUnitForSpawn, occupiedCell } from '../src/game/blitz/BlitzUnit.js';
import {
  defaultSeats, buildBlitzRoster, createScoreboard, registerKill,
  resolveKiller, evaluateMatch, spawnCellFor,
} from '../src/game/blitz/BlitzRules.js';

const seeded = seed => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const RESPAWN = 3;
const GRACE = 2;

// A stripped-down BlitzMode: everything except the meshes, the HUD and the
// mixer. If this can run a match to completion, so can the real thing.
function simulate({ arenaId = 'foundry', players = 4, teamMode = 'ffa', crewCount = 2, lives = 1, seed = 5, maxSeconds = 240 } = {}) {
  const random = seeded(seed);
  const arena = blitzArenaById(arenaId);
  const events = { blasts: 0, broken: 0, drops: 0, taken: 0, kills: 0, tremors: 0 };
  const grid = new BlitzGrid({
    arenaDef: arena,
    random,
    hooks: {
      onBlast: (_blast, _charge, brokenCount) => {
        events.blasts++;
        if (brokenCount >= 3) events.tremors++;
      },
      onObstacleBroken: () => { events.broken++; },
      onPowerupSpawn: () => { events.drops++; },
      onPowerupTaken: (_powerup, taker) => { if (taker) events.taken++; },
      onDamage: (unit, amount, source, kind, time) => {
        if (kind === 'plated' || unit.hp > 0) return;
        kill(unit, source, time);
      },
    },
  });
  const ai = new BlitzAI({ grid, difficulty: blitzDifficultyById('regular'), random });
  const roster = buildBlitzRoster({ seats: defaultSeats(players, crewCount), teamMode, crewCount, lives });
  const board = createScoreboard(roster, teamMode);
  const units = roster.map(entry => {
    const unit = createBlitzUnit({
      id: entry.slot, team: entry.team, spawnCell: spawnCellFor(arena, entry.slot, 0), grid,
      isPlayer: entry.isPlayer, name: entry.name, color: entry.color, lives: entry.lives,
    });
    unit.spawnGrace = GRACE;
    return unit;
  });

  function kill(victim, source, time) {
    if (victim.dead || victim.eliminated) return;
    const killer = resolveKiller(victim, source, units, time, 6);
    victim.dead = true;
    victim.hp = 0;
    victim.chargesLive = 0;
    victim.livesLeft = Math.max(0, victim.livesLeft - 1);
    victim.respawnTimer = RESPAWN;
    ai.forget(victim.id);
    registerKill(board, killer ? killer.slot : null, victim.slot);
    events.kills++;
    if (victim.livesLeft <= 0) victim.eliminated = true;
  }

  let elapsed = 0;
  const dt = 1 / 30;
  let verdict = evaluateMatch(units);
  while (!verdict.over && elapsed < maxSeconds) {
    elapsed += dt;
    if (!grid.suddenActive && elapsed >= SUDDEN_DEATH.startsAt) grid.beginSuddenDeath();
    for (const unit of units) {
      if (unit.eliminated) continue;
      if (unit.dead) {
        unit.respawnTimer -= dt;
        if (unit.respawnTimer <= 0) {
          resetUnitForSpawn(unit, grid, spawnCellFor(arena, unit.slot, ++unit.respawnCount || 1), GRACE);
        }
        continue;
      }
      const orders = ai.think(unit, {
        allies: units.filter(o => o.id !== unit.id && o.team === unit.team && !o.dead && !o.eliminated),
        enemies: units.filter(o => o.team !== unit.team && !o.dead && !o.eliminated),
        dt,
      });
      stepBlitzUnit(unit, orders, grid, dt);
      if (orders.place) materializeCharge(unit, grid, elapsed);
    }
    grid.update(dt, units, elapsed);
    verdict = evaluateMatch(units);
  }
  return { grid, units, board, events, elapsed, verdict, roster };
}

describe('a full Crate Blitz match', () => {
  it('runs to a winner without throwing, in free-for-all', () => {
    const run = simulate({ players: 4, teamMode: 'ffa', lives: 1, seed: 5 });
    expect(run.verdict.over).toBe(true);
    expect(run.units.filter(unit => !unit.eliminated).length).toBeLessThanOrEqual(1);
    expect(run.events.blasts).toBeGreaterThan(0);
    expect(run.events.broken).toBeGreaterThan(0);
    expect(run.events.kills).toBeGreaterThan(0);
  });

  it('runs to a winning crew in co-op', () => {
    const run = simulate({ players: 6, teamMode: 'coop', crewCount: 2, lives: 1, seed: 17 });
    expect(run.verdict.over).toBe(true);
    if (!run.verdict.draw) {
      const survivors = run.units.filter(unit => !unit.eliminated);
      expect(new Set(survivors.map(unit => unit.team)).size).toBe(1);
      expect(survivors[0].team).toBe(run.verdict.winner);
    }
  });

  it('survives a full ten-player lattice on every arena', () => {
    for (const arenaId of ['foundry', 'blockparty', 'lattice']) {
      const run = simulate({ arenaId, players: 10, teamMode: 'ffa', lives: 1, seed: 31 });
      expect(run.verdict.over).toBe(true);
      // Nobody ends the match wedged between tiles.
      for (const unit of run.units) {
        const cell = occupiedCell(unit);
        expect(Number.isInteger(cell.col)).toBe(true);
        expect(Number.isInteger(cell.row)).toBe(true);
      }
    }
  });

  it('opens the maze up and hands out upgrades along the way', () => {
    const run = simulate({ players: 6, teamMode: 'ffa', lives: 3, seed: 44 });
    expect(run.events.broken).toBeGreaterThan(20);
    expect(run.events.drops).toBeGreaterThan(0);
    expect(run.events.taken).toBeGreaterThan(0);
    // Somebody actually got stronger than they started.
    expect(run.units.some(unit => unit.power > 2 || unit.charges > 1 || unit.speedStacks > 0)).toBe(true);
  });

  it('produces multi-obstacle blasts big enough to shake the camera', () => {
    const run = simulate({ players: 8, teamMode: 'ffa', lives: 3, seed: 61 });
    expect(run.events.tremors).toBeGreaterThan(0);
  });

  it('never leaves a live charge without an owner slot to give back', () => {
    const run = simulate({ players: 4, teamMode: 'ffa', lives: 1, seed: 8 });
    for (const unit of run.units) {
      expect(unit.chargesLive).toBeGreaterThanOrEqual(0);
      expect(unit.chargesLive).toBeLessThanOrEqual(unit.charges);
    }
  });

  it('records every stat the debrief reports', () => {
    const run = simulate({ players: 6, teamMode: 'ffa', lives: 3, seed: 23 });
    const totals = run.units.reduce((sum, unit) => ({
      bombsPlaced: sum.bombsPlaced + unit.bombsPlaced,
      obstaclesDestroyed: sum.obstaclesDestroyed + unit.obstaclesDestroyed,
      powerupsTaken: sum.powerupsTaken + unit.powerupsTaken,
    }), { bombsPlaced: 0, obstaclesDestroyed: 0, powerupsTaken: 0 });
    expect(totals.bombsPlaced).toBeGreaterThan(0);
    expect(totals.obstaclesDestroyed).toBeGreaterThan(0);
    expect(totals.powerupsTaken).toBeGreaterThanOrEqual(0);
    const scored = Object.values(run.board.players);
    expect(scored.reduce((sum, row) => sum + row.deaths, 0)).toBeGreaterThan(0);
  });
});
