const ribbon = (texture, width, points, options = {}) => ({ kind: 'ribbon', texture, width, points, ...options });
const patch = (texture, center, radius, options = {}) => ({ kind: 'patch', texture, center, radius, ...options });
const ring = (texture, center, innerRadius, outerRadius, options = {}) => ({ kind: 'ring', texture, center, innerRadius, outerRadius, ...options });
const rect = (texture, center, size, options = {}) => ({ kind: 'rect', texture, center, size, ...options });

// ── BUMPER-TO-BUMPER BEDLAM · street painting ───────────────────────────────
// The city's kerbs, pavements and buildings are real geometry (see
// src/game/maps/BedlamCity.js); this file only paints the tarmac underneath
// them. Every layer carries a distinct `offset` so overlapping carriageways at
// the intersections resolve in a fixed order instead of z-fighting.
export const BEDLAM = Object.freeze({
  // Street centrelines. Blocks sit in the 60-unit gaps between them.
  lines: Object.freeze([-180, -120, -60, 0, 60, 120, 180]),
  roadHalf: 9,        // asphalt carriageway half-width
  curbHalf: 13,       // kerb line: pavements run from here out to the block
  blockHalf: 21,      // half-width of one raised pavement block (60 - 18) / 2
  curbHeight: .35,
  gridReach: 198,     // downtown grid stops here, outskirts take over
  ring: 222,          // square ring boulevard, clear of the downtown corners
  ringHalf: 11,
  outskirt: 196,      // spine of the band between downtown and the ring road
  baseRadius: 272,
});

const bedlamLayers = () => {
  const { lines, gridReach, ring: RING, baseRadius } = BEDLAM;
  const layers = [];
  // Carriageways: north-south first, then east-west laid over them, so every
  // crossroads reads as one continuous junction rather than a seam.
  for (const x of lines) layers.push(ribbon('asphalt', 18, [[x, -gridReach], [x, gridReach]], { repeat: [1, 26], color: 0xf2f4f6, offset: .004 }));
  for (const z of lines) layers.push(ribbon('asphalt', 18, [[-gridReach, z], [gridReach, z]], { repeat: [1, 26], color: 0xf2f4f6, offset: .016 }));
  // The square ring boulevard and the twelve radial approaches to the compounds.
  for (const side of [-1, 1]) {
    layers.push(ribbon('asphalt', 22, [[-RING - 11, side * RING], [RING + 11, side * RING]], { repeat: [1, 30], color: 0xf2f4f6, offset: .028 }));
    layers.push(ribbon('asphalt', 22, [[side * RING, -RING], [side * RING, RING]], { repeat: [1, 28], color: 0xf2f4f6, offset: .032 }));
  }
  for (let i = 0; i < 12; i++) {
    const angle = Math.PI / 2 + i / 12 * Math.PI * 2, cos = Math.cos(angle), sin = Math.sin(angle);
    layers.push(ribbon('asphalt', 15, [[cos * 176, sin * 176], [cos * (baseRadius - 6), sin * (baseRadius - 6)]], { repeat: [1, 9], color: 0xf2f4f6, offset: .04 }));
  }
  // Lane markings ride above the tarmac in the same order.
  for (const x of lines) layers.push(ribbon('road_lines', 4, [[x, -gridReach], [x, gridReach]], { repeat: [1, 46], color: 0xe8d79a, offset: .055 }));
  for (const z of lines) layers.push(ribbon('road_lines', 4, [[-gridReach, z], [gridReach, z]], { repeat: [1, 46], color: 0xe8d79a, offset: .062 }));
  for (const side of [-1, 1]) layers.push(ribbon('road_lines', 4.5, [[-RING, side * RING], [RING, side * RING]], { repeat: [1, 36], color: 0xe8d79a, offset: .068 }));
  // Freight aprons, the harbour and the green belt break up the tarmac. (The
  // park and stadium blocks are turfed by their own block deck, not here — the
  // deck sits 0.35 above this paint and would hide it.)
  layers.push(patch('grass', [-150, 196], 26, { repeat: [5, 5], seed: 211, color: 0x7ba066, offset: .076 }));
  layers.push(patch('grass', [196, -150], 26, { repeat: [5, 5], seed: 212, color: 0x7ba066, offset: .076 }));
  layers.push(patch('grass', [196, 150], 22, { repeat: [4, 4], seed: 213, color: 0x74985f, offset: .076 }));
  layers.push(rect('corrugated_steel', [-196, 70], [46, 104], { repeat: [4, 9], color: 0x8b9296, offset: .076 }));
  layers.push(rect('concrete', [196, -70], [46, 104], { repeat: [4, 9], color: 0xa2a7ac, offset: .076 }));
  layers.push(rect('dirt', [-70, -196], [104, 46], { repeat: [9, 4], color: 0x8a7f6e, offset: .076 }));
  layers.push(rect('sidewalk', [70, 196], [104, 46], { repeat: [9, 4], color: 0xb0aca1, offset: .076 }));
  layers.push(patch('water', [70, 214], 26, { repeat: [4, 4], seed: 215, color: 0x4f93ae, transparent: true, opacity: .74, depthWrite: false, offset: .09 }));
  layers.push(rect('neon_concrete', [0, 0], [80, 80], { repeat: [8, 8], color: 0x8e8aa0, rotation: Math.PI / 4, offset: .1 }));
  return layers;
};

// ── THE VERY HUNGRY WILDERNESS · rainforest landform ────────────────────────
// Unlike the other procedural battlefields, the wilderness is an *authored*
// landscape: one height function (wildsHeight) is the single source of truth
// for the terrain mesh, for collision, and for where src/game/maps/
// RainforestWilds.js is allowed to plant a tree, hang a bridge or pour a
// waterfall. Anything that has to meet the ground — cliff facades, temple
// plinths, jetties, the plunge pool rim — samples the same function, so the
// geometry can never float or sink relative to the terrain under it.
//
// Water is authored at one level for the whole map (WILDS.waterY). Basins are
// carved *down to an absolute bed*, not scaled relative to the local floor, so
// the lagoon is genuinely below the waterline wherever the surrounding jungle
// happens to sit.
export const WILDS = Object.freeze({
  waterY: 1.55,          // river / pond / plunge-pool surface
  // The jungle floor sits well above the waterline on purpose. Basins are cut
  // *down to* an absolute bed, so if the floor rolled anywhere near the water
  // the map would grow accidental swamps wherever the noise happened to dip —
  // and Math.max(0, …) at the end of wildsHeight would iron those into dead
  // flat plates. floor 7.5 against ±5.1 of roll keeps every uncarved metre of
  // ground between 2.4 and 12.6, which is always dry and never clamped.
  floor: 7.5,
  // Highland. A `level` feature is a *table*, not a dome: inside its core the
  // ground is that exact height and nothing else, which is what lets a plateau
  // carry a stone causeway, a temple and a stair landing that all have to meet
  // it flush. The skirt here is deliberately near-vertical (26 of rise over 6
  // of run). Terrain alone would still let a unit scramble up, so
  // RainforestWilds rings the mesa with blocking rock: the switchback stair and
  // the fallen kapok are the only two ways onto the plateau.
  mesa: Object.freeze({ x: -92, z: 80, core: 42, skirt: 6, level: 30 }),
  // A shallow apron of broken ground spreading out from the cliff foot, so the
  // mesa sits in the landscape instead of being punched into it.
  mesaApron: Object.freeze({ x: -92, z: 80, core: 48, skirt: 26, rise: 4 }),
  // Where the river is born: the lip the falls pour over, and the pool below.
  // The pool overlaps the cliff foot on purpose — the mesa table is applied
  // after the basin is carved, so the rock wins and the water stops at it.
  fallLip: Object.freeze({ x: -61, z: 52 }),
  plunge: Object.freeze({ x: -52, z: 44, radius: 16, depth: 2.2 }),
  // The Serpent: plunge pool → a gorge west and south of the temple mound →
  // jaguar lagoon. It is kept 50-odd metres clear of the ziggurat so the
  // mound's skirt survives all the way round and the monument stays assailable
  // from every bearing — the gorge is a separate obstacle, not a moat.
  river: Object.freeze([[-52, 44], [-54, 14], [-52, -18], [-38, -48], [-8, -72], [26, -88], [60, -100]]),
  riverHalf: 10,
  riverDepth: 1.9,
  lagoon: Object.freeze({ x: 74, z: -96, radius: 34, depth: 2.8 }),
  // Secondary landforms, in rough order of how much they change a firefight.
  bamboo: Object.freeze({ x: 118, z: 52, core: 26, skirt: 22, rise: 12 }),
  terrace: Object.freeze({ x: -20, z: 118, core: 18, skirt: 20, rise: 8 }),
  // Core 24 is not arbitrary: the ziggurat's base tier is 32 across, so its
  // corners reach 22.6 out. Anything narrower and the bottom step would land on
  // sloping ground and stop being a one-metre stride.
  temple: Object.freeze({ x: 0, z: 0, core: 24, skirt: 20, level: 15 }),
  mire: Object.freeze({ x: -96, z: -88, core: 26, skirt: 26, drop: 3.5 }),
  grotto: Object.freeze({ x: -140, z: -30, core: 14, skirt: 20, drop: 4.5 }),
  rimStart: 214,         // the forest wall closing the horizon
  rimEnd: 248,
  rimRise: 9,
});

const smoothstep = (edge0, edge1, value) => { const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0))); return t * t * (3 - 2 * t); };

// Distance from a point to a polyline, used for both the river bed and for
// keeping planting out of the water.
export function distanceToPath(x, z, path) {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i], [bx, bz] = path[i + 1];
    const dx = bx - ax, dz = bz - az, lengthSq = dx * dx + dz * dz;
    const t = lengthSq > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / lengthSq)) : 0;
    const distance = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (distance < best) best = distance;
  }
  return best;
}

const dome = (x, z, feature) => feature.rise * (1 - smoothstep(feature.core, feature.core + feature.skirt, Math.hypot(x - feature.x, z - feature.z)));
const basin = (x, z, feature) => feature.drop * (1 - smoothstep(feature.core, feature.core + feature.skirt, Math.hypot(x - feature.x, z - feature.z)));
// Force the ground to an exact level inside a feature's core and blend back out
// across its skirt. Unlike a dome this erases the rolling floor underneath, so
// a plateau really is flat and a temple mound really does have a level crown.
const table = (x, z, feature, y) => {
  const t = smoothstep(feature.core, feature.core + feature.skirt, Math.hypot(x - feature.x, z - feature.z));
  return t >= 1 ? y : feature.level + (y - feature.level) * t;
};

// Order matters, and it is the whole design:
//   rolling floor → hills → hollows → temple table → water → mesa table → rim
// The river and the pools are cut *after* the temple mound so a gorge can run
// along its flank, and *before* the mesa so the cliff stops the plunge pool
// dead instead of the pool eating a channel through the plateau.
export function wildsHeight(x, z) {
  const W = WILDS;
  // Rolling floor: four incommensurate waves so no ridge ever repeats within
  // the play area and every clearing has a slightly different lie.
  let y = W.floor
    + Math.sin(x * .021 + .7) * Math.cos(z * .019 - 1.1) * 2
    + Math.sin(x * .047 - 2.1) * .9
    + Math.cos(z * .053 + .4) * .8
    + Math.sin((x + z) * .0115) * 1.4;
  y += dome(x, z, W.mesaApron) + dome(x, z, W.bamboo) + dome(x, z, W.terrace);
  y -= basin(x, z, W.mire) + basin(x, z, W.grotto);
  y = table(x, z, W.temple, y);
  const carve = (bed, distance, inner, outer) => { const t = smoothstep(inner, outer, distance); if (t < 1) y = bed + (y - bed) * t; };
  carve(W.waterY - W.lagoon.depth, Math.hypot(x - W.lagoon.x, z - W.lagoon.z), W.lagoon.radius, W.lagoon.radius + 18);
  carve(W.waterY - W.plunge.depth, Math.hypot(x - W.plunge.x, z - W.plunge.z), W.plunge.radius, W.plunge.radius + 14);
  carve(W.waterY - W.riverDepth, distanceToPath(x, z, W.river), W.riverHalf, W.riverHalf + 13);
  y = table(x, z, W.mesa, y);
  // A ridge of high ground beyond the base ring so the jungle closes rather
  // than simply stopping against the fog.
  y += W.rimRise * smoothstep(W.rimStart, W.rimEnd, Math.hypot(x, z));
  return Math.max(0, y);
}

export const wildsIsWater = (x, z) => {
  const W = WILDS;
  // The plunge pool laps against the cliff, and the mesa table wins there, so
  // the plateau and its skirt are never water however close the pool comes.
  if (Math.hypot(x - W.mesa.x, z - W.mesa.z) < W.mesa.core + W.mesa.skirt) return false;
  if (Math.hypot(x - W.lagoon.x, z - W.lagoon.z) < W.lagoon.radius - 1.5) return true;
  if (Math.hypot(x - W.plunge.x, z - W.plunge.z) < W.plunge.radius - 1.5) return true;
  return distanceToPath(x, z, W.river) < W.riverHalf - 1.5;
};

// The four lost temple complexes the map has always been named for, now placed
// on real landforms: one drowned in the mire, one on the lagoon shore, one on
// the mesa top above the falls, one in the eastern bamboo.
export const WILDS_TEMPLES = Object.freeze([
  Object.freeze({ name: 'SUNKEN COURT OF ROOTS', x: -92, z: -68, texture: 'root_mud', accent: 'moss_stone' }),
  Object.freeze({ name: 'LAGOON JAGUAR SHRINE', x: 108, z: -44, texture: 'moss_stone', accent: 'sandstone' }),
  Object.freeze({ name: 'CLOUD TEMPLE OF THE VEIL', x: -84, z: 88, texture: 'summit_stone', accent: 'moss_stone' }),
  Object.freeze({ name: 'BAMBOO OSSUARY', x: 74, z: 96, texture: 'sandstone', accent: 'moss_stone' }),
]);

const wildsLayers = () => {
  const { river, mesa, bamboo, terrace, mire, grotto, lagoon, plunge } = WILDS;
  const layers = [];
  // 1. Water margins. The river's mud banks are painted wider than the channel
  // so the shoreline reads as silt rather than as a hard cut in the grass.
  layers.push(ribbon('root_mud', 34, river.map(point => [...point]), { repeat: [3, 30], color: 0x8a6a4c }));
  layers.push(ribbon('dirt', 21, river.map(point => [...point]), { repeat: [2, 26], color: 0xa78259, offset: .008 }));
  layers.push(ring('root_mud', [lagoon.x, lagoon.z], lagoon.radius - 4, lagoon.radius + 15, { repeat: [8, 8], color: 0x8f7052, offset: .006 }));
  layers.push(ring('summit_stone', [plunge.x, plunge.z], plunge.radius - 3, plunge.radius + 11, { repeat: [5, 5], color: 0x8f9a92, offset: .006 }));
  // 2. Landform floors: each elevation gets its own ground so the silhouette of
  // the map is legible from the air and from a rooftop alike.
  layers.push(patch('summit_stone', [mesa.x, mesa.z], mesa.core + 4, { repeat: [10, 10], seed: 301, color: 0x9aa294, irregularity: .07, offset: .012 }));
  layers.push(patch('jungle_floor', [mesa.x - 6, mesa.z + 8], 24, { repeat: [6, 6], seed: 302, color: 0x86a06c, offset: .02 }));
  layers.push(patch('jungle_floor', [bamboo.x, bamboo.z], bamboo.core + 12, { repeat: [8, 8], seed: 303, color: 0xa8bd7c, offset: .012 }));
  layers.push(patch('grass', [terrace.x, terrace.z], terrace.core + 10, { repeat: [7, 7], seed: 304, color: 0x84a165, offset: .012 }));
  layers.push(patch('root_mud', [mire.x, mire.z], mire.core + 16, { repeat: [9, 9], seed: 305, color: 0x76684f, irregularity: .2, offset: .012 }));
  layers.push(patch('root_mud', [grotto.x, grotto.z], grotto.core + 9, { repeat: [5, 5], seed: 306, color: 0x6f6448, offset: .012 }));
  // 3. The ceremonial causeways: four moss-stone roads radiating from the
  // ziggurat to the four temples, with a dirt game trail beside each.
  for (const [index, temple] of WILDS_TEMPLES.entries()) {
    const midX = temple.x * .55, midZ = temple.z * .55;
    layers.push(ribbon('moss_stone', 9, [[0, 0], [midX, midZ], [temple.x, temple.z]], { repeat: [2, 16], color: 0x9fa78c, offset: .03 + index * .001 }));
    layers.push(patch(temple.texture, [temple.x, temple.z], 21, { repeat: [5, 5], seed: 311 + index, color: 0xa9ac97, offset: .036 }));
    layers.push(ring(temple.accent, [temple.x, temple.z], 21, 27, { repeat: [5, 5], color: 0x93997f, offset: .034 }));
  }
  // 4. Hunting trails worn between the landmarks that matter. These are the
  // routes squads actually take, so they are painted last and sit on top.
  layers.push(ribbon('dirt', 6, [[-150, 30], [-104, 22], [-62, 20], [-24, 26], [8, 30], [46, 26], [96, 16], [148, 6]], { repeat: [1, 34], color: 0xa8804f, offset: .05 }));
  layers.push(ribbon('dirt', 5.5, [[-30, 158], [-18, 112], [-6, 62], [2, 20], [14, -34], [28, -92], [40, -150]], { repeat: [1, 32], color: 0xa8804f, offset: .052 }));
  layers.push(ribbon('dirt', 5, [[-158, -96], [-108, -78], [-58, -50], [-14, -18], [30, 16], [78, 52], [128, 96]], { repeat: [1, 34], color: 0x9d7a4e, offset: .054 }));
  // 5. The heart of the map: the ziggurat plaza and its idol ring.
  layers.push(patch('moss_stone', [0, 0], 26, { repeat: [6, 6], seed: 321, color: 0xa5ab8f, irregularity: .06, offset: .06 }));
  layers.push(ring('sandstone', [0, 0], 17, 22, { repeat: [5, 5], color: 0xbcae8b, offset: .066 }));
  layers.push(patch('summit_stone', [0, 0], 15, { repeat: [4, 4], seed: 322, color: 0xb3b3a4, irregularity: .03, offset: .07 }));
  return layers;
};

// ── CRATE EXPECTATIONS · the candyland landform ─────────────────────────────
// Built the same way the rainforest is: one authored height function
// (candyHeight) is the single source of truth for the terrain mesh, for
// collision, and for where src/game/maps/CrateExpectations.js is allowed to
// stand a lollipop, hang a rainbow bridge or pour a chocolate fall. Anything
// that has to meet the ground samples the same function, so nothing floats.
//
// The map is one enormous layer cake ringed by six confectionery districts:
//
//   MOUNT GUMDROP     four stacked tiers, 44 metres to the crown crate drop
//   THE SPIRAL        a candy road wrapping the cake, tier gap to tier gap
//   THE COCOA RUN     a chocolate river from the falls to the fizz lake
//   FLOSSWOOD         cotton-candy woods on the northern rise
//   PEPPERMINT MESA   a striped table west of the cake
//   GINGERBREAD ROW   a level biscuit plate in the south
//   JAWBREAKER BOWL   a scooped quarry full of giant rolling gumballs
//   MARSHMALLOW MIRE  soft low ground on the cocoa's south bank
//
// Every tier is a `table`, not a dome: inside its core the ground is exactly
// that height, which is what lets a cake tier carry a level road, a plaza and a
// row of candles that all have to meet it flush. The 3.6-metre skirts are
// vertical enough to read as cut sponge, but terrain steepness alone never
// stops anyone in this engine — CrateExpectations rings each tier with blocking
// frosting so the spiral road and the candy-cane stair are the only ways up.
export const CANDY = Object.freeze({
  syrupY: 2.6,             // chocolate river / fizz lake surface
  // The buttercream floor sits well clear of the syrup line. Basins are cut
  // down to an absolute bed, so if the floor rolled near the waterline the map
  // would grow accidental puddles wherever the noise happened to dip.
  floor: 8,
  // MOUNT GUMDROP, outermost tier first. Ordering matters: the tables are
  // applied outside-in so the inner plate always wins at the centre.
  tiers: Object.freeze([
    Object.freeze({ x: 0, z: 0, core: 84, skirt: 3.6, level: 12.5 }),
    Object.freeze({ x: 0, z: 0, core: 61, skirt: 3.6, level: 22 }),
    Object.freeze({ x: 0, z: 0, core: 40, skirt: 3.6, level: 33 }),
    Object.freeze({ x: 0, z: 0, core: 20, skirt: 3.4, level: 44 }),
  ]),
  // A shallow apron of icing spreading from the cake foot, so the mountain sits
  // in the landscape instead of being punched into it.
  mountApron: Object.freeze({ x: 0, z: 0, core: 88, skirt: 40, rise: 4 }),
  // Where the cocoa is born: the crag the fall pours off, and the pool below.
  fallCrag: Object.freeze({ x: -124, z: 92, core: 14, skirt: 12, level: 28 }),
  plunge: Object.freeze({ x: -108, z: 70, radius: 12, depth: 2.6 }),
  // THE COCOA RUN: plunge pool → a long arc around the cake's western and
  // southern flanks → the fizz lake. Held 100-odd metres out from the centre so
  // the cake's apron survives all the way round and the mountain stays
  // assailable from every bearing.
  river: Object.freeze([[-108, 70], [-114, 26], [-110, -20], [-88, -62], [-46, -96], [6, -116], [66, -112], [112, -96], [140, -78]]),
  riverHalf: 9,
  riverDepth: 2.4,
  lake: Object.freeze({ x: 140, z: -78, radius: 30, depth: 3.4 }),
  // The six outer districts, in rough order of how much they change a fight.
  flosswood: Object.freeze({ x: -70, z: 128, core: 26, skirt: 24, rise: 5 }),
  peppermint: Object.freeze({ x: -152, z: -34, core: 22, skirt: 12, level: 22 }),
  village: Object.freeze({ x: -16, z: -148, core: 24, skirt: 18, level: 9 }),
  quarry: Object.freeze({ x: 128, z: 96, core: 24, skirt: 20, drop: 4 }),
  mire: Object.freeze({ x: 50, z: -126, core: 20, skirt: 24, drop: 3 }),
  rimStart: 212,           // the wall of giant lollipops closing the horizon
  rimEnd: 246,
  rimRise: 11,
});

export const candyIsSyrup = (x, z) => {
  const C = CANDY;
  // The cake wins over everything: the apron is never syrup however close the
  // cocoa run swings past its foot.
  if (Math.hypot(x, z) < C.tiers[0].core + C.tiers[0].skirt) return false;
  if (Math.hypot(x - C.lake.x, z - C.lake.z) < C.lake.radius - 1.5) return true;
  if (Math.hypot(x - C.plunge.x, z - C.plunge.z) < C.plunge.radius - 1.5) return true;
  return distanceToPath(x, z, C.river) < C.riverHalf - 1.5;
};

// Order matters, and it is the whole design:
//   buttercream floor → rises → hollows → district tables → syrup → cake → rim
// The cocoa run is carved *before* the cake tables so the mountain stops the
// channel dead instead of the channel eating a slice out of the bottom tier.
export function candyHeight(x, z) {
  const C = CANDY;
  // Rolling buttercream: four incommensurate waves, so no ridge repeats inside
  // the play area and every clearing has a slightly different lie.
  let y = C.floor
    + Math.sin(x * .023 + .5) * Math.cos(z * .021 - .9) * 1.9
    + Math.sin(x * .049 - 1.7) * .8
    + Math.cos(z * .055 + .6) * .7
    + Math.sin((x + z) * .0125) * 1.2;
  y += dome(x, z, C.mountApron) + dome(x, z, C.flosswood);
  y -= basin(x, z, C.quarry) + basin(x, z, C.mire);
  y = table(x, z, C.peppermint, y);
  y = table(x, z, C.village, y);
  y = table(x, z, C.fallCrag, y);
  const carve = (bed, distance, inner, outer) => { const t = smoothstep(inner, outer, distance); if (t < 1) y = bed + (y - bed) * t; };
  carve(C.syrupY - C.lake.depth, Math.hypot(x - C.lake.x, z - C.lake.z), C.lake.radius, C.lake.radius + 18);
  carve(C.syrupY - C.plunge.depth, Math.hypot(x - C.plunge.x, z - C.plunge.z), C.plunge.radius, C.plunge.radius + 12);
  carve(C.syrupY - C.riverDepth, distanceToPath(x, z, C.river), C.riverHalf, C.riverHalf + 13);
  for (const tier of C.tiers) y = table(x, z, tier, y);
  // A ridge beyond the base ring so candyland closes rather than simply
  // stopping against the fog.
  y += C.rimRise * smoothstep(C.rimStart, C.rimEnd, Math.hypot(x, z));
  return Math.max(0, y);
}

// The named confectionery districts, used both by the surface painter here and
// by the builder in src/game/maps/CrateExpectations.js, so a district's plaza,
// its ground paint and its signposts can never disagree about where it is.
export const CANDY_DISTRICTS = Object.freeze([
  Object.freeze({ id: 'flosswood', name: 'FLOSSWOOD', x: -70, z: 128, texture: 'cotton_candy', accent: 'sprinkle_icing', tint: 0xffc4e6 }),
  Object.freeze({ id: 'peppermint', name: 'PEPPERMINT MESA', x: -152, z: -34, texture: 'peppermint', accent: 'candy_cane', tint: 0xffe6ea }),
  Object.freeze({ id: 'village', name: 'GINGERBREAD ROW', x: -16, z: -148, texture: 'gingerbread', accent: 'sprinkle_icing', tint: 0xd8a068 }),
  Object.freeze({ id: 'mire', name: 'MARSHMALLOW MIRE', x: 50, z: -126, texture: 'marshmallow', accent: 'jelly', tint: 0xffe8f0 }),
  Object.freeze({ id: 'lake', name: 'THE FIZZ LAKE', x: 140, z: -78, texture: 'soda_fizz', accent: 'caramel', tint: 0xffb964 }),
  Object.freeze({ id: 'quarry', name: 'JAWBREAKER BOWL', x: 128, z: 96, texture: 'jellybean', accent: 'gumdrop', tint: 0xd9a8ff }),
]);

const candyLayers = () => {
  const { river, lake, plunge, tiers, fallCrag } = CANDY;
  const layers = [];
  // 1. Syrup margins. The cocoa's caramel banks are painted wider than the
  // channel so the shoreline reads as spill rather than as a hard cut.
  layers.push(ribbon('caramel', 32, river.map(point => [...point]), { repeat: [3, 34], color: 0xcf9450 }));
  layers.push(ribbon('chocolate', 19, river.map(point => [...point]), { repeat: [2, 30], color: 0xb07a52, offset: .008 }));
  layers.push(ring('caramel', [lake.x, lake.z], lake.radius - 4, lake.radius + 16, { repeat: [8, 8], color: 0xe0a765, offset: .006 }));
  layers.push(ring('sprinkle_icing', [plunge.x, plunge.z], plunge.radius - 3, plunge.radius + 10, { repeat: [5, 5], color: 0xf6dcea, offset: .006 }));
  layers.push(patch('white_chocolate', [fallCrag.x, fallCrag.z], fallCrag.core + 6, { repeat: [6, 6], seed: 401, color: 0xf2e2c0, irregularity: .08, offset: .012 }));
  // 2. The cake, tier by tier. Each ring is a different bake, so the mountain's
  // silhouette is legible from the ground and from a rainbow bridge alike.
  const bakes = ['chocolate', 'wafer', 'frosting', 'sprinkle_icing'];
  const bakeTints = [0xb98a68, 0xe8c58f, 0xffd7ec, 0xfff2fb];
  tiers.forEach((tier, index) => {
    layers.push(ring(bakes[index], [0, 0], index === 0 ? 0 : tiers[index - 1].core - 2, tier.core + 1, {
      repeat: [Math.max(4, Math.round(tier.core / 7)), Math.max(4, Math.round(tier.core / 7))],
      color: bakeTints[index], offset: .014 + index * .004,
    }));
  });
  layers.push(patch('sprinkle_icing', [0, 0], 18, { repeat: [4, 4], seed: 402, color: 0xffffff, irregularity: .04, offset: .034 }));
  layers.push(ring('rainbow_road', [0, 0], 12.5, 15.5, { repeat: [1, 22], color: 0xffffff, offset: .04 }));
  // 3. District floors.
  for (const [index, district] of CANDY_DISTRICTS.entries()) {
    layers.push(patch(district.texture, [district.x, district.z], 27, { repeat: [6, 6], seed: 411 + index, color: district.tint, offset: .016 }));
    layers.push(ring(district.accent, [district.x, district.z], 27, 34, { repeat: [6, 6], color: district.tint, offset: .014 }));
  }
  // Rock candy really is crystallised sugar, so the quarry floor is the stone
  // tile in violent pink — the one place on the map where scree is edible.
  layers.push(ring('stone', [CANDY.quarry.x, CANDY.quarry.z], 11, 26, { repeat: [7, 7], color: 0xffa8e0, offset: .022 }));
  layers.push(patch('gumdrop', [CANDY.quarry.x, CANDY.quarry.z], 11, { repeat: [3, 3], seed: 419, color: 0xffd6f0, irregularity: .1, offset: .026 }));
  // 4. The candy road network: a sprinkle-icing ring road around the cake foot,
  // five spokes out to the team compounds, and a link into every district.
  const ringPoints = [];
  for (let i = 0; i <= 24; i++) { const angle = i / 24 * Math.PI * 2; ringPoints.push([Math.cos(angle) * 106, Math.sin(angle) * 106]); }
  layers.push(ribbon('sprinkle_icing', 13, ringPoints, { repeat: [1, 46], color: 0xfff4fb, offset: .05 }));
  layers.push(ribbon('rainbow_road', 3.4, ringPoints, { repeat: [1, 60], color: 0xffffff, offset: .058 }));
  for (let i = 0; i < 5; i++) {
    const angle = Math.PI / 2 + i / 5 * Math.PI * 2, cos = Math.cos(angle), sin = Math.sin(angle);
    layers.push(ribbon('sprinkle_icing', 11, [[cos * 100, sin * 100], [cos * 150, sin * 150], [cos * 188, sin * 188]], { repeat: [1, 18], color: 0xfff4fb, offset: .052 + i * .0005 }));
    layers.push(ribbon('candy_cane', 2.6, [[cos * 100, sin * 100], [cos * 150, sin * 150], [cos * 188, sin * 188]], { repeat: [1, 40], color: 0xffffff, offset: .06 + i * .0005 }));
  }
  for (const [index, district] of CANDY_DISTRICTS.entries()) {
    const reach = Math.hypot(district.x, district.z) || 1;
    layers.push(ribbon('waffle_cone', 9, [[district.x / reach * 104, district.z / reach * 104], [district.x * .85, district.z * .85], [district.x, district.z]], { repeat: [1, 16], color: 0xd9a05a, offset: .046 + index * .0005 }));
  }
  return layers;
};

// Surface art is intentionally separate from collision and height generation. These
// themes only paint the existing terrain, so map balance and navigation stay stable.
export const MAP_SURFACE_THEMES = Object.freeze({
  crossroads: Object.freeze({
    // The tarmac tile is almost black on its own (avg RGB 35,36,38), so the
    // carriageways are drawn untinted and the ground under everything else is a
    // lighter concrete: dark roads reading against pale pavement is the whole
    // silhouette of a city seen from above.
    base: { texture: 'concrete', repeat: [120, 120], color: 0x767b82, roughness: 1 },
    layers: bedlamLayers(),
  }),
  crown: Object.freeze({
    // Authored at 1:1 world scale (surfaceScale 1) against CANDY/candyHeight,
    // so every painted bank, road and plaza lands on the landform it describes
    // instead of on a tripled copy of a smaller sketch.
    base: { texture: 'frosting', repeat: [64, 64], color: 0xb6f0cf, roughness: .95 },
    layers: candyLayers(),
  }),
  wilds: Object.freeze({
    // Authored at 1:1 world scale (surfaceScale 1) against WILDS/wildsHeight,
    // so every painted bank, plaza and shoreline lands on the landform it
    // describes instead of on a tripled copy of a smaller sketch.
    base: { texture: 'jungle_floor', repeat: [70, 70], color: 0x7d9668, roughness: 1 },
    layers: wildsLayers(),
  }),
  rift: Object.freeze({
    base: { texture: 'dirt', repeat: [14, 14], color: 0x78625c, roughness: 1 },
    layers: [
      ...[-2.4, -.8, .8, 2.4].map((angle, i) => ribbon('volcanic_rock', 11, [[Math.cos(angle) * 76, Math.sin(angle) * 76], [Math.cos(angle) * 37, Math.sin(angle) * 37], [Math.cos(angle) * 24, Math.sin(angle) * 24]], { repeat: [1, 7], color: 0xb7a5a1, offset: i * .003 })),
      ring('volcanic_rock', [0, 0], 27, 39, { repeat: [5, 5], color: 0xb4a3a0 }),
      ring('lava_crust', [0, 0], 14, 26, { repeat: [4, 4], emissive: 0x5f1100, emissiveIntensity: .42, offset: .018 }),
      rect('metal', [0, -45], [26, 18], { repeat: [4, 3], color: 0x85878d, rotation: .08 }),
      rect('stone', [42, 28], [20, 16], { repeat: [3, 2], color: 0x8c8588, rotation: -.18 }),
    ],
  }),
  sunken: Object.freeze({
    base: { texture: 'grass', repeat: [20, 20], color: 0x71816b, roughness: 1 },
    layers: [
      ribbon('root_mud', 8, [[-82, 6], [-48, -4], [-18, 6], [12, -2], [48, 8], [82, -4]], { repeat: [1, 12], color: 0x8c735e }),
      ribbon('dirt', 5, [[-62, -55], [-42, -28], [0, 0], [42, 38], [67, 64]], { repeat: [1, 10], color: 0xa08261, offset: .012 }),
      ...[[0, 0, 18], [-48, -28, 10], [48, -28, 10], [-42, 38, 10], [42, 38, 10]].map(([x, z, r], i) => patch('moss_stone', [x, z], r, { repeat: [3, 3], seed: 51 + i, color: 0xb9b8a1 })),
      ...[[-24, 8, 10], [25, 5, 11], [0, -36, 9]].map(([x, z, r], i) => patch('water', [x, z], r, { repeat: [2, 2], seed: 61 + i, color: 0x69b8bc, transparent: true, opacity: .58, depthWrite: false, offset: .03 })),
    ],
  }),
  serpent: Object.freeze({
    base: { texture: 'grass', repeat: [20, 20], color: 0x69775d, roughness: 1 },
    layers: [
      ribbon('dirt', 7, [[-88, -24], [-67, -18], [-46, 25], [-22, -8], [0, 17], [25, -11], [49, 27], [76, -23], [90, -18]], { repeat: [1, 15], color: 0x937154 }),
      ribbon('summit_stone', 12, [[-82, -18], [-58, 2], [-32, 4], [0, 17], [28, 2], [56, 4], [82, -20]], { repeat: [1, 12], color: 0x9da09a, offset: .014 }),
      ...[[-70, -22], [-46, 28], [-22, -10], [0, 18], [25, -13], [49, 30], [72, -24]].map(([x, z], i) => patch('moss_stone', [x, z], 8.5, { repeat: [2, 2], seed: 71 + i, color: 0xaaa990, offset: .026 })),
      ...[[-30, 42, 10], [35, -42, 11]].map(([x, z, r], i) => patch('root_mud', [x, z], r, { repeat: [2, 2], seed: 81 + i, color: 0x92765b })),
    ],
  }),
  eclipse: Object.freeze({
    base: { texture: 'grass', repeat: [20, 20], color: 0x586752, roughness: 1 },
    layers: [
      ...[-2.5, -1.25, 0, 1.25, 2.5].map((angle, i) => ribbon('dirt', 6, [[Math.cos(angle) * 92, Math.sin(angle) * 92], [Math.cos(angle) * 53, Math.sin(angle) * 53], [0, 0]], { repeat: [1, 12], color: 0x80664f, offset: i * .002 })),
      ...[[0, -54], [52, -18], [32, 46], [-32, 46], [-52, -18]].map(([x, z], i) => patch('moss_stone', [x, z], 11, { repeat: [3, 3], seed: 91 + i, color: 0xa6a396 })),
      ring('root_mud', [0, 0], 18, 46, { repeat: [6, 6], color: 0x806b5c }),
      patch('marble', [0, 0], 17, { repeat: [4, 4], seed: 99, color: 0xb9aec7, offset: .018 }),
      ring('neon_concrete', [0, 0], 12.5, 15.5, { repeat: [3, 3], color: 0x745b8f, emissive: 0x29113f, emissiveIntensity: .25, offset: .032 }),
    ],
  }),
  bootcamp: Object.freeze({
    base: { texture: 'dirt', repeat: [10, 10], color: 0x827463, roughness: 1 },
    layers: [
      ribbon('corrugated_steel', 8, [[0, -58], [0, 58]], { repeat: [1, 9], color: 0x9aa0a0 }),
      rect('metal', [0, 31], [28, 20], { repeat: [4, 3], color: 0x878b8b }),
      rect('metal', [0, -31], [28, 20], { repeat: [4, 3], color: 0x878b8b }),
      ...[[-22, 2], [22, -3]].map(([x, z], i) => patch('grass', [x, z], 12, { repeat: [3, 3], seed: 111 + i, color: 0x78936a })),
    ],
  }),
  goldrush: Object.freeze({
    base: { texture: 'dirt', repeat: [15, 15], color: 0x8f7657, roughness: 1 },
    layers: [
      ribbon('summit_stone', 13, [[0, -102], [-14, -55], [8, -8], [-10, 42], [0, 102]], { repeat: [1, 13], color: 0xb0a289 }),
      ribbon('dirt', 8, [[-75, -70], [-42, -35], [-28, 10], [-64, 66]], { repeat: [1, 10], color: 0xa17d52 }),
      ribbon('dirt', 8, [[75, -70], [42, -35], [28, 10], [64, 66]], { repeat: [1, 10], color: 0xa17d52 }),
      patch('metal', [0, 79], 24, { repeat: [5, 5], seed: 121, color: 0x9c9b92 }),
      patch('neon_concrete', [0, -78], 20, { repeat: [4, 4], seed: 122, color: 0xb3ad95 }),
    ],
  }),
  'gaia-bastion': Object.freeze({
    base: { texture: 'grass', repeat: [18, 18], color: 0x718260, roughness: 1 },
    layers: [
      ribbon('asphalt', 12, [[0,-130],[0,-72],[-18,-30],[-18,0],[-6,48],[0,130]], { repeat:[1,15], color:0x9b9fa0 }),
      ribbon('road_lines', 2.2, [[0,-130],[0,-72],[-18,-30],[-18,0],[-6,48],[0,130]], { repeat:[1,14], offset:.025 }),
      ...[[-57,-28,26],[55,22,28],[-58,62,20],[61,-66,22]].map(([x,z,r],i)=>patch('dirt',[x,z],r,{repeat:[4,4],seed:141+i,color:0x956f4e})),
      rect('metal',[0,-101],[54,38],{repeat:[7,5],color:0x858b8c}),
      rect('neon_concrete',[0,101],[50,36],{repeat:[6,4],color:0xa9aa9e}),
    ],
  }),
  'storm-dam': Object.freeze({
    base: { texture: 'dirt', repeat:[18,18], color:0x596b66, roughness:1 },
    layers: [
      ribbon('asphalt',10,[[-80,115],[-52,62],[-18,20],[22,-20],[54,-64],[78,-116]],{repeat:[1,16],color:0x88969a}),
      ribbon('water',22,[[-132,5],[-70,2],[0,4],[70,1],[132,5]],{repeat:[12,2],color:0x55a8ba,transparent:true,opacity:.62,depthWrite:false,offset:.035}),
      rect('concrete',[0,4],[54,24],{repeat:[7,3],color:0x949c9d,offset:.05}),
      ...[[-55,-42],[0,-57],[55,-42]].map(([x,z],i)=>patch('neon_concrete',[x,z],11,{repeat:[3,3],seed:151+i,color:0x6e9ba5,emissive:0x073b51,emissiveIntensity:.3})),
    ],
  }),
  sunforge: Object.freeze({
    base: { texture:'dirt', repeat:[18,18], color:0x5f5553, roughness:1 },
    layers: [
      ...[-2.35,-.78,.78,2.35].map((angle,i)=>ribbon('metal',10,[[Math.cos(angle)*132,Math.sin(angle)*132],[Math.cos(angle)*62,Math.sin(angle)*62],[Math.cos(angle)*30,Math.sin(angle)*30]],{repeat:[1,13],color:0x828587,offset:i*.003})),
      ring('lava_crust',[0,0],29,51,{repeat:[7,7],emissive:0x651300,emissiveIntensity:.65}),
      ring('metal',[0,0],20,28,{repeat:[5,5],color:0x85878b,offset:.025}),
      patch('neon_concrete',[0,0],19,{repeat:[4,4],seed:161,color:0x787275,emissive:0x421006,emissiveIntensity:.25}),
      ...[[-82,44],[84,38],[-77,-55],[78,-60]].map(([x,z],i)=>patch('dirt',[x,z],13,{repeat:[3,3],seed:165+i,color:0x76594c})),
    ],
  }),
  'gaia-blacksite': Object.freeze({
    base: { texture:'gaia_blacksite_armor', repeat:[12,18], color:0x8a9298, roughness:.78, metalness:.52 },
    layers: [
      rect('gaia_blacksite_armor',[0,0],[42,286],{repeat:[3,22],color:0xb6bdc1,roughness:.62,metalness:.65,offset:.025}),
      rect('corrugated_steel',[-55,0],[58,258],{repeat:[5,20],color:0x78827f,offset:.03}),
      rect('corrugated_steel',[55,0],[58,258],{repeat:[5,20],color:0x78827f,offset:.03}),
      ...[-104,-52,0,52,104].map((z,i)=>rect(i%2?'neon_concrete':'gaia_blacksite_armor',[0,z],[154,22],{repeat:[12,2],color:i%2?0x66777d:0x8f989c,emissive:i%2?0x04262d:0x000000,emissiveIntensity:.28,offset:.04})),
    ],
  }),
});

export const surfaceTexturesForTheme = theme => [theme.base.texture, ...theme.layers.map(layer => layer.texture)];
