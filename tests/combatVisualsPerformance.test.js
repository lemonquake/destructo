import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { WEAPONS } from '../src/data/gameData.js';
import { EntityFactory } from '../src/game/EntityFactory.js';
import { CombatSystem } from '../src/game/CombatSystem.js';
import { ParticleSystem } from '../src/game/ParticleSystem.js';
import { PerformanceGovernor } from '../src/game/PerformanceGovernor.js';

describe('combat visual pools',()=>{
  it('provides real muzzle anchors for every weapon family',()=>{
    const factory=Object.create(EntityFactory.prototype);factory.materials={color:()=>new THREE.MeshStandardMaterial()};
    for(const [id,weapon] of Object.entries(WEAPONS)){
      const model=factory.buildWeaponModel(id,weapon),anchors=[];model.traverse(o=>{if(o.name==='muzzle-anchor')anchors.push(o)});expect(anchors.length,`${id} muzzle anchors`).toBeGreaterThan(0);
    }
    const shotgun=factory.buildWeaponModel('shotgun',WEAPONS.shotgun),rotary=factory.buildWeaponModel('machinegun',WEAPONS.machinegun);
    expect(shotgun.getObjectsByProperty('name','muzzle-anchor')).toHaveLength(2);expect(rotary.getObjectsByProperty('name','muzzle-anchor')).toHaveLength(3);
  });

  it('distributes shotgun pellets across both muzzles before consuming the trigger',()=>{
    const scene=new THREE.Scene(),fx={muzzleFlash:vi.fn(),impact:vi.fn()},combat=new CombatSystem(scene,fx,()=>[],vi.fn(),null,null,()=>-100,null,()=>[],{bounds:100,colliders:[],groundAt:()=>-100,surfaceAt:()=> 'dirt'}),left=new THREE.Object3D(),right=new THREE.Object3D();left.position.set(-.2,1,0);right.position.set(.2,1,0);scene.add(left,right);
    const shooter={type:'unit',team:'blue',dead:false,freeze:0,fireCooldown:0,weaponId:'shotgun',weapon:{...WEAPONS.shotgun,spread:0},group:new THREE.Group(),muzzleAnchors:[left,right],aim:new THREE.Vector3(0,0,1),velocity:new THREE.Vector3(),buffs:{},ammo:20};
    expect(combat.shoot(shooter,shooter.aim)).toBe(true);const shots=combat.pool.filter(p=>p.active&&!p.mine);expect(shots).toHaveLength(12);expect(new Set(shots.map(p=>p.position.x.toFixed(1)))).toEqual(new Set(['-0.2','0.2']));expect(fx.muzzleFlash).toHaveBeenCalledTimes(2);
  });

  it('caps non-shadow muzzle lights at six and gives mines a launch flash',()=>{
    const fx=new ParticleSystem(new THREE.Scene(),()=>0),origin=new THREE.Vector3(),dir=new THREE.Vector3(0,0,1);fx.update(.001,{position:origin,quaternion:new THREE.Quaternion()});
    for(let i=0;i<10;i++)fx.muzzleFlash(origin,dir,WEAPONS.pistol);expect(fx.muzzleLights.filter(x=>x.life>0)).toHaveLength(6);
    const before=fx.muzzleFlashes.filter(x=>x.life>0).length;fx.muzzleFlash(origin,dir,WEAPONS.mine);expect(fx.muzzleFlashes.filter(x=>x.life>0).length).toBe(before+1);
  });
});

describe('performance governor',()=>{
  it('reduces only render/effect quality after sustained sub-58 FPS',()=>{
    const renderer={setPixelRatio:vi.fn(),info:{render:{calls:90,triangles:1000}}},effects={setQuality:vi.fn()},governor=new PerformanceGovernor(renderer,{maxPixelRatio:1.25,minPixelRatio:.75,query:''});governor.setEffects(effects);
    for(let i=0;i<230;i++)governor.update(.02,{active:150,denied:0,poolUsage:7,effects:30});
    expect(renderer.setPixelRatio).toHaveBeenCalled();expect(governor.pixelRatio).toBeLessThan(1.25);expect(effects.setQuality).toHaveBeenLastCalledWith(governor.quality);
  });
});
