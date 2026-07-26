// Roster construction, scoring and win conditions for the Destruct-Auto arena.
// The parts every arena mode shares live in ../modes/MatchRules.js; this file is
// the Destruct-Auto flavouring on top of them.

import { DESTRUCT_AUTOS, AUTO_IDS, autoById } from '../../data/destructAutos.js';
import { ARENA_TEAMS, FFA_COLORS, winConditionById } from '../../data/arenaMaps.js';
import {
  draftUnique, splitTeams as splitTeamsShared, createScoreboard as createScoreboardShared,
  registerKill as registerKillShared, leaderOf as leaderOfShared, evaluateRule,
  resolveKiller as resolveKillerShared, spawnIndexFor, allLoadoutsUnique,
  MIN_COMPETITORS, MAX_COMPETITORS, MAX_TEAM_SIZE as MAX_TEAM_SIZE_SHARED,
} from '../modes/MatchRules.js';

export const DRIVER_NAMES = Object.freeze([
  'RIVET', 'BOLTS', 'GASKET', 'TORQUE', 'AXLE', 'PISTON', 'CAMSHAFT', 'CLUTCH',
  'MUFFLER', 'SPARKY', 'DIESEL', 'CHASSIS', 'FENDER', 'GRILLE', 'TREAD', 'NITRO',
]);

export const MIN_DRIVERS = MIN_COMPETITORS;
export const MAX_DRIVERS = MAX_COMPETITORS;
export const MAX_TEAM_SIZE = MAX_TEAM_SIZE_SHARED;

// The roster promise: every driver in the match sits in a different chassis.
export const draftVehicles = (playerAutoId, driverCount, random = Math.random) =>
  draftUnique(AUTO_IDS, playerAutoId, driverCount, random);

export const splitTeams = (driverCount, playerTeam = 'A') => splitTeamsShared(driverCount, playerTeam);

export function buildRoster({ teamMode = 'teams', driverCount = 6, playerAutoId = null, playerTeam = 'A', playerName = 'YOU', random = Math.random }) {
  const count = Math.max(MIN_DRIVERS, Math.min(MAX_DRIVERS, driverCount));
  const picks = draftVehicles(playerAutoId, count, random);
  const teams = teamMode === 'teams' ? splitTeams(picks.length, playerTeam) : null;
  const names = [...DRIVER_NAMES];
  for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [names[i], names[j]] = [names[j], names[i]]; }
  return picks.map((autoId, index) => {
    const isPlayer = index === 0 && Boolean(playerAutoId);
    const team = teamMode === 'teams' ? teams[index] : `ffa-${index}`;
    return {
      slot: index,
      autoId,
      autoDef: autoById(autoId),
      isPlayer,
      team,
      teamColor: teamMode === 'teams' ? ARENA_TEAMS[team].color : FFA_COLORS[index % FFA_COLORS.length],
      teamName: teamMode === 'teams' ? ARENA_TEAMS[team].name : 'INDEPENDENT',
      name: isPlayer ? playerName : `CPU ${names[index % names.length]}`,
    };
  });
}

export const createScoreboard = (roster, teamMode) => createScoreboardShared(roster, teamMode);
export const registerKill = (board, killerSlot, victimSlot) => registerKillShared(board, killerSlot, victimSlot);
export const leaderOf = board => leaderOfShared(board);
export const resolveKiller = (victim, source, vehicles, now, window = 6) => resolveKillerShared(victim, source, vehicles, now, window);
export const evaluateMatch = (board, winConditionId, elapsed) => evaluateRule(board, winConditionById(winConditionId), elapsed);

export function respawnPointFor(mapDef, teamMode, side, slot, sequence = 0) {
  const list = teamMode === 'teams' ? mapDef.spawns[side] || mapDef.spawns.A : mapDef.spawns.ffa;
  if (!list?.length) return { x: 0, y: 10, z: 0, yaw: 0 };
  return list[spawnIndexFor(teamMode, slot, sequence, list.length)];
}

export const rosterSummary = roster => roster.map(d => `${d.name} · ${d.autoDef.name}`).join(' | ');
export const allAutosUnique = roster => allLoadoutsUnique(roster);
export const autoRoster = () => DESTRUCT_AUTOS;
