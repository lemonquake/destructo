// Crate Blitz CPU Destructos.
//
// The whole game is "do not be standing there in two seconds", so the brain is
// built around a danger map: every live charge projects its blast plan forward
// in time, and the AI refuses to place a charge it cannot walk away from.
//
// Since the blast now kills everyone regardless of crew, the AI has to treat
// its own team-mates as things it can murder — so a co-op partner standing in
// the plan is a reason NOT to bomb, and a partner's charge is as dangerous as
// anybody else's.

import { TILE_SIZE, CARDINALS, isDestructible } from '../../data/blitzArenas.js';
import { occupiedCell, canEnter } from './BlitzUnit.js';

const key = (col, row) => `${col},${row}`;
const MAX_PATH = 160;

export class BlitzAI {
  constructor({ grid, difficulty, random = Math.random }) {
    this.grid = grid;
    this.difficulty = difficulty;
    this.random = random;
    this.memory = new Map();
  }
  setGrid(grid) { this.grid = grid; this.memory.clear(); }
  setDifficulty(difficulty) { this.difficulty = difficulty; }
  forget(id) { this.memory.delete(id); }
  brain(unit) {
    let brain = this.memory.get(unit.id);
    if (!brain) {
      brain = { mode: 'hunt', path: [], repath: 0, targetId: null, placeCooldown: 0 };
      this.memory.set(unit.id, brain);
    }
    return brain;
  }

  // ── traversal ─────────────────────────────────────────────────────────────
  passable(col, row, danger, allowDanger) {
    if (!canEnter(this.grid, col, row)) return false;
    if (!allowDanger && danger?.has(key(col, row))) return false;
    return true;
  }
  // Breadth-first walk over the lattice from the unit's current tile.
  search(unit, isGoal, { danger = null, allowDanger = true, limit = MAX_PATH } = {}) {
    const start = occupiedCell(unit);
    const seen = new Map([[key(start.col, start.row), null]]);
    let frontier = [{ ...start, steps: 0 }];
    if (isGoal(start.col, start.row, 0)) return { goal: start, path: [], steps: 0 };
    let visited = 0;
    while (frontier.length && visited < limit) {
      const next = [];
      for (const node of frontier) {
        visited++;
        for (const dir of CARDINALS) {
          const col = node.col + dir.dx, row = node.row + dir.dz;
          const k = key(col, row);
          if (seen.has(k)) continue;
          if (!this.passable(col, row, danger, allowDanger)) continue;
          seen.set(k, { col: node.col, row: node.row });
          if (isGoal(col, row, node.steps + 1)) {
            const path = [];
            let cursor = { col, row };
            while (cursor && !(cursor.col === start.col && cursor.row === start.row)) {
              path.unshift(cursor);
              cursor = seen.get(key(cursor.col, cursor.row));
            }
            return { goal: { col, row }, path, steps: node.steps + 1 };
          }
          next.push({ col, row, steps: node.steps + 1 });
        }
      }
      frontier = next;
    }
    return null;
  }

  // Seconds it takes this unit to cross one tile — the currency the danger map
  // is compared against.
  perTile(unit) { return TILE_SIZE / Math.max(1, unit.speed + unit.speedStacks * 1.4); }

  // Is there anywhere to run once this charge is in the ground? Uses the real
  // blast plan of the charge about to be placed, plus everything already ticking.
  hasEscape(unit, danger) {
    const grid = this.grid;
    const start = occupiedCell(unit);
    const probe = { id: -1, col: start.col, row: start.row, power: unit.power, color: 0 };
    const covered = new Set(grid.blastPlan(probe).cells.map(cell => key(cell.col, cell.row)));
    const fuse = unit.fuse;
    const perTile = this.perTile(unit);
    const found = this.search(unit, (col, row, steps) => {
      if (covered.has(key(col, row))) return false;
      const when = danger.get(key(col, row));
      if (when !== undefined && when < steps * perTile + 0.3) return false;
      return steps * perTile < fuse - 0.25;
    }, { danger: null, allowDanger: true });
    return Boolean(found);
  }

  // ── movement ──────────────────────────────────────────────────────────────
  // The unit walks tile to tile, so an order is simply "which neighbour next".
  // Emitting a unit vector toward the next path cell is all the movement layer
  // needs, and it re-derives the cardinal itself.
  followPath(unit, brain) {
    const here = occupiedCell(unit);
    while (brain.path.length) {
      const next = brain.path[0];
      if (next.col === here.col && next.row === here.row) { brain.path.shift(); continue; }
      const dx = next.col - here.col, dz = next.row - here.row;
      // A path step is always orthogonal and adjacent; anything else means the
      // unit was shoved off the route and it should be recomputed.
      if (Math.abs(dx) + Math.abs(dz) !== 1) { brain.path.length = 0; break; }
      return { mx: dx, mz: dz };
    }
    return { mx: 0, mz: 0 };
  }

  // ── main entry ────────────────────────────────────────────────────────────
  think(unit, { allies = [], enemies = [], dt = 0.016 } = {}) {
    const input = { mx: 0, mz: 0, place: false };
    if (unit.dead || unit.eliminated) return input;
    const brain = this.brain(unit);
    brain.repath -= dt;
    brain.placeCooldown -= dt;
    if (unit.frozen > 0) return input;

    const grid = this.grid;
    const danger = grid.dangerMap(this.difficulty.dangerLookahead);
    const here = occupiedCell(unit);
    const inDanger = danger.has(key(here.col, here.row));

    // 1 · Standing in a future explosion beats every other consideration.
    if (inDanger) {
      const blunder = this.random() < this.difficulty.mistakes;
      if (!blunder) {
        brain.mode = 'flee';
        const perTile = this.perTile(unit);
        const escape = this.search(unit, (col, row, steps) => {
          const when = danger.get(key(col, row));
          return when === undefined || when > steps * perTile + 0.45;
        }, { allowDanger: true });
        if (escape?.path.length) {
          brain.path = escape.path;
          return { ...input, ...this.followPath(unit, brain) };
        }
        return input;   // cornered: at least stop walking deeper into it
      }
    }

    // 2 · A hostile in blast range, nobody friendly in it, and a way out
    //     afterwards: light them up. Friendly fire is real now, so a crew-mate
    //     inside the plan vetoes the bomb.
    if (brain.placeCooldown <= 0 && grid.canPlace(unit, here.col, here.row) && this.random() < this.difficulty.nerve) {
      const plan = grid.blastPlan({ id: -1, col: here.col, row: here.row, power: unit.power, color: 0 });
      const covers = subject => {
        if (subject.dead || subject.eliminated) return false;
        const cell = occupiedCell(subject);
        return plan.cells.some(c => c.col === cell.col && c.row === cell.row);
      };
      if (enemies.some(covers) && !allies.some(covers) && this.hasEscape(unit, danger)) {
        brain.placeCooldown = 0.5 + this.difficulty.reaction;
        brain.mode = 'attack';
        brain.path = [];
        return { ...input, place: true };
      }
    }

    if (brain.repath > 0 && brain.path.length) {
      return { ...input, ...this.followPath(unit, brain) };
    }
    brain.repath = this.difficulty.reaction + this.random() * 0.35;

    // 3 · Free upgrades lying on the floor are worth a detour.
    if (grid.powerups.length && this.random() < this.difficulty.greed) {
      const loot = this.search(unit, (col, row) => Boolean(grid.powerupAt(col, row)), { danger, allowDanger: false });
      if (loot?.path.length) {
        brain.mode = 'loot';
        brain.path = loot.path;
        return { ...input, ...this.followPath(unit, brain) };
      }
    }

    // 4 · Nothing to shoot: open the maze up. Breaking obstacles makes drops
    //     and the lanes needed to reach anybody.
    const adjacentObstacle = CARDINALS.some(dir => isDestructible(grid.tileAt(here.col + dir.dx, here.row + dir.dz)));
    if (adjacentObstacle && brain.placeCooldown <= 0 && grid.canPlace(unit, here.col, here.row) && this.hasEscape(unit, danger)) {
      brain.placeCooldown = 0.7 + this.difficulty.reaction;
      brain.mode = 'breach';
      brain.path = [];
      return { ...input, place: true };
    }

    // 5 · Close on the target through open floor; if the lane is walled off,
    //     walk to the nearest obstacle on the way and breach it next tick.
    const target = this.pickTarget(unit, enemies, brain);
    if (target) {
      brain.mode = 'hunt';
      const cell = occupiedCell(target);
      const hunt = this.search(unit, (col, row) => col === cell.col && row === cell.row, { danger, allowDanger: false });
      if (hunt?.path.length) {
        brain.path = hunt.path;
        return { ...input, ...this.followPath(unit, brain) };
      }
      const toward = this.search(unit, (col, row) => CARDINALS.some(dir => isDestructible(grid.tileAt(col + dir.dx, row + dir.dz))), { danger, allowDanger: false });
      if (toward?.path.length) {
        brain.path = toward.path;
        return { ...input, ...this.followPath(unit, brain) };
      }
    }

    // 6 · Truly nothing to do: wander somewhere safe so sudden death cannot pin us.
    const roam = this.search(unit, (col, row, steps) => steps > 3 && !danger.has(key(col, row)), { danger, allowDanger: false });
    if (roam?.path.length) {
      brain.mode = 'roam';
      brain.path = roam.path;
      return { ...input, ...this.followPath(unit, brain) };
    }
    return input;
  }

  pickTarget(unit, enemies, brain) {
    let best = null, bestScore = -Infinity;
    const here = occupiedCell(unit);
    for (const enemy of enemies) {
      if (enemy.dead || enemy.eliminated) continue;
      const cell = occupiedCell(enemy);
      const distance = Math.abs(cell.col - here.col) + Math.abs(cell.row - here.row);
      let score = 120 - distance * 3;
      score += (1 - enemy.hp / enemy.maxHp) * 40;
      if (enemy.id === unit.lastAttacker) score += 20;
      if (enemy.livesLeft === 1) score += 25;
      if (score > bestScore) { bestScore = score; best = enemy; }
    }
    brain.targetId = best?.id ?? null;
    return best;
  }
}

export const blitzAiInternals = { key, MAX_PATH };
