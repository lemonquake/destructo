import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { AIController, chooseSurvivalDecision } from '../src/game/AIController.js';

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
  it('rushes Destructos until the team reaches eight, then arms everybody', () => {
    const seven=Array.from({length:7},()=>({dead:false,weaponTier:0}));
    expect(makeAI(seven).buildPlan({team:'blue'},'attack').goal).toBe('army');
    const eight=Array.from({length:8},()=>({dead:false,weaponTier:0}));
    expect(makeAI(eight).buildPlan({team:'blue'},'attack').goal).toBe('weapons');
    eight.forEach(u=>u.weaponTier=1);
    expect(makeAI(eight).buildPlan({team:'blue'},'attack')).toBeNull();
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
