export const MAPS = Object.freeze({
  crossroads: Object.freeze({
    id: 'crossroads', title: 'BUMPER-TO-BUMPER BEDLAM', tag: 'URBAN VEHICLE WARFARE',
    description: 'Raid a neon downtown packed with blocks, alleys and crossroads. Hot-wire four-seat cars, form a convoy, or let a motorcycle thread the traffic.',
    accent: '#ff4fd8', icon: '🏙️', texture: 'asphalt', weather: 'NEON DUSK',
  }),
  crown: Object.freeze({
    id: 'crown', title: 'CRATE EXPECTATIONS', tag: 'KING OF THE HILL',
    description: 'One drop zone. One absurdly tall hill. Three crates hammer the summit every 1–5 seconds, so climbing is easy and staying is wonderfully impossible.',
    accent: '#ffd23f', icon: '⛰️', texture: 'summit_stone', weather: 'HIGH WIND',
  }),
  wilds: Object.freeze({
    id: 'wilds', title: 'THE VERY HUNGRY WILDERNESS', tag: 'NEUTRAL MAYHEM',
    description: 'A living jungle thick with trees, ruins, wolves, sheep and crate-gobbling slimes. The battlefield has teeth—and it does not pick teams.',
    accent: '#71f06f', icon: '🌴', texture: 'jungle_floor', weather: 'MONSOON GLOW',
  }),
  rift: Object.freeze({
    id: 'rift', title: 'FLOOR IS LAVA, PROBABLY', tag: 'VOLCANIC SCRAPYARD',
    description: 'Fight across black-rock causeways and a shattered foundry. Risk the glowing rift for rare supplies, or use the high rim to rain trouble below.',
    accent: '#ff6a2b', icon: '🌋', texture: 'volcanic_rock', weather: 'ASHFALL',
  }),
});

export const DOMINATION_MAPS = Object.freeze({
  sunken: Object.freeze({
    id: 'sunken', mode: 'domination', title: 'THE SUNKEN CROWN', tag: 'FLOODED TEMPLE CITY',
    description: 'Five towers crown a drowned jungle capital: a stepped sun temple, twin vine bridges, flooded courts, and ambush paths beneath colossal roots.',
    accent: '#4dffc3', icon: '☀️', texture: 'moss_stone', weather: 'GOLDEN MONSOON', towerCount: 5,
  }),
  serpent: Object.freeze({
    id: 'serpent', mode: 'domination', title: 'SPINE OF THE SERPENT', tag: 'RIDGELINE WAR',
    description: 'Seven towers snake across a mountainous idol ridge, with cliff temples, rope-bridge lanes, hidden jungle gullies, and a giant stone serpent arena.',
    accent: '#d7ff43', icon: '🐍', texture: 'jungle_floor', weather: 'THUNDER CANOPY', towerCount: 7,
  }),
  eclipse: Object.freeze({
    id: 'eclipse', mode: 'domination', title: 'ECLIPSE OF TITANS', tag: 'COLOSSAL LOST SANCTUM',
    description: 'Five monumental capture shrines surround an eclipse altar, ringed by titan statues, terraced temple walls, waterfalls, caves, and high jungle causeways.',
    accent: '#bd7bff', icon: '🌘', texture: 'root_mud', weather: 'VIOLET ECLIPSE', towerCount: 5,
  }),
});

export const GAME_MODES = Object.freeze({
  deathmatch: Object.freeze({ id: 'deathmatch', title: 'DEATHMATCH', kicker: 'LAST TEAM STANDING', description: 'Destroy bases, wipe squads, and survive sudden death.', mapIds: Object.keys(MAPS) }),
  domination: Object.freeze({ id: 'domination', title: 'TOWER DOMINATION', kicker: 'CAPTURE · HOLD · SCORE', description: 'Stand on a tower pedestal for 5 seconds to claim it. Every held tower generates points.', mapIds: Object.keys(DOMINATION_MAPS) }),
});

export const ALL_MAPS = Object.freeze({ ...MAPS, ...DOMINATION_MAPS });
export const mapsForMode = modeId => (GAME_MODES[modeId] || GAME_MODES.deathmatch).mapIds.map(id => ALL_MAPS[id]);

export const DEFAULT_MAP_ID = 'crossroads';
export const mapById = id => ALL_MAPS[id] || MAPS[DEFAULT_MAP_ID];
