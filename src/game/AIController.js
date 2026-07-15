import * as THREE from 'three';

export const AI_BEHAVIORS = Object.freeze([
  { id: 'attack', name: 'ATTACK', description: 'Select a strategic enemy and attack immediately.' },
  { id: 'guard', name: 'GUARD BASE', description: 'Keep building while patrolling and defending the base perimeter.' },
  { id: 'patrol', name: 'PATROL', description: 'Scavenge rare weapons, arm the squad, then launch an attack.' },
  { id: 'build_army', name: 'BUILD ARMY', description: 'Rush to 8 Destructos, then launch a coordinated attack.' },
  { id: 'weapons_galore', name: 'WEAPONS GALORE', description: 'Arm every Destructo with an upgraded weapon, then attack.' },
  { id: 'panzer_general', name: 'PANZER GENERAL', description: 'Build and crew a battle tank, then attack with it.' },
  { id: 'bodyguard', name: 'BODYGUARD', description: 'Cancel queued actions and protect the active Destructo.' },
]);

export const RANDOM_AI_DOCTRINES = Object.freeze(['attack', 'guard', 'patrol', 'build_army', 'weapons_galore', 'panzer_general']);

// The player's AI squadmates start every Deathmatch on GUARD BASE — they keep
// manufacturing Destructos and hold the perimeter until the player issues a
// different doctrine (C/V). Domination has no builders, so ATTACK stays.
export const DEFAULT_TEAM_DOCTRINE = Object.freeze({ deathmatch: 'guard', domination: 'attack' });
export const defaultDoctrineForMode = mode => DEFAULT_TEAM_DOCTRINE[mode] || 'attack';
export const chooseRandomDoctrine = (random = Math.random) => RANDOM_AI_DOCTRINES[Math.floor(random() * RANDOM_AI_DOCTRINES.length) % RANDOM_AI_DOCTRINES.length];

export const chooseSurvivalDecision = (random = Math.random) => random() < .5 ? 'fight' : 'flee';

const AI_DIFFICULTY = Object.freeze({
  rookie: { aim: .11, speed: .9, error: .16 },
  regular: { aim: .18, speed: 1, error: .075 },
  veteran: { aim: .3, speed: 1.12, error: .025 },
});

// Targets that cannot chase are shot from near max weapon range instead of
// point blank; everything of these types (plus anything stationary) counts.
const STRUCTURE_TYPES = new Set(['factory', 'turret', 'bunker', 'tower']);

// Aggro: any AI destructo (allies included) that spots a hostile inside the
// acquire radius locks onto it and fights until it dies. The lock survives
// doctrine duties and only breaks if the target dies, defects, or slips past
// the larger drop radius — the gap keeps the lock from flickering at the edge.
export const AGGRO_ACQUIRE_RANGE = 16;
export const AGGRO_DROP_RANGE = 32;

// Base defense: damage to a team's factory or base turret raises an alarm for
// BASE_ALARM_SECONDS (refreshed per hit). Destructos inside the defend radius
// are drafted to fight the attacker; farther ones rush home only when nobody
// is already holding the fort. Attackers count as sieging while inside the
// (slightly larger) alert radius.
export const BASE_ALERT_RADIUS = 36;
export const BASE_DEFEND_RADIUS = 30;
export const BASE_ALARM_SECONDS = 8;

// Healer duty: a medic looks for wounded allies this far out and walks to
// tether range instead of fighting (the game layer attaches the wires).
export const HEAL_SEEK_RADIUS = 30;
const HEAL_HOLD_RANGE = 7.5; // inside the tether's ~8.8 attach distance

export class AIController {
  constructor(world, combat, builders, onActive = null, getBehavior = null, getBodyguard = null, onMaterialize = null, getDifficulty = null, interact = null, getTeamUnits = null, getTeams = null, isHostile = null, random = Math.random) {
    this.world = world; this.combat = combat; this.builders = builders; this.onActive = onActive;
    this.getBehavior = getBehavior || (() => 'attack'); this.getBodyguard = getBodyguard || (() => null); this.onMaterialize = onMaterialize;
    this.getDifficulty = getDifficulty || (() => 'regular'); this.interact=interact; this.getTeamUnits=getTeamUnits||(()=>[]);
    this.getTeams=getTeams||(()=>Object.keys(this.builders).map(id=>({id})));this.isHostile=isHostile||((a,b)=>a!==b);this.random=random;
    this.teamBrains=new Map();this.suddenDeath=false;this.scratch = new THREE.Vector3(); this.up = new THREE.Vector3(0, 1, 0);
  }
  setTeamDoctrine(teamId, doctrine = 'attack') {
    const current=this.teamBrains.get(teamId);
    const brain=current||{teamId,targetTeam:null,targetScore:-Infinity,reassessIn:0,suddenDeath:false};
    brain.doctrine=AI_BEHAVIORS.some(b=>b.id===doctrine)?doctrine:'attack';brain.phase=['attack','guard','bodyguard'].includes(brain.doctrine)?brain.doctrine:'prepare';
    brain.targetTeam=null;brain.targetScore=-Infinity;brain.reassessIn=0;this.teamBrains.set(teamId,brain);return brain;
  }
  assignRandomDoctrine(teamId) { const doctrine=chooseRandomDoctrine(this.random);this.setTeamDoctrine(teamId,doctrine);return doctrine; }
  brainFor(teamId) { return this.teamBrains.get(teamId)||this.setTeamDoctrine(teamId,this.getBehavior(teamId)); }
  enterSuddenDeath(exemptTeams = []) { const exempt=new Set(exemptTeams);this.suddenDeath=true;for(const team of this.getTeams()){const brain=this.brainFor(team.id);brain.suddenDeath=!exempt.has(team.id);if(brain.suddenDeath)brain.phase='panic';brain.targetTeam=null;brain.targetScore=-Infinity;brain.reassessIn=0;brain.baseThreat=null;for(const unit of this.getTeamUnits(team.id)){unit.panicInitialized=false;unit.aiMoveGoal=null;unit.aiStuckTimer=0;unit.aiRecoveryTimer=0;unit.navPlan=null;unit.aggroTarget=null;unit.healGoal=null;}} }
  livingStrength(teamId) { return this.getTeamUnits(teamId).filter(u=>!u.dead).reduce((sum,u)=>sum+1+Math.max(0,u.hp||0)/Math.max(1,u.maxHp||1),0); }
  teamAnchor(teamId) {
    const base=this.world.factories?.[teamId];if(base&&!base.dead)return base.group.position;
    const units=this.getTeamUnits(teamId).filter(u=>!u.dead);if(!units.length)return this.world.basePositions?.[teamId]||null;
    return units.reduce((p,u)=>p.add(u.group.position),new THREE.Vector3()).multiplyScalar(1/units.length);
  }
  targetScore(myTeam, enemyTeam) {
    const mine=this.teamAnchor(myTeam),enemy=this.teamAnchor(enemyTeam);if(!enemy)return-Infinity;
    const distance=mine?mine.distanceTo(enemy):0,strength=this.livingStrength(enemyTeam),base=this.world.factories?.[enemyTeam];
    const baseRatio=base&&!base.dead?Math.max(0,base.hp)/Math.max(1,base.maxHp):0,ownBase=this.world.basePositions?.[myTeam];
    const threat=ownBase?this.getTeamUnits(enemyTeam).filter(u=>!u.dead&&u.group.position.distanceToSquared(ownBase)<28*28).length:0;
    return 100/(12+distance)+Math.max(0,12-strength)*2.2+(1-baseRatio)*8+threat*5;
  }
  targetIsValid(myTeam, targetTeam) {
    if(!targetTeam||!this.isHostile(myTeam,targetTeam))return false;
    const base=this.world.factories?.[targetTeam],units=this.getTeamUnits(targetTeam).some(u=>!u.dead);
    return Boolean(units||(!this.suddenDeath&&base&&!base.dead));
  }
  chooseTargetTeam(myTeam, force=false) {
    const brain=this.brainFor(myTeam);brain.reassessIn=Math.max(0,brain.reassessIn||0);
    if(brain.suddenDeath&&!force&&this.targetIsValid(myTeam,brain.targetTeam))return brain.targetTeam;
    const candidates=this.getTeams().filter(t=>this.isHostile(myTeam,t.id)&&this.targetIsValid(myTeam,t.id));
    if(!candidates.length){brain.targetTeam=null;brain.targetScore=-Infinity;return null;}
    let best=null,bestScore=-Infinity;for(const t of candidates){const score=this.targetScore(myTeam,t.id);if(score>bestScore){best=t.id;bestScore=score;}}
    if(force||!this.targetIsValid(myTeam,brain.targetTeam)||brain.reassessIn<=0&&(bestScore>brain.targetScore*1.2||best===brain.targetTeam)){brain.targetTeam=best;brain.targetScore=bestScore;brain.reassessIn=4+this.random()*2;}
    return brain.targetTeam;
  }
  builderFor(team) { return this.builders[team]; }
  difficulty() { return AI_DIFFICULTY[this.getDifficulty()] || AI_DIFFICULTY.regular; }
  crewableTank(team) { return (this.world.vehicles||[]).find(v=>!v.dead&&v.team===team&&(!v.driver||(v.passengers?.length||0)<(v.capacity||1)-1)); }
  refreshDominationGuards(team){
    const units=this.getTeamUnits(team).filter(u=>!u.dead&&u.type==='unit'),owned=(this.world.dominationTowers||[]).filter(t=>t.ownerTeam&&!this.isHostile(team,t.ownerTeam));
    for(const unit of units){if(unit.dominationGuardTower&&!owned.includes(unit.dominationGuardTower)){unit.dominationGuardTower=null;unit.towerGuardPoint=null;}}
    if(units.length<3)return;
    const existing=new Set(units.map(u=>u.dominationGuardTower).filter(Boolean)),capacity=Math.max(0,units.length-2-existing.size);
    let assigned=0;for(const tower of owned){if(existing.has(tower)||assigned>=capacity)continue;const candidates=units.filter(u=>!u.dominationGuardTower&&!u.mountedTurret&&!u.mountedBunker&&!u.mountedMotorcycle);candidates.sort((a,b)=>a.group.position.distanceToSquared(tower.position)-b.group.position.distanceToSquared(tower.position));const guard=candidates[0];if(!guard)break;guard.dominationGuardTower=tower;guard.dominationTarget=null;guard.towerGuardPoint=null;existing.add(tower);assigned++;}
  }
  guardDominationTower(agent,dt,foes){
    const tower=agent.dominationGuardTower;if(!tower)return false;
    if(!tower.ownerTeam||this.isHostile(agent.team,tower.ownerTeam)){agent.dominationGuardTower=null;agent.towerGuardPoint=null;return false;}
    const threat=this.closest(agent,foes.filter(f=>f&&!f.dead&&this.isHostile(agent.team,f.team)&&f.group.position.distanceToSquared(tower.position)<20*20));
    if(threat){this.engage(agent,dt,threat,tower.position,18,false,1.12);return true;}
    agent.towerGuardTimer=Math.max(0,(agent.towerGuardTimer||0)-dt);
    if(!agent.towerGuardPoint||agent.towerGuardTimer<=0||agent.group.position.distanceToSquared(agent.towerGuardPoint)<1.2){const hash=[...String(agent.id)].reduce((sum,c)=>sum+c.charCodeAt(0),0),angle=hash*.41+(agent.towerGuardRevision||0)*1.7;agent.towerGuardRevision=(agent.towerGuardRevision||0)+1;agent.towerGuardTimer=4.5;agent.towerGuardPoint=tower.position.clone().add(new THREE.Vector3(Math.sin(angle)*tower.radius*.72,0,Math.cos(angle)*tower.radius*.72));agent.towerGuardPoint.y=this.world.groundAt(agent.towerGuardPoint);}
    this.moveToward(agent,agent.towerGuardPoint,dt,.88);return true;
  }
  update(agent, dt, foes) {
    if (agent.dead || agent.player || agent.type==='vehicle') return;
    agent.fireCooldown = Math.max(0, agent.fireCooldown - dt);
    if(agent.missionScripted)return;
    const brain=this.brainFor(agent.team);if(brain.lastTick!==this.world.elapsed){brain.lastTick=this.world.elapsed;brain.reassessIn=Math.max(0,(brain.reassessIn||0)-dt);brain.guardRefreshIn=Math.max(0,(brain.guardRefreshIn||0)-dt);if(brain.baseThreat)brain.baseThreat.timer=Math.max(0,brain.baseThreat.timer-dt);}
    if(brain.suddenDeath)return this.panic(agent,dt,foes,brain);
    const mounted=agent.mountedTurret||agent.mountedBunker||agent.mountedMotorcycle;
    if(!mounted){
      // status effects gate everything on foot, including domination duties
      if (agent.freeze > 0) { agent.freeze -= dt; return; }
      // a medic pumping a heal tether plants its feet so the wires don't snap
      if (agent.healPumping) { agent.velocity.multiplyScalar(Math.pow(.02, dt)); this.settle(agent); return; }
      if (agent.stun > 0) { agent.stun -= dt; agent.group.position.addScaledVector(agent.velocity, dt); agent.velocity.multiplyScalar(Math.pow(.12, dt)); this.settle(agent); return; }
    }
    // Once a primary is emptied and discarded, replenishing ammo/replacing it
    // outranks combat. The infinite pistol keeps the Destructo defensible while
    // travelling, but it must not make the scavenging need disappear.
    if(!mounted&&agent.type==='unit'&&agent.seekingReplacement&&this.fieldScavenge(agent,dt))return;
    // a player-issued attack-move order outranks doctrine until it expires;
    // vehicle drivers drive there, emplacement gunners dismount to comply
    if (agent.type==='unit' && this.followCommand(agent, dt, foes)) return;

    // healers do their duty first: with a charged tether and a wounded ally
    // in reach, a medic closes to wire range instead of joining the fight —
    // it only picks up a weapon when there is nobody left to heal
    if (!mounted && this.healerDuty(agent, dt)) return;
    // a base under siege drafts defenders before personal grudges are settled
    if (!mounted && agent.type === 'unit' && !agent.ignoreBases && this.defendBase(agent, dt, foes, brain)) return;
    // aggro outranks every doctrine duty below: a hostile inside the acquire
    // radius is fought to the death, no matter what the agent was doing
    const aggro = this.updateAggro(agent, foes);
    if (aggro) {
      if (mounted) return this.useInteractive(agent, dt, [aggro]);
      this.dropCrate(agent);
      return this.engage(agent, dt, aggro);
    }

    if(this.world.gameMode==='domination'&&agent.type==='unit'&&!mounted){
      if((brain.guardRefreshIn||0)<=0){brain.guardRefreshIn=.85;this.refreshDominationGuards(agent.team);}
      if(this.guardDominationTower(agent,dt,foes))return;
      const nearby=this.closest(agent,foes);if(nearby&&nearby.group.position.distanceToSquared(agent.group.position)<15*15){this.engage(agent,dt,nearby);return;}
      agent.dominationDecision=Math.max(0,(agent.dominationDecision||0)-dt);
      if(!agent.dominationTarget||agent.dominationDecision<=0||(agent.dominationTarget.ownerTeam&&!this.isHostile(agent.team,agent.dominationTarget.ownerTeam))){
        agent.dominationDecision=2+this.random()*2;
        const candidates=(this.world.dominationTowers||[]).filter(t=>!t.ownerTeam||this.isHostile(agent.team,t.ownerTeam));
        agent.dominationTarget=candidates.sort((a,b)=>a.position.distanceToSquared(agent.group.position)-b.position.distanceToSquared(agent.group.position))[0]||null;
      }
      const tower=agent.dominationTarget;if(tower){if(tower.position.distanceToSquared(agent.group.position)>tower.radius*tower.radius*.45)this.moveToward(agent,tower.position,dt,1.08);else this.settle(agent);return;}
    }

    const targetTeam=this.chooseTargetTeam(agent.team),focused=targetTeam?foes.filter(f=>f.team===targetTeam):foes;
    if(mounted)return this.useInteractive(agent,dt,focused.length?focused:foes);
    const behavior = agent.type === 'unit' ? brain.doctrine : 'attack';
    if (agent.type === 'unit') {
      const isVeteran = this.getDifficulty() === 'veteran';
      const elapsed = this.world.elapsed || 0;
      const mustCrewTank=(behavior==='panzer_general' || brain.phase==='attack' || (isVeteran && elapsed > 120))&&this.crewableTank(agent.team);
      if(((!['build_army','weapons_galore','panzer_general'].includes(behavior) && !(isVeteran && elapsed > 120))||mustCrewTank)&&this.seekInteractive(agent,dt,foes))return;
      agent.survivalDecisionTimer = Math.max(0, (agent.survivalDecisionTimer || 0) - dt);
      const healthRatio = agent.hp / agent.maxHp;
      if (healthRatio <= .18) {
        if (!agent.survivalDecision || agent.survivalDecisionTimer <= 0) { agent.survivalDecision = chooseSurvivalDecision(this.random); agent.survivalDecisionTimer = 15; }
        if (agent.survivalDecision === 'flee') return this.flee(agent, dt, foes);
        return this.kamikaze(agent, dt, this.closest(agent, foes));
      }
      if (healthRatio > .35) { agent.survivalDecision = null; agent.survivalDecisionTimer = 0; }
      if (this.fieldScavenge(agent, dt)) return;
    }
    if (behavior === 'bodyguard') return this.bodyguard(agent, dt, foes);
    if (behavior === 'guard') return this.guard(agent, dt, foes);
    if(brain.phase==='prepare'){
      if(this.doctrineReady(agent.team,behavior)){brain.phase='attack';}
      else if (behavior === 'patrol') return this.patrol(agent, dt, foes);
      else if (agent.type === 'unit' && this.build(agent,dt,behavior)) return;
    }
    return this.attackOrder(agent,dt,foes,brain);
  }
  // Maintain the agent's aggro lock. An existing target is kept — even while
  // other enemies wander closer — until it dies or crosses the drop radius;
  // with no lock, the closest hostile inside the acquire radius is claimed.
  updateAggro(agent, foes) {
    const current = agent.aggroTarget;
    if (current && (current.dead || !this.isHostile(agent.team, current.team) ||
      current.group.position.distanceToSquared(agent.group.position) > AGGRO_DROP_RANGE * AGGRO_DROP_RANGE)) agent.aggroTarget = null;
    if (!agent.aggroTarget) {
      const nearby = foes.filter(f => f && !f.dead && f.type !== 'factory' && this.isHostile(agent.team, f.team) &&
        f.group.position.distanceToSquared(agent.group.position) < AGGRO_ACQUIRE_RANGE * AGGRO_ACQUIRE_RANGE);
      agent.aggroTarget = this.closest(agent, nearby);
    }
    return agent.aggroTarget;
  }
  // Retaliation: taking a hit aggros the victim onto its FIRST attacker, even
  // one shooting from outside the visual acquire radius. Later hits from other
  // sources never steal a live lock — that commitment is what keeps a
  // Destructo from thrashing between targets in a chaotic crossfire. The lock
  // transfers only after the current target dies or breaks past the drop
  // radius, at which point the next hit (or updateAggro) claims a new one.
  notifyDamage(victim, attacker) {
    if (!victim || !attacker || victim === attacker) return;
    // hits on a manned emplacement or vehicle alert the crew inside
    for (const crew of [victim.driver, ...(victim.passengers || []), victim.rider, ...(victim.occupants || [])])
      if (crew) this.notifyDamage(crew, attacker);
    if (victim.dead || victim.player || !victim.team || !attacker.team) return;
    if (attacker.dead || attacker.type === 'factory' || !this.isHostile(victim.team, attacker.team)) return;
    if (victim.aggroTarget && !victim.aggroTarget.dead) return; // committed to the first attacker
    if (!attacker.group?.position || !victim.group?.position) return;
    if (attacker.group.position.distanceToSquared(victim.group.position) > AGGRO_DROP_RANGE * AGGRO_DROP_RANGE) return;
    victim.aggroTarget = attacker;
  }
  // Base alarm: refreshed on every hit the base takes, sticky to the first
  // reported attacker so the whole team converges on one enemy.
  notifyBaseAttack(teamId, attacker) {
    if (!teamId) return;
    const brain = this.brainFor(teamId);
    const threat = brain.baseThreat || (brain.baseThreat = { attacker: null, timer: 0 });
    threat.timer = BASE_ALARM_SECONDS;
    if (attacker && !attacker.dead && attacker.team && attacker.type !== 'factory' && attacker.group?.position &&
      this.isHostile(teamId, attacker.team) && (!threat.attacker || threat.attacker.dead)) threat.attacker = attacker;
  }
  // Home-defense reflex. Nearby Destructos are drafted: whatever they were
  // doing, they turn on the base attacker (leashed to home so they fall back
  // instead of being baited away). Far Destructos keep to their doctrine
  // unless NOBODY is defending — then they sprint home. A far unit already in
  // its own aggro fight finishes that fight first, like anyone would.
  defendBase(agent, dt, foes, brain) {
    const threat = brain.baseThreat;
    if (!threat) return false;
    if (threat.timer <= 0) { brain.baseThreat = null; return false; }
    const base = this.world.basePositions?.[agent.team];
    if (!base) { brain.baseThreat = null; return false; }
    // resolve the siege target: stick with the reported attacker while it
    // lives and stays near home, otherwise the closest hostile to the base
    let attacker = threat.attacker;
    if (!attacker || attacker.dead || !this.isHostile(agent.team, attacker.team) ||
      attacker.group.position.distanceToSquared(base) > BASE_ALERT_RADIUS * BASE_ALERT_RADIUS) {
      attacker = null; let best = Infinity;
      for (const f of foes) {
        if (!f || f.dead || f.type === 'factory') continue;
        const d = f.group.position.distanceToSquared(base);
        if (d < BASE_ALERT_RADIUS * BASE_ALERT_RADIUS && d < best) { best = d; attacker = f; }
      }
      threat.attacker = attacker;
    }
    if (!attacker) return false; // alarm still ringing but the raider left/died
    if (agent.group.position.distanceToSquared(base) < BASE_DEFEND_RADIUS * BASE_DEFEND_RADIUS) {
      // drafted: keep an existing lock only if that fight is also happening
      // at home, otherwise the base attacker becomes the committed target
      const current = agent.aggroTarget;
      if (!current || current.dead || !this.isHostile(agent.team, current.team) ||
        current.group.position.distanceToSquared(base) > BASE_ALERT_RADIUS * BASE_ALERT_RADIUS) agent.aggroTarget = attacker;
      this.dropCrate(agent);
      this.engage(agent, dt, agent.aggroTarget, base, BASE_ALERT_RADIUS);
      return true;
    }
    if (agent.aggroTarget && !agent.aggroTarget.dead) return false; // finish the current fight first
    const defenders = this.getTeamUnits(agent.team).filter(u => u !== agent && !u.dead &&
      u.group.position.distanceToSquared(base) < BASE_DEFEND_RADIUS * BASE_DEFEND_RADIUS);
    if (defenders.length) return false; // someone is on it — stay on mission
    this.dropCrate(agent);
    this.moveToward(agent, base, dt, 1.25);
    return true;
  }
  // Medic duty: pick the most urgent wounded ally in reach and hold inside
  // tether range so the game layer can attach the heal wires. The pick is
  // committed for a beat so two equally hurt allies don't cause dithering.
  healerDuty(agent, dt) {
    if (agent.classId !== 'medic' || agent.healPumping) return false;
    if ((agent.abilityCooldown || 0) > 0 || agent.mp < 15) return false; // kit spent — fight like the rest
    agent.healDutyTimer = Math.max(0, (agent.healDutyTimer || 0) - dt);
    const goal = agent.healGoal;
    const goalValid = goal && !goal.dead && goal.hp < goal.maxHp * .95 &&
      goal.group.position.distanceToSquared(agent.group.position) < HEAL_SEEK_RADIUS * HEAL_SEEK_RADIUS;
    if (!goalValid || agent.healDutyTimer <= 0) {
      agent.healGoal = null; agent.healDutyTimer = 1.2;
      let best = Infinity;
      for (const team of this.getTeams()) {
        if (this.isHostile(agent.team, team.id)) continue;
        for (const ally of this.getTeamUnits(team.id)) {
          if (ally === agent || ally.dead || ally.hp >= ally.maxHp * .7) continue;
          const d = ally.group.position.distanceToSquared(agent.group.position);
          if (d < best && d < HEAL_SEEK_RADIUS * HEAL_SEEK_RADIUS) { best = d; agent.healGoal = ally; }
        }
      }
      // keep a still-wounded committed patient over a marginally closer one
      if (goalValid && agent.healGoal !== goal && goal.hp < goal.maxHp * .7) agent.healGoal = goal;
    }
    const patient = agent.healGoal;
    if (!patient) return false; // nobody left to heal
    this.dropCrate(agent);
    if (patient.group.position.distanceToSquared(agent.group.position) < HEAL_HOLD_RANGE * HEAL_HOLD_RANGE) {
      agent.velocity.multiplyScalar(Math.pow(.05, dt));
      this.settle(agent);
      return true;
    }
    this.moveToward(agent, patient.group.position, dt, 1.12);
    return true;
  }
  dropCrate(agent){
    if(!agent.carriedCrate)return;
    const crate=agent.carriedCrate;crate.carried=false;crate.physicsActive=false;
    crate.group.position.copy(agent.group.position);crate.group.position.y=this.world.groundAt(crate.group.position);
    agent.carriedCrate=null;
  }
  // RTS attack-move: head for the ordered point, fight anything hostile that
  // shows up on the way or around the destination, hold there briefly, then
  // hand control back to the doctrine when the order expires.
  followCommand(agent, dt, foes) {
    if (!agent.commandPoint) return false;
    agent.commandTimer = (agent.commandTimer ?? 30) - dt;
    if (agent.commandTimer <= 0) { agent.commandPoint = null; agent.commandArrived = false; return false; }
    const point = agent.commandPoint, range = agent.weapon?.effectiveRange || 20;
    // an explicit order pulls gunners off their emplacements
    if (agent.mountedTurret || agent.mountedBunker) { this.interact?.exit?.(agent, true); return false; }
    const m = agent.mountedMotorcycle;
    if (m) {
      if (m.driver !== agent) return false; // passengers ride along
      if (m.group.position.distanceToSquared(point) < 8 * 8) {
        if (!agent.commandArrived) { agent.commandArrived = true; agent.commandTimer = Math.min(agent.commandTimer, 9); }
        return false; // arrived: fight from the saddle via useInteractive
      }
      const dir = point.clone().sub(m.group.position).setY(0).normalize();
      m.aiDirection = this.world.navigationDirection?.(m.group.position, dir, m.radius || 2, 5.5, m, m.aiRecoverySide || 1) || dir;
      m.throttle = 1;
      return true;
    }
    this.dropCrate(agent);
    const near = foes.filter(f => f && !f.dead && f.type !== 'factory' &&
      (f.group.position.distanceToSquared(agent.group.position) < range * range || f.group.position.distanceToSquared(point) < 16 * 16));
    const threat = this.closest(agent, near);
    if (threat) { this.engage(agent, dt, threat, point, 30); return true; }
    // an order dropped onto an enemy base means "assault it", with standoff
    const base = this.closest(agent, foes.filter(f => f && !f.dead && f.type === 'factory' && f.group.position.distanceToSquared(point) < 20 * 20));
    if (base) { this.assaultBase(agent, dt, base); return true; }
    if (agent.group.position.distanceToSquared(point) < 2.6 * 2.6) {
      if (!agent.commandArrived) { agent.commandArrived = true; agent.commandTimer = Math.min(agent.commandTimer, 9); }
      agent.velocity.multiplyScalar(Math.pow(.05, dt));
      this.settle(agent);
      return true;
    }
    this.moveToward(agent, point, dt, 1.12);
    return true;
  }
  doctrineReady(team,behavior){
    const units=this.getTeamUnits(team).filter(u=>!u.dead);
    if(behavior==='build_army')return units.length>=8;
    if(behavior==='weapons_galore')return units.length>0&&units.every(u=>(u.weaponTier||0)>=1);
    if(behavior==='panzer_general')return (this.world.vehicles||[]).some(v=>!v.dead&&v.team===team&&v.vehicleKind==='tank');
    if(behavior==='patrol')return units.length>0&&units.every(u=>(u.weaponTier||0)>=2||(u.weapon?.variant?.strength||0)>=3);
    return true;
  }
  attackOrder(agent,dt,foes,brain){
    const immediate=foes.filter(f=>f.type!=='factory'&&f.group.position.distanceToSquared(agent.group.position)<12*12),threat=this.closest(agent,immediate);
    if(threat)return this.engage(agent,dt,threat);
    const team=this.chooseTargetTeam(agent.team),base=this.world.factories?.[team];
    if(base&&!base.dead)return this.assaultBase(agent,dt,base);
    const targets=foes.filter(f=>f.team===team&&f.type!=='factory');return this.engage(agent,dt,this.closest(agent,targets));
  }
  panic(agent,dt,foes,brain){
    if(!agent.panicInitialized){agent.panicInitialized=true;agent.patrolPoint=agent.guardPoint=agent.commandPoint=agent.interactiveGoal=agent.dominationTarget=agent.navPlan=null;agent.dominationDecision=agent.interactiveDecision=0;agent.survivalDecision=null;agent.healPumping=false;this.dropCrate(agent);}
    const targets=foes.filter(f=>f&&!f.dead&&f.type!=='factory'&&this.isHostile(agent.team,f.team));
    const nearby=targets.filter(f=>f.group.position.distanceToSquared(agent.group.position)<12*12),target=this.closest(agent,nearby.length?nearby:targets);
    const loneSurvivor=this.getTeamUnits(agent.team).filter(u=>!u.dead).length===1;
    if(agent.mountedTurret||agent.mountedBunker){const emplacement=agent.mountedTurret||agent.mountedBunker,range=emplacement.weapon?.effectiveRange||agent.weapon?.effectiveRange||30,canHold=loneSurvivor&&target&&emplacement.group?.position&&target.group.position.distanceToSquared(emplacement.group.position)<=range*range;if(canHold)return this.useInteractive(agent,dt,targets);this.interact?.exit?.(agent,true);agent.aiMoveGoal=null;agent.aiStuckTimer=0;return;}
    if(agent.mountedMotorcycle)return this.useInteractive(agent,dt,targets);
    if(!target){brain.targetTeam=null;brain.reassessIn=0;agent.aiMoveGoal=null;this.settle(agent);return;}
    brain.targetTeam=target.team;
    return this.engage(agent,dt,target,null,Infinity,false,1.3);
  }
  buildPlan(agent, behavior) {
    const units=this.getTeamUnits(agent.team).filter(u=>!u.dead);
    if(behavior==='build_army')return{goal:'army',maxRadius:70};
    if(behavior==='weapons_galore')return units.some(u=>(u.weaponTier||0)<1)?{goal:'weapons',maxRadius:70}:null;
    if(behavior==='panzer_general')return{goal:'tank',maxRadius:85};
    return null;
  }
  build(agent,dt,behavior='attack',extra={}) { const plan=this.buildPlan(agent,behavior);return plan?this.gather(agent,dt,{...plan,...extra}):false; }
  seekInteractive(agent,dt,foes){
    if(!this.interact||agent.carriedCrate||!foes.length)return false;
    agent.interactiveDecision=Math.max(0,(agent.interactiveDecision||0)-dt);
    if(agent.interactiveDecision<=0){
      agent.interactiveDecision=2+this.random()*2;agent.interactiveGoal=null;
      const choices=[];
      for(const t of Object.values(this.world.baseTurrets||{}))if(!t.dead&&!t.rider&&t.team===agent.team)choices.push(t);
      for(const b of this.world.interactiveStructures||[])if(!b.dead&&b.type==='bunker'&&b.occupants.length<b.capacity)choices.push(b);
      for(const m of [...(this.world.motorcycles||[]),...(this.world.cars||[]),...(this.world.vehicles||[])])if(!m.dead&&(!m.driver||(Array.isArray(m.passengers)?m.passengers.length<(m.capacity||2)-1:!m.passenger)&&m.driver.team===agent.team))choices.push(m);
      let best=null,score=Infinity;for(const e of choices){const d=e.group.position.distanceToSquared(agent.group.position),weighted=d*(e.type==='vehicle' ? .22 : 1);if(weighted<score&&d<42*42){score=weighted;best=e}}
      if(best&&(best.type==='vehicle'||this.random()<.7))agent.interactiveGoal=best;
    }
    const goal=agent.interactiveGoal;if(!goal||goal.dead)return false;
    const dist=goal.group.position.distanceTo(agent.group.position);
    if(dist<(goal.radius||1)+1.15){const mounted=goal.type==='turret'?this.interact.mountTurret?.(agent,goal):goal.type==='bunker'?this.interact.mountBunker?.(agent,goal):this.interact.mountMotorcycle?.(agent,goal);agent.interactiveGoal=null;return Boolean(mounted)}
    this.moveToward(agent,goal.group.position,dt,1.1);return true;
  }
  useInteractive(agent,dt,foes){
    const target=this.closest(agent,foes);
    if(agent.mountedTurret){const t=agent.mountedTurret;if(t.dead)return this.interact?.exit?.(agent,true);agent.group.position.copy(t.group.position).setY(t.group.position.y+2.3);if(target){const dir=this.combat.ballisticDirectionFor?.(t,target)||target.group.position.clone().add(new THREE.Vector3(0,1,0)).sub(t.group.position.clone().add(new THREE.Vector3(0,2.5,0))).normalize();t.aim.lerp(dir,.16).normalize();t.head.rotation.y=Math.atan2(t.aim.x,t.aim.z);t.aimPitch=THREE.MathUtils.clamp(Math.asin(t.aim.y),THREE.MathUtils.degToRad(-35),THREE.MathUtils.degToRad(55));for(const barrel of t.barrels||[])barrel.rotation.x=Math.PI/2-t.aimPitch;t.fireCooldown=Math.max(0,t.fireCooldown-dt);if(t.reloadTimer>0){t.reloadTimer=Math.max(0,t.reloadTimer-dt);if(!t.reloadTimer)t.ammo=t.magazineSize}else if(t.ammo>0)this.combat.shoot(t,t.aim);else t.reloadTimer=2}return}
    if(agent.mountedBunker){const b=agent.mountedBunker;if(b.dead)return this.interact?.exit?.(agent,true);const slot=Math.max(0,b.occupants.indexOf(agent));agent.group.position.copy(b.group.position).add(b.slots[slot]||b.slots[0]);if(target){agent.aim.lerp(this.combat.ballisticDirectionFor?.(agent,target)||target.group.position.clone().add(new THREE.Vector3(0,1,0)).sub(agent.group.position).normalize(),.2).normalize();this.combat.shoot(agent,agent.aim)}return}
    const m=agent.mountedMotorcycle;if(!m||m.dead)return this.interact?.exit?.(agent,true);const isDriver=m.driver===agent;if(isDriver){if(target){const aim=this.combat.ballisticDirectionFor?.(m,target)||target.group.position.clone().add(new THREE.Vector3(0,1,0)).sub(m.group.position).normalize(),dir=aim.clone().setY(0).normalize(),dist=target.group.position.distanceTo(m.group.position),weaponRange=m.weapon?.effectiveRange||30;if((m.aiCollisionFrames||0)>3){m.aiRecoveryTimer=1.35;m.aiRecoverySide=(m.aiRecoverySide||1)*-1;m.aiCollisionFrames=0;}if((m.aiRecoveryTimer||0)>0){m.aiRecoveryTimer=Math.max(0,m.aiRecoveryTimer-dt);dir.applyAxisAngle(this.up,m.aiRecoverySide*Math.PI*.42);}m.aiDirection=this.world.navigationDirection?.(m.group.position,dir,m.radius||2,5.5,m,m.aiRecoverySide||1)||dir;const desired=this.isStructure(target)?Math.max((target.radius||4)+(m.radius||2)+2.5,Math.min(weaponRange*.72,weaponRange-4)):12;m.throttle=dist>desired+2?1:dist<desired-2?-.35:0;if(m.vehicleKind==='tank'){m.aim.lerp(aim,.18).normalize();const yaw=Math.atan2(m.aim.x,m.aim.z),pitch=THREE.MathUtils.clamp(Math.asin(m.aim.y),THREE.MathUtils.degToRad(-20),THREE.MathUtils.degToRad(40));m.turret.rotation.y=yaw-m.group.rotation.y;for(const barrel of m.barrels||[])barrel.rotation.x=Math.PI/2-pitch;m.fireCooldown=Math.max(0,m.fireCooldown-dt);if(dist<weaponRange)this.combat.shoot(m,m.aim)}}else{m.throttle=0;m.velocity?.multiplyScalar(Math.pow(.18,dt))}}else if(target&&m.type==='motorcycle'){agent.aim.lerp(this.combat.ballisticDirectionFor?.(agent,target)||target.group.position.clone().add(new THREE.Vector3(0,1,0)).sub(agent.group.position).normalize(),.22).normalize();this.combat.shoot(agent,agent.aim)}
  }
  bodyguard(agent, dt, foes) {
    const leader = this.getBodyguard(agent.team); if (!leader || leader.dead) return this.settle(agent);
    agent.patrolPoint = null; agent.commandPoint = null;
    this.dropCrate(agent);
    const nearby = foes.filter(f => f.group.position.distanceToSquared(leader.group.position) < 18 * 18);
    const threat = this.closest(agent, nearby);
    if (threat && threat.group.position.distanceTo(agent.group.position) < (agent.weapon?.effectiveRange || 20)) return this.engage(agent, dt, threat, leader.group.position, 13);
    const slotAngle = [...agent.id].reduce((s,c)=>s+c.charCodeAt(0),0) % 628 / 100;
    const follow = leader.group.position.clone().add(new THREE.Vector3(Math.sin(slotAngle)*2.8,0,Math.cos(slotAngle)*2.8));
    this.moveToward(agent, follow, dt, 1.05);
  }
  guard(agent, dt, foes) {
    const base = this.world.basePositions[agent.team]; if (!base) return this.engage(agent,dt,this.closest(agent,foes));
    const threats = foes.filter(f => f.group.position.distanceToSquared(base) < 26 * 26);
    if (threats.length) return this.engage(agent, dt, this.closest(agent, threats), base, 28);
    const units=this.getTeamUnits(agent.team).filter(u=>!u.dead),goal=units.length<8?'army':units.some(u=>(u.weaponTier||0)<1)?'weapons':null;
    if (goal&&this.gather(agent,dt,{ goal, center: base, maxRadius: 28 })) return;
    if (!agent.guardPoint || agent.group.position.distanceTo(agent.guardPoint) < 1.8 || (agent.guardTimer||0)<=0) {
      agent.guardAngle=(agent.guardAngle??this.random()*Math.PI*2)+(.7+this.random()*.55);
      const radius=12+this.random()*6;agent.guardPoint=base.clone().add(new THREE.Vector3(Math.sin(agent.guardAngle)*radius,0,Math.cos(agent.guardAngle)*radius));agent.guardPoint.y=this.world.groundAt(agent.guardPoint);agent.guardTimer=7;
    }
    agent.guardTimer-=dt;this.moveToward(agent,agent.guardPoint,dt,.82);
  }
  patrol(agent, dt, foes) {
    const armed = (agent.weaponTier || 0) >= 2 || (agent.weapon?.variant?.strength || 0) >= 3;
    if (!armed && this.gather(agent, dt, { goal: 'weapons', rareFirst: true, maxRadius: 55 })) return;
    if (!agent.patrolPoint || agent.group.position.distanceTo(agent.patrolPoint) < 2) {
      const a=this.random()*Math.PI*2,r=18+this.random()*34;agent.patrolPoint=new THREE.Vector3(Math.cos(a)*r,0,Math.sin(a)*r);agent.patrolPoint.y=this.world.groundAt(agent.patrolPoint);
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
    const needsAmmo = Number.isFinite(agent.ammo) && agent.ammo < 28 && Boolean(agent.primaryWeaponId||agent.weaponId!=='pistol'||agent.seekingReplacement);
    const needsWeapon = Boolean(agent.seekingReplacement&&!agent.primaryWeaponId);
    if (!needsHealth && !needsAmmo && !needsWeapon) return false;
    const useful = this.world.pickups.filter(p => (needsHealth && p.drop.id === 'health') || (needsAmmo && p.drop.id === 'ammo') || (needsWeapon && p.drop.id === 'weapon' && (!p.drop.spent||agent.ammo>0)));
    const pickup = this.closest(agent, useful);
    if (pickup && pickup.group.position.distanceTo(agent.group.position) < 24) { this.moveToward(agent, pickup.group.position, dt, 1.08); return true; }
    const ownBuilder = this.builderFor(agent.team);
    if (agent.carriedCrate) {
      if (!ownBuilder || ownBuilder.distanceTo(agent.group.position) > 4.5) { const crate = agent.carriedCrate; agent.carriedCrate = null; this.onMaterialize(agent, crate); return true; }
      const away = agent.group.position.clone().sub(ownBuilder.pad).setY(0).normalize().multiplyScalar(6).add(agent.group.position);
      this.moveToward(agent, away, dt, 1.1); return true;
    }
    const outsideBuild = c => !Object.values(this.builders).some(b => b.distanceTo(c.group.position) < 4.8);
    const crates = this.world.crates.filter(c => !c.carried && !c.placed && !c.falling && !c.noAI && !c.questItem && outsideBuild(c));
    const crate = this.closest(agent, crates); if (!crate) return false;
    const dist = crate.group.position.distanceTo(agent.group.position);
    if (dist < 1.9) { this.onMaterialize(agent, crate); return true; }
    if (dist < 36) { this.moveToward(agent, crate.group.position, dt, 1.08); return true; }
    return false;
  }
  isStructure(target){return STRUCTURE_TYPES.has(target?.type)||Boolean(target?.stationary&&target.type!=='unit');}
  // Weapon-range-proportional engagement band with hysteresis. Structures are
  // shot from near max range (they can't chase, so there is no reason to
  // close in); mobile targets are held at a mid-range kite distance. `min` is
  // the back-off trigger, `max` the approach trigger — the gap prevents
  // oscillating in place.
  standoffFor(agent, target) {
    const range = agent.weapon?.effectiveRange || 20;
    const safe = (target.radius || 1) + (agent.radius || .72) + 1.2;
    if (this.isStructure(target)) {
      const desired = Math.max(safe + 1.5, Math.min(range * .72, range - 3));
      return { desired, min: Math.max(safe, desired - 3), max: Math.min(Math.max(range * .92, desired), desired + 3.5), range };
    }
    // contact weapons (mines) must press to touch range or they never fire
    if (range <= safe + 1.5) return { desired: range * .7, min: 0, max: range * .9, range };
    const desired = Math.max(safe, Math.min(range * .58, 22));
    return { desired, min: Math.max(safe, desired * .5), max: Math.min(Math.max(range * .92, desired), desired + 4), range };
  }
  // Coarse line-of-fire test against the nav grid (structures rasterize, so
  // the ray stops short of the target's own footprint). Keeps units from
  // emptying magazines into a rock between them and the enemy.
  hasFireLine(agent, target, dist) {
    if (!this.world.navLineClear) return true;
    const stopShort = Math.max(0, dist - (target.radius || 1) - 1.2);
    return this.world.navLineClear(agent.group.position, target.group.position, .45, stopShort);
  }
  fire(agent, tuning = this.difficulty()) { const target=agent.aiTarget;const solved=target?this.combat.ballisticDirectionFor?.(agent,target):null,shot=(solved||agent.aim).clone().applyAxisAngle(this.up, (this.random() - .5) * tuning.error); this.combat.shoot(agent, shot); }
  // Retreat while still facing and shooting the target; the whisker layer
  // keeps the kite from backing into a wall.
  backpedal(agent, target, dt, speedScale = 1) {
    const away = agent.group.position.clone().sub(target.group.position).setY(0);
    if (away.lengthSq() < 1e-4) away.set(1, 0, 0); away.normalize();
    const steered = this.world.navigationDirection?.(agent.group.position, away, agent.radius || .72, 2.5, agent, agent.aiRecoverySide || 1) || away;
    agent.velocity.lerp(steered.multiplyScalar((agent.classDef?.speed || agent.speed || 6) * speedScale * .85), Math.min(1, dt * 5));
    this.move(agent, dt);
  }
  assaultBase(agent,dt,base){
    if(!base||base.dead)return this.settle(agent);agent.aiTarget=base;const tuning=this.difficulty(),dist=base.group.position.distanceTo(agent.group.position);
    const band=this.standoffFor(agent,base),hash=[...String(agent.id)].reduce((s,c)=>s+c.charCodeAt(0),0),angle=hash*.73+(agent.aiFlankRevision||0)*.9;
    const slot=base.group.position.clone().add(new THREE.Vector3(Math.sin(angle)*band.desired,0,Math.cos(angle)*band.desired));slot.y=this.world.groundAt(slot);
    const aim=base.group.position.clone().add(new THREE.Vector3(0,1.5,0)).sub(agent.group.position).normalize();agent.aim.lerp(aim,tuning.aim).normalize();agent.group.rotation.y=Math.atan2(agent.aim.x,agent.aim.z);
    const lit=dist<band.range&&this.hasFireLine(agent,base,dist);
    if(dist<band.min&&!agent.stationary){if(lit)this.fire(agent,tuning);return this.backpedal(agent,base,dt,tuning.speed);}
    if(dist<=band.max&&lit){agent.velocity.multiplyScalar(Math.pow(.04,dt));this.fire(agent,tuning);return this.move(agent,dt);}
    if(lit)this.fire(agent,tuning); // keep shooting while sliding to the firing slot
    return this.moveToward(agent,slot,dt,1.08*tuning.speed);
  }
  engage(agent, dt, target, leashCenter = null, leash = Infinity, kamikaze = false, speedBoost = 1) {
    if (!target) { agent.aiTarget=null;this.settle(agent); return; }
    agent.aiTarget=target;
    if (leashCenter && target.group.position.distanceTo(leashCenter) > leash) { this.moveToward(agent,leashCenter,dt,.85); return; }
    const tuning = this.difficulty();
    const offset = this.scratch.copy(target.group.position).sub(agent.group.position), dist = offset.length(); offset.normalize(); agent.aim.lerp(offset, tuning.aim).normalize(); agent.group.rotation.y = Math.atan2(agent.aim.x, agent.aim.z);
    if (agent.active && (agent.abilityCooldown || 0) <= 0 && dist < 15 && this.onActive) this.onActive(agent);
    const moveScale=(agent.rallyTimer>0?1.25:1)*tuning.speed*(kamikaze?1.3:1)*speedBoost;
    if (kamikaze) {
      if (dist > 2.8 && !agent.stationary) return this.moveToward(agent,target.group.position,dt,moveScale);
      agent.velocity.multiplyScalar(Math.pow(.04, dt));
      if (dist < (agent.weapon?.effectiveRange || 20)) this.fire(agent, tuning);
      return this.move(agent, dt);
    }
    const band = this.standoffFor(agent, target);
    const lit = dist < band.range && this.hasFireLine(agent, target, dist);
    if ((dist > band.max || !lit) && !agent.stationary) { if (lit) this.fire(agent, tuning); return this.moveToward(agent,target.group.position,dt,moveScale); }
    if (dist < band.min && !agent.stationary) { if (lit) this.fire(agent, tuning); return this.backpedal(agent, target, dt, moveScale); }
    agent.velocity.multiplyScalar(Math.pow(.04, dt));
    if (lit || agent.stationary) this.fire(agent, tuning);
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
    let candidates=this.world.crates.filter(c=>!c.carried&&!c.placed&&!c.falling&&!c.noAI&&!c.questItem);
    if(options.center)candidates=candidates.filter(c=>c.group.position.distanceTo(options.center)<(options.maxRadius||Infinity));
    if(options.maxRadius&&!options.center)candidates=candidates.filter(c=>c.group.position.distanceTo(agent.group.position)<options.maxRadius);
    if(options.rareFirst)candidates.sort((a,b)=>(b.originalType?.tier||b.crateType.tier)-(a.originalType?.tier||a.crateType.tier));
    const crate=options.rareFirst?candidates[0]:this.closest(agent,candidates);if(!crate)return false;
    const dist=crate.group.position.distanceTo(agent.group.position);if(dist<1.7){crate.carried=true;crate.physicsActive=false;crate.visual?.rotation.set(0,0,0);agent.carriedCrate=crate;return true;}
    if(dist<(options.maxRadius||18)){this.moveToward(agent,crate.group.position,dt,1);return true}return false;
  }
  // Global route layer: pick the immediate steering target for this frame.
  // Open ground (the common case) short-circuits to the goal after a cheap
  // grid line test; blocked routes get an A* path that is cached per agent
  // and refreshed on a randomized cadence so repaths never spike one frame.
  navTarget(agent, goal, dt, distance) {
    const grid = this.world.nav;
    if (!grid || distance < 3) return goal;
    const plan = agent.navPlan || (agent.navPlan = { path: null, goal: null, repathIn: 0, version: -1 });
    plan.repathIn = Math.max(0, plan.repathIn - dt);
    const radius = agent.radius || .72;
    const goalMoved = !plan.goal || plan.goal.distanceToSquared(goal) > 4;
    if (goalMoved || plan.version !== grid.version || plan.repathIn <= 0) {
      plan.goal = (plan.goal || new THREE.Vector3()).copy(goal);
      plan.version = grid.version;
      plan.repathIn = .8 + this.random() * .7;
      plan.path = grid.lineClear(agent.group.position, goal, radius) ? null : grid.findPath(agent.group.position, goal, radius);
    }
    const path = plan.path;
    if (!path || !path.length) return goal;
    // consume reached waypoints, then skip any waypoint we can already
    // beeline to — this keeps the route taut as the agent cuts corners
    while (path.length > 1 && agent.group.position.distanceToSquared(path[0]) < 1.44) path.shift();
    while (path.length > 1 && grid.lineClear(agent.group.position, path[1], radius)) path.shift();
    return path[0];
  }
  moveToward(agent, point, dt, speedScale = 1) {
    const dir=point.clone().sub(agent.group.position).setY(0),distance=dir.length();if(distance<.14){agent.velocity.multiplyScalar(Math.pow(.04,dt));this.settle(agent);return}
    const waypoint=this.navTarget(agent,point,dt,distance);
    dir.copy(waypoint).sub(agent.group.position).setY(0);if(dir.lengthSq()<1e-6)dir.set(0,0,1);dir.normalize();
    // stuck detection tracks progress toward the FINAL goal, not the waypoint
    const moved=agent.aiLastMovePosition?agent.group.position.distanceToSquared(agent.aiLastMovePosition):Infinity;agent.aiLastMovePosition=(agent.aiLastMovePosition||new THREE.Vector3()).copy(agent.group.position);
    if(!agent.aiMoveGoal||agent.aiMoveGoal.distanceToSquared(point)>4){agent.aiMoveGoal=point.clone();agent.aiBestDistance=distance;agent.aiStuckTimer=0;}else if(distance<(agent.aiBestDistance||Infinity)-.3){agent.aiBestDistance=distance;agent.aiStuckTimer=0;}else if(moved<.0016||agent.aiCollisionFrames>0)agent.aiStuckTimer=(agent.aiStuckTimer||0)+dt;else agent.aiStuckTimer=Math.max(0,(agent.aiStuckTimer||0)-dt*.45);
    if(agent.aiStuckTimer>.85){agent.aiStuckTimer=0;agent.aiBestDistance=distance;agent.aiRecoveryTimer=1.4;const seed=[...String(agent.id)].reduce((sum,c)=>sum+c.charCodeAt(0),0);agent.aiRecoverySide=(agent.aiRecoverySide||((seed%2)*2-1))*-1;agent.aiFlankRevision=(agent.aiFlankRevision||0)+agent.aiRecoverySide;agent.velocity.multiplyScalar(.25);
      // being stuck means the cached route is wrong — force a fresh plan now
      if(agent.navPlan){agent.navPlan.repathIn=0;agent.navPlan.path=null;agent.navPlan.goal=null;}}
    agent.aiCollisionFrames=Math.max(0,(agent.aiCollisionFrames||0)-1);
    if((agent.aiRecoveryTimer||0)>0){agent.aiRecoveryTimer=Math.max(0,agent.aiRecoveryTimer-dt);dir.applyAxisAngle(this.up,agent.aiRecoverySide*Math.PI*.34);}
    const separation=new THREE.Vector3();for(const ally of this.getTeamUnits(agent.team)){if(ally===agent||ally.dead)continue;const away=agent.group.position.clone().sub(ally.group.position).setY(0),d=away.length();if(d>0&&d<2.4)separation.addScaledVector(away.normalize(),(2.4-d)/2.4);}
    if(separation.lengthSq()>.001)dir.addScaledVector(separation.normalize(),.7).normalize();const preferred=agent.aiRecoverySide||1,steered=this.world.navigationDirection?.(agent.group.position,dir,agent.radius||.72,Math.min(4,Math.max(2,(agent.classDef?.speed||agent.speed||6)*.55)),agent,preferred)||dir;agent.aim.lerp(steered,.22).normalize();agent.group.rotation.y=Math.atan2(agent.aim.x,agent.aim.z);const pace=(agent.passive?.id==='swift'?1.15:1)*((agent.paceAura||0)>0?1.08:1);agent.velocity.lerp(steered.multiplyScalar((agent.classDef?.speed||agent.speed||0)*speedScale*pace),Math.min(1,dt*5));this.move(agent,dt);
  }
  move(agent, dt) { const drag=this.world.isWater(agent.group.position) ? .5 : 1;agent.group.position.addScaledVector(agent.velocity,dt*drag);const collisions=this.world.resolveCollisions(agent)||0;if(collisions){agent.aiCollisionFrames=Math.min(12,(agent.aiCollisionFrames||0)+2);agent.velocity.multiplyScalar(.55);}this.world.clamp(agent.group.position);this.settle(agent);if(this.world.isWater(agent.group.position)&&agent.velocity.lengthSq()>.5){agent.waterWalkTimer=(agent.waterWalkTimer||0)-dt;if(agent.waterWalkTimer<=0){this.combat.particles.waterSplash(agent.group.position,2,4,.5);agent.waterWalkTimer=.35+Math.random()*.1}} }
  settle(agent) { if(agent.stationary)return;const g=this.world.heightAt(agent.group.position.x,agent.group.position.z);agent.group.position.y=g;agent.groundY=g; }
  closest(agent, list) { let best=null,dist=Infinity;for(const t of list){if(!t||t.dead)continue;const d=t.group.position.distanceToSquared(agent.group.position);if(d<dist){dist=d;best=t}}return best; }
}
