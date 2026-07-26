// ── CRATE BLITZ ARENAS ──────────────────────────────────────────────────────
// Three tile lattices. The skeleton (indestructible pillars, conveyors, lava
// seams and the spawn pockets) is authored; the destructible fill is generated
// per match from a seed, so the maze is new every time while the shape of the
// board stays learnable.
//
// There are three kinds of breakable obstacle and they are genuinely different:
// a wooden crate pops in one blast, a brick block needs two, and a scrap pile
// pops in one but almost never hides anything. Each one has its own colour,
// its own debris and its own recorded burst sound.

export const TILE = Object.freeze({
  FLOOR: 0,
  PILLAR: 1,     // indestructible steel column
  WOOD: 2,       // wooden crate — one blast, best odds of a drop
  BRICK: 3,      // brick block — two blasts, good odds of a drop
  DEBRIS: 4,     // scrap pile — one blast, rarely hides anything
  SUDDEN: 5,     // dropped during sudden death, indestructible
  CONVEYOR: 6,   // walkable, pushes whatever stands on it
  HAZARD: 7,     // walkable, burns
});

export const TILE_SIZE = 6;
export const WALKABLE = Object.freeze(new Set([TILE.FLOOR, TILE.CONVEYOR, TILE.HAZARD]));
export const BLOCKING = Object.freeze(new Set([TILE.PILLAR, TILE.WOOD, TILE.BRICK, TILE.DEBRIS, TILE.SUDDEN]));
export const DESTRUCTIBLE = Object.freeze(new Set([TILE.WOOD, TILE.BRICK, TILE.DEBRIS]));

// Per-obstacle behaviour, in one table so the grid, the world builder, the
// mixer and the particle bursts all agree on what a tile is made of.
export const OBSTACLES = Object.freeze({
  [TILE.WOOD]: Object.freeze({
    tile: TILE.WOOD, id: 'wood', name: 'CRATE STOCK', material: 'wood',
    hp: 1, dropBias: 1.15, color: 0xb5793a, trim: 0x6b4620, debris: 0xd39a5c,
  }),
  [TILE.BRICK]: Object.freeze({
    tile: TILE.BRICK, id: 'brick', name: 'BRICK BLOCK', material: 'brick',
    hp: 2, dropBias: 1.35, color: 0xc0563c, trim: 0x7a2f1d, debris: 0xe07a5c,
  }),
  [TILE.DEBRIS]: Object.freeze({
    tile: TILE.DEBRIS, id: 'debris', name: 'SCRAP PILE', material: 'debris',
    hp: 1, dropBias: 0.35, color: 0x6f7887, trim: 0x3d444f, debris: 0x9aa4b2,
  }),
});
export const obstacleAt = tile => OBSTACLES[tile] || null;
export const isDestructible = tile => DESTRUCTIBLE.has(tile);

const DIRS = Object.freeze([{ dx: 0, dz: -1 }, { dx: 1, dz: 0 }, { dx: 0, dz: 1 }, { dx: -1, dz: 0 }]);
export const CARDINALS = DIRS;

// ── pillar skeletons ───────────────────────────────────────────────────────
// Classic every-other-tile lattice.
const latticePillars = (col, row) => col % 2 === 1 && row % 2 === 1;
// Sparse 2x2 blocks with wide plazas between them.
const plazaPillars = (col, row) => {
  const bc = col % 6, br = row % 6;
  return (bc === 2 || bc === 3) && (br === 2 || br === 3);
};
// Diagonal bands that funnel movement across the map.
const bandPillars = (col, row) => (col + row) % 4 === 0 && col % 2 === 1;

const arena = definition => Object.freeze({
  ...definition,
  mix: Object.freeze(definition.mix),
  spawns: Object.freeze(definition.spawns.map(Object.freeze)),
  conveyors: Object.freeze((definition.conveyors || []).map(Object.freeze)),
  hazards: Object.freeze((definition.hazards || []).map(Object.freeze)),
});

// `mix` is the relative weight of each obstacle kind in the generated fill.
export const BLITZ_ARENAS = Object.freeze({
  foundry: arena({
    id: 'foundry', title: 'CRATE FOUNDRY FLOOR', tag: 'CLASSIC DEMOLITION LATTICE',
    description: 'The assembly floor where crates are born: a strict every-other-tile pillar lattice packed wall to wall with fresh wooden stock and the odd scrap pile.',
    accent: '#ffb02e', icon: '🏭', sky: 0x2a1c14, fog: 0x3d2a1c, floor: 0x584434, weather: 'FORGE HAZE',
    cols: 15, rows: 15, pillars: latticePillars, density: 0.84,
    mix: { wood: 0.68, brick: 0.14, debris: 0.18 },
    // Ten pockets, spread so any subset of the roster starts far apart.
    spawns: [
      { col: 0, row: 0 }, { col: 14, row: 14 }, { col: 14, row: 0 }, { col: 0, row: 14 },
      { col: 7, row: 0 }, { col: 7, row: 14 }, { col: 0, row: 7 }, { col: 14, row: 7 },
      { col: 4, row: 0 }, { col: 10, row: 14 },
    ],
  }),
  blockparty: arena({
    id: 'blockparty', title: 'NEON BLOCK PARTY', tag: 'BRICK PLAZAS AND CONVEYOR LANES',
    description: 'A downtown loading district of open plazas and stubby block pillars, walled in brick and threaded with four live conveyor lanes that will happily carry you into somebody else’s blast.',
    accent: '#ff4fd8', icon: '🌃', sky: 0x120a24, fog: 0x241540, floor: 0x232840, weather: 'NEON DOWNPOUR',
    cols: 19, rows: 15, pillars: plazaPillars, density: 0.6,
    mix: { wood: 0.34, brick: 0.48, debris: 0.18 },
    conveyors: [
      { col0: 1, row0: 7, col1: 17, row1: 7, dir: 1 },
      { col0: 9, row0: 1, col1: 9, row1: 13, dir: 2 },
      { col0: 1, row0: 1, col1: 1, row1: 13, dir: 0 },
      { col0: 17, row0: 1, col1: 17, row1: 13, dir: 2 },
    ],
    spawns: [
      { col: 0, row: 0 }, { col: 18, row: 14 }, { col: 18, row: 0 }, { col: 0, row: 14 },
      { col: 9, row: 0 }, { col: 9, row: 14 }, { col: 0, row: 7 }, { col: 18, row: 7 },
      { col: 5, row: 0 }, { col: 13, row: 14 },
    ],
  }),
  lattice: arena({
    id: 'lattice', title: 'VOLCANIC LATTICE', tag: 'SCRAP BANDS OVER A LAVA SEAM',
    description: 'A cooling lattice built over an open magma seam. Diagonal pillar bands break every sightline, the fill is mostly salvaged scrap, and the central tiles are still, technically, molten.',
    accent: '#ff5a1f', icon: '🌋', sky: 0x1a0b06, fog: 0x3a1206, floor: 0x3a251c, weather: 'ERUPTION WARNING',
    cols: 17, rows: 17, pillars: bandPillars, density: 0.68,
    mix: { wood: 0.3, brick: 0.24, debris: 0.46 },
    hazards: [
      { col0: 7, row0: 7, col1: 9, row1: 9 },
      { col0: 2, row0: 8, col1: 2, row1: 8 },
      { col0: 14, row0: 8, col1: 14, row1: 8 },
      { col0: 8, row0: 2, col1: 8, row1: 2 },
      { col0: 8, row0: 14, col1: 8, row1: 14 },
    ],
    spawns: [
      { col: 0, row: 0 }, { col: 16, row: 16 }, { col: 16, row: 0 }, { col: 0, row: 16 },
      { col: 8, row: 0 }, { col: 8, row: 16 }, { col: 0, row: 8 }, { col: 16, row: 8 },
      { col: 4, row: 0 }, { col: 12, row: 16 },
    ],
  }),
});

export const BLITZ_ARENA_IDS = Object.freeze(Object.keys(BLITZ_ARENAS));
export const blitzArenaById = id => BLITZ_ARENAS[id] || BLITZ_ARENAS.foundry;

// Spawn pockets: the spawn tile plus a small L of neighbours is cleared so
// nobody starts walled in and everybody has one escape lane on turn one.
const POCKET = [
  { dx: 0, dz: 0 }, { dx: 1, dz: 0 }, { dx: -1, dz: 0 }, { dx: 0, dz: 1 }, { dx: 0, dz: -1 },
  { dx: 2, dz: 0 }, { dx: -2, dz: 0 }, { dx: 0, dz: 2 }, { dx: 0, dz: -2 },
];

// Picks an obstacle tile from the arena's material mix.
function rollObstacle(mix, random) {
  const total = (mix.wood || 0) + (mix.brick || 0) + (mix.debris || 0);
  let roll = random() * (total || 1);
  if ((roll -= mix.wood || 0) <= 0) return TILE.WOOD;
  if ((roll -= mix.brick || 0) <= 0) return TILE.BRICK;
  return TILE.DEBRIS;
}

// Builds the tile lattice for one match. `random` makes the fill reproducible.
export function generateGrid(arenaDef, random = Math.random) {
  const { cols, rows } = arenaDef;
  const tiles = [];
  for (let row = 0; row < rows; row++) {
    const line = [];
    for (let col = 0; col < cols; col++) {
      const edge = col === 0 || row === 0 || col === cols - 1 || row === rows - 1;
      if (!edge && arenaDef.pillars(col, row)) line.push(TILE.PILLAR);
      else line.push(random() < arenaDef.density ? rollObstacle(arenaDef.mix, random) : TILE.FLOOR);
    }
    tiles.push(line);
  }
  for (const belt of arenaDef.conveyors || []) {
    for (let col = belt.col0; col <= belt.col1; col++) {
      for (let row = belt.row0; row <= belt.row1; row++) {
        if (tiles[row]?.[col] === TILE.PILLAR) continue;
        tiles[row][col] = TILE.CONVEYOR;
      }
    }
  }
  for (const seam of arenaDef.hazards || []) {
    for (let col = seam.col0; col <= seam.col1; col++) {
      for (let row = seam.row0; row <= seam.row1; row++) {
        if (tiles[row]?.[col] === TILE.PILLAR) continue;
        tiles[row][col] = TILE.HAZARD;
      }
    }
  }
  for (const spawn of arenaDef.spawns) {
    for (const offset of POCKET) {
      const col = spawn.col + offset.dx, row = spawn.row + offset.dz;
      if (col < 0 || row < 0 || col >= cols || row >= rows) continue;
      if (tiles[row][col] === TILE.PILLAR) continue;
      tiles[row][col] = TILE.FLOOR;
    }
  }
  return tiles;
}

// Conveyor push direction for a tile, derived from the belt that covers it.
export function conveyorDirAt(arenaDef, col, row) {
  for (const belt of arenaDef.conveyors || []) {
    if (col >= belt.col0 && col <= belt.col1 && row >= belt.row0 && row <= belt.row1) return DIRS[belt.dir];
  }
  return null;
}

// ── match rules ────────────────────────────────────────────────────────────
// Crate Blitz is elimination, so the only two shapes are "last one standing"
// and "last crew standing". Everything else is a setup dial.
export const BLITZ_TEAM_MODES = Object.freeze({
  ffa: Object.freeze({
    id: 'ffa', title: 'FREE FOR ALL', kicker: 'EVERY CRATE FOR THEMSELVES',
    description: 'No allies. Last Destructo standing takes it.',
  }),
  coop: Object.freeze({
    id: 'coop', title: 'CO-OP CREWS', kicker: 'FIGHT AS A TEAM',
    description: 'Two to four crews. The last crew with anybody breathing wins.',
  }),
});

export const BLITZ_DIFFICULTIES = Object.freeze([
  Object.freeze({ id: 'rookie', title: 'ROOKIE', reaction: 0.5, nerve: 0.45, greed: 0.5, dangerLookahead: 1.1, mistakes: 0.22 }),
  Object.freeze({ id: 'regular', title: 'REGULAR', reaction: 0.26, nerve: 0.7, greed: 0.7, dangerLookahead: 1.6, mistakes: 0.08 }),
  Object.freeze({ id: 'veteran', title: 'VETERAN', reaction: 0.14, nerve: 0.9, greed: 0.85, dangerLookahead: 2.2, mistakes: 0.02 }),
  Object.freeze({ id: 'nightmare', title: 'NIGHTMARE', reaction: 0.07, nerve: 1, greed: 1, dangerLookahead: 2.8, mistakes: 0 }),
]);
export const blitzDifficultyById = id => BLITZ_DIFFICULTIES.find(d => d.id === id) || BLITZ_DIFFICULTIES[1];

// How many lives everybody gets before they are out of the match for good.
export const BLITZ_LIVES = Object.freeze([
  Object.freeze({ id: 'lives-1', title: 'ONE LIFE', lives: 1, note: 'One mistake and you are spectating' }),
  Object.freeze({ id: 'lives-3', title: 'THREE LIVES', lives: 3, note: 'Room for two bad reads' }),
  Object.freeze({ id: 'lives-5', title: 'FIVE LIVES', lives: 5, note: 'A long, loud match' }),
]);
export const blitzLivesById = id => BLITZ_LIVES.find(entry => entry.id === id) || BLITZ_LIVES[1];

// Sudden death: once the arena has run long enough, indestructible blocks rain
// in along an inward spiral and squeeze everyone into the middle.
export const SUDDEN_DEATH = Object.freeze({ startsAt: 150, interval: 0.85 });

export function spiralOrder(cols, rows) {
  const cells = [];
  let top = 0, bottom = rows - 1, left = 0, right = cols - 1;
  while (top <= bottom && left <= right) {
    for (let col = left; col <= right; col++) cells.push({ col, row: top });
    for (let row = top + 1; row <= bottom; row++) cells.push({ col: right, row });
    if (top < bottom) for (let col = right - 1; col >= left; col--) cells.push({ col, row: bottom });
    if (left < right) for (let row = bottom - 1; row > top; row--) cells.push({ col: left, row });
    top++; bottom--; left++; right--;
  }
  return cells;
}

// Three or more obstacles going up at once is enough to feel through the floor.
export const TREMOR_THRESHOLD = 3;
