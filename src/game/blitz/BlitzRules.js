// Roster construction, scoring and the win condition for Crate Blitz.
//
// The mode is elimination, not a frag race: everybody gets N lives, and the
// match ends when only one side can still field a body. "Side" is a player in
// free-for-all and a crew in co-op, which is the only difference between the
// two modes as far as this file is concerned.

import {
  DESTRUCTO, PLAYER_COLORS, playerColorAt, playerColorById, crewById,
  CPU_NAMES, MIN_PLAYERS, MAX_PLAYERS, MIN_CREWS, MAX_CREWS,
} from '../../data/blitzDestructo.js';

export { MIN_PLAYERS, MAX_PLAYERS, MIN_CREWS, MAX_CREWS };

// Default seat list for a fresh setup screen: the player first, then CPUs, each
// on the next unused colour and alternating crews.
export function defaultSeats(count = 4, crewCount = 2) {
  return Array.from({ length: count }, (_, index) => ({
    slot: index,
    isPlayer: index === 0,
    name: index === 0 ? 'YOU' : `CPU ${CPU_NAMES[(index - 1) % CPU_NAMES.length]}`,
    colorId: playerColorAt(index).id,
    crewId: String.fromCharCode(65 + (index % Math.max(MIN_CREWS, Math.min(MAX_CREWS, crewCount)))),
  }));
}

// Grows or shrinks a seat list to `count`, keeping every existing choice and
// giving new seats the first colour nobody has taken.
export function resizeSeats(seats, count, crewCount = 2) {
  const wanted = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, count));
  const next = seats.slice(0, wanted).map(seat => ({ ...seat }));
  while (next.length < wanted) {
    const index = next.length;
    const used = new Set(next.map(seat => seat.colorId));
    const free = PLAYER_COLORS.find(entry => !used.has(entry.id)) || playerColorAt(index);
    next.push({
      slot: index,
      isPlayer: false,
      name: `CPU ${CPU_NAMES[(index - 1 + CPU_NAMES.length) % CPU_NAMES.length]}`,
      colorId: free.id,
      crewId: String.fromCharCode(65 + (index % Math.max(MIN_CREWS, Math.min(MAX_CREWS, crewCount)))),
    });
  }
  return next.map((seat, index) => ({ ...seat, slot: index, isPlayer: index === 0 }));
}

// Every seat must wear a different colour: ten Destructos in one lattice are
// only tellable apart by paint, so a duplicate is a bug, not a preference.
export function enforceUniqueColors(seats) {
  const used = new Set();
  return seats.map((seat, index) => {
    let id = seat.colorId;
    if (!id || used.has(id)) {
      const free = PLAYER_COLORS.find(entry => !used.has(entry.id));
      id = free ? free.id : playerColorAt(index).id;
    }
    used.add(id);
    return { ...seat, colorId: id };
  });
}

// Pushes crew ids into range and makes sure no crew is left empty — an empty
// crew would win the moment the match started.
//
// Free-for-all leaves the crew choices ALONE rather than erasing them: the
// setup screen re-normalises on every repaint, and a mode that clears the
// column would silently destroy the player's team layout the moment they
// glanced at free-for-all. Sides for FFA are derived in buildBlitzRoster.
export function normalizeCrews(seats, teamMode, crewCount = 2) {
  if (teamMode !== 'coop') return seats.map(seat => ({ ...seat }));
  const wanted = Math.max(MIN_CREWS, Math.min(MAX_CREWS, Math.min(crewCount, seats.length)));
  const ids = Array.from({ length: wanted }, (_, i) => String.fromCharCode(65 + i));
  // A seat with no valid crew (new seat, or a crew that was just dialled away)
  // falls back to an even round-robin rather than piling into the first crew.
  const next = seats.map((seat, index) => ({
    ...seat,
    crewId: ids.includes(seat.crewId) ? seat.crewId : ids[index % wanted],
  }));
  for (let i = 0; i < ids.length; i++) {
    if (next.some(seat => seat.crewId === ids[i])) continue;
    // Take from whichever crew currently has the most bodies.
    const counts = new Map(ids.map(id => [id, next.filter(seat => seat.crewId === id).length]));
    const donor = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const victim = next.find(seat => seat.crewId === donor);
    if (victim) victim.crewId = ids[i];
  }
  return next;
}

export function buildBlitzRoster({ seats, teamMode = 'ffa', crewCount = 2, lives = 3 }) {
  const shaped = normalizeCrews(enforceUniqueColors(seats), teamMode, crewCount);
  return shaped.map((seat, index) => {
    const paint = playerColorById(seat.colorId);
    const team = teamMode === 'coop' ? seat.crewId : `solo-${index}`;
    return {
      slot: index,
      isPlayer: Boolean(seat.isPlayer),
      name: seat.name || (seat.isPlayer ? 'YOU' : `CPU ${CPU_NAMES[index % CPU_NAMES.length]}`),
      colorId: paint.id,
      color: paint.color,
      colorCss: paint.css,
      colorName: paint.name,
      team,
      teamName: teamMode === 'coop' ? crewById(seat.crewId).name : paint.name,
      teamCss: teamMode === 'coop' ? crewById(seat.crewId).css : paint.css,
      lives,
      character: DESTRUCTO.name,
    };
  });
}

export function createScoreboard(roster, teamMode) {
  const sides = [...new Set(roster.map(entry => entry.team))];
  return {
    teamMode,
    sides,
    players: Object.fromEntries(roster.map(entry => [entry.slot, {
      slot: entry.slot, name: entry.name, team: entry.team,
      kills: 0, deaths: 0, suicides: 0, bombsPlaced: 0,
      obstaclesDestroyed: 0, powerupsTaken: 0, damageDealt: 0,
      survivedFor: 0, placement: null,
    }])),
  };
}

// A kill is credited to the killer. Blowing yourself up, walking into lava or
// being crushed counts as a suicide — it still costs a life, it just does not
// hand anybody a point.
export function registerKill(board, killerSlot, victimSlot) {
  const victim = board.players[victimSlot];
  if (victim) victim.deaths++;
  if (killerSlot === null || killerSlot === undefined || killerSlot === victimSlot) {
    if (victim) victim.suicides++;
    return board;
  }
  const killer = board.players[killerSlot];
  if (killer) killer.kills++;
  return board;
}

// Who gets the point. `source` is whoever placed the charge (null for lava and
// crushing); with none, the last person to hurt the victim inside `window`
// seconds still gets the credit. Blowing up a crew-mate is a real kill in this
// mode — the blast does not care whose side you are on — but it is credited as
// a team kill so the debrief can call it out.
export function resolveKiller(victim, source, units, now, window = 6) {
  let killer = source && source.id !== victim.id ? source : null;
  if (!killer && source && source.id === victim.id) return null;
  if (!killer && now - (victim.lastAttackerTime ?? -Infinity) <= window) {
    killer = units.find(other => other.id === victim.lastAttacker) || null;
  }
  if (killer && killer.id === victim.id) return null;
  return killer || null;
}

// Living sides: a side is alive while any of its members has a life left.
export function livingSides(units) {
  const sides = new Map();
  for (const unit of units) {
    if (unit.eliminated) continue;
    sides.set(unit.team, (sides.get(unit.team) || 0) + 1);
  }
  return [...sides.keys()];
}

// The match is over when one side (or nobody) is left standing.
export function evaluateMatch(units) {
  const alive = livingSides(units);
  if (alive.length > 1) return { over: false, winner: null, reason: null, draw: false };
  if (alive.length === 1) return { over: true, winner: alive[0], reason: 'LAST ONE STANDING', draw: false };
  return { over: true, winner: null, reason: 'MUTUAL DESTRUCTION', draw: true };
}

// Spawn pads. Every player owns a distinct pad at kickoff; each later respawn
// walks one pad along so nobody ever reassembles on top of a rival.
export function spawnCellFor(arenaDef, slot, sequence = 0) {
  const pads = arenaDef.spawns;
  if (!pads?.length) return { col: 0, row: 0 };
  return pads[(slot + sequence) % pads.length];
}

export const allColorsUnique = roster => new Set(roster.map(entry => entry.colorId)).size === roster.length;
