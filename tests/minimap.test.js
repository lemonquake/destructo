import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Minimap, minimapPulse } from '../src/game/Minimap.js';

const makeCanvas=()=>{
  const calls=[];
  const fn=name=>(...args)=>calls.push([name,...args]);
  const ctx={clearRect:fn('clearRect'),createLinearGradient:()=>({addColorStop:fn('addColorStop')}),fillRect:fn('fillRect'),strokeRect:fn('strokeRect'),beginPath:fn('beginPath'),moveTo:fn('moveTo'),lineTo:fn('lineTo'),stroke:fn('stroke'),arc:fn('arc'),fill:fn('fill'),save:fn('save'),restore:fn('restore'),translate:fn('translate'),rotate:fn('rotate'),closePath:fn('closePath'),fillText:fn('fillText')};
  const canvas={width:190,height:190,getContext:()=>ctx,addEventListener:vi.fn(),getBoundingClientRect:()=>({left:0,top:0,width:190,height:190})};
  return{canvas,calls};
};

describe('tactical minimap rendering',()=>{
  it('gives each Destructo a deterministic, staggered flash',()=>{
    expect(minimapPulse(2,'unit-a')).toBe(minimapPulse(2,'unit-a'));
    expect(minimapPulse(2,'unit-a')).not.toBe(minimapPulse(2,'unit-b'));
    expect(minimapPulse(2,'unit-a')).toBeGreaterThanOrEqual(0);
    expect(minimapPulse(2,'unit-a')).toBeLessThanOrEqual(1);
  });
  it('draws distinct unit, vehicle, turret, and destroyed-base markers',()=>{
    const {canvas,calls}=makeCanvas(),map=new Minimap(canvas),teams=[{id:'a',color:0x22aaff}];
    const at=(x,z)=>({position:new THREE.Vector3(x,0,z)}),unit={id:'u',type:'unit',team:'a',dead:false,group:at(0,0),aim:new THREE.Vector3(0,0,1)},entities=[unit,{id:'v',type:'vehicle',team:'a',dead:false,group:at(4,0)},{id:'t',type:'turret',team:'a',dead:false,group:at(-4,0)}];
    const world={bounds:78,hasWater:false,basePositions:{a:new THREE.Vector3(20,0,20)},factories:{a:{dead:true}},crateDropZones:[],crates:[]};
    map.update(world,teams,entities,unit,null,3);
    expect(calls.filter(c=>c[0]==='arc').length).toBeGreaterThan(0);
    expect(calls.filter(c=>c[0]==='fillRect').length).toBeGreaterThan(2);
    expect(calls.filter(c=>c[0]==='lineTo').length).toBeGreaterThanOrEqual(7);
  });
});
