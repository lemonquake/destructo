// Destructos on foot in the Crate Blitz lattice.
//
// Movement is grid-locked, exactly like the game this mode is cloning: a unit
// is either parked dead-centre on a tile or travelling in a straight line into
// one specific neighbouring tile. There is no free-roaming position, no box
// sweep and no partial overlap — which is what makes lanes readable, makes
// "did my blast reach them" unambiguous, and makes it structurally impossible
// to get wedged on the charge you just dropped (a tile is only ever tested when
// you ENTER it, and you can always walk off the one you are standing on).
//
// No THREE, no DOM: BlitzMode reads x/z off the unit and moves a mesh there.

import { TILE_SIZE } from '../../data/blitzArenas.js';
import { DESTRUCTO } from '../../data/blitzDestructo.js';
import { SPEED_PER_STACK } from '../../data/blitzPowerups.js';

// Guards the catch-up loop below: at absurd speeds or after a long stall a
// single frame must not walk the whole board.
const MAX_STEPS_PER_FRAME = 6;
export const CONVEYOR_SPEED = 9;

export function createBlitzUnit({ id, team, spawnCell, grid, isPlayer = false, name = '', color = 0x2fb4ff, colorName = '', teamName = '', lives = 3 }) {
  const stats = DESTRUCTO.stats;
  const point = grid.centerOf(spawnCell.col, spawnCell.row);
  return {
    id, slot: id, team, isPlayer, name: name || DESTRUCTO.name,
    color, colorName, teamName,
    // logical position
    col: spawnCell.col, row: spawnCell.row,
    fromCol: spawnCell.col, fromRow: spawnCell.row,
    moveT: 0, dir: null, queued: null,
    x: point.x, z: point.z, facing: 0,
    // vitals
    hp: stats.maxHp, maxHp: stats.maxHp,
    lives, livesLeft: lives, eliminated: false,
    // loadout — every Destructo starts identical; power-ups are the whole game
    speed: stats.speed, speedStacks: 0,
    charges: stats.charges, power: stats.power, fuse: stats.fuse,
    chargesLive: 0, plates: 0, kick: false, frozen: 0,
    dead: false, respawnTimer: 0, spawnGrace: 0,
    placeCooldown: 0,
    lastAttacker: null, lastAttackerTime: -99,
    // scoreboard
    kills: 0, deaths: 0, bombsPlaced: 0, obstaclesDestroyed: 0,
    powerupsTaken: 0, damageDealt: 0, suicides: 0,
  };
}

export const unitSpeed = unit => unit.speed + unit.speedStacks * SPEED_PER_STACK;
export const isMoving = unit => unit.dir !== null;

// The tile a unit counts as occupying right now: the one it is closest to.
// Used for placing charges, taking pickups and being caught in a blast, so all
// three agree with what the player can see under their feet.
export function occupiedCell(unit) {
  return unit.moveT < 0.5
    ? { col: unit.fromCol, row: unit.fromRow }
    : { col: unit.col, row: unit.row };
}

// A tile may be entered if it is walkable terrain and nothing solid is parked
// on it. Charges are solid to everybody, including their owner — you leave the
// one under you by walking off, never by walking back on.
export function canEnter(grid, col, row) {
  if (!grid.walkable(col, row)) return false;
  return !grid.chargeAt(col, row);
}

function syncWorld(unit, grid) {
  const from = grid.centerOf(unit.fromCol, unit.fromRow);
  if (!unit.dir) { unit.x = from.x; unit.z = from.z; return; }
  const to = grid.centerOf(unit.col, unit.row);
  unit.x = from.x + (to.x - from.x) * unit.moveT;
  unit.z = from.z + (to.z - from.z) * unit.moveT;
}

// Snap the unit onto a tile centre, cancelling any journey in progress. Used
// by spawns and by knockback.
export function placeOnCell(unit, grid, col, row) {
  unit.col = col; unit.row = row;
  unit.fromCol = col; unit.fromRow = row;
  unit.moveT = 0; unit.dir = null; unit.queued = null;
  syncWorld(unit, grid);
  return unit;
}

// Turns raw stick/key input into a single cardinal step. The dominant axis wins
// and the other is kept as a fallback, so holding a diagonal into a wall slides
// you along it instead of stopping you dead — the standard assist that makes
// grid movement feel forgiving without ever leaving the grid.
function desiredDirections(input) {
  const mx = input.mx || 0, mz = input.mz || 0;
  if (!mx && !mz) return [];
  const horizontal = { dx: Math.sign(mx), dz: 0 };
  const vertical = { dx: 0, dz: Math.sign(mz) };
  if (!mx) return [vertical];
  if (!mz) return [horizontal];
  return Math.abs(mx) >= Math.abs(mz) ? [horizontal, vertical] : [vertical, horizontal];
}

function beginStep(unit, grid, dir) {
  const col = unit.fromCol + dir.dx, row = unit.fromRow + dir.dz;
  if (!canEnter(grid, col, row)) return false;
  unit.dir = dir;
  unit.col = col; unit.row = row;
  unit.moveT = 0;
  unit.facing = Math.atan2(dir.dx, dir.dz);
  return true;
}

function arrive(unit) {
  unit.fromCol = unit.col;
  unit.fromRow = unit.row;
  unit.moveT = 0;
  unit.dir = null;
}

export function stepBlitzUnit(unit, input, grid, dt) {
  const report = { moved: false, arrived: false, blocked: null, kicked: false };
  if (unit.dead || unit.eliminated) return report;
  if (unit.spawnGrace > 0) unit.spawnGrace -= dt;
  if (unit.placeCooldown > 0) unit.placeCooldown -= dt;
  if (unit.frozen > 0) {
    unit.frozen -= dt;
    syncWorld(unit, grid);
    return report;
  }

  // Face where the stick is pointing even when the lane ahead is walled, so the
  // model reads as "trying to go that way" rather than staring at a wall.
  const wanted = desiredDirections(input);
  if (!unit.dir && wanted.length) unit.facing = Math.atan2(wanted[0].dx, wanted[0].dz);

  // Distance budget for this frame, spent tile by tile. Any overshoot at the
  // end of a tile rolls into the next one, so movement speed is exactly
  // `unitSpeed` regardless of framerate and a unit never stutters at a corner.
  let budget = unitSpeed(unit) * dt;
  for (let guard = 0; guard < MAX_STEPS_PER_FRAME && budget > 0; guard++) {
    if (unit.dir) {
      const remaining = (1 - unit.moveT) * TILE_SIZE;
      if (budget < remaining) {
        unit.moveT += budget / TILE_SIZE;
        budget = 0;
        report.moved = true;
        break;
      }
      budget -= remaining;
      arrive(unit);
      report.moved = true;
      report.arrived = true;
      continue;
    }

    // Parked. Conveyors move you whether you asked or not; otherwise take the
    // next step the player is asking for.
    const belt = grid.conveyorAt(unit.fromCol, unit.fromRow);
    let started = false;
    for (const dir of wanted) {
      if (beginStep(unit, grid, dir)) { started = true; break; }
      report.blocked = grid.chargeAt(unit.fromCol + dir.dx, unit.fromRow + dir.dz) || report.blocked;
    }
    if (!started && belt && beginStep(unit, grid, belt)) started = true;
    if (!started) break;
  }

  // Punting a live charge you walked into, once you have the glove.
  if (unit.kick && report.blocked) {
    const dir = wanted[0];
    if (dir) report.kicked = grid.kickCharge(report.blocked, dir.dx, dir.dz);
  }

  syncWorld(unit, grid);
  return report;
}

// Materialize a Charge Crate on the tile under the unit's feet.
export function materializeCharge(unit, grid, time = 0) {
  if (unit.placeCooldown > 0) return null;
  const cell = occupiedCell(unit);
  const charge = grid.placeCharge(unit, cell.col, cell.row, time);
  if (!charge) return null;
  unit.placeCooldown = 0.16;
  unit.bombsPlaced++;
  return charge;
}

export function resetUnitForSpawn(unit, grid, spawnCell, graceSeconds = 2) {
  placeOnCell(unit, grid, spawnCell.col, spawnCell.row);
  unit.hp = unit.maxHp;
  unit.dead = false;
  unit.respawnTimer = 0;
  unit.frozen = 0;
  unit.chargesLive = 0;
  unit.spawnGrace = graceSeconds;
  unit.lastAttacker = null;
  // Power-ups survive death — losing a whole build to one blast is miserable.
  // Only the consumable plates are stripped.
  unit.plates = 0;
  return unit;
}

export const blitzUnitInternals = { desiredDirections, beginStep, syncWorld, MAX_STEPS_PER_FRAME };
