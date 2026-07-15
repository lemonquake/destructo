import * as THREE from 'three';
import { RECIPES, CRATE_TYPES, crateCombinationProfile } from '../data/gameData.js';

// Team Buddies style pad: 2x2 footprint, each column stacks up to 3 crates.
// Cell index = y*4 + z*2 + x. Columns: 0:(x0,z0) 1:(x1,z0) 2:(x0,z1) 3:(x1,z1)
export const PAD_COLUMNS = 4, PAD_HEIGHT = 3, PAD_CELLS = PAD_COLUMNS * PAD_HEIGHT;
const DIAGONALS = [[0, 3], [1, 2]];

export function columnHeights(occupancy) {
  const heights = [0, 0, 0, 0];
  for (let c = 0; c < PAD_COLUMNS; c++) for (let y = 0; y < PAD_HEIGHT; y++) if (occupancy[y * 4 + c]) heights[c] = y + 1;
  return heights;
}

// Identify crate stack patterns (columns of varying heights) matching dynamic recipes
export function identifyCombo(occupancy) {
  const heights = columnHeights(occupancy);
  const used = heights.map((h, c) => h ? c : -1).filter(c => c >= 0);
  if (!used.length) return null;

  // gravity check: no floating crates
  for (const c of used) {
    for (let y = 0; y < heights[c]; y++) {
      if (!occupancy[y * 4 + c]) return null;
    }
  }

  // Get active columns and their heights
  const activeColumns = used.map(c => ({ index: c, height: heights[c] }));
  // Sort descending by height
  const sorted = activeColumns.sort((a, b) => b.height - a.height);
  const sig = sorted.map(x => x.height);
  const sigStr = sig.join(',');

  let pattern = null;

  if (sigStr === '1') {
    pattern = 'single';
  } else if (sigStr === '2') {
    pattern = 'duo-v';
  } else if (sigStr === '3') {
    pattern = 'trio-v';
  } else if (sigStr === '1,1') {
    const [c1, c2] = [sorted[0].index, sorted[1].index].sort((a, b) => a - b);
    const adjacent = (c1 === 0 && c2 === 1) || (c1 === 2 && c2 === 3) || (c1 === 0 && c2 === 2) || (c1 === 1 && c2 === 3);
    pattern = adjacent ? 'duo-h' : 'duo-diag';
  } else if (sigStr === '2,1') {
    const [c1, c2] = [sorted[0].index, sorted[1].index].sort((a, b) => a - b);
    const adjacent = (c1 === 0 && c2 === 1) || (c1 === 2 && c2 === 3) || (c1 === 0 && c2 === 2) || (c1 === 1 && c2 === 3);
    pattern = adjacent ? 'step-adj' : 'step-diag';
  } else if (sigStr === '3,1') {
    const [c1, c2] = [sorted[0].index, sorted[1].index].sort((a, b) => a - b);
    const adjacent = (c1 === 0 && c2 === 1) || (c1 === 2 && c2 === 3) || (c1 === 0 && c2 === 2) || (c1 === 1 && c2 === 3);
    pattern = adjacent ? 'tall-step-adj' : 'tall-step-diag';
  } else if (sigStr === '1,1,1') {
    pattern = 'trio-flat';
  } else if (sigStr === '2,1,1') {
    pattern = 'pyramid';
  } else if (sigStr === '2,2') {
    const [c1, c2] = [sorted[0].index, sorted[1].index].sort((a, b) => a - b);
    const adjacent = (c1 === 0 && c2 === 1) || (c1 === 2 && c2 === 3) || (c1 === 0 && c2 === 2) || (c1 === 1 && c2 === 3);
    pattern = adjacent ? 'double-step-adj' : 'double-step-diag';
  } else if (sigStr === '1,1,1,1') {
    pattern = 'quad-flat';
  } else if (sigStr === '2,2,2') {
    pattern = 'special-destructo';
  } else if (sigStr === '3,3') {
    const [c1, c2] = [sorted[0].index, sorted[1].index].sort((a, b) => a - b);
    const adjacent = (c1 === 0 && c2 === 1) || (c1 === 2 && c2 === 3) || (c1 === 0 && c2 === 2) || (c1 === 1 && c2 === 3);
    pattern = adjacent ? 'twin-towers' : 'twin-towers-diag';
  } else if (sigStr === '3,1,1,1') {
    pattern = 'trident';
  } else if (sigStr === '2,2,2,2') {
    pattern = 'octo';
  } else if (sigStr === '3,3,3,3') {
    pattern = 'full';
  }

  if (!pattern) return null;
  return RECIPES.find(r => r.pattern === pattern) || null;
}

export class DBuilder {
  constructor(world, entityFactory, onBuild, team = 'blue', position = world.builderPositions?.[team] || world.builderPosition) {
    this.world = world; this.factory = entityFactory; this.onBuild = onBuild; this.team = team;
    this.pad = position.clone(); this.occupancy = Array(PAD_CELLS).fill(null);
  }
  heights() { return columnHeights(this.occupancy); }
  // drops the crate onto the column nearest to `from`, landing on top of its stack.
  // AI strategies deliberately converge on a requested recipe: flat for weapons,
  // towers for Destructos and eventually the complete tank cube.
  place(crate, from = null, strategy = 'nearest', targetCol = null) {
    if(crate?.noBuilder||crate?.questItem)return false;
    const heights = this.heights();
    let best = (targetCol !== null && targetCol >= 0 && targetCol < PAD_COLUMNS && heights[targetCol] < PAD_HEIGHT) ? targetCol : -1;
    if (best < 0) {
      if (strategy === 'flat') best = heights.findIndex(h => h === 0);
      if (strategy === 'towers') best = heights.findIndex(h => h === 1) >= 0 ? heights.findIndex(h => h === 1) : heights.findIndex(h => h === 0);
      if (best < 0) {
        let bestDist = Infinity;
        for (let c = 0; c < PAD_COLUMNS; c++) {
          if (heights[c] >= PAD_HEIGHT) continue;
          const pos = this.cellPosition(c, 0);
          const d = from ? new THREE.Vector2(from.x - pos.x, from.z - pos.z).lengthSq() : heights[c] * 10 + c;
          if (d < bestDist) { bestDist = d; best = c; }
        }
      }
    }
    if (best < 0) return false;
    const y = heights[best];
    this.occupancy[y * 4 + best] = crate;
    crate.placed = true; crate.solid = true; crate.carried = false; crate.group.visible = true;
    crate.group.position.copy(this.cellPosition(best, y)); crate.group.rotation.set(0, 0, 0); crate.visual?.rotation.set(0, 0, 0);
    crate.physicsActive = false; crate.velocity?.set(0, 0, 0); crate.angularVelocity?.set(0, 0, 0);
    this.syncDominantColor();
    return true;
  }
  cellPosition(column, y) { const x = column % 2, z = Math.floor(column / 2); return new THREE.Vector3(this.pad.x + (x - .5) * 1.35, this.pad.y + .06 + y * 1.18, this.pad.z + (z - .5) * 1.35); }
  recipe() { return identifyCombo(this.occupancy); }
  crates() { return this.occupancy.filter(Boolean); }
  sourceCrates() { return this.crates().map(c => ({ crateType: c.originalType || c.crateType })); }
  profile() { return crateCombinationProfile(this.sourceCrates()); }
  syncDominantColor() {
    const type = CRATE_TYPES[this.profile().dominant];
    for (const crate of this.crates()) this.factory.applyCrateType?.(crate, type);
  }
  // quality tier of the current stack = average crate rarity, rounded
  tier() { const crates = this.sourceCrates(); return crates.length ? Math.round(crates.reduce((s, c) => s + (c.crateType?.tier || 0), 0) / crates.length) : 0; }
  count() { return this.crates().length; }
  manufacture() {
    const recipe = this.recipe(); if (!recipe) return null;
    if (this.onBuild(recipe, this.tier(), this) === false) return recipe;
    for (const c of this.crates()) { this.world.scene.remove(c.group); const i = this.world.crates.indexOf(c); if (i >= 0) this.world.crates.splice(i, 1); }
    this.occupancy.fill(null);
    return recipe;
  }
  // Take the top crate back off the column nearest `from` — placed crates stay
  // retrievable right up until the moment they are combined into something.
  takeBack(from = null) {
    const heights = this.heights(); let best = -1, bestDist = Infinity;
    for (let c = 0; c < PAD_COLUMNS; c++) {
      if (!heights[c]) continue;
      const pos = this.cellPosition(c, 0);
      const d = from ? new THREE.Vector2(from.x - pos.x, from.z - pos.z).lengthSq() : -heights[c];
      if (d < bestDist) { bestDist = d; best = c; }
    }
    if (best < 0) return null;
    const y = heights[best] - 1, crate = this.occupancy[y * 4 + best];
    this.occupancy[y * 4 + best] = null;
    crate.placed = false; crate.solid = false;
    if (crate.originalType) this.factory.applyCrateType?.(crate, crate.originalType);
    this.syncDominantColor();
    return crate;
  }
  values() { return this.occupancy.map(c => c ? (c.crateType?.id || 'brown') : null); }
  distanceTo(position) { return new THREE.Vector2(position.x - this.pad.x, position.z - this.pad.z).length(); }
}
