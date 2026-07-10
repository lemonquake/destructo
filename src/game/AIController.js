import * as THREE from 'three';

export class AIController {
  constructor(world, combat, builders, onActive = null) { this.world = world; this.combat = combat; this.builders = builders; this.onActive = onActive; this.scratch = new THREE.Vector3(); }
  builderFor(team) { return this.builders[team] || this.builders.blue; }
  update(agent, dt, allies, enemies, player) {
    if (agent.dead || agent.player) return; agent.fireCooldown = Math.max(0, agent.fireCooldown - dt);
    if (agent.freeze > 0) { agent.freeze -= dt; return; }
    if (agent.stun > 0) { agent.stun -= dt; agent.group.position.addScaledVector(agent.velocity, dt); agent.velocity.multiplyScalar(Math.pow(.12, dt)); return; }
    if (agent.type === 'unit' && this.gather(agent, dt)) return;
    const targets = agent.team === 'blue' ? enemies : allies; let target = this.closest(agent, targets.filter(t => !t.dead));
    if (!target && agent.team === 'red') target = player;
    if (!target) return;
    const offset = this.scratch.copy(target.group.position).sub(agent.group.position), dist = offset.length(); offset.normalize(); agent.aim.lerp(offset, .18).normalize(); agent.group.rotation.y = Math.atan2(agent.aim.x, agent.aim.z); agent.head && (agent.head.rotation.y = Math.atan2(agent.aim.x, agent.aim.z) - agent.group.rotation.y);
    // special destructos fire off their active skill when a fight is on
    if (agent.active && (agent.abilityCooldown || 0) <= 0 && dist < 15 && this.onActive) this.onActive(agent);
    const desired = agent.team === 'blue' ? Math.min(agent.weapon.range * .55, 18) : Math.min(agent.weapon.range * .45, 15), speed = (agent.classDef?.speed || agent.speed || 0) * (agent.rallyTimer > 0 ? 1.25 : 1);
    if (dist > desired && !agent.stationary) { const flank = Math.sin(performance.now() * .001 + (agent.bobSeed || 0)) * .28; const vx = offset.x - offset.z * flank, vz = offset.z + offset.x * flank; agent.velocity.x = THREE.MathUtils.lerp(agent.velocity.x, vx * speed, dt * 4); agent.velocity.z = THREE.MathUtils.lerp(agent.velocity.z, vz * speed, dt * 4); } else { agent.velocity.multiplyScalar(Math.pow(.04, dt)); if (dist < agent.weapon.range) this.combat.shoot(agent, agent.aim); }
    this.move(agent, dt);
  }
  gather(agent, dt) {
    const builder = this.builderFor(agent.team); if (!builder) return false;
    if (agent.carriedCrate) {
      const dir = this.scratch.copy(builder.pad).sub(agent.group.position), dist = dir.length();
      if (dist < 3.4) {
        if (builder.place(agent.carriedCrate, agent.group.position, 'towers')) {
          agent.carriedCrate = null;
          // red team runs its own economy: fire the builder once it holds a valid combo
          if (agent.team === 'red' && builder.recipe() && (builder.count() >= 4 || (builder.count() >= 2 && Math.random() < .4))) builder.manufacture();
          return true;
        }
      }
      dir.normalize(); agent.velocity.lerp(dir.multiplyScalar(agent.classDef.speed), dt * 4); this.move(agent, dt); return true;
    }
    if (builder.count() >= 4) return false;
    const crate = this.closest(agent, this.world.crates.filter(c => !c.carried && !c.placed && !c.falling));
    if (!crate) return false;
    const dist = crate.group.position.distanceTo(agent.group.position);
    if (dist < 1.7) { crate.carried = true; agent.carriedCrate = crate; return true; }
    if (dist < 18) { const dir = this.scratch.copy(crate.group.position).sub(agent.group.position).normalize(); agent.velocity.lerp(dir.multiplyScalar(agent.classDef.speed), dt * 4); this.move(agent, dt); return true; }
    return false;
  }
  move(agent, dt) { const drag = this.world.isWater(agent.group.position) ? .5 : 1; agent.group.position.addScaledVector(agent.velocity, dt * drag); this.world.clamp(agent.group.position); }
  closest(agent, list) { let best = null, dist = Infinity; for (const t of list) { if (!t || t.dead) continue; const d = t.group.position.distanceToSquared(agent.group.position); if (d < dist) { dist = d; best = t; } } return best; }
}
