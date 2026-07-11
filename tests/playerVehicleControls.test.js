import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

global.window={addEventListener:()=>{},removeEventListener:()=>{},navigator:{userAgent:''},matchMedia:()=>({matches:false}),innerWidth:1024,innerHeight:768};
global.document={pointerLockElement:null,body:{classList:{add:()=>{},remove:()=>{}}},addEventListener:()=>{},removeEventListener:()=>{},querySelector:()=>null,getElementById:()=>null,querySelectorAll:()=>[],createElementNS:()=>({style:{},addEventListener:()=>{},removeEventListener:()=>{}})};

let Game;
beforeAll(async()=>{Game=(await import('../src/game/Game.js')).Game});

const groupAt = (yaw = 0) => ({ position: new THREE.Vector3(), rotation: { y: yaw } });
const unit = () => ({
  team: 'blue', weaponId: 'rifle', mountedMotorcycle: null, motorcycleRole: null,
  group: groupAt(), velocity: new THREE.Vector3(), aim: new THREE.Vector3(0, 0, 1), fireCooldown: 0,
});

const controls = (player, mouse = {}) => {
  const canvas = {};
  const game = {
    player, mountedControlRole: null, mountedViewYaw: 0, mountedViewPitch: 0,
    renderer: { domElement: canvas },
    input: {
      mouse: { dx: 0, dy: 0, down: false, ...mouse },
      axis: () => ({ x: 0, z: 0 }), consume: () => false,
    },
    hud: { prompt: vi.fn(), setTurretMode: vi.fn(), setVehicleRole: vi.fn(), toast: vi.fn() },
    combat: { shoot: vi.fn() },
  };
  for (const name of ['mountedRole','mountedCanFire','mountedLookDirection','syncMountedView']) game[name]=Game.prototype[name];
  return { game, canvas };
};

afterEach(() => vi.unstubAllGlobals());

describe('FPS mouse controls', () => {
  it('turns right for rightward mouse movement and left for leftward movement', () => {
    const player=unit(),game={fpsMode:true,fpsYaw:0,fpsPitch:0,player,input:{mouse:{dx:12,dy:0}}};
    Game.prototype.updateAim.call(game,.016);
    expect(game.fpsYaw).toBeLessThan(0);
    const rightAim=player.aim.x;
    game.input.mouse.dx=-24;
    Game.prototype.updateAim.call(game,.016);
    expect(game.fpsYaw).toBeGreaterThan(0);
    expect(player.aim.x).toBeGreaterThan(rightAim);
  });

  it('keeps vertical FPS look clamped', () => {
    const player=unit(),game={fpsMode:true,fpsYaw:0,fpsPitch:0,player,input:{mouse:{dx:0,dy:-100000}}};
    Game.prototype.updateAim.call(game,.016);
    expect(game.fpsPitch).toBeCloseTo(Math.PI/2.1);
  });
});

describe('player vehicle role controls', () => {
  it('combines mouse and A/D steering for normal drivers without firing', () => {
    const player=unit(),car={type:'car',group:groupAt(),driver:player,passengers:[],aim:new THREE.Vector3(0,0,1),dead:false};
    player.mountedMotorcycle=car;
    const {game,canvas}=controls(player,{dx:8,dy:-10,down:true});
    vi.stubGlobal('document',{pointerLockElement:canvas});
    game.input.axis=()=>({x:.25,z:-1});
    Game.prototype.updateMountedMotorcycle.call(game,player,car,.016);
    expect(car.throttle).toBe(1);
    expect(car.playerSteer).toBeCloseTo(.85);
    expect(game.mountedViewPitch).toBeGreaterThan(0);
    expect(game.combat.shoot).not.toHaveBeenCalled();
  });

  it('uses A/D for the Tank hull and mouse exclusively for its turret', () => {
    const player=unit(),barrel={rotation:{x:Math.PI/2}},head={rotation:{y:0}};
    const tank={type:'vehicle',vehicleKind:'tank',group:groupAt(),driver:player,passengers:[],aim:new THREE.Vector3(0,0,1),head,barrels:[barrel],weapon:{range:60},fireCooldown:0,dead:false};
    player.mountedMotorcycle=tank;
    const {game,canvas}=controls(player,{dx:10,dy:-10,down:true});
    vi.stubGlobal('document',{pointerLockElement:canvas});
    game.input.axis=()=>({x:.4,z:-1});
    Game.prototype.updateMountedMotorcycle.call(game,player,tank,.016);
    expect(tank.playerSteer).toBe(.4);
    expect(tank.controlYaw).toBeLessThan(0);
    expect(tank.controlPitch).toBeGreaterThan(0);
    expect(head.rotation.y).toBeLessThan(0);
    expect(barrel.rotation.x).toBeLessThan(Math.PI/2);
    expect(game.combat.shoot).toHaveBeenCalledWith(tank,tank.aim);
  });

  it('gives enclosed passengers freelook without steering or firing', () => {
    const player=unit(),driver=unit(),car={type:'car',group:groupAt(.5),driver,passengers:[player],aim:new THREE.Vector3(0,0,1),dead:false};
    player.mountedMotorcycle=car;
    const {game,canvas}=controls(player,{dx:20,dy:-8,down:true});
    vi.stubGlobal('document',{pointerLockElement:canvas});
    Game.prototype.updateMountedMotorcycle.call(game,player,car,.016);
    expect(game.mountedViewYaw).toBeLessThan(0);
    expect(game.mountedViewPitch).toBeGreaterThan(0);
    expect(car.playerSteer).toBeUndefined();
    expect(game.combat.shoot).not.toHaveBeenCalled();
  });

  it('lets only the motorcycle backrider fire along the freelook direction', () => {
    const player=unit(),driver=unit(),bike={type:'motorcycle',group:groupAt(.4),driver,passenger:player,aim:new THREE.Vector3(0,0,1),dead:false};
    player.mountedMotorcycle=bike;
    const {game,canvas}=controls(player,{dx:-15,dy:5,down:true});
    vi.stubGlobal('document',{pointerLockElement:canvas});
    Game.prototype.updateMountedMotorcycle.call(game,player,bike,.016);
    expect(game.combat.shoot).toHaveBeenCalledWith(player,player.aim);
    expect(player.aim.length()).toBeCloseTo(1);
  });

  it('forces vehicle POV on entry and restores the previous view on exit', () => {
    const player=unit(),car={type:'car',name:'Roadster',group:groupAt(),driver:null,passengers:[],capacity:4,aim:new THREE.Vector3(0,0,1),radius:2,dead:false};
    const {game,canvas}=controls(player);
    canvas.requestPointerLock=vi.fn();
    game.fpsMode=false;game.camera={fov:48,updateProjectionMatrix:vi.fn()};game.world={groundAt:()=>0};
    game.requestMouseCapture=Game.prototype.requestMouseCapture;game.preMountFpsMode=false;
    vi.stubGlobal('document',{pointerLockElement:null,exitPointerLock:vi.fn()});
    expect(Game.prototype.mountMotorcycle.call(game,player,car)).toBe(true);
    expect(game.fpsMode).toBe(true);
    expect(game.mountedRole(player,car)).toBe('driver');
    expect(canvas.requestPointerLock).toHaveBeenCalled();
    expect(Game.prototype.exitInteractive.call(game,player)).toBe(true);
    expect(game.fpsMode).toBe(false);
    expect(document.exitPointerLock).toHaveBeenCalled();
  });
});
