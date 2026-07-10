import * as THREE from 'three';

export class CombatSystem {
  constructor(scene, particles, getTargets, onDeath, onDamage = null) {
    this.scene = scene; this.particles = particles; this.getTargets = getTargets; this.onDeath = onDeath; this.onDamage = onDamage; this.pool = [];
    const geo = new THREE.IcosahedronGeometry(.1, 0); for (let i = 0; i < 180; i++) { const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffdf5e })); mesh.visible = false; scene.add(mesh); this.pool.push({ mesh, active: false, velocity: new THREE.Vector3(), age: 0, maxAge: 1, shooter: null, weapon: null, mine: false }); }
  }
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
    return true;
  }
  spawn(shooter, direction, w) { const p = this.pool.find(v => !v.active); if (!p) return; p.active = true; p.shooter = shooter; p.weapon = w; p.age = 0; p.mine = Boolean(w.mine); p.maxAge = w.mine ? 12 : w.range / Math.max(1, w.speed); p.mesh.visible = true; p.mesh.material.color.setHex(w.color); p.mesh.scale.setScalar(w.explosive ? .16 : 1); const start = shooter.group.position; p.mesh.position.set(start.x, start.y + (shooter.type === 'vehicle' ? 1.8 : 1.35), start.z).addScaledVector(direction, 1.05); if (w.mine) { p.mesh.position.y = .12; p.mesh.scale.set(2.2, .45, 2.2); p.velocity.set(0, 0, 0); } else { p.velocity.copy(direction); p.velocity.x += (Math.random() - .5) * w.spread * w.speed; p.velocity.z += (Math.random() - .5) * w.spread * w.speed; p.velocity.normalize().multiplyScalar(w.speed); if (w.gravity) p.velocity.y += 6; } }
  update(dt) { for (const p of this.pool) { if (!p.active) continue; p.age += dt; if (!p.mine) { if (p.weapon.gravity) p.velocity.y -= p.weapon.gravity * dt; p.mesh.position.addScaledVector(p.velocity, dt); p.mesh.rotation.x += dt * 12; } const hit = this.findHit(p); if (hit) { p.weapon.explosive ? this.explode(p, hit) : this.hit(p, hit); continue; } if ((!p.mine && p.mesh.position.y < .05) || p.age > p.maxAge) { if (p.weapon.explosive) this.explode(p, null); else this.release(p); } } }
  findHit(p) { let best = null, bestD = Infinity; for (const target of this.getTargets()) { if (!target || target.dead || target === p.shooter || target.team === p.shooter.team && target.type !== 'prop') continue; const dx = target.group.position.x - p.mesh.position.x, dz = target.group.position.z - p.mesh.position.z, dy = (target.group.position.y + (target.type === 'unit' ? 1.2 : 1)) - p.mesh.position.y; const d = dx * dx + dz * dz + dy * dy, r = (target.radius || 1) + (p.mine ? 2 : .25); if (d < r * r && d < bestD) { best = target; bestD = d; } } return best; }
  hit(p, target) { this.applyDamage(target, p.weapon.damage, p.shooter, p.velocity, p.weapon.knockback); this.particles.impact(p.mesh.position, p.weapon.color); this.release(p); }
  explode(p, direct) { const pos = p.mesh.position.clone(); this.particles.burst(pos, p.weapon.color, 32, 11); for (const target of this.getTargets()) { if (!target || target.dead || target === p.shooter || target.team === p.shooter.team && target.type !== 'prop') continue; const dist = target.group.position.distanceTo(pos), radius = 5.2; if (dist > radius) continue; const falloff = 1 - dist / radius, dir = target.group.position.clone().sub(pos).setY(.4).normalize(); this.applyDamage(target, p.weapon.damage * falloff, p.shooter, dir, p.weapon.knockback * falloff, true); } this.release(p); }
  applyDamage(target, damage, source, direction, knockback = 0, explosive = false) {
    if (target.dead) return;
    if (target.barrierTimer > 0) damage *= .35;
    if (target.passive?.id === 'thickskin') damage *= .88;
    if (explosive && target.passive?.id === 'blastproof') damage *= .6;
    if (target.passive?.id === 'lucky' && Math.random() < .12) damage = 0;
    if (target.rearPlate && direction && target.aim && direction.dot(target.aim) > .35) damage *= .6;
    // temp shield soaks damage first
    if (target.shield > 0 && damage > 0) { const soaked = Math.min(target.shield, damage); target.shield -= soaked; damage -= soaked; }
    target.hp -= damage;
    if (damage > 0 && target.passive?.id === 'adrenaline') target.statusTimer = Math.max(target.statusTimer || 0, 3);
    if (damage > 0 && source?.passive?.id === 'vampiric' && Number.isFinite(source.maxHp)) source.hp = Math.min(source.maxHp, source.hp + damage * .12);
    if (target.hp <= 0 && target.passive?.id === 'laststand' && !target.lastStandUsed) { target.lastStandUsed = true; target.hp = 1; }
    this.onDamage?.(target, damage, source);
    target.hitTimer = .15;
    if (target.velocity && direction && knockback && target.passive?.id !== 'stonefeet') {
      const dir = direction.clone().normalize(); target.velocity.addScaledVector(dir, knockback);
      if (knockback > 6) { target.state = 'tumble'; target.stun = Math.min(1.5, .25 + knockback * .07); }
    }
    if (target.hp <= 0) { target.hp = 0; target.dead = true; this.particles.burst(target.group.position.clone().add(new THREE.Vector3(0, 1, 0)), target.team === 'blue' ? 0x24aeef : 0xef4455, target.type === 'factory' ? 90 : 42, target.type === 'factory' ? 15 : 9); this.onDeath(target, source); }
  }
  radial(position, radius, damage, source, knockback = 8) { this.particles.burst(position.clone().add(new THREE.Vector3(0, .5, 0)), source?.team === 'blue' ? 0x2eb8ff : 0xff4a58, 28, 9); for (const target of this.getTargets()) { if (!target || target.dead || target === source || target.team === source?.team && target.type !== 'prop') continue; const dist = target.group.position.distanceTo(position); if (dist > radius) continue; const falloff = 1 - dist / radius, dir = target.group.position.clone().sub(position).setY(.35).normalize(); this.applyDamage(target, damage * falloff, source, dir, knockback * falloff, true); } }
  release(p) { p.active = false; p.mesh.visible = false; p.shooter = null; }
}
