export const MAPS = Object.freeze({
  crossroads: Object.freeze({
    id: 'crossroads', title: 'BUMPER-TO-BUMPER BEDLAM', tag: 'URBAN VEHICLE WARFARE',
    description: 'A twelve-district megacity on a real street grid: asphalt boulevards, kerbed pavements, walkable rooftops linked by skybridges, a two-level viaduct interchange, a stadium, a container port and a parking deck you can drive to the roof of.',
    accent: '#ff4fd8', icon: '🏙️', texture: 'asphalt', weather: 'NEON DUSK',
    maxTeams: 12, sizeClass: 'MEGACITY', bounds: 320, baseRadius: 272, surfaceScale: 1,
  }),
  crown: Object.freeze({
    id: 'crown', title: 'CRATE EXPECTATIONS', tag: 'CANDYLAND KING OF THE HILL',
    description: 'A four-tier layer-cake mountain at the heart of a living candyland. Spiral candy roads and rainbow bridges climb to a relentless summit crate drop, past a chocolate river, a fizzing soda lake, a gingerbread village, cotton-candy woods and a quarry of giant gumballs that roll when you shoot them.',
    accent: '#ff6bc5', icon: '🍭', texture: 'gumdrop', weather: 'SUGAR RUSH',
    maxTeams: 5, sizeClass: 'CONFECTION', bounds: 234, baseRadius: 194, surfaceScale: 1,
  }),
  wilds: Object.freeze({
    id: 'wilds', title: 'THE VERY HUNGRY WILDERNESS', tag: 'NEUTRAL MAYHEM',
    description: 'A living rainforest for nine armies: a cliff mesa split by a 26-metre waterfall, a serpent river running to a jaguar lagoon, canopy walkways strung between kapok giants, bamboo terraces, a drowned mire and four lost temples around a ziggurat that eats the unwary.',
    accent: '#71f06f', icon: '🌴', texture: 'jungle_floor', weather: 'MONSOON GLOW',
    maxTeams: 9, sizeClass: 'EPIC', bounds: 234, baseRadius: 194, surfaceScale: 1,
  }),
  rift: Object.freeze({
    id: 'rift', title: 'FLOOR IS LAVA, PROBABLY', tag: 'VOLCANIC SCRAPYARD',
    description: 'Invade a continent-scale foundry of lava causeways, furnace towers and industrial halls. Coolant tunnels and obsidian vaults reward dangerous detours.',
    accent: '#ff6a2b', icon: '🌋', texture: 'volcanic_rock', weather: 'ASHFALL',
    maxTeams: 9, sizeClass: 'EPIC', bounds: 234, baseRadius: 194, surfaceScale: 3,
  }),
});

// Hidden chambers sit away from team compounds and major supply routes. Keeping
// their authored positions here makes their themes, rewards and map coverage
// testable without exposing them on the minimap.
export const DEATHMATCH_SECRET_PLANS = Object.freeze({
  crossroads: Object.freeze([
    Object.freeze({ name: 'SUBWAY SIGNAL VAULT', x: -56, z: 208, wall: 'urban_brick', cache: 'neon_concrete', reward: 'blue' }),
    Object.freeze({ name: 'ROOFTOP SMUGGLER YARD', x: 56, z: -208, wall: 'corrugated_steel', cache: 'city_glass', reward: 'yellow' }),
    Object.freeze({ name: 'FLOODED UNDERPASS CACHE', x: -208, z: -56, wall: 'concrete', cache: 'vehicle_metal', reward: 'red' }),
  ]),
  // Sited in the gaps between candyland's authored districts (see CANDY in
  // src/data/mapSurfaces.js): north of Flosswood, west of the Peppermint Mesa,
  // and on the dry shelf east of the cocoa run.
  crown: Object.freeze([
    Object.freeze({ name: 'THE FONDANT CRYPT', x: -52, z: 160, wall: 'gingerbread', cache: 'gumdrop', reward: 'blue' }),
    Object.freeze({ name: 'SUGARGLASS HERMITAGE', x: -172, z: -72, wall: 'peppermint', cache: 'wafer', reward: 'yellow' }),
    Object.freeze({ name: 'THE BURIED BONBON HOARD', x: 150, z: -24, wall: 'chocolate', cache: 'caramel', reward: 'red' }),
  ]),
  // Sited clear of the authored rainforest landforms in src/data/mapSurfaces.js:
  // west of the mesa skirt, east of the bamboo terraces, and south of the mire.
  wilds: Object.freeze([
    Object.freeze({ name: 'JAGUAR IDOL HOLLOW', x: -146, z: 26, wall: 'moss_stone', cache: 'sandstone', reward: 'blue' }),
    Object.freeze({ name: 'ROOTBOUND MOON WELL', x: 140, z: 44, wall: 'tree_bark', cache: 'crystal', reward: 'red' }),
    Object.freeze({ name: 'LOST EXPEDITION CAMP', x: 10, z: -152, wall: 'wood', cache: 'corrugated_steel', reward: 'yellow' }),
  ]),
  rift: Object.freeze([
    Object.freeze({ name: 'COOLANT TUNNEL 09', x: -138, z: 76, wall: 'vehicle_metal', cache: 'crystal', reward: 'blue' }),
    Object.freeze({ name: 'OBSIDIAN FORGE VAULT', x: 134, z: 82, wall: 'volcanic_rock', cache: 'corrugated_steel', reward: 'red' }),
    Object.freeze({ name: 'ASHEN FOREMAN BUNKER', x: 16, z: -148, wall: 'concrete', cache: 'lava_crust', reward: 'yellow' }),
  ]),
});

export const DOMINATION_MAPS = Object.freeze({
  sunken: Object.freeze({
    id: 'sunken', mode: 'domination', title: 'THE SUNKEN CROWN', tag: 'FLOODED TEMPLE CITY',
    description: 'Five towers crown a drowned jungle capital: a stepped sun temple, twin vine bridges, flooded courts, and ambush paths beneath colossal roots.',
    accent: '#4dffc3', icon: '☀️', texture: 'moss_stone', weather: 'GOLDEN MONSOON', towerCount: 5, maxTeams: 10,
  }),
  serpent: Object.freeze({
    id: 'serpent', mode: 'domination', title: 'SPINE OF THE SERPENT', tag: 'RIDGELINE WAR',
    description: 'Seven towers snake across a mountainous idol ridge, with cliff temples, rope-bridge lanes, hidden jungle gullies, and a giant stone serpent arena.',
    accent: '#d7ff43', icon: '🐍', texture: 'jungle_floor', weather: 'THUNDER CANOPY', towerCount: 7, maxTeams: 10,
  }),
  eclipse: Object.freeze({
    id: 'eclipse', mode: 'domination', title: 'ECLIPSE OF TITANS', tag: 'COLOSSAL LOST SANCTUM',
    description: 'Five monumental capture shrines surround an eclipse altar, ringed by titan statues, terraced temple walls, waterfalls, caves, and high jungle causeways.',
    accent: '#bd7bff', icon: '🌘', texture: 'root_mud', weather: 'VIOLET ECLIPSE', towerCount: 5, maxTeams: 10,
  }),
});

// Authored campaign battlefields stay out of GAME_MODES so they never appear
// in Custom Match map selection.
export const CAMPAIGN_MAPS = Object.freeze({
  bootcamp: Object.freeze({
    id: 'bootcamp', mode: 'campaign', title: 'SCRAPYARD ZERO', tag: 'ASSEMBLY TRAINING GROUND',
    description: 'A compact junkyard proving ground built around one D-Builder and a very unlucky enemy outpost.',
    accent: '#54f07b', icon: '⚙️', texture: 'corrugated_steel', weather: 'CLEAR WITH EXPLOSIONS',
    maxTeams: 2, sizeClass: 'SMALL', bounds: 68, baseRadius: 49, surfaceScale: 2,
  }),
  goldrush: Object.freeze({
    id: 'goldrush', mode: 'campaign', title: 'GILDED GULCH', tag: 'FORTRESS EXTRACTION',
    description: 'A medium canyon scrapyard with a fortified northern depot and enough cover for a very loud heist.',
    accent: '#ffd23f', icon: '✦', texture: 'summit_stone', weather: 'GOLD DUST',
    maxTeams: 2, sizeClass: 'MEDIUM', bounds: 112, baseRadius: 84, surfaceScale: 2.4,
  }),
  'gaia-bastion': Object.freeze({
    id: 'gaia-bastion', mode: 'campaign', title: 'FORT AEGIS', tag: 'GOLDEN CRATE SIEGE',
    description: 'A fortified river valley with a military base, destructible barracks, dirt fields, bear territory, bridge crossings, hidden red caches and an enemy DestroJet runway.',
    accent: '#ffd23f', icon: '✈', texture: 'grass', weather: 'WARFRONT SUNSET', maxTeams: 2, sizeClass: 'LARGE', bounds: 138, baseRadius: 108, surfaceScale: 1, hasWater: true,
  }),
  'storm-dam': Object.freeze({
    id: 'storm-dam', mode: 'campaign', title: 'TEMPEST DAM', tag: 'HYDROELECTRIC SABOTAGE',
    description: 'A rain-dark dam complex of spillways, turbine halls, flooded service roads, high catwalks and three lightning-fed relay terraces.',
    accent: '#65e9ff', icon: '⚡', texture: 'concrete', weather: 'ELECTRIC MONSOON', maxTeams: 2, sizeClass: 'LARGE', bounds: 132, baseRadius: 104, surfaceScale: 1, hasWater: true,
  }),
  sunforge: Object.freeze({
    id: 'sunforge', mode: 'campaign', title: 'THE SUNFORGE', tag: 'VOLCANIC FOUNDRY ASSAULT',
    description: 'A vast caldera factory surrounded by lava trenches, coolant canals, armored blast walls, furnace towers and smuggler tunnels.',
    accent: '#ff6a2b', icon: '✹', texture: 'volcanic_rock', weather: 'REACTOR ASHFALL', maxTeams: 2, sizeClass: 'LARGE', bounds: 140, baseRadius: 110, surfaceScale: 1,
  }),
  'gaia-blacksite': Object.freeze({
    id: 'gaia-blacksite', mode: 'campaign', title: 'ATLAS BLACKSITE', tag: 'SUBTERRANEAN ESCORT',
    description: 'A colossal buried military complex of armored halls, cargo vaults, laboratories, choke points and interlocking service corridors.',
    accent: '#47e7ff', icon: '⌬', texture: 'gaia_blacksite_armor', weather: 'SUBTERRANEAN LOCKDOWN', maxTeams: 2, sizeClass: 'HUGE', bounds: 176, baseRadius: 146, surfaceScale: 1,
  }),
});

export const GAME_MODES = Object.freeze({
  deathmatch: Object.freeze({ id: 'deathmatch', title: 'DEATHMATCH', kicker: 'LAST TEAM STANDING', description: 'Destroy bases, wipe squads, and survive sudden death.', mapIds: Object.keys(MAPS) }),
  domination: Object.freeze({ id: 'domination', title: 'TOWER DOMINION', kicker: 'FREE FOR ALL · CAPTURE · SCORE', description: 'Every team is hostile. Stand on a tower pedestal for 5 seconds to claim it; every held tower generates points.', mapIds: Object.keys(DOMINATION_MAPS) }),
});

export const ALL_MAPS = Object.freeze({ ...MAPS, ...DOMINATION_MAPS, ...CAMPAIGN_MAPS });
export const mapsForMode = modeId => (GAME_MODES[modeId] || GAME_MODES.deathmatch).mapIds.map(id => ALL_MAPS[id]);

export const DEFAULT_MAP_ID = 'crossroads';
export const mapById = id => ALL_MAPS[id] || MAPS[DEFAULT_MAP_ID];
