import * as THREE from 'three';
import { CLASSES, TEAM, WEAPONS, CRATE_TYPES } from '../data/gameData.js';
import { SKIN_TEXTURES } from './Materials.js';

const GEO = {
  body: new THREE.CapsuleGeometry(.62, .9, 3, 8), head: new THREE.SphereGeometry(.65, 8, 6), hand: new THREE.IcosahedronGeometry(.24, 1), boot: new THREE.BoxGeometry(.42, .28, .62), eye: new THREE.PlaneGeometry(.18, .24), pupil: new THREE.PlaneGeometry(.07, .1), gun: new THREE.BoxGeometry(.22, .26, .85), barrel: new THREE.CylinderGeometry(.07, .07, .62, 6), crate: new THREE.BoxGeometry(1.15, 1.15, 1.15),
};

function mesh(geometry, material, shadows = true) { const m = new THREE.Mesh(geometry, material); m.castShadow = shadows; m.receiveShadow = shadows; return m; }

export class EntityFactory {
  constructor(scene, materials) { this.scene = scene; this.materials = materials; }
  createUnit(classId = 'scout', team = 'blue', position = new THREE.Vector3(), player = false, opts = {}) {
    const def = CLASSES[classId], color = team === 'blue' ? TEAM.BLUE : TEAM.RED;
    const group = new THREE.Group(); group.position.copy(position); group.name = `${team}-${classId}`;
    const skinName = opts.skin || SKIN_TEXTURES[[...classId].reduce((s, c) => s + c.charCodeAt(0), 0) % SKIN_TEXTURES.length];
    const uniform = this.materials.skin(skinName, color), teamMat = this.materials.team(color), dark = this.materials.color(team === 'blue' ? 0x11638f : 0x8e2634), skin = this.materials.color(0xf3d6a6);
    const body = mesh(GEO.body, uniform); body.position.y = 1.15; group.add(body);
    const head = mesh(GEO.head, teamMat); head.position.y = 2.15; head.scale.set(1.04, .88, 1); group.add(head);
    const faceWhite = new THREE.MeshBasicMaterial({ color: 0xffffe8 });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x11131e });
    [-.25, .25].forEach(x => { const eye = mesh(GEO.eye, faceWhite, false); eye.position.set(x, 2.25, .6); group.add(eye); const pupil = mesh(GEO.pupil, pupilMat, false); pupil.position.set(x, 2.25, .625); group.add(pupil); });
    const mouth = mesh(new THREE.PlaneGeometry(.26, .055), pupilMat, false); mouth.position.set(0, 1.94, .63); group.add(mouth);
    const leftHand = mesh(GEO.hand, skin), rightHand = mesh(GEO.hand, skin); leftHand.position.set(-.85, 1.24, .12); rightHand.position.set(.85, 1.24, .12); group.add(leftHand, rightHand);
    const leftBoot = mesh(GEO.boot, dark), rightBoot = mesh(GEO.boot, dark); leftBoot.position.set(-.33, .22, .03); rightBoot.position.set(.33, .22, .03); group.add(leftBoot, rightBoot);
    const weaponGroup = new THREE.Group(); const gun = mesh(GEO.gun, this.materials.color(0x343848)); gun.rotation.x = Math.PI / 2; weaponGroup.add(gun); const barrel = mesh(GEO.barrel, this.materials.color(0x191c28)); barrel.rotation.x = Math.PI / 2; barrel.position.z = .66; weaponGroup.add(barrel); weaponGroup.position.set(.72, 1.22, .72); group.add(weaponGroup);
    if (opts.hat) this.addHat(group, opts.hat, color);
    const grade = opts.grade || 'normal';
    if (grade === 'elite') { const stripe = mesh(new THREE.TorusGeometry(.68, .07, 6, 14), this.materials.color(0xffd23f, { emissive: 0xaa7700, emissiveIntensity: .6 })); stripe.rotation.x = Math.PI / 2; stripe.position.y = 1.55; group.add(stripe); }
    if (grade === 'special') { group.scale.setScalar(1.12); const core = mesh(new THREE.OctahedronGeometry(.22, 0), this.materials.color(0xa4ecff, { emissive: 0x2fa0e0, emissiveIntensity: 1.5 }), false); core.position.set(0, 1.35, .58); group.add(core); const halo = mesh(new THREE.TorusGeometry(.92, .05, 6, 20), this.materials.color(0x9fe8ff, { emissive: 0x2fa0e0, emissiveIntensity: 1.1 }), false); halo.rotation.x = Math.PI / 2; halo.position.y = .12; group.add(halo); }
    const entity = { id: crypto.randomUUID(), type: 'unit', team, classId, classDef: def, grade, passive: opts.passive || null, active: opts.active || null, group, body, head, leftHand, rightHand, leftBoot, rightBoot, weaponGroup, hp: def.hp, maxHp: def.hp, mp: def.mp, maxMp: def.mp, shield: 0, weaponId: def.weapon, weapon: WEAPONS[def.weapon], weaponTier: 0, velocity: new THREE.Vector3(), aim: new THREE.Vector3(0, 0, 1), radius: .72, state: 'grounded', stun: 0, freeze: 0, fireCooldown: 0, abilityCooldown: 0, statusTimer: 0, recoil: 0, verticalVelocity: 0, buffs: { speed: 0, damage: 0, rapid: 0 }, dead: false, player, carriedCrate: null, kills: 0, bobSeed: Math.random() * 10 };
    this.applyPassive(entity);
    group.traverse(o => { if (o.isMesh) o.userData.entity = entity; }); group.userData.entity = entity; this.scene.add(group); return entity;
  }
  applyPassive(e) {
    switch (e.passive?.id) {
      case 'manabattery': e.maxMp += 50; e.mp = e.maxMp; break;
      case 'juggernaut': e.maxHp += 45; e.hp = e.maxHp; break;
      case 'shieldborn': e.shield = 60; break;
      case 'longshot': e.weapon = { ...e.weapon, range: e.weapon.range * 1.25 }; break;
    }
  }
  addHat(group, hat, color) {
    const gold = this.materials.color(0xffd23f, { metalness: .6, roughness: .35 }), dark = this.materials.color(0x2b2f45);
    const parts = new THREE.Group(); parts.position.y = 2.62; parts.name = 'hat';
    switch (hat) {
      case 'cap': { const top = mesh(new THREE.SphereGeometry(.48, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), this.materials.color(color)); parts.add(top); const brim = mesh(new THREE.BoxGeometry(.55, .07, .45), this.materials.color(color)); brim.position.set(0, .02, .5); parts.add(brim); break; }
      case 'helmet': { const dome = mesh(new THREE.SphereGeometry(.62, 8, 6, 0, Math.PI * 2, 0, Math.PI / 1.7), this.materials.metal); dome.position.y = -.12; parts.add(dome); break; }
      case 'mohawk': { for (let i = 0; i < 5; i++) { const spike = mesh(new THREE.ConeGeometry(.09, .42, 4), this.materials.color(0xff4dd2, { emissive: 0x991f80, emissiveIntensity: .8 })); spike.position.set(0, .18, .34 - i * .17); parts.add(spike); } break; }
      case 'horns': { for (const x of [-.42, .42]) { const horn = mesh(new THREE.ConeGeometry(.12, .5, 5), this.materials.color(0xff5062)); horn.position.set(x, .1, 0); horn.rotation.z = x > 0 ? -.5 : .5; parts.add(horn); } break; }
      case 'halo': { const ring = mesh(new THREE.TorusGeometry(.42, .06, 6, 16), this.materials.color(0xffe06b, { emissive: 0xcc9900, emissiveIntensity: 1.4 }), false); ring.rotation.x = Math.PI / 2; ring.position.y = .45; parts.add(ring); break; }
      case 'crown': { const band = mesh(new THREE.CylinderGeometry(.42, .46, .22, 8), gold); parts.add(band); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const spike = mesh(new THREE.ConeGeometry(.08, .26, 4), gold); spike.position.set(Math.cos(a) * .4, .22, Math.sin(a) * .4); parts.add(spike); } break; }
      case 'antenna': { const rod = mesh(new THREE.CylinderGeometry(.03, .03, .65, 4), dark, false); rod.position.y = .3; parts.add(rod); const tip = mesh(new THREE.SphereGeometry(.09, 6, 4), this.materials.color(0xff5062, { emissive: 0xaa1122, emissiveIntensity: 1.6 }), false); tip.position.y = .66; parts.add(tip); break; }
      case 'tophat': { const brim = mesh(new THREE.CylinderGeometry(.62, .62, .06, 10), dark); parts.add(brim); const tube = mesh(new THREE.CylinderGeometry(.4, .42, .62, 10), dark); tube.position.y = .34; parts.add(tube); const ribbon = mesh(new THREE.CylinderGeometry(.43, .43, .12, 10), this.materials.color(0xff5062)); ribbon.position.y = .12; parts.add(ribbon); break; }
    }
    group.add(parts); return parts;
  }
  createFactory(team, position) {
    const group = new THREE.Group(); group.position.copy(position); const color = team === 'blue' ? TEAM.BLUE : TEAM.RED;
    const foundation = mesh(new THREE.BoxGeometry(8, 1.1, 7), this.materials.building('concrete')); foundation.position.y = .55; group.add(foundation);
    const core = mesh(new THREE.BoxGeometry(5.2, 4.2, 4.4), this.materials.building('plating')); core.position.y = 2.65; group.add(core);
    for (const x of [-2.9, 2.9]) for (const z of [-2.5, 2.5]) { const p = mesh(new THREE.BoxGeometry(.7, 5, .7), this.materials.color(color)); p.position.set(x, 2.8, z); group.add(p); }
    const roof = mesh(new THREE.CylinderGeometry(3.8, 3.8, .65, 8), this.materials.color(color)); roof.position.y = 5.05; group.add(roof);
    const stripe = mesh(new THREE.BoxGeometry(5.26, .8, 4.46), this.materials.building('hazard')); stripe.position.y = 1.2; group.add(stripe);
    const key = mesh(new THREE.TorusGeometry(.72, .2, 6, 10), this.materials.color(0xd9a928, { metalness: .5 })); key.rotation.x = Math.PI / 2; key.position.set(0, 2.8, team === 'blue' ? -2.25 : 2.25); group.add(key);
    const entity = { id: `${team}-factory`, type: 'factory', team, group, hp: 900, maxHp: 900, radius: 4, dead: false };
    group.traverse(o => { if (o.isMesh) o.userData.entity = entity; }); this.scene.add(group); return entity;
  }
  createCrate(position, type = CRATE_TYPES.brown) {
    if (type === true) type = CRATE_TYPES.blue; // legacy "charged" flag
    if (typeof type === 'string') type = CRATE_TYPES[type] || CRATE_TYPES.brown;
    const mat = type.shiny
      ? this.materials.color(type.color, { emissive: type.band, emissiveIntensity: .55, metalness: .55, roughness: .25 })
      : this.materials.color(type.color, { roughness: .8 });
    const group = new THREE.Group(); group.position.copy(position); const box = mesh(GEO.crate, mat); box.position.y = .58; group.add(box);
    const bandMat = this.materials.color(type.band);
    for (let i = 0; i < 3; i++) { const band = mesh(new THREE.BoxGeometry(i === 0 ? 1.2 : .12, .08, i === 0 ? .12 : 1.2), bandMat); band.position.set(i === 1 ? -.38 : i === 2 ? .38 : 0, 1.16, 0); group.add(band); }
    if (type.tier >= 2) { const gem = mesh(new THREE.OctahedronGeometry(.2, 0), this.materials.color(0xffffff, { emissive: type.color, emissiveIntensity: 1.6 }), false); gem.position.y = 1.42; group.add(gem); }
    const entity = { id: crypto.randomUUID(), type: 'crate', crateType: type, charged: type.tier >= 2, group, position: group.position, radius: .72, carried: false, placed: false, solid: false };
    group.userData.entity = entity; group.traverse(o => { if (o.isMesh) o.userData.entity = entity; }); this.scene.add(group); return entity;
  }
  createTank(team, position, mega = false) {
    const group = new THREE.Group(); group.position.copy(position); const color = team === 'blue' ? TEAM.BLUE : TEAM.RED;
    const hull = mesh(new THREE.BoxGeometry(3.1, 1.1, 4.1), this.materials.color(color)); hull.position.y = 1; group.add(hull);
    for (const x of [-1.7, 1.7]) { const tread = mesh(new THREE.BoxGeometry(.55, .75, 4.4), this.materials.building('plating')); tread.position.set(x, .7, 0); group.add(tread); }
    const turret = new THREE.Group(); const dome = mesh(new THREE.CylinderGeometry(1.15, 1.4, .75, 8), this.materials.metal); dome.position.y = 1.75; turret.add(dome); const barrel = mesh(new THREE.CylinderGeometry(.14, .18, 3.8, 8), this.materials.metal); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 1.8, 1.9); turret.add(barrel); group.add(turret);
    if (mega) { group.scale.setScalar(1.3); const fin = mesh(new THREE.BoxGeometry(.2, 1.1, 1.6), this.materials.color(0xffd23f, { emissive: 0xaa7700, emissiveIntensity: .5 })); fin.position.set(0, 1.9, -1.6); group.add(fin); }
    const hp = mega ? 900 : 480;
    const entity = { id: crypto.randomUUID(), type: 'vehicle', team, group, turret, hp, maxHp: hp, radius: mega ? 2.7 : 2.1, velocity: new THREE.Vector3(), aim: new THREE.Vector3(0, 0, 1), speed: mega ? 4.4 : 3.8, weapon: { ...WEAPONS.carbine, damage: mega ? 55 : 36, rate: mega ? .6 : .8, explosive: true }, fireCooldown: 0, dead: false };
    group.traverse(o => { if (o.isMesh) o.userData.entity = entity; }); this.scene.add(group); return entity;
  }
  createTurret(team, position) {
    const group = new THREE.Group(); group.position.copy(position); const color = team === 'blue' ? TEAM.BLUE : TEAM.RED;
    const base = mesh(new THREE.CylinderGeometry(.75, .95, .35, 8), this.materials.metal); base.position.y = .18; group.add(base);
    const stem = mesh(new THREE.CylinderGeometry(.18, .25, .9, 6), this.materials.color(color)); stem.position.y = .78; group.add(stem);
    const head = new THREE.Group(); head.position.y = 1.28; const housing = mesh(new THREE.BoxGeometry(.75, .48, .72), this.materials.metal); head.add(housing); const barrel = mesh(new THREE.CylinderGeometry(.07, .09, 1.25, 6), this.materials.metal); barrel.rotation.x = Math.PI / 2; barrel.position.z = .82; head.add(barrel); group.add(head);
    const entity = { id: crypto.randomUUID(), type: 'turret', team, group, head, hp: 130, maxHp: 130, radius: .85, velocity: new THREE.Vector3(), aim: new THREE.Vector3(0, 0, 1), speed: 0, stationary: true, weapon: { ...WEAPONS.machinegun, damage: 10, rate: .16, range: 22 }, fireCooldown: 0, dead: false };
    group.traverse(o => { if (o.isMesh) o.userData.entity = entity; }); this.scene.add(group); return entity;
  }
  createPickup(drop, position) {
    const group = new THREE.Group(); group.position.copy(position);
    const geo = drop.id === 'health' ? new THREE.BoxGeometry(.5, .5, .5) : drop.id === 'ammo' ? new THREE.CylinderGeometry(.24, .24, .5, 6) : new THREE.OctahedronGeometry(.34, 0);
    const item = mesh(geo, this.materials.color(drop.color, { emissive: drop.color, emissiveIntensity: .7 }), false); item.position.y = .55; group.add(item);
    if (drop.id === 'health') { const barV = mesh(new THREE.BoxGeometry(.14, .38, .05), new THREE.MeshBasicMaterial({ color: 0xffffff }), false); barV.position.set(0, .55, .27); group.add(barV); const barH = mesh(new THREE.BoxGeometry(.38, .14, .05), new THREE.MeshBasicMaterial({ color: 0xffffff }), false); barH.position.set(0, .55, .27); group.add(barH); }
    const entity = { id: crypto.randomUUID(), type: 'pickup', drop, group, radius: .8, life: 25, bobSeed: Math.random() * 10 };
    this.scene.add(group); return entity;
  }
  createWildlife(kind, position) {
    const group = new THREE.Group(); group.position.copy(position); let hp = kind === 'wolf' ? 85 : kind === 'slime' ? 70 : 45, radius = .8, speed = kind === 'wolf' ? 5.2 : kind === 'slime' ? 2.8 : 1.8;
    if (kind === 'sheep') {
      const wool = mesh(new THREE.IcosahedronGeometry(.85, 1), this.materials.color(0xeee8cf)); wool.scale.set(1.3, .85, .85); wool.position.y = .9; group.add(wool);
      const head = mesh(new THREE.BoxGeometry(.48, .52, .55), this.materials.color(0x383946)); head.position.set(0, .92, .85); group.add(head);
      for (const x of [-.55, .55]) for (const z of [-.4, .42]) { const leg = mesh(new THREE.CylinderGeometry(.09, .11, .65, 5), this.materials.color(0x343440)); leg.position.set(x, .32, z); group.add(leg); }
    } else if (kind === 'wolf') {
      const fur = this.materials.color(0x59606b); const body = mesh(new THREE.CapsuleGeometry(.45, 1.05, 3, 6), fur); body.rotation.x = Math.PI / 2; body.position.y = .72; group.add(body); const head = mesh(new THREE.ConeGeometry(.52, .9, 5), fur); head.rotation.x = Math.PI / 2; head.position.set(0, .95, .92); group.add(head); for (const x of [-.28, .28]) { const ear = mesh(new THREE.ConeGeometry(.14, .4, 4), this.materials.color(0x30333b)); ear.position.set(x, 1.4, .63); group.add(ear); }
    } else {
      const slime = mesh(new THREE.SphereGeometry(.82, 8, 6), this.materials.color(0x76e06c, { emissive: 0x173f1b, emissiveIntensity: .35 })); slime.scale.y = .72; slime.position.y = .58; group.add(slime); for (const x of [-.24, .24]) { const eye = mesh(new THREE.SphereGeometry(.1, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffe8 }), false); eye.position.set(x, .78, .68); group.add(eye); }
    }
    const entity = { id: crypto.randomUUID(), type: 'wildlife', kind, team: 'neutral', group, hp, maxHp: hp, radius, speed, velocity: new THREE.Vector3(), aim: new THREE.Vector3(0, 0, 1), wanderAngle: Math.random() * Math.PI * 2, decisionTimer: 0, attackCooldown: 0, dead: false }; group.traverse(o => { if (o.isMesh) o.userData.entity = entity; }); this.scene.add(group); return entity;
  }
  animateUnit(e, time, dt) {
    if (e.dead) return;
    const speed = Math.hypot(e.velocity.x, e.velocity.z), moving = speed > .25, airborne = e.group.position.y > .05, cycle = time * (moving ? 10 : 3) + e.bobSeed;
    e.recoil = Math.max(0, e.recoil - dt * 5.5);
    const recoiling = e.recoil > .01;
    // no bob while firing — recoil kick instead; walk bob only while grounded and moving
    const bob = recoiling || airborne ? 0 : Math.sin(cycle) * (moving ? .09 : .02);
    e.body.position.y = 1.15 + bob; e.head.position.y = 2.15 + bob;
    if (e.carriedCrate) {
      // both hands out front, holding the crate
      e.leftHand.position.set(-.45, 1.5, .98); e.rightHand.position.set(.45, 1.5, .98);
      e.weaponGroup.visible = false;
    } else {
      e.weaponGroup.visible = true;
      e.leftHand.position.set(-.85, 1.24 - Math.sin(cycle) * (moving && !airborne ? .18 : 0), .12);
      e.rightHand.position.set(.85, 1.24 + Math.sin(cycle) * (moving && !airborne ? .18 : 0), .12);
    }
    if (airborne) { e.leftBoot.position.z = .12; e.rightBoot.position.z = -.12; }
    else { e.leftBoot.position.z = Math.sin(cycle) * (moving ? .22 : 0); e.rightBoot.position.z = -Math.sin(cycle) * (moving ? .22 : 0); }
    // recoil pose: gun kicks back, body leans away from the shot
    e.weaponGroup.position.z = .72 - e.recoil * .34;
    e.body.rotation.x = -e.recoil * .22;
    e.head.position.z = -e.recoil * .16;
    e.group.rotation.z = THREE.MathUtils.lerp(e.group.rotation.z, e.state === 'tumble' ? Math.sin(time * 14) * .8 : 0, Math.min(1, dt * 8));
    // jump squash & stretch
    const stretch = airborne ? 1 + Math.min(.18, Math.abs(e.verticalVelocity || 0) * .015) : 1;
    e.body.scale.y = THREE.MathUtils.lerp(e.body.scale.y, stretch, Math.min(1, dt * 10));
    // hit impact: quick horizontal body punch
    e.hitTimer = Math.max(0, (e.hitTimer || 0) - dt);
    e.body.scale.x = e.body.scale.z = 1 + e.hitTimer * 1.4;
  }
}
