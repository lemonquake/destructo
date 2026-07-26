// ── THE MODE REGISTRY ───────────────────────────────────────────────────────
// Every playable mode Destructo ships, described once, in one place. The
// centralized Game Setup screen builds its navigation rail, its mode banner and
// its launch button entirely out of this file — a new mode becomes reachable by
// adding an entry here and a panel to render it.
//
// `panel` picks which body the setup screen mounts:
//   squad     the infantry Battle Lab (alliance board + match rules + maps)
//   arena     the Destruct-Auto garage (3D chassis preview + the ten vehicles)
//   blitz     the Crate Blitz lattice lobby (seats, crews, board preview)
//   campaign  a read-only briefing that hands off to the mission map
//
// `modeKey` is the id the rest of the engine already knows a mode by, where one
// exists — squad panels write it to game.selectedMode.

export const SETUP_GROUPS = Object.freeze([
  Object.freeze({ id: 'infantry', title: 'INFANTRY WARFARE', note: 'On foot · squads · D-Builder' }),
  Object.freeze({ id: 'vehicle', title: 'VEHICLE COMBAT', note: 'Behind the wheel · Ultimates' }),
  Object.freeze({ id: 'grid', title: 'GRID DEMOLITION', note: 'Tile lattice · last one standing' }),
  Object.freeze({ id: 'solo', title: 'SOLO OPERATIONS', note: 'Story missions · unlocks' }),
]);

const mode = definition => Object.freeze({
  ...definition,
  facts: Object.freeze(definition.facts.map(Object.freeze)),
  features: Object.freeze(definition.features),
});

export const SETUP_MODES = Object.freeze([
  mode({
    id: 'deathmatch', modeKey: 'deathmatch', panel: 'squad', group: 'infantry',
    title: 'DEATHMATCH', kicker: 'LAST TEAM STANDING', icon: '💥',
    accent: '#ff5062', accent2: '#ffd23f', music: '/music/main_theme.mp3',
    lobby: '2–10 TEAMS', launchLabel: 'START BATTLE',
    tagline: 'Dig squads out of supply crates, stack materials into a D-Builder, and flatten every hostile factory before sudden death flattens you.',
    facts: [
      { k: 'WIN BY', v: 'FACTORY WIPE' },
      { k: 'ROSTER', v: 'UP TO 5 ALLIANCES' },
      { k: 'SQUAD', v: '1–5 STARTING UNITS' },
      { k: 'CLOCK', v: 'SUDDEN DEATH' },
    ],
    features: ['D-BUILDER', 'SUPPLY CRATES', 'SECRET VAULTS', 'REINFORCEMENTS', 'OBSERVER BROADCAST', 'ODDS DESK'],
  }),
  mode({
    id: 'domination', modeKey: 'domination', panel: 'squad', group: 'infantry',
    title: 'TOWER DOMINION', kicker: 'CAPTURE · HOLD · SCORE', icon: '🗼',
    accent: '#a06bff', accent2: '#4dffc3', music: '/music/main_theme.mp3',
    lobby: '2–10 CONTENDERS', launchLabel: 'START DOMINION',
    tagline: 'Everyone is hostile. Stand on a pedestal for five seconds to claim the tower, then hold it while every rival on the map comes to take it back.',
    facts: [
      { k: 'WIN BY', v: 'POINT TARGET' },
      { k: 'ROSTER', v: 'FREE FOR ALL' },
      { k: 'SQUAD', v: '4 COMMANDOS · LOCKED' },
      { k: 'RESPAWN', v: 'ENDLESS' },
    ],
    features: ['5–7 TOWERS', 'NO D-BUILDER', 'FIELD DROPS ONLY', 'FAST RESPAWN', 'LIVE SCOREBOARD'],
  }),
  mode({
    id: 'destruct-auto', modeKey: null, panel: 'arena', group: 'vehicle',
    title: 'DESTRUCT-AUTO', kicker: 'TEN CHASSIS · TEN ULTIMATES', icon: '🏁',
    accent: '#ff7a3d', accent2: '#ffd23f', music: '/music/urban_vehicle_warfare.mp3',
    lobby: '2–10 DRIVERS', launchLabel: 'START ENGINES',
    tagline: 'Ten hand-built battle vehicles, no two alike. Draft a chassis before the CPUs do, then hold the trigger on an infinite SMG until the Ultimate is charged.',
    facts: [
      { k: 'WIN BY', v: 'CLOCK OR KILL RACE' },
      { k: 'ROSTER', v: 'UNIQUE DRAFT' },
      { k: 'ARENAS', v: '3 PURPOSE-BUILT' },
      { k: 'LOADOUT', v: 'SMG + ULTIMATE' },
    ],
    features: ['ARCADE PHYSICS', 'NITRO BOOST', 'JUMP RAMPS', 'DESTRUCTIBLE CITY', 'LAVA HAZARDS', 'CREW OR FFA'],
  }),
  mode({
    id: 'crate-blitz', modeKey: null, panel: 'blitz', group: 'grid',
    title: 'CRATE BLITZ', kicker: 'BOMB THE LATTICE', icon: '🧨',
    accent: '#ffd23f', accent2: '#ff5062', music: '/music/neutral_mayhem.mp3',
    lobby: '2–10 DESTRUCTOS', launchLabel: 'LIGHT THE FUSE',
    tagline: 'Grid-locked, blast-radius chaos. Every Destructo is identical — what you dig out of the rubble decides who walks off the board.',
    facts: [
      { k: 'WIN BY', v: 'ELIMINATION' },
      { k: 'ROSTER', v: 'FFA OR CREWS' },
      { k: 'ARENAS', v: '3 LATTICES' },
      { k: 'LIVES', v: '1–5 PER SEAT' },
    ],
    features: ['FRIENDLY FIRE ALWAYS', '3 OBSTACLE MATERIALS', 'HIDDEN POWER-UPS', 'SUDDEN DEATH CRUSH', 'SPECTATOR SEATS'],
  }),
  mode({
    id: 'campaign', modeKey: null, panel: 'campaign', group: 'solo',
    title: 'CAMPAIGN', kicker: 'GAIA OPERATIONS', icon: '🎖️',
    accent: '#54f07b', accent2: '#47e7ff', music: '/music/main_theme.mp3',
    lobby: 'SOLO + AI SQUAD', launchLabel: 'OPEN MISSION MAP',
    tagline: 'Authored operations across the dimensions, each with its own battlefield, quest chain and chip payout. Progress unlocks the next portal.',
    facts: [
      { k: 'WIN BY', v: 'OBJECTIVES' },
      { k: 'ROSTER', v: 'YOU + AI SQUAD' },
      { k: 'MAPS', v: 'AUTHORED' },
      { k: 'REWARD', v: 'CHIPS + UNLOCKS' },
    ],
    features: ['QUEST CHAINS', 'RADIO BRIEFINGS', 'BOSS FACTORIES', 'DIMENSION PORTALS'],
  }),
]);

export const SETUP_MODE_IDS = Object.freeze(SETUP_MODES.map(m => m.id));
export const setupModeById = id => SETUP_MODES.find(m => m.id === id) || SETUP_MODES[0];
export const setupModesInGroup = groupId => SETUP_MODES.filter(m => m.group === groupId);
