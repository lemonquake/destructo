// Scoring, crews and win conditions shared by the standalone arena game modes
// (Destruct-Auto and Crate Blitz). Both modes promise the same things — every
// competitor gets a different loadout, crews cap at five a side, kills score for
// the killer's crew, and a tied clock goes to overtime — so the logic lives once.

export const MIN_COMPETITORS = 2;
export const MAX_COMPETITORS = 10;
export const MAX_TEAM_SIZE = 5;

// Locks the player's pick first, then deals the remainder of the pool. Nobody
// ever ends up with the same loadout as somebody else.
export function draftUnique(pool, playerPick, count, random = Math.random) {
  const wanted = Math.max(1, Math.min(MAX_COMPETITORS, count));
  const rest = pool.filter(id => id !== playerPick);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  const picks = pool.includes(playerPick) ? [playerPick] : [];
  while (picks.length < wanted) {
    const next = rest.shift();
    if (!next) break;
    picks.push(next);
  }
  return picks;
}

// Slot 0 is the player, so alternating assignment seats them on `playerTeam`
// and hands the odd body out to their side.
export function splitTeams(count, playerTeam = 'A') {
  const other = playerTeam === 'A' ? 'B' : 'A';
  return Array.from({ length: Math.min(count, MAX_TEAM_SIZE * 2) }, (_, i) => (i % 2 === 0 ? playerTeam : other));
}

export function createScoreboard(roster, teamMode) {
  const sides = teamMode === 'teams' ? ['A', 'B'] : roster.map(entry => entry.team);
  return {
    teamMode,
    sides,
    score: Object.fromEntries(sides.map(side => [side, 0])),
    drivers: Object.fromEntries(roster.map(entry => [entry.slot, {
      slot: entry.slot, kills: 0, deaths: 0, damage: 0,
      name: entry.name, team: entry.team, loadoutId: entry.autoId || entry.crewId,
    }])),
  };
}

// A kill scores for the killer's side. Suicides, hazards and long falls subtract
// one from the victim's side (floored at zero) so kamikaze play is not free.
export function registerKill(board, killerSlot, victimSlot) {
  const victim = board.drivers[victimSlot];
  if (victim) victim.deaths++;
  if (killerSlot === null || killerSlot === undefined || killerSlot === victimSlot) {
    if (victim) board.score[victim.team] = Math.max(0, board.score[victim.team] - 1);
    return board;
  }
  const killer = board.drivers[killerSlot];
  if (!killer) return board;
  killer.kills++;
  board.score[killer.team] = (board.score[killer.team] || 0) + 1;
  return board;
}

export function leaderOf(board) {
  let best = null, bestScore = -Infinity, tied = false;
  for (const side of board.sides) {
    const score = board.score[side] || 0;
    if (score > bestScore) { bestScore = score; best = side; tied = false; }
    else if (score === bestScore) tied = true;
  }
  return { side: best, score: bestScore, tied };
}

// `rule` is a win-condition record: { kind: 'time', seconds } or { kind: 'score', target }.
export function evaluateRule(board, rule, elapsed) {
  const leader = leaderOf(board);
  if (rule.kind === 'score') {
    if (leader.score >= rule.target && !leader.tied) {
      return { over: true, winner: leader.side, reason: `${rule.title} COMPLETE`, overtime: false, remaining: null };
    }
    return { over: false, winner: null, reason: null, overtime: false, remaining: rule.target - Math.max(0, leader.score) };
  }
  const remaining = Math.max(0, rule.seconds - elapsed);
  if (remaining > 0) return { over: false, winner: null, reason: null, overtime: false, remaining };
  if (leader.tied) return { over: false, winner: null, reason: null, overtime: true, remaining: 0 };
  return { over: true, winner: leader.side, reason: 'TIME EXPIRED', overtime: false, remaining: 0 };
}

// Who gets the point for a kill. `source` is whoever landed the killing blow
// (null for lava, crushing and self-destruction); with none, the last hostile to
// land a hit inside `window` seconds still gets the credit. Team-mates and the
// victim themselves never score. Must be called BEFORE the victim is flagged
// dead — a dead competitor reads as "not hostile" everywhere else.
export function resolveKiller(victim, source, competitors, now, window = 6) {
  let killer = source && source.id !== victim.id ? source : null;
  if (!killer && now - (victim.lastAttackerTime ?? -Infinity) <= window) {
    killer = competitors.find(other => other.id === victim.lastAttacker) || null;
  }
  if (killer && (killer.id === victim.id || killer.team === victim.team)) return null;
  return killer;
}

// Every competitor owns a distinct pad on their side at kickoff (`sequence` 0),
// and each later respawn walks one pad along so a crew never stacks up. Team
// slots alternate A,B,A,B…, so a competitor's seat within its own crew is
// slot >> 1.
export function spawnIndexFor(teamMode, slot, sequence, padCount) {
  const seat = teamMode === 'teams' ? Math.floor(slot / 2) : slot;
  return (seat + sequence) % padCount;
}

export const allLoadoutsUnique = roster => new Set(roster.map(entry => entry.autoId || entry.crewId)).size === roster.length;
