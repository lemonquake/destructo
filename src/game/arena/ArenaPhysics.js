// Arcade vehicle physics for the Destruct-Auto arena.
//
// Pure number crunching on plain objects — no THREE, no scene graph — so the
// handling model can be tuned and tested independently of rendering.

import { STEP_HEIGHT } from './ArenaTerrain.js';

export const GRAVITY = 46;
export const VEHICLE_RADIUS = 2.9;
export const VEHICLE_HEIGHT = 3.2;
// Below this impact speed a scrape is free; above it, paint (and HP) comes off.
export const IMPACT_THRESHOLD = 16;
export const FALL_THRESHOLD = 42;

export function createVehicleState({ id, autoDef, team, spawn, isPlayer = false, name = '' }) {
  const s = autoDef.stats;
  return {
    id, autoId: autoDef.id, autoDef, team, isPlayer, name: name || autoDef.name,
    x: spawn.x, y: spawn.y ?? 0, z: spawn.z, yaw: spawn.yaw ?? 0,
    vx: 0, vy: 0, vz: 0, yawRate: 0, pitch: 0, roll: 0,
    hp: s.maxHp, maxHp: s.maxHp, dead: true, respawnTimer: 0,
    grounded: false, airborne: 0, wheelSpin: 0,
    fireCooldown: 0, ultimateCooldown: 0, ultimateReady: true, ultimateActive: null,
    // status effects applied by Ultimates
    slowTimer: 0, slowFactor: 1, stunTimer: 0, vulnerability: 1, burnTimer: 0, burnDps: 0, burnSource: null,
    spawnGrace: 0,   // brief invulnerability so a fresh chassis is not free frags
    dashTimer: 0, dashHits: null,
    kills: 0, deaths: 0, damageDealt: 0, shotsFired: 0, shotsHit: 0,
    lastAttacker: null, lastAttackerTime: -99,
    aimYaw: spawn.yaw ?? 0, aimPitch: 0,
  };
}

export const forwardOf = v => ({ x: Math.sin(v.yaw), z: Math.cos(v.yaw) });
export const rightOf = v => ({ x: Math.cos(v.yaw), z: -Math.sin(v.yaw) });
export const speedOf = v => Math.hypot(v.vx, v.vz);
export const forwardSpeedOf = v => { const f = forwardOf(v); return v.vx * f.x + v.vz * f.z; };

const decay = (rate, dt) => Math.pow(rate, dt);

// Advances one vehicle by `dt`. Returns a report of anything the caller needs to
// react to: wall impacts, hard landings, launch ramps and hazard damage.
export function stepVehicle(vehicle, input, terrain, dt) {
  const stats = vehicle.autoDef.stats;
  const report = { impact: 0, landed: 0, launched: null, hazardDps: 0, normal: null };
  if (vehicle.dead) return report;

  const stunned = vehicle.stunTimer > 0;
  const throttle = stunned ? 0 : Math.max(-1, Math.min(1, input.throttle || 0));
  const steer = stunned ? 0 : Math.max(-1, Math.min(1, input.steer || 0));
  const hover = stats.hover || 0;

  const f = forwardOf(vehicle), r = rightOf(vehicle);
  let forward = vehicle.vx * f.x + vehicle.vz * f.z;
  let lateral = vehicle.vx * r.x + vehicle.vz * r.z;

  const speedScale = vehicle.slowTimer > 0 ? vehicle.slowFactor : 1;
  const boosting = Boolean(input.boost) && !stunned && forward > 2;
  const topSpeed = stats.topSpeed * speedScale * (boosting ? stats.boost : 1);
  const grounded = vehicle.grounded || hover > 0;

  // Steering authority ramps in with speed so a parked car cannot pirouette,
  // and eases off at the top end so the fast chassis feel twitchy but committed.
  const speedFactor = Math.min(1, Math.abs(forward) / 9);
  const highSpeedTrim = 1 - Math.min(0.42, Math.abs(forward) / (stats.topSpeed * 2.6));
  const turnRate = stats.turn * speedFactor * highSpeedTrim * (grounded ? 1 : 0.45);
  vehicle.yawRate = steer * turnRate * Math.sign(forward >= -0.5 ? 1 : -1);
  vehicle.yaw += vehicle.yawRate * dt;

  if (grounded) {
    if (input.brake) forward *= decay(0.06, dt);
    else if (throttle !== 0) {
      const power = throttle > 0 ? stats.accel : stats.accel * 0.62;
      forward += throttle * power * dt;
    } else forward *= decay(0.55, dt);
    const reverseCap = topSpeed * 0.42;
    forward = Math.max(-reverseCap, Math.min(topSpeed, forward));
    // Lateral grip: hovercraft slide, half-tracks do not.
    lateral *= decay(Math.max(0.0005, 0.02 / Math.max(0.3, stats.grip)), dt);
    // Sliding scrubs a little forward speed, which is what makes drifting a choice.
    forward -= Math.min(Math.abs(forward), Math.abs(lateral) * 0.18 * dt * 6) * Math.sign(forward);
  } else {
    forward *= decay(0.92, dt);
    lateral *= decay(0.92, dt);
  }

  vehicle.vx = f.x * forward + r.x * lateral;
  vehicle.vz = f.z * forward + r.z * lateral;

  // ── vertical ──
  vehicle.vy -= GRAVITY * dt;
  vehicle.x += vehicle.vx * dt;
  vehicle.y += vehicle.vy * dt;
  vehicle.z += vehicle.vz * dt;

  const surface = terrain.surfaceAt(vehicle.x, vehicle.z, vehicle.y, STEP_HEIGHT);
  const restY = surface.height + hover;
  if (vehicle.y <= restY) {
    if (!vehicle.grounded && vehicle.vy < -FALL_THRESHOLD) report.landed = -vehicle.vy;
    vehicle.y = restY;
    if (hover > 0) vehicle.vy = Math.max(vehicle.vy, 0) * 0.2;
    else vehicle.vy = 0;
    vehicle.grounded = true;
    vehicle.airborne = 0;
    const launcher = terrain.launchAt(vehicle.x, vehicle.z, surface.height);
    if (launcher && forward > stats.topSpeed * 0.45) {
      vehicle.vy = launcher.launch;
      vehicle.grounded = false;
      report.launched = launcher;
    }
  } else {
    if (hover > 0 && vehicle.y < restY + 6) vehicle.vy += GRAVITY * 0.82 * dt; // soft hover cushion
    vehicle.grounded = false;
    vehicle.airborne += dt;
  }

  // ── lateral collision ──
  const solved = terrain.resolve(vehicle.x, vehicle.z, vehicle.y, VEHICLE_RADIUS, VEHICLE_HEIGHT);
  if (solved.hit) {
    const into = -(vehicle.vx * solved.nx + vehicle.vz * solved.nz);
    vehicle.x = solved.x; vehicle.z = solved.z;
    if (into > 0) {
      // Bleed the component heading into the wall, keep the tangential slide.
      vehicle.vx += solved.nx * into * 1.3;
      vehicle.vz += solved.nz * into * 1.3;
      if (into > IMPACT_THRESHOLD) { report.impact = into; report.normal = { x: solved.nx, z: solved.nz }; }
    }
  }

  const hazardHit = terrain.hazardAt(vehicle.x, vehicle.z, vehicle.y - surface.height);
  report.hazardDps = hazardHit.dps;

  // visual body attitude: lean into turns, nose up under power
  const targetRoll = -vehicle.yawRate * 0.22 * Math.min(1, Math.abs(forward) / 14);
  vehicle.roll += (targetRoll - vehicle.roll) * Math.min(1, dt * 8);
  const targetPitch = vehicle.grounded ? -throttle * 0.05 : Math.max(-0.35, Math.min(0.35, -vehicle.vy / 90));
  vehicle.pitch += (targetPitch - vehicle.pitch) * Math.min(1, dt * 6);
  vehicle.wheelSpin += forward * dt * 1.6;

  // ── status timers ──
  if (vehicle.spawnGrace > 0) vehicle.spawnGrace -= dt;
  if (vehicle.slowTimer > 0) { vehicle.slowTimer -= dt; if (vehicle.slowTimer <= 0) { vehicle.slowFactor = 1; vehicle.vulnerability = 1; } }
  if (vehicle.stunTimer > 0) vehicle.stunTimer -= dt;
  if (vehicle.fireCooldown > 0) vehicle.fireCooldown -= dt;
  if (vehicle.ultimateCooldown > 0) {
    vehicle.ultimateCooldown -= dt;
    if (vehicle.ultimateCooldown <= 0) { vehicle.ultimateCooldown = 0; vehicle.ultimateReady = true; }
  }
  return report;
}

// Two-body resolution. The heavier chassis wins the exchange: it is pushed less
// and deals more ramming damage, which is the whole reason weight is a stat.
export function collideVehicles(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  const minDist = VEHICLE_RADIUS * 2;
  if (dist >= minDist || Math.abs(a.y - b.y) > VEHICLE_HEIGHT) return null;
  const nx = dist > 0.001 ? dx / dist : 1, nz = dist > 0.001 ? dz / dist : 0;
  const overlap = minDist - dist;
  const wa = a.autoDef.stats.weight, wb = b.autoDef.stats.weight;
  const total = wa + wb;
  a.x -= nx * overlap * (wb / total); a.z -= nz * overlap * (wb / total);
  b.x += nx * overlap * (wa / total); b.z += nz * overlap * (wa / total);

  const relative = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz; // closing speed
  if (relative <= 0) return null;
  const impulse = relative * 1.35;
  a.vx -= nx * impulse * (wb / total); a.vz -= nz * impulse * (wb / total);
  b.vx += nx * impulse * (wa / total); b.vz += nz * impulse * (wa / total);

  if (relative < IMPACT_THRESHOLD) return null;
  // Damage scales with closing speed and the mass ratio; the light car eats it.
  const base = (relative - IMPACT_THRESHOLD) * 1.15;
  return {
    aDamage: base * (wb / wa) * 0.5,
    bDamage: base * (wa / wb) * 0.5,
    speed: relative,
    point: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 1.4, z: (a.z + b.z) / 2 },
  };
}
