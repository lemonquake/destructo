import * as THREE from 'three';
import { configureProjectileRig, createProjectileRig } from './ProjectileModels.js';

const tube = (radius, length, sides = 8) => { const g = new THREE.CylinderGeometry(radius, radius, length, sides); g.rotateX(Math.PI / 2); return g; };
const PROJECTILE_GEOS = Object.freeze({
  slug: new THREE.SphereGeometry(.09, 6, 4), dart: new THREE.ConeGeometry(.055, .4, 6).rotateX(Math.PI / 2), lance: new THREE.BoxGeometry(.055, .055, .55),
  tracer: new THREE.BoxGeometry(.055, .055, .28), grenade: new THREE.DodecahedronGeometry(.17, 0), pellet: new THREE.SphereGeometry(.055, 5, 3),
  bolt: new THREE.OctahedronGeometry(.1, 0), mine: tube(.24, .1, 10), rocket: tube(.1, .52, 8), arc: new THREE.TorusGeometry(.13, .035, 5, 10), plasma: new THREE.IcosahedronGeometry(.17, 1),
});

export class CombatSystem {
  constructor(scene, particles, getTargets, onDeath, onDamage = null, isHostile = null, heightAt = null, onStat = null) {
    this.scene = scene; this.particles = particles; this.getTargets = getTargets; this.onDeath = onDeath; this.onDamage = onDamage;
    // isHostile(teamA, teamB) — alliance-aware; falls back to plain team inequality
    this.isHostile = isHostile || ((a, b) => a !== b);
    this.heightAt = heightAt; this.pool = []; this.onStat = onStat;
    for (let i = 0; i < 240; i++) { const mesh = createProjectileRig(); mesh.visible = false; scene.add(mesh); this.pool.push({ mesh, active: false, velocity: new THREE.Vector3(), age: 0, maxAge: 1, shooter: null, weapon: null, mine: false, trailTimer: 0 }); }
  }
  ground(x, z) { return this.heightAt ? this.heightAt(x, z) : 0; }
  // a prop/destructible (no team) is fair game for everyone; otherwise consult the alliance map
  canHit(shooter, target) { return target.type === 'prop' || target.team === 'neutral' || shooter.team === 'neutral' || this.isHostile(shooter.team, target.team); }
  shoot(shooter, direction) {
    if (shooter.dead || shooter.fireCooldown > 0 || shooter.freeze > 0) return false;
    if (Number.isFinite(shooter.ammo) && shooter.weaponId !== 'pistol') { if (shooter.ammo <= 0) return false; shooter.ammo--; }
    const base = shooter.weapon; let multiplier = shooter.nextShotMultiplier || 1;
    if (shooter.overchargeShots > 0) { multiplier *= 3; shooter.overchargeShots--; }
    if (shooter.buffs?.damage > 0) multiplier *= 1.5;
    if (shooter.passive?.id === 'sharpshooter') multiplier *= 1.18;
    const w = multiplier === 1 ? base : { ...base, damage: base.damage * multiplier };
    let rateBoost = (shooter.overdriveTimer > 0 ? 2 : 1) * (shooter.rallyTimer > 0 ? 1.25 : 1) * (shooter.frenzyTimer > 0 ? 2 : 1) * (shooter.buffs?.rapid > 0 ? 1.7 : 1);
    if (shooter.passive?.id === 'rapidhands') rateBoost *= 1.15;
    shooter.fireCooldown = w.rate / rateBoost;
    const pellets = w.pellets || 1;
    for (let i = 0; i < pellets; i++) this.spawn(shooter, direction, w);
    shooter.nextShotMultiplier = 1; shooter.cloakTimer = 0;
    // recoil: kick the animation and physically shove the shooter backwards
    shooter.recoil = Math.min(1, .35 + (w.recoil || 0) * .09);
    if (shooter.velocity && w.recoil) shooter.velocity.addScaledVector(direction, -(w.recoil || 0));
    
    // Play shoot sound spatially
    if (this.audio && shooter.group && shooter.group.position) {
      let soundName = 'pistol';
      let rate = 0.85 + Math.random() * 0.3;
      if (shooter.type === 'turret') {
        soundName = 'turret';
        rate = 0.7 + Math.random() * 0.15;
      } else if (shooter.weaponId) {
        if (shooter.weaponId === 'uzi') {
          soundName = 'uzi';
        } else if (shooter.weaponId === 'flamethrower') {
          soundName = 'turret';
          rate = 1.6 + Math.random() * 0.2;
        } else if (shooter.weaponId === 'railgun') {
          soundName = 'sniper';
          rate = 0.55;
        } else if (shooter.weaponId === 'freezeray') {
          soundName = 'sniper';
          rate = 1.75;
        } else if (shooter.weaponId === 'cannon') {
          soundName = 'shotgun';
          rate = 0.45;
        } else if (['machinegun', 'smg', 'rifle'].includes(shooter.weaponId)) {
          soundName = 'machinegun';
        } else if (['shotgun', 'rocket', 'grenade'].includes(shooter.weaponId)) {
          soundName = 'shotgun';
        } else if (shooter.weaponId === 'grenadelauncher') {
          soundName = 'grenade_launcher';
        } else if (shooter.weaponId === 'sniper') {
          soundName = 'sniper';
        } else if (['tesla', 'plasma'].includes(shooter.weaponId)) {
          soundName = 'sniper';
          rate = 1.35;
        } else {
          soundName = 'pistol';
        }
      }
      this.audio.play(soundName, shooter.group.position, rate);
    }
    
    return true;
  }
  spawn(shooter, direction, w) { const p = this.pool.find(v => !v.active); if (!p) return; p.active = true; p.shooter = shooter; p.weapon = w; p.age = 0; p.trailTimer=0; p.mine = Boolean(w.mine); p.maxAge = w.mine ? 12 : (w.fuse || (w.range / Math.max(1, w.speed))); p.mesh.visible = true; configureProjectileRig(p.mesh,w.projectileStyle,PROJECTILE_GEOS[w.projectileStyle]||PROJECTILE_GEOS.slug,w.color);p.mesh.scale.setScalar(w.projectileScale||1); const start = shooter.group.position, muzzleHeight=shooter.type==='turret'?2.55:shooter.type==='vehicle'?2.35:1.35; p.mesh.position.set(start.x, start.y + muzzleHeight, start.z).addScaledVector(direction, 1.05); if (w.mine) { p.mesh.position.y = this.ground(p.mesh.position.x, p.mesh.position.z) + .12; p.mesh.scale.set(2.2*(w.projectileScale||1), .45, 2.2*(w.projectileScale||1)); p.velocity.set(0, 0, 0); } else { p.velocity.copy(direction); p.velocity.x += (Math.random() - .5) * w.spread * w.speed * 0.45; p.velocity.z += (Math.random() - .5) * w.spread * w.speed * 0.45; p.velocity.normalize().multiplyScalar(w.speed); if (w.gravity) p.velocity.y += 6; p.mesh.lookAt(p.mesh.position.clone().add(p.velocity)); if (this.onStat && shooter.team) this.onStat(shooter.team, 'bulletsFired'); } }
  update(dt) {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.age += dt;
      if(p.weapon.crimson){const basic=p.mesh.userData.parts?.basic;if(basic)basic.material.opacity=.48+Math.sin(p.age*42)*.5;p.trailTimer-=dt;if(p.trailTimer<=0){p.trailTimer=.055;this.particles.impact(p.mesh.position,0xff102c)}}
      if (!p.mine) {
        if (p.weapon.gravity) p.velocity.y -= p.weapon.gravity * dt;
        p.mesh.position.addScaledVector(p.velocity, dt);
        if(p.weapon.projectileStyle==='grenade'){p.mesh.rotation.x+=dt*12;p.mesh.rotation.y+=dt*8}
        else if(['rocket','missile'].includes(p.weapon.projectileStyle))p.mesh.rotateZ(dt*8);
      }
      const hit = this.findHit(p);
      if (hit) {
        p.weapon.explosive ? this.explode(p, hit) : this.hit(p, hit);
        continue;
      }
      const g = this.ground(p.mesh.position.x, p.mesh.position.z);
      if (!p.mine && p.mesh.position.y < g + .05) {
        if (p.weapon.fuse) {
          p.mesh.position.y = g + .05;
          p.velocity.y = Math.abs(p.velocity.y) * 0.45;
          p.velocity.x *= 0.65;
          p.velocity.z *= 0.65;
        } else {
          if (p.weapon.explosive) { this.explode(p, null); continue; }
          else { this.release(p); continue; }
        }
      }
      if (p.age > p.maxAge) {
        if (p.weapon.explosive) this.explode(p, null);
        else this.release(p);
      }
    }
  }
  findHit(p) { let best = null, bestD = Infinity; for (const target of this.getTargets()) { if (!target || target.dead || target === p.shooter || target.mountedTurret || target.mountedBunker || !this.canHit(p.shooter, target)) continue; const dx = target.group.position.x - p.mesh.position.x, dz = target.group.position.z - p.mesh.position.z, dy = (target.group.position.y + (target.type === 'unit' ? 1.2 : 1)) - p.mesh.position.y; const d = dx * dx + dz * dz + dy * dy, r = (target.radius || 1) + (p.mine ? 2 : 0.48); if (d < r * r && d < bestD) { best = target; bestD = d; } } return best; }
  hit(p, target) { if (this.onStat && p.shooter?.team) this.onStat(p.shooter.team, 'bulletsHit'); this.applyDamage(target, p.weapon.damage, p.shooter, p.velocity, p.weapon.knockback); this.particles.impact(p.mesh.position, p.weapon.color);if(p.weapon.crimson){this.particles.burst(p.mesh.position,0xff001f,46,15);this.particles.burst(p.mesh.position,0xff5268,24,20)} this.release(p); }
  explode(p, direct) {
    if (this.onStat && p.shooter?.team) this.onStat(p.shooter.team, 'bulletsHit');
    const pos = p.mesh.position.clone();
    this.particles.burst(pos, p.weapon.color, p.weapon.crimson?72:32, p.weapon.crimson?18:11);
    if(p.weapon.crimson)this.particles.burst(pos,0xff001f,48,24);
    
    // Play explosion sound spatially
    if (this.audio) {
      this.audio.play('explosion', pos, 0.95 + Math.random() * 0.15);
    }
    
    for (const target of this.getTargets()) {
      if (!target || target.dead || target === p.shooter || target.mountedTurret || target.mountedBunker || !this.canHit(p.shooter, target)) continue;
      const dist = target.group.position.distanceTo(pos), radius = 5.2*(p.weapon.projectileScale||1);
      if (dist > radius) continue;
      const falloff = 1 - dist / radius, dir = target.group.position.clone().sub(pos).setY(.4).normalize();
      this.applyDamage(target, p.weapon.damage * falloff, p.shooter, dir, p.weapon.knockback * falloff, true);
    }
    this.release(p);
  }
  applyDamage(target, damage, source, direction, knockback = 0, explosive = false, reflected = false) {
    if(target?.invulnerable)return;
    if (target.dead || target.critical) return;
    // Enclosed occupants are not separate hit targets: their structure catches
    // both direct hits and blast damage until it is destroyed.
    const cover=target.mountedTurret||target.mountedBunker||target.mountedMotorcycle;
    if(cover&&!cover.dead)return this.applyDamage(cover,damage,source,direction,knockback,explosive,reflected);
    if(Number.isFinite(target.armor))damage*=Math.max(.15,1-target.armor);
    if (target.barrierTimer > 0) damage *= .35;
    if (target.passive?.id === 'thickskin') damage *= .88;
    // Bulwark Plating aura: a nearby ally with thickskin shields the whole pocket
    else if (target.team && target.team !== 'neutral') {
      for (const ally of this.getTargets()) {
        if (!ally || ally.dead || ally === target || ally.passive?.id !== 'thickskin') continue;
        if (this.isHostile(ally.team, target.team)) continue;
        if (ally.group.position.distanceToSquared(target.group.position) < 25) { damage *= .92; break; }
      }
    }
    if (explosive && target.passive?.id === 'blastproof') damage *= .6;
    if (target.passive?.id === 'lucky' && Math.random() < .12) damage = 0;
    if (target.rearPlate && direction && target.aim && direction.dot(target.aim) > .35) damage *= .6;
    // temp shield soaks damage first
    if (target.shield > 0 && damage > 0) { const soaked = Math.min(target.shield, damage); target.shield -= soaked; damage -= soaked; }
    target.hp -= damage;
    if (damage > 0 && target.passive?.id === 'adrenaline') target.statusTimer = Math.max(target.statusTimer || 0, 3);
    if (damage > 0 && source?.passive?.id === 'vampiric' && Number.isFinite(source.maxHp)) source.hp = Math.min(source.maxHp, source.hp + damage * .12);
    // Thorn Plating: sting the attacker for 10% of any damage (never chains)
    if (!reflected && damage > 0 && target.passive?.id === 'thorns' && source && !source.dead && Number.isFinite(source.hp))
      this.applyDamage(source, damage * .1, target, null, 0, false, true);
    if (target.hp <= 0 && target.passive?.id === 'laststand' && !target.lastStandUsed) { target.lastStandUsed = true; target.hp = 1; }
    this.onDamage?.(target, damage, source, direction, explosive);
    if (target.velocity && direction && knockback && target.passive?.id !== 'stonefeet') {
      const dir = direction.clone().normalize(); target.velocity.addScaledVector(dir, knockback);
      if (knockback > 6) { target.state = 'tumble'; target.stun = Math.min(1.5, .25 + knockback * .07); }
    }
    if (target.hp <= 0) { target.hp = 0;if(target.delayedExplosion){target.critical=true;target.explosionTimer=3;target.lastDamageSource=source;target.lastDamageExplosive=explosive;return}target.dead = true; this.onDeath(target, source, { explosive }); }
  }
  radial(position, radius, damage, source, knockback = 8) { this.particles.burst(position.clone().add(new THREE.Vector3(0, .5, 0)), 0xffb44a, 28, 9); for (const target of this.getTargets()) { if (!target || target.dead || target === source || target.mountedTurret || target.mountedBunker || (source && !this.canHit(source, target))) continue; const dist = target.group.position.distanceTo(position); if (dist > radius) continue; const falloff = 1 - dist / radius, dir = target.group.position.clone().sub(position).setY(.35).normalize(); this.applyDamage(target, damage * falloff, source, dir, knockback * falloff, true); } }
  release(p) { p.active = false; p.mesh.visible = false; p.shooter = null; }
}
