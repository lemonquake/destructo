// The Crate Blitz simulation: the tile lattice, every live Charge Crate, blast
// resolution with chain reactions, obstacle damage, power-up drops, lava seams
// and the sudden-death spiral.
//
// Two rules matter more than anything else in here:
//   1. A blast kills EVERYTHING it touches — the enemy, your crew-mate and you.
//      There is no friendly fire toggle, because in this game the bomb you are
//      standing next to is the threat you are supposed to be reading.
//   2. A tile is only tested on entry (see BlitzUnit), so the lattice never has
//      to reason about partial overlap.
//
// No THREE, no DOM. BlitzMode hangs meshes off the events this class emits and
// the tests drive it directly.

import {
  TILE, TILE_SIZE, WALKABLE, generateGrid, conveyorDirAt, spiralOrder,
  SUDDEN_DEATH, CARDINALS, obstacleAt, isDestructible,
} from '../../data/blitzArenas.js';
import { DESTRUCTO } from '../../data/blitzDestructo.js';
import {
  pickPowerup, MAX_CHARGES, MAX_POWER, MAX_SPEED_STACKS, MAX_PLATES, DROP_CHANCE,
} from '../../data/blitzPowerups.js';
import { occupiedCell } from './BlitzUnit.js';

const noop = () => {};
const key = (col, row) => `${col},${row}`;
export const BLAST_LIFE = 0.45;
export const HAZARD_DPS = 34;

export class BlitzGrid {
  constructor({ arenaDef, random = Math.random, hooks = {} }) {
    this.arena = arenaDef;
    this.random = random;
    this.hooks = {
      onPlaceCharge: noop, onRemoveCharge: noop, onBlast: noop, onObstacleHit: noop,
      onObstacleBroken: noop, onPowerupSpawn: noop, onPowerupTaken: noop, onDamage: noop,
      onSuddenBlock: noop, onSound: noop, ...hooks,
    };
    this.cols = arenaDef.cols;
    this.rows = arenaDef.rows;
    this.tiles = generateGrid(arenaDef, random);
    // Brick blocks take two blasts; anything with more than one hit point keeps
    // its remaining health here rather than in the tile array.
    this.obstacleHp = new Map();
    this.charges = [];
    this.blasts = [];
    this.powerups = [];
    this.nextId = 1;
    this.suddenActive = false;
    this.suddenTimer = 0;
    this.suddenIndex = 0;
    // Spiral runs outside-in, skipping the ring that is already solid wall.
    this.suddenOrder = spiralOrder(this.cols, this.rows).filter(cell => this.tileAt(cell.col, cell.row) !== TILE.PILLAR);
  }

  // ── geometry ──────────────────────────────────────────────────────────────
  inBounds(col, row) { return col >= 0 && row >= 0 && col < this.cols && row < this.rows; }
  tileAt(col, row) { return this.inBounds(col, row) ? this.tiles[row][col] : TILE.PILLAR; }
  setTile(col, row, value) {
    if (!this.inBounds(col, row)) return;
    this.tiles[row][col] = value;
    this.obstacleHp.delete(key(col, row));
  }
  walkable(col, row) { return WALKABLE.has(this.tileAt(col, row)); }
  centerOf(col, row) {
    return {
      x: (col - (this.cols - 1) / 2) * TILE_SIZE,
      z: (row - (this.rows - 1) / 2) * TILE_SIZE,
    };
  }
  cellOf(x, z) {
    return {
      col: Math.round(x / TILE_SIZE + (this.cols - 1) / 2),
      row: Math.round(z / TILE_SIZE + (this.rows - 1) / 2),
    };
  }
  chargeAt(col, row) { return this.charges.find(c => c.col === col && c.row === row) || null; }
  powerupAt(col, row) { return this.powerups.find(p => p.col === col && p.row === row) || null; }
  obstacleHpAt(col, row) {
    const spec = obstacleAt(this.tileAt(col, row));
    if (!spec) return 0;
    return this.obstacleHp.get(key(col, row)) ?? spec.hp;
  }

  // ── charges ───────────────────────────────────────────────────────────────
  canPlace(unit, col, row) {
    if (unit.dead || unit.eliminated || unit.frozen > 0) return false;
    if (unit.chargesLive >= unit.charges) return false;
    if (!this.walkable(col, row)) return false;
    return !this.chargeAt(col, row);
  }
  placeCharge(unit, col, row, time = 0) {
    if (!this.canPlace(unit, col, row)) return null;
    const charge = {
      id: this.nextId++, col, row, ownerId: unit.id, team: unit.team, owner: unit,
      fuse: unit.fuse, power: unit.power,
      color: DESTRUCTO.charge.color, damage: DESTRUCTO.charge.damage,
      placedAt: time, kickDir: null, kickSpeed: 0, slide: 0,
    };
    this.charges.push(charge);
    unit.chargesLive++;
    this.hooks.onPlaceCharge(charge);
    this.hooks.onSound('place', charge);
    return charge;
  }
  // Walking into a live charge with the Punt Glove sends it down the lane.
  kickCharge(charge, dx, dz) {
    if (!charge || charge.kickDir) return false;
    charge.kickDir = { dx, dz };
    charge.kickSpeed = 16;
    this.hooks.onSound('kick', charge);
    return true;
  }

  // ── blast shape ───────────────────────────────────────────────────────────
  // The classic cross: four lanes out of the charge, each one stopped by the
  // first pillar it meets or the first obstacle it damages. Pure with respect
  // to the grid — nothing is mutated here, which is what lets the AI project
  // this forward in time to build its danger map.
  blastPlan(charge) {
    const cells = [{ col: charge.col, row: charge.row }];
    const hit = [];
    const chained = [];
    const power = Math.max(1, charge.power);
    const consider = (col, row) => {
      const other = this.chargeAt(col, row);
      if (other && other.id !== charge.id && !chained.includes(other)) chained.push(other);
    };
    consider(charge.col, charge.row);

    for (const dir of CARDINALS) {
      for (let step = 1; step <= power; step++) {
        const col = charge.col + dir.dx * step, row = charge.row + dir.dz * step;
        const tile = this.tileAt(col, row);
        if (tile === TILE.PILLAR || tile === TILE.SUDDEN) break;
        cells.push({ col, row });
        consider(col, row);
        if (isDestructible(tile)) { hit.push({ col, row }); break; }
      }
    }
    return { cells, hit, chained };
  }

  // ── detonation ────────────────────────────────────────────────────────────
  detonate(charge, units = [], time = 0, depth = 0) {
    const index = this.charges.indexOf(charge);
    if (index < 0) return null;
    this.charges.splice(index, 1);
    if (charge.owner) charge.owner.chargesLive = Math.max(0, charge.owner.chargesLive - 1);
    this.hooks.onRemoveCharge(charge);

    const plan = this.blastPlan(charge);

    // Power-ups already lying in the blast are destroyed — you cannot stockpile
    // upgrades in a crossfire. This sweep runs BEFORE the new drops appear,
    // because a drop always lands on a tile this very blast just covered.
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const powerup = this.powerups[i];
      if (!plan.cells.some(cell => cell.col === powerup.col && cell.row === powerup.row)) continue;
      this.powerups.splice(i, 1);
      this.hooks.onPowerupTaken(powerup, null, null);
    }

    // Obstacles. Brick takes two blasts, so a hit is not always a break — the
    // caller is told about both so it can play the right sound and crack the
    // mesh rather than delete it.
    const broken = [];
    for (const cell of plan.hit) {
      const result = this.damageObstacle(cell.col, cell.row, charge.owner);
      if (result?.broken) broken.push(result);
    }

    const blast = {
      id: this.nextId++, cells: plan.cells, life: BLAST_LIFE, maxLife: BLAST_LIFE,
      color: charge.color, ownerId: charge.ownerId, team: charge.team,
      origin: { col: charge.col, row: charge.row }, power: charge.power,
    };
    this.blasts.push(blast);
    this.hooks.onBlast(blast, charge, broken.length);
    this.hooks.onSound('blast', charge);

    this.applyBlastDamage(blast, charge, units, time);

    // Chain reactions run last so a wall of crates goes off like a wall.
    for (const other of plan.chained) {
      if (depth > 8) break;
      this.detonate(other, units, time, depth + 1);
    }
    return blast;
  }

  // Returns { col, row, spec, broken } or null if the tile was not an obstacle.
  damageObstacle(col, row, source = null) {
    const tile = this.tileAt(col, row);
    const spec = obstacleAt(tile);
    if (!spec) return null;
    const k = key(col, row);
    const hp = (this.obstacleHp.get(k) ?? spec.hp) - 1;
    if (hp > 0) {
      this.obstacleHp.set(k, hp);
      this.hooks.onObstacleHit({ col, row, spec, hp, maxHp: spec.hp });
      return { col, row, spec, broken: false };
    }
    this.setTile(col, row, TILE.FLOOR);
    if (source) source.obstaclesDestroyed++;
    this.hooks.onObstacleBroken({ col, row, spec });
    // Tougher obstacles are worth cracking: the roll is biased by material.
    const drop = this.rollDrop(spec);
    if (drop) {
      const powerup = { id: this.nextId++, col, row, kind: drop.id, color: drop.color, def: drop };
      this.powerups.push(powerup);
      this.hooks.onPowerupSpawn(powerup);
    }
    return { col, row, spec, broken: true };
  }

  rollDrop(spec) {
    // `dropBias` scales the base chance only; the weighted pick is untouched so
    // the relative rarity of each upgrade is the same on every material.
    if (this.random() > Math.min(0.85, DROP_CHANCE * (spec.dropBias ?? 1))) return null;
    return pickPowerup(this.random);
  }

  // Anyone standing in the blast dies — team-mate, rival or the person who
  // placed it. Spawn protection and a Bubble Plate are the only two things
  // that stop it, and both are visible on the board.
  applyBlastDamage(blast, charge, units, time) {
    for (const unit of units) {
      if (unit.dead || unit.eliminated) continue;
      const cell = occupiedCell(unit);
      if (!blast.cells.some(c => c.col === cell.col && c.row === cell.row)) continue;
      this.damageUnit(unit, charge.damage, charge.owner, 'blast', time);
    }
  }

  damageUnit(unit, amount, source, kind, time = 0) {
    if (unit.dead || unit.eliminated || amount <= 0) return 0;
    if (unit.spawnGrace > 0) return 0;
    if (unit.plates > 0 && kind === 'blast') {
      unit.plates--;
      this.hooks.onDamage(unit, 0, source, 'plated', time);
      return 0;
    }
    unit.hp -= amount;
    if (source && source.id !== unit.id) {
      source.damageDealt += amount;
      unit.lastAttacker = source.id;
      unit.lastAttackerTime = time;
    }
    this.hooks.onDamage(unit, amount, source, kind, time);
    return amount;
  }

  // ── power-ups ─────────────────────────────────────────────────────────────
  applyPowerup(unit, kind) {
    switch (kind) {
      case 'charge': unit.charges = Math.min(MAX_CHARGES, unit.charges + 1); break;
      case 'power': unit.power = Math.min(MAX_POWER, unit.power + 1); break;
      case 'speed': unit.speedStacks = Math.min(MAX_SPEED_STACKS, unit.speedStacks + 1); break;
      case 'shield': unit.plates = Math.min(MAX_PLATES, unit.plates + 1); break;
      case 'kick': unit.kick = true; break;
      case 'heal': unit.hp = unit.maxHp; break;
      default: break;
    }
    return kind;
  }

  // ── per-frame ─────────────────────────────────────────────────────────────
  update(dt, units, time = 0) {
    this.updateCharges(dt, units, time);
    this.updateBlasts(dt);
    this.updatePickups(units);
    this.updateHazards(dt, units, time);
    if (this.suddenActive) this.updateSuddenDeath(dt, units, time);
  }

  updateCharges(dt, units, time) {
    for (const charge of [...this.charges]) {
      if (charge.kickDir) this.slideCharge(charge, dt, units, time);
      charge.fuse -= dt;
      if (charge.fuse <= 0) this.detonate(charge, units, time);
    }
  }
  slideCharge(charge, dt, units, time) {
    const { dx, dz } = charge.kickDir;
    charge.slide = (charge.slide || 0) + (charge.kickSpeed * dt) / TILE_SIZE;
    while (charge.slide >= 1) {
      charge.slide -= 1;
      const col = charge.col + dx, row = charge.row + dz;
      // A kicked crate stops at a wall, at another crate, or under anybody
      // unlucky enough to be standing in the lane.
      const occupied = units.some(unit => !unit.dead && !unit.eliminated
        && (() => { const cell = occupiedCell(unit); return cell.col === col && cell.row === row; })());
      if (!this.walkable(col, row) || this.chargeAt(col, row) || occupied) {
        charge.kickDir = null; charge.slide = 0;
        break;
      }
      charge.col = col; charge.row = row;
    }
    void units; void time;
  }

  updateBlasts(dt) {
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const blast = this.blasts[i];
      blast.life -= dt;
      if (blast.life <= 0) this.blasts.splice(i, 1);
    }
  }

  updatePickups(units) {
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const powerup = this.powerups[i];
      const taker = units.find(unit => {
        if (unit.dead || unit.eliminated) return false;
        const cell = occupiedCell(unit);
        return cell.col === powerup.col && cell.row === powerup.row;
      });
      if (!taker) continue;
      this.powerups.splice(i, 1);
      this.applyPowerup(taker, powerup.kind);
      taker.powerupsTaken++;
      this.hooks.onPowerupTaken(powerup, taker, powerup.def);
      this.hooks.onSound('pickup', powerup);
    }
  }

  updateHazards(dt, units, time) {
    for (const unit of units) {
      if (unit.dead || unit.eliminated) continue;
      const cell = occupiedCell(unit);
      if (this.tileAt(cell.col, cell.row) !== TILE.HAZARD) continue;
      this.damageUnit(unit, HAZARD_DPS * dt, null, 'hazard', time);
    }
  }

  beginSuddenDeath() {
    if (this.suddenActive) return;
    this.suddenActive = true;
    this.suddenTimer = 0;
  }
  updateSuddenDeath(dt, units, time) {
    this.suddenTimer -= dt;
    if (this.suddenTimer > 0) return;
    this.suddenTimer = SUDDEN_DEATH.interval;
    while (this.suddenIndex < this.suddenOrder.length) {
      const cell = this.suddenOrder[this.suddenIndex++];
      if (this.tileAt(cell.col, cell.row) === TILE.SUDDEN) continue;
      this.setTile(cell.col, cell.row, TILE.SUDDEN);
      const charge = this.chargeAt(cell.col, cell.row);
      if (charge) this.detonate(charge, units, time);
      for (const unit of units) {
        if (unit.dead || unit.eliminated) continue;
        const at = occupiedCell(unit);
        if (at.col === cell.col && at.row === cell.row) this.damageUnit(unit, 9999, null, 'crushed', time);
      }
      this.hooks.onSuddenBlock(cell);
      return;
    }
  }

  // ── AI support ────────────────────────────────────────────────────────────
  // Seconds until each tile becomes lethal. Tiles absent from the map are safe
  // for at least `lookahead` seconds.
  dangerMap(lookahead = 2) {
    const danger = new Map();
    const mark = (col, row, when) => {
      const k = key(col, row);
      const current = danger.get(k);
      if (current === undefined || when < current) danger.set(k, when);
    };
    for (const blast of this.blasts) for (const cell of blast.cells) mark(cell.col, cell.row, 0);
    for (const charge of this.charges) {
      const when = Math.max(0, charge.fuse);
      if (when > lookahead) continue;
      for (const cell of this.blastPlan(charge).cells) mark(cell.col, cell.row, when);
    }
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        if (this.tileAt(col, row) === TILE.HAZARD) mark(col, row, 0);
      }
    }
    return danger;
  }
  // Would a charge placed on this cell reach the given cell?
  wouldHit(unit, fromCol, fromRow, targetCol, targetRow) {
    const probe = { id: -1, col: fromCol, row: fromRow, power: unit.power, color: 0 };
    return this.blastPlan(probe).cells.some(cell => cell.col === targetCol && cell.row === targetRow);
  }
  obstacleCount() {
    let count = 0;
    for (let row = 0; row < this.rows; row++) for (let col = 0; col < this.cols; col++) {
      if (isDestructible(this.tiles[row][col])) count++;
    }
    return count;
  }
  conveyorAt(col, row) {
    return this.tileAt(col, row) === TILE.CONVEYOR ? conveyorDirAt(this.arena, col, row) : null;
  }
  clear() {
    for (const charge of this.charges) this.hooks.onRemoveCharge(charge);
    for (const powerup of this.powerups) this.hooks.onPowerupTaken(powerup, null, null);
    this.charges.length = 0; this.blasts.length = 0; this.powerups.length = 0;
    this.obstacleHp.clear();
  }
}

export const blitzGridInternals = { key, TILE_SIZE };
