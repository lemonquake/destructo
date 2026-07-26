// ── CRATE BLITZ: THE DESTRUCTO ──────────────────────────────────────────────
// One character, exactly as in the base game. Crate Blitz is not a mode about
// picking a kit — everybody starts identical and the match is decided by what
// you dig out of the obstacles. What differs between players is only the colour
// they wear and the crew they are on.

export const DESTRUCTO = Object.freeze({
  id: 'destructo',
  name: 'DESTRUCTO',
  blurb: 'Crate head, short fuse, no plan. Exactly the way you remember them.',
  stats: Object.freeze({
    speed: 12,      // world units per second between tile centres
    charges: 1,     // live Charge Crates allowed at once (power-ups raise it)
    power: 2,       // blast reach in tiles down each lane
    fuse: 2.4,      // seconds from materialize to detonation
    maxHp: 100,
  }),
  charge: Object.freeze({
    id: 'charge-crate',
    name: 'CHARGE CRATE',
    // A single classic four-lane blast, stopped by the first obstacle it
    // cracks. There is no shape variation any more — one charge, one rule,
    // readable by everybody at the table.
    damage: 200,    // a direct blast is always lethal; armour does not exist here
    color: 0xffb02e,
    description: 'Four lanes of blast, stopped by the first thing it breaks.',
  }),
});

// The ten paint jobs a player (or a CPU) can wear. Deliberately far apart in
// hue so ten Destructos in one lattice never get confused at a glance.
export const PLAYER_COLORS = Object.freeze([
  Object.freeze({ id: 'cyan', name: 'VOLT CYAN', color: 0x2fb4ff, css: '#2fb4ff' }),
  Object.freeze({ id: 'red', name: 'SIREN RED', color: 0xff4d3d, css: '#ff4d3d' }),
  Object.freeze({ id: 'lime', name: 'ACID LIME', color: 0x71f06f, css: '#71f06f' }),
  Object.freeze({ id: 'gold', name: 'FUSE GOLD', color: 0xffd23f, css: '#ffd23f' }),
  Object.freeze({ id: 'pink', name: 'BLAST PINK', color: 0xff4fd8, css: '#ff4fd8' }),
  Object.freeze({ id: 'violet', name: 'RIOT VIOLET', color: 0xa96bff, css: '#a96bff' }),
  Object.freeze({ id: 'ice', name: 'ICE BLUE', color: 0x64f0ff, css: '#64f0ff' }),
  Object.freeze({ id: 'orange', name: 'EMBER ORANGE', color: 0xff8b3d, css: '#ff8b3d' }),
  Object.freeze({ id: 'mint', name: 'SPRING MINT', color: 0x6affc0, css: '#6affc0' }),
  Object.freeze({ id: 'bone', name: 'BONE WHITE', color: 0xf2f4f8, css: '#f2f4f8' }),
]);

export const PLAYER_COLOR_IDS = Object.freeze(PLAYER_COLORS.map(entry => entry.id));
export const playerColorById = id => PLAYER_COLORS.find(entry => entry.id === id) || PLAYER_COLORS[0];
export const playerColorAt = index => PLAYER_COLORS[((index % PLAYER_COLORS.length) + PLAYER_COLORS.length) % PLAYER_COLORS.length];

// Coop crews. A match is either a free-for-all (every colour for itself) or
// anything from two to four crews with players shared out between them.
export const BLITZ_CREWS = Object.freeze([
  Object.freeze({ id: 'A', name: 'CRACKERS', color: 0x2fb4ff, css: '#2fb4ff' }),
  Object.freeze({ id: 'B', name: 'SPLINTERS', color: 0xff4d3d, css: '#ff4d3d' }),
  Object.freeze({ id: 'C', name: 'SCORCHERS', color: 0x71f06f, css: '#71f06f' }),
  Object.freeze({ id: 'D', name: 'RUBBLERS', color: 0xffd23f, css: '#ffd23f' }),
]);
export const crewById = id => BLITZ_CREWS.find(crew => crew.id === id) || BLITZ_CREWS[0];

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;
export const MIN_CREWS = 2;
export const MAX_CREWS = 4;

// CPU display names, drawn in order so a roster reads consistently.
export const CPU_NAMES = Object.freeze([
  'FUSE', 'PLUNGER', 'SHRAPNEL', 'TIMER', 'PRIMER', 'WICK', 'FLASHPOINT',
  'RUBBLE', 'CINDER', 'SCORCH', 'CRATER', 'TREMOR', 'BLASTY', 'SPARK',
]);
