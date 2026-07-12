import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { AIController, RANDOM_AI_DOCTRINES, chooseRandomDoctrine, chooseSurvivalDecision } from '../src/game/AIController.js';

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
    const crate={carried:true,physicsActive:true,group:{position:new THREE.Vector3()}},agent=unit('cpu',0);Object.assign(agent,{player:false,fireCooldown:0,carriedCrate:crate,mountedTurret:{},velocity:new THREE.Vector3(),aim:new THREE.Vector3(0,0,1),weapon:{range:30},classDef:{speed:6}});
    const enemy=unit('enemy',20),units={cpu:[agent],enemy:[enemy]},teams=[{id:'cpu'},{id:'enemy'}],world={elapsed:1,factories:{cpu:{dead:true},enemy:{dead:true}},basePositions:{cpu:new THREE.Vector3(),enemy:new THREE.Vector3(20,0,0)},groundAt:()=>0};let exited=false;
    const ai=new AIController(world,{}, {},null,null,null,null,null,{exit:()=>{exited=true}},t=>units[t],()=>teams);ai.setTeamDoctrine('cpu','build_army');ai.setTeamDoctrine('enemy','guard');ai.enterSuddenDeath();ai.update(agent,.1,[enemy]);
    expect(agent.carriedCrate).toBeNull();expect(crate.carried).toBe(false);expect(exited).toBe(true);
  });
  it('uses distributed firing slots and shoots once inside a safe weapon band',()=>{
    const shots=[],world={groundAt:()=>0,heightAt:()=>0,isWater:()=>false,resolveCollisions:()=>{},clamp:()=>{},factories:{},basePositions:{}};
    const ai=new AIController(world,{shoot:(agent,target)=>shots.push([agent,target]),particles:{}},{},null,null,null,null,null,null,()=>[],null,null,()=>.5);
    const makeAgent=(id,x)=>({id,team:'a',weapon:{range:30},radius:.72,classDef:{speed:6},group:{position:new THREE.Vector3(x,0,0),rotation:{y:0}},velocity:new THREE.Vector3(),aim:new THREE.Vector3(0,0,1)}),base={type:'factory',radius:4,dead:false,group:{position:new THREE.Vector3()}};
    const slots=[];ai.moveToward=(agent,point)=>slots.push(point.clone());ai.assaultBase(makeAgent('one',50),.1,base);ai.assaultBase(makeAgent('two',50),.1,base);expect(slots[0].distanceTo(slots[1])).toBeGreaterThan(1);
    ai.assaultBase(makeAgent('three',15),.1,base);expect(shots).toHaveLength(1);
  });
});
