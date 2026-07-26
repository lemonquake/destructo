// Destruct-Auto AI drivers.
//
// One brain per CPU vehicle. It knows its crew, it knows the hostiles, it
// drives, it aims independently of the chassis heading, it avoids walls and
// lava, and it spends its Ultimate when the Ultimate is actually worth
// spending. Returns the same input record the player produces, so the physics
// and combat code cannot tell a human from a CPU.

import { ULTIMATE_KINDS } from '../../data/destructAutos.js';
import { speedOf } from './ArenaPhysics.js';

// How far out each role wants to sit from whatever it is shooting at.
const ENGAGE_RANGE = { BRAWLER: 10, JUGGERNAUT: 14, SPEEDSTER: 22, SKIRMISHER: 34, CONTROLLER: 40, SUPPORT: 52 };

const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const yawTo = (fromX, fromZ, toX, toZ) => Math.atan2(toX - fromX, toZ - fromZ);

export class ArenaAI {
  constructor({ terrain, difficulty, random = Math.random }) {
    this.terrain = terrain;
    this.difficulty = difficulty;
    this.random = random;
    this.memory = new Map();
  }
  setDifficulty(difficulty) { this.difficulty = difficulty; }
  forget(id) { this.memory.delete(id); }
  brain(vehicle) {
    let brain = this.memory.get(vehicle.id);
    if (!brain) {
      brain = {
        targetId: null, retarget: 0, mode: 'hunt', stuck: 0, unstuck: 0,
        wander: { x: (this.random() - 0.5) * 140, z: (this.random() - 0.5) * 140 }, wanderTimer: 0,
        strafe: this.random() < 0.5 ? 1 : -1, strafeTimer: 0, aimJitter: 0, jitterTimer: 0,
      };
      this.memory.set(vehicle.id, brain);
    }
    return brain;
  }

  // ── target selection ──────────────────────────────────────────────────────
  pickTarget(vehicle, enemies) {
    let best = null, bestScore = -Infinity;
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      const dist = Math.hypot(enemy.x - vehicle.x, enemy.z - vehicle.z);
      const visible = this.terrain.hasLineOfSight(vehicle.x, vehicle.y + 1.6, vehicle.z, enemy.x, enemy.y + 1.6, enemy.z, 8);
      // closer is better, wounded is much better, and out of sight is a big penalty
      let score = 260 - dist * 1.5;
      score += (1 - enemy.hp / enemy.maxHp) * 90;
      if (!visible) score -= 110;
      if (enemy.id === vehicle.lastAttacker) score += 45;
      if (enemy.isPlayer) score += 18 * this.difficulty.aggression;
      if (score > bestScore) { bestScore = score; best = enemy; }
    }
    return best;
  }

  // ── steering helpers ──────────────────────────────────────────────────────
  // Probes a short arc in front of the car and returns a steering correction in
  // [-1, 1]; 0 means the lane ahead is clear.
  avoidance(vehicle) {
    const speed = speedOf(vehicle);
    const look = 9 + speed * 0.75;
    let correction = 0, blockedAhead = false;
    for (const [offset, weight] of [[0, 1], [0.42, 0.7], [-0.42, 0.7], [0.85, 0.4], [-0.85, 0.4]]) {
      const angle = vehicle.yaw + offset;
      const px = vehicle.x + Math.sin(angle) * look, pz = vehicle.z + Math.cos(angle) * look;
      const solid = this.terrain.solidAt(px, pz, vehicle.y + 1.2);
      const surface = this.terrain.surfaceAt(px, pz, vehicle.y + 2.4);
      const cliff = surface.height < vehicle.y - 14;
      const hazard = this.terrain.hazardAt(px, pz, 0).dps > 0;
      if (!solid && !cliff && !hazard) continue;
      if (Math.abs(offset) < 0.1) blockedAhead = true;
      correction -= Math.sign(offset || (this.brain(vehicle).strafe)) * weight;
    }
    return { correction: Math.max(-1, Math.min(1, correction)), blockedAhead };
  }
  driveToward(vehicle, targetX, targetZ, dt, options = {}) {
    const brain = this.brain(vehicle);
    const desiredYaw = yawTo(vehicle.x, vehicle.z, targetX, targetZ);
    let steer = Math.max(-1, Math.min(1, angleDelta(desiredYaw, vehicle.yaw) * 1.6));
    const { correction, blockedAhead } = this.avoidance(vehicle);
    if (correction !== 0) steer = Math.max(-1, Math.min(1, steer * 0.35 + correction));
    const misalignment = Math.abs(angleDelta(desiredYaw, vehicle.yaw));
    const dist = Math.hypot(targetX - vehicle.x, targetZ - vehicle.z);

    // Wedged against geometry: back out for a moment instead of grinding.
    const speed = speedOf(vehicle);
    if (speed < 2.4 && !vehicle.dead && vehicle.stunTimer <= 0) brain.stuck += dt; else brain.stuck = 0;
    if (brain.stuck > 1.1) { brain.unstuck = 0.9; brain.stuck = 0; brain.strafe *= -1; }
    if (brain.unstuck > 0) {
      brain.unstuck -= dt;
      return { throttle: -1, steer: brain.strafe, brake: false, boost: false };
    }

    let throttle = this.difficulty.throttle;
    if (misalignment > 2.2 && speed > 6) throttle = -0.5;                 // three-point turn
    else if (misalignment > 1.0) throttle *= 0.5;
    if (options.reverse) throttle = -this.difficulty.throttle * 0.8;
    const boost = !blockedAhead && misalignment < 0.35 && dist > 45 && vehicle.grounded;
    return { throttle, steer, brake: options.brake === true, boost };
  }

  // ── ultimates ─────────────────────────────────────────────────────────────
  shouldUseUltimate(vehicle, target, enemies, distance) {
    const ult = vehicle.autoDef.ultimate;
    const bias = this.difficulty.ultimateBias;
    const nearby = radius => enemies.filter(e => !e.dead && Math.hypot(e.x - vehicle.x, e.z - vehicle.z) < radius).length;
    switch (ult.kind) {
      case ULTIMATE_KINDS.SHOCKWAVE: return nearby(ult.radius * 0.62) >= 1 && vehicle.grounded;
      case ULTIMATE_KINDS.DASH: {
        if (!target) return false;
        const desired = yawTo(vehicle.x, vehicle.z, target.x, target.z);
        return distance < ult.speed * ult.duration * 0.75 && Math.abs(angleDelta(desired, vehicle.yaw)) < 0.3 * bias + 0.12;
      }
      case ULTIMATE_KINDS.MISSILES: return Boolean(target) && distance < 105;
      case ULTIMATE_KINDS.MINES: return Boolean(target) && (distance < 34 || vehicle.hp < vehicle.maxHp * 0.4);
      case ULTIMATE_KINDS.CHAIN: return Boolean(target) && distance < ult.range * 0.9;
      case ULTIMATE_KINDS.FLAK: return nearby(ult.range * 0.55) >= 1;
      case ULTIMATE_KINDS.FIELD: return nearby(ult.radius * 0.7) >= 1;
      case ULTIMATE_KINDS.TRAIL: return Boolean(target) && distance < 46;
      case ULTIMATE_KINDS.AIRSTRIKE: return Boolean(target) && distance < ult.markRange * 0.9 && distance > 16;
      case ULTIMATE_KINDS.MORTAR: return Boolean(target) && distance > 20 && distance < ult.range * 0.9;
      default: return false;
    }
  }
  ultimateAimPoint(vehicle, target) {
    if (!target) return null;
    // Lead the shot: mortars and airstrikes are slow enough to dodge otherwise.
    const lead = vehicle.autoDef.ultimate.kind === ULTIMATE_KINDS.AIRSTRIKE ? vehicle.autoDef.ultimate.delay : vehicle.autoDef.ultimate.travel || 1;
    const x = target.x + target.vx * lead * 0.7, z = target.z + target.vz * lead * 0.7;
    return { x, y: this.terrain.surfaceAt(x, z, target.y + 6).height, z };
  }

  // ── aiming ────────────────────────────────────────────────────────────────
  aimAt(vehicle, target, brain, dt) {
    const gun = vehicle.autoDef.smg;
    const dx = target.x - vehicle.x, dz = target.z - vehicle.z;
    const flat = Math.hypot(dx, dz);
    const travel = flat / gun.bulletSpeed;
    brain.jitterTimer -= dt;
    if (brain.jitterTimer <= 0) {
      brain.jitterTimer = 0.25 + this.random() * 0.35;
      brain.aimJitter = (this.random() - 0.5) * this.difficulty.aim * 2;
    }
    const px = target.x + target.vx * travel, pz = target.z + target.vz * travel;
    const py = target.y + 1.5 + target.vy * travel;
    const ax = px - vehicle.x, az = pz - vehicle.z, ay = py - (vehicle.y + 1.9);
    const yaw = Math.atan2(ax, az) + brain.aimJitter;
    const horizontal = Math.hypot(ax, az) || 1;
    const pitch = Math.atan2(ay + horizontal * 0.02, horizontal) + brain.aimJitter * 0.5;
    return { yaw, pitch };
  }

  // ── main entry ────────────────────────────────────────────────────────────
  think(vehicle, { allies = [], enemies = [], dt = 0.016 }) {
    const brain = this.brain(vehicle);
    const input = { throttle: 0, steer: 0, brake: false, boost: false, fire: false, ultimate: false, aimYaw: vehicle.aimYaw, aimPitch: 0, aimPoint: null };
    if (vehicle.dead) return input;

    brain.retarget -= dt;
    let target = enemies.find(e => e.id === brain.targetId && !e.dead);
    if (!target || brain.retarget <= 0) {
      target = this.pickTarget(vehicle, enemies);
      brain.targetId = target?.id ?? null;
      brain.retarget = this.difficulty.reaction + this.random() * 0.6;
    }

    const lowHealth = vehicle.hp < vehicle.maxHp * 0.24;
    const outnumbered = enemies.filter(e => !e.dead && Math.hypot(e.x - vehicle.x, e.z - vehicle.z) < 40).length > allies.filter(a => !a.dead && Math.hypot(a.x - vehicle.x, a.z - vehicle.z) < 40).length + 1;
    brain.mode = !target ? 'hunt' : (lowHealth && outnumbered) ? 'retreat' : 'engage';

    if (brain.mode === 'hunt') {
      brain.wanderTimer -= dt;
      if (brain.wanderTimer <= 0 || Math.hypot(brain.wander.x - vehicle.x, brain.wander.z - vehicle.z) < 14) {
        brain.wanderTimer = 4 + this.random() * 4;
        const spread = this.terrain.bounds * 0.78;
        brain.wander = { x: (this.random() - 0.5) * 2 * spread, z: (this.random() - 0.5) * 2 * spread };
      }
      Object.assign(input, this.driveToward(vehicle, brain.wander.x, brain.wander.z, dt));
      return input;
    }

    const distance = Math.hypot(target.x - vehicle.x, target.z - vehicle.z);

    if (brain.mode === 'retreat') {
      // Break contact away from the threat, still shooting over the shoulder.
      const away = { x: vehicle.x + (vehicle.x - target.x), z: vehicle.z + (vehicle.z - target.z) };
      Object.assign(input, this.driveToward(vehicle, away.x, away.z, dt));
      input.boost = vehicle.grounded;
    } else {
      const preferred = ENGAGE_RANGE[vehicle.autoDef.role] ?? 26;
      brain.strafeTimer -= dt;
      if (brain.strafeTimer <= 0) { brain.strafeTimer = 1.6 + this.random() * 2.4; brain.strafe *= -1; }
      let aimX = target.x, aimZ = target.z;
      if (distance < preferred * 0.7) {
        // too close for this chassis — peel off at a tangent instead of reversing
        const side = yawTo(vehicle.x, vehicle.z, target.x, target.z) + Math.PI / 2 * brain.strafe;
        aimX = vehicle.x + Math.sin(side) * 40; aimZ = vehicle.z + Math.cos(side) * 40;
      } else if (distance > preferred * 1.35) {
        aimX = target.x + target.vx * 0.6; aimZ = target.z + target.vz * 0.6;
      } else {
        const orbit = yawTo(target.x, target.z, vehicle.x, vehicle.z) + brain.strafe * 0.9;
        aimX = target.x + Math.sin(orbit) * preferred; aimZ = target.z + Math.cos(orbit) * preferred;
      }
      Object.assign(input, this.driveToward(vehicle, aimX, aimZ, dt));
    }

    // Aim and fire independently of where the chassis is pointing.
    const gun = vehicle.autoDef.smg;
    const aim = this.aimAt(vehicle, target, brain, dt);
    input.aimYaw = aim.yaw; input.aimPitch = aim.pitch;
    const visible = this.terrain.hasLineOfSight(vehicle.x, vehicle.y + 1.9, vehicle.z, target.x, target.y + 1.5, target.z, 8);
    const aligned = Math.abs(angleDelta(aim.yaw, vehicle.aimYaw)) < 0.14;
    input.fire = visible && aligned && distance <= gun.range;

    if (this.shouldUseUltimate(vehicle, target, enemies, distance)) {
      input.ultimate = true;
      input.aimPoint = this.ultimateAimPoint(vehicle, target);
    }
    return input;
  }
}

export const arenaAiInternals = { angleDelta, yawTo, ENGAGE_RANGE };
