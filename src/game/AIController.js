import * as THREE from 'three';

export const AI_BEHAVIORS = Object.freeze([
  { id: 'attack', name: 'ATTACK', description: 'Rush to 8 Destructos, arm the squad, then attack.' },
  { id: 'guard', name: 'GUARD BASE', description: 'Keep building while patrolling and defending the base perimeter.' },
  { id: 'patrol', name: 'PATROL', description: 'Scavenge rare crates, arm up, then launch an attack.' },
  { id: 'build_army', name: 'BUILD ARMY', description: 'All available hands rush Normal Destructos as fast as possible.' },
  { id: 'weapons_galore', name: 'WEAPONS GALORE', description: 'Build upgraded weapons until every Destructo is armed.' },
  { id: 'panzer_general', name: 'PANZER GENERAL', description: 'Stack the complete 3x2x2 crate cube and field a battle tank.' },
  { id: 'bodyguard', name: 'BODYGUARD', description: 'Cancel queued actions and protect the active Destructo.' },
]);

export const chooseSurvivalDecision = (random = Math.random) => random() < .5 ? 'fight' : 'flee';

const AI_DIFFICULTY = Object.freeze({
  rookie: { aim: .11, speed: .9, error: .16 },
  regular: { aim: .18, speed: 1, error: .075 },
  veteran: { aim: .3, speed: 1.12, error: .025 },
});

export class AIController {
  constructor(world, combat, builders, onActive = null, getBehavior = null, getBodyguard = null, onMaterialize = null, getDifficulty = null, interact = null, getTeamUnits = null) {
    this.world = world; this.combat = combat; this.builders = builders; this.onActive = onActive;
    this.getBehavior = getBehavior || (() => 'attack'); this.getBodyguard = getBodyguard || (() => null); this.onMaterialize = onMaterialize;
    this.getDifficulty = getDifficulty || (() => 'regular'); this.interact=interact; this.getTeamUnits=getTeamUnits||(()=>[]); this.scratch = new THREE.Vector3(); this.up = new THREE.Vector3(0, 1, 0);
  }
  findWeakEnemyTeam(myTeam) {
    for (const teamId of Object.keys(this.builders)) {
      if (teamId === myTeam) continue;
      const base = this.world.factories?.[teamId];
      if (base && base.dead) continue;
      const units = this.getTeamUnits(teamId);
      if (units.length > 0 && units.length < 2) {
        return teamId;
      }
    }
    return null;
  }
  builderFor(team) { return this.builders[team]; }
  difficulty() { return AI_DIFFICULTY[this.getDifficulty()] || AI_DIFFICULTY.regular; }
  crewableTank(team) { return (this.world.vehicles||[]).find(v=>!v.dead&&v.team===team&&(!v.driver||(v.passengers?.length||0)<(v.capacity||1)-1)); }
  update(agent, dt, foes) {
    if (agent.dead || agent.player || agent.type==='vehicle') return;
    agent.fireCooldown = Math.max(0, agent.fireCooldown - dt);

    const weakEnemyTeam = this.findWeakEnemyTeam(agent.team);
    if (weakEnemyTeam) {
      const baseFactory = this.world.factories[weakEnemyTeam];
      if (baseFactory && !baseFactory.dead) {
        if (agent.mountedTurret || agent.mountedBunker) {
          this.interact?.exit?.(agent, true);
          return;
        }
        
        const m = agent.mountedMotorcycle;
        if (m && !m.dead) {
          const isDriver = m.driver === agent;
          if (isDriver) {
            const dest = baseFactory.group.position;
            const aim = dest.clone().add(new THREE.Vector3(0, 1, 0)).sub(m.group.position).normalize();
            const dir = aim.clone().setY(0).normalize();
            const dist = dest.distanceTo(m.group.position);
            m.aiDirection = dir;
            m.throttle = dist > 12 ? 1 : 0.35;
            
            if (m.vehicleKind === 'tank') {
              const turretTarget = this.closest(m, foes) || baseFactory;
              const turretAim = turretTarget.group.position.clone().add(new THREE.Vector3(0,1,0)).sub(m.group.position).normalize();
              m.aim.lerp(turretAim, 0.18).normalize();
              const yaw = Math.atan2(m.aim.x, m.aim.z), pitch = THREE.MathUtils.clamp(Math.asin(m.aim.y), THREE.MathUtils.degToRad(-20), THREE.MathUtils.degToRad(40));
              m.turret.rotation.y = yaw - m.group.rotation.y;
              for (const barrel of m.barrels || []) barrel.rotation.x = Math.PI / 2 - pitch;
              m.fireCooldown = Math.max(0, m.fireCooldown - dt);
              this.combat.shoot(m, m.aim);
            }
            return;
          } else if (m.type === 'motorcycle') {
            const passengerTarget = this.closest(agent, foes) || baseFactory;
            if (passengerTarget) {
              agent.aim.lerp(passengerTarget.group.position.clone().add(new THREE.Vector3(0, 1, 0)).sub(agent.group.position).normalize(), 0.22).normalize();
              this.combat.shoot(agent, agent.aim);
            }
            return;
          }
        }
        
        const nearFoe = this.closest(agent, foes);
        const shootTarget = (nearFoe && nearFoe.group.position.distanceTo(agent.group.position) < agent.weapon.range) ? nearFoe : baseFactory;
        this.engage(agent, dt, shootTarget, null, Infinity, true);
        const offset = baseFactory.group.position.clone().sub(agent.group.position).setY(0);
        if (offset.lengthSq() > 4) {
          offset.normalize();
          const speed = (agent.classDef?.speed || agent.speed || 0) * (agent.rallyTimer > 0 ? 1.25 : 1) * (agent.passive?.id === 'swift' ? 1.15 : 1) * ((agent.paceAura || 0) > 0 ? 1.08 : 1) * this.difficulty().speed;
          agent.velocity.x = THREE.MathUtils.lerp(agent.velocity.x, offset.x * speed, dt * 4);
          agent.velocity.z = THREE.MathUtils.lerp(agent.velocity.z, offset.z * speed, dt * 4);
          this.move(agent, dt);
        }
        return;
      }
    }

    if(agent.mountedTurret||agent.mountedBunker||agent.mountedMotorcycle)return this.useInteractive(agent,dt,foes);
    if (agent.freeze > 0) { agent.freeze -= dt; return; }
    // a medic pumping a heal tether plants its feet so the wires don't snap
    if (agent.healPumping) { agent.velocity.multiplyScalar(Math.pow(.02, dt)); this.settle(agent); return; }
    if (agent.stun > 0) { agent.stun -= dt; agent.group.position.addScaledVector(agent.velocity, dt); agent.velocity.multiplyScalar(Math.pow(.12, dt)); this.settle(agent); return; }
    const behavior = agent.type === 'unit' ? this.getBehavior(agent.team) : 'attack';
    if (agent.type === 'unit') {
      const isVeteran = this.getDifficulty() === 'veteran';
      const elapsed = this.world.elapsed || 0;
      const mustCrewTank=(behavior==='panzer_general' || (isVeteran && elapsed > 120))&&this.crewableTank(agent.team);
      if(((!['build_army','weapons_galore','panzer_general'].includes(behavior) && !(isVeteran && elapsed > 120))||mustCrewTank)&&this.seekInteractive(agent,dt,foes))return;
      agent.survivalDecisionTimer = Math.max(0, (agent.survivalDecisionTimer || 0) - dt);
      const healthRatio = agent.hp / agent.maxHp;
      if (healthRatio <= .18) {
        if (!agent.survivalDecision || agent.survivalDecisionTimer <= 0) { agent.survivalDecision = chooseSurvivalDecision(); agent.survivalDecisionTimer = 15; }
        if (agent.survivalDecision === 'flee') return this.flee(agent, dt, foes);
        return this.kamikaze(agent, dt, this.closest(agent, foes));
      }
      if (healthRatio > .35) { agent.survivalDecision = null; agent.survivalDecisionTimer = 0; }
      if (this.fieldScavenge(agent, dt)) return;
    }
    if (behavior === 'bodyguard') return this.bodyguard(agent, dt, foes);
    if (behavior === 'guard') return this.guard(agent, dt, foes);
    if (behavior === 'patrol') return this.patrol(agent, dt, foes);
    if (agent.type === 'unit' && this.build(agent,dt,behavior)) return;
    this.engage(agent, dt, this.closest(agent, foes));
  }
  buildPlan(agent, behavior) {
    const isVeteran = this.getDifficulty() === 'veteran';
    const elapsed = this.world.elapsed || 0;
    if (isVeteran && elapsed > 120) {
      return { goal: 'tank', maxRadius: 100 };
    }
    const units=this.getTeamUnits(agent.team).filter(u=>!u.dead);
    if(behavior==='build_army')return{goal:'army',maxRadius:70};
    if(behavior==='weapons_galore')return units.some(u=>(u.weaponTier||0)<1)?{goal:'weapons',maxRadius:70}:null;
    if(behavior==='panzer_general')return{goal:'tank',maxRadius:85};
    if(units.length<8)return{goal:'army',maxRadius:55};
    if(units.some(u=>(u.weaponTier||0)<1))return{goal:'weapons',maxRadius:50};
    return null;
  }
  build(agent,dt,behavior='attack',extra={}) { const plan=this.buildPlan(agent,behavior);return plan?this.gather(agent,dt,{...plan,...extra}):false; }
  seekInteractive(agent,dt,foes){
    if(!this.interact||agent.carriedCrate||!foes.length)return false;
    agent.interactiveDecision=Math.max(0,(agent.interactiveDecision||0)-dt);
    if(agent.interactiveDecision<=0){
      agent.interactiveDecision=2+Math.random()*2;agent.interactiveGoal=null;
      const choices=[];
      for(const t of Object.values(this.world.baseTurrets||{}))if(!t.dead&&!t.rider&&t.team===agent.team)choices.push(t);
      for(const b of this.world.interactiveStructures||[])if(!b.dead&&b.type==='bunker'&&b.occupants.length<b.capacity)choices.push(b);
      for(const m of [...(this.world.motorcycles||[]),...(this.world.cars||[]),...(this.world.vehicles||[])])if(!m.dead&&(!m.driver||(Array.isArray(m.passengers)?m.passengers.length<(m.capacity||2)-1:!m.passenger)&&m.driver.team===agent.team))choices.push(m);
      let best=null,score=Infinity;for(const e of choices){const d=e.group.position.distanceToSquared(agent.group.position),weighted=d*(e.type==='vehicle' ? .22 : 1);if(weighted<score&&d<42*42){score=weighted;best=e}}
      if(best&&(best.type==='vehicle'||Math.random()<.7))agent.interactiveGoal=best;
    }
    const goal=agent.interactiveGoal;if(!goal||goal.dead)return false;
    const dist=goal.group.position.distanceTo(agent.group.position);
    if(dist<(goal.radius||1)+1.15){const mounted=goal.type==='turret'?this.interact.mountTurret?.(agent,goal):goal.type==='bunker'?this.interact.mountBunker?.(agent,goal):this.interact.mountMotorcycle?.(agent,goal);agent.interactiveGoal=null;return Boolean(mounted)}
    this.moveToward(agent,goal.group.position,dt,1.1);return true;
  }
  useInteractive(agent,dt,foes){
    const target=this.closest(agent,foes);
    if(agent.mountedTurret){const t=agent.mountedTurret;if(t.dead)return this.interact?.exit?.(agent,true);agent.group.position.copy(t.group.position).setY(t.group.position.y+2.3);if(target){const dir=target.group.position.clone().add(new THREE.Vector3(0,1,0)).sub(t.group.position.clone().add(new THREE.Vector3(0,2.5,0))).normalize();t.aim.lerp(dir,.16).normalize();t.head.rotation.y=Math.atan2(t.aim.x,t.aim.z);t.aimPitch=THREE.MathUtils.clamp(Math.asin(t.aim.y),THREE.MathUtils.degToRad(-35),THREE.MathUtils.degToRad(55));for(const barrel of t.barrels||[])barrel.rotation.x=Math.PI/2-t.aimPitch;t.fireCooldown=Math.max(0,t.fireCooldown-dt);if(t.reloadTimer>0){t.reloadTimer=Math.max(0,t.reloadTimer-dt);if(!t.reloadTimer)t.ammo=t.magazineSize}else if(t.ammo>0)this.combat.shoot(t,t.aim);else t.reloadTimer=2}return}
    if(agent.mountedBunker){const b=agent.mountedBunker;if(b.dead)return this.interact?.exit?.(agent,true);const slot=Math.max(0,b.occupants.indexOf(agent));agent.group.position.copy(b.group.position).add(b.slots[slot]||b.slots[0]);if(target){agent.aim.lerp(target.group.position.clone().add(new THREE.Vector3(0,1,0)).sub(agent.group.position).normalize(),.2).normalize();this.combat.shoot(agent,agent.aim)}return}
    const m=agent.mountedMotorcycle;if(!m||m.dead)return this.interact?.exit?.(agent,true);const isDriver=m.driver===agent;if(isDriver){if(target){const aim=target.group.position.clone().add(new THREE.Vector3(0,1,0)).sub(m.group.position).normalize(),dir=aim.clone().setY(0).normalize(),dist=target.group.position.distanceTo(m.group.position);m.aiDirection=dir;m.throttle=dist>12?1:.35;if(m.vehicleKind==='tank'){m.aim.lerp(aim,.18).normalize();const yaw=Math.atan2(m.aim.x,m.aim.z),pitch=THREE.MathUtils.clamp(Math.asin(m.aim.y),THREE.MathUtils.degToRad(-20),THREE.MathUtils.degToRad(40));m.turret.rotation.y=yaw-m.group.rotation.y;for(const barrel of m.barrels||[])barrel.rotation.x=Math.PI/2-pitch;m.fireCooldown=Math.max(0,m.fireCooldown-dt);this.combat.shoot(m,m.aim)}}else{m.throttle=0;m.velocity?.multiplyScalar(Math.pow(.18,dt))}}else if(target&&m.type==='motorcycle'){agent.aim.lerp(target.group.position.clone().add(new THREE.Vector3(0,1,0)).sub(agent.group.position).normalize(),.22).normalize();this.combat.shoot(agent,agent.aim)}
  }
  bodyguard(agent, dt, foes) {
    const leader = this.getBodyguard(agent.team); if (!leader || leader.dead) return this.settle(agent);
    agent.patrolPoint = null; agent.commandPoint = null;
    if (agent.carriedCrate) { const c=agent.carriedCrate;c.carried=false;c.physicsActive=false;c.group.position.copy(agent.group.position);c.group.position.y=this.world.groundAt(c.group.position);agent.carriedCrate=null; }
    const nearby = foes.filter(f => f.group.position.distanceToSquared(leader.group.position) < 18 * 18);
    const threat = this.closest(agent, nearby);
    if (threat && threat.group.position.distanceTo(agent.group.position) < agent.weapon.range) return this.engage(agent, dt, threat, leader.group.position, 13);
    const slotAngle = [...agent.id].reduce((s,c)=>s+c.charCodeAt(0),0) % 628 / 100;
    const follow = leader.group.position.clone().add(new THREE.Vector3(Math.sin(slotAngle)*2.8,0,Math.cos(slotAngle)*2.8));
    this.moveToward(agent, follow, dt, 1.05);
  }
  guard(agent, dt, foes) {
    const base = this.world.basePositions[agent.team]; if (!base) return this.engage(agent,dt,this.closest(agent,foes));
    const threats = foes.filter(f => f.group.position.distanceToSquared(base) < 26 * 26);
    if (threats.length) return this.engage(agent, dt, this.closest(agent, threats), base, 28);
    if (this.build(agent,dt,'attack',{ center: base, maxRadius: 28 })) return;
    if (!agent.guardPoint || agent.group.position.distanceTo(agent.guardPoint) < 1.8 || (agent.guardTimer||0)<=0) {
      agent.guardAngle=(agent.guardAngle??Math.random()*Math.PI*2)+(.7+Math.random()*.55);
      const radius=12+Math.random()*6;agent.guardPoint=base.clone().add(new THREE.Vector3(Math.sin(agent.guardAngle)*radius,0,Math.cos(agent.guardAngle)*radius));agent.guardPoint.y=this.world.groundAt(agent.guardPoint);agent.guardTimer=7;
    }
    agent.guardTimer-=dt;this.moveToward(agent,agent.guardPoint,dt,.82);
  }
  patrol(agent, dt, foes) {
    const armed = (agent.weaponTier || 0) >= 2 || (agent.weapon?.variant?.strength || 0) >= 3;
    if (!armed && this.gather(agent, dt, { rareFirst: true, maxRadius: 55 })) return;
    if (armed) { const target=this.closest(agent,foes); if(target)return this.engage(agent,dt,target); }
    if (!agent.patrolPoint || agent.group.position.distanceTo(agent.patrolPoint) < 2) {
      const a=Math.random()*Math.PI*2,r=18+Math.random()*34;agent.patrolPoint=new THREE.Vector3(Math.cos(a)*r,0,Math.sin(a)*r);agent.patrolPoint.y=this.world.groundAt(agent.patrolPoint);
    }
    this.moveToward(agent,agent.patrolPoint,dt,.8);
  }
  flee(agent, dt, foes) {
    const threat = this.closest(agent, foes), base = this.world.basePositions[agent.team];
    let escape = base?.clone() || agent.group.position.clone();
    if (threat) escape = agent.group.position.clone().sub(threat.group.position).setY(0).normalize().multiplyScalar(14).add(agent.group.position);
    this.moveToward(agent, escape, dt, 1.35 * this.difficulty().speed);
  }
  kamikaze(agent, dt, target) {
    if (!target) return this.settle(agent);
    this.engage(agent, dt, target, null, Infinity, true);
  }
  fieldScavenge(agent, dt) {
    if (!this.onMaterialize) return false;
    const needsHealth = agent.hp < agent.maxHp * .62;
    const needsAmmo = agent.weaponId !== 'pistol' && Number.isFinite(agent.ammo) && agent.ammo < 28;
    if (!needsHealth && !needsAmmo) return false;
    const useful = this.world.pickups.filter(p => (needsHealth && p.drop.id === 'health') || (needsAmmo && p.drop.id === 'ammo'));
    const pickup = this.closest(agent, useful);
    if (pickup && pickup.group.position.distanceTo(agent.group.position) < 24) { this.moveToward(agent, pickup.group.position, dt, 1.08); return true; }
    const ownBuilder = this.builderFor(agent.team);
    if (agent.carriedCrate) {
      if (!ownBuilder || ownBuilder.distanceTo(agent.group.position) > 4.5) { const crate = agent.carriedCrate; agent.carriedCrate = null; this.onMaterialize(agent, crate); return true; }
      const away = agent.group.position.clone().sub(ownBuilder.pad).setY(0).normalize().multiplyScalar(6).add(agent.group.position);
      this.moveToward(agent, away, dt, 1.1); return true;
    }
    const outsideBuild = c => !Object.values(this.builders).some(b => b.distanceTo(c.group.position) < 4.8);
    const crates = this.world.crates.filter(c => !c.carried && !c.placed && !c.falling && outsideBuild(c));
    const crate = this.closest(agent, crates); if (!crate) return false;
    const dist = crate.group.position.distanceTo(agent.group.position);
    if (dist < 1.9) { this.onMaterialize(agent, crate); return true; }
    if (dist < 36) { this.moveToward(agent, crate.group.position, dt, 1.08); return true; }
    return false;
  }
  engage(agent, dt, target, leashCenter = null, leash = Infinity, kamikaze = false) {
    if (!target) { this.settle(agent); return; }
    if (leashCenter && target.group.position.distanceTo(leashCenter) > leash) { this.moveToward(agent,leashCenter,dt,.85); return; }
    const tuning = this.difficulty();
    const offset = this.scratch.copy(target.group.position).sub(agent.group.position), dist = offset.length(); offset.normalize(); agent.aim.lerp(offset, tuning.aim).normalize(); agent.group.rotation.y = Math.atan2(agent.aim.x, agent.aim.z);
    if (agent.active && (agent.abilityCooldown || 0) <= 0 && dist < 15 && this.onActive) this.onActive(agent);
    const desired = kamikaze ? 2.8 : Math.min(agent.weapon.range * .5, 16), speed = (agent.classDef?.speed || agent.speed || 0) * (agent.rallyTimer > 0 ? 1.25 : 1) * (agent.passive?.id === 'swift' ? 1.15 : 1) * ((agent.paceAura || 0) > 0 ? 1.08 : 1) * tuning.speed * (kamikaze ? 1.3 : 1);
    if (dist > desired && !agent.stationary) { agent.velocity.x = THREE.MathUtils.lerp(agent.velocity.x, offset.x * speed, dt * 4); agent.velocity.z = THREE.MathUtils.lerp(agent.velocity.z, offset.z * speed, dt * 4); }
    else { agent.velocity.multiplyScalar(Math.pow(.04, dt)); if (dist < agent.weapon.range) { const shot = agent.aim.clone().applyAxisAngle(this.up, (Math.random() - .5) * tuning.error); this.combat.shoot(agent, shot); } }
    this.move(agent, dt);
  }
  gather(agent, dt, options = {}) {
    const builder = this.builderFor(agent.team); if (!builder) return false;
    if (agent.carriedCrate) {
      const dir = this.scratch.copy(builder.pad).sub(agent.group.position), dist = dir.length();
      const strategy=options.goal==='weapons'?'flat':'towers';
      if (dist < 3.4 && builder.place(agent.carriedCrate, agent.group.position, strategy)) { agent.carriedCrate = null; const recipe=builder.recipe();const ready=options.goal==='tank'?recipe?.id==='tank'&&builder.count()===12:options.goal==='army'?recipe?.output==='unit':options.goal==='weapons'?recipe?.output==='weapon'&&builder.count()>=3:Boolean(recipe);if(ready)builder.manufacture(); return true; }
      dir.normalize(); agent.velocity.lerp(dir.multiplyScalar(agent.classDef.speed), dt * 4); this.move(agent, dt); return true;
    }
    if (builder.count() >= 12) { if(options.goal==='tank'&&builder.recipe()?.id==='tank')builder.manufacture();return false; }
    let candidates=this.world.crates.filter(c=>!c.carried&&!c.placed&&!c.falling);
    if(options.center)candidates=candidates.filter(c=>c.group.position.distanceTo(options.center)<(options.maxRadius||Infinity));
    if(options.maxRadius&&!options.center)candidates=candidates.filter(c=>c.group.position.distanceTo(agent.group.position)<options.maxRadius);
    if(options.rareFirst)candidates.sort((a,b)=>(b.originalType?.tier||b.crateType.tier)-(a.originalType?.tier||a.crateType.tier));
    const crate=options.rareFirst?candidates[0]:this.closest(agent,candidates);if(!crate)return false;
    const dist=crate.group.position.distanceTo(agent.group.position);if(dist<1.7){crate.carried=true;crate.physicsActive=false;crate.visual?.rotation.set(0,0,0);agent.carriedCrate=crate;return true;}
    if(dist<(options.maxRadius||18)){this.moveToward(agent,crate.group.position,dt,1);return true}return false;
  }
  moveToward(agent, point, dt, speedScale = 1) { const dir=this.scratch.copy(point).sub(agent.group.position).setY(0);if(dir.lengthSq()<.02){this.settle(agent);return}dir.normalize();agent.aim.lerp(dir,.15).normalize();agent.group.rotation.y=Math.atan2(agent.aim.x,agent.aim.z);const pace=(agent.passive?.id==='swift'?1.15:1)*((agent.paceAura||0)>0?1.08:1);agent.velocity.lerp(dir.multiplyScalar((agent.classDef?.speed||agent.speed||0)*speedScale*pace),Math.min(1,dt*4));this.move(agent,dt); }
  move(agent, dt) { const drag=this.world.isWater(agent.group.position) ? .5 : 1;agent.group.position.addScaledVector(agent.velocity,dt*drag);this.world.resolveCollisions(agent);this.world.clamp(agent.group.position);this.settle(agent);if(this.world.isWater(agent.group.position)&&agent.velocity.lengthSq()>.5){agent.waterWalkTimer=(agent.waterWalkTimer||0)-dt;if(agent.waterWalkTimer<=0){this.combat.particles.waterSplash(agent.group.position,2,4,.5);agent.waterWalkTimer=.35+Math.random()*.1}} }
  settle(agent) { if(agent.stationary)return;const g=this.world.heightAt(agent.group.position.x,agent.group.position.z);agent.group.position.y=g;agent.groundY=g; }
  closest(agent, list) { let best=null,dist=Infinity;for(const t of list){if(!t||t.dead)continue;const d=t.group.position.distanceToSquared(agent.group.position);if(d<dist){dist=d;best=t}}return best; }
}
