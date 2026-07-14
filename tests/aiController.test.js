import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { AIController, AI_BEHAVIORS, RANDOM_AI_DOCTRINES, chooseRandomDoctrine, chooseSurvivalDecision, defaultDoctrineForMode } from '../src/game/AIController.js';

describe('AI survival decisions', () => {
  it('uses an even split between fighting and fleeing', () => {
    expect(chooseSurvivalDecision(() => .49)).toBe('fight');
    expect(chooseSurvivalDecision(() => .5)).toBe('flee');
  });
  it('materializes a nearby loose crate when health or ammo is low', () => {
    const crate={carried:false,placed:false,falling:false,group:{position:new THREE.Vector3(1,0,0)}};
    const world={pickups:[],crates:[crate],basePositions:{},groundAt:()=>0};
    const builder={pad:new THREE.Vector3(10,0,0),distanceTo:()=>10};
    let opened=null;
    const ai=new AIController(world,{}, {t0:builder},null,null,null,(unit,target)=>{opened=target});
    const agent={team:'t0',hp:50,maxHp:100,weaponId:'machinegun',ammo:10,group:{position:new THREE.Vector3(),rotation:{y:0}},velocity:new THREE.Vector3(),aim:new THREE.Vector3(0,0,1),classDef:{speed:6}};
    expect(ai.fieldScavenge(agent,.016)).toBe(true);
    expect(opened).toBe(crate);
  });

  it('keeps scavenging after an empty primary was thrown and the pistol was drawn', () => {
    const crate={carried:false,placed:false,falling:false,group:{position:new THREE.Vector3(1,0,0)}};
    const world={pickups:[],crates:[crate],basePositions:{},groundAt:()=>0};
    let opened=null;
    const ai=new AIController(world,{}, {},null,null,null,(unit,target)=>{opened=target});
    const agent={team:'t0',hp:100,maxHp:100,weaponId:'pistol',primaryWeaponId:null,seekingReplacement:true,ammo:0,group:{position:new THREE.Vector3(),rotation:{y:0}},velocity:new THREE.Vector3(),aim:new THREE.Vector3(0,0,1),classDef:{speed:6}};
    expect(ai.fieldScavenge(agent,.016)).toBe(true);
    expect(opened).toBe(crate);
  });
});

describe('AI construction doctrines', () => {
  const makeAI=(units=[])=>new AIController({}, {}, {}, null, null, null, null, null, null, ()=>units);
  it('keeps immediate attack separate from phased construction doctrines', () => {
    expect(makeAI([]).buildPlan({team:'blue'},'attack')).toBeNull();
    expect(makeAI([]).doctrineReady('blue','build_army')).toBe(false);
    const eight=Array.from({length:8},()=>({dead:false,weaponTier:1}));
    expect(makeAI(eight).doctrineReady('blue','build_army')).toBe(true);
    expect(makeAI(eight).doctrineReady('blue','weapons_galore')).toBe(true);
  });
  it('maps the explicit commands to deterministic build goals', () => {
    const ai=makeAI([{dead:false,weaponTier:0}]),agent={team:'blue'};
    expect(ai.buildPlan(agent,'build_army').goal).toBe('army');
    expect(ai.buildPlan(agent,'weapons_galore').goal).toBe('weapons');
    expect(ai.buildPlan(agent,'panzer_general').goal).toBe('tank');
  });
  it('recognizes a friendly tank that still needs an AI crew', () => {
    const tank={type:'vehicle',team:'blue',dead:false,driver:null,passengers:[],capacity:3};
    const ai=new AIController({vehicles:[tank]}, {}, {});
    expect(ai.crewableTank('blue')).toBe(tank);
    tank.driver={};tank.passengers.push({},{});
    expect(ai.crewableTank('blue')).toBeUndefined();
  });
});

describe('strategic team brains',()=>{
  const unit=(team,x,hp=100)=>({id:`${team}-${x}`,team,type:'unit',dead:false,hp,maxHp:100,group:{position:new THREE.Vector3(x,0,0)}});
  it('randomizes CPU doctrines independently without selecting bodyguard',()=>{
    expect(chooseRandomDoctrine(()=>0)).toBe(RANDOM_AI_DOCTRINES[0]);
    expect(chooseRandomDoctrine(()=>.999)).toBe(RANDOM_AI_DOCTRINES.at(-1));
    expect(RANDOM_AI_DOCTRINES).not.toContain('bodyguard');
    const ai=new AIController({}, {}, {}, null,null,null,null,null,null,null,null,null,()=>.2);
    expect(ai.assignRandomDoctrine('a')).toBe(ai.assignRandomDoctrine('b'));
  });
  it('scores targets by battlefield state and alliances, never player identity',()=>{
    const units={a:[unit('a',0)],b:[unit('b',25)],c:[unit('c',60),unit('c',61),unit('c',62)]};
    const world={factories:{},basePositions:{a:new THREE.Vector3(),b:new THREE.Vector3(25,0,0),c:new THREE.Vector3(60,0,0)}};
    const teams=[{id:'a',group:0},{id:'b',group:1,human:true},{id:'c',group:1,human:false}];
    const ai=new AIController(world,{}, {},null,null,null,null,null,null,t=>units[t],()=>teams,(a,b)=>teams.find(t=>t.id===a).group!==teams.find(t=>t.id===b).group,()=>0);
    ai.setTeamDoctrine('a','attack');expect(ai.chooseTargetTeam('a',true)).toBe('b');
    teams[1].human=false;expect(ai.chooseTargetTeam('a',true)).toBe('b');
  });
  it('panics CPU teams while leaving the human team doctrine loyal',()=>{
    const teams=[{id:'human'},{id:'cpu'}],ai=new AIController({}, {}, {},null,null,null,null,null,null,()=>[],()=>teams);
    ai.setTeamDoctrine('human','guard');ai.setTeamDoctrine('cpu','build_army');ai.enterSuddenDeath(['human']);
    expect(ai.brainFor('human')).toMatchObject({doctrine:'guard',suddenDeath:false});
    expect(ai.brainFor('cpu')).toMatchObject({phase:'panic',suddenDeath:true});
  });
  it('abandons CPU build cargo and fixed emplacements when panic begins',()=>{
    const crate={carried:true,physicsActive:true,group:{position:new THREE.Vector3()}},agent=unit('cpu',0);Object.assign(agent,{player:false,fireCooldown:0,carriedCrate:crate,mountedTurret:{},velocity:new THREE.Vector3(),aim:new THREE.Vector3(0,0,1),weapon:{effectiveRange:30},classDef:{speed:6}});
    const enemy=unit('enemy',20),units={cpu:[agent],enemy:[enemy]},teams=[{id:'cpu'},{id:'enemy'}],world={elapsed:1,factories:{cpu:{dead:true},enemy:{dead:true}},basePositions:{cpu:new THREE.Vector3(),enemy:new THREE.Vector3(20,0,0)},groundAt:()=>0};let exited=false;
    const ai=new AIController(world,{}, {},null,null,null,null,null,{exit:()=>{exited=true}},t=>units[t],()=>teams);ai.setTeamDoctrine('cpu','build_army');ai.setTeamDoctrine('enemy','guard');ai.enterSuddenDeath();ai.update(agent,.1,[enemy]);
    expect(agent.carriedCrate).toBeNull();expect(crate.carried).toBe(false);expect(exited).toBe(true);
  });
  it('hunts the nearest hostile directly during sudden death even when the old strategic target is stale',()=>{
    const agent=unit('cpu',0),near=unit('near',8),far=unit('far',40),units={cpu:[agent],near:[near],far:[far]},teams=[{id:'cpu'},{id:'near'},{id:'far'}],world={elapsed:1,factories:{},basePositions:{},groundAt:()=>0};Object.assign(agent,{player:false,fireCooldown:0,velocity:new THREE.Vector3(),aim:new THREE.Vector3(0,0,1),weapon:{effectiveRange:30},classDef:{speed:6}});
    const ai=new AIController(world,{}, {},null,null,null,null,null,null,t=>units[t],()=>teams);ai.setTeamDoctrine('cpu','guard');ai.enterSuddenDeath();ai.brainFor('cpu').targetTeam='far';let hunted=null;ai.engage=(a,dt,target)=>{hunted=target};ai.update(agent,.1,[far,near]);expect(hunted).toBe(near);
  });
  it('uses distributed firing slots and shoots once inside a safe weapon band',()=>{
    const shots=[],world={groundAt:()=>0,heightAt:()=>0,isWater:()=>false,resolveCollisions:()=>{},clamp:()=>{},factories:{},basePositions:{}};
    const ai=new AIController(world,{shoot:(agent,target)=>shots.push([agent,target]),particles:{}},{},null,null,null,null,null,null,()=>[],null,null,()=>.5);
    const makeAgent=(id,x)=>({id,team:'a',weapon:{effectiveRange:30},radius:.72,classDef:{speed:6},group:{position:new THREE.Vector3(x,0,0),rotation:{y:0}},velocity:new THREE.Vector3(),aim:new THREE.Vector3(0,0,1)}),base={type:'factory',radius:4,dead:false,group:{position:new THREE.Vector3()}};
    const slots=[];ai.moveToward=(agent,point)=>slots.push(point.clone());ai.assaultBase(makeAgent('one',50),.1,base);ai.assaultBase(makeAgent('two',50),.1,base);expect(slots[0].distanceTo(slots[1])).toBeGreaterThan(1);
    ai.assaultBase(makeAgent('three',15),.1,base);expect(shots).toHaveLength(1);
  });
  it('assigns one persistent guard to a captured tower when at least three Destructos live',()=>{
    const tower={ownerTeam:'blue',radius:5,position:new THREE.Vector3(12,0,0)},units=Array.from({length:4},(_,i)=>unit('blue',i));
    const ai=new AIController({dominationTowers:[tower]}, {}, {},null,null,null,null,null,null,()=>units,()=>[{id:'blue'}]);
    ai.refreshDominationGuards('blue');const guards=units.filter(u=>u.dominationGuardTower===tower);expect(guards).toHaveLength(1);
    units.filter(u=>u!==guards[0]).slice(0,2).forEach(u=>u.dead=true);ai.refreshDominationGuards('blue');expect(guards[0].dominationGuardTower).toBe(tower);
    tower.ownerTeam='red';ai.refreshDominationGuards('blue');expect(guards[0].dominationGuardTower).toBeNull();
  });
  it('holds standoff distance against structures instead of shooting point blank',()=>{
    const shots=[],world={groundAt:()=>0,heightAt:()=>0,isWater:()=>false,resolveCollisions:()=>0,clamp:()=>{},factories:{},basePositions:{}};
    const ai=new AIController(world,{shoot:(agent,dir)=>shots.push(dir)},{},null,null,null,null,null,null,()=>[],null,null,()=>.5);
    const factory={type:'factory',radius:4,dead:false,group:{position:new THREE.Vector3()}};
    const agent={id:'gunner',team:'a',weapon:{effectiveRange:50},radius:.72,classDef:{speed:6},group:{position:new THREE.Vector3(12,0,0),rotation:{y:0}},velocity:new THREE.Vector3(),aim:new THREE.Vector3(1,0,0)};
    const before=agent.group.position.distanceTo(factory.group.position);
    for(let i=0;i<40;i++)ai.engage(agent,.05,factory);
    // fired the whole time but retreated out to the weapon-range band
    expect(shots.length).toBeGreaterThan(0);
    expect(agent.group.position.distanceTo(factory.group.position)).toBeGreaterThan(before+4);
  });
  it('closes in on mobile enemies only to a mid-range kite distance',()=>{
    const world={groundAt:()=>0,heightAt:()=>0,isWater:()=>false,resolveCollisions:()=>0,clamp:()=>{},factories:{},basePositions:{}};
    const ai=new AIController(world,{shoot:()=>{}},{},null,null,null,null,null,null,()=>[],null,null,()=>.5);
    const enemy={type:'unit',radius:.72,dead:false,group:{position:new THREE.Vector3()}};
    const agent={id:'kiter',team:'a',weapon:{effectiveRange:50},radius:.72,classDef:{speed:6},group:{position:new THREE.Vector3(60,0,0),rotation:{y:0}},velocity:new THREE.Vector3(),aim:new THREE.Vector3(1,0,0)};
    for(let i=0;i<400;i++)ai.engage(agent,.05,enemy);
    const dist=agent.group.position.distanceTo(enemy.group.position);
    expect(dist).toBeGreaterThan(10); // never point blank
    expect(dist).toBeLessThan(50);    // but inside weapon range
  });
});

describe('squad attack-move commands',()=>{
  const makeWorld=()=>({elapsed:1,gameMode:'deathmatch',factories:{},basePositions:{},groundAt:()=>0,heightAt:()=>0,isWater:()=>false,resolveCollisions:()=>0,clamp:()=>{}});
  const makeAgent=()=>({id:'ally-1',team:'blue',type:'unit',dead:false,player:false,hp:100,maxHp:100,fireCooldown:0,weapon:{effectiveRange:30},radius:.72,classDef:{speed:6},group:{position:new THREE.Vector3(),rotation:{y:0}},velocity:new THREE.Vector3(),aim:new THREE.Vector3(0,0,1)});
  it('moves to the ordered point before resuming doctrine',()=>{
    const world=makeWorld(),agent=makeAgent();
    agent.commandPoint=new THREE.Vector3(20,0,0);agent.commandTimer=30;
    const ai=new AIController(world,{shoot:()=>{},particles:{}},{},null,null,null,null,null,null,()=>[agent],()=>[{id:'blue'}],null,()=>.5);
    ai.update(agent,.1,[]);
    expect(agent.group.position.x).toBeGreaterThan(0);
    expect(agent.commandPoint).toBeTruthy();
  });
  it('engages hostiles encountered along the way (attack-move, not blind march)',()=>{
    const world=makeWorld(),agent=makeAgent();
    agent.commandPoint=new THREE.Vector3(40,0,0);agent.commandTimer=30;
    const enemy={id:'e1',team:'red',type:'unit',dead:false,radius:.72,group:{position:new THREE.Vector3(8,0,0)}};
    const ai=new AIController(world,{shoot:()=>{},particles:{}},{},null,null,null,null,null,null,()=>[agent],()=>[{id:'blue'},{id:'red'}],null,()=>.5);
    let engaged=null;ai.engage=(a,dt,target)=>{engaged=target};
    ai.update(agent,.1,[enemy]);
    expect(engaged).toBe(enemy);
  });
  it('assaults an enemy base when the order lands on it, and expires afterwards',()=>{
    const world=makeWorld(),agent=makeAgent();
    const base={id:'rf',team:'red',type:'factory',radius:4,dead:false,group:{position:new THREE.Vector3(42,0,0)}};
    agent.commandPoint=new THREE.Vector3(40,0,0);agent.commandTimer=30;
    const ai=new AIController(world,{shoot:()=>{},particles:{}},{},null,null,null,null,null,null,()=>[agent],()=>[{id:'blue'},{id:'red'}],null,()=>.5);
    let assaulted=null;ai.assaultBase=(a,dt,b)=>{assaulted=b};
    ai.update(agent,.1,[base]);
    expect(assaulted).toBe(base);
    agent.commandTimer=.05;ai.update(agent,.1,[base]);
    expect(agent.commandPoint).toBeNull();
  });
  it('has vehicle drivers drive to the ordered point instead of ignoring it',()=>{
    const world=makeWorld(),agent=makeAgent();
    const bike={type:'motorcycle',dead:false,radius:1.25,group:{position:new THREE.Vector3()},driver:null,throttle:0};
    agent.mountedMotorcycle=bike;bike.driver=agent;
    agent.commandPoint=new THREE.Vector3(30,0,0);agent.commandTimer=30;
    const ai=new AIController(world,{shoot:()=>{},particles:{}},{},null,null,null,null,null,null,()=>[agent],()=>[{id:'blue'}],null,()=>.5);
    ai.update(agent,.1,[]);
    expect(bike.throttle).toBe(1);
    expect(bike.aiDirection.x).toBeGreaterThan(.9);
  });
  it('pulls emplacement gunners off turrets to obey an explicit order',()=>{
    const world=makeWorld(),agent=makeAgent();
    agent.mountedTurret={dead:false,group:{position:new THREE.Vector3()}};
    agent.commandPoint=new THREE.Vector3(30,0,0);agent.commandTimer=30;
    let exited=false;
    const ai=new AIController(world,{shoot:()=>{},particles:{}},{},null,null,null,null,null,{exit:()=>{exited=true}},()=>[agent],()=>[{id:'blue'}],null,()=>.5);
    ai.followCommand(agent,.1,[]);
    expect(exited).toBe(true);
    expect(agent.commandPoint).toBeTruthy();
  });
  it('drops carried cargo when ordered, so builders obey immediately',()=>{
    const world=makeWorld(),agent=makeAgent();
    const crate={carried:true,physicsActive:true,group:{position:new THREE.Vector3(5,3,5)}};
    agent.carriedCrate=crate;agent.commandPoint=new THREE.Vector3(20,0,0);agent.commandTimer=30;
    const ai=new AIController(world,{shoot:()=>{},particles:{}},{},null,null,null,null,null,null,()=>[agent],()=>[{id:'blue'}],null,()=>.5);
    ai.update(agent,.1,[]);
    expect(agent.carriedCrate).toBeNull();
    expect(crate.carried).toBe(false);
  });
  it('uses geometry steering and collision feedback instead of walking into a blocker',()=>{
    const world={navigationDirection:vi.fn(()=>new THREE.Vector3(0,0,1)),isWater:()=>false,resolveCollisions:()=>1,clamp:()=>{},heightAt:()=>0},agent={id:'walker',team:'blue',radius:.72,classDef:{speed:6},group:{position:new THREE.Vector3(),rotation:{y:0}},velocity:new THREE.Vector3(),aim:new THREE.Vector3(1,0,0)};
    const ai=new AIController(world,{particles:{}},{},null,null,null,null,null,null,()=>[agent]);ai.moveToward(agent,new THREE.Vector3(10,0,0),.1);
    expect(world.navigationDirection).toHaveBeenCalled();expect(agent.group.position.z).toBeGreaterThan(0);expect(agent.aiCollisionFrames).toBeGreaterThan(0);
  });
});

describe('default squad doctrine per game mode', () => {
  it('starts Deathmatch allies on GUARD BASE so they build and defend until ordered otherwise', () => {
    expect(defaultDoctrineForMode('deathmatch')).toBe('guard');
    expect(AI_BEHAVIORS.some(b => b.id === defaultDoctrineForMode('deathmatch'))).toBe(true);
  });
  it('keeps Tower Dominion (no builders) and unknown modes on attack', () => {
    expect(defaultDoctrineForMode('domination')).toBe('attack');
    expect(defaultDoctrineForMode('anything-else')).toBe('attack');
  });
});
