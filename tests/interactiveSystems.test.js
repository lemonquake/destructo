import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CombatSystem } from '../src/game/CombatSystem.js';
import { AIController } from '../src/game/AIController.js';

const at = (x = 0, z = 0) => ({ position: new THREE.Vector3(x, 0, z), rotation: { y: 0 } });

describe('interactive structure protection', () => {
  it('treats the backup pistol as infinite while primaries consume ammo',()=>{
    const combat=new CombatSystem(new THREE.Scene(),{burst(){},impact(){}},()=>[],vi.fn());
    const shooter={type:'unit',team:'blue',dead:false,freeze:0,fireCooldown:0,ammo:0,weaponId:'pistol',weapon:{damage:8,rate:.3,bulletSpeed:60,shotPower:50,effectiveRange:30,ballistic:true,spread:0,recoil:0,color:0xffffff,projectileStyle:'slug'},group:at(),velocity:new THREE.Vector3(),buffs:{}};
    expect(combat.shoot(shooter,new THREE.Vector3(0,0,1))).toBe(true);
    expect(shooter.ammo).toBe(0);
    shooter.fireCooldown=0;shooter.weaponId='rifle';shooter.ammo=1;
    expect(combat.shoot(shooter,new THREE.Vector3(0,0,1))).toBe(true);
    expect(shooter.ammo).toBe(0);
  });

  it('routes occupant damage into armored cover', () => {
    const cover = { type: 'turret', team: 'blue', group: at(), hp: 200, maxHp: 200, armor: .5, dead: false };
    const rider = { type: 'unit', team: 'blue', group: at(), hp: 100, maxHp: 100, mountedTurret: cover, dead: false };
    const combat = new CombatSystem(new THREE.Scene(), { burst() {}, impact() {} }, () => [cover, rider], vi.fn());
    combat.applyDamage(rider, 80, { team: 'red' });
    expect(rider.hp).toBe(100);
    expect(cover.hp).toBe(160);
  });

  it('does not multiply blast damage for protected occupants', () => {
    const cover = { type: 'bunker', team: 'neutral', group: at(), hp: 300, maxHp: 300, armor: .5, dead: false };
    const occupants = Array.from({ length: 3 }, () => ({ type: 'unit', team: 'blue', group: at(), hp: 100, maxHp: 100, mountedBunker: cover, dead: false }));
    const combat = new CombatSystem(new THREE.Scene(), { burst() {}, impact() {} }, () => [cover, ...occupants], vi.fn());
    combat.radial(new THREE.Vector3(), 5, 100, { team: 'red', group: at() });
    expect(cover.hp).toBe(250);
    expect(occupants.every(unit => unit.hp === 100)).toBe(true);
  });

  it('pushes loose crates with mass-scaled projectile and explosion impulses',()=>{
    const light={type:'crate',mass:1,carried:false,placed:false,group:at(1),velocity:new THREE.Vector3(),angularVelocity:new THREE.Vector3()},heavy={type:'crate',mass:4,carried:false,placed:false,group:at(1,1),velocity:new THREE.Vector3(),angularVelocity:new THREE.Vector3()};
    const combat=new CombatSystem(new THREE.Scene(),{burst(){},impact(){}},()=>[],vi.fn(),null,null,null,null,()=>[light,heavy]);
    combat.applyRadialPhysics(new THREE.Vector3(),6,18);
    expect(light.physicsActive).toBe(true);expect(light.velocity.length()).toBeGreaterThan(heavy.velocity.length());expect(heavy.velocity.length()).toBeGreaterThan(0);
    light.velocity.set(0,0,0);combat.hit({shooter:{team:'blue'},weapon:{damage:10,knockback:4,color:0xffffff},velocity:new THREE.Vector3(20,0,0),mesh:{position:new THREE.Vector3(),visible:true}},light);expect(light.velocity.x).toBeGreaterThan(0);
  });

  it('layers ricochets onto hard projectile impacts but not flesh or trees',()=>{
    const audio={play:vi.fn()},particles={burst:vi.fn(),impact:vi.fn()},combat=new CombatSystem(new THREE.Scene(),particles,()=>[],vi.fn(),vi.fn());combat.audio=audio;
    const projectile=()=>({shooter:{team:'blue'},weapon:{damage:10,knockback:2,color:0xffffff},velocity:new THREE.Vector3(20,0,0),mesh:{position:new THREE.Vector3(),visible:true}});
    combat.hit(projectile(),{type:'prop',subtype:'rock',group:at(),hp:10});
    combat.hit(projectile(),{type:'prop',subtype:'tree',group:at(),hp:10});
    combat.hit(projectile(),{type:'unit',group:at(),hp:10});
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.play).toHaveBeenCalledWith('ricochet',expect.any(THREE.Vector3),expect.any(Number));
  });

  it('lets neutral destruction blasts damage every team',()=>{
    const blue={type:'unit',team:'blue',group:at(1),hp:100,maxHp:100,velocity:new THREE.Vector3(),dead:false},red={type:'unit',team:'red',group:at(-1),hp:100,maxHp:100,velocity:new THREE.Vector3(),dead:false};
    const combat=new CombatSystem(new THREE.Scene(),{burst(){},impact(){}},()=>[blue,red],vi.fn(),null,(a,b)=>a!==b);
    combat.radial(new THREE.Vector3(),5,50,{team:'neutral'},12);
    expect(blue.hp).toBeLessThan(100);expect(red.hp).toBeLessThan(100);expect(blue.velocity.length()).toBeGreaterThan(0);expect(red.velocity.length()).toBeGreaterThan(0);
  });
});

describe('AI interactive behavior', () => {
  it('never gives an empty vehicle autonomous movement or firing AI', () => {
    const shoot=vi.fn(),ai=new AIController({}, {shoot}, {});
    const vehicle={type:'vehicle',dead:false,player:false,fireCooldown:1,group:at(),velocity:new THREE.Vector3(),aim:new THREE.Vector3(0,0,1),weapon:{effectiveRange:60}};
    ai.update(vehicle,.5,[{group:at(0,8),dead:false}]);
    expect(vehicle.fireCooldown).toBe(1);
    expect(vehicle.group.position.equals(new THREE.Vector3())).toBe(true);
    expect(shoot).not.toHaveBeenCalled();
  });

  it('enters a nearby bunker goal through the interaction hooks', () => {
    const bunker = { type: 'bunker', radius: 3.1, group: at(), occupants: [], capacity: 3, dead: false };
    const world = { baseTurrets: {}, interactiveStructures: [bunker], motorcycles: [], pickups: [], crates: [], basePositions: {}, groundAt: () => 0 };
    const mountBunker = vi.fn(() => true);
    const ai = new AIController(world, {}, {}, null, null, null, null, null, { mountBunker });
    const agent = { type: 'unit', team: 'blue', group: at(3.5), velocity: new THREE.Vector3(), aim: new THREE.Vector3(0, 0, 1), interactiveGoal: bunker, interactiveDecision: 1 };
    expect(ai.seekInteractive(agent, .016, [{ group: at(8), dead: false }])).toBe(true);
    expect(mountBunker).toHaveBeenCalledWith(agent, bunker);
  });

  it('makes a motorcycle passenger attack while the driver steers', () => {
    const shoot = vi.fn();
    const world = {};
    const ai = new AIController(world, { shoot }, {});
    const bike = { type: 'motorcycle', group: at(), dead: false, driver: {}, passenger: null };
    const passenger = { mountedMotorcycle: bike, group: at(), aim: new THREE.Vector3(0, 0, 1), fireCooldown: 0 };
    bike.passenger = passenger;
    ai.useInteractive(passenger, .016, [{ group: at(0, 8), dead: false }]);
    expect(shoot).toHaveBeenCalledWith(passenger, passenger.aim);
  });

  it('lets an AI Destructo drive, elevate, and fire a tank cannon', () => {
    const shoot=vi.fn(),barrel={rotation:{x:Math.PI/2}},turret={rotation:{y:0}};
    const tank={type:'vehicle',vehicleKind:'tank',group:at(),turret,barrels:[barrel],aim:new THREE.Vector3(0,0,1),velocity:new THREE.Vector3(),fireCooldown:0,dead:false};
    const driver={mountedMotorcycle:tank,group:at(),aim:new THREE.Vector3(0,0,1)};tank.driver=driver;
    const ai=new AIController({}, {shoot}, {}),target={group:{position:new THREE.Vector3(8,8,12)},dead:false};
    ai.useInteractive(driver,.1,[target]);
    expect(tank.throttle).toBeGreaterThan(0);
    expect(tank.aiDirection.length()).toBeCloseTo(1);
    expect(turret.rotation.y).not.toBe(0);
    expect(barrel.rotation.x).toBeLessThan(Math.PI/2);
    expect(shoot).toHaveBeenCalledWith(tank,tank.aim);
  });

  it('keeps AI car, APC, and tank passengers from attacking', () => {
    for (const vehicle of [
      { type: 'car' },
      { type: 'vehicle', vehicleKind: 'apc' },
      { type: 'vehicle', vehicleKind: 'tank' },
    ]) {
      const shoot=vi.fn(),carrier={...vehicle,group:at(),dead:false,driver:{},passengers:[]};
      const passenger={mountedMotorcycle:carrier,group:at(),aim:new THREE.Vector3(0,0,1)};
      carrier.passengers.push(passenger);
      new AIController({}, {shoot}, {}).useInteractive(passenger,.016,[{group:at(0,8),dead:false}]);
      expect(shoot).not.toHaveBeenCalled();
    }
  });

  it('turns and elevates a mounted turret toward high targets', () => {
    const shoot = vi.fn();
    const barrel = { rotation: { x: Math.PI / 2 } };
    const turret = { group: at(), head: { rotation: { y: 0 } }, barrels: [barrel], aim: new THREE.Vector3(0, 0, 1), dead: false, fireCooldown: 0, reloadTimer: 0, ammo: 5 };
    const agent = { mountedTurret: turret, group: at() };
    const highTarget = { group: { position: new THREE.Vector3(8, 9, 8) }, dead: false };
    const ai = new AIController({}, { shoot }, {});
    ai.useInteractive(agent, .016, [highTarget]);
    expect(turret.head.rotation.y).toBeGreaterThan(0);
    expect(turret.aim.y).toBeGreaterThan(0);
    expect(barrel.rotation.x).toBeLessThan(Math.PI / 2);
  });
});
