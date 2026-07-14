import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { WEAPONS } from '../src/data/gameData.js';
import { CombatSystem, ballisticGravity, solveBallisticDirection } from '../src/game/CombatSystem.js';

const at=(x=0,y=0,z=0)=>{const group=new THREE.Group();group.position.set(x,y,z);return group};
const shooter=(weapon=WEAPONS.pistol)=>({type:'unit',team:'blue',dead:false,freeze:0,fireCooldown:0,weaponId:'pistol',weapon,group:at(),aim:new THREE.Vector3(1,0,0),velocity:new THREE.Vector3(),buffs:{}});
const particles=()=>({impact:vi.fn(),burst:vi.fn(),muzzleFlash:vi.fn(),activeEffectCount:()=>0});
const world=(overrides={})=>({bounds:200,colliders:[],groundAt:()=>-100,surfaceAt:()=> 'dirt',isWater:()=>false,...overrides});

describe('ballistic weapon contract',()=>{
  it('defines the complete ballistic interface without legacy projectile fields',()=>{
    for(const weapon of Object.values(WEAPONS)){
      expect(weapon).toHaveProperty('bulletSpeed');expect(weapon).toHaveProperty('shotPower');expect(weapon).toHaveProperty('effectiveRange');expect(weapon).toHaveProperty('ballistic');
      expect(weapon.speed).toBeUndefined();expect(weapon.range).toBeUndefined();
    }
    expect(WEAPONS.mine).toMatchObject({bulletSpeed:0,shotPower:0,ballistic:false});
  });

  it('uses shot power to flatten gravity while preserving constant horizontal velocity',()=>{
    expect(ballisticGravity({shotPower:50,ballistic:true})).toBeCloseTo(18);
    expect(ballisticGravity({shotPower:90,ballistic:true})).toBeLessThan(ballisticGravity({shotPower:40,ballistic:true}));
    const combat=new CombatSystem(new THREE.Scene(),particles(),()=>[],vi.fn(),null,null,()=>-100,null,()=>[],world());
    const unit=shooter({...WEAPONS.pistol,spread:0}),p=combat.spawn(unit,new THREE.Vector3(1,0,0),unit.weapon),vx=p.velocity.x,start=p.position.clone();combat.update(.2);
    expect(p.position.x).toBeCloseTo(start.x+vx*.2,5);expect(p.position.y).toBeCloseTo(start.y-.5*ballisticGravity(unit.weapon)*.2**2,5);expect(p.velocity.x).toBeCloseTo(vx,8);
  });

  it('solves the low arc, leads moving targets, and rejects unreachable shots',()=>{
    const origin=new THREE.Vector3(0,1,0),target=new THREE.Vector3(30,1,0),weapon={bulletSpeed:60,shotPower:50,ballistic:true};
    const still=solveBallisticDirection(origin,target,weapon),moving=solveBallisticDirection(origin,target,weapon,new THREE.Vector3(0,0,8));
    expect(still.y).toBeGreaterThan(0);expect(still.y).toBeLessThan(.2);expect(moving.z).toBeGreaterThan(still.z);
    expect(solveBallisticDirection(origin,new THREE.Vector3(500,1,0),{bulletSpeed:10,shotPower:20,ballistic:true})).toBeNull();
  });
});

describe('persistent projectile simulation',()=>{
  it('does not expire a moving shot because of age and cleans it at the exact boundary',()=>{
    const fx=particles(),boundsWorld=world({bounds:3}),combat=new CombatSystem(new THREE.Scene(),fx,()=>[],vi.fn(),null,null,()=>-100,null,()=>[],boundsWorld),unit=shooter(),p=combat.spawn(unit,new THREE.Vector3(1,.2,0),unit.weapon);
    p.age=10_000;combat.update(.01);expect(p.active).toBe(true);
    combat.update(.1);expect(p.active).toBe(false);expect(fx.impact).toHaveBeenCalledWith(expect.objectContaining({x:3}),unit.weapon.color,expect.objectContaining({kind:'boundary'}));
  });

  it('uses swept collision and always damages only the nearest crossed target',()=>{
    const near={type:'unit',team:'red',group:at(5,.15,0),radius:.65,hp:100,maxHp:100,velocity:new THREE.Vector3(),dead:false},far={...near,group:at(8,.15,0),hp:100,velocity:new THREE.Vector3()},targets=[far,near];
    const combat=new CombatSystem(new THREE.Scene(),particles(),()=>targets,vi.fn(),vi.fn(),(a,b)=>a!==b,()=>-100,null,()=>[],world()),unit=shooter({...WEAPONS.pistol,bulletSpeed:120,spread:0});
    combat.spawn(unit,new THREE.Vector3(1,0,0),unit.weapon);combat.update(.1);
    expect(near.hp).toBeLessThan(100);expect(far.hp).toBe(100);expect(combat.diagnostics().active).toBe(0);
  });

  it('collides with and pushes loose crates through the combat spatial hash',()=>{
    const crate={type:'crate',mass:1,group:at(5,.15,0),radius:.7,velocity:new THREE.Vector3(),angularVelocity:new THREE.Vector3(),carried:false,placed:false},combat=new CombatSystem(new THREE.Scene(),particles(),()=>[],vi.fn(),null,null,()=>-100,null,()=>[crate],world()),unit=shooter({...WEAPONS.pistol,bulletSpeed:120,knockback:5,spread:0});
    combat.spawn(unit,new THREE.Vector3(1,0,0),unit.weapon);combat.update(.1);
    expect(crate.physicsActive).toBe(true);expect(crate.velocity.x).toBeGreaterThan(0);
  });

  it('keeps mines in a separate stationary pool and reserves a full pellet trigger atomically',()=>{
    const combat=new CombatSystem(new THREE.Scene(),particles(),()=>[],vi.fn(),null,null,()=>-100,null,()=>[],world()),miner=shooter(WEAPONS.mine);combat.spawn(miner,new THREE.Vector3(1,0,0),WEAPONS.mine);
    expect(combat.diagnostics()).toMatchObject({active:0,mines:1,free:2048,freeMines:255});
    const gunner=shooter(WEAPONS.shotgun);gunner.ammo=4;gunner.weaponId='shotgun';combat.freeSlots.length=WEAPONS.shotgun.pellets-1;
    expect(combat.shoot(gunner,gunner.aim)).toBe(false);expect(gunner.ammo).toBe(4);expect(combat.diagnostics().denied).toBe(1);
  });
});
