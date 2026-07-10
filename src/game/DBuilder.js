import * as THREE from 'three';
import { RECIPES } from '../data/gameData.js';

// Team Buddies style pad: 2x2 footprint, each column stacks up to 3 crates.
// Cell index = y*4 + z*2 + x. Columns: 0:(x0,z0) 1:(x1,z0) 2:(x0,z1) 3:(x1,z1)
export const PAD_COLUMNS = 4, PAD_HEIGHT = 3, PAD_CELLS = PAD_COLUMNS * PAD_HEIGHT;
const DIAGONALS = [[0, 3], [1, 2]];

export function columnHeights(occupancy) {
  const heights = [0, 0, 0, 0];
  for (let c = 0; c < PAD_COLUMNS; c++) for (let y = 0; y < PAD_HEIGHT; y++) if (occupancy[y * 4 + c]) heights[c] = y + 1;
  return heights;
}

// A combo is only valid when every used column has the same height (clean towers).
export function identifyCombo(occupancy) {
  const heights = columnHeights(occupancy), used = heights.map((h, c) => h ? c : -1).filter(c => c >= 0);
  if (!used.length) return null;
  // gravity check: no floating crates
  for (const c of used) for (let y = 0; y < heights[c]; y++) if (!occupancy[y * 4 + c]) return null;
  const h = heights[used[0]];
  if (!used.every(c => heights[c] === h)) return null;
  if (used.length === 2 && DIAGONALS.some(([a, b]) => used[0] === a && used[1] === b)) return null; // diagonal towers don't touch
  const key = `${used.length}x${h}`;
  const pattern = { '1x1': 'single', '2x1': 'duo-h', '1x2': 'duo-v', '1x3': 'trio-v', '4x1': 'quad-flat', '2x2': 'quad-towers', '2x3': 'towers-3', '4x2': 'octo', '4x3': 'full' }[key];
  return RECIPES.find(r => r.pattern === pattern) || null;
}

export class DBuilder {
  constructor(world, entityFactory, onBuild, team = 'blue', position = world.builderPositions?.[team] || world.builderPosition) {
    this.world = world; this.factory = entityFactory; this.onBuild = onBuild; this.team = team;
    this.pad = position.clone(); this.occupancy = Array(PAD_CELLS).fill(null);
  }
  heights() { return columnHeights(this.occupancy); }
  // drops the crate onto the column nearest to `from`, landing on top of its stack.
  // strategy 'towers' (used by AI) completes pairs so the stack always converges on a valid combo.
  place(crate, from = null, strategy = 'nearest') {
    const heights = this.heights(); let best = -1;
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
    if (best < 0) return false;
    const y = heights[best];
    this.occupancy[y * 4 + best] = crate;
    crate.placed = true; crate.solid = true; crate.carried = false; crate.group.visible = true;
    crate.group.position.copy(this.cellPosition(best, y)); crate.group.rotation.set(0, 0, 0);
    return true;
  }
  cellPosition(column, y) { const x = column % 2, z = Math.floor(column / 2); return new THREE.Vector3(this.pad.x + (x - .5) * 1.35, this.pad.y + .06 + y * 1.18, this.pad.z + (z - .5) * 1.35); }
  recipe() { return identifyCombo(this.occupancy); }
  crates() { return this.occupancy.filter(Boolean); }
  // quality tier of the current stack = average crate rarity, rounded
  tier() { const crates = this.crates(); return crates.length ? Math.round(crates.reduce((s, c) => s + (c.crateType?.tier || 0), 0) / crates.length) : 0; }
  count() { return this.crates().length; }
  manufacture() {
    const recipe = this.recipe(); if (!recipe) return null;
    if (this.onBuild(recipe, this.tier(), this) === false) return recipe;
    for (const c of this.crates()) { this.world.scene.remove(c.group); const i = this.world.crates.indexOf(c); if (i >= 0) this.world.crates.splice(i, 1); }
    this.occupancy.fill(null);
    return recipe;
  }
  values() { return this.occupancy.map(c => c ? (c.crateType?.id || 'brown') : null); }
  distanceTo(position) { return new THREE.Vector2(position.x - this.pad.x, position.z - this.pad.z).length(); }
}
