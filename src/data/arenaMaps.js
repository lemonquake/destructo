// ── DESTRUCT-AUTO ARENAS ────────────────────────────────────────────────────
// Three purpose-built battle arenas. No crates, no D-Builder, no infantry: just
// ramps, decks, gaps and hazards for ten armed vehicles to fight over.
//
// Geometry vocabulary (all coordinates are world units, +Y is up):
//   box    { x, z, base, w, d, h }        solid block; its top face is drivable
//   ramp   { x, z, w, d, base, rise, dir } wedge climbing toward `dir` degrees
//   jump   ramp with `launch` — adds vertical impulse when you leave the lip
//   wall   box flagged `climbable:false`; blocks but is never a driving surface
//   pillar { x, z, r, base, h }           cylinder obstacle
//   hazard { x, z, r, dps }               ground damage zone (lava, coolant…)
//
// `dir` is the compass heading the ramp rises toward: 0 = +Z, 90 = +X,
// 180 = -Z, 270 = -X.

const box = (x, z, base, w, d, h, mat = 'steel', extra = {}) => ({ t: 'box', x, z, base, w, d, h, mat, ...extra });
const wall = (x, z, base, w, d, h, mat = 'steel') => ({ t: 'wall', x, z, base, w, d, h, mat, climbable: false });
const ramp = (x, z, base, w, d, rise, dir, mat = 'steel', extra = {}) => ({ t: 'ramp', x, z, base, w, d, rise, dir, mat, ...extra });
const jump = (x, z, base, w, d, rise, dir, launch = 15, mat = 'hazardstripe') => ramp(x, z, base, w, d, rise, dir, mat, { launch });
const pillar = (x, z, base, r, h, mat = 'concrete') => ({ t: 'pillar', x, z, base, r, h, mat });
const hazard = (x, z, r, dps, color = 0xff5a1f) => ({ t: 'hazard', x, z, r, dps, color });
const decal = (x, z, w, d, color = 0xf4d35e, y = 0.045) => ({ t: 'decal', x, z, w, d, color, y });
const building = (x, z, w, d, h, mat = 'city', hp = 180) => {
  const facade = mat === 'concrete' ? 'cityConcrete' : mat === 'neon' ? 'cityNeon' : mat;
  return box(x, z, 0.35, w, d, h, facade, { climbable: false, destructible: true, building: true, hp });
};

// Perimeter wall ring for a square arena of half-extent `bounds`.
const arenaWalls = (bounds, mat = 'steel', h = 26) => {
  const t = 6, span = bounds * 2 + t * 2;
  return [
    wall(0, bounds + t / 2, 0, span, t, h, mat),
    wall(0, -bounds - t / 2, 0, span, t, h, mat),
    wall(bounds + t / 2, 0, 0, t, span, h, mat),
    wall(-bounds - t / 2, 0, 0, t, span, h, mat),
  ];
};

// Four ramps climbing onto a square deck from each cardinal side.
const deckRamps = (cx, cz, half, deckTop, length, width, mat) => [
  ramp(cx, cz - half - length / 2, 0, width, length, deckTop, 0, mat),
  ramp(cx, cz + half + length / 2, 0, width, length, deckTop, 180, mat),
  ramp(cx - half - length / 2, cz, 0, length, width, deckTop, 90, mat),
  ramp(cx + half + length / 2, cz, 0, length, width, deckTop, 270, mat),
];

// ── 1 · CRATEWORKS COLISEUM ────────────────────────────────────────────────
function crateworksPieces() {
  const B = 132;
  const pieces = [...arenaWalls(B, 'concrete', 24)];

  // Four long two-lane roads form an immediately readable downtown grid.
  for (const lane of [-39, 39]) {
    pieces.push(decal(lane - 4.5, 0, 0.34, 252, 0xffffff));
    pieces.push(decal(lane + 4.5, 0, 0.34, 252, 0xffffff));
    pieces.push(decal(lane, 0, 0.46, 252, 0xf4d35e));
    pieces.push(decal(0, lane - 4.5, 252, 0.34, 0xffffff));
    pieces.push(decal(0, lane + 4.5, 252, 0.34, 0xffffff));
    pieces.push(decal(0, lane, 252, 0.46, 0xf4d35e));
  }

  // Corner city blocks: raised pavements, alleys, and individually destructible
  // buildings. Destroying a tower opens a new shortcut through the block.
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const cx = sx * 78, cz = sz * 78;
    pieces.push(box(cx, cz, 0, 52, 52, 0.35, 'concrete'));
    pieces.push(building(cx - 13, cz - 12, 20, 22, 18 + (sx === sz ? 8 : 0), 'city', 170));
    pieces.push(building(cx + 13, cz - 13, 18, 20, 14 + (sz > 0 ? 7 : 0), 'concrete', 145));
    pieces.push(building(cx - 12, cz + 14, 22, 16, 22 + (sx > 0 ? 6 : 0), 'city', 190));
    pieces.push(building(cx + 14, cz + 13, 16, 18, 16 + (sx !== sz ? 9 : 0), 'neon', 155));
  }

  // North and south blocks add more street canyons without sealing the roads.
  for (const sz of [-1, 1]) {
    const cz = sz * 78;
    pieces.push(box(0, cz, 0, 52, 52, 0.35, 'concrete'));
    pieces.push(building(-14, cz, 20, 36, 20, 'city', 185));
    pieces.push(building(14, cz - sz * 9, 18, 18, 29, 'neon', 220));
    pieces.push(building(14, cz + sz * 13, 18, 14, 15, 'concrete', 140));
  }

  // A raised civic plaza anchors the road network and gives every approach a
  // proper climb. The ramps leave the four intersections themselves clear.
  pieces.push(box(0, 0, 0, 42, 42, 12, 'plate'));
  pieces.push(...deckRamps(0, 0, 21, 12, 18, 13, 'asphalt'));
  pieces.push(wall(0, 0, 12, 12, 12, 8, 'neon'));

  // East/west parking decks create a second elevation tier and alternate
  // routes around the civic plaza.
  for (const sx of [-1, 1]) {
    const x = sx * 78;
    pieces.push(box(x, 0, 0, 44, 42, 11, 'asphalt'));
    pieces.push(ramp(x, -31, 0, 14, 20, 11, 0, 'asphalt'));
    pieces.push(ramp(x, 31, 0, 14, 20, 11, 180, 'asphalt'));
    pieces.push(wall(x - 18, 0, 0, 3, 40, 8, 'concrete'));
    pieces.push(wall(x + 18, 0, 0, 3, 40, 8, 'concrete'));
  }

  // Four launch ramps turn the long outer avenues into jump lines over traffic
  // islands, while smaller ramps make rooftop-to-plaza transfers possible.
  pieces.push(jump(-39, -106, 0, 13, 18, 6, 0, 13, 'hazardstripe'));
  pieces.push(jump(39, 106, 0, 13, 18, 6, 180, 13, 'hazardstripe'));
  pieces.push(jump(-106, 39, 0, 18, 13, 6, 90, 13, 'hazardstripe'));
  pieces.push(jump(106, -39, 0, 18, 13, 6, 270, 13, 'hazardstripe'));
  pieces.push(jump(-58, 0, 11, 14, 16, 5, 90, 11, 'asphalt'));
  pieces.push(jump(58, 0, 11, 14, 16, 5, 270, 11, 'asphalt'));

  // Street furniture gives cover at the widest intersections without making
  // the traffic lanes confusing or impassable.
  for (const [x, z] of [[-39, -39], [39, -39], [-39, 39], [39, 39]]) {
    pieces.push(pillar(x, z, 0, 2.2, 7, 'hazardstripe'));
  }
  return pieces;
}

// ── 2 · NEON OVERPASS ──────────────────────────────────────────────────────
function overpassPieces() {
  const B = 126;
  const pieces = [...arenaWalls(B, 'neon', 34)];
  // ground-level city blocks
  const blocks = [[-72, -72], [72, -72], [-72, 72], [72, 72], [-36, 0], [36, 0], [0, -36], [0, 36]];
  for (const [x, z] of blocks) pieces.push(box(x, z, 0, 26, 26, 16, 'city'));
  // lower deck: an east/west expressway on stilts at y=20 with a gap in the middle
  pieces.push(box(-58, 0, 20, 96, 26, 3, 'asphalt'));
  pieces.push(box(58, 0, 20, 96, 26, 3, 'asphalt'));
  pieces.push(jump(-16, 0, 20, 24, 26, 5, 270));
  pieces.push(jump(16, 0, 20, 24, 26, 5, 90));
  // upper deck: north/south flyover at y=34 crossing over the expressway
  pieces.push(box(0, -60, 34, 26, 92, 3, 'asphalt'));
  pieces.push(box(0, 60, 34, 26, 92, 3, 'asphalt'));
  pieces.push(jump(0, -18, 34, 26, 24, 5, 0));
  pieces.push(jump(0, 18, 34, 26, 24, 5, 180));
  // on-ramps: ground → lower deck → upper deck around the outside
  pieces.push(ramp(-104, -44, 0, 24, 52, 20, 0, 'asphalt'));
  pieces.push(ramp(104, 44, 0, 24, 52, 20, 180, 'asphalt'));
  pieces.push(ramp(-44, -104, 0, 52, 24, 34, 90, 'asphalt'));
  pieces.push(ramp(44, 104, 0, 52, 24, 34, 270, 'asphalt'));
  pieces.push(ramp(-104, 44, 0, 24, 52, 34, 180, 'asphalt'));
  pieces.push(ramp(104, -44, 0, 24, 52, 20, 0, 'asphalt'));
  // support pylons — collide with them at speed and you will feel it
  for (const [x, z] of [[-58, -20], [-58, 20], [58, -20], [58, 20], [-20, -60], [20, -60], [-20, 60], [20, 60]]) {
    pieces.push(pillar(x, z, 0, 4, 20, 'concrete'));
  }
  // billboard walls that break sightlines on the flyovers
  pieces.push(wall(-30, -60, 37, 4, 34, 10, 'neon'));
  pieces.push(wall(30, 60, 37, 4, 34, 10, 'neon'));
  pieces.push(wall(-58, -30, 23, 34, 4, 10, 'neon'));
  pieces.push(wall(58, 30, 23, 34, 4, 10, 'neon'));
  // live wire pools under the interchange
  pieces.push(hazard(0, 0, 16, 22, 0x64f0ff));
  pieces.push(hazard(-90, 90, 13, 18, 0x64f0ff));
  pieces.push(hazard(90, -90, 13, 18, 0x64f0ff));
  return pieces;
}

// ── 3 · MAGMA BOWL ─────────────────────────────────────────────────────────
function magmaPieces() {
  const B = 122;
  const pieces = [...arenaWalls(B, 'rock', 32)];
  // outer crater rim: a raised ring track circling the whole bowl
  for (const [x, z, w, d] of [[0, -100, 244, 44], [0, 100, 244, 44], [-100, 0, 44, 156], [100, 0, 44, 156]]) {
    pieces.push(box(x, z, 0, w, d, 18, 'rock'));
  }
  // spiral descents from the rim into the bowl
  pieces.push(ramp(-58, -74, 0, 44, 46, 18, 180, 'rock'));
  pieces.push(ramp(58, 74, 0, 44, 46, 18, 0, 'rock'));
  pieces.push(ramp(-74, 58, 0, 46, 44, 18, 270, 'rock'));
  pieces.push(ramp(74, -58, 0, 46, 44, 18, 90, 'rock'));
  // central mesa with a summit approach on two sides
  pieces.push(box(0, 0, 0, 46, 46, 20, 'obsidian'));
  pieces.push(ramp(0, -36, 0, 20, 26, 20, 0, 'obsidian'));
  pieces.push(ramp(0, 36, 0, 20, 26, 20, 180, 'obsidian'));
  // floating obsidian slabs — landing pads over the lava for the brave
  for (const [x, z] of [[-40, -40], [40, -40], [-40, 40], [40, 40]]) {
    pieces.push(box(x, z, 12, 22, 22, 3, 'obsidian'));
    pieces.push(jump(x * 1.55, z * 1.55, 0, 20, 20, 11, x > 0 ? 270 : 90));
  }
  // lava moat between the rim and the mesa
  for (const [x, z, r] of [[-62, 0, 15], [62, 0, 15], [0, -62, 15], [0, 62, 15], [-30, -66, 11], [30, 66, 11], [-66, 30, 11], [66, -30, 11]]) {
    pieces.push(hazard(x, z, r, 26));
  }
  // basalt columns for cover on the bowl floor
  for (const [x, z] of [[-24, -12], [24, 12], [-12, 30], [12, -30], [-52, -34], [52, 34]]) {
    pieces.push(pillar(x, z, 0, 5, 15, 'rock'));
  }
  // rim jump ramps launching riders straight onto the floating slabs
  pieces.push(jump(-100, -46, 18, 34, 24, 6, 0, 12, 'rock'));
  pieces.push(jump(100, 46, 18, 34, 24, 6, 180, 12, 'rock'));
  return pieces;
}

const arena = definition => Object.freeze({
  ...definition,
  pieces: Object.freeze(definition.pieces),
  spawns: Object.freeze({
    A: Object.freeze(definition.spawns.A.map(Object.freeze)),
    B: Object.freeze(definition.spawns.B.map(Object.freeze)),
    ffa: Object.freeze(definition.spawns.ffa.map(Object.freeze)),
  }),
});

export const ARENA_MAPS = Object.freeze({
  crateworks: arena({
    // Keep the legacy id so existing saved selections still load the rebuilt map.
    id: 'crateworks', title: 'BREAKPOINT CITY', tag: 'DESTRUCTIBLE DOWNTOWN GRID',
    description: 'A real downtown combat grid with marked avenues, alleys, raised parking decks, a ramp-fed civic plaza, rooftop jump lines, and buildings that collapse to open new routes.',
    accent: '#ffd24a', icon: '🌆', sky: 0x496983, fog: 0x71869a, ground: 0x20262d, weather: 'GOLDEN HOUR HAZE',
    bounds: 132, pieces: crateworksPieces(),
    spawns: {
      A: [{ x: -112, z: -39, y: 0, yaw: Math.PI / 2 }, { x: -92, z: 39, y: 0, yaw: Math.PI / 2 }, { x: -39, z: -116, y: 0, yaw: 0 }, { x: 39, z: -116, y: 0, yaw: 0 }, { x: -116, z: 82, y: 0, yaw: Math.PI / 2 }],
      B: [{ x: 112, z: 39, y: 0, yaw: -Math.PI / 2 }, { x: 92, z: -39, y: 0, yaw: -Math.PI / 2 }, { x: 39, z: 116, y: 0, yaw: Math.PI }, { x: -39, z: 116, y: 0, yaw: Math.PI }, { x: 116, z: -82, y: 0, yaw: -Math.PI / 2 }],
      ffa: [{ x: -116, z: -39, y: 0, yaw: Math.PI / 2 }, { x: 116, z: 39, y: 0, yaw: -Math.PI / 2 }, { x: -39, z: 116, y: 0, yaw: Math.PI }, { x: 39, z: -116, y: 0, yaw: 0 }, { x: -116, z: 39, y: 0, yaw: Math.PI / 2 }, { x: 116, z: -39, y: 0, yaw: -Math.PI / 2 }, { x: 39, z: 116, y: 0, yaw: Math.PI }, { x: -39, z: -116, y: 0, yaw: 0 }, { x: -112, z: 92, y: 0, yaw: Math.PI / 2 }, { x: 112, z: -92, y: 0, yaw: -Math.PI / 2 }],
    },
  }),
  overpass: arena({
    id: 'overpass', title: 'NEON OVERPASS', tag: 'STACKED HIGHWAY INTERCHANGE',
    description: 'Three levels of downtown expressway with a hole punched through the middle. Ground blocks, a lower expressway, and a flyover thirty metres up — every level has a way to fall off it.',
    accent: '#ff4fd8', icon: '🌃', sky: 0x120a24, fog: 0x241540, ground: 0x1e2233, weather: 'NEON DOWNPOUR',
    bounds: 126, pieces: overpassPieces(),
    spawns: {
      A: [{ x: -104, z: -70, y: 0, yaw: Math.PI * 0.7 }, { x: -110, z: -20, y: 0, yaw: Math.PI / 2 }, { x: -70, z: -104, y: 0, yaw: Math.PI }, { x: -110, z: -104, y: 0, yaw: Math.PI * 0.75 }, { x: -30, z: -110, y: 0, yaw: Math.PI }],
      B: [{ x: 104, z: 70, y: 0, yaw: -Math.PI * 0.3 }, { x: 110, z: 20, y: 0, yaw: -Math.PI / 2 }, { x: 70, z: 104, y: 0, yaw: 0 }, { x: 110, z: 104, y: 0, yaw: -Math.PI * 0.25 }, { x: 30, z: 110, y: 0, yaw: 0 }],
      ffa: [{ x: -110, z: -110, y: 0, yaw: Math.PI * 0.75 }, { x: 110, z: 110, y: 0, yaw: -Math.PI * 0.25 }, { x: -110, z: 110, y: 0, yaw: Math.PI * 0.25 }, { x: 110, z: -110, y: 0, yaw: -Math.PI * 0.75 }, { x: 0, z: -112, y: 0, yaw: 0 }, { x: 0, z: 112, y: 0, yaw: Math.PI }, { x: -112, z: 0, y: 0, yaw: Math.PI / 2 }, { x: 112, z: 0, y: 0, yaw: -Math.PI / 2 }, { x: -60, z: -112, y: 0, yaw: 0 }, { x: 60, z: 112, y: 0, yaw: Math.PI }],
    },
  }),
  magma: arena({
    id: 'magma', title: 'MAGMA BOWL', tag: 'ACTIVE CALDERA SPEEDWAY',
    description: 'A live volcano with a rim track, four spiral descents, floating obsidian slabs and a lava moat that does not care how expensive your paint job was.',
    accent: '#ff5a1f', icon: '🌋', sky: 0x1a0b06, fog: 0x3a1206, ground: 0x2b1710, weather: 'ERUPTION WARNING',
    bounds: 122, pieces: magmaPieces(),
    spawns: {
      A: [{ x: -100, z: -60, y: 18, yaw: Math.PI * 0.6 }, { x: -100, z: -20, y: 18, yaw: Math.PI / 2 }, { x: -60, z: -100, y: 18, yaw: Math.PI }, { x: -100, z: -100, y: 18, yaw: Math.PI * 0.75 }, { x: -20, z: -100, y: 18, yaw: Math.PI }],
      B: [{ x: 100, z: 60, y: 18, yaw: -Math.PI * 0.4 }, { x: 100, z: 20, y: 18, yaw: -Math.PI / 2 }, { x: 60, z: 100, y: 18, yaw: 0 }, { x: 100, z: 100, y: 18, yaw: -Math.PI * 0.25 }, { x: 20, z: 100, y: 18, yaw: 0 }],
      ffa: [{ x: -100, z: -100, y: 18, yaw: Math.PI * 0.75 }, { x: 100, z: 100, y: 18, yaw: -Math.PI * 0.25 }, { x: -100, z: 100, y: 18, yaw: Math.PI * 0.25 }, { x: 100, z: -100, y: 18, yaw: -Math.PI * 0.75 }, { x: 0, z: -100, y: 18, yaw: 0 }, { x: 0, z: 100, y: 18, yaw: Math.PI }, { x: -100, z: 0, y: 18, yaw: Math.PI / 2 }, { x: 100, z: 0, y: 18, yaw: -Math.PI / 2 }, { x: -52, z: -100, y: 18, yaw: 0 }, { x: 52, z: 100, y: 18, yaw: Math.PI }],
    },
  }),
});

export const ARENA_MAP_IDS = Object.freeze(Object.keys(ARENA_MAPS));
export const arenaMapById = id => ARENA_MAPS[id] || ARENA_MAPS.crateworks;

// ── Match rules ────────────────────────────────────────────────────────────
export const ARENA_TEAM_MODES = Object.freeze({
  teams: Object.freeze({ id: 'teams', title: 'TEAM VS TEAM', kicker: 'CREW WARFARE', description: 'Two crews, shared score, shared respawn yard. 1v1 up to 5v5.', minPlayers: 2, maxPlayers: 10 }),
  ffa: Object.freeze({ id: 'ffa', title: 'FREE FOR ALL', kicker: 'EVERY DRIVER FOR THEMSELVES', description: 'No allies. No mercy. First driver to the target wins.', minPlayers: 2, maxPlayers: 10 }),
});

export const WIN_CONDITIONS = Object.freeze([
  Object.freeze({ id: 'time-3', title: '3 MINUTES', kind: 'time', seconds: 180, note: 'Most kills when the clock dies' }),
  Object.freeze({ id: 'time-5', title: '5 MINUTES', kind: 'time', seconds: 300, note: 'Most kills when the clock dies' }),
  Object.freeze({ id: 'time-10', title: '10 MINUTES', kind: 'time', seconds: 600, note: 'Most kills when the clock dies' }),
  Object.freeze({ id: 'race-10', title: 'RACE TO 10', kind: 'score', target: 10, note: 'First to 10 kills' }),
  Object.freeze({ id: 'race-20', title: 'RACE TO 20', kind: 'score', target: 20, note: 'First to 20 kills' }),
  Object.freeze({ id: 'race-30', title: 'RACE TO 30', kind: 'score', target: 30, note: 'First to 30 kills' }),
  Object.freeze({ id: 'race-50', title: 'RACE TO 50', kind: 'score', target: 50, note: 'First to 50 kills' }),
]);

export const winConditionById = id => WIN_CONDITIONS.find(w => w.id === id) || WIN_CONDITIONS[1];

export const ARENA_DIFFICULTIES = Object.freeze([
  Object.freeze({ id: 'rookie', title: 'ROOKIE', aim: 0.16, reaction: 0.55, aggression: 0.6, throttle: 0.82, ultimateBias: 0.5 }),
  Object.freeze({ id: 'regular', title: 'REGULAR', aim: 0.085, reaction: 0.3, aggression: 0.8, throttle: 0.92, ultimateBias: 0.75 }),
  Object.freeze({ id: 'veteran', title: 'VETERAN', aim: 0.04, reaction: 0.16, aggression: 1, throttle: 1, ultimateBias: 1 }),
  Object.freeze({ id: 'nightmare', title: 'NIGHTMARE', aim: 0.018, reaction: 0.08, aggression: 1.15, throttle: 1, ultimateBias: 1.25 }),
]);

export const arenaDifficultyById = id => ARENA_DIFFICULTIES.find(d => d.id === id) || ARENA_DIFFICULTIES[1];

export const ARENA_TEAMS = Object.freeze({
  A: Object.freeze({ id: 'A', name: 'CRUSHERS', color: 0x2fb4ff, css: '#2fb4ff' }),
  B: Object.freeze({ id: 'B', name: 'WRECKERS', color: 0xff4d3d, css: '#ff4d3d' }),
});

// FFA drivers still need distinguishable auras.
export const FFA_COLORS = Object.freeze([0x2fb4ff, 0xff4d3d, 0x71f06f, 0xffd23f, 0xff4fd8, 0xa96bff, 0x64f0ff, 0xff8b3d, 0xd8ff6a, 0xffffff]);
