// Weapons, Ultimates and every projectile in the Destruct-Auto arena.
//
// Runs on the same plain vehicle records the physics module uses. Rendering is
// bolted on afterwards by ArenaMode via the `hooks` callbacks, so the whole
// combat model can be stepped headlessly in tests.

import { ULTIMATE_KINDS } from '../../data/destructAutos.js';
import { VEHICLE_RADIUS, forwardOf } from './ArenaPhysics.js';

const HIT_RADIUS = VEHICLE_RADIUS + 0.5;
const noop = () => {};

export class ArenaCombat {
  constructor({ terrain, hooks = {}, random = Math.random }) {
    this.terrain = terrain;
    this.random = random;
    this.hooks = {
      onSpawnProjectile: noop, onRemoveProjectile: noop, onExplosion: noop,
      onImpact: noop, onWorldHit: noop, onDamage: noop, onEffect: noop, onRemoveEffect: noop,
      onUltimate: noop, onSound: noop, ...hooks,
    };
    this.projectiles = [];
    this.effects = [];   // mines, lava pools, cryo fields, airstrike markers
    this.volleys = [];   // staggered multi-shot Ultimates still firing
    this.nextId = 1;
  }

  // ── friend / foe ──────────────────────────────────────────────────────────
  hostile(a, b) { return a && b && a.id !== b.id && !b.dead && (a.team === null || a.team !== b.team); }
  enemiesOf(vehicle, vehicles) { return vehicles.filter(other => this.hostile(vehicle, other)); }

  // ── damage ────────────────────────────────────────────────────────────────
  applyDamage(target, amount, source, kind = 'bullet', time = 0) {
    if (!target || target.dead || amount <= 0) return 0;
    if (target.spawnGrace > 0) return 0;
    const dealt = amount * target.autoDef.stats.armor * (target.vulnerability || 1);
    target.hp -= dealt;
    if (source && source !== target) {
      source.damageDealt += dealt;
      target.lastAttacker = source.id;
      target.lastAttackerTime = time;
    }
    this.hooks.onDamage(target, dealt, source, kind);
    return dealt;
  }

  radialDamage(x, y, z, radius, damage, source, vehicles, kind = 'explosion', knockback = 0, time = 0) {
    const victims = [];
    for (const target of vehicles) {
      if (target.dead) continue;
      if (source && target.id === source.id && kind !== 'self') { /* self-damage is off */ }
      const dx = target.x - x, dy = (target.y + 1.5) - y, dz = target.z - z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > radius + HIT_RADIUS) continue;
      if (source && target.id === source.id) continue;
      if (source && !this.hostile(source, target)) continue;
      const falloff = Math.max(0.25, 1 - dist / (radius + HIT_RADIUS));
      const dealt = this.applyDamage(target, damage * falloff, source, kind, time);
      if (knockback > 0) {
        const len = Math.max(0.001, Math.hypot(dx, dz));
        target.vx += (dx / len) * knockback * falloff / target.autoDef.stats.weight;
        target.vz += (dz / len) * knockback * falloff / target.autoDef.stats.weight;
        target.vy += knockback * 0.42 * falloff / target.autoDef.stats.weight;
        target.grounded = false;
      }
      if (dealt > 0) victims.push(target);
    }
    return victims;
  }

  // ── sub-machine gun ───────────────────────────────────────────────────────
  smgInterval(vehicle) { return 60 / vehicle.autoDef.smg.rpm; }
  canFire(vehicle) { return !vehicle.dead && vehicle.fireCooldown <= 0 && vehicle.stunTimer <= 0; }
  // `aim` is a unit direction. Ammo is unlimited by design — only the rate
  // limits you.
  fireSmg(vehicle, aim, time = 0) {
    if (!this.canFire(vehicle)) return null;
    const gun = vehicle.autoDef.smg;
    vehicle.fireCooldown = this.smgInterval(vehicle);
    vehicle.shotsFired++;
    const spread = gun.spread;
    const dir = this._scatter(aim, spread);
    const muzzle = this._muzzle(vehicle, aim);
    const projectile = this._spawn({
      kind: 'bullet', owner: vehicle, x: muzzle.x, y: muzzle.y, z: muzzle.z,
      vx: dir.x * gun.bulletSpeed + vehicle.vx, vy: dir.y * gun.bulletSpeed + vehicle.vy, vz: dir.z * gun.bulletSpeed + vehicle.vz,
      damage: gun.damage, life: gun.range / gun.bulletSpeed, color: gun.color, radius: 0, gravity: 2,
    });
    this.hooks.onSound('smg', vehicle);
    return projectile;
  }
  _muzzle(vehicle, aim) {
    const f = forwardOf(vehicle);
    return {
      x: vehicle.x + (aim?.x ?? f.x) * 3.4,
      y: vehicle.y + 1.9,
      z: vehicle.z + (aim?.z ?? f.z) * 3.4,
    };
  }
  _scatter(dir, spread) {
    const rx = (this.random() - 0.5) * spread * 2, ry = (this.random() - 0.5) * spread * 2, rz = (this.random() - 0.5) * spread * 2;
    const x = dir.x + rx, y = (dir.y || 0) + ry * 0.6, z = dir.z + rz;
    const len = Math.hypot(x, y, z) || 1;
    return { x: x / len, y: y / len, z: z / len };
  }
  _spawn(data) {
    const projectile = { id: this.nextId++, team: data.owner?.team ?? null, ownerId: data.owner?.id ?? null, owner: data.owner, ...data };
    this.projectiles.push(projectile);
    this.hooks.onSpawnProjectile(projectile);
    return projectile;
  }
  _addEffect(effect) {
    const record = { id: this.nextId++, ...effect };
    this.effects.push(record);
    this.hooks.onEffect(record);
    return record;
  }

  // ── ultimates ─────────────────────────────────────────────────────────────
  ultimateReady(vehicle) { return !vehicle.dead && vehicle.ultimateCooldown <= 0 && vehicle.stunTimer <= 0 && !vehicle.ultimateActive; }
  activateUltimate(vehicle, aim, aimPoint, vehicles, time = 0) {
    if (!this.ultimateReady(vehicle)) return false;
    const ult = vehicle.autoDef.ultimate;
    vehicle.ultimateCooldown = ult.cooldown;
    vehicle.ultimateReady = false;
    this.hooks.onUltimate(vehicle, ult);
    const f = forwardOf(vehicle);
    const dir = aim || { x: f.x, y: 0, z: f.z };
    switch (ult.kind) {
      case ULTIMATE_KINDS.SHOCKWAVE:
        vehicle.vy = ult.launch;
        vehicle.grounded = false;
        vehicle.ultimateActive = { kind: 'shockwave', ult, timer: ult.hangTime, phase: 'rise' };
        break;
      case ULTIMATE_KINDS.DASH:
        vehicle.dashTimer = ult.duration;
        vehicle.dashHits = new Set();
        vehicle.ultimateActive = { kind: 'dash', ult, timer: ult.duration };
        break;
      case ULTIMATE_KINDS.MISSILES:
        this.volleys.push({ kind: 'missile', vehicle, ult, remaining: ult.count, timer: 0, index: 0 });
        break;
      case ULTIMATE_KINDS.MINES:
        this.volleys.push({ kind: 'mine', vehicle, ult, remaining: ult.count, timer: 0, index: 0 });
        break;
      case ULTIMATE_KINDS.CHAIN:
        this._chainLightning(vehicle, ult, vehicles, time);
        break;
      case ULTIMATE_KINDS.FLAK:
        this._flakBurst(vehicle, ult);
        break;
      case ULTIMATE_KINDS.FIELD:
        this._addEffect({
          kind: 'cryo', ult, owner: vehicle, team: vehicle.team, x: vehicle.x, y: vehicle.y, z: vehicle.z,
          radius: ult.radius, life: ult.duration, maxLife: ult.duration, tick: 0, color: ult.color,
        });
        break;
      case ULTIMATE_KINDS.TRAIL:
        vehicle.ultimateActive = { kind: 'trail', ult, timer: ult.duration, drop: 0 };
        break;
      case ULTIMATE_KINDS.AIRSTRIKE: {
        const point = aimPoint || this._groundAhead(vehicle, ult.markRange);
        this._addEffect({
          kind: 'airstrike', ult, owner: vehicle, team: vehicle.team, x: point.x, y: point.y, z: point.z,
          radius: ult.radius, life: ult.delay, maxLife: ult.delay, color: ult.color,
        });
        break;
      }
      case ULTIMATE_KINDS.MORTAR: {
        const point = aimPoint || this._groundAhead(vehicle, ult.range * 0.7);
        this.volleys.push({ kind: 'mortar', vehicle, ult, remaining: ult.count, timer: 0, index: 0, point });
        break;
      }
      default: break;
    }
    return true;
  }
  _groundAhead(vehicle, distance) {
    const f = forwardOf(vehicle);
    const x = vehicle.x + f.x * distance, z = vehicle.z + f.z * distance;
    return { x, y: this.terrain.surfaceAt(x, z, vehicle.y + 30).height, z };
  }
  _chainLightning(vehicle, ult, vehicles, time) {
    let current = { x: vehicle.x, y: vehicle.y + 1.6, z: vehicle.z };
    const struck = new Set([vehicle.id]);
    let damage = ult.damage;
    const arcs = [];
    for (let jump = 0; jump < ult.jumps; jump++) {
      const range = jump === 0 ? ult.range : ult.chainRange;
      let best = null, bestDist = Infinity;
      for (const target of vehicles) {
        if (target.dead || struck.has(target.id) || !this.hostile(vehicle, target)) continue;
        const dist = Math.hypot(target.x - current.x, target.z - current.z);
        if (dist < bestDist && dist <= range) { best = target; bestDist = dist; }
      }
      if (!best) break;
      struck.add(best.id);
      this.applyDamage(best, damage, vehicle, 'chain', time);
      best.stunTimer = Math.max(best.stunTimer, ult.stun);
      arcs.push({ from: { ...current }, to: { x: best.x, y: best.y + 1.6, z: best.z } });
      current = { x: best.x, y: best.y + 1.6, z: best.z };
      damage *= ult.falloff;
    }
    if (arcs.length) this._addEffect({ kind: 'arc', arcs, life: 0.42, maxLife: 0.42, color: ult.color, owner: vehicle });
  }
  _flakBurst(vehicle, ult) {
    for (let i = 0; i < ult.pellets; i++) {
      const angle = (i / ult.pellets) * Math.PI * 2 + this.random() * 0.12;
      const lift = 0.06 + this.random() * 0.22;
      this._spawn({
        kind: 'flak', owner: vehicle, x: vehicle.x, y: vehicle.y + 1.6, z: vehicle.z,
        vx: Math.sin(angle) * ult.bulletSpeed, vy: lift * ult.bulletSpeed, vz: Math.cos(angle) * ult.bulletSpeed,
        damage: ult.damage, life: ult.range / ult.bulletSpeed, color: ult.color, radius: 0, gravity: 22,
      });
    }
    this.hooks.onSound('flak', vehicle);
  }

  // ── per-frame ─────────────────────────────────────────────────────────────
  update(dt, vehicles, time = 0) {
    this._updateVolleys(dt, vehicles);
    this._updateUltimateStates(dt, vehicles, time);
    this._updateProjectiles(dt, vehicles, time);
    this._updateEffects(dt, vehicles, time);
  }

  _updateVolleys(dt, vehicles) {
    for (let i = this.volleys.length - 1; i >= 0; i--) {
      const volley = this.volleys[i];
      volley.timer -= dt;
      if (volley.vehicle.dead) { this.volleys.splice(i, 1); continue; }
      while (volley.timer <= 0 && volley.remaining > 0) {
        volley.timer += volley.ult.interval;
        volley.remaining--;
        this._fireVolleyShot(volley, vehicles);
        volley.index++;
      }
      if (volley.remaining <= 0) this.volleys.splice(i, 1);
    }
  }
  _fireVolleyShot(volley, vehicles) {
    const { vehicle, ult } = volley;
    if (volley.kind === 'missile') {
      const f = forwardOf(vehicle);
      const fan = (volley.index - (ult.count - 1) / 2) * 0.34;
      const angle = Math.atan2(f.x, f.z) + fan;
      const target = this._nearestEnemy(vehicle, vehicles, 130);
      this._spawn({
        kind: 'missile', owner: vehicle, x: vehicle.x + f.x * 2, y: vehicle.y + 2.2, z: vehicle.z + f.z * 2,
        vx: Math.sin(angle) * ult.speed * 0.8, vy: 7, vz: Math.cos(angle) * ult.speed * 0.8,
        damage: ult.damage, radius: ult.radius, life: ult.life, color: ult.color, gravity: 0,
        homing: { targetId: target?.id ?? null, turnRate: ult.turnRate, speed: ult.speed },
      });
      this.hooks.onSound('missile', vehicle);
      return;
    }
    if (volley.kind === 'mine') {
      const f = forwardOf(vehicle);
      const back = 5 + volley.index * 1.2;
      const x = vehicle.x - f.x * back, z = vehicle.z - f.z * back;
      this._addEffect({
        kind: 'mine', ult, owner: vehicle, team: vehicle.team,
        x, y: this.terrain.surfaceAt(x, z, vehicle.y + 4).height + 0.8, z,
        radius: ult.radius, life: ult.fuse, maxLife: ult.fuse, arm: ult.armTime, color: ult.color, damage: ult.damage,
      });
      this.hooks.onSound('mine', vehicle);
      return;
    }
    if (volley.kind === 'mortar') {
      const spread = volley.index === 0 ? 0 : (this.random() - 0.5) * 12;
      const point = { x: volley.point.x + spread, y: volley.point.y, z: volley.point.z + (this.random() - 0.5) * 12 };
      const travel = ult.travel;
      const dx = point.x - vehicle.x, dz = point.z - vehicle.z;
      const dy = point.y - (vehicle.y + 2.4);
      const g = 46;
      this._spawn({
        kind: 'mortar', owner: vehicle, x: vehicle.x, y: vehicle.y + 2.4, z: vehicle.z,
        vx: dx / travel, vy: dy / travel + 0.5 * g * travel, vz: dz / travel,
        damage: ult.damage, radius: ult.radius, life: travel + 2, color: ult.color, gravity: g, detonateOnGround: true,
      });
      this.hooks.onSound('mortar', vehicle);
    }
  }

  _updateUltimateStates(dt, vehicles, time) {
    for (const vehicle of vehicles) {
      const active = vehicle.ultimateActive;
      if (!active) continue;
      if (vehicle.dead) { vehicle.ultimateActive = null; vehicle.dashTimer = 0; continue; }
      if (active.kind === 'shockwave') {
        active.timer -= dt;
        if (active.phase === 'rise' && (active.timer <= 0 || vehicle.vy < 0)) {
          active.phase = 'slam';
          vehicle.vy = -70; // drive the slam down hard rather than waiting on gravity
        } else if (active.phase === 'slam' && vehicle.grounded) {
          const ult = active.ult;
          this.radialDamage(vehicle.x, vehicle.y + 1, vehicle.z, ult.radius, ult.damage, vehicle, vehicles, 'shockwave', ult.knockback, time);
          this._addEffect({ kind: 'shockwave', x: vehicle.x, y: vehicle.y + 0.4, z: vehicle.z, radius: ult.radius, life: 0.55, maxLife: 0.55, color: ult.color, owner: vehicle });
          this.hooks.onExplosion({ x: vehicle.x, y: vehicle.y + 1, z: vehicle.z }, ult.radius, ult.color);
          this.hooks.onSound('slam', vehicle);
          vehicle.ultimateActive = null;
        } else if (active.phase === 'slam' && active.timer < -3) {
          vehicle.ultimateActive = null; // safety valve if the slam never lands
        }
        continue;
      }
      if (active.kind === 'dash') {
        active.timer -= dt;
        vehicle.dashTimer = Math.max(0, active.timer);
        const ult = active.ult;
        const f = forwardOf(vehicle);
        vehicle.vx = f.x * ult.speed; vehicle.vz = f.z * ult.speed;
        for (const target of vehicles) {
          if (target.dead || !this.hostile(vehicle, target) || vehicle.dashHits?.has(target.id)) continue;
          if (Math.hypot(target.x - vehicle.x, target.z - vehicle.z) > ult.radius + VEHICLE_RADIUS) continue;
          if (Math.abs(target.y - vehicle.y) > 4) continue;
          vehicle.dashHits.add(target.id);
          this.applyDamage(target, ult.damage, vehicle, 'ram', time);
          const len = Math.max(0.001, Math.hypot(target.x - vehicle.x, target.z - vehicle.z));
          target.vx += ((target.x - vehicle.x) / len) * ult.knockback / target.autoDef.stats.weight;
          target.vz += ((target.z - vehicle.z) / len) * ult.knockback / target.autoDef.stats.weight;
          target.vy += 9;
          target.grounded = false;
          this.hooks.onExplosion({ x: target.x, y: target.y + 1.4, z: target.z }, 5, ult.color);
        }
        if (active.timer <= 0) { vehicle.ultimateActive = null; vehicle.dashTimer = 0; vehicle.dashHits = null; }
        continue;
      }
      if (active.kind === 'trail') {
        active.timer -= dt;
        active.drop -= dt;
        if (active.drop <= 0) {
          active.drop = active.ult.interval;
          const surface = this.terrain.surfaceAt(vehicle.x, vehicle.z, vehicle.y + 2);
          this._addEffect({
            kind: 'lava', ult: active.ult, owner: vehicle, team: vehicle.team,
            x: vehicle.x, y: surface.height + 0.12, z: vehicle.z,
            radius: active.ult.radius, life: active.ult.segmentLife, maxLife: active.ult.segmentLife,
            tick: 0, color: active.ult.color, damage: active.ult.damage,
          });
        }
        if (active.timer <= 0) vehicle.ultimateActive = null;
      }
    }
  }

  _nearestEnemy(vehicle, vehicles, maxRange = Infinity) {
    let best = null, bestDist = maxRange;
    for (const target of vehicles) {
      if (!this.hostile(vehicle, target)) continue;
      const dist = Math.hypot(target.x - vehicle.x, target.z - vehicle.z);
      if (dist < bestDist) { best = target; bestDist = dist; }
    }
    return best;
  }

  _updateProjectiles(dt, vehicles, time) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      if (p.life <= 0) { this._removeProjectile(i, null); continue; }
      if (p.homing) {
        let target = vehicles.find(v => v.id === p.homing.targetId && !v.dead);
        if (!target) { target = this._nearestEnemy(p.owner, vehicles, 140); p.homing.targetId = target?.id ?? null; }
        if (target) {
          const dx = target.x - p.x, dy = (target.y + 1.4) - p.y, dz = target.z - p.z;
          const len = Math.hypot(dx, dy, dz) || 1;
          const speed = p.homing.speed;
          const blend = Math.min(1, p.homing.turnRate * dt);
          p.vx += ((dx / len) * speed - p.vx) * blend;
          p.vy += ((dy / len) * speed - p.vy) * blend;
          p.vz += ((dz / len) * speed - p.vz) * blend;
          const current = Math.hypot(p.vx, p.vy, p.vz) || 1;
          p.vx = (p.vx / current) * speed; p.vy = (p.vy / current) * speed; p.vz = (p.vz / current) * speed;
        }
      }
      if (p.gravity) p.vy -= p.gravity * dt;
      const px = p.x, py = p.y, pz = p.z;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;

      // vehicle hit
      let hitVehicle = null;
      for (const target of vehicles) {
        if (target.dead || target.id === p.ownerId) continue;
        if (p.owner && !this.hostile(p.owner, target)) continue;
        const dx = target.x - p.x, dy = (target.y + 1.5) - p.y, dz = target.z - p.z;
        if (dx * dx + dy * dy + dz * dz <= HIT_RADIUS * HIT_RADIUS) { hitVehicle = target; break; }
      }
      if (hitVehicle) {
        if (p.owner) p.owner.shotsHit++;
        if (p.radius > 0) {
          this.radialDamage(p.x, p.y, p.z, p.radius, p.damage, p.owner, vehicles, 'explosion', p.radius * 1.6, time);
          this.hooks.onExplosion({ x: p.x, y: p.y, z: p.z }, p.radius, p.color);
        } else {
          this.applyDamage(hitVehicle, p.damage, p.owner, p.kind, time);
          this.hooks.onImpact({ x: p.x, y: p.y, z: p.z }, p.color, hitVehicle);
        }
        this._removeProjectile(i, { x: px, y: py, z: pz });
        continue;
      }
      // world hit
      const outOfBounds = Math.abs(p.x) > this.terrain.bounds + 8 || Math.abs(p.z) > this.terrain.bounds + 8;
      const surface = this.terrain.surfaceAt(p.x, p.z, p.y + 1.5, 1.5);
      const grounded = p.y <= surface.height;
      const solidPiece = this.terrain.solidPieceAt?.(p.x, p.z, p.y) || null;
      if (outOfBounds || grounded || solidPiece || this.terrain.solidAt(p.x, p.z, p.y)) {
        const point = { x: p.x, y: grounded ? surface.height + 0.1 : p.y, z: p.z };
        if (solidPiece?.destructible) {
          this.hooks.onWorldHit(solidPiece, p.radius > 0 ? p.damage * 1.5 : p.damage, point, p.owner, p.kind);
        }
        if (p.radius > 0) {
          this.radialDamage(point.x, point.y, point.z, p.radius, p.damage, p.owner, vehicles, 'explosion', p.radius * 1.6, time);
          this.hooks.onExplosion(point, p.radius, p.color);
        } else this.hooks.onImpact(point, p.color, null);
        this._removeProjectile(i, { x: px, y: py, z: pz });
      }
    }
  }
  _removeProjectile(index, lastPoint) {
    const [p] = this.projectiles.splice(index, 1);
    if (p) this.hooks.onRemoveProjectile(p, lastPoint);
  }

  _updateEffects(dt, vehicles, time) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i];
      effect.life -= dt;
      switch (effect.kind) {
        case 'mine': {
          if (effect.arm > 0) { effect.arm -= dt; break; }
          const victim = vehicles.find(v => !v.dead && this.hostile(effect.owner, v)
            && Math.hypot(v.x - effect.x, v.z - effect.z) < effect.radius * 0.55 && Math.abs(v.y - effect.y) < 5);
          if (victim || effect.life <= 0) {
            if (victim) {
              this.radialDamage(effect.x, effect.y, effect.z, effect.radius, effect.damage, effect.owner, vehicles, 'explosion', effect.radius * 2.2, time);
              this.hooks.onExplosion({ x: effect.x, y: effect.y, z: effect.z }, effect.radius, effect.color);
            }
            effect.life = 0;
          }
          break;
        }
        case 'cryo': {
          effect.tick -= dt;
          if (effect.tick <= 0) {
            effect.tick = effect.ult.tick;
            for (const target of vehicles) {
              if (target.dead || !this.hostile(effect.owner, target)) continue;
              if (Math.hypot(target.x - effect.x, target.z - effect.z) > effect.radius) continue;
              this.applyDamage(target, effect.ult.damage, effect.owner, 'cryo', time);
              target.slowTimer = Math.max(target.slowTimer, 1.6);
              target.slowFactor = effect.ult.slow;
              target.vulnerability = effect.ult.vulnerability;
            }
          }
          break;
        }
        case 'lava': {
          effect.tick -= dt;
          if (effect.tick <= 0) {
            effect.tick = effect.ult.tick;
            for (const target of vehicles) {
              if (target.dead || !this.hostile(effect.owner, target)) continue;
              if (Math.hypot(target.x - effect.x, target.z - effect.z) > effect.radius) continue;
              if (Math.abs(target.y - effect.y) > 5) continue;
              this.applyDamage(target, effect.ult.damage * effect.ult.tick, effect.owner, 'burn', time);
            }
          }
          break;
        }
        case 'airstrike': {
          if (effect.life <= 0) {
            this.radialDamage(effect.x, effect.y, effect.z, effect.radius, effect.ult.damage, effect.owner, vehicles, 'explosion', effect.radius * 2.4, time);
            this.hooks.onExplosion({ x: effect.x, y: effect.y + 1, z: effect.z }, effect.radius, effect.color);
            this.hooks.onSound('airstrike', effect.owner);
          }
          break;
        }
        default: break;
      }
      if (effect.life <= 0) {
        this.effects.splice(i, 1);
        this.hooks.onRemoveEffect(effect);
      }
    }
  }

  clear() {
    for (const p of this.projectiles) this.hooks.onRemoveProjectile(p, null);
    for (const e of this.effects) this.hooks.onRemoveEffect(e);
    this.projectiles.length = 0; this.effects.length = 0; this.volleys.length = 0;
  }
}
