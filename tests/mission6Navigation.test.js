import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { NavGrid } from '../src/game/Navigation.js';
import { resolveRespawnPosition } from '../src/game/SpawnPosition.js';
import { World, BLACKSITE_TRANSIT, blacksiteBlastWallSegments } from '../src/game/World.js';

function blacksiteNavigation(){
  const world={bounds:176,colliders:[],destructibles:[],interactiveStructures:[],baseTurrets:{},factories:{},hasWater:false,heightAt:()=>0};
  world.registerCollider=World.prototype.registerCollider;world.colliderFrame=World.prototype.colliderFrame;world.colliderContains=World.prototype.colliderContains;
  const wall=(x,z,w,d)=>{const object=new THREE.Object3D();object.position.set(x,3,z);world.registerCollider(object,{shape:'box',halfX:w/2,halfZ:d/2,top:3})};
  wall(-88,0,2.6,264);wall(88,0,2.6,264);for(const z of [-132,132]){wall(-53,z,68,2.6);wall(53,z,68,2.6)}
  for(const segment of blacksiteBlastWallSegments())wall(segment.x,segment.z,segment.w,segment.d);
  for(const {x,z} of BLACKSITE_TRANSIT.blastGates)for(const postX of [x-BLACKSITE_TRANSIT.gateHalfWidth,x+BLACKSITE_TRANSIT.gateHalfWidth])wall(postX,z,1.2,4);
  for(const x of [-44,44])for(const [z,length] of [[-112,18],[-73,26],[-28,24],[16,24],[60,24],[108,20]])wall(x,z,2.1,length);
  world.nav=new NavGrid(world);world.nav.rebuild();return world;
}

function fakeDocument(){
  const context={fillRect(){},strokeRect(){},fillText(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fill(){},arc(){},ellipse(){},clearRect(){},save(){},restore(){},translate(){},rotate(){},scale(){}};
  return{createElement(tag){if(tag!=='canvas')return{};return{width:1,height:1,getContext:()=>context}}};
}

function fullBlacksiteWorld(){
  vi.stubGlobal('document',fakeDocument());
  const scene=new THREE.Scene(),material=()=>new THREE.MeshBasicMaterial(),waterTexture={wrapS:0,wrapT:0,repeat:{set(){}}};
  const materials={textures:{water:waterTexture},surface:material,building:material,color:material};
  const factory={createFactory(team,position){const group=new THREE.Group();group.position.copy(position);scene.add(group);return{id:`${team}-factory`,team,type:'factory',group,radius:4,hp:900,maxHp:900,dead:false}}};
  const teams=[{id:'t0',color:0x2fb4ff,dark:0x11638f},{id:'t1',color:0xff5062,dark:0x8e2634}];
  return new World(scene,materials,factory,'gaia-blacksite','campaign').build(teams);
}

const point=v=>new THREE.Vector3(v.x,0,v.z);
const reaches=(world,from,to,radius=.72)=>{const path=world.nav.findPath(from,to,radius);return Boolean(path?.length&&path.at(-1).distanceTo(to)<3)};

afterEach(()=>vi.unstubAllGlobals());

describe('Mission 6 Atlas Blacksite deployment',()=>{
  it('defines complete, distinct formations beyond the entrance gates',()=>{
    expect(BLACKSITE_TRANSIT.playerDeployment).toHaveLength(5);
    expect(BLACKSITE_TRANSIT.enemyDeployment).toHaveLength(16);
    expect(new Set(BLACKSITE_TRANSIT.playerDeployment.map(p=>`${p.x},${p.z}`)).size).toBe(5);
    expect(new Set(BLACKSITE_TRANSIT.enemyDeployment.map(p=>`${p.x},${p.z}`)).size).toBe(16);
    for(const slot of BLACKSITE_TRANSIT.playerDeployment){expect(Math.abs(slot.x)).toBeLessThan(BLACKSITE_TRANSIT.halfWidth);expect(slot.z).toBeGreaterThan(38);expect(slot.z).toBeLessThan(82)}
    for(const slot of BLACKSITE_TRANSIT.enemyDeployment){expect(Math.abs(slot.x)).toBeLessThan(BLACKSITE_TRANSIT.halfWidth);expect(slot.z).toBeGreaterThan(-94);expect(slot.z).toBeLessThan(-50)}
  });

  it('keeps every authored slot clear and connected through the blast-wall layout',()=>{
    const world=blacksiteNavigation(),scientist=point(BLACKSITE_TRANSIT.scientist),extraction=point(BLACKSITE_TRANSIT.extraction);
    for(const slot of [...BLACKSITE_TRANSIT.playerDeployment,...BLACKSITE_TRANSIT.enemyDeployment])expect(world.nav.blockedAt(slot.x,slot.z,.72)).toBe(false);
    for(const slot of BLACKSITE_TRANSIT.playerDeployment)expect(reaches(world,point(slot),scientist)).toBe(true);
    for(const slot of BLACKSITE_TRANSIT.enemyDeployment)expect(reaches(world,point(slot),point(BLACKSITE_TRANSIT.playerSpawn))).toBe(true);
    expect(reaches(world,scientist,extraction,.82)).toBe(true);
  });

  it('uses the authored formations for the actual Game spawn function, not the exterior base ring',()=>{
    const world=fullBlacksiteWorld();
    const playerPositions=BLACKSITE_TRANSIT.playerDeployment.map((slot,index)=>({slot,actual:resolveRespawnPosition(world,'t0',index)}));
    const enemyPositions=BLACKSITE_TRANSIT.enemyDeployment.map((slot,index)=>({slot,actual:resolveRespawnPosition(world,'t1',index)}));
    const blocked=[];
    for(const {slot,actual} of [...playerPositions,...enemyPositions]){
      expect(actual.distanceTo(point(slot))).toBeLessThan(.01);
      if(world.nav.blockedAt(actual.x,actual.z,.72))blocked.push({slot,actual:{x:actual.x,z:actual.z}});
      expect(Math.abs(actual.z)).toBeLessThan(94);
    }
    expect(blocked).toEqual([]);
  });

  it('proves routes on the fully built Blacksite, including the real DestroJet drop circle',()=>{
    const world=fullBlacksiteWorld(),scientist=world.scientistSpawn.clone(),extraction=world.destroJet.dropPosition.clone();
    expect(extraction.x).toBe(BLACKSITE_TRANSIT.extraction.x);
    expect(extraction.z).toBe(BLACKSITE_TRANSIT.extraction.z);
    expect(world.nav.blockedAt(extraction.x,extraction.z,.82)).toBe(false);
    for(let i=0;i<BLACKSITE_TRANSIT.playerDeployment.length;i++)expect(reaches(world,world.deploymentPosition('t0',i),scientist)).toBe(true);
    for(let i=0;i<BLACKSITE_TRANSIT.enemyDeployment.length;i++)expect(reaches(world,world.deploymentPosition('t1',i),world.deploymentPosition('t0',0))).toBe(true);
    expect(reaches(world,scientist,extraction,.82)).toBe(true);
    for(const center of world.atlasWaveSpawns)for(let i=0;i<4;i++){const planned=center.clone().add(new THREE.Vector3((i%2)*2.4,0,Math.floor(i/2)*2.5));expect(world.nav.blockedAt(planned.x,planned.z,.72)).toBe(false)}
  });
});
