import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

global.window={addEventListener:()=>{},removeEventListener:()=>{},navigator:{userAgent:''},matchMedia:()=>({matches:false}),innerWidth:1024,innerHeight:768};
global.document={pointerLockElement:null,body:{classList:{add:()=>{},remove:()=>{}}},addEventListener:()=>{},removeEventListener:()=>{},querySelector:()=>null,getElementById:()=>null,querySelectorAll:()=>[],createElementNS:()=>({style:{},addEventListener:()=>{},removeEventListener:()=>{}})};

let Game,rollDestructibleSupply;
beforeAll(async()=>{const module=await import('../src/game/Game.js');Game=module.Game;rollDestructibleSupply=module.rollDestructibleSupply});

const groupAt = (yaw = 0) => ({ position: new THREE.Vector3(), rotation: { y: yaw } });
const unit = () => ({
  team: 'blue', weaponId: 'rifle', mountedMotorcycle: null, motorcycleRole: null,
  group: groupAt(), velocity: new THREE.Vector3(), aim: new THREE.Vector3(0, 0, 1), fireCooldown: 0,
});

const controls = (player, mouse = {}) => {
  const canvas = {};
  const game = {
    player, mountedControlRole: null, mountedViewYaw: 0, mountedViewPitch: 0,
    renderer: { domElement: canvas },camera:{},hoverPoint:new THREE.Vector3(-10,8,10),turretLockTarget:null,
    input: {
      mouse: { dx: 0, dy: 0, down: false, ...mouse },
      axis: () => ({ x: 0, z: 0 }), consume: () => false,
    },
    hud: { prompt: vi.fn(), setTurretMode: vi.fn(), setVehicleRole: vi.fn(), toast: vi.fn() },
    combat: { shoot: vi.fn() },
  };
  for (const name of ['mountedRole','mountedCanFire','mountedLookDirection','syncMountedView','updateTurretAim']) game[name]=Game.prototype[name];
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
  it('keeps the mounted turret and hidden rider out of the crosshair raycast', () => {
    const player=unit(),turret={type:'turret',group:new THREE.Group(),dead:false};
    player.mountedTurret=turret;
    const ground=new THREE.Mesh();ground.name='generated-terrain-ground';
    const groundPoint=new THREE.Vector3(10,0,12),intersectObjects=vi.fn(()=>[{object:ground,point:groundPoint}]);
    const game={
      player,_hoverFrame:1,_hoverMouse:new THREE.Vector2(),_hoverRaycaster:{setFromCamera:vi.fn(),intersectObjects},
      renderer:{domElement:{getBoundingClientRect:()=>({left:0,top:0,width:1024,height:768})}},camera:{},scene:{getObjectByName:name=>name==='generated-terrain-ground'?ground:null},
      input:{mouse:{x:512,y:384}},combatants:[player,turret],world:{surfaceMeshes:[],water:null,factories:{},wildlife:[],destructibles:[],interactiveStructures:[turret],motorcycles:[],cars:[],crates:[]},
      hud:{setCrosshair:vi.fn(),showInfo:vi.fn()},isLockable:()=>false,lockTarget:null,turretLockTarget:null,mountedCanFire:()=>false,
    };

    Game.prototype.updateHover.call(game);

    const raycastTargets=intersectObjects.mock.calls[0][0];
    expect(raycastTargets).not.toContain(player.group);
    expect(raycastTargets).not.toContain(turret.group);
    expect(game.hoverPoint).toBe(groundPoint);
  });

  it('uses A/D steering and crosshair aim for normal drivers without firing', () => {
    const player=unit(),car={type:'car',group:groupAt(),driver:player,passengers:[],aim:new THREE.Vector3(0,0,1),dead:false};
    player.mountedMotorcycle=car;
    const {game,canvas}=controls(player,{dx:8,dy:-10,down:true});
    vi.stubGlobal('document',{pointerLockElement:canvas});
    game.input.axis=()=>({x:.25,z:-1});
    Game.prototype.updateMountedMotorcycle.call(game,player,car,.016);
    expect(car.throttle).toBe(1);
    expect(car.playerSteer).toBeCloseTo(.25);
    expect(player.aim.x).toBeLessThan(0);
    expect(game.combat.shoot).not.toHaveBeenCalled();
  });

  it('uses A/D for the Tank hull and crosshair exclusively for its turret', () => {
    const player=unit(),barrel={rotation:{x:Math.PI/2}},head={rotation:{y:0}};
    const tank={type:'vehicle',vehicleKind:'tank',group:groupAt(),driver:player,passengers:[],aim:new THREE.Vector3(0,0,1),head,barrels:[barrel],weapon:{effectiveRange:60},fireCooldown:0,dead:false};
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

  it('gives enclosed passengers crosshair aim without steering or firing', () => {
    const player=unit(),driver=unit(),car={type:'car',group:groupAt(.5),driver,passengers:[player],aim:new THREE.Vector3(0,0,1),dead:false};
    player.mountedMotorcycle=car;
    const {game,canvas}=controls(player,{dx:20,dy:-8,down:true});
    vi.stubGlobal('document',{pointerLockElement:canvas});
    Game.prototype.updateMountedMotorcycle.call(game,player,car,.016);
    expect(player.aim.x).toBeLessThan(0);
    expect(car.playerSteer).toBeUndefined();
    expect(game.combat.shoot).not.toHaveBeenCalled();
  });

  it('lets only the motorcycle backrider fire along the crosshair direction', () => {
    const player=unit(),driver=unit(),bike={type:'motorcycle',group:groupAt(.4),driver,passenger:player,aim:new THREE.Vector3(0,0,1),dead:false};
    player.mountedMotorcycle=bike;
    const {game,canvas}=controls(player,{dx:-15,dy:5,down:true});
    vi.stubGlobal('document',{pointerLockElement:canvas});
    Game.prototype.updateMountedMotorcycle.call(game,player,bike,.016);
    expect(game.combat.shoot).toHaveBeenCalledWith(player,player.aim);
    expect(player.aim.length()).toBeCloseTo(1);
  });

  it('forces third person on entry and keeps it on exit without pointer lock', () => {
    const player=unit(),car={type:'car',name:'Roadster',group:groupAt(),driver:null,passengers:[],capacity:4,aim:new THREE.Vector3(0,0,1),radius:2,dead:false};
    const {game,canvas}=controls(player);
    canvas.requestPointerLock=vi.fn();
    game.fpsMode=false;game.camera={fov:48,updateProjectionMatrix:vi.fn()};game.world={groundAt:()=>0};
    game.requestMouseCapture=Game.prototype.requestMouseCapture;game.preMountFpsMode=false;
    vi.stubGlobal('document',{pointerLockElement:null,exitPointerLock:vi.fn()});
    expect(Game.prototype.mountMotorcycle.call(game,player,car)).toBe(true);
    expect(game.fpsMode).toBe(false);
    expect(game.mountedRole(player,car)).toBe('driver');
    expect(canvas.requestPointerLock).not.toHaveBeenCalled();
    expect(Game.prototype.exitInteractive.call(game,player)).toBe(true);
    expect(game.fpsMode).toBe(false);
    expect(document.exitPointerLock).toHaveBeenCalled();
  });
});

describe('primary and pistol weapon slots',()=>{
  const weaponGame=unit=>{
    const factory={
      setWeaponModel:vi.fn((target,id,weapon)=>{target.weaponId=id;target.weapon=weapon}),
      createPickup:vi.fn((drop,position)=>({drop,group:{position:position.clone()},velocity:new THREE.Vector3(),angularVelocity:new THREE.Vector3()})),
    };
    const game={player:unit,factory,world:{pickups:[]},combatants:[unit],hud:{toast:vi.fn()},showOverheadIcon:vi.fn(),observerOnly:false,playerTeam:'blue',spawnDamageNumber:vi.fn()};
    for(const name of ['equipPrimaryWeapon','switchWeaponSlot','dropWeapon','updateWeaponFallbacks','applyDrop'])game[name]=Game.prototype[name];
    return game;
  };

  it('switches between the primary and infinite pistol without losing primary ammo',()=>{
    const player=unit(),rifle={name:'Assault Rifle',damage:18};Object.assign(player,{weaponId:'rifle',weapon:rifle,weaponTier:2,primaryWeaponId:'rifle',primaryWeapon:rifle,primaryWeaponTier:2,ammo:17});
    const game=weaponGame(player);
    expect(game.switchWeaponSlot(player,'pistol')).toBe(true);expect(player.weaponId).toBe('pistol');expect(player.ammo).toBe(17);
    expect(game.switchWeaponSlot(player,'primary')).toBe(true);expect(player.weaponId).toBe('rifle');expect(player.weapon).toBe(rifle);expect(player.ammo).toBe(17);
  });

  it('automatically throws an empty primary, draws the pistol, and marks AI recovery',()=>{
    const player=unit(),rifle={name:'Assault Rifle',damage:18,color:0xffcc44};Object.assign(player,{type:'unit',weaponId:'rifle',weapon:rifle,primaryWeaponId:'rifle',primaryWeapon:rifle,ammo:0});
    const game=weaponGame(player);game.updateWeaponFallbacks();
    expect(player.weaponId).toBe('pistol');expect(player.primaryWeaponId).toBeNull();expect(player.seekingReplacement).toBe(true);
    expect(game.world.pickups).toHaveLength(1);expect(game.world.pickups[0].drop).toMatchObject({weaponId:'rifle',ammo:0,spent:true});
  });

  it('never throws the pistol and can recover a spent primary after finding ammo',()=>{
    const player=unit();Object.assign(player,{weaponId:'pistol',weapon:{name:'Combat Pistol'},primaryWeaponId:null,primaryWeapon:null,ammo:0,seekingReplacement:true});
    const game=weaponGame(player);
    expect(game.dropWeapon(player)).toBe(false);expect(game.world.pickups).toHaveLength(0);
    game.applyDrop({id:'ammo',name:'Ammo Pack'},player);expect(player.ammo).toBe(40);
    game.applyDrop({id:'weapon',name:'Assault Rifle',weaponId:'rifle',weapon:{name:'Assault Rifle'},droppedWeapon:true,spent:true,ammo:0},player);
    expect(player.weaponId).toBe('rifle');expect(player.ammo).toBe(40);expect(player.seekingReplacement).toBe(false);
  });
});

describe('setup and destructible polish',()=>{
  it('keeps nested setup scroll, focus, and input selection across a render',()=>{
    const oldMenu={scrollTop:420},oldList={scrollTop:135},active={dataset:{teamName:'2'},selectionStart:3,selectionEnd:7},newMenu={scrollTop:0},newList={scrollTop:0},replacement={focus:vi.fn(),setSelectionRange:vi.fn()};
    const screen={scrollTop:55,contains:()=>true,querySelector:vi.fn(selector=>selector==='.setup-menu'?oldMenu:selector==='.setup-list'?oldList:null)};vi.stubGlobal('document',{activeElement:active});const game={state:'setup',screen};
    const view=Game.prototype.captureSetupView.call(game);screen.querySelector=vi.fn(selector=>selector==='.setup-menu'?newMenu:selector==='.setup-list'?newList:selector==='[data-team-name="2"]'?replacement:null);screen.scrollTop=0;Game.prototype.restoreSetupView.call(game,view);
    expect([screen.scrollTop,newMenu.scrollTop,newList.scrollTop]).toEqual([55,420,135]);expect(replacement.focus).toHaveBeenCalledWith({preventScroll:true});expect(replacement.setSelectionRange).toHaveBeenCalledWith(3,7);
  });

  it('rolls independent 20 percent ammo and health bands once',()=>{
    expect(rollDestructibleSupply(()=>.199).id).toBe('ammo');expect(rollDestructibleSupply(()=>.2).id).toBe('health');expect(rollDestructibleSupply(()=>.399).id).toBe('health');expect(rollDestructibleSupply(()=>.4)).toBeNull();
  });

  it('uses the dedicated tree sounds for damage and destruction',()=>{
    const audio={play:vi.fn()},tree={type:'prop',subtype:'tree',group:new THREE.Group(),hp:0,maxHp:85,dead:true};
    const game={
      audio,ai:null,particles:{blood:vi.fn()},player:{},playerTeam:'blue',hostile:()=>false,spawnDamageNumber:vi.fn(),elapsed:1,damageVoiceCooldown:0,hud:{damage:vi.fn()},
      world:{removeCollidersFor:vi.fn()},spawnDestructibleSupply:vi.fn(),lockTarget:null,turretLockTarget:null,exitInteractive:vi.fn(),triggerDeathExplosion:vi.fn(),
      state:'mission',observerOnly:false,recordStat:vi.fn(),explodeUnit:vi.fn(),mission:{},kills:0,
    };
    Game.prototype.handleDamage.call(game,tree,12,null);
    Game.prototype.handleDeath.call(game,tree,{team:'red'});
    expect(audio.play).toHaveBeenCalledWith('tree_hit',tree.group.position);
    expect(audio.play).toHaveBeenCalledWith('tree_explode',tree.group.position);
    expect(audio.play).not.toHaveBeenCalledWith('explosion',expect.anything(),expect.anything());
  });
});

describe('large deathmatch map feedback',()=>{
  it('announces a secret once when the player enters its chamber',()=>{
    const position=new THREE.Vector3(12,0,-8),game={state:'mission',player:{group:{position:position.clone()}},world:{secretPlaces:[{name:'HIDDEN TEST',position,radius:11}]},discoveredSecrets:new Set(),hud:{toast:vi.fn()},audio:{play:vi.fn()},particles:{burst:vi.fn()},teamMap:{blue:{color:0x22aaff}},playerTeam:'blue'};
    Game.prototype.updateSecretDiscoveries.call(game);Game.prototype.updateSecretDiscoveries.call(game);
    expect([...game.discoveredSecrets]).toEqual(['HIDDEN TEST']);expect(game.hud.toast).toHaveBeenCalledOnce();expect(game.audio.play).toHaveBeenCalledOnce();expect(game.particles.burst).toHaveBeenCalledOnce();
  });

  it('keeps the high-quality sun shadow footprint centered on the active player',()=>{
    const sun=new THREE.DirectionalLight(),camera={position:new THREE.Vector3(100,30,-40)},player={group:{position:new THREE.Vector3(106,2,-46)}},game={sun,camera,player,state:'mission'};
    Game.prototype.updateSunShadow.call(game);
    expect(sun.target.position.x).toBeCloseTo(104.2);expect(sun.target.position.z).toBeCloseTo(-44.2);expect(sun.position.y-sun.target.position.y).toBeCloseTo(78);
  });
});
