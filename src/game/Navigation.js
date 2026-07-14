import * as THREE from 'three';

// Clearance baked into the obstacle rasterization: the radius of a typical
// Destructo plus a small margin, so a path that clears the grid also clears
// the collision resolver for ordinary units. Larger bodies (cars, tanks)
// widen their queries with an extra cell ring at lookup time.
export const BASE_CLEARANCE = .78;
// Wading is allowed but slow (water halves movement), so water cells carry a
// traversal surcharge instead of being blocked — the AI prefers bridges yet
// never treats the river as an impassable wall.
const WATER_EXTRA_COST = 1.4;
// Rebuilds are throttled: structures rarely die in bursts, and a briefly
// stale grid only makes paths conservative, never wrong.
const REBUILD_COOLDOWN_MS = 1200;

const now = () => (globalThis.performance?.now?.() ?? Date.now());

// Binary min-heap keyed on an external score array.
class Heap {
  constructor(scores) { this.scores = scores; this.items = []; }
  get size() { return this.items.length; }
  push(i) { const a = this.items, s = this.scores; a.push(i); let c = a.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (s[a[p]] <= s[a[c]]) break; [a[p], a[c]] = [a[c], a[p]]; c = p; } }
  pop() { const a = this.items, s = this.scores, top = a[0], last = a.pop(); if (!a.length) return top; a[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < a.length && s[a[l]] < s[a[m]]) m = l; if (r < a.length && s[a[r]] < s[a[m]]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } return top; }
}

// A uniform walkability grid over the square play area with A* pathfinding,
// line-of-sight tests and throttled rebuilds when structures die. This is the
// global planner; per-frame whisker steering in World.navigationDirection
// remains the local avoidance layer for dynamic obstacles.
export class NavGrid {
  constructor(world, cellSize = 1.6) {
    this.world = world;
    this.cellSize = cellSize;
    this.origin = -world.bounds - cellSize;
    this.size = Math.max(8, Math.ceil((world.bounds * 2 + cellSize * 2) / cellSize) + 1);
    const cells = this.size * this.size;
    this.blocked = new Uint8Array(cells);
    this.cost = new Float32Array(cells);
    this.version = 0;
    this.dirty = true;
    this.lastRebuild = -Infinity;
    // A* scratch buffers, stamped so they never need clearing between runs
    this._g = new Float32Array(cells);
    this._f = new Float32Array(cells);
    this._from = new Int32Array(cells);
    this._seen = new Int32Array(cells);
    this._closed = new Int32Array(cells);
    this._stamp = 0;
  }
  index(cx, cz) { return cz * this.size + cx; }
  inBounds(cx, cz) { return cx >= 0 && cz >= 0 && cx < this.size && cz < this.size; }
  cellX(x) { return Math.round((x - this.origin) / this.cellSize); }
  cellZ(z) { return Math.round((z - this.origin) / this.cellSize); }
  centerX(cx) { return this.origin + cx * this.cellSize; }
  centerZ(cz) { return this.origin + cz * this.cellSize; }

  invalidate() { this.dirty = true; }
  ensureFresh() {
    if (!this.dirty) return;
    const time = now();
    if (this.version > 0 && time - this.lastRebuild < REBUILD_COOLDOWN_MS) return;
    this.rebuild(time);
  }
  rebuild(time = now()) {
    this.blocked.fill(0); this.cost.fill(0);
    const world = this.world;
    for (const collider of world.colliders || []) {
      if (!collider.enabled || !collider.blocking || collider.entity?.dead) continue;
      const frame = world.colliderFrame(collider);
      if (collider.shape === 'cylinder') this.rasterizeCircle(frame.position.x, frame.position.z, collider.radius);
      else this.rasterizeBox(frame.position.x, frame.position.z, frame.rotation, collider.halfX, collider.halfZ);
    }
    const circles = [...(world.destructibles || []), ...(world.interactiveStructures || []), ...Object.values(world.baseTurrets || {}), ...Object.values(world.factories || {})];
    for (const obstacle of circles) {
      if (!obstacle || obstacle.dead || obstacle.colliderHandles?.length) continue;
      this.rasterizeCircle(obstacle.group.position.x, obstacle.group.position.z, obstacle.radius || 1);
    }
    if (world.cavePosition) this.rasterizeCircle(world.cavePosition.x, world.cavePosition.z, 4.5);
    if (world.hasWater) {
      const probe = new THREE.Vector3();
      for (let cz = 0; cz < this.size; cz++) for (let cx = 0; cx < this.size; cx++) {
        probe.set(this.centerX(cx), 0, this.centerZ(cz));
        if (world.isWater(probe)) this.cost[this.index(cx, cz)] += WATER_EXTRA_COST;
      }
    }
    this.dirty = false; this.lastRebuild = time; this.version++;
  }
  rasterizeCircle(x, z, radius) {
    const r = radius + BASE_CLEARANCE, rSq = r * r;
    const minX = Math.max(0, this.cellX(x - r)), maxX = Math.min(this.size - 1, this.cellX(x + r));
    const minZ = Math.max(0, this.cellZ(z - r)), maxZ = Math.min(this.size - 1, this.cellZ(z + r));
    for (let cz = minZ; cz <= maxZ; cz++) for (let cx = minX; cx <= maxX; cx++) {
      const dx = this.centerX(cx) - x, dz = this.centerZ(cz) - z;
      if (dx * dx + dz * dz <= rSq) this.blocked[this.index(cx, cz)] = 1;
    }
  }
  rasterizeBox(x, z, rotation, halfX, halfZ) {
    const hx = halfX + BASE_CLEARANCE, hz = halfZ + BASE_CLEARANCE;
    const extent = Math.hypot(hx, hz);
    const minX = Math.max(0, this.cellX(x - extent)), maxX = Math.min(this.size - 1, this.cellX(x + extent));
    const minZ = Math.max(0, this.cellZ(z - extent)), maxZ = Math.min(this.size - 1, this.cellZ(z + extent));
    const cos = Math.cos(-rotation), sin = Math.sin(-rotation);
    for (let cz = minZ; cz <= maxZ; cz++) for (let cx = minX; cx <= maxX; cx++) {
      const dx = this.centerX(cx) - x, dz = this.centerZ(cz) - z;
      const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
      if (Math.abs(lx) <= hx && Math.abs(lz) <= hz) this.blocked[this.index(cx, cz)] = 1;
    }
  }

  // Is the world position blocked for a body of the given radius? Radii at or
  // under the baked clearance test a single cell; wider bodies test a ring.
  blockedAt(x, z, radius = BASE_CLEARANCE) {
    this.ensureFresh();
    const cx = this.cellX(x), cz = this.cellZ(z);
    if (!this.inBounds(cx, cz)) return true;
    const extra = Math.max(0, Math.ceil((radius - BASE_CLEARANCE) / this.cellSize));
    if (!extra) return Boolean(this.blocked[this.index(cx, cz)]);
    for (let dz = -extra; dz <= extra; dz++) for (let dx = -extra; dx <= extra; dx++) {
      const nx = cx + dx, nz = cz + dz;
      if (this.inBounds(nx, nz) && this.blocked[this.index(nx, nz)]) return true;
    }
    return false;
  }
  // Straight-line walkability between two points; `maxDistance` lets combat
  // code stop the test short of a structure that is itself rasterized.
  lineClear(from, to, radius = BASE_CLEARANCE, maxDistance = Infinity) {
    this.ensureFresh();
    const dx = to.x - from.x, dz = to.z - from.z;
    const length = Math.min(Math.hypot(dx, dz), maxDistance);
    if (length < 1e-4) return true;
    const steps = Math.max(1, Math.ceil(length / (this.cellSize * .5)));
    const inv = length / Math.hypot(dx, dz);
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * inv;
      if (this.blockedAt(from.x + dx * t, from.z + dz * t, radius)) return false;
    }
    return true;
  }
  nearestFreeCell(cx, cz, maxRing = 8) {
    if (this.inBounds(cx, cz) && !this.blocked[this.index(cx, cz)]) return { cx, cz };
    for (let ring = 1; ring <= maxRing; ring++) for (let dz = -ring; dz <= ring; dz++) for (let dx = -ring; dx <= ring; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
      const nx = cx + dx, nz = cz + dz;
      if (this.inBounds(nx, nz) && !this.blocked[this.index(nx, nz)]) return { cx: nx, cz: nz };
    }
    return null;
  }

  // A* over the grid (8-connected, no corner cutting) followed by string
  // pulling. Returns world waypoints, or null when no route is needed or
  // possible. When the goal is unreachable the best-effort prefix toward it
  // is returned instead of nothing — RTS units crowd the closest approach.
  findPath(from, to, radius = BASE_CLEARANCE, maxExpansions = 9000) {
    this.ensureFresh();
    const start = this.nearestFreeCell(this.cellX(from.x), this.cellZ(from.z));
    const goal = this.nearestFreeCell(this.cellX(to.x), this.cellZ(to.z));
    if (!start || !goal) return null;
    if (start.cx === goal.cx && start.cz === goal.cz) return [this.toWorld(goal.cx, goal.cz)];
    const stamp = ++this._stamp, g = this._g, f = this._f, seen = this._seen, closed = this._closed, from_ = this._from;
    const heap = new Heap(f);
    const startIdx = this.index(start.cx, start.cz), goalIdx = this.index(goal.cx, goal.cz);
    const heuristic = idx => {
      const dx = Math.abs((idx % this.size) - goal.cx), dz = Math.abs(((idx / this.size) | 0) - goal.cz);
      return (Math.max(dx, dz) + .41421 * Math.min(dx, dz)) * 1.001;
    };
    g[startIdx] = 0; f[startIdx] = heuristic(startIdx); from_[startIdx] = -1; seen[startIdx] = stamp;
    heap.push(startIdx);
    let best = startIdx, bestH = heuristic(startIdx), expansions = 0, found = false;
    while (heap.size) {
      const current = heap.pop();
      if (closed[current] === stamp) continue;
      closed[current] = stamp;
      if (current === goalIdx) { found = true; best = current; break; }
      if (++expansions > maxExpansions) break;
      const h = heuristic(current);
      if (h < bestH) { bestH = h; best = current; }
      const cx = current % this.size, cz = (current / this.size) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz;
        if (!this.inBounds(nx, nz)) continue;
        const neighbor = this.index(nx, nz);
        if (this.blocked[neighbor] || closed[neighbor] === stamp) continue;
        // diagonal moves require both orthogonal neighbors free (no corner cutting)
        if (dx && dz && (this.blocked[this.index(cx + dx, cz)] || this.blocked[this.index(cx, cz + dz)])) continue;
        const step = (dx && dz ? 1.41421 : 1) * (1 + this.cost[neighbor]);
        const tentative = g[current] + step;
        if (seen[neighbor] === stamp && tentative >= g[neighbor]) continue;
        seen[neighbor] = stamp; g[neighbor] = tentative; f[neighbor] = tentative + heuristic(neighbor); from_[neighbor] = current;
        heap.push(neighbor);
      }
    }
    const end = found ? goalIdx : best;
    if (end === startIdx) return null;
    const cells = [];
    for (let idx = end; idx !== -1; idx = from_[idx]) cells.push(idx);
    cells.reverse();
    return this.smooth(cells.map(idx => this.toWorld(idx % this.size, (idx / this.size) | 0)), from, radius);
  }
  toWorld(cx, cz) {
    const x = this.centerX(cx), z = this.centerZ(cz);
    return new THREE.Vector3(x, this.world.heightAt ? this.world.heightAt(x, z) : 0, z);
  }
  // String pulling: drop every waypoint that a straight clear line can skip.
  smooth(points, from, radius) {
    if (points.length <= 1) return points;
    const result = [];
    let anchor = from, i = 0;
    while (i < points.length - 1) {
      let furthest = i;
      for (let j = points.length - 1; j > i; j--) {
        if (this.lineClear(anchor, points[j], radius)) { furthest = j; break; }
      }
      if (furthest === i) { result.push(points[i]); anchor = points[i]; i++; }
      else { result.push(points[furthest]); anchor = points[furthest]; i = furthest + 1; }
    }
    if (result[result.length - 1] !== points[points.length - 1]) result.push(points[points.length - 1]);
    return result;
  }
}
