// Collision + surface queries for a Destruct-Auto arena.
//
// Deliberately free of THREE and of the renderer: the arena is described by
// plain geometry records (see src/data/arenaMaps.js) so driving, AI pathing and
// projectile flight can all be unit-tested without a canvas.

const DEG = Math.PI / 180;

// How far above a surface a vehicle may be and still be considered "standing on
// it" — also the height of the lip a vehicle can climb without a ramp.
export const STEP_HEIGHT = 2.4;

export function rampHeightAt(piece, x, z) {
  const halfW = piece.w / 2, halfD = piece.d / 2;
  let t;
  switch (((piece.dir % 360) + 360) % 360) {
    case 0: t = (z - (piece.z - halfD)) / piece.d; break;
    case 180: t = ((piece.z + halfD) - z) / piece.d; break;
    case 90: t = (x - (piece.x - halfW)) / piece.w; break;
    default: t = ((piece.x + halfW) - x) / piece.w; break;
  }
  return piece.base + piece.rise * Math.max(0, Math.min(1, t));
}

// Uphill direction of a ramp as a unit vector in XZ.
export function rampGradient(piece) {
  const a = (((piece.dir % 360) + 360) % 360) * DEG;
  return { x: Math.sin(a), z: Math.cos(a) };
}

function containsXZ(piece, x, z, pad = 0) {
  if (piece.t === 'pillar') {
    const dx = x - piece.x, dz = z - piece.z, r = piece.r + pad;
    return dx * dx + dz * dz <= r * r;
  }
  if (piece.t === 'hazard') {
    const dx = x - piece.x, dz = z - piece.z, r = piece.r + pad;
    return dx * dx + dz * dz <= r * r;
  }
  return Math.abs(x - piece.x) <= piece.w / 2 + pad && Math.abs(z - piece.z) <= piece.d / 2 + pad;
}

export class ArenaTerrain {
  constructor(mapDef) {
    this.map = mapDef;
    this.bounds = mapDef.bounds;
    // Matches own mutable copies so destructible geometry never mutates the
    // frozen map definition or leaks damage into a rematch.
    this.pieces = mapDef.pieces.map(piece => ({ ...piece }));
    this._rebuild();
  }
  _rebuild() {
    this.surfaces = this.pieces.filter(p => p.t === 'box' || p.t === 'ramp' || (p.t === 'pillar' && p.climbable !== false));
    this.blockers = this.pieces.filter(p => (p.t === 'box' || p.t === 'wall' || p.t === 'pillar'));
    this.hazards = this.pieces.filter(p => p.t === 'hazard');
    this.launchers = this.pieces.filter(p => p.t === 'ramp' && p.launch > 0);
    // Uniform grid so a per-frame query touches a handful of pieces, not all of them.
    this.cell = 24;
    this.grid = new Map();
    for (const piece of this.pieces) this._index(piece);
  }
  removePiece(piece) {
    const index = this.pieces.indexOf(piece);
    if (index < 0) return false;
    this.pieces.splice(index, 1);
    this._rebuild();
    return true;
  }
  _key(cx, cz) { return `${cx},${cz}`; }
  _index(piece) {
    const r = piece.t === 'pillar' || piece.t === 'hazard' ? piece.r : Math.max(piece.w, piece.d) / 2;
    const minX = Math.floor((piece.x - r) / this.cell), maxX = Math.floor((piece.x + r) / this.cell);
    const minZ = Math.floor((piece.z - r) / this.cell), maxZ = Math.floor((piece.z + r) / this.cell);
    for (let cx = minX; cx <= maxX; cx++) for (let cz = minZ; cz <= maxZ; cz++) {
      const key = this._key(cx, cz);
      let bucket = this.grid.get(key);
      if (!bucket) { bucket = []; this.grid.set(key, bucket); }
      bucket.push(piece);
    }
  }
  near(x, z, radius = 0) {
    const minX = Math.floor((x - radius) / this.cell), maxX = Math.floor((x + radius) / this.cell);
    const minZ = Math.floor((z - radius) / this.cell), maxZ = Math.floor((z + radius) / this.cell);
    const out = new Set();
    for (let cx = minX; cx <= maxX; cx++) for (let cz = minZ; cz <= maxZ; cz++) {
      const bucket = this.grid.get(this._key(cx, cz));
      if (bucket) for (const piece of bucket) out.add(piece);
    }
    return out;
  }
  topOf(piece, x, z) {
    if (piece.t === 'ramp') return rampHeightAt(piece, x, z);
    if (piece.climbable === false) return -Infinity;
    return piece.base + piece.h;
  }
  // Highest drivable surface at (x,z) that the vehicle at height `y` could be
  // resting on. `y` guards against snapping up onto an overpass you are under.
  surfaceAt(x, z, y = Infinity, step = STEP_HEIGHT) {
    let best = 0, piece = null;
    const ceiling = y + step;
    for (const candidate of this.near(x, z, 1)) {
      if (candidate.t !== 'box' && candidate.t !== 'ramp' && candidate.t !== 'pillar') continue;
      if (candidate.climbable === false) continue;
      if (!containsXZ(candidate, x, z)) continue;
      const top = this.topOf(candidate, x, z);
      if (top > ceiling || top < best) continue;
      best = top; piece = candidate;
    }
    return { height: best, piece };
  }
  // Convenience for particle systems and other height-only consumers.
  groundAt(x, z) { return this.surfaceAt(x, z, Infinity).height; }
  launchAt(x, z, y) {
    for (const piece of this.near(x, z, 1)) {
      if (!piece.launch || piece.t !== 'ramp') continue;
      if (!containsXZ(piece, x, z)) continue;
      if (Math.abs(rampHeightAt(piece, x, z) - y) < 2.6) return piece;
    }
    return null;
  }
  hazardAt(x, z, y) {
    let dps = 0, source = null;
    for (const piece of this.near(x, z, 1)) {
      if (piece.t !== 'hazard' || !containsXZ(piece, x, z)) continue;
      if (y > 4.5) continue; // hazards only bite at floor level
      if (piece.dps > dps) { dps = piece.dps; source = piece; }
    }
    return { dps, source };
  }
  // Push a circle of `radius` out of every solid piece it overlaps. Returns the
  // corrected position plus the impact normal and how hard the hit was.
  resolve(x, z, y, radius, height = 3) {
    let nx = 0, nz = 0, hit = false, depth = 0;
    const top = y + height;
    for (const piece of this.near(x, z, radius + 2)) {
      if (piece.t !== 'box' && piece.t !== 'wall' && piece.t !== 'pillar') continue;
      const pieceTop = piece.base + piece.h;
      if (piece.climbable !== false && top >= pieceTop - 0.35) continue; // driving over it
      if (piece.base >= top || pieceTop <= y + 0.15) continue;           // above or below us
      if (piece.t === 'pillar') {
        const dx = x - piece.x, dz = z - piece.z, dist = Math.hypot(dx, dz) || 0.0001;
        const overlap = piece.r + radius - dist;
        if (overlap <= 0) continue;
        x += (dx / dist) * overlap; z += (dz / dist) * overlap;
        nx += dx / dist; nz += dz / dist; hit = true; depth = Math.max(depth, overlap);
        continue;
      }
      const halfW = piece.w / 2 + radius, halfD = piece.d / 2 + radius;
      const dx = x - piece.x, dz = z - piece.z;
      const overlapX = halfW - Math.abs(dx), overlapZ = halfD - Math.abs(dz);
      if (overlapX <= 0 || overlapZ <= 0) continue;
      hit = true;
      if (overlapX < overlapZ) { x += Math.sign(dx || 1) * overlapX; nx += Math.sign(dx || 1); depth = Math.max(depth, overlapX); }
      else { z += Math.sign(dz || 1) * overlapZ; nz += Math.sign(dz || 1); depth = Math.max(depth, overlapZ); }
    }
    // arena boundary
    const limit = this.bounds - radius;
    if (x > limit) { x = limit; nx -= 1; hit = true; }
    if (x < -limit) { x = -limit; nx += 1; hit = true; }
    if (z > limit) { z = limit; nz -= 1; hit = true; }
    if (z < -limit) { z = -limit; nz += 1; hit = true; }
    const len = Math.hypot(nx, nz);
    if (len > 0) { nx /= len; nz /= len; }
    return { x, z, hit, nx, nz, depth };
  }
  // Does a point sit inside a solid volume? Used by projectiles and LOS checks.
  solidPieceAt(x, z, y) {
    if (Math.abs(x) > this.bounds || Math.abs(z) > this.bounds) return null;
    for (const piece of this.near(x, z, 0.5)) {
      if (piece.t === 'hazard') continue;
      if (piece.t === 'ramp') {
        if (containsXZ(piece, x, z) && y < rampHeightAt(piece, x, z) - 0.2) return piece;
        continue;
      }
      if (piece.t !== 'box' && piece.t !== 'wall' && piece.t !== 'pillar') continue;
      if (!containsXZ(piece, x, z)) continue;
      if (y > piece.base && y < piece.base + piece.h) return piece;
    }
    return null;
  }
  solidAt(x, z, y) {
    if (Math.abs(x) > this.bounds || Math.abs(z) > this.bounds) return true;
    return Boolean(this.solidPieceAt(x, z, y));
  }
  // Cheap sampled line of sight — good enough to stop the AI shooting concrete.
  hasLineOfSight(ax, ay, az, bx, by, bz, samples = 12) {
    for (let i = 1; i < samples; i++) {
      const t = i / samples;
      if (this.solidAt(ax + (bx - ax) * t, az + (bz - az) * t, ay + (by - ay) * t)) return false;
    }
    return true;
  }
  // First solid contact along a segment, or null. Returns the hit point.
  raycast(ax, ay, az, bx, by, bz, samples = 24) {
    let px = ax, py = ay, pz = az;
    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
      const piece = this.solidPieceAt(x, z, y);
      if (piece || Math.abs(x) > this.bounds || Math.abs(z) > this.bounds) {
        return { x: px, y: py, z: pz, t: (i - 1) / samples, piece };
      }
      const surface = this.surfaceAt(x, z, y + 1.5, 1.5);
      if (y <= surface.height) return { x, y: surface.height, z, t };
      px = x; py = y; pz = z;
    }
    return null;
  }
}
