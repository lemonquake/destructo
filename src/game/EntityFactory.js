import * as THREE from 'three';
import { CLASSES, TEAM, WEAPONS, CRATE_TYPES } from '../data/gameData.js';
import { SKIN_TEXTURES } from './Materials.js';

const GEO = {
  body: new THREE.BoxGeometry(1.05, 1.3, .82), head: new THREE.BoxGeometry(.92, .78, .86), hand: new THREE.BoxGeometry(.34, .34, .34), boot: new THREE.BoxGeometry(.42, .3, .62), eye: new THREE.BoxGeometry(.22, .15, .06), gun: new THREE.BoxGeometry(.22, .26, .85), barrel: new THREE.CylinderGeometry(.07, .07, .62, 6), crate: new THREE.BoxGeometry(1.15, 1.15, 1.15),
};

function mesh(geometry, material, shadows = true) { const m = new THREE.Mesh(geometry, material); m.castShadow = shadows; m.receiveShadow = shadows; return m; }

export class EntityFactory {
  constructor(scene, materials) { this.scene = scene; this.materials = materials; this.teams = {}; }
  auraTexture() {
    if (this._auraTexture) return this._auraTexture;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d'), glow = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
    glow.addColorStop(0, 'rgba(255,255,255,.9)'); glow.addColorStop(.2, 'rgba(255,255,255,.55)'); glow.addColorStop(.55, 'rgba(255,255,255,.2)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, 128, 128);
    this._auraTexture = new THREE.CanvasTexture(canvas); return this._auraTexture;
  }
  // teams: map of teamId -> {color, dark}; legacy 'blue'/'red' keep working as fallback
  setTeams(teams) { this.teams = teams || {}; }
  teamColor(team) { return this.teams[team]?.color ?? (team === 'red' ? TEAM.RED : TEAM.BLUE); }
  teamDark(team) { return this.teams[team]?.dark ?? (team === 'red' ? 0x8e2634 : 0x11638f); }
  createUnit(classId = 'scout', team = 'blue', position = new THREE.Vector3(), player = false, opts = {}) {
    const def = CLASSES[classId], color = this.teamColor(team);
    const group = new THREE.Group(); group.position.copy(position); group.name = `${team}-${classId}`;
    const skinName = opts.skin || SKIN_TEXTURES[[...classId].reduce((s, c) => s + c.charCodeAt(0), 0) % SKIN_TEXTURES.length];
    const uniform = this.materials.skin(skinName, color), dark = this.materials.color(this.teamDark(team)), skin = this.materials.color(0xf3d6a6);
    const body = mesh(GEO.body, uniform); body.position.y = 1.15; group.add(body);
    const head = mesh(GEO.head, uniform); head.position.y = 2.15; group.add(head);
    const auraMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .55, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending });
    const bodyAura = mesh(GEO.body, auraMat, false); bodyAura.position.copy(body.position); bodyAura.scale.setScalar(1.18); group.add(bodyAura);
    const headAura = mesh(GEO.head, auraMat, false); headAura.position.copy(head.position); headAura.scale.setScalar(1.22); group.add(headAura);
    const auraGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.auraTexture(), color, transparent: true, opacity: .68, depthWrite: false, blending: THREE.AdditiveBlending }));
    auraGlow.position.set(0, 1.3, -.22); auraGlow.scale.set(4.8, 5.4, 1); auraGlow.renderOrder = -1; group.add(auraGlow);
    const auraRing = mesh(new THREE.RingGeometry(.78, 1.5, 36), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }), false);
    auraRing.rotation.x = -Math.PI / 2; auraRing.position.y = .045; group.add(auraRing);
    // glowing yellow eyes, parented to the head so they follow every head animation
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffe23f });
    [-.24, .24].forEach(x => {
      const eye = mesh(GEO.eye, eyeMat, false); eye.position.set(x, .08, .44); head.add(eye);
      const glow = mesh(new THREE.PlaneGeometry(.4, .3), new THREE.MeshBasicMaterial({ color: 0xffe23f, transparent: true, opacity: .35, depthWrite: false }), false); glow.position.set(x, .08, .46); head.add(glow);
    });
    const mouth = mesh(new THREE.BoxGeometry(.3, .06, .05), this.materials.color(0x11131e), false); mouth.position.set(0, -.24, .44); head.add(mouth);
    const leftHand = mesh(GEO.hand, skin), rightHand = mesh(GEO.hand, skin); leftHand.position.set(-.78, 1.24, .12); rightHand.position.set(.78, 1.24, .12); group.add(leftHand, rightHand);
    const leftBoot = mesh(GEO.boot, dark), rightBoot = mesh(GEO.boot, dark); leftBoot.position.set(-.33, .22, .03); rightBoot.position.set(.33, .22, .03); group.add(leftBoot, rightBoot);
    const weaponGroup = new THREE.Group(); weaponGroup.position.set(.72, 1.22, .72); group.add(weaponGroup);
    if (opts.hat) this.addHat(group, opts.hat, color);
    const grade = opts.grade || 'normal';
    if (grade === 'elite') { const stripe = mesh(new THREE.TorusGeometry(.68, .07, 6, 14), this.materials.color(0xffd23f, { emissive: 0xaa7700, emissiveIntensity: .6 })); stripe.rotation.x = Math.PI / 2; stripe.position.y = 1.55; group.add(stripe); }
    if (grade === 'special') { group.scale.setScalar(1.12); const core = mesh(new THREE.OctahedronGeometry(.22, 0), this.materials.color(0xa4ecff, { emissive: 0x2fa0e0, emissiveIntensity: 1.5 }), false); core.position.set(0, 1.35, .58); group.add(core); const halo = mesh(new THREE.TorusGeometry(.92, .05, 6, 20), this.materials.color(0x9fe8ff, { emissive: 0x2fa0e0, emissiveIntensity: 1.1 }), false); halo.rotation.x = Math.PI / 2; halo.position.y = .12; group.add(halo); }
    const entity = { id: crypto.randomUUID(), type: 'unit', team, classId, classDef: def, grade, passive: opts.passive || null, active: opts.active || null, group, body, head, bodyAura, headAura, auraGlow, auraRing, leftHand, rightHand, leftBoot, rightBoot, weaponGroup, hp: def.hp, maxHp: def.hp, mp: def.mp, maxMp: def.mp, shield: 0, weaponId: def.weapon, weapon: WEAPONS[def.weapon], weaponTier: 0, grenades: 0, velocity: new THREE.Vector3(), aim: new THREE.Vector3(0, 0, 1), radius: .72, state: 'grounded', stun: 0, freeze: 0, fireCooldown: 0, abilityCooldown: 0, statusTimer: 0, recoil: 0, verticalVelocity: 0, buffs: { speed: 0, damage: 0, rapid: 0 }, dead: false, player, carriedCrate: null, kills: 0, animationSeed: Math.random() * 10, attackStyle: Math.floor(Math.random() * 3), groundY: position.y, dangerCooldown: 0, dangerTimer: 0 };
    this.setWeaponModel(entity, def.weapon, WEAPONS[def.weapon]);
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
  applyCrateVariant(entity, profile) {
    const type=CRATE_TYPES[profile?.dominant||'brown'];if(!entity||!type||type.id==='brown')return entity;
    entity.crateVariant=type.id;
    const mat=new THREE.MeshBasicMaterial({color:type.color,transparent:true,opacity:type.id==='yellow'?.24:.19,depthWrite:false,blending:THREE.AdditiveBlending});
    for(const source of [entity.body,entity.head]){const shell=mesh(source.geometry,mat.clone(),false);shell.position.copy(source.position);shell.rotation.copy(source.rotation);shell.scale.copy(source.scale).multiplyScalar(1.025);entity.group.add(shell)}
    const gem=mesh(new THREE.OctahedronGeometry(.14,0),this.materials.color(type.color,{emissive:type.color,emissiveIntensity:1.8,metalness:.55,roughness:.2}),false);gem.position.set(0,1.52,.55);entity.group.add(gem);
    return entity;
  }
  // standalone weapon model: used on units, as ground pickups and as overhead icons
  buildWeaponModel(weaponId, weapon = WEAPONS[weaponId]) {
    const root = new THREE.Group();
    const accentColor = weapon.rarityColor || weapon.color;
    const tintedMetal=weapon.variant?.dominant&&weapon.variant.dominant!=='brown'?new THREE.Color(0x495262).lerp(new THREE.Color(accentColor),.38).getHex():0x495262;
    const metal = this.materials.color(tintedMetal, { metalness: .72, roughness: .24, emissive:weapon.variant?.dominant==='yellow'?0x5a4300:0x000000,emissiveIntensity:.55 });
    const dark = this.materials.color(0x171c28, { metalness: .45, roughness: .38 });
    const accent = this.materials.color(accentColor, { metalness: .35, roughness: .25 });
    const glow = this.materials.color(accentColor, { emissive: accentColor, emissiveIntensity: weapon.crimson ? 2.8 : .8, roughness: .2 });
    const addBox = (s, p, mat = metal, r = null) => { const m = mesh(new THREE.BoxGeometry(...s), mat); m.position.set(...p); if (r) m.rotation.set(...r); root.add(m); return m; };
    const addTube = (radius, length, p, mat = dark, axis = 'x') => { const m = mesh(new THREE.CylinderGeometry(radius, radius, length, 8), mat); m.position.set(...p); m.rotation[axis] = Math.PI / 2; root.add(m); return m; };
    switch (weaponId) {
      case 'pistol': addBox([.28,.32,.62],[0,0,.25]); addTube(.055,.56,[0,.05,.72]); addBox([.19,.42,.2],[0,-.28,.05],dark,[.18,0,0]); break;
      case 'needle': addBox([.2,.24,.58],[0,0,.26],accent); addTube(.025,.78,[0,0,.92],glow); addTube(.13,.34,[0,0,.52],glow); break;
      case 'uzi': addBox([.26,.32,.54],[0,0,.15],dark); addTube(.045,.4,[0,.02,.58],accent); addBox([.15,.42,.22],[0,-.34,.1],metal,[.25,0,0]); break;
      case 'flamethrower': addBox([.42,.38,.76],[0,0,.22]); addTube(.12,.66,[0,.02,.8],accent); addBox([.2,.34,.3],[0,-.24,-.12],glow); break;
      case 'railgun': addBox([.34,.34,.98],[0,0,.26],dark); addTube(.04,1.1,[0,.04,1.14],glow); [-.08,.08].forEach(x => addBox([.06,.06,1.0],[x,.04,.92],accent)); break;
      case 'freezeray': addBox([.44,.38,.68],[0,0,.15],accent); addTube(.08,.75,[0,.02,.82],glow); addBox([.28,.28,.28],[0,-.22,.28],dark); break;
      case 'sniper': addBox([.3,.3,1.02],[0,0,.38]); addTube(.045,1.12,[0,.02,1.42]); addTube(.1,.5,[0,.23,.3],accent); addBox([.48,.22,.5],[0,-.02,-.42],dark); break;
      case 'machinegun': addBox([.5,.48,.9],[0,0,.32]); [-.13,0,.13].forEach(x=>{const b=addTube(.045,1,[x,.02,1.15]); b.name='rotary-barrel';}); addTube(.3,.26,[0,-.34,.25],accent,'z'); break;
      case 'grenade': addBox([.45,.4,.62],[0,0,.18],dark); {const cup=mesh(new THREE.CylinderGeometry(.24,.12,.52,8),metal);cup.rotation.x=Math.PI/2;cup.position.z=.72;root.add(cup);} addBox([.18,.48,.25],[0,-.28,-.05],accent); break;
      case 'shotgun': [-.12,.12].forEach(x=>addTube(.075,1.02,[x,.04,.9])); addBox([.52,.3,.62],[0,0,.1]); addBox([.4,.28,.42],[0,0,-.42],accent); break;
      case 'carbine': addBox([.34,.34,.86],[0,0,.3],accent); addTube(.05,.72,[0,.02,.98]); addBox([.42,.22,.4],[0,-.02,-.35]); addBox([.15,.42,.24],[0,-.3,.22],dark,[.28,0,0]); break;
      case 'mine': addBox([.44,.34,.58],[0,0,.15]); {const disc=mesh(new THREE.CylinderGeometry(.3,.3,.14,10),glow);disc.rotation.x=Math.PI/2;disc.position.z=.66;root.add(disc);} break;
      case 'smg': addBox([.38,.42,.66],[0,0,.2],dark); addTube(.06,.45,[0,0,.74],accent); addBox([.17,.5,.22],[0,-.34,.18],metal,[.25,0,0]); addBox([.34,.18,.28],[0,.16,-.25],accent); break;
      case 'rocket': addTube(.24,1.35,[0,.03,.55],metal); addTube(.18,.38,[0,.03,1.4]); for(const x of [-.32,.32]) addBox([.08,.38,.48],[x,0,.05],accent); break;
      case 'grenadelauncher': addBox([.42,.4,.72],[0,0,.2]); {const drum=mesh(new THREE.CylinderGeometry(.28,.28,.34,8),accent);drum.rotation.z=Math.PI/2;drum.position.set(0,-.2,.22);root.add(drum);} addTube(.12,.72,[0,.02,.91]); break;
      case 'rifle': addBox([.36,.34,.92],[0,0,.3]); addTube(.055,.78,[0,.02,1.14]); addBox([.16,.48,.25],[0,-.34,.3],accent,[.28,0,0]); addBox([.46,.26,.45],[0,0,-.42],dark); break;
      case 'tesla': addBox([.46,.42,.7],[0,0,.12],dark); [.45,.72,.99].forEach(z=>{const coil=mesh(new THREE.TorusGeometry(.24,.045,6,12),glow);coil.position.z=z;root.add(coil)}); [-.16,.16].forEach(x=>addTube(.035,.7,[x,0,1.18],accent)); break;
      case 'plasma': addBox([.48,.42,.82],[0,0,.22]); {const core=mesh(new THREE.IcosahedronGeometry(.22,1),glow);core.position.z=.72;root.add(core);} [-.24,.24].forEach(x=>addBox([.1,.12,.82],[x,0,.82],accent)); break;
      default: addBox([.3,.3,.8],[0,0,.3]); addTube(.06,.6,[0,0,.92]); break;
    }
    if (weapon.crimson) {
      const auraMat = new THREE.MeshBasicMaterial({ color: 0xff102c, transparent: true, opacity: .72, depthWrite: false, blending: THREE.AdditiveBlending });
      root.userData.auraRings = [0, 1].map((_, i) => { const ring = new THREE.Mesh(new THREE.TorusGeometry(.42 + i * .12, .035, 6, 20), auraMat.clone()); ring.rotation.x = Math.PI / 2; ring.position.z = .45 + i * .35; root.add(ring); return ring; });
      const light = new THREE.PointLight(0xff102c, 2.2, 4); light.position.z = .7; root.add(light);
    } else {
      root.userData.auraRings = [];
      if(weapon.variant?.dominant&&weapon.variant.dominant!=='brown'){
        const shine=mesh(new THREE.TorusGeometry(.34,.025,6,18),new THREE.MeshBasicMaterial({color:accentColor,transparent:true,opacity:.72,blending:THREE.AdditiveBlending,depthWrite:false}),false);shine.rotation.x=Math.PI/2;shine.position.z=.5;root.add(shine);root.userData.auraRings.push(shine);
      }
    }
    return root;
  }
  setWeaponModel(entity, weaponId, weapon = WEAPONS[weaponId]) {
    const root = entity.weaponGroup; root.clear();
    const model = this.buildWeaponModel(weaponId, weapon);
    while (model.children.length) root.add(model.children[0]);
    root.userData.auraRings = model.userData.auraRings;
    root.scale.setScalar(1 + Math.min(.22, (weapon.variant?.strength || 0) * .018));
    entity.weaponId = weaponId; entity.weapon = weapon;
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
    const group = new THREE.Group(); group.position.copy(position); const color = this.teamColor(team);
    const foundation = mesh(new THREE.BoxGeometry(8, 1.1, 7), this.materials.building('concrete')); foundation.position.y = .55; group.add(foundation);
    const core = mesh(new THREE.BoxGeometry(5.2, 4.2, 4.4), this.materials.building('plating')); core.position.y = 2.65; group.add(core);
    for (const x of [-2.9, 2.9]) for (const z of [-2.5, 2.5]) { const p = mesh(new THREE.BoxGeometry(.7, 5, .7), this.materials.teamTextured('tech_pillar', color)); p.position.set(x, 2.8, z); group.add(p); }
    const roof = mesh(new THREE.CylinderGeometry(3.8, 3.8, .65, 8), this.materials.teamTextured('tech_roof', color)); roof.position.y = 5.05; group.add(roof);
    const stripe = mesh(new THREE.BoxGeometry(5.26, .8, 4.46), this.materials.building('hazard')); stripe.position.y = 1.2; group.add(stripe);
    const key = mesh(new THREE.TorusGeometry(.72, .2, 6, 10), this.materials.building('plating', { color: 0xd9a928, metalness: .8, roughness: .2 })); key.rotation.x = Math.PI / 2; key.position.set(0, 2.8, team === 'blue' ? -2.25 : 2.25); group.add(key);
    const entity = { id: `${team}-factory`, type: 'factory', team, group, hp: 900, maxHp: 900, radius: 4, dead: false };
    group.traverse(o => { if (o.isMesh) o.userData.entity = entity; }); this.scene.add(group); return entity;
  }
  createCrate(position, type = CRATE_TYPES.brown) {
    if (type === true) type = CRATE_TYPES.blue; // legacy "charged" flag
    if (typeof type === 'string') type = CRATE_TYPES[type] || CRATE_TYPES.brown;
    const mat = this.materials.crate(type.id);
    const group = new THREE.Group(); group.position.copy(position);
    // Keep the gameplay root at ground level while the visible body tumbles about
    // its actual center of mass. This avoids the old corner-pivoted rotation.
    const visual = new THREE.Group(); visual.position.y = .575; group.add(visual);
    const box = mesh(GEO.crate, mat); visual.add(box);
    const bandMat = this.materials.color(type.band);
    const bands = [];
    for (let i = 0; i < 3; i++) { const band = mesh(new THREE.BoxGeometry(i === 0 ? 1.2 : .12, .08, i === 0 ? .12 : 1.2), bandMat); band.position.set(i === 1 ? -.38 : i === 2 ? .38 : 0, .58, 0); visual.add(band); bands.push(band); }
    if (type.tier >= 2) { const gem = mesh(new THREE.OctahedronGeometry(.2, 0), this.materials.color(0xffffff, { emissive: type.color, emissiveIntensity: 1.6 }), false); gem.position.y = .84; visual.add(gem); }
    const entity = { id: crypto.randomUUID(), type: 'crate', crateType: type, originalType: type, charged: type.tier >= 2, group, visual, box, bands, position: group.position, radius: .72, halfExtent: .575, mass: type.mass || 1, velocity: new THREE.Vector3(), angularVelocity: new THREE.Vector3(), carried: false, placed: false, solid: false, falling: false, physicsActive: false, grounded: true };
    group.userData.entity = entity; group.traverse(o => { if (o.isMesh) o.userData.entity = entity; }); this.scene.add(group); return entity;
  }
  applyCrateType(crate, type) {
    crate.crateType = type; crate.mass = type.mass || 1; crate.charged = type.tier >= 2;
    const mat = this.materials.crate(type.id);
    if (crate.box) crate.box.material = mat;
    for (const band of crate.bands || []) band.material = this.materials.color(type.band, type.tier >= 2 ? { emissive: type.color, emissiveIntensity: .35 } : {});
  }
  createTank(team, position, kind = 'tank') {
    const isAPC=kind==='apc',mega=kind===true||kind==='mega';
    const group = new THREE.Group(); group.position.copy(position); const color = this.teamColor(team);
    const hull = mesh(new THREE.BoxGeometry(3.1, 1.1, 4.1), this.materials.teamTextured('tech_roof', color)); hull.position.y = 1; group.add(hull);
    for (const x of [-1.7, 1.7]) { const tread = mesh(new THREE.BoxGeometry(.55, .75, 4.4), this.materials.building('plating')); tread.position.set(x, .7, 0); group.add(tread); }
    const turret = new THREE.Group(); const dome = mesh(isAPC?new THREE.BoxGeometry(1.9,.72,1.8):new THREE.CylinderGeometry(1.15, 1.4, .75, 8), this.materials.metal); dome.position.y = 1.75; turret.add(dome); const barrel = mesh(new THREE.CylinderGeometry(isAPC ? .08 : .14,isAPC ? .1 : .18,isAPC?2.2:3.8,8), this.materials.metal); barrel.rotation.x = Math.PI / 2; barrel.position.set(0,1.8,isAPC?1.35:1.9); turret.add(barrel); group.add(turret);
    if (mega) { group.scale.setScalar(1.3); const fin = mesh(new THREE.BoxGeometry(.2, 1.1, 1.6), this.materials.color(0xffd23f, { emissive: 0xaa7700, emissiveIntensity: .5 })); fin.position.set(0, 1.9, -1.6); group.add(fin); }
    const hp = mega ? 900 : isAPC?560:720,passengers=[];
    const cannon={...WEAPONS.rocket,name:isAPC?'APC Autocannon':'Tank Cannon',damage:isAPC?28:115,rate:isAPC ? .34 : 1.15,speed:isAPC?76:38,range:isAPC?48:62,spread:isAPC ? .014 : .0025,explosive:!isAPC,projectileStyle:isAPC?'tracer':'missile',recoil:isAPC?1.4:8};
    const entity = { id: crypto.randomUUID(), type: 'vehicle', vehicleKind:isAPC?'apc':'tank', autonomous:false, team, name:isAPC?'Armored Carrier':'Battle Tank', group, turret, head:turret, barrels:[barrel], hp, maxHp: hp, armor:isAPC ? .32 : .42,radius: mega ? 2.7 : 2.1, velocity: new THREE.Vector3(), aim: new THREE.Vector3(0, 0, 1), speed:isAPC?6.2:mega?4.4:4.8,turnSpeed:isAPC?1.65:1.25,weaponId:'cannon',weapon:cannon,fireCooldown:0,driver:null,passengers,capacity:3,wheels:[],wheelSpin:0,interactive:true,dead:false };
    Object.defineProperty(entity,'occupants',{get:()=>[entity.driver,...entity.passengers].filter(Boolean)});
    group.traverse(o => { if (o.isMesh) o.userData.entity = entity; }); this.scene.add(group); return entity;
  }
  createTurret(team, position) {
    const group = new THREE.Group(); group.position.copy(position); const color = this.teamColor(team);
    const base = mesh(new THREE.CylinderGeometry(.75, .95, .35, 8), this.materials.metal); base.position.y = .18; group.add(base);
    const stem = mesh(new THREE.CylinderGeometry(.18, .25, .9, 6), this.materials.teamTextured('tech_pillar', color)); stem.position.y = .78; group.add(stem);
    const head = new THREE.Group(); head.position.y = 1.28; const housing = mesh(new THREE.BoxGeometry(.75, .48, .72), this.materials.metal); head.add(housing); const barrel = mesh(new THREE.CylinderGeometry(.07, .09, 1.25, 6), this.materials.metal); barrel.rotation.x = Math.PI / 2; barrel.position.z = .82; head.add(barrel); group.add(head);
    const entity = { id: crypto.randomUUID(), type: 'turret', team, group, head, barrels: [barrel], hp: 180, maxHp: 180, armor: .22, radius: .85, velocity: new THREE.Vector3(), aim: new THREE.Vector3(0, 0, 1), aimPitch: 0, speed: 0, stationary: true, weapon: { ...WEAPONS.machinegun, damage: 10, rate: .16, range: 22 }, fireCooldown: 0, dead: false };
    group.traverse(o => { if (o.isMesh) o.userData.entity = entity; }); this.scene.add(group); return entity;
  }
  createBaseTurret(team, position) {
    const group=new THREE.Group();group.position.copy(position);const color=this.teamColor(team),metal=this.materials.building('plating'),accent=this.materials.teamTextured('tech_pillar',color),glow=this.materials.color(0xffd23f,{emissive:0xff9b18,emissiveIntensity:1.4,metalness:.5});
    const base=mesh(new THREE.CylinderGeometry(1.8,2.25,.75,12),metal);base.position.y=.38;group.add(base);
    for(let i=0;i<8;i++){const a=i*Math.PI/4,foot=mesh(new THREE.BoxGeometry(.55,.42,1.45),accent);foot.position.set(Math.sin(a)*1.85,.3,Math.cos(a)*1.85);foot.rotation.y=a;group.add(foot)}
    const column=mesh(new THREE.CylinderGeometry(.7,1.05,2.15,10),accent);column.position.y=1.5;group.add(column);
    const head=new THREE.Group();head.position.y=2.55;const housing=mesh(new THREE.BoxGeometry(2.6,1.35,2.35),metal);housing.position.y=.15;head.add(housing);
    const cockpit=mesh(new THREE.SphereGeometry(.78,12,8,0,Math.PI*2,0,Math.PI/2),this.materials.color(0x8deaff,{transparent:true,opacity:.7,emissive:0x137fa8,emissiveIntensity:.8}));cockpit.position.set(0,.82,-.25);head.add(cockpit);
    const barrels=[];for(const x of [-.62,0,.62]){const barrel=mesh(new THREE.CylinderGeometry(.09,.13,2.8,8),metal);barrel.rotation.x=Math.PI/2;barrel.position.set(x,.18,2.05);head.add(barrel);barrels.push(barrel)}
    for(const x of [-1.05,1.05]){const pod=mesh(new THREE.BoxGeometry(.48,.72,1.4),accent);pod.position.set(x,.05,.65);head.add(pod);const lamp=mesh(new THREE.SphereGeometry(.13,8,6),glow,false);lamp.position.set(x,.08,1.42);head.add(lamp)}group.add(head);
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=180;const ctx=canvas.getContext('2d'),texture=new THREE.CanvasTexture(canvas),warning=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false}));warning.position.set(0,5.8,0);warning.scale.set(5.8,2.05,1);warning.visible=false;group.add(warning);
    const entity={id:`${team}-base-turret`,type:'turret',team,group,head,barrels,hp:520,maxHp:520,armor:.38,mp:1,maxMp:1,shield:0,radius:2,velocity:new THREE.Vector3(),aim:new THREE.Vector3(0,0,1),aimPitch:0,speed:0,stationary:true,player:true,weaponId:'machinegun',weapon:{...WEAPONS.machinegun,damage:15,rate:.085,range:55},ammo:50,magazineSize:50,reloadTimer:0,fireCooldown:0,dead:false,baseTurret:true,interactive:true,jellyStrength:.22,delayedExplosion:true,critical:false,explosionTimer:0,rider:null,warning,warningCanvas:canvas,warningContext:ctx,warningTexture:texture};
    group.userData.entity=entity;group.traverse(o=>{if(o.isMesh)o.userData.entity=entity});this.scene.add(group);return entity;
  }
  createBunker(position) {
    const group=new THREE.Group();group.position.copy(position);const concrete=this.materials.building('concrete'),metal=this.materials.building('plating'),hazard=this.materials.building('hazard');
    const body=mesh(new THREE.BoxGeometry(7.4,2.9,5.8),concrete);body.position.y=1.45;group.add(body);
    const roof=mesh(new THREE.BoxGeometry(8,.55,6.35),metal);roof.position.y=3.12;group.add(roof);
    const front=mesh(new THREE.BoxGeometry(7.7,1.05,.55),hazard);front.position.set(0,2.05,3);group.add(front);
    const slitMat=this.materials.color(0x111827,{emissive:0x143042,emissiveIntensity:.35});
    const slots=[];
    for(const x of [-2.35,0,2.35]){const slit=mesh(new THREE.BoxGeometry(1.55,.56,.16),slitMat,false);slit.position.set(x,2.08,3.31);group.add(slit);slots.push(new THREE.Vector3(x,1.35,1.7))}
    const door=mesh(new THREE.BoxGeometry(1.5,2.15,.18),metal);door.position.set(0,1.08,-3);group.add(door);
    const entity={id:crypto.randomUUID(),type:'bunker',team:'neutral',name:'Field Bunker',group,hp:760,maxHp:760,armor:.46,radius:3.1,stationary:true,interactive:true,jellyStrength:1,capacity:3,occupants:[],slots,aim:new THREE.Vector3(0,0,1),dead:false};
    group.userData.entity=entity;group.traverse(o=>{if(o.isMesh)o.userData.entity=entity});this.scene.add(group);return entity;
  }
  createMotorcycle(position, rotation=0) {
    const group=new THREE.Group();group.position.copy(position);group.rotation.y=rotation;const dark=this.materials.color(0x202532,{metalness:.7,roughness:.32}),chrome=this.materials.color(0x9da9b5,{metalness:.92,roughness:.18}),accent=this.materials.color(0xff3f48,{emissive:0x651018,emissiveIntensity:.35});
    const wheels=[];for(const z of [-1.15,1.15]){const wheel=mesh(new THREE.TorusGeometry(.48,.16,8,18),dark);wheel.rotation.y=Math.PI/2;wheel.position.set(0,.52,z);group.add(wheel);wheels.push(wheel)}
    const frame=mesh(new THREE.BoxGeometry(.38,.35,1.65),accent);frame.position.set(0,.78,0);group.add(frame);const tank=mesh(new THREE.CapsuleGeometry(.35,.55,4,8),accent);tank.rotation.x=Math.PI/2;tank.position.set(0,1.05,.25);group.add(tank);
    const fork=mesh(new THREE.CylinderGeometry(.055,.055,1.25,6),chrome);fork.rotation.x=-.42;fork.position.set(0,.9,1);group.add(fork);const handle=mesh(new THREE.CylinderGeometry(.045,.045,1.1,6),chrome);handle.rotation.z=Math.PI/2;handle.position.set(0,1.45,1.15);group.add(handle);
    const seat=mesh(new THREE.BoxGeometry(.72,.18,1.05),dark);seat.position.set(0,1.18,-.45);group.add(seat);const lamp=mesh(new THREE.SphereGeometry(.16,8,6),this.materials.color(0xfff1a8,{emissive:0xffd23f,emissiveIntensity:1.8}),false);lamp.position.set(0,1.12,1.48);group.add(lamp);
    const forward=new THREE.Vector3(Math.sin(rotation),0,Math.cos(rotation));const entity={id:crypto.randomUUID(),type:'motorcycle',team:'neutral',name:'Motorcycle',group,hp:210,maxHp:210,armor:.14,radius:1.25,velocity:new THREE.Vector3(),aim:forward,speed:13.5,turnSpeed:3.2,driver:null,passenger:null,wheels,wheelSpin:0,interactive:true,dead:false};
    group.userData.entity=entity;group.traverse(o=>{if(o.isMesh)o.userData.entity=entity});this.scene.add(group);return entity;
  }
  createCar(position, rotation=0, color=0x35b8ff) {
    const group=new THREE.Group();group.position.copy(position);group.rotation.y=rotation;
    const bodyMat=this.materials.teamTextured('vehicle_metal',color,2),dark=this.materials.color(0x161b24,{metalness:.7,roughness:.35}),glass=this.materials.building('city_glass',{metalness:.25,roughness:.18}),lampMat=this.materials.color(0xfff3b0,{emissive:0xffcf4a,emissiveIntensity:1.8});
    const chassis=mesh(new THREE.BoxGeometry(2.45,.72,4.35),bodyMat);chassis.position.y=.92;group.add(chassis);
    const cabin=mesh(new THREE.BoxGeometry(2.05,.92,2.2),glass);cabin.position.set(0,1.62,-.15);group.add(cabin);
    const hood=mesh(new THREE.BoxGeometry(2.15,.36,1.15),bodyMat);hood.position.set(0,1.25,1.48);group.add(hood);
    const bumpers=[];for(const z of [-2.25,2.25]){const bumper=mesh(new THREE.BoxGeometry(2.55,.22,.22),dark);bumper.position.set(0,.65,z);group.add(bumper);bumpers.push(bumper)}
    const wheels=[];for(const x of [-1.23,1.23])for(const z of [-1.42,1.42]){const wheel=mesh(new THREE.CylinderGeometry(.48,.48,.3,14),dark);wheel.rotation.z=Math.PI/2;wheel.position.set(x,.61,z);group.add(wheel);wheels.push(wheel)}
    for(const x of [-.72,.72]){const light=mesh(new THREE.BoxGeometry(.42,.25,.1),lampMat,false);light.position.set(x,1.08,2.22);group.add(light)}
    const forward=new THREE.Vector3(Math.sin(rotation),0,Math.cos(rotation));
    const passengers=[];const entity={id:crypto.randomUUID(),type:'car',team:'neutral',name:'Four-Seat Roadster',group,hp:640,maxHp:640,armor:.28,radius:2.2,velocity:new THREE.Vector3(),aim:forward,speed:16,turnSpeed:2.2,driver:null,passengers,capacity:4,wheels,wheelSpin:0,interactive:true,jellyStrength:.2,dead:false};Object.defineProperty(entity,'occupants',{get:()=>entity.passengers});
    group.userData.entity=entity;group.traverse(o=>{if(o.isMesh)o.userData.entity=entity});this.scene.add(group);return entity;
  }
  createPickup(drop, position) {
    const group = new THREE.Group(); group.position.copy(position);
    if (drop.id === 'weapon') {
      const model = this.buildWeaponModel(drop.weaponId, drop.weapon || WEAPONS[drop.weaponId]);
      model.position.y = .75; model.rotation.z = .35; model.scale.setScalar(1.1); group.add(model);
      const ring = mesh(new THREE.RingGeometry(.5, .72, 20), new THREE.MeshBasicMaterial({ color: drop.color || 0xffd23f, transparent: true, opacity: .75, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }), false);
      ring.rotation.x = -Math.PI / 2; ring.position.y = .1; group.add(ring);
      const aura=mesh(new THREE.SphereGeometry(.85,12,8),new THREE.MeshBasicMaterial({color:0xffd23f,transparent:true,opacity:.13,blending:THREE.AdditiveBlending,depthWrite:false}),false);aura.position.y=.7;group.add(aura);group.userData.pickupAura=aura;
      const arrow=mesh(new THREE.ConeGeometry(.3,.7,6),new THREE.MeshBasicMaterial({color:0xff3045}),false);arrow.rotation.x=Math.PI;arrow.position.y=2.25;group.add(arrow);group.userData.pickupArrow=arrow;
    } else {
      const geo = drop.id === 'health' ? new THREE.BoxGeometry(.5, .5, .5) : drop.id === 'ammo' ? new THREE.CylinderGeometry(.24, .24, .5, 6) : new THREE.OctahedronGeometry(.34, 0);
      const item = mesh(geo, this.materials.color(drop.color, { emissive: drop.color, emissiveIntensity: .7 }), false); item.position.y = .55; group.add(item);
      if (drop.id === 'health') { const barV = mesh(new THREE.BoxGeometry(.14, .38, .05), new THREE.MeshBasicMaterial({ color: 0xffffff }), false); barV.position.set(0, .55, .27); group.add(barV); const barH = mesh(new THREE.BoxGeometry(.38, .14, .05), new THREE.MeshBasicMaterial({ color: 0xffffff }), false); barH.position.set(0, .55, .27); group.add(barH); }
    }
    const entity = { id: crypto.randomUUID(), type: 'pickup', drop, group, radius: .8, life: drop.droppedWeapon?60:25, velocity:new THREE.Vector3(), angularVelocity:new THREE.Vector3(), physicsActive:false };
    this.scene.add(group); return entity;
  }
  // ── Overhead pickup icons: spinning heart / ammo / weapon shown above a unit
  heartGeometry() {
    if (this._heartGeo) return this._heartGeo;
    const shape = new THREE.Shape();
    shape.moveTo(0, -.32);
    shape.bezierCurveTo(.42, .05, .4, .38, .2, .38);
    shape.bezierCurveTo(.05, .38, 0, .25, 0, .18);
    shape.bezierCurveTo(0, .25, -.05, .38, -.2, .38);
    shape.bezierCurveTo(-.4, .38, -.42, .05, 0, -.32);
    this._heartGeo = new THREE.ExtrudeGeometry(shape, { depth: .14, bevelEnabled: true, bevelSize: .04, bevelThickness: .04, bevelSegments: 2 });
    this._heartGeo.center();
    return this._heartGeo;
  }
  createOverheadIcon(kind, opts = {}) {
    const group = new THREE.Group();
    if (kind === 'heart') {
      const heart = mesh(this.heartGeometry(), this.materials.color(0xff3355, { emissive: 0xd1163a, emissiveIntensity: .9, roughness: .3 }), false);
      heart.scale.setScalar(1.15); group.add(heart);
    } else if (kind === 'ammo') {
      const casing = this.materials.color(0xffc44a, { metalness: .7, roughness: .3, emissive: 0x996a12, emissiveIntensity: .5 });
      const tip = this.materials.color(0xb0672a, { metalness: .6, roughness: .4 });
      [-.22, 0, .22].forEach((x, i) => {
        const bullet = new THREE.Group();
        const body = mesh(new THREE.CylinderGeometry(.09, .09, .38, 8), casing, false); bullet.add(body);
        const nose = mesh(new THREE.ConeGeometry(.09, .16, 8), tip, false); nose.position.y = .27; bullet.add(nose);
        bullet.position.set(x, i === 1 ? .06 : 0, 0); group.add(bullet);
      });
    } else if (kind === 'mana') {
      const cell = mesh(new THREE.OctahedronGeometry(.34, 0), this.materials.color(0x2fb4ff, { emissive: 0x1877c9, emissiveIntensity: 1 }), false);
      group.add(cell);
    } else if (kind === 'weapon') {
      const model = this.buildWeaponModel(opts.weaponId, opts.weapon || WEAPONS[opts.weaponId]);
      model.rotation.y = Math.PI / 2; model.scale.setScalar(1.05);
      const box = new THREE.Box3().setFromObject(model); const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center); group.add(model);
    }
    this.scene.add(group); return group;
  }
  // ── Temporary floating HP bar (billboarded sprites, shown while taking damage)
  createHPBar(width = 1.5) {
    const group = new THREE.Group();
    const bg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x0c101c, transparent: true, opacity: .78, depthWrite: false, depthTest: false }));
    bg.scale.set(width, .17, 1); group.add(bg);
    const fill = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x59e065, transparent: true, opacity: .95, depthWrite: false, depthTest: false }));
    fill.center.set(0, .5); fill.position.x = -width / 2 + .02; fill.scale.set(width - .04, .11, 1); group.add(fill);
    group.renderOrder = 999; bg.renderOrder = 998; fill.renderOrder = 999;
    group.visible = false; this.scene.add(group);
    return { group, bg, fill, width };
  }
  // ── 3D head portrait: renders the unit's head to a small offscreen canvas once
  portraitRig() {
    if (this._portraitRig) return this._portraitRig;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(96, 96); renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xe8f4ff, 0x44506a, 1.6));
    const key = new THREE.DirectionalLight(0xfff2d8, 2.2); key.position.set(1.4, 2, 2.4); scene.add(key);
    const camera = new THREE.PerspectiveCamera(34, 1, .1, 10); camera.position.set(0, .12, 1.9); camera.lookAt(0, 0, 0);
    this._portraitRig = { renderer, scene, camera };
    return this._portraitRig;
  }
  // clone without userData: entity back-references are circular and would blow
  // up three's JSON-based userData copy
  portraitClone(obj) {
    if (obj.isSprite || obj.isLight) return null;
    const node = obj.isMesh ? new THREE.Mesh(obj.geometry, obj.material) : new THREE.Group();
    node.position.copy(obj.position); node.rotation.copy(obj.rotation); node.scale.copy(obj.scale);
    for (const c of obj.children) { const n = this.portraitClone(c); if (n) node.add(n); }
    return node;
  }
  unitPortrait(entity) {
    if (entity.portraitURL) return entity.portraitURL;
    const { renderer, scene, camera } = this.portraitRig();
    const head = this.portraitClone(entity.head); head.position.set(0, 0, 0); head.rotation.set(.06, -.4, 0);
    const hat = entity.group.getObjectByName('hat');
    if (hat) { const hatClone = this.portraitClone(hat); hatClone.position.set(0, .47, 0); head.add(hatClone); }
    scene.add(head);
    renderer.render(scene, camera);
    entity.portraitURL = renderer.domElement.toDataURL();
    scene.remove(head);
    return entity.portraitURL;
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
    const phase = e.animationSeed || 0, auraPulse = 1 + Math.sin(time * 4 + phase) * .08;
    if (e.auraGlow) { e.auraGlow.material.opacity = .58 + Math.sin(time * 4 + phase) * .12; e.auraGlow.scale.set(4.8 * auraPulse, 5.4 * auraPulse, 1); }
    if (e.auraRing) { e.auraRing.scale.setScalar(auraPulse); e.auraRing.rotation.z = time * .28 + phase; }
    if (e.bodyAura) e.bodyAura.position.copy(e.body.position);
    if (e.headAura) e.headAura.position.copy(e.head.position);
    if (e.state === 'victory') {
      const cycle = time * 12 + phase;
      const jumpHeight = Math.abs(Math.sin(cycle * 0.5)) * 0.45;
      e.body.position.set(0, 1.15 + jumpHeight, 0);
      e.body.rotation.set(0, 0, 0);
      e.head.position.set(0, 2.15 + jumpHeight, 0);
      e.head.rotation.x = -0.2 + Math.sin(cycle) * 0.15;
      e.weaponGroup.position.set(.72, 1.22, .72);
      e.weaponGroup.rotation.x = -Math.PI / 2;
      let lh = [-1.0, 1.8 + Math.sin(cycle * 0.8) * 0.35, .12];
      let rh = [1.0, 1.8 - Math.sin(cycle * 0.8) * 0.35, .12];
      e.leftHand.position.set(...lh); e.rightHand.position.set(...rh);
      e.leftBoot.position.y = e.rightBoot.position.y = 0.22 + (jumpHeight > 0.05 ? 0.2 : 0);
      e.leftBoot.position.z = 0;
      e.rightBoot.position.z = 0;
      e.body.scale.set(1, 1, 1);
      return;
    }
    if (e.healPumping) {
      // HEAL PUMP: crouched press-cycle like working a hand pump, arms alternating hard
      const pump = time * 9 + phase, press = Math.sin(pump), crouch = Math.abs(Math.sin(pump)) * .14;
      e.body.position.set(0, 1.15 - crouch, 0); e.body.rotation.set(.14, 0, 0);
      e.head.position.set(0, 2.15 - crouch, 0); e.head.rotation.set(.18 + press * .06, 0, 0);
      e.weaponGroup.visible = false;
      e.leftHand.position.set(-.5, 1.35 + press * .32, .72); e.rightHand.position.set(.5, 1.35 - press * .32, .72);
      e.leftBoot.position.set(-.33, .22, .12); e.rightBoot.position.set(.33, .22, -.06);
      e.body.scale.y = THREE.MathUtils.lerp(e.body.scale.y, 1 - crouch * .4, Math.min(1, dt * 12));
      e.body.scale.x = e.body.scale.z = THREE.MathUtils.lerp(e.body.scale.x, 1 + crouch * .3, Math.min(1, dt * 12));
      return;
    }
    const speed = Math.hypot(e.velocity.x, e.velocity.z), moving = speed > .25, ground = e.groundY || 0, airborne = e.group.position.y > ground + .05, cycle = time * 10 + phase;
    e.recoil = Math.max(0, e.recoil - dt * 5.5);
    const recoiling = e.recoil > .01;
    // reset the pose, then layer the active animation on top
    e.body.position.set(0, 1.15, 0); e.body.rotation.set(0, 0, 0);
    e.head.position.set(0, 2.15, 0); e.head.rotation.set(e.headPitch || 0, 0, 0);
    e.weaponGroup.position.set(.72, 1.22, .72); e.weaponGroup.rotation.set(0, 0, 0);
    let lh = [-.78, 1.24, .12], rh = [.78, 1.24, .12];
    if (recoiling) {
      // ATTACK ANIMATION — three styles of recoil & impact while firing
      const r = e.recoil;
      if (e.attackStyle === 0) { // kickback lunge: gun slams back, torso leans away
        e.weaponGroup.position.z = .72 - r * .42; e.body.rotation.x = -r * .3; e.head.position.z = -r * .2; e.body.position.z = -r * .12;
      } else if (e.attackStyle === 1) { // torque twist: whole torso wrenches sideways with the shot
        e.body.rotation.y = -r * .5; e.head.rotation.y = r * .32; e.weaponGroup.position.z = .72 - r * .3; e.weaponGroup.rotation.y = -r * .25; e.body.position.z = -r * .08;
      } else { // pump brace: crouch into the shot, muzzle climbs
        e.body.position.y = 1.15 - r * .16; e.weaponGroup.rotation.x = -r * .45; e.weaponGroup.position.z = .72 - r * .3; e.head.rotation.x = r * .2; e.body.rotation.x = r * .1;
      }
      rh = [.78, 1.24 + r * .1, .12 - r * .2];
    } else if (airborne) {
      // JUMP: legs tuck, arms rise, slight forward tilt
      lh = [-.88, 1.7, .05]; rh = [.88, 1.7, .05];
      e.body.rotation.x = -.12; e.head.rotation.x = .1;
    } else if (moving) {
      lh = [-.78, 1.24 - Math.sin(cycle) * .18, .12]; rh = [.78, 1.24 + Math.sin(cycle) * .18, .12];
    } else {
      // Intentionally static: no idle sway, scan, rocking, or breathing offsets.
    }
    if (e.carriedCrate) {
      if (e.crateSnappedLocalPos) {
        const localPos = e.crateSnappedLocalPos;
        const maxReach = 2.5;
        const leftHandTarget = new THREE.Vector3(localPos.x - 0.45, localPos.y, localPos.z);
        if (leftHandTarget.length() > maxReach) leftHandTarget.setLength(maxReach);
        const rightHandTarget = new THREE.Vector3(localPos.x + 0.45, localPos.y, localPos.z);
        if (rightHandTarget.length() > maxReach) rightHandTarget.setLength(maxReach);
        lh = [leftHandTarget.x, leftHandTarget.y, leftHandTarget.z];
        rh = [rightHandTarget.x, rightHandTarget.y, rightHandTarget.z];
      } else {
        lh = [-.45, 1.5, .98];
        rh = [.45, 1.5, .98];
      }
      e.weaponGroup.visible = false;
    }
    else e.weaponGroup.visible = true;
    e.leftHand.position.set(...lh); e.rightHand.position.set(...rh);
    if (airborne) { e.leftBoot.position.z = .16; e.rightBoot.position.z = -.16; e.leftBoot.position.y = e.rightBoot.position.y = .34; }
    else { e.leftBoot.position.y = e.rightBoot.position.y = .22; e.leftBoot.position.z = Math.sin(cycle) * (moving ? .22 : 0); e.rightBoot.position.z = -Math.sin(cycle) * (moving ? .22 : 0); }
    e.group.rotation.z = 0;
    // jump squash & stretch
    const stretch = airborne ? 1 + Math.min(.18, Math.abs(e.verticalVelocity || 0) * .015) : 1;
    e.body.scale.y = THREE.MathUtils.lerp(e.body.scale.y, stretch, Math.min(1, dt * 10));
    e.body.scale.x = e.body.scale.z = THREE.MathUtils.lerp(e.body.scale.x, 1, Math.min(1, dt * 10));
    const rings=e.weaponGroup.userData.auraRings||[];rings.forEach((ring,i)=>{ring.rotation.z=time*(2.5+i*1.7);ring.material.opacity=.4+Math.sin(time*11+i)*.28;});
    e.bodyAura.material.opacity=.5+Math.sin(time*3+phase)*.1;e.headAura.material.opacity=e.bodyAura.material.opacity;
  }
  // DANGER indicator: red arrow pointing down + DANGER label, attached above a hurt unit
  createDangerIndicator() {
    const group = new THREE.Group();
    const arrow = mesh(new THREE.ConeGeometry(.34, .8, 4), new THREE.MeshBasicMaterial({ color: 0xff2233 }), false);
    arrow.rotation.x = Math.PI; arrow.position.y = .4; group.add(arrow);
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d'); ctx.font = '900 44px Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 8; ctx.strokeStyle = '#5c0a12'; ctx.strokeText('DANGER', 128, 32); ctx.fillStyle = '#ff2233'; ctx.fillText('DANGER', 128, 32);
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    label.scale.set(2.4, .6, 1); label.position.y = 1.35; group.add(label);
    group.visible = false; this.scene.add(group); return group;
  }
}
