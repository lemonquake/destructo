import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MAPS, DOMINATION_MAPS, DEATHMATCH_SECRET_PLANS, DEFAULT_MAP_ID, mapById } from '../src/data/maps.js';
import { MAP_SURFACE_THEMES, surfaceTexturesForTheme } from '../src/data/mapSurfaces.js';
import { BASE_TEXTURES, BUILDING_TEXTURES, MAP_TEXTURES } from '../src/game/Materials.js';
import { CrateDropScheduler } from '../src/game/CrateDropSystem.js';
import { World } from '../src/game/World.js';

describe('themed map roster', () => {
  it('ships four distinct selectable maps with player-facing copy', () => {
    expect(Object.keys(MAPS)).toEqual(['crossroads', 'crown', 'wilds', 'rift']);
    for (const map of Object.values(MAPS)) {
      expect(map.title.length).toBeGreaterThan(8);
      expect(map.description.length).toBeGreaterThan(60);
      expect(map.texture).toBeTruthy();
    }
    expect(mapById('missing').id).toBe(DEFAULT_MAP_ID);
  });

  it('authors triple-scale deathmatch battlefields with explicit team capacities', () => {
    expect(Object.values(MAPS).filter(map => map.maxTeams === 9)).toHaveLength(3);
    expect(Object.values(MAPS).filter(map => map.maxTeams === 5)).toHaveLength(1);
    for (const map of Object.values(MAPS)) {
      expect(map.bounds).toBe(234);
      expect(map.surfaceScale).toBe(3);
      expect(map.baseRadius).toBeGreaterThanOrEqual(190);
      expect(map.sizeClass).toBeTruthy();
    }
  });

  it('rejects rosters that exceed the selected deathmatch map capacity', () => {
    const world=Object.create(World.prototype);world.gameMode='deathmatch';world.map=MAPS.crown;
    expect(()=>World.prototype.build.call(world,Array.from({length:6},(_,i)=>({id:`t${i}`})))).toThrow(/at most 5 teams/);
  });

  it('gives every deathmatch map three remote themed secret caches', () => {
    expect(Object.keys(DEATHMATCH_SECRET_PLANS)).toEqual(Object.keys(MAPS));
    for(const [mapId,secrets] of Object.entries(DEATHMATCH_SECRET_PLANS)){
      expect(secrets).toHaveLength(3);
      expect(new Set(secrets.map(secret=>secret.name)).size).toBe(3);
      for(const secret of secrets){
        expect(Math.hypot(secret.x,secret.z)).toBeGreaterThan(120);
        expect(Math.max(Math.abs(secret.x),Math.abs(secret.z))).toBeLessThan(MAPS[mapId].bounds-25);
        expect(['yellow','blue','red']).toContain(secret.reward);
        expect(secret.wall).toBeTruthy();expect(secret.cache).toBeTruthy();
      }
    }
  });

  it('supports the summit triple-drop cadence at the configured 1–5 second interval', () => {
    const zone = { id: 'summit-crown', types: ['brown'], burst: 3, interval: { minSeconds: 1, maxSeconds: 5 } };
    const scheduler = new CrateDropScheduler([zone], () => 0);
    const spawn = vi.fn(() => ({}));
    expect(scheduler.next()).toMatchObject({ zone, type: 'brown', seconds: 1 });
    scheduler.update(1, () => 0, spawn);
    expect(spawn).toHaveBeenCalledTimes(3);
    expect(scheduler.next()).toMatchObject({ seconds: 1 });
  });

  it('does not inherit invisible legacy-river collision on themed maps', () => {
    const themedWorld = { hasWater: false };
    expect(World.prototype.isWater.call(themedWorld, { x: 0, z: 3 })).toBe(false);
    expect(World.prototype.isWater.call(themedWorld, { x: 60, z: 3 })).toBe(false);
  });

  it('defines valid layered surface art for every playable map', () => {
    const mapIds = [...Object.keys(MAPS), ...Object.keys(DOMINATION_MAPS)];
    const available = new Set([...BASE_TEXTURES, ...MAP_TEXTURES, ...BUILDING_TEXTURES]);
    expect(Object.keys(MAP_SURFACE_THEMES)).toEqual(mapIds);
    for (const id of mapIds) {
      const theme = MAP_SURFACE_THEMES[id];
      expect(theme.layers.length).toBeGreaterThanOrEqual(4);
      expect(['grass', 'dirt', 'stone']).toContain(theme.base.texture);
      expect(surfaceTexturesForTheme(theme).every(texture => available.has(texture))).toBe(true);
      expect(theme.layers.every(layer => ['ribbon', 'patch', 'ring', 'rect'].includes(layer.kind))).toBe(true);
    }
    const used = new Set(Object.values(MAP_SURFACE_THEMES).flatMap(surfaceTexturesForTheme));
    expect(used.has('grass')).toBe(true);
    expect(used.has('dirt')).toBe(true);
    expect(used.has('stone')).toBe(true);
  });

  it('does not load the legacy material atlas at runtime', () => {
    const runtime = ['src/game/Materials.js', 'src/game/World.js', 'src/data/mapSurfaces.js']
      .map(path => readFileSync(resolve(path), 'utf8')).join('\n');
    expect(runtime).not.toContain('destructo-material-atlas');
  });

  it('supports walkable platform tops and removable geometry blockers',()=>{
    const world={colliders:[],heightAt:()=>0,destructibles:[],interactiveStructures:[],baseTurrets:{},factories:{}};
    for(const name of ['registerCollider','colliderFrame','colliderContains','walkableTopAt','groundAt','removeCollidersFor','resolveCollisions'])world[name]=World.prototype[name];
    const platform=new THREE.Object3D();platform.position.y=1;world.registerCollider(platform,{shape:'box',halfX:3,halfZ:3,top:.5,blocking:false,walkable:true});
    expect(world.groundAt(new THREE.Vector3(1,0,1))).toBe(1.5);
    const blocker=new THREE.Object3D(),owner={dead:false};world.registerCollider(blocker,{shape:'box',halfX:1,halfZ:1,top:3},owner);const mover={group:{position:new THREE.Vector3(.5,0,0)},radius:.5};world.resolveCollisions(mover);expect(Math.abs(mover.group.position.x)).toBe(1.5);world.removeCollidersFor(owner);expect(owner.colliderHandles.every(c=>!c.enabled)).toBe(true);
  });

  it('groups urban roofs with their destructible buildings',()=>{
    const world={scene:new THREE.Scene(),materials:{building:()=>new THREE.MeshBasicMaterial()},factory:{createCar:()=>({}),createMotorcycle:()=>({})},destructibles:[],colliders:[],cars:[],motorcycles:[],heightAt:()=>0,nearBase:()=>false};
    world.registerCollider=World.prototype.registerCollider;World.prototype.buildCity.call(world);const building=world.destructibles.find(d=>d.subtype==='building');expect(building.attachments).toHaveLength(2);expect(building.attachments.every(mesh=>mesh.parent===building.group)).toBe(true);expect(building.colliderHandles).toHaveLength(1);
  });
});
