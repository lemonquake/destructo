import * as THREE from 'three';
import { createWaterMaterial } from './Materials.js';
import { rollCrateType, CRATE_TYPES } from '../data/gameData.js';
import { CrateDropScheduler, RARE_DROP_TYPES } from './CrateDropSystem.js';
import { mapById } from '../data/maps.js';

export class World {
  constructor(scene, materials, factory, mapId = 'crossroads', gameMode = 'deathmatch') { this.scene = scene; this.materials = materials; this.factory = factory; this.map = mapById(mapId); this.gameMode = gameMode; this.hasWater = false; this.waterMaterial = createWaterMaterial(materials.textures.water); this.destructibles = []; this.interactiveStructures = []; this.motorcycles = []; this.cars = []; this.vehicles = []; this.crates = []; this.wildlife = []; this.pickups = []; this.crateDropZones = []; this.dominationTowers = []; this.bounds = gameMode === 'domination' ? 96 : 78; }
  // teams: [{id, color, dark}] — a base + builder pad is raised for each one, spread on a ring
  build(teams = [{ id: 'blue', color: 0x2fb4ff, dark: 0x11638f }, { id: 'red', color: 0xff5062, dark: 0x8e2634 }]) {
    const atmospheres={crossroads:[0x342b5c,0x554c77,.009],crown:[0x9fd8ff,0xcbeaff,.006],wilds:[0x75c79a,0x8fc8a3,.013],rift:[0x5a2524,0x4b2425,.018],sunken:[0x4f9d78,0x6ca680,.008],serpent:[0x536b45,0x78905e,.011],eclipse:[0x241d45,0x493a68,.012]},atmos=atmospheres[this.map.id]||atmospheres.crossroads;
    this.scene.background = new THREE.Color(atmos[0]); this.scene.fog = new THREE.FogExp2(atmos[1], atmos[2]);
    this.teams = teams;
    // base ring: player team lands at the bottom of the map, others spread evenly
    const ringRadius = this.gameMode === 'domination' ? (teams.length <= 2 ? 84 : 80) : (teams.length <= 2 ? 65 : 60);
    this.basePositions = {}; this.spawnPositions = {}; this.builderPositions = {}; this.factories = {}; this.baseTurrets = {};
    teams.forEach((t, i) => {
      const angle = Math.PI / 2 + i / teams.length * Math.PI * 2;
      let x = Math.cos(angle) * ringRadius;
      let z = Math.sin(angle) * ringRadius;
      const riverZ = 3;
      const safeDistance = 18;
      if (Math.abs(z - riverZ) < safeDistance) {
        if (x < 0) {
          z = riverZ - safeDistance;
        } else {
          z = riverZ + safeDistance;
        }
      }
      this.basePositions[t.id] = new THREE.Vector3(x, 0, z);
    });
    this.cavePosition = new THREE.Vector3(2, 0, -12);
    this.planCrateDropZones();
    this.setupTerrain();
    const groundTexture={crossroads:'sidewalk',crown:'summit_stone',wilds:'jungle_floor',rift:'volcanic_rock',sunken:'moss_stone',serpent:'jungle_floor',eclipse:'root_mud'}[this.map.id]||'jungle_floor';
    const ground = new THREE.Mesh(this.terrainGeometry(), this.materials.building(groundTexture,{repeat:18})); ground.name = 'generated-grass-ground'; ground.receiveShadow = true; this.scene.add(ground);
    if(this.hasWater){const water = new THREE.Mesh(new THREE.PlaneGeometry(180, 16, 48, 8), this.waterMaterial); water.rotation.x = -Math.PI / 2; water.position.set(0, .12, 3); water.renderOrder = 1; this.scene.add(water); this.water = water;this.createBridge(-18);this.createBridge(24)}
    for (const t of teams) {
      const base = this.basePositions[t.id];
      base.y = this.heightAt(base.x, base.z);
      this.factories[t.id] = this.factory.createFactory(t.id, base);
      const toCenter = base.clone().multiplyScalar(-1).setY(0).normalize();
      const side=new THREE.Vector3(-toCenter.z,0,toCenter.x);const turretPos=base.clone().addScaledVector(toCenter,7).addScaledVector(side,6);turretPos.y=this.heightAt(turretPos.x,turretPos.z);this.baseTurrets[t.id]=this.factory.createBaseTurret(t.id,turretPos);
      const pad = base.clone().addScaledVector(toCenter, 9).addScaledVector(side, -6.5); pad.y = this.heightAt(pad.x, pad.z) + .18;
      this.spawnPositions[t.id] = pad;
      if(this.gameMode!=='domination'){this.builderPositions[t.id] = pad;this.createBuilderPad(pad, t.color, t.dark);}
    }
    // legacy two-team aliases used by the mission scripts
    this.blueFactory = this.factories[teams[0].id]; this.redFactory = this.factories[teams[1]?.id] || this.factories[teams[0].id];
    this.builderPosition = this.builderPositions[teams[0].id];
    this.createCave(this.cavePosition);
    this.setupCrateDropZones();
    this.dropOpeningCrates(this.map.id==='crown'?3:7);
    this.populate(); this.buildStructures(); this.buildInteractives(); this.buildDecorations(); this.buildThemedContent(); if(this.gameMode==='domination')this.createDominationTowers(); return this;
  }
  // ── Team Buddies style rolling hills ───────────────────────────────────────
  setupTerrain() {
    const random = this.seeded(51377); this.hills = [];
    for (let i = 0; i < 28; i++) this.hills.push({ x: random() * 160 - 80, z: random() * 160 - 80, h: 1.6 + random() * 3.2, r: 7 + random() * 9 });
    const bases = Object.values(this.basePositions);
    this.heightAt = (x, z) => {
      let h = Math.sin(x * .14 + 1.3) * Math.sin(z * .11 - .7) * .5 + .5;
      for (const hill of this.hills) { const dx = x - hill.x, dz = z - hill.z; h += hill.h * Math.exp(-(dx * dx + dz * dz) / (hill.r * hill.r)); }
      // flatten combat-critical zones: the river strip, every base, every supply
      // depot, and the cave approach
      let mask = this.hasWater ? THREE.MathUtils.smoothstep(Math.abs(z - 3), 8.5, 18) : 1;
      for (const b of bases) mask *= THREE.MathUtils.smoothstep(Math.hypot(x - b.x, z - b.z), 14, 25);
      for (const zone of this.crateDropZonePlans || []) mask *= THREE.MathUtils.smoothstep(Math.hypot(x - zone.position.x, z - zone.position.z), 6.5, 11);
      mask *= THREE.MathUtils.smoothstep(Math.hypot(x - this.cavePosition.x, z - this.cavePosition.z), 8, 15);
      let result=Math.max(0,h*mask);
      if(this.map.id==='crossroads')result*=.18;
      if(this.map.id==='crown'){const d=Math.hypot(x,z);result+=Math.max(0,17*(1-d/34));if(d<8)result=17.2;}
      if(this.map.id==='wilds')result+=Math.sin(x*.055)*Math.cos(z*.06)*1.2+1.3;
      if(this.map.id==='rift'){const d=Math.hypot(x,z);result+=Math.max(0,6-d*.08);}
      if(this.map.id==='sunken'){result+=1.2+Math.sin(x*.045)*Math.cos(z*.05)*2.1;for(const [tx,tz] of [[0,0],[-48,-28],[48,-28],[-42,38],[42,38]])result*=.72+.28*THREE.MathUtils.smoothstep(Math.hypot(x-tx,z-tz),5,12);}
      if(this.map.id==='serpent'){result+=2.2+Math.max(0,10-Math.abs(z+Math.sin(x*.045)*13)*.42)+Math.sin(x*.07)*1.4;}
      if(this.map.id==='eclipse'){const d=Math.hypot(x,z);result+=2.5+Math.max(0,9-d*.1)+Math.sin(x*.04)*Math.cos(z*.045)*2.8;}
      return Math.max(0,result);
    };
  }
  terrainGeometry() {
    const size=this.gameMode==='domination'?214:180;const geo = new THREE.PlaneGeometry(size, size, 120, 120); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, this.heightAt(pos.getX(i), pos.getZ(i)));
    geo.computeVertexNormals(); return geo;
  }
  groundAt(position) { return this.heightAt(position.x, position.z); }
  surfaceAt(position) {
    if (this.isWater(position)) return 'water';
    return ['crossroads', 'crown', 'rift', 'sunken'].includes(this.map.id) ? 'rock' : 'dirt';
  }
  createBridge(x) {
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(10, .65, 20), this.materials.building('plating', { repeat: 2 })); bridge.position.set(x, .28, 3); bridge.receiveShadow = bridge.castShadow = true; this.scene.add(bridge);
    for (const sx of [-4.7, 4.7]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(.24, 1.3, 20), this.materials.building('hazard')); rail.position.set(x + sx, 1, 3); this.scene.add(rail); }
  }
  createBuilderPad(position, glow, glowDark) {
    const pad = new THREE.Group(); pad.position.copy(position); pad.name = 'd-builder-pad';
    const base = new THREE.Mesh(new THREE.BoxGeometry(4.6, .28, 4.6), this.materials.building('plating')); base.receiveShadow = true; pad.add(base);
    const gridMat = this.materials.color(glow, { emissive: glowDark, emissiveIntensity: .7 });
    for (const x of [-.7, .7]) for (const z of [-.7, .7]) { const cell = new THREE.Mesh(new THREE.BoxGeometry(1.3, .12, 1.3), gridMat); cell.position.set(x, .18, z); pad.add(cell); }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.55, .11, 6, 32), new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: .82, depthWrite: false })); ring.rotation.x = Math.PI / 2; ring.position.y = .22; pad.add(ring);
    for(const x of [-2.05,2.05])for(const z of [-2.05,2.05]){const pylon=new THREE.Mesh(new THREE.CylinderGeometry(.11,.18,1.7,6),this.materials.building('plating'));pylon.position.set(x,.85,z);pad.add(pylon);const lamp=new THREE.Mesh(new THREE.SphereGeometry(.17,7,5),new THREE.MeshBasicMaterial({color:glow}));lamp.position.set(x,1.78,z);pad.add(lamp)}
    const canvas=document.createElement('canvas');canvas.width=384;canvas.height=96;const ctx=canvas.getContext('2d');ctx.fillStyle='rgba(8,13,27,.9)';ctx.fillRect(4,4,376,88);ctx.strokeStyle=`#${glow.toString(16).padStart(6,'0')}`;ctx.lineWidth=7;ctx.strokeRect(5,5,374,86);ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='900 42px Impact,system-ui';ctx.fillText('D-BUILDER',192,49);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const sign=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false}));sign.position.set(0,3.25,0);sign.scale.set(5.4,1.35,1);pad.add(sign);
    this.scene.add(pad); this.builderPad = this.builderPad || pad;
  }
  createCave(position) { const group = new THREE.Group(); group.position.copy(position); const dark = new THREE.MeshBasicMaterial({ color: 0x111522 }); const mouth = new THREE.Mesh(new THREE.CircleGeometry(3.15, 12), dark); mouth.position.set(0, 2.75, .12); group.add(mouth); const arch = new THREE.Mesh(new THREE.TorusGeometry(3.35, .82, 6, 14, Math.PI), this.materials.building('cobble')); arch.position.y = 2.65; arch.castShadow = true; group.add(arch); for (const x of [-2.2, 2.2]) { const pillar = new THREE.Mesh(new THREE.CylinderGeometry(.82, 1.05, 3.1, 7), this.materials.building('cobble')); pillar.position.set(x, 1.45, 0); pillar.castShadow = true; group.add(pillar); } const crystalMat = this.materials.building('crystal', { emissive: 0x1780b0, emissiveIntensity: .9 }); for (const [x, z, s] of [[-4, -1, .7], [3.8, .3, .9], [4.5, -1.4, .55]]) { const c = new THREE.Mesh(new THREE.ConeGeometry(.48, 1.7, 5), crystalMat); c.position.set(x, .85, z); c.scale.setScalar(s); group.add(c); } const ring = new THREE.Mesh(new THREE.RingGeometry(5.1, 5.45, 40), new THREE.MeshBasicMaterial({ color: 0x5bd9ff, transparent: true, opacity: .5, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })); ring.rotation.x = -Math.PI / 2; ring.position.y = .1; group.add(ring); this.caveRing = ring; this.caveGroup = group; this.scene.add(group); }
  planCrateDropZones() {
    if(this.gameMode==='domination'){
      this.crateDropZonePlans=[
        ['neutral-west','WESTERN CACHE',-31,0],
        ['neutral-center','TEMPLE CACHE',0,7],
        ['neutral-east','EASTERN CACHE',31,0],
      ].map(([id,label,x,z])=>({id,label,kind:'neutral',color:0xffd23f,position:new THREE.Vector3(x,0,z),types:['brown',...RARE_DROP_TYPES],radius:4.8}));
      return;
    }
    if(this.map.id==='crown'){
      this.crateDropZonePlans=[{id:'summit-crown',label:'THE CRATE CROWN',kind:'rare',color:0xffd23f,position:new THREE.Vector3(0,0,0),types:['brown'],radius:5.2,burst:3,interval:{minSeconds:1,maxSeconds:5}}];
      return;
    }
    const teamZones = this.teams.map(team => {
      const base = this.basePositions[team.id];
      const toCenter = base.clone().multiplyScalar(-1).setY(0).normalize();
      const toLeft = new THREE.Vector3(-toCenter.z, 0, toCenter.x).normalize();
      const position = base.clone().addScaledVector(toCenter, 15).addScaledVector(toLeft, 14);
      return { id: `team-${team.id}`, label: `${team.name || team.id.toUpperCase()} DEPOT`, kind: 'team', teamId: team.id, color: team.color, position, types: ['brown'], radius: 4.2 };
    });
    const rareZones = [
      ['rare-southwest', 'EMBER RELAY', -23, -23],
      ['rare-southeast', 'TIDAL RELAY', 23, -23],
      ['rare-northwest', 'TEMPLE RELAY', -23, 23],
      ['rare-northeast', 'FORT RELAY', 23, 23],
    ].map(([id, label, x, z]) => ({ id, label, kind: 'rare', color: 0x7fe8ff, position: new THREE.Vector3(x, 0, z), types: [...RARE_DROP_TYPES], radius: 4.2 }));
    this.crateDropZonePlans = [...teamZones, ...rareZones];
  }
  setupCrateDropZones() {
    this.crateDropZones = this.crateDropZonePlans.map(plan => {
      const zone = { ...plan, position: plan.position.clone() };
      zone.position.y = this.heightAt(zone.position.x, zone.position.z);
      zone.visual = this.createCrateDropZoneVisual(zone);
      return zone;
    });
    this.crateDropScheduler = new CrateDropScheduler(this.crateDropZones);
  }
  // Every marked dropspot opens a match with seven common crates in flight;
  // the independent per-rarity scheduler then continues on its normal clocks.
  dropOpeningCrates(count = 7) {
    for (const zone of this.crateDropZones) {
      for (let i = 0; i < count; i++) this.airdropCrate('brown', Math.random, zone);
    }
  }
  createCrateDropZoneVisual(zone) {
    const group = new THREE.Group(); group.position.copy(zone.position); group.name = `crate-drop-zone-${zone.id}`;
    const plating = this.materials.building('plating');
    const base = new THREE.Mesh(new THREE.CylinderGeometry(6.1, 6.35, .24, zone.kind === 'rare' ? 8 : 32), plating); base.position.y = .06; base.receiveShadow = true; group.add(base);
    const insetMat = this.materials.color(0x222b38, { roughness: .65, metalness: .45 });
    const inset = new THREE.Mesh(new THREE.CylinderGeometry(5.35, 5.35, .09, zone.kind === 'rare' ? 8 : 32), insetMat); inset.position.y = .19; inset.receiveShadow = true; group.add(inset);
    const glowMat = new THREE.MeshBasicMaterial({ color: zone.color, transparent: true, opacity: zone.kind === 'rare' ? .9 : .72, depthWrite: false });
    const perimeter = new THREE.Mesh(new THREE.TorusGeometry(5.55, .16, 6, zone.kind === 'rare' ? 8 : 48), glowMat); perimeter.rotation.x = Math.PI / 2; perimeter.position.y = .27; group.add(perimeter);
    const hazard = this.materials.building('hazard');
    for (let i = 0; i < 8; i++) {
      const angle = i / 8 * Math.PI * 2;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.1, .08, .48), hazard); stripe.position.set(Math.cos(angle) * 4.15, .29, Math.sin(angle) * 4.15); stripe.rotation.y = -angle; stripe.receiveShadow = true; group.add(stripe);
    }
    const landingMat = this.materials.color(zone.kind === 'rare' ? 0x5dd8ff : 0xf0c879, { emissive: zone.color, emissiveIntensity: .45, metalness: .5 });
    for (const rotation of [0, Math.PI / 2]) { const cross = new THREE.Mesh(new THREE.BoxGeometry(3.4, .1, .34), landingMat); cross.position.y = .33; cross.rotation.y = rotation; group.add(cross); }
    const pylons = [];
    for (let i = 0; i < 4; i++) {
      const angle = Math.PI / 4 + i * Math.PI / 2, pylon = new THREE.Group();
      pylon.position.set(Math.cos(angle) * 5.15, .2, Math.sin(angle) * 5.15);
      let post, lamp;
      if (zone.kind === 'rare') {
        post = new THREE.Mesh(new THREE.BoxGeometry(.34, 2.2, .34), plating);
        post.position.y = 1.1;
        lamp = new THREE.Mesh(new THREE.OctahedronGeometry(.28, 0), glowMat.clone());
        lamp.position.y = 2.45;
      } else {
        post = new THREE.Mesh(new THREE.CylinderGeometry(.2, .34, 1.25, 8), plating);
        post.position.y = .62;
        lamp = new THREE.Mesh(new THREE.SphereGeometry(.25, 8, 6), glowMat.clone());
        lamp.position.y = 1.35;
      }
      post.castShadow = true;
      pylon.add(post);
      pylon.add(lamp); pylon.userData.lamp = lamp;
      group.add(pylon); pylons.push(pylon);
    }
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(.45, 2.4, 10, 20, 1, true), new THREE.MeshBasicMaterial({ color: zone.color, transparent: true, opacity: zone.kind === 'rare' ? .095 : .055, side: THREE.DoubleSide, depthWrite: false })); beam.position.y = 5.3; group.add(beam);
    const spinner = new THREE.Mesh(new THREE.TorusGeometry(2.05, .07, 5, zone.kind === 'rare' ? 8 : 36), glowMat.clone()); spinner.rotation.x = Math.PI / 2; spinner.position.y = 1.1; group.add(spinner);
    
    let core, orbitals, spinner2;
    if (zone.kind === 'rare') {
      core = new THREE.Mesh(new THREE.OctahedronGeometry(0.68, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }));
      core.position.y = 1.4;
      group.add(core);
      orbitals = [];
      const colors = [0xffd23f, 0x58c8ff, 0xff4d5e];
      for (let i = 0; i < 3; i++) {
        const orb = new THREE.Mesh(new THREE.OctahedronGeometry(.22, 0), new THREE.MeshBasicMaterial({ color: colors[i] }));
        orb.position.y = 1.4;
        group.add(orb);
        orbitals.push(orb);
      }
      spinner2 = new THREE.Mesh(new THREE.TorusGeometry(3.1, .06, 5, 8), glowMat.clone());
      spinner2.rotation.x = Math.PI / 2;
      spinner2.position.y = 1.35;
      group.add(spinner2);
    }
    
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128; const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(9,16,25,.88)'; ctx.fillRect(5, 5, 502, 118);
    if (zone.kind === 'rare') {
      ctx.strokeStyle = 'rgba(93,216,255,0.15)'; ctx.lineWidth = 1;
      for (let x = 10; x < 500; x += 20) { ctx.beginPath(); ctx.moveTo(x, 5); ctx.lineTo(x, 123); ctx.stroke(); }
      for (let y = 10; y < 120; y += 20) { ctx.beginPath(); ctx.moveTo(5, y); ctx.lineTo(507, y); ctx.stroke(); }
    }
    ctx.strokeStyle = `#${zone.color.toString(16).padStart(6, '0')}`; ctx.lineWidth = 8; ctx.strokeRect(8, 8, 496, 112);
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.font = `900 ${Math.max(22, Math.min(38, 700 / zone.label.length))}px system-ui`; ctx.fillText(zone.label, 256, 54); ctx.fillStyle = zone.kind === 'rare' ? '#9deeff' : '#ffd782'; ctx.font = '800 24px system-ui'; ctx.fillText(zone.burst===3 ? 'TRIPLE DROP  //  EVERY 1–5 SECONDS' : zone.kind === 'rare' ? 'RARE AIRDROP  //  YELLOW  BLUE  RED' : 'COMMON SUPPLY  //  3–7.5 SECONDS', 256, 91);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })); sign.position.set(0, zone.kind === 'rare' ? 4.25 : 3.25, -4.7); sign.scale.set(7.5, 1.88, 1); group.add(sign);
    this.scene.add(group);
    
    const visual = { group, spinner, beam, pylons };
    if (zone.kind === 'rare') {
      visual.core = core;
      visual.orbitals = orbitals;
      visual.spinner2 = spinner2;
    }
    return visual;
  }
  nearBase(x, z, range = 11) { return Object.values(this.basePositions).some(b => Math.hypot(x - b.x, z - b.z) < range); }
  nearDropZone(x, z, range = 7) { return (this.crateDropZonePlans || []).some(zone => Math.hypot(x - zone.position.x, z - zone.position.z) < range); }
  populate() {
    const random = this.seeded(8021);
    const population=this.map.id==='wilds'?220:this.map.id==='crossroads'?55:120;
    for (let i = 0; i < population; i++) {
      let x = random() * 150 - 75, z = random() * 150 - 75; if (Math.abs(z - 3) < 11 || this.nearBase(x, z, 14) || this.nearDropZone(x, z, 8)) { i--; continue; }
      if (i < population*(this.map.id==='wilds' ? .82 : .54)) this.createTree(x, z, .75 + random() * .65); else this.createRock(x, z, .6 + random() * 1.5);
    }
    for (const [x, z, rotation] of [[-22, -12, .4], [26, 20, -2.5]]) if (!this.nearDropZone(x, z, 8)) this.createSandbags(new THREE.Vector3(x, this.heightAt(x, z), z), rotation);
    [
      ['sheep', -8, 22], ['sheep', 12, -28], ['sheep', -30, -15], ['sheep', 25, 32], ['sheep', -20, 42],
      ['wolf', 2, 14], ['wolf', 18, 2], ['wolf', -25, -35], ['wolf', 35, -12], ['wolf', -38, 5],
      ['slime', -5, 30], ['slime', -22, -18], ['slime', 22, -22], ['slime', 30, 20], ['slime', -40, -40]
    ].forEach(([kind, x, z]) => { if (!this.nearDropZone(x, z, 7)) this.wildlife.push(this.factory.createWildlife(kind, new THREE.Vector3(x, this.heightAt(x, z), z))); });
    if(this.map.id==='wilds')for(let i=0;i<28;i++){const kind=i%5===0?'slime':i%3===0?'wolf':'sheep',a=random()*Math.PI*2,r=12+random()*55,x=Math.cos(a)*r,z=Math.sin(a)*r;this.wildlife.push(this.factory.createWildlife(kind,new THREE.Vector3(x,this.heightAt(x,z),z)))}
  }
  // Structures showing off the 10 generated building textures
  buildStructures() {
    const add = (geo, tex, x, y, z, opts = {}) => { const m = new THREE.Mesh(geo, this.materials.building(tex, opts.mat)); m.position.set(x, y + this.heightAt(x, z), z); if (opts.ry) m.rotation.y = opts.ry; m.castShadow = m.receiveShadow = true; this.scene.add(m); if (opts.hp) { const d = { id: crypto.randomUUID(), type: 'prop', subtype: tex, group: m, hp: opts.hp, maxHp: opts.hp, radius: opts.radius || 2, dead: false }; m.userData.entity = d; this.destructibles.push(d); } return m; };
    // brick ruin walls near midfield
    add(new THREE.BoxGeometry(6, 2.6, .8), 'brick', -6, 1.3, -24, { hp: 260, radius: 3 });
    add(new THREE.BoxGeometry(.8, 2, 4.5), 'brick', -2.6, 1, -21.5, { hp: 200, radius: 2.3 });
    // The concrete bunker at this landmark is now a fully interactive structure.
    // watchtower: cobble base, sandstone shaft, blue rooftile roof
    add(new THREE.CylinderGeometry(2.2, 2.6, 1.4, 8), 'cobble', -24, .7, 12, { hp: 380, radius: 2.6 });
    add(new THREE.CylinderGeometry(1.5, 1.9, 5.2, 8), 'sandstone', -24, 4, 12);
    add(new THREE.ConeGeometry(2.4, 2, 8), 'rooftile', -24, 7.6, 12);
    // marble obelisk at cave approach
    add(new THREE.BoxGeometry(1.2, 5.4, 1.2), 'marble', 6.5, 2.7, -12, { hp: 300, radius: 1.4 });
    add(new THREE.ConeGeometry(.95, 1.2, 4), 'marble', 6.5, 6, -12);
    // plating supply depot
    add(new THREE.BoxGeometry(4, 2.2, 3), 'plating', -14, 1.1, 26, { hp: 340, radius: 2.6 });
    // crystal outcrop
    for (const [cx, cz, s] of [[24, -14, 1.4], [25.6, -12.6, .9], [22.8, -12.2, 1.1]]) add(new THREE.ConeGeometry(.7 * s, 2.4 * s, 5), 'crystal', cx, 1.1 * s, cz, { mat: { emissive: 0x1780b0, emissiveIntensity: .8 }, hp: 180, radius: 1.2 });
    // lava vent ring (hazard decoration)
    add(new THREE.CylinderGeometry(1.6, 2, .5, 9), 'lava', -30, .25, 34, { mat: { emissive: 0xff5a1c, emissiveIntensity: .55 } });

    // --- Secret Place 1: Ancient Temple Ruins (Top-Left, around x = -48, z = 48) ---
    add(new THREE.BoxGeometry(8, 3.2, 1.2), 'brick', -48, 1.6, 44, { hp: 350, radius: 4 });
    add(new THREE.BoxGeometry(8, 3.2, 1.2), 'brick', -48, 1.6, 52, { hp: 350, radius: 4 });
    add(new THREE.BoxGeometry(1.2, 3.2, 8), 'brick', -52, 1.6, 48, { hp: 350, radius: 4 });

    // --- Secret Place 2: Crystal Sanctuary (Bottom-Right, around x = 48, z = -48) ---
    const s2CrystalMat = this.materials.building('crystal', { emissive: 0xff00ff, emissiveIntensity: 1.0 });
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 3) {
      const cx = 48 + Math.cos(angle) * 4.5;
      const cz = -48 + Math.sin(angle) * 4.5;
      const c = new THREE.Mesh(new THREE.ConeGeometry(.8, 3.2, 5), s2CrystalMat);
      c.position.set(cx, 1.6 + this.heightAt(cx, cz), cz);
      c.castShadow = c.receiveShadow = true;
      this.scene.add(c);
      const d = { id: crypto.randomUUID(), type: 'prop', subtype: 'crystal', group: c, hp: 250, maxHp: 250, radius: 1.2, dead: false };
      c.userData.entity = d;
      this.destructibles.push(d);
    }

    // --- Secret Place 3: Concrete Fort (Top-Right, around x = 50, z = 44) ---
    add(new THREE.BoxGeometry(10, 3, 1.5), 'concrete', 50, 1.5, 40, { hp: 500, radius: 5 });
    add(new THREE.BoxGeometry(1.5, 3, 8), 'concrete', 45, 1.5, 44, { hp: 500, radius: 4 });
    add(new THREE.BoxGeometry(1.5, 3, 8), 'concrete', 55, 1.5, 44, { hp: 500, radius: 4 });
  }
  createTree(x, z, scale) {
    const group = new THREE.Group(); group.position.set(x, this.heightAt(x, z), z); group.scale.setScalar(scale);
    const trunkMat=this.map.id==='wilds'?this.materials.building('tree_bark',{repeat:2}):this.materials.wood; const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.35, .5, 2.9, 6), trunkMat); trunk.position.y = 1.45; trunk.castShadow = true; group.add(trunk);
    for (const [dx, dy, dz, s] of [[0, 3.3, 0, 1.5], [-.7, 2.8, .2, 1], [.65, 2.85, -.2, 1.1]]) { const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), this.materials.treeCrown); crown.position.set(dx, dy, dz); crown.castShadow = true; group.add(crown); }
    const d = { id: crypto.randomUUID(), type: 'prop', subtype: 'tree', group, hp: 85, maxHp: 85, radius: 1.1 * scale, dead: false }; group.traverse(o => { if (o.isMesh) o.userData.entity = d; }); this.destructibles.push(d); this.scene.add(group);
  }
  createRock(x, z, scale) { const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(scale, 0), this.materials.stone); rock.position.set(x, this.heightAt(x, z) + scale * .55, z); rock.scale.y = .65; rock.rotation.set(Math.random(), Math.random(), Math.random()); rock.castShadow = rock.receiveShadow = true; const d = { id: crypto.randomUUID(), type: 'prop', subtype: 'rock', group: rock, hp: 140, maxHp: 140, radius: scale, dead: false }; rock.userData.entity = d; this.destructibles.push(d); this.scene.add(rock); }
  buildInteractives() {
    const bunkerPos=new THREE.Vector3(12,this.heightAt(12,24),24);this.bunker=this.factory.createBunker(bunkerPos);this.interactiveStructures.push(this.bunker);
    for(const [x,z,r] of [[-33,-18,.45],[31,-29,-.8],[-38,34,2.25],[37,27,-2.4]]){
      this.motorcycles.push(this.factory.createMotorcycle(new THREE.Vector3(x,this.heightAt(x,z),z),r));
    }
  }
  buildThemedContent(){
    if(this.map.id==='crossroads')this.buildCity();
    else if(this.map.id==='wilds')this.buildJungleRuins();
    else if(this.map.id==='rift')this.buildVolcanicFoundry();
    else if(this.map.id==='sunken')this.buildSunkenCrown();
    else if(this.map.id==='serpent')this.buildSerpentSpine();
    else if(this.map.id==='eclipse')this.buildEclipseSanctum();
    else this.buildSummitArena();
  }
  themedProp(geometry,texture,x,z,y=0,hp=420,radius=2,options={}){
    const object=new THREE.Mesh(geometry,this.materials.building(texture,options));object.position.set(x,this.heightAt(x,z)+y,z);object.castShadow=object.receiveShadow=true;this.scene.add(object);
    const entity={id:crypto.randomUUID(),type:'prop',subtype:texture,group:object,hp,maxHp:hp,radius,dead:false,jellyStrength:.35};object.userData.entity=entity;this.destructibles.push(entity);return object;
  }
  buildCity(){
    const asphalt=this.materials.building('asphalt',{repeat:14}),lines=this.materials.building('road_lines',{repeat:8});
    for(const x of [-42,-14,14,42]){const road=new THREE.Mesh(new THREE.PlaneGeometry(10,150),asphalt);road.rotation.x=-Math.PI/2;road.position.set(x,.08,0);this.scene.add(road)}
    for(const z of [-42,-14,14,42]){const road=new THREE.Mesh(new THREE.PlaneGeometry(150,10),z===14?lines:asphalt);road.rotation.x=-Math.PI/2;road.position.set(0,.09,z);this.scene.add(road)}
    const palette=['urban_brick','neon_concrete','corrugated_steel','city_glass'];let n=0;
    for(const x of [-56,-28,0,28,56])for(const z of [-56,-28,0,28,56]){if(this.nearBase(x,z,16)||Math.hypot(x,z)<10)continue;const h=6+((n*7)%13),w=8+(n%3)*2,d=8+((n+1)%3)*2;this.themedProp(new THREE.BoxGeometry(w,h,d),palette[n%palette.length],x,z,h/2,480+h*25,Math.max(w,d)*.45,{repeat:3});const roof=new THREE.Mesh(new THREE.BoxGeometry(w+1,.35,d+1),this.materials.building('rooftop'));roof.position.set(x,this.heightAt(x,z)+h+.2,z);this.scene.add(roof);n++}
    const carSpots=[[-42,-25,0],[-42,26,Math.PI],[14,-31,0],[14,32,Math.PI],[41,0,Math.PI/2],[-10,42,-Math.PI/2],[-14,5,0],[42,51,Math.PI]];
    carSpots.forEach(([x,z,r],i)=>this.cars.push(this.factory.createCar(new THREE.Vector3(x,this.heightAt(x,z),z),r,[0x39a8ff,0xff4f66,0xffcc38,0x65e27c][i%4])));
    for(const [x,z,r] of [[-5,-14,.2],[32,14,2.8],[-28,42,-1.2]])this.motorcycles.push(this.factory.createMotorcycle(new THREE.Vector3(x,this.heightAt(x,z),z),r));
  }
  buildSummitArena(){for(let i=0;i<14;i++){const a=i/14*Math.PI*2,r=22+i%3*4,x=Math.cos(a)*r,z=Math.sin(a)*r;const wall=this.themedProp(new THREE.BoxGeometry(5,2.4,.8),'summit_stone',x,z,1.2,260,2.6);wall.rotation.y=-a}}
  buildJungleRuins(){for(let i=0;i<18;i++){const a=i/18*Math.PI*2,r=18+(i%4)*9,x=Math.cos(a)*r,z=Math.sin(a)*r;const pillar=this.themedProp(new THREE.BoxGeometry(2,5+(i%3),2),'moss_stone',x,z,2.5+(i%3)/2,330,1.3,{repeat:2});pillar.rotation.y=a*.7}}
  buildVolcanicFoundry(){
    const lava=new THREE.Mesh(new THREE.RingGeometry(13,27,64),this.materials.building('lava_crust',{emissive:0xff3d00,emissiveIntensity:.85}));lava.rotation.x=-Math.PI/2;lava.position.y=this.heightAt(0,0)+.08;this.scene.add(lava);
    for(let i=0;i<12;i++){const a=i/12*Math.PI*2,r=34,x=Math.cos(a)*r,z=Math.sin(a)*r;const tower=this.themedProp(new THREE.CylinderGeometry(2.2,3,7,8),'corrugated_steel',x,z,3.5,520,3,{repeat:2});tower.rotation.y=a}
  }
  buildSunkenCrown(){
    const walls=[[-28,-18,22,2,0],[-28,18,22,2,0],[28,-18,22,2,0],[28,18,22,2,0],[-58,5,18,2,.5],[58,5,18,2,-.5]];
    for(const [x,z,w,h,r] of walls){const wall=this.themedProp(new THREE.BoxGeometry(w,4.5,1.5),'moss_stone',x,z,2.25,620,w*.5,{repeat:3});wall.rotation.y=r;}
    for(let level=0;level<4;level++){const size=30-level*5,y=level*1.6;const terrace=new THREE.Mesh(new THREE.BoxGeometry(size,1.5,size),this.materials.building(level%2?'moss_stone':'sandstone',{repeat:4}));terrace.position.set(0,this.heightAt(0,0)+y,0);terrace.receiveShadow=terrace.castShadow=true;this.scene.add(terrace);}
    for(const [x,z] of [[-66,-6],[66,-6],[-24,58],[24,58],[-25,-52],[25,-52]])for(let y=0;y<3;y++){const arch=this.themedProp(new THREE.BoxGeometry(y===2?10:2.2,y===2?2:8,2.2),'moss_stone',x+(y===1?7:0),z,y===2?8:4,480,2);if(y===2)arch.position.x=x+3.5;}
    for(let i=0;i<32;i++){const a=i/32*Math.PI*2,r=42+(i%4)*10,x=Math.cos(a)*r,z=Math.sin(a)*r;if(!this.nearBase(x,z,14))this.createTree(x,z,1.2+(i%3)*.22);}
  }
  buildSerpentSpine(){
    for(let i=-8;i<=8;i++){const x=i*10,z=Math.sin(i*.68)*14,y=4+Math.cos(i*.5)*2;const segment=this.themedProp(new THREE.CylinderGeometry(3.2,4.2,7,8),'moss_stone',x,z,y,650,4,{repeat:2});segment.rotation.z=Math.PI/2;segment.rotation.y=i*.25;}
    for(const [x,z,r] of [[-62,-42,.35],[-50,44,-.5],[0,-47,0],[48,43,.55],[64,-35,-.4]]){for(const side of [-1,1]){const p=this.themedProp(new THREE.BoxGeometry(2.6,10,2.6),'sandstone',x+side*5,z,5,520,1.7);p.rotation.y=r;}const lintel=this.themedProp(new THREE.BoxGeometry(13,2.2,3),'moss_stone',x,z,10.2,600,6);lintel.rotation.y=r;}
    for(let i=0;i<18;i++){const a=i/18*Math.PI*2,x=Math.cos(a)*24,z=Math.sin(a)*24;const fang=this.themedProp(new THREE.ConeGeometry(1.5,7,5),'marble',x,z,3.5,330,1.6);fang.rotation.z=(i%2?.18:-.18);}
  }
  buildEclipseSanctum(){
    for(let ring=0;ring<3;ring++){const count=12+ring*4,radius=25+ring*18;for(let i=0;i<count;i++){if(i%(4+ring)===0)continue;const a=i/count*Math.PI*2,x=Math.cos(a)*radius,z=Math.sin(a)*radius;const wall=this.themedProp(new THREE.BoxGeometry(8-ring,4+ring,1.5),'moss_stone',x,z,2+ring*.5,520,4);wall.rotation.y=-a;}}
    for(let i=0;i<8;i++){const a=i/8*Math.PI*2,x=Math.cos(a)*68,z=Math.sin(a)*68;const legs=this.themedProp(new THREE.BoxGeometry(5,11,5),'marble',x,z,5.5,900,3);legs.rotation.y=-a;const torso=this.themedProp(new THREE.BoxGeometry(8,9,4),'sandstone',x,z,15,900,4);torso.rotation.y=-a;const head=this.themedProp(new THREE.DodecahedronGeometry(3.4),'moss_stone',x,z,22,600,3.5);head.rotation.y=-a;}
    const altar=new THREE.Mesh(new THREE.CylinderGeometry(13,17,3,12),this.materials.building('marble',{repeat:3}));altar.position.set(0,this.heightAt(0,0)+1.5,0);altar.castShadow=altar.receiveShadow=true;this.scene.add(altar);
  }
  dominationTowerPlans(){
    if(this.map.id==='serpent')return [['FANG',-70,-22],['COIL',-46,28],['HEART',-22,-10],['CROWN',0,18],['SCALE',25,-13],['TEMPLE',49,30],['TAIL',72,-24]];
    if(this.map.id==='eclipse')return [['DAWN',0,-54],['TITAN',52,-18],['DUSK',32,46],['MOON',-32,46],['ABYSS',-52,-18]];
    return [['SUN',0,0],['ROOT',-48,-28],['FLOOD',48,-28],['JAGUAR',-42,38],['SKY',42,38]];
  }
  createDominationTowers(){
    const neutral=0x090b10;
    this.dominationTowers=this.dominationTowerPlans().map(([label,x,z],index)=>{
      const position=new THREE.Vector3(x,this.heightAt(x,z),z),group=new THREE.Group();group.position.copy(position);group.name=`domination-tower-${label.toLowerCase()}`;
      const pedestalMat=new THREE.MeshStandardMaterial({color:neutral,roughness:.72,metalness:.28,emissive:0x000000,emissiveIntensity:.9});
      const pedestal=new THREE.Mesh(new THREE.CylinderGeometry(5.2,6.3,1.1,12),pedestalMat);pedestal.position.y=.55;pedestal.castShadow=pedestal.receiveShadow=true;group.add(pedestal);
      const steps=new THREE.Mesh(new THREE.CylinderGeometry(6.8,7.4,.35,12),this.materials.building('moss_stone'));steps.position.y=.18;steps.receiveShadow=true;group.add(steps);
      const spireMat=pedestalMat.clone();const spire=new THREE.Mesh(new THREE.CylinderGeometry(.7,1.5,9,8),spireMat);spire.position.y=5.5;spire.castShadow=true;group.add(spire);
      const crown=new THREE.Mesh(new THREE.OctahedronGeometry(1.4),spireMat);crown.position.y=10.5;crown.rotation.z=Math.PI/4;group.add(crown);
      const ringMat=new THREE.MeshBasicMaterial({color:neutral,transparent:true,opacity:.82,side:THREE.DoubleSide,depthWrite:false});const ring=new THREE.Mesh(new THREE.RingGeometry(4.65,5.15,48),ringMat);ring.rotation.x=-Math.PI/2;ring.position.y=1.15;group.add(ring);
      const beamMat=new THREE.MeshBasicMaterial({color:neutral,transparent:true,opacity:.09,depthWrite:false,side:THREE.DoubleSide});const beam=new THREE.Mesh(new THREE.CylinderGeometry(2.1,3.6,24,16,1,true),beamMat);beam.position.y=12;group.add(beam);
      for(let i=0;i<4;i++){const a=i*Math.PI/2;const flame=new THREE.Mesh(new THREE.ConeGeometry(.22,.9,5),new THREE.MeshBasicMaterial({color:neutral}));flame.position.set(Math.cos(a)*4.7,1.8,Math.sin(a)*4.7);group.add(flame);}
      this.scene.add(group);return{id:`tower-${index}`,label,position,radius:5.2,group,pedestalMat,spireMat,ringMat,beamMat,ownerTeam:null,captureTeam:null,captureProgress:0,contested:false};
    });
  }
  buildDecorations() {
    // 1. Generate Dirt Roads
    const bridge1 = new THREE.Vector3(-18, 0, 3);
    const bridge2 = new THREE.Vector3(24, 0, 3);
    for (const t of this.teams) {
      const base = this.basePositions[t.id];
      const targetBridge = base.distanceToSquared(bridge1) < base.distanceToSquared(bridge2) ? bridge1 : bridge2;
      this.createRoad(base, targetBridge);
      this.createRoad(targetBridge, this.cavePosition);
    }
    
    // 2. Generate Farm Fences
    // Fence 1: L-shape near Southwest sheep
    this.createFenceLine(new THREE.Vector3(-14, 0, 18), new THREE.Vector3(-4, 0, 26));
    this.createFenceLine(new THREE.Vector3(-4, 0, 26), new THREE.Vector3(-12, 0, 32));
    // Fence 2: L-shape near Southeast sheep
    this.createFenceLine(new THREE.Vector3(8, 0, -32), new THREE.Vector3(16, 0, -32));
    this.createFenceLine(new THREE.Vector3(16, 0, -32), new THREE.Vector3(16, 0, -24));
    // Fence 3: L-shape near Northwest sheep
    this.createFenceLine(new THREE.Vector3(-34, 0, -18), new THREE.Vector3(-28, 0, -18));
    this.createFenceLine(new THREE.Vector3(-28, 0, -18), new THREE.Vector3(-28, 0, -10));

    // 3. Dense Tree Border forest
    const random = this.seeded(9981);
    for (let i = 0; i < 90; i++) {
      const angle = random() * Math.PI * 2;
      const radius = 68 + random() * 10;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (Math.abs(z - 3) < 8 || Math.abs(x) > 78 || Math.abs(z) > 78) continue;
      if (this.nearBase(x, z, 12)) continue;
      this.createTree(x, z, 0.6 + random() * 0.7);
    }
  }
  createRoad(p1, p2, width = 2.8) {
    const dir = p2.clone().sub(p1);
    const dist = dir.length();
    const segments = Math.max(2, Math.ceil(dist / 1.8));
    const geo = new THREE.PlaneGeometry(width, dist, 1, segments);
    geo.rotateX(-Math.PI / 2);
    const posAttr = geo.attributes.position;
    const forward = dir.clone().normalize();
    const right = new THREE.Vector3(-forward.z, 0, forward.x).normalize();
    for (let j = 0; j < posAttr.count; j++) {
      const localX = posAttr.getX(j);
      const localZ = posAttr.getZ(j);
      const t = (localZ + dist/2) / dist;
      const worldPt = p1.clone().addScaledVector(forward, t * dist).addScaledVector(right, localX);
      const y = this.heightAt(worldPt.x, worldPt.z) + 0.035;
      posAttr.setX(j, worldPt.x);
      posAttr.setY(j, y);
      posAttr.setZ(j, worldPt.z);
    }
    geo.computeVertexNormals();
    const road = new THREE.Mesh(geo, this.materials.dirt);
    road.receiveShadow = true;
    this.scene.add(road);
  }
  createFenceLine(p1, p2) {
    const dir = p2.clone().sub(p1);
    const dist = dir.length();
    const spacing = 3.2;
    const postsCount = Math.max(2, Math.floor(dist / spacing) + 1);
    const posts = [];
    for (let i = 0; i < postsCount; i++) {
      const t = i / (postsCount - 1);
      const pos = p1.clone().addScaledVector(dir, t);
      pos.y = this.heightAt(pos.x, pos.z);
      posts.push(pos);
      const postGeo = new THREE.BoxGeometry(0.2, 1.3, 0.2);
      const postMesh = new THREE.Mesh(postGeo, this.materials.wood);
      postMesh.position.copy(pos).add(new THREE.Vector3(0, 0.65, 0));
      postMesh.castShadow = true;
      postMesh.receiveShadow = true;
      this.scene.add(postMesh);
    }
    for (let i = 0; i < posts.length - 1; i++) {
      const mid = posts[i].clone().add(posts[i+1]).multiplyScalar(0.5);
      const length = posts[i].distanceTo(posts[i+1]);
      const diff = posts[i+1].clone().sub(posts[i]);
      const angle = Math.atan2(diff.x, diff.z);
      for (const ry of [0.35, 0.85]) {
        const railGeo = new THREE.BoxGeometry(0.08, 0.12, length);
        const railMesh = new THREE.Mesh(railGeo, this.materials.wood);
        railMesh.position.copy(mid).add(new THREE.Vector3(0, ry, 0));
        railMesh.rotation.y = angle;
        railMesh.castShadow = true;
        railMesh.receiveShadow = true;
        this.scene.add(railMesh);
      }
    }
  }
  createSandbags(position, rotation) { const group = new THREE.Group(); group.position.copy(position); group.rotation.y = rotation; for (let i = -2; i <= 2; i++) for (let y = 0; y < 2; y++) { const bag = new THREE.Mesh(new THREE.CapsuleGeometry(.42, .75, 2, 5), this.materials.building('sandstone')); bag.rotation.z = Math.PI / 2; bag.position.set(i * .82 + (y ? .4 : 0), .45 + y * .55, 0); bag.castShadow = true; group.add(bag); } const d = { id: crypto.randomUUID(), type: 'prop', subtype: 'sandbags', group, hp: 220, maxHp: 220, radius: 2.7, dead: false }; group.traverse(o => { if (o.isMesh) o.userData.entity = d; }); this.destructibles.push(d); this.scene.add(group); }
  createDropMarker(x, z, color = 0xff263d) {
    const marker = new THREE.Group(); marker.position.set(x, this.heightAt(x, z) + .07, z);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .82, depthWrite: false });
    for (const a of [Math.PI / 4, -Math.PI / 4]) { const bar = new THREE.Mesh(new THREE.BoxGeometry(4.8, .06, .38), mat); bar.rotation.y = a; marker.add(bar); }
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.8, 3.05, 32), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: .65, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; marker.add(ring);
    this.scene.add(marker); return marker;
  }
  // Literal free-falling supply boxes: the zone chooses a clear point on its pad,
  // then gravity, bounce, terrain slope, angular momentum and crate collisions take over.
  airdropCrate(type = CRATE_TYPES.brown, random = Math.random, zone = null) {
    // Backward-compatible function-only signature for older callers.
    if (typeof type === 'function') { random = type; type = rollCrateType(random); }
    if (typeof type === 'string') type = CRATE_TYPES[type] || CRATE_TYPES.brown;
    if (!zone) {
      const eligible = this.crateDropZones.filter(candidate => candidate.types.includes(type.id));
      zone = eligible[Math.floor(random() * eligible.length)] || null;
    }
    let x, z;
    if (zone) {
      let best = null, bestClearance = -Infinity;
      for (let attempt = 0; attempt < 7; attempt++) {
        const angle = random() * Math.PI * 2, radius = Math.sqrt(random()) * zone.radius;
        const candidate = { x: zone.position.x + Math.cos(angle) * radius, z: zone.position.z + Math.sin(angle) * radius };
        const clearance = this.crates.reduce((nearest, crate) => Math.min(nearest, Math.hypot(crate.group.position.x - candidate.x, crate.group.position.z - candidate.z)), Infinity);
        if (clearance > bestClearance) { best = candidate; bestClearance = clearance; }
        if (clearance > 1.65) break;
      }
      ({ x, z } = best);
    } else { x = random() * 120 - 60; z = random() * 120 - 60; }
    const crate = this.factory.createCrate(new THREE.Vector3(x, 22 + random() * 10, z), type);
    crate.sourceDropZoneId = zone?.id || null; crate.falling = true; crate.physicsActive = true; crate.grounded = false;
    crate.velocity.set((random() - .5) * 3.2, -1.5 - random() * 1.5, (random() - .5) * 3.2);
    crate.angularVelocity.set((random() - .5) * 5, (random() - .5) * 4, (random() - .5) * 5).multiplyScalar(1 / Math.sqrt(crate.mass));
    crate.visual?.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    crate.dropMarker = this.createDropMarker(x, z, type.color); this.crates.push(crate);
    if (zone?.visual) zone.visual.flash = 1;
    return crate;
  }
  countCratesForDropZone(zone, type) { return this.crates.filter(crate => crate.sourceDropZoneId === zone.id && crate.originalType?.id === type).length; }
  updateCrateDrops(dt) {
    if (!this.crateDropScheduler) return [];
    return this.crateDropScheduler.update(dt, (zone, type) => this.countCratesForDropZone(zone, type), (zone, type) => this.airdropCrate(type, Math.random, zone));
  }
  nextCrateDrop(rareOnly = false) { return this.crateDropScheduler?.next(rareOnly ? RARE_DROP_TYPES : null) || null; }
  crateContactOffset(crate) {
    const body = crate.visual || crate.group, h = crate.halfExtent || .575;
    const e = new THREE.Matrix4().makeRotationFromEuler(body.rotation).elements;
    return h * (Math.abs(e[1]) + Math.abs(e[5]) + Math.abs(e[9]) - 1);
  }
  launchCrate(crate, origin, direction, carrierVelocity = null) {
    const mass = crate.originalType?.mass || crate.mass || 1, impulse = 12 / Math.sqrt(mass);
    crate.carried = false; crate.placed = false; crate.solid = false; crate.falling = true; crate.physicsActive = true; crate.grounded = false;
    crate.group.position.copy(origin).addScaledVector(direction, 1.1); crate.group.position.y += 1.1;
    crate.velocity.copy(direction).multiplyScalar(impulse); crate.velocity.y = 7 / Math.pow(mass, .22); if (carrierVelocity) crate.velocity.addScaledVector(carrierVelocity, .35);
    crate.angularVelocity.set((Math.random()-.5)*8, (Math.random()-.5)*5, (Math.random()-.5)*8).multiplyScalar(1/Math.sqrt(mass));
  }
  update(time, dt = 0, particles = null) {
    this.waterMaterial.uniforms.uTime.value = time;
    for(const [i,tower] of this.dominationTowers.entries()){
      tower.group.children[3].rotation.y=time*(1.1+i*.04);
      tower.ringMat.opacity=tower.contested?.95:.58+Math.sin(time*4+i)*.18;
      tower.beamMat.opacity=(tower.ownerTeam?.14:.055)+(tower.captureProgress/5)*.18;
      tower.group.scale.y=1+Math.sin(time*2.2+i)*.008;
    }
    for (const zone of this.crateDropZones) {
      const visual = zone.visual; if (!visual) continue;
      visual.spinner.rotation.z = time * (zone.kind === 'rare' ? 1.2 : .65);
      visual.beam.material.opacity = (zone.kind === 'rare' ? .075 : .04) + Math.sin(time * 2.4 + zone.position.x) * .018 + (visual.flash || 0) * .16;
      visual.beam.scale.x = visual.beam.scale.z = .92 + Math.sin(time * 1.8) * .08;
      visual.flash = Math.max(0, (visual.flash || 0) - dt * 1.7);
      for (let i = 0; i < visual.pylons.length; i++) visual.pylons[i].userData.lamp.material.opacity = .5 + Math.sin(time * 5 - i * .8) * .35;
      if (zone.kind === 'rare') {
        if (visual.core) {
          visual.core.rotation.y = time * 0.8;
          visual.core.rotation.x = time * 0.45;
          visual.core.position.y = 1.4 + Math.sin(time * 2.0) * 0.15;
        }
        if (visual.orbitals) {
          visual.orbitals.forEach((orb, idx) => {
            const angle = time * -1.4 + idx * Math.PI * 2 / 3;
            orb.position.set(Math.cos(angle) * 1.4, 1.4 + Math.sin(time * 2.0 + idx) * 0.08, Math.sin(angle) * 1.4);
            orb.rotation.y = time * -2.0;
          });
        }
        if (visual.spinner2) {
          visual.spinner2.rotation.z = time * -1.8;
        }
      }
    }
    for (const c of this.crates) {
      const ground = this.heightAt(c.group.position.x, c.group.position.z);
      if (c.dropMarker) { const pulse=.88+Math.sin(time*5)*.12;c.dropMarker.scale.setScalar(pulse);c.dropMarker.rotation.y=time*.35; }
      if (c.carried || c.placed) continue;
      if (c.physicsActive) {
        const body = c.visual || c.group;
        const sample=.35,dx=(this.heightAt(c.group.position.x+sample,c.group.position.z)-this.heightAt(c.group.position.x-sample,c.group.position.z))/(sample*2),dz=(this.heightAt(c.group.position.x,c.group.position.z+sample)-this.heightAt(c.group.position.x,c.group.position.z-sample))/(sample*2);
        c.velocity.x-=dx*8*dt;c.velocity.z-=dz*8*dt;c.velocity.y-=22*dt;c.group.position.addScaledVector(c.velocity,dt);
        body.rotation.x+=c.angularVelocity.x*dt;body.rotation.y+=c.angularVelocity.y*dt;body.rotation.z+=c.angularVelocity.z*dt;
        const landedAt=this.heightAt(c.group.position.x,c.group.position.z)+this.crateContactOffset(c);
        if(c.group.position.y<=landedAt){const impact=-c.velocity.y;c.group.position.y=landedAt;c.grounded=true;c.falling=false;if(impact>2.5){c.velocity.y=impact*(.28/Math.pow(c.mass||1,.15));c.angularVelocity.x+=(Math.random()-.5)*impact*.08;c.angularVelocity.z+=(Math.random()-.5)*impact*.08;if(particles){particles.impact(c.group.position.clone().add(new THREE.Vector3(0,.15,0)),c.crateType.color);if(this.isWater(c.group.position))particles.waterSplash(c.group.position,5.5,16,1.2)}}else c.velocity.y=0;
          const friction=Math.pow(.18+Math.min(.3,(c.mass||1)*.045),dt);c.velocity.x*=friction;c.velocity.z*=friction;c.angularVelocity.lerp(new THREE.Vector3(c.velocity.z/.72,0,-c.velocity.x/.72),Math.min(1,dt*7));
          if(c.velocity.lengthSq()<.025&&c.angularVelocity.lengthSq()<.08){c.physicsActive=false;c.velocity.set(0,0,0);c.angularVelocity.set(0,0,0)}
          if(c.dropMarker){this.scene.remove(c.dropMarker);c.dropMarker=null}
        }
        this.clamp(c.group.position);
      } else c.group.position.y=ground+this.crateContactOffset(c);
    }
    this.resolveCrateCollisions();
    for (const p of this.pickups) {
      const ground=this.heightAt(p.group.position.x,p.group.position.z)+.05;
      if(p.physicsActive){p.velocity.y-=18*dt;p.group.position.addScaledVector(p.velocity,dt);p.group.rotation.x+=p.angularVelocity.x*dt;p.group.rotation.y+=p.angularVelocity.y*dt;p.group.rotation.z+=p.angularVelocity.z*dt;if(p.group.position.y<=ground){p.group.position.y=ground;if(Math.abs(p.velocity.y)>1.2){p.velocity.y=Math.abs(p.velocity.y)*.34;p.velocity.x*=.72;p.velocity.z*=.72}else{p.physicsActive=false;p.velocity.set(0,0,0);p.group.rotation.x=0;p.group.rotation.z=0}}}
      else{p.group.position.y=ground;p.group.rotation.y+=dt*2.4}
      const aura=p.group.userData.pickupAura,arrow=p.group.userData.pickupArrow;if(aura){aura.material.opacity=.1+Math.abs(Math.sin(time*6))*.22;aura.scale.setScalar(.9+Math.sin(time*5)*.16)}if(arrow){arrow.position.y=2.15+Math.abs(Math.sin(time*5))*.55;arrow.rotation.y+=dt*3.5;arrow.visible=Math.sin(time*10)>.15}
    }
    
    // Update wobble jelly animations for destructibles and bases
    const wobbleItems = [...this.destructibles, ...this.interactiveStructures, ...Object.values(this.factories), ...Object.values(this.baseTurrets||{})];
    for (const target of wobbleItems) {
      if (target.dead || !target.originalScale) continue;
      const strength=target.jellyStrength??1;
      const k_scale = 180 / Math.max(.2,strength);
      const c_scale = 10;
      
      const accY = -k_scale * target.wobbleScaleY - c_scale * target.wobbleScaleYVel;
      target.wobbleScaleYVel += accY * dt;
      target.wobbleScaleY += target.wobbleScaleYVel * dt;
      
      const accX = -k_scale * target.wobbleScaleX - c_scale * target.wobbleScaleXVel;
      target.wobbleScaleXVel += accX * dt;
      target.wobbleScaleX += target.wobbleScaleXVel * dt;
      
      const accZ = -k_scale * target.wobbleScaleZ - c_scale * target.wobbleScaleZVel;
      target.wobbleScaleZVel += accZ * dt;
      target.wobbleScaleZ += target.wobbleScaleZVel * dt;
      
      const k_tilt = 140;
      const c_tilt = 8;
      const accTilt = -k_tilt * target.wobbleTilt - c_tilt * target.wobbleTiltVel;
      target.wobbleTiltVel += accTilt * dt;
      target.wobbleTilt += target.wobbleTiltVel * dt;
      
      target.group.scale.set(
        target.originalScale.x * (1 + target.wobbleScaleX * strength),
        target.originalScale.y * (1 + target.wobbleScaleY * strength),
        target.originalScale.z * (1 + target.wobbleScaleZ * strength)
      );
      
      const tiltQuat = new THREE.Quaternion().setFromAxisAngle(target.wobbleTiltAxis, target.wobbleTilt * strength);
      target.group.quaternion.copy(target.originalQuaternion).premultiply(tiltQuat);
    }
  }
  resolveCrateCollisions() {
    const crates = this.crates.filter(crate => !crate.carried);
    for (let i = 0; i < crates.length; i++) for (let j = i + 1; j < crates.length; j++) {
      const a = crates[i], b = crates[j];
      if ((!a.physicsActive && !b.physicsActive) || (a.placed && b.placed)) continue;
      const dy = (a.group.position.y + .575) - (b.group.position.y + .575); if (Math.abs(dy) > 1.12) continue;
      let dx = a.group.position.x - b.group.position.x, dz = a.group.position.z - b.group.position.z;
      let distance = Math.hypot(dx, dz), minDistance = 1.08; if (distance >= minDistance) continue;
      if (distance < .001) { dx = .001; dz = 0; distance = .001; }
      const nx = dx / distance, nz = dz / distance, invA = a.placed ? 0 : 1 / (a.mass || 1), invB = b.placed ? 0 : 1 / (b.mass || 1), invTotal = invA + invB;
      if (!invTotal) continue;
      const correction = (minDistance - distance + .005) / invTotal;
      if (invA) { a.group.position.x += nx * correction * invA; a.group.position.z += nz * correction * invA; }
      if (invB) { b.group.position.x -= nx * correction * invB; b.group.position.z -= nz * correction * invB; }
      const relativeSpeed = (a.velocity.x - b.velocity.x) * nx + (a.velocity.z - b.velocity.z) * nz;
      if (relativeSpeed < 0) {
        const impulse = -(1.32 * relativeSpeed) / invTotal;
        if (invA) { a.velocity.x += nx * impulse * invA; a.velocity.z += nz * impulse * invA; a.angularVelocity.z -= nx * impulse * .18; a.angularVelocity.x += nz * impulse * .18; }
        if (invB) { b.velocity.x -= nx * impulse * invB; b.velocity.z -= nz * impulse * invB; b.angularVelocity.z += nx * impulse * .18; b.angularVelocity.x -= nz * impulse * .18; }
      }
      if (invA) a.physicsActive = true;
      if (invB) b.physicsActive = true;
    }
  }
  resolveCollisions(entity) {
    if (entity.dead || entity.stationary) return;
    const pos = entity.group.position;
    const r1 = entity.radius || 0.72;

    // 1. Destructibles (rocks, trees, sandbags, neutral buildings)
    for (const obs of [...this.destructibles, ...this.interactiveStructures, ...Object.values(this.baseTurrets||{})]) {
      if (obs.dead) continue;
      const obsPos = obs.group.position;
      const dx = pos.x - obsPos.x;
      const dz = pos.z - obsPos.z;
      const distSq = dx * dx + dz * dz;
      const minDist = r1 + (obs.radius || 1);
      if (distSq < minDist * minDist) {
        const dist = Math.sqrt(distSq);
        if (dist > 0.001) {
          const overlap = minDist - dist;
          pos.x += (dx / dist) * overlap;
          pos.z += (dz / dist) * overlap;
        }
      }
    }

    // 2. Factories (bases)
    for (const f of Object.values(this.factories)) {
      if (f.dead || f === entity) continue;
      const fPos = f.group.position;
      const dx = pos.x - fPos.x;
      const dz = pos.z - fPos.z;
      const distSq = dx * dx + dz * dz;
      const minDist = r1 + (f.radius || 4);
      if (distSq < minDist * minDist) {
        const dist = Math.sqrt(distSq);
        if (dist > 0.001) {
          const overlap = minDist - dist;
          pos.x += (dx / dist) * overlap;
          pos.z += (dz / dist) * overlap;
        }
      }
    }

    // 3. Cave structure
    if (this.cavePosition) {
      const cPos = this.cavePosition;
      const dx = pos.x - cPos.x;
      const dz = pos.z - cPos.z;
      const distSq = dx * dx + dz * dz;
      const minDist = r1 + 4.5;
      if (distSq < minDist * minDist) {
        const dist = Math.sqrt(distSq);
        if (dist > 0.001) {
          const overlap = minDist - dist;
          pos.x += (dx / dist) * overlap;
          pos.z += (dz / dist) * overlap;
        }
      }
    }
  }
  // highest crate top directly under `position` (for unit-on-crate bounces)
  crateTopAt(position) {
    let top = null, hit = null;
    for (const c of this.crates) {
      if (c.carried) continue;
      const dx = position.x - c.group.position.x, dz = position.z - c.group.position.z;
      if (Math.abs(dx) > .85 || Math.abs(dz) > .85) continue;
      const t = c.group.position.y + 1.15;
      if (top === null || t > top) { top = t; hit = c; }
    }
    return top === null ? null : { top, crate: hit };
  }
  isWater(position) { return this.hasWater && Math.abs(position.z - 3) < 8.0 && !((Math.abs(position.x + 18) < 5.5) || (Math.abs(position.x - 24) < 5.5)); }
  clamp(position) { position.x = THREE.MathUtils.clamp(position.x, -this.bounds, this.bounds); position.z = THREE.MathUtils.clamp(position.z, -this.bounds, this.bounds); }
  seeded(seed) { return () => ((seed = Math.imul(seed, 1664525) + 1013904223 | 0) >>> 0) / 4294967296; }
  dispose() { this.waterMaterial.dispose(); }
}
