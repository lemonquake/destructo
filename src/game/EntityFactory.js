import * as THREE from 'three';
import { CLASSES, TEAM, WEAPONS, CRATE_TYPES } from '../data/gameData.js';
import { SKIN_TEXTURES } from './Materials.js';
import { createWearableCosmetic } from './CosmeticModels.js';
import { MARKETPLACE_COSMETICS } from '../data/marketplaceData.js';

const GEO = {
  body: new THREE.BoxGeometry(1.05, 1.3, .82), head: new THREE.BoxGeometry(.92, .78, .86), hand: new THREE.BoxGeometry(.34, .34, .34), boot: new THREE.BoxGeometry(.42, .3, .62), eye: new THREE.BoxGeometry(.22, .15, .06), gun: new THREE.BoxGeometry(.22, .26, .85), barrel: new THREE.CylinderGeometry(.07, .07, .62, 6), crate: new THREE.BoxGeometry(1.15, 1.15, 1.15),
};

function mesh(geometry, material, shadows = true) { const m = new THREE.Mesh(geometry, material); m.castShadow = shadows; m.receiveShadow = shadows; return m; }

function equippedCrateDesign(typeId) {
  try {
    const data = JSON.parse(localStorage.getItem('destructo-save-v1') || '{}');
    const owned = new Set(data.cosmetics || []), equipped = data.equipped || {};
    const textureId = equipped.crateTextures?.[typeId], modelId = equipped.crateModel;
    const textureItem = owned.has(textureId) ? MARKETPLACE_COSMETICS.find(item => item.id === textureId && item.kind === 'crateTexture') : null;
    const modelItem = owned.has(modelId) ? MARKETPLACE_COSMETICS.find(item => item.id === modelId && item.kind === 'crateModel') : null;
    return { texture: textureItem?.visual?.texture || 'standard', model: modelItem?.visual?.model || 'standard' };
  } catch { return { texture: 'standard', model: 'standard' }; }
}

function crateBodyGeometry(modelId) {
  if (modelId === 'bulwark') return new THREE.BoxGeometry(1.34, 1, 1.16);
  if (modelId === 'reactor') return new THREE.CylinderGeometry(.68, .74, 1.15, 8);
  if (modelId === 'capsule') return new THREE.CapsuleGeometry(.57, .28, 5, 10);
  return GEO.crate;
}

function addCrateBands(visual, material, modelId) {
  const bands = [];
  if (modelId === 'reactor' || modelId === 'capsule') {
    for (const y of [-.34, .34]) { const band=mesh(new THREE.TorusGeometry(modelId === 'reactor' ? .7 : .58,.055,6,modelId === 'reactor' ? 8 : 14),material);band.rotation.x=Math.PI/2;band.position.y=y;visual.add(band);bands.push(band); }
    const spine=mesh(new THREE.BoxGeometry(.11,1.1,.11),material);spine.position.z=modelId === 'reactor' ? .69 : .56;visual.add(spine);bands.push(spine);
    return bands;
  }
  for (let i = 0; i < 3; i++) { const band = mesh(new THREE.BoxGeometry(i === 0 ? (modelId === 'bulwark' ? 1.38 : 1.2) : .12, .08, i === 0 ? .12 : (modelId === 'bulwark' ? 1.2 : 1.2)), material); band.position.set(i === 1 ? -.38 : i === 2 ? .38 : 0, modelId === 'bulwark' ? .51 : .58, 0); visual.add(band); bands.push(band); }
  if (modelId === 'bulwark') for (const x of [-.62,.62]) for (const z of [-.52,.52]) { const guard=mesh(new THREE.BoxGeometry(.11,1.04,.11),material);guard.position.set(x,0,z);visual.add(guard);bands.push(guard); }
  return bands;
}

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
    const cosmeticSkin=MARKETPLACE_COSMETICS.find(item=>item.id===skinName&&item.kind==='skin'),uniform=cosmeticSkin?this.materials.color(cosmeticSkin.visual.primary,{emissive:cosmeticSkin.visual.secondary,emissiveIntensity:.12,metalness:.28,roughness:.66}):this.materials.skin(skinName, color), dark = this.materials.color(this.teamDark(team)), skin = this.materials.color(0xf3d6a6);
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
    const faceDetails=[];
    [-.24, .24].forEach(x => {
      const eye = mesh(GEO.eye, eyeMat, false); eye.position.set(x, .08, .44); head.add(eye);faceDetails.push(eye);
      const glow = mesh(new THREE.PlaneGeometry(.4, .3), new THREE.MeshBasicMaterial({ color: 0xffe23f, transparent: true, opacity: .35, depthWrite: false }), false); glow.position.set(x, .08, .46); head.add(glow);faceDetails.push(glow);
    });
    const mouth = mesh(new THREE.BoxGeometry(.3, .06, .05), this.materials.color(0x11131e), false); mouth.position.set(0, -.24, .44); head.add(mouth);faceDetails.push(mouth);
    const leftHand = mesh(GEO.hand, skin), rightHand = mesh(GEO.hand, skin); leftHand.position.set(-.78, 1.24, .12); rightHand.position.set(.78, 1.24, .12); group.add(leftHand, rightHand);
    const leftBoot = mesh(GEO.boot, dark), rightBoot = mesh(GEO.boot, dark); leftBoot.position.set(-.33, .22, .03); rightBoot.position.set(.33, .22, .03); group.add(leftBoot, rightBoot);
    const weaponGroup = new THREE.Group(); weaponGroup.position.set(.72, 1.22, .72); group.add(weaponGroup);
    const jetpackRig=opts.jetpack?this.createJetpackRig():null;if(jetpackRig)group.add(jetpackRig.group);
    if (opts.hat) this.addHat(group, opts.hat, color);
    if (opts.boots) this.addBoots(group, opts.boots, 0x00ff00);
    if (opts.attachment) this.addAttachment(group, opts.attachment, 0x0000ff);
    const grade = opts.grade || 'normal';
    if (grade === 'elite') { const stripe = mesh(new THREE.TorusGeometry(.68, .07, 6, 14), this.materials.color(0xffd23f, { emissive: 0xaa7700, emissiveIntensity: .6 })); stripe.rotation.x = Math.PI / 2; stripe.position.y = 1.55; group.add(stripe); }
    if (grade === 'special') { group.scale.setScalar(1.12); const core = mesh(new THREE.OctahedronGeometry(.22, 0), this.materials.color(0xa4ecff, { emissive: 0x2fa0e0, emissiveIntensity: 1.5 }), false); core.position.set(0, 1.35, .58); group.add(core); const halo = mesh(new THREE.TorusGeometry(.92, .05, 6, 20), this.materials.color(0x9fe8ff, { emissive: 0x2fa0e0, emissiveIntensity: 1.1 }), false); halo.rotation.x = Math.PI / 2; halo.position.y = .12; group.add(halo); }
    const primaryWeaponId=def.weapon==='pistol'?null:def.weapon;
    const entity = { id: crypto.randomUUID(), type: 'unit', team, classId, classDef: def, grade, passive: opts.passive || null, active: opts.active || null, group, body, head, bodyAura, headAura, auraGlow, auraRing, leftHand, rightHand, leftBoot, rightBoot, weaponGroup, renderDetails:{aura:[bodyAura,headAura,auraGlow,auraRing],face:faceDetails,limbs:[leftHand,rightHand,leftBoot,rightBoot]},renderLod:0,hat:opts.hat||null, boots:opts.boots||null, attachment:opts.attachment||null, projectileStyle:opts.projectile||null, deathEffect:opts.deathEffect||null, killEffect:opts.killEffect||null, jetpack:Boolean(opts.jetpack), jetpackRig, hp: def.hp, maxHp: def.hp, mp: def.mp, maxMp: def.mp, shield: 0, weaponId: def.weapon, weapon: WEAPONS[def.weapon], weaponTier: 0, primaryWeaponId, primaryWeapon:primaryWeaponId?WEAPONS[primaryWeaponId]:null, primaryWeaponTier:0, seekingReplacement:false, grenades: 0, velocity: new THREE.Vector3(), aim: new THREE.Vector3(0, 0, 1), radius: .72, state: 'grounded', stun: 0, freeze: 0, fireCooldown: 0, abilityCooldown: 0, statusTimer: 0, recoil: 0, verticalVelocity: 0, jetpackBurn:0, jetpackActive:false, doubleJumped:false, buffs: { speed: 0, damage: 0, rapid: 0 }, dead: false, player, carriedCrate: null, kills: 0, animationSeed: Math.random() * 10, attackStyle: Math.floor(Math.random() * 3), groundY: position.y, dangerCooldown: 0, dangerTimer: 0 };
    this.setWeaponModel(entity, def.weapon, WEAPONS[def.weapon]);
    this.applyPassive(entity);
    if(entity.primaryWeaponId)entity.primaryWeapon=entity.weapon;
    group.traverse(o => { if (o.isMesh) o.userData.entity = entity; }); group.userData.entity = entity; this.scene.add(group); return entity;
  }
  createProfessorLeodones(team, position, opts = {}) {
    const e=this.createUnit('medic',team,position,false,opts),white=this.materials.color(0xe8edf1,{roughness:.72}),whiteTrim=this.materials.color(0xfafcff,{roughness:.55}),shirt=this.materials.color(0xb7d9e8,{roughness:.75}),skin=this.materials.color(0xe0b681,{roughness:.9}),dark=this.materials.color(0x18202b,{metalness:.35,roughness:.45}),glass=this.materials.color(0x80eaff,{emissive:0x166b82,emissiveIntensity:.75,transparent:true,opacity:.65,metalness:.15,roughness:.12}),packMetal=this.materials.building('gaia_blacksite_armor',{roughness:.62,metalness:.58}),cyan=this.materials.color(0x4beaff,{emissive:0x0aa7ca,emissiveIntensity:1.8,metalness:.4}),amber=this.materials.color(0xffc43f,{emissive:0x8f5d00,emissiveIntensity:.8,metalness:.55});
    e.group.name='professor-leodones';e.body.material=white;e.head.material=skin;e.leftHand.material=skin;e.rightHand.material=skin;e.leftBoot.material=e.rightBoot.material=dark;e.weaponGroup.clear();e.weapon=null;e.weaponId='unarmed';e.primaryWeapon=null;e.primaryWeaponId=null;e.ammo=0;
    const coat=new THREE.Group();coat.name='leodones-scientist-suit';e.group.add(coat);
    const shirtPanel=mesh(new THREE.BoxGeometry(.5,.82,.07),shirt);shirtPanel.position.set(0,1.22,.445);coat.add(shirtPanel);
    for(const side of [-1,1]){const lapel=mesh(new THREE.BoxGeometry(.25,.7,.075),whiteTrim);lapel.position.set(side*.23,1.48,.49);lapel.rotation.z=side*.32;coat.add(lapel);const pocket=mesh(new THREE.BoxGeometry(.3,.24,.08),whiteTrim);pocket.position.set(side*.31,.96,.49);coat.add(pocket);const strap=mesh(new THREE.BoxGeometry(.13,1.32,.08),dark);strap.position.set(side*.38,1.35,-.47);strap.rotation.z=side*.03;coat.add(strap)}
    const tie=mesh(new THREE.ConeGeometry(.105,.58,4),this.materials.color(0x35b8d4,{emissive:0x063d4b,emissiveIntensity:.35}));tie.position.set(0,1.37,.52);tie.rotation.z=Math.PI;coat.add(tie);
    const belt=mesh(new THREE.BoxGeometry(1.08,.13,.9),dark);belt.position.set(0,.78,0);coat.add(belt);const badge=mesh(new THREE.BoxGeometry(.24,.31,.045),glass,false);badge.position.set(.34,1.59,.535);coat.add(badge);
    const glasses=new THREE.Group();glasses.name='leodones-eyeglasses';glasses.position.set(0,.09,.475);e.head.add(glasses);for(const x of [-.235,.235]){const rim=mesh(new THREE.TorusGeometry(.205,.035,6,16),dark,false);rim.position.x=x;glasses.add(rim);const lens=mesh(new THREE.CircleGeometry(.17,16),glass,false);lens.position.set(x,0,.012);glasses.add(lens)}const bridge=mesh(new THREE.BoxGeometry(.14,.035,.035),dark,false);bridge.position.z=.02;glasses.add(bridge);
    const hair=new THREE.Group();hair.name='leodones-hair';e.head.add(hair);const hairMat=this.materials.color(0xc9d0d5,{metalness:.15,roughness:.9});for(let i=0;i<7;i++){const a=(i-3)*.32,tuft=mesh(new THREE.ConeGeometry(.11,.43,5),hairMat);tuft.position.set(Math.sin(a)*.38,.47,Math.cos(a)*.2-.05);tuft.rotation.z=-Math.sin(a)*.38;hair.add(tuft)}
    const backpack=new THREE.Group();backpack.name='leodones-atlas-research-pack';backpack.position.set(0,1.38,-.72);e.group.add(backpack);const pack=mesh(new THREE.BoxGeometry(1.45,1.82,.72),packMetal);pack.position.y=.02;backpack.add(pack);const lower=mesh(new THREE.BoxGeometry(1.25,.55,.85),dark);lower.position.set(0,-.84,-.02);backpack.add(lower);for(const x of [-.5,.5]){const canister=mesh(new THREE.CylinderGeometry(.19,.23,1.48,8),x<0?cyan:amber);canister.position.set(x,.05,-.48);backpack.add(canister);const cap=mesh(new THREE.SphereGeometry(.2,7,5),dark);cap.position.set(x,.8,-.48);backpack.add(cap)}for(const y of [-.52,.02,.56]){const rail=mesh(new THREE.BoxGeometry(1.58,.09,.82),dark);rail.position.y=y;backpack.add(rail)}const core=mesh(new THREE.OctahedronGeometry(.25,0),cyan,false);core.position.set(0,.16,-.48);backpack.add(core);const antenna=mesh(new THREE.CylinderGeometry(.025,.025,1.25,5),dark,false);antenna.position.set(.56,1.25,-.2);antenna.rotation.z=-.08;backpack.add(antenna);const antennaTip=mesh(new THREE.SphereGeometry(.08,6,4),amber,false);antennaTip.position.set(.61,1.87,-.2);backpack.add(antennaTip);
    const nameplateCanvas=document.createElement('canvas');nameplateCanvas.width=512;nameplateCanvas.height=96;const ctx=nameplateCanvas.getContext('2d');ctx.fillStyle='rgba(5,14,23,.88)';ctx.fillRect(3,3,506,90);ctx.strokeStyle='#4beaff';ctx.lineWidth=6;ctx.strokeRect(4,4,504,88);ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='900 43px Impact,system-ui';ctx.fillText('PROFESSOR LEODONES',256,49);const nameTexture=new THREE.CanvasTexture(nameplateCanvas);nameTexture.colorSpace=THREE.SRGBColorSpace;const nameplate=new THREE.Sprite(new THREE.SpriteMaterial({map:nameTexture,transparent:true,depthWrite:false}));nameplate.position.set(0,3.35,0);nameplate.scale.set(4.6,.86,1);e.group.add(nameplate);
    e.escortNPC=true;e.missionVIP=true;e.missionScripted=true;e.classDef={...e.classDef,name:'Professor Leodones',speed:opts.speed||3.15};e.maxHp=opts.hp||520;e.hp=e.maxHp;e.radius=.82;e.scientistRig={coat,glasses,hair,backpack,core,antennaTip,nameplate};e.hpBarTimer=Infinity;
    e.group.traverse(o=>{if(o.isMesh)o.userData.entity=e});e.group.userData.entity=e;return e;
  }
  createJetpackRig(){
    const group=new THREE.Group();group.name='rocket-jetpack';group.position.set(0,1.33,-.5);const metal=this.materials.building('vehicle_metal',{metalness:.85,roughness:.24}),trim=this.materials.color(0xffd23f,{emissive:0x8b5700,emissiveIntensity:.45,metalness:.8}),flameMat=this.materials.color(0x55d9ff,{emissive:0x28b9ff,emissiveIntensity:2.2,transparent:true,opacity:.9});const flames=[];
    for(const x of [-.33,.33]){const tank=mesh(new THREE.CylinderGeometry(.22,.27,.9,8),metal);tank.position.set(x,0,0);group.add(tank);const cap=mesh(new THREE.SphereGeometry(.23,7,5),trim);cap.scale.y=.55;cap.position.set(x,.47,0);group.add(cap);const nozzle=mesh(new THREE.CylinderGeometry(.16,.22,.28,7),trim);nozzle.position.set(x,-.56,0);group.add(nozzle);const flame=mesh(new THREE.ConeGeometry(.17,.9,7),flameMat.clone(),false);flame.position.set(x,-1.05,0);flame.rotation.z=Math.PI;flame.visible=false;group.add(flame);flames.push(flame)}
    const brace=mesh(new THREE.BoxGeometry(.92,.18,.22),trim);brace.position.y=.15;group.add(brace);return{group,flames};
  }
  applyPassive(e) {
    switch (e.passive?.id) {
      case 'manabattery': e.maxMp += 50; e.mp = e.maxMp; break;
      case 'juggernaut': e.maxHp += 45; e.hp = e.maxHp; break;
      case 'shieldborn': e.shield = 60; break;
      case 'longshot': e.weapon = { ...e.weapon, effectiveRange: e.weapon.effectiveRange * 1.25 }; break;
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
    const addMuzzle=(x,y,z)=>{const anchor=new THREE.Object3D();anchor.name='muzzle-anchor';anchor.position.set(x,y,z);root.add(anchor);return anchor};
    switch (weaponId) {
      case 'pistol': addBox([.28,.32,.62],[0,0,.25]); addTube(.055,.56,[0,.05,.72]); addBox([.19,.42,.2],[0,-.28,.05],dark,[.18,0,0]);addMuzzle(0,.05,1); break;
      case 'needle': addBox([.2,.24,.58],[0,0,.26],accent); addTube(.025,.78,[0,0,.92],glow); addTube(.13,.34,[0,0,.52],glow);addMuzzle(0,0,1.31); break;
      case 'uzi': addBox([.26,.32,.54],[0,0,.15],dark); addTube(.045,.4,[0,.02,.58],accent); addBox([.15,.42,.22],[0,-.34,.1],metal,[.25,0,0]);addMuzzle(0,.02,.8); break;
      case 'flamethrower': addBox([.42,.38,.76],[0,0,.22]); addTube(.12,.66,[0,.02,.8],accent); addBox([.2,.34,.3],[0,-.24,-.12],glow);addMuzzle(0,.02,1.14); break;
      case 'railgun': addBox([.34,.34,.98],[0,0,.26],dark); addTube(.04,1.1,[0,.04,1.14],glow); [-.08,.08].forEach(x => addBox([.06,.06,1.0],[x,.04,.92],accent));addMuzzle(0,.04,1.7); break;
      case 'freezeray': addBox([.44,.38,.68],[0,0,.15],accent); addTube(.08,.75,[0,.02,.82],glow); addBox([.28,.28,.28],[0,-.22,.28],dark);addMuzzle(0,.02,1.2); break;
      case 'sniper': addBox([.3,.3,1.02],[0,0,.38]); addTube(.045,1.12,[0,.02,1.42]); addTube(.1,.5,[0,.23,.3],accent); addBox([.48,.22,.5],[0,-.02,-.42],dark);addMuzzle(0,.02,1.99); break;
      case 'machinegun': addBox([.5,.48,.9],[0,0,.32]); [-.13,0,.13].forEach(x=>{const b=addTube(.045,1,[x,.02,1.15]); b.name='rotary-barrel';addMuzzle(x,.02,1.66)}); addTube(.3,.26,[0,-.34,.25],accent,'z'); break;
      case 'grenade': addBox([.45,.4,.62],[0,0,.18],dark); {const cup=mesh(new THREE.CylinderGeometry(.24,.12,.52,8),metal);cup.rotation.x=Math.PI/2;cup.position.z=.72;root.add(cup);} addBox([.18,.48,.25],[0,-.28,-.05],accent);addMuzzle(0,0,.99); break;
      case 'shotgun': [-.12,.12].forEach(x=>{addTube(.075,1.02,[x,.04,.9]);addMuzzle(x,.04,1.42)}); addBox([.52,.3,.62],[0,0,.1]); addBox([.4,.28,.42],[0,0,-.42],accent); break;
      case 'carbine': addBox([.34,.34,.86],[0,0,.3],accent); addTube(.05,.72,[0,.02,.98]); addBox([.42,.22,.4],[0,-.02,-.35]); addBox([.15,.42,.24],[0,-.3,.22],dark,[.28,0,0]);addMuzzle(0,.02,1.35); break;
      case 'mine': addBox([.44,.34,.58],[0,0,.15]); {const disc=mesh(new THREE.CylinderGeometry(.3,.3,.14,10),glow);disc.rotation.x=Math.PI/2;disc.position.z=.66;root.add(disc);}addMuzzle(0,0,.82); break;
      case 'smg': addBox([.38,.42,.66],[0,0,.2],dark); addTube(.06,.45,[0,0,.74],accent); addBox([.17,.5,.22],[0,-.34,.18],metal,[.25,0,0]); addBox([.34,.18,.28],[0,.16,-.25],accent);addMuzzle(0,0,.98); break;
      case 'rocket': addTube(.24,1.35,[0,.03,.55],metal); addTube(.18,.38,[0,.03,1.4]); for(const x of [-.32,.32]) addBox([.08,.38,.48],[x,0,.05],accent);addMuzzle(0,.03,1.6); break;
      case 'grenadelauncher': addBox([.42,.4,.72],[0,0,.2]); {const drum=mesh(new THREE.CylinderGeometry(.28,.28,.34,8),accent);drum.rotation.z=Math.PI/2;drum.position.set(0,-.2,.22);root.add(drum);} addTube(.12,.72,[0,.02,.91]);addMuzzle(0,.02,1.28); break;
      case 'rifle': addBox([.36,.34,.92],[0,0,.3]); addTube(.055,.78,[0,.02,1.14]); addBox([.16,.48,.25],[0,-.34,.3],accent,[.28,0,0]); addBox([.46,.26,.45],[0,0,-.42],dark);addMuzzle(0,.02,1.54); break;
      case 'tesla': addBox([.46,.42,.7],[0,0,.12],dark); [.45,.72,.99].forEach(z=>{const coil=mesh(new THREE.TorusGeometry(.24,.045,6,12),glow);coil.position.z=z;root.add(coil)}); [-.16,.16].forEach(x=>{addTube(.035,.7,[x,0,1.18],accent);addMuzzle(x,0,1.54)}); break;
      case 'plasma': addBox([.48,.42,.82],[0,0,.22]); {const core=mesh(new THREE.IcosahedronGeometry(.22,1),glow);core.position.z=.72;root.add(core);} [-.24,.24].forEach(x=>{addBox([.1,.12,.82],[x,0,.82],accent);addMuzzle(x,0,1.25)}); break;
      default: addBox([.3,.3,.8],[0,0,.3]); addTube(.06,.6,[0,0,.92]);addMuzzle(0,0,1.23); break;
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
    entity.weaponId = weaponId; entity.weapon = weapon;entity.muzzleAnchors=[];root.traverse(o=>{if(o.name==='muzzle-anchor')entity.muzzleAnchors.push(o)});
  }
  addHat(group, hat, color) {
    const parts=createWearableCosmetic('hat',hat,this.materials,color);group.add(parts);return parts;
  }
  addBoots(group, boots, color = 0x00ff00) {
    const parts=createWearableCosmetic('boots',boots,this.materials,color);group.add(parts);return parts;
  }
  addAttachment(group, attachment, color = 0x0000ff) {
    const parts=createWearableCosmetic('attachment',attachment,this.materials,color);group.add(parts);return parts;
  }
  createFactory(team, position) {
    const group = new THREE.Group(); group.position.copy(position); const color = this.teamColor(team);
    let baseStyle = null;
    try {
      const raw = localStorage.getItem('destructo-save-v1');
      if (raw) {
        const data = JSON.parse(raw);
        baseStyle = data.equipped?.teamBase;
      }
    } catch(e) {}

    const isCustom = Boolean(baseStyle);
    if (isCustom) {
      const customBase = new THREE.Mesh(new THREE.ConeGeometry(3, 6, 8), new THREE.MeshBasicMaterial({ color: 0xff00ff }));
      customBase.name = 'custom-base';
      group.add(customBase);
    }

    const foundation = mesh(new THREE.BoxGeometry(8, 1.1, 7), this.materials.building('concrete')); foundation.position.y = .55; foundation.visible = !isCustom; group.add(foundation);
    const core = mesh(new THREE.BoxGeometry(5.2, 4.2, 4.4), this.materials.building('plating')); core.position.y = 2.65; core.visible = !isCustom; group.add(core);
    for (const x of [-2.9, 2.9]) for (const z of [-2.5, 2.5]) { const p = mesh(new THREE.BoxGeometry(.7, 5, .7), this.materials.teamTextured('tech_pillar', color)); p.position.set(x, 2.8, z); p.visible = !isCustom; group.add(p); }
    const roof = mesh(new THREE.CylinderGeometry(3.8, 3.8, .65, 8), this.materials.teamTextured('tech_roof', color)); roof.position.y = 5.05; roof.visible = !isCustom; group.add(roof);
    const stripe = mesh(new THREE.BoxGeometry(5.26, .8, 4.46), this.materials.building('hazard')); stripe.position.y = 1.2; stripe.visible = !isCustom; group.add(stripe);
    const key = mesh(new THREE.TorusGeometry(.72, .2, 6, 10), this.materials.building('plating', { color: 0xd9a928, metalness: .8, roughness: .2 })); key.rotation.x = Math.PI / 2; key.position.set(0, 2.8, team === 'blue' ? -2.25 : 2.25); key.visible = !isCustom; group.add(key);
    
    const entity = { id: `${team}-factory`, type: 'factory', team, group, hp: 900, maxHp: 900, radius: 4, dead: false };
    group.traverse(o => { if (o.isMesh) o.userData.entity = entity; }); this.scene.add(group); return entity;
  }
  createCrate(position, type = CRATE_TYPES.brown) {
    if (type === true) type = CRATE_TYPES.blue; // legacy "charged" flag
    if (typeof type === 'string') type = CRATE_TYPES[type] || CRATE_TYPES.brown;
    const design = equippedCrateDesign(type.id);
    const mat = this.materials.crate(type.id, design.texture);
    const group = new THREE.Group(); group.position.copy(position);
    // Keep the gameplay root at ground level while the visible body tumbles about
    // its actual center of mass. This avoids the old corner-pivoted rotation.
    const visual = new THREE.Group(); visual.position.y = .575; group.add(visual);
    const box = mesh(crateBodyGeometry(design.model), mat); box.name = 'crate-body'; visual.add(box);
    const bandMat = this.materials.color(type.band);
    const bands = addCrateBands(visual, bandMat, design.model);
    if (type.tier >= 2) { const gem = mesh(new THREE.OctahedronGeometry(.2, 0), this.materials.color(0xffffff, { emissive: type.color, emissiveIntensity: 1.6 }), false); gem.name='crate-gem';gem.position.y = design.model === 'capsule' ? .72 : .84; visual.add(gem); }

    const entity = { id: crypto.randomUUID(), type: 'crate', crateType: type, originalType: type, charged: type.tier >= 2, crateTextureDesigns: { [type.id]: design.texture }, crateModelDesign: design.model, group, visual, box, bands, position: group.position, radius: .72, halfExtent: .575, mass: type.mass || 1, velocity: new THREE.Vector3(), angularVelocity: new THREE.Vector3(), carried: false, placed: false, solid: false, falling: false, physicsActive: false, grounded: true };
    group.userData.entity = entity; group.traverse(o => { if (o.isMesh) o.userData.entity = entity; }); this.scene.add(group); return entity;
  }
  applyCrateType(crate, type) {
    crate.crateType = type; crate.mass = type.mass || 1; crate.charged = type.tier >= 2;
    const design = equippedCrateDesign(type.id);crate.crateTextureDesigns ||= {};crate.crateTextureDesigns[type.id]=design.texture;
    const mat = this.materials.crate(type.id, design.texture);
    if (crate.box) crate.box.material = mat;
    for (const band of crate.bands || []) band.material = this.materials.color(type.band, type.tier >= 2 ? { emissive: type.color, emissiveIntensity: .35 } : {});
  }
  createTank(team, position, kind = 'tank', crateVariant = 'brown') {
    const isAPC = kind === 'apc', mega = kind === true || kind === 'mega';
    const variantId = typeof crateVariant === 'string' ? crateVariant : (crateVariant?.dominant || crateVariant?.id || 'brown');
    const group = new THREE.Group(); group.position.copy(position); const color = this.teamColor(team);

    // Crate-variant color schemes & materials
    const vMat = {
      brown:  { hull: this.materials.teamTextured('tech_roof', color), trim: this.materials.building('plating'), glow: 0xff6b3d, name: 'Battle Tank' },
      yellow: { hull: this.materials.color(0xc79415, { metalness: .85, roughness: .2 }), trim: this.materials.color(0xffd23f, { emissive: 0x996a00, emissiveIntensity: .4 }), glow: 0xffd23f, name: 'Solar Battle Tank' },
      blue:   { hull: this.materials.color(0x1d4d73, { metalness: .75, roughness: .25 }), trim: this.materials.color(0x58c8ff, { emissive: 0x125a8a, emissiveIntensity: .6 }), glow: 0x58c8ff, name: 'Cryo-Pulse Tank' },
      red:    { hull: this.materials.color(0x281216, { metalness: .8, roughness: .3 }), trim: this.materials.color(0xff102c, { emissive: 0x77000c, emissiveIntensity: .7 }), glow: 0xff102c, name: 'Crimson Annihilator Tank' },
    }[variantId] || { hull: this.materials.teamTextured('tech_roof', color), trim: this.materials.building('plating'), glow: 0xff6b3d, name: 'Battle Tank' };

    const glowMat = this.materials.color(vMat.glow, { emissive: vMat.glow, emissiveIntensity: 1.4 });
    const metalMat = this.materials.metal;

    // Chassis / Hull
    const hull = mesh(new THREE.BoxGeometry(3.1, 1.1, 4.1), vMat.hull); hull.position.y = 1; group.add(hull);
    for (const x of [-1.7, 1.7]) {
      const tread = mesh(new THREE.BoxGeometry(.55, .75, 4.4), vMat.trim); tread.position.set(x, .7, 0); group.add(tread);
      if (variantId === 'yellow' || variantId === 'red') {
        const guard = mesh(new THREE.BoxGeometry(.12, .45, 4.5), glowMat, false); guard.position.set(x * 1.18, .85, 0); group.add(guard);
      }
    }

    // Enhancement details by variant
    if (variantId === 'yellow') {
      // Solar capacitors on sides
      for (const x of [-1.6, 1.6]) {
        const cap = mesh(new THREE.CylinderGeometry(.25, .25, 2.2, 8), glowMat, false); cap.rotation.x = Math.PI / 2; cap.position.set(x, 1.4, 0); group.add(cap);
      }
    } else if (variantId === 'blue') {
      // Cryo pulse coils and energy dome
      for (const z of [-1.2, 1.2]) {
        const coil = mesh(new THREE.TorusGeometry(.35, .08, 6, 12), glowMat, false); coil.rotation.y = Math.PI / 2; coil.position.set(0, 1.6, z); group.add(coil);
      }
    } else if (variantId === 'red') {
      // Quad exhaust stacks with flaming tips & spiked front
      for (const x of [-.9, -.3, .3, .9]) {
        const pipe = mesh(new THREE.CylinderGeometry(.12, .14, 1.1, 8), metalMat); pipe.position.set(x, 1.75, -1.8); group.add(pipe);
        const flame = mesh(new THREE.ConeGeometry(.1, .3, 6), glowMat, false); flame.position.set(x, 2.38, -1.8); group.add(flame);
      }
      for (const x of [-1.1, 0, 1.1]) {
        const spike = mesh(new THREE.ConeGeometry(.18, .6, 6), vMat.trim); spike.rotation.x = Math.PI / 2; spike.position.set(x, 1.0, 2.3); group.add(spike);
      }
    }

    // Turret & Barrels
    const turret = new THREE.Group();
    const domeGeo = isAPC ? new THREE.BoxGeometry(1.9, .72, 1.8) : new THREE.CylinderGeometry(1.15, 1.4, .75, 8);
    const dome = mesh(domeGeo, metalMat); dome.position.y = 1.75; turret.add(dome);

    const barrels = []; const muzzleAnchors = [];
    const twinBarrels = (variantId === 'blue' || variantId === 'red') && !isAPC;
    const barrelLength = isAPC ? 2.2 : twinBarrels ? 3.5 : 3.8;
    const barrelOffsets = twinBarrels ? [-.38, .38] : [0];

    for (const xOff of barrelOffsets) {
      const barrel = mesh(new THREE.CylinderGeometry(isAPC ? .08 : .13, isAPC ? .1 : .17, barrelLength, 8), metalMat);
      barrel.rotation.x = Math.PI / 2; barrel.position.set(xOff, 1.8, isAPC ? 1.35 : 1.9);
      
      // Barrel tip enhancements
      if (variantId === 'yellow') {
        const ring = mesh(new THREE.TorusGeometry(.22, .05, 6, 12), glowMat, false); ring.position.y = barrelLength / 2 - .1; barrel.add(ring);
      } else if (variantId === 'red') {
        const brake = mesh(new THREE.BoxGeometry(.32, .2, .32), glowMat, false); brake.position.y = barrelLength / 2 - .15; barrel.add(brake);
      }

      const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle-anchor'; muzzle.position.y = barrelLength / 2;
      barrel.add(muzzle); turret.add(barrel); barrels.push(barrel); muzzleAnchors.push(muzzle);
    }
    group.add(turret);

    if (mega) {
      group.scale.setScalar(1.3);
      const fin = mesh(new THREE.BoxGeometry(.2, 1.1, 1.6), this.materials.color(0xffd23f, { emissive: 0xaa7700, emissiveIntensity: .5 }));
      fin.position.set(0, 1.9, -1.6); group.add(fin);
    }

    const hp = mega ? 950 : isAPC ? 560 : variantId === 'red' ? 900 : variantId === 'blue' ? 820 : variantId === 'yellow' ? 760 : 720;
    const passengers = [];

    // Crate-specific weapons and projectiles
    const projStyle = isAPC ? 'tracer' : `tank_shell_${variantId}`;
    const baseDamage = isAPC ? 28 : { brown: 120, yellow: 155, blue: 190, red: 260 }[variantId] || 120;
    const baseRate = isAPC ? .34 : { brown: 1.1, yellow: 0.9, blue: 0.8, red: 0.7 }[variantId] || 1.1;
    const baseSpeed = isAPC ? 76 : { brown: 42, yellow: 54, blue: 62, red: 70 }[variantId] || 42;
    const weaponColor = isAPC ? 0xffdc62 : vMat.glow;

    const cannon = {
      ...WEAPONS.rocket,
      name: isAPC ? 'APC Autocannon' : vMat.name + ' Cannon',
      damage: baseDamage,
      rate: baseRate,
      bulletSpeed: baseSpeed,
      shotPower: isAPC ? 58 : 75,
      effectiveRange: isAPC ? 48 : 65,
      spread: isAPC ? .014 : .002,
      explosive: !isAPC,
      projectileStyle: projStyle,
      color: weaponColor,
      recoil: isAPC ? 1.4 : 8,
      variantId
    };

    const fullName = isAPC ? 'Armored Carrier' : vMat.name;
    const entity = {
      id: crypto.randomUUID(), type: 'vehicle', vehicleKind: isAPC ? 'apc' : 'tank', autonomous: false,
      team, name: fullName, group, turret, head: turret, barrels, muzzleAnchors,
      hp, maxHp: hp, armor: isAPC ? .32 : variantId === 'red' ? .52 : .42,
      radius: mega ? 2.7 : 2.1, velocity: new THREE.Vector3(), aim: new THREE.Vector3(0, 0, 1),
      speed: isAPC ? 6.2 : mega ? 4.4 : 4.8, turnSpeed: isAPC ? 1.65 : 1.25,
      weaponId: 'cannon', weapon: cannon, fireCooldown: 0, driver: null, passengers, capacity: 3,
      wheels: [], wheelSpin: 0, interactive: true, dead: false, crateVariant: variantId
    };
    Object.defineProperty(entity, 'occupants', { get: () => [entity.driver, ...entity.passengers].filter(Boolean) });
    group.traverse(o => { if (o.isMesh) o.userData.entity = entity; });
    this.scene.add(group); return entity;
  }
  createTurret(team, position) {
    const group = new THREE.Group(); group.position.copy(position); const color = this.teamColor(team);
    const base = mesh(new THREE.CylinderGeometry(.75, .95, .35, 8), this.materials.metal); base.position.y = .18; group.add(base);
    const stem = mesh(new THREE.CylinderGeometry(.18, .25, .9, 6), this.materials.teamTextured('tech_pillar', color)); stem.position.y = .78; group.add(stem);
    const head = new THREE.Group(); head.position.y = 1.28; const housing = mesh(new THREE.BoxGeometry(.75, .48, .72), this.materials.metal); head.add(housing); const barrel = mesh(new THREE.CylinderGeometry(.07, .09, 1.25, 6), this.materials.metal); barrel.rotation.x = Math.PI / 2; barrel.position.z = .82;const muzzle=new THREE.Object3D();muzzle.name='muzzle-anchor';muzzle.position.y=.625;barrel.add(muzzle); head.add(barrel); group.add(head);
    const entity = { id: crypto.randomUUID(), type: 'turret', team, group, head, barrels: [barrel], muzzleAnchors:[muzzle], hp: 180, maxHp: 180, armor: .22, radius: .85, velocity: new THREE.Vector3(), aim: new THREE.Vector3(0, 0, 1), aimPitch: 0, speed: 0, stationary: true, weapon: { ...WEAPONS.machinegun, damage: 10, rate: .16, effectiveRange: 22 }, fireCooldown: 0, dead: false };
    group.traverse(o => { if (o.isMesh) o.userData.entity = entity; }); this.scene.add(group); return entity;
  }
  createBaseTurret(team, position) {
    const group=new THREE.Group();group.position.copy(position);const color=this.teamColor(team),metal=this.materials.building('plating'),accent=this.materials.teamTextured('tech_pillar',color),glow=this.materials.color(0xffd23f,{emissive:0xff9b18,emissiveIntensity:1.4,metalness:.5});
    const base=mesh(new THREE.CylinderGeometry(1.8,2.25,.75,12),metal);base.position.y=.38;group.add(base);
    for(let i=0;i<8;i++){const a=i*Math.PI/4,foot=mesh(new THREE.BoxGeometry(.55,.42,1.45),accent);foot.position.set(Math.sin(a)*1.85,.3,Math.cos(a)*1.85);foot.rotation.y=a;group.add(foot)}
    const column=mesh(new THREE.CylinderGeometry(.7,1.05,2.15,10),accent);column.position.y=1.5;group.add(column);
    const head=new THREE.Group();head.position.y=2.55;const housing=mesh(new THREE.BoxGeometry(2.6,1.35,2.35),metal);housing.position.y=.15;head.add(housing);
    const cockpit=mesh(new THREE.SphereGeometry(.78,12,8,0,Math.PI*2,0,Math.PI/2),this.materials.color(0x8deaff,{transparent:true,opacity:.7,emissive:0x137fa8,emissiveIntensity:.8}));cockpit.position.set(0,.82,-.25);head.add(cockpit);
    const barrels=[],muzzleAnchors=[];for(const x of [-.62,0,.62]){const barrel=mesh(new THREE.CylinderGeometry(.09,.13,2.8,8),metal);barrel.rotation.x=Math.PI/2;barrel.position.set(x,.18,2.05);const muzzle=new THREE.Object3D();muzzle.name='muzzle-anchor';muzzle.position.y=1.4;barrel.add(muzzle);muzzleAnchors.push(muzzle);head.add(barrel);barrels.push(barrel)}
    for(const x of [-1.05,1.05]){const pod=mesh(new THREE.BoxGeometry(.48,.72,1.4),accent);pod.position.set(x,.05,.65);head.add(pod);const lamp=mesh(new THREE.SphereGeometry(.13,8,6),glow,false);lamp.position.set(x,.08,1.42);head.add(lamp)}group.add(head);
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=180;const ctx=canvas.getContext('2d'),texture=new THREE.CanvasTexture(canvas),warning=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false}));warning.position.set(0,5.8,0);warning.scale.set(5.8,2.05,1);warning.visible=false;group.add(warning);
    const entity={id:`${team}-base-turret`,type:'turret',team,group,head,barrels,muzzleAnchors,hp:520,maxHp:520,armor:.38,mp:1,maxMp:1,shield:0,radius:2,velocity:new THREE.Vector3(),aim:new THREE.Vector3(0,0,1),aimPitch:0,speed:0,stationary:true,player:true,weaponId:'machinegun',weapon:{...WEAPONS.machinegun,damage:15,rate:.12,spread:.006,effectiveRange:55},ammo:50,magazineSize:50,reloadTimer:0,fireCooldown:0,dead:false,baseTurret:true,interactive:true,jellyStrength:.22,delayedExplosion:true,critical:false,explosionTimer:0,rider:null,warning,warningCanvas:canvas,warningContext:ctx,warningTexture:texture};
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
    group.userData.entity=entity;group.traverse(o=>{if(o.isMesh)o.userData.entity=entity});
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
    const group = new THREE.Group(); group.position.copy(position); let hp = kind === 'bear' ? 240 : kind === 'wolf' ? 85 : kind === 'slime' ? 70 : 45, radius = kind === 'bear' ? 1.35 : .8, speed = kind === 'bear' ? 4.4 : kind === 'wolf' ? 5.2 : kind === 'slime' ? 2.8 : 1.8;
    if (kind === 'sheep') {
      const wool = mesh(new THREE.IcosahedronGeometry(.85, 1), this.materials.color(0xeee8cf)); wool.scale.set(1.3, .85, .85); wool.position.y = .9; group.add(wool);
      const head = mesh(new THREE.BoxGeometry(.48, .52, .55), this.materials.color(0x383946)); head.position.set(0, .92, .85); group.add(head);
      for (const x of [-.55, .55]) for (const z of [-.4, .42]) { const leg = mesh(new THREE.CylinderGeometry(.09, .11, .65, 5), this.materials.color(0x343440)); leg.position.set(x, .32, z); group.add(leg); }
    } else if (kind === 'wolf') {
      const fur = this.materials.color(0x59606b); const body = mesh(new THREE.CapsuleGeometry(.45, 1.05, 3, 6), fur); body.rotation.x = Math.PI / 2; body.position.y = .72; group.add(body); const head = mesh(new THREE.ConeGeometry(.52, .9, 5), fur); head.rotation.x = Math.PI / 2; head.position.set(0, .95, .92); group.add(head); for (const x of [-.28, .28]) { const ear = mesh(new THREE.ConeGeometry(.14, .4, 4), this.materials.color(0x30333b)); ear.position.set(x, 1.4, .63); group.add(ear); }
    } else if (kind === 'bear') {
      const fur=this.materials.color(0x6b3f25,{roughness:.95}),muzzle=this.materials.color(0xb78254);const body=mesh(new THREE.IcosahedronGeometry(1.2,1),fur);body.scale.set(1.15,.85,1.45);body.position.y=1.15;group.add(body);const head=mesh(new THREE.IcosahedronGeometry(.72,1),fur);head.position.set(0,1.55,1.25);group.add(head);const snout=mesh(new THREE.CapsuleGeometry(.28,.45,3,7),muzzle);snout.rotation.x=Math.PI/2;snout.position.set(0,1.38,1.83);group.add(snout);for(const x of [-.43,.43]){const ear=mesh(new THREE.SphereGeometry(.22,7,5),fur);ear.position.set(x,2.08,1.2);group.add(ear)}for(const x of [-.67,.67])for(const z of [-.7,.72]){const leg=mesh(new THREE.CylinderGeometry(.2,.28,.9,7),fur);leg.position.set(x,.48,z);group.add(leg)}
    } else {
      const slime = mesh(new THREE.SphereGeometry(.82, 8, 6), this.materials.color(0x76e06c, { emissive: 0x173f1b, emissiveIntensity: .35 })); slime.scale.y = .72; slime.position.y = .58; group.add(slime); for (const x of [-.24, .24]) { const eye = mesh(new THREE.SphereGeometry(.1, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffe8 }), false); eye.position.set(x, .78, .68); group.add(eye); }
    }
    const entity = { id: crypto.randomUUID(), type: 'wildlife', kind, team: 'neutral', group, hp, maxHp: hp, radius, speed, velocity: new THREE.Vector3(), aim: new THREE.Vector3(0, 0, 1), wanderAngle: Math.random() * Math.PI * 2, decisionTimer: 0, attackCooldown: 0, dead: false }; group.traverse(o => { if (o.isMesh) o.userData.entity = entity; }); this.scene.add(group); return entity;
  }
  animateUnit(e, time, dt) {
    if (e.dead) return;
    const phase = e.animationSeed || 0, auraPulse = 1 + Math.sin(time * 4 + phase) * .08;
    if(e.jetpackRig){for(const [i,flame] of e.jetpackRig.flames.entries()){flame.visible=Boolean(e.jetpackActive);if(flame.visible){const pulse=1+Math.sin(time*36+i*2.4)*.2;flame.scale.set(.85+.15*pulse,pulse, .85+.15*pulse);flame.material.opacity=.68+Math.sin(time*29+i)*.22}}e.jetpackRig.group.rotation.z=THREE.MathUtils.lerp(e.jetpackRig.group.rotation.z,e.jetpackActive?Math.sin(time*24)*.025:0,Math.min(1,dt*12))}
    if (e.auraGlow) { e.auraGlow.material.opacity = .58 + Math.sin(time * 4 + phase) * .12; e.auraGlow.scale.set(4.8 * auraPulse, 5.4 * auraPulse, 1); }
    if (e.auraRing) { e.auraRing.scale.setScalar(auraPulse); e.auraRing.rotation.z = time * .28 + phase; }
    // aura shells hug the torso and head through every lean, twist and squash
    if (e.bodyAura) { e.bodyAura.position.copy(e.body.position); e.bodyAura.rotation.copy(e.body.rotation); e.bodyAura.scale.copy(e.body.scale).multiplyScalar(1.18); }
    if (e.headAura) { e.headAura.position.copy(e.head.position); e.headAura.rotation.copy(e.head.rotation); e.headAura.scale.copy(e.head.scale).multiplyScalar(1.22); }
    if(e.escortPanic){const tremble=Math.sin(time*32+phase),flail=Math.sin(time*9+phase);e.weaponGroup.visible=false;e.velocity.multiplyScalar(Math.pow(.015,dt));e.body.position.set(0,1.04+Math.abs(flail)*.05,0);e.body.rotation.set(.16,tremble*.045,flail*.08);e.head.position.set(0,2.02,0);e.head.rotation.set(-.15,Math.sin(time*13)*.48,tremble*.08);e.leftHand.position.set(-.72,1.92+flail*.16,.35);e.rightHand.position.set(.72,1.92-flail*.16,.35);e.leftBoot.position.set(-.38,.22,.13);e.rightBoot.position.set(.38,.22,-.08);if(e.scientistRig){e.scientistRig.backpack.rotation.set(-.08,0,tremble*.035);e.scientistRig.core.rotation.y=time*2.5;e.scientistRig.antennaTip.scale.setScalar(1+Math.sin(time*12)*.18)}return}
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
    const lerp = THREE.MathUtils.lerp, clamp = THREE.MathUtils.clamp;
    const speed = Math.hypot(e.velocity.x, e.velocity.z), ground = e.groundY || 0;
    const airborne = e.group.position.y > ground + .05, vv = e.verticalVelocity || 0;
    // a hidden weaponGroup (menu joggers, carriers) means the arms swing free
    const armed = !!e.weapon && e.weaponId !== 'unarmed' && e.weaponGroup.visible;
    // first person: damp torso motion so the chest never crosses the camera plane
    const fp = e.firstPerson ? .25 : 1;

    // ── landing: time spent airborne converts into a crouch-and-recover on touchdown
    if (airborne) e.airTime = (e.airTime || 0) + dt;
    else { if ((e.airTime || 0) > .12) { e.landTimer = .3; e.landImpact = clamp(.4 + e.airTime * .8, 0, 1); } e.airTime = 0; }
    e.landTimer = Math.max(0, (e.landTimer || 0) - dt);

    // ── recoil envelope: sharp strike, fast settle; residual heat keeps the
    //    weapon shouldered for a beat after the last shot instead of snapping down
    e.recoil = Math.max(0, e.recoil - dt * (e.recoil > .45 ? 7.5 : 4.2));
    const kick = e.recoil * e.recoil, sway = e.recoil;
    if (e.recoil > .01) e.aimHeat = 1;
    e.aimHeat = Math.max(0, (e.aimHeat || 0) - dt * .8);
    const mountRaw = clamp((e.aimHeat || 0) * 2.6, 0, 1);
    const mount = armed && !e.carriedCrate ? mountRaw * mountRaw * (3 - 2 * mountRaw) : 0;

    // ── gait: cadence and stride scale with real speed, and the phase accumulates
    //    so speed changes never pop the legs to a different point in the cycle
    const topSpeed = e.classDef?.speed || 9, moving = speed > .25 && !airborne;
    e.stride = lerp(e.stride || 0, moving ? clamp(speed / topSpeed, .35, 1.35) : 0, Math.min(1, dt * 9));
    if (e.gaitPhase === undefined) e.gaitPhase = phase;
    if (moving) e.gaitPhase += dt * (7 + 7.5 * Math.min(1, speed / topSpeed));
    const s = e.stride, g = e.gaitPhase, swing = Math.sin(g);
    // travel direction in local space so strafing and backpedaling read correctly
    const yaw = e.group.rotation.y, sy = Math.sin(yaw), cy = Math.cos(yaw), inv = speed > 1e-3 ? 1 / speed : 0;
    e.moveX = lerp(e.moveX || 0, (e.velocity.x * cy - e.velocity.z * sy) * inv, Math.min(1, dt * 8));
    e.moveZ = lerp(e.moveZ === undefined ? 1 : e.moveZ, (e.velocity.x * sy + e.velocity.z * cy) * inv, Math.min(1, dt * 8));
    const mx = e.moveX, mz = e.moveZ;

    // ── base pose (idle is deliberately statue-still: no sway, scan or breathing)
    let bodyY = 1.15, bodyZ = 0, pitch = 0, twist = 0, roll = 0;
    let headY = 2.15, headZ = 0, headPitch = e.headPitch || 0, headYaw = 0, headRoll = 0;
    let wx = .72, wy = 1.22, wz = .72, wPitch = 0, wYaw = 0, wRoll = 0;
    let lh = [-.78, 1.24, .12], rh = armed ? [.64, 1.24, .46] : [.78, 1.24, .12];
    let lb = [-.33, .22, .03], rb = [.33, .22, .03];
    let bounce = 0;

    if (airborne) {
      // ── JUMP: three readable silhouettes blended by vertical velocity —
      //    launch (tucked, arms punching up), apex, fall (spread, reaching down)
      const fall = clamp(.5 - vv * .055, 0, 1), tuck = 1 - fall;
      const flail = Math.sin(time * 11 + phase) * .09 * fall;
      lb = [-.34, .22 + .36 * tuck + .1 * fall, .28 * tuck - .05 * fall];
      rb = [.34, .22 + .2 * tuck + .13 * fall, -.32 * tuck + .1 * fall];
      lh = [-.86 - .18 * fall, 1.6 + .24 * tuck + .28 * fall + flail, .05 - .1 * fall];
      rh = [.86 + .18 * fall, 1.6 + .24 * tuck + .28 * fall - flail, .05 - .1 * fall];
      pitch = (-.17 * tuck + .13 * fall) * fp;
      headPitch += -.1 * tuck + .16 * fall;
      wy = 1.32 + .1 * tuck; wPitch = -.22 * tuck + .12 * fall;
    } else if (s > .02) {
      // ── RUN: legs stride along the travel direction with real foot lift, arms
      //    pump opposite the legs, the torso leans in and counter-rotates, and
      //    the whole frame bounces on each foot plant
      const strideLen = .38 * s, lift = .12 + .2 * s;
      const stepL = swing * strideLen, stepR = -swing * strideLen;
      lb = [-.33 + mx * stepL, .22 + Math.max(0, Math.cos(g)) * lift, .03 + mz * stepL];
      rb = [.33 + mx * stepR, .22 + Math.max(0, -Math.cos(g)) * lift, .03 + mz * stepR];
      bounce = Math.abs(Math.cos(g)) * .07 * s;
      pitch = clamp(mz, -.4, 1) * .17 * s * fp;
      roll = -mx * .11 * s * fp;
      twist = swing * .14 * s;
      headPitch += -pitch * .5; headRoll = -roll * .4; // gaze stays level
      const pump = .34 + .2 * s, pumpL = -swing * pump, pumpR = swing * pump;
      const drive = p => Math.max(0, p) * .5; // the forward arm rides high, elbow bent
      lh = [-.7 + mx * pumpL * .6, 1.22 + drive(pumpL) + bounce, .12 + mz * pumpL];
      rh = armed
        ? [.62 + mx * pumpR * .3, 1.23 + drive(pumpR) * .5 + bounce, .42 + mz * pumpR * .55]
        : [.7 + mx * pumpR * .6, 1.22 + drive(pumpR) + bounce, .12 + mz * pumpR];
      bodyY += bounce; headY += bounce * .82;
      wy += bounce * .9; wPitch = -.06 * s + swing * .04 * s; // the carried gun rides the gait
    }
    if (!airborne && e.landTimer > 0) {
      // ── LANDING: impact crouch scaled by fall time, softened when rolling through at speed
      const c = e.landImpact * (e.landTimer / .3) ** 2 * (1 - .45 * Math.min(1, s));
      bodyY -= c * .3; headY -= c * .34; pitch += c * .3 * fp; headPitch += c * .18;
      lh = [lerp(lh[0], -.62, c), lerp(lh[1], 1.02, c), lerp(lh[2], .48, c)];
      rh = [lerp(rh[0], .62, c), lerp(rh[1], 1.02, c), lerp(rh[2], .48, c)];
      lb = [lerp(lb[0], -.44, c), lb[1], lerp(lb[2], .14, c)];
      rb = [lerp(rb[0], .44, c), rb[1], lerp(rb[2], -.1, c)];
      wy -= c * .2;
    }
    if (mount > 0) {
      // ── COMBAT MOUNT: the weapon rises from hip carry to a two-handed shoulder
      //    mount (the menu-stage stance), tracking aim pitch; the off-hand braces
      //    the fore-end and the cheek drops to the stock
      const aimPitch = clamp(-Math.asin(clamp(e.aim ? e.aim.y : 0, -1, 1)), -.85, .85);
      const grip = airborne ? mount * .85 : mount;
      wx = lerp(wx, .34, mount); wy = lerp(wy, 1.5 + bounce * .5, mount); wz = lerp(wz, .55, mount);
      wPitch = lerp(wPitch, -.05 + aimPitch, mount); wYaw = lerp(wYaw, -.04, mount);
      lh = [lerp(lh[0], -.18, grip), lerp(lh[1], 1.48 + bounce * .5, grip), lerp(lh[2], 1.05, grip)];
      rh = [lerp(rh[0], .44, grip), lerp(rh[1], 1.42 + bounce * .5, grip), lerp(rh[2], .5, grip)];
      headPitch += .07 * mount; headYaw -= .06 * mount;
      twist *= 1 - mount * .85; // shoulders square up on the target
      pitch += .05 * mount * fp;
    }
    if (e.recoil > .01) {
      // ── ATTACK: three firing signatures, layered onto the mounted stance
      if (e.attackStyle === 0) {
        // kickback lunge — the gun slams straight back and the torso rides the hit
        wz -= kick * .38; wPitch -= kick * .55;
        pitch -= sway * .26 * fp; bodyZ -= sway * .12 * fp; headZ -= kick * .1; headPitch -= kick * .2;
        rh[2] -= kick * .32; rh[1] += kick * .06; lh[2] -= kick * .16;
      } else if (e.attackStyle === 1) {
        // torque twist — the shot wrenches the shoulders while the head holds the target
        twist -= sway * .42 * fp; headYaw += sway * .3; roll += kick * .08 * fp;
        wz -= kick * .26; wYaw -= kick * .3; wPitch -= kick * .3; wRoll += kick * .16;
        rh[2] -= kick * .22; lh[2] -= kick * .1; bodyZ -= sway * .07 * fp;
      } else {
        // pump brace — crouch into the shot and let the muzzle climb
        bodyY -= sway * .16; headY -= sway * .18; wPitch -= kick * .7; wz -= kick * .3;
        pitch += sway * .12 * fp; headPitch += kick * .18;
        rh[1] -= sway * .08; rh[2] -= kick * .24; lh[1] -= sway * .06; lh[2] -= kick * .1;
      }
    }
    if (e.stun > 0) {
      // ── STAGGER: heavy hits leave the unit reeling, arms windmilling for balance
      const daze = Math.min(1, e.stun), reel = time * 17 + phase;
      pitch += Math.sin(reel) * .16 * daze * fp; roll += Math.cos(reel * .8) * .14 * daze * fp;
      headYaw += Math.sin(reel * 1.3) * .24 * daze; headRoll += Math.cos(reel) * .12 * daze;
      lh = [-.85, 1.5 + Math.sin(reel) * .3 * daze, .1]; rh = [.85, 1.5 - Math.sin(reel) * .3 * daze, .1];
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
    else e.weaponGroup.visible = e.renderLod !== 2;
    // ── apply the composed pose in one pass
    e.body.position.set(0, bodyY, bodyZ); e.body.rotation.set(pitch, twist, roll);
    e.head.position.set(0, headY, headZ); e.head.rotation.set(headPitch, headYaw, headRoll);
    e.weaponGroup.position.set(wx, wy, wz); e.weaponGroup.rotation.set(wPitch, wYaw, wRoll);
    e.leftHand.position.set(...lh); e.rightHand.position.set(...rh);
    e.leftBoot.position.set(...lb); e.rightBoot.position.set(...rb);
    e.group.rotation.z = 0;
    // squash & stretch with rough volume preservation: stretched in flight, squashed on impact
    const stretch = airborne ? 1 + Math.min(.2, Math.abs(vv) * .014)
      : e.landTimer > 0 ? 1 - e.landImpact * (e.landTimer / .3) * .18 : 1;
    e.body.scale.y = lerp(e.body.scale.y, stretch, Math.min(1, dt * 12));
    e.body.scale.x = e.body.scale.z = lerp(e.body.scale.x, 1 + (1 - e.body.scale.y) * .6, Math.min(1, dt * 12));
    if(e.scientistRig){const burden=Math.min(1,speed/(e.classDef?.speed||3.15)),sway=Math.sin(e.gaitPhase||phase)*.075*burden;e.body.rotation.x+=.12;e.head.rotation.x-=.06;e.scientistRig.backpack.rotation.set(-.05+sway*.25,0,-sway);e.scientistRig.core.rotation.y=time*2.2;e.scientistRig.core.rotation.x=time*.7;e.scientistRig.antennaTip.scale.setScalar(1+Math.sin(time*8+phase)*.14);e.weaponGroup.visible=false}
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
