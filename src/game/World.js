import * as THREE from 'three';
import { createWaterMaterial } from './Materials.js';
import { rollCrateType, CRATE_TYPES } from '../data/gameData.js';
import { CrateDropScheduler, RARE_DROP_TYPES } from './CrateDropSystem.js';
import { mapById, DEATHMATCH_SECRET_PLANS } from '../data/maps.js';
import { MAP_SURFACE_THEMES } from '../data/mapSurfaces.js';
import { NavGrid } from './Navigation.js';

const blacksiteFormation = (centerX, centerZ, columns, rows, spacing, count = columns * rows) => Object.freeze(Array.from({length:count},(_,index)=>Object.freeze({
  x:centerX+((index%columns)-(columns-1)/2)*spacing,
  z:centerZ+(Math.floor(index/columns)-(rows-1)/2)*spacing,
})));

export const BLACKSITE_TRANSIT = Object.freeze({
  halfWidth: 86,
  gateHalfWidth: 17,
  blastGates: Object.freeze([Object.freeze({z:-94,x:-28}),Object.freeze({z:-50,x:28}),Object.freeze({z:-6,x:0}),Object.freeze({z:38,x:-28}),Object.freeze({z:82,x:28})]),
  // Mission squads deploy beyond the entrance blast gates, not on the generic
  // team-base ring outside the facility. These are complete starting rosters:
  // five player gunners and sixteen Blacksite defenders.
  playerSpawn: Object.freeze({x:24,z:68}),
  enemySpawn: Object.freeze({x:-20,z:-70}),
  playerDeployment: blacksiteFormation(24,68,3,2,3,5),
  enemyDeployment: blacksiteFormation(-20,-70,4,4,3,16),
  enemyWaveSpawns: Object.freeze([Object.freeze({x:-65,z:-75}),Object.freeze({x:65,z:-75})]),
  scientist: Object.freeze({x:61,z:-116}),
  extractionJet: Object.freeze({x:-55,z:104}),
  extraction: Object.freeze({x:-35,z:106}),
});

export function blacksiteBlastWallSegments(){const left=-BLACKSITE_TRANSIT.halfWidth,right=BLACKSITE_TRANSIT.halfWidth,gap=BLACKSITE_TRANSIT.gateHalfWidth;return BLACKSITE_TRANSIT.blastGates.flatMap(({z,x:opening},index)=>{const lw=opening-gap-left,rw=right-(opening+gap),segments=[];if(lw>0)segments.push({x:left+lw/2,z,w:lw,d:2.2,index});if(rw>0)segments.push({x:opening+gap+rw/2,z,w:rw,d:2.2,index});return segments})}

export class World {
  constructor(scene, materials, factory, mapId = 'crossroads', gameMode = 'deathmatch') { this.scene = scene; this.materials = materials; this.factory = factory; this.map = mapById(mapId); this.gameMode = gameMode; this.hasWater = Boolean(this.map.hasWater); this.waterMaterial = createWaterMaterial(materials.textures.water); this.destructibles = []; this.interactiveStructures = []; this.motorcycles = []; this.cars = []; this.vehicles = []; this.crates = []; this.wildlife = []; this.pickups = []; this.crateDropZones = []; this.dominationTowers = []; this.colliders = []; this.colliderCellSize=24;this.colliderIndex=new Map();this.colliderIndexDirty=true;this.secretPlaces = []; this.missionTargets=[]; this.teamCompounds = {}; this.bounds = gameMode === 'domination' ? 96 : (this.map.bounds || 234); }
  // teams: [{id, color, dark}] — a base + builder pad is raised for each one, spread on a ring
  build(teams = [{ id: 'blue', color: 0x2fb4ff, dark: 0x11638f }, { id: 'red', color: 0xff5062, dark: 0x8e2634 }]) {
    if(this.gameMode==='deathmatch'&&teams.length>(this.map.maxTeams||9))throw new RangeError(`${this.map.title} supports at most ${this.map.maxTeams} teams`);
    const atmospheres={crossroads:[0x342b5c,0x554c77,.009],crown:[0x9fd8ff,0xcbeaff,.006],wilds:[0x75c79a,0x8fc8a3,.013],rift:[0x5a2524,0x4b2425,.018],sunken:[0x4f9d78,0x6ca680,.008],serpent:[0x536b45,0x78905e,.011],eclipse:[0x241d45,0x493a68,.012],bootcamp:[0x5f8f9c,0x8cb0a6,.011],goldrush:[0x72502c,0xb38d55,.009],'gaia-bastion':[0x704d3d,0xa47d63,.007],'storm-dam':[0x263f52,0x597985,.012],sunforge:[0x30191c,0x5d2721,.014],'gaia-blacksite':[0x07121b,0x132731,.0065]},atmos=atmospheres[this.map.id]||atmospheres.crossroads;
    this.scene.background = new THREE.Color(atmos[0]); this.scene.fog = new THREE.FogExp2(atmos[1], this.gameMode==='deathmatch'?atmos[2]*.42:atmos[2]);
    this.teams = teams;
    // base ring: player team lands at the bottom of the map, others spread evenly
    const ringRadius = this.gameMode === 'domination' ? (teams.length <= 2 ? 84 : 80) : (this.map.baseRadius || 194);
    this.basePositions = {}; this.spawnPositions = {}; this.deploymentPositions = {}; this.builderPositions = {}; this.factories = {}; this.baseTurrets = {};
    teams.forEach((t, i) => {
      const angle = Math.PI / 2 + i / teams.length * Math.PI * 2;
      let x = Math.cos(angle) * ringRadius;
      let z = Math.sin(angle) * ringRadius;
      this.basePositions[t.id] = new THREE.Vector3(x, 0, z);
    });
    this.cavePosition = this.gameMode==='deathmatch'?new THREE.Vector3(0,0,-112):new THREE.Vector3(2,0,-12);
    this.planCrateDropZones();
    this.setupTerrain();
    const surfaceTheme = MAP_SURFACE_THEMES[this.map.id] || MAP_SURFACE_THEMES.wilds;
    const ground = new THREE.Mesh(this.terrainGeometry(), this.materials.surface(surfaceTheme.base.texture, surfaceTheme.base)); ground.name = 'generated-terrain-ground'; ground.receiveShadow = true; this.scene.add(ground);
    this.surfaceMeshes = [ground]; this.buildSurfaceDesign(surfaceTheme);
    if(this.hasWater){const water = new THREE.Mesh(new THREE.PlaneGeometry(180, 16, 48, 8), this.waterMaterial); water.rotation.x = -Math.PI / 2; water.position.set(0, .12, 3); water.renderOrder = 1; this.scene.add(water); this.water = water;this.createBridge(-18);this.createBridge(24)}
    for (const t of teams) {
      const base = this.basePositions[t.id];
      base.y = this.heightAt(base.x, base.z);
      this.createTeamCompound(t,base);
      this.factories[t.id] = this.factory.createFactory(t.id, base);
      const toCenter = base.clone().multiplyScalar(-1).setY(0).normalize();
      const side=new THREE.Vector3(-toCenter.z,0,toCenter.x);if(this.gameMode!=='campaign'){const turretPos=base.clone().addScaledVector(toCenter,9).addScaledVector(side,7.5);turretPos.y=this.heightAt(turretPos.x,turretPos.z);this.baseTurrets[t.id]=this.factory.createBaseTurret(t.id,turretPos);}
      const pad = base.clone().addScaledVector(toCenter, 11).addScaledVector(side, -8); pad.y = this.heightAt(pad.x, pad.z) + .18;
      this.spawnPositions[t.id] = pad;
      if(this.gameMode!=='domination'){this.builderPositions[t.id] = pad;this.createBuilderPad(pad, t.color, t.dark);}
    }
    // legacy two-team aliases used by the mission scripts
    this.blueFactory = this.factories[teams[0].id]; this.redFactory = this.factories[teams[1]?.id] || this.factories[teams[0].id];
    this.builderPosition = this.builderPositions[teams[0].id];
    if(this.gameMode!=='campaign')this.createCave(this.cavePosition);
    this.setupCrateDropZones();
    if(this.gameMode!=='campaign')this.dropOpeningCrates(this.map.id==='crown'?3:7);
    this.populate(); this.buildStructures(); this.buildInteractives(); this.buildDecorations(); this.buildThemedContent(); if(this.gameMode==='deathmatch')this.buildSecretPlaces(); if(this.gameMode==='domination')this.createDominationTowers();
    this.scene.updateMatrixWorld(true);this.rebuildColliderIndex();
    this.nav = new NavGrid(this); this.nav.rebuild(); return this;
  }
  // ── Team Buddies style rolling hills ───────────────────────────────────────
  setupTerrain() {
    const random = this.seeded(51377); this.hills = [];const extent=this.bounds*.94,hillCount=this.gameMode==='deathmatch'?82:28;
    for (let i = 0; i < hillCount; i++) this.hills.push({ x: random() * extent*2 - extent, z: random() * extent*2 - extent, h: 1.6 + random() * 4.2, r: 10 + random() * 18 });
    const bases = Object.values(this.basePositions);
    this.heightAt = (x, z) => {
      let h = Math.sin(x * .14 + 1.3) * Math.sin(z * .11 - .7) * .5 + .5;
      for (const hill of this.hills) { const dx = x - hill.x, dz = z - hill.z; h += hill.h * Math.exp(-(dx * dx + dz * dz) / (hill.r * hill.r)); }
      // flatten combat-critical zones: the river strip, every base, every supply
      // depot, and the cave approach
      let mask = this.hasWater ? THREE.MathUtils.smoothstep(Math.abs(z - 3), 8.5, 18) : 1;
      for (const b of bases) mask *= THREE.MathUtils.smoothstep(Math.hypot(x - b.x, z - b.z), 25, 37);
      for (const zone of this.crateDropZonePlans || []) mask *= THREE.MathUtils.smoothstep(Math.hypot(x - zone.position.x, z - zone.position.z), 6.5, 11);
      mask *= THREE.MathUtils.smoothstep(Math.hypot(x - this.cavePosition.x, z - this.cavePosition.z), 8, 15);
      let result=Math.max(0,h*mask);
      if(this.map.id==='crossroads')result*=.18;
      if(this.map.id==='crown'){const d=Math.hypot(x,z);result+=Math.max(0,17*(1-d/102));if(d<24)result=17.2;}
      if(this.map.id==='wilds')result+=Math.sin(x*.055)*Math.cos(z*.06)*1.2+1.3;
      if(this.map.id==='rift'){const d=Math.hypot(x,z);result+=Math.max(0,6-d*.027);}
      if(this.map.id==='sunken'){result+=1.2+Math.sin(x*.045)*Math.cos(z*.05)*2.1;for(const [tx,tz] of [[0,0],[-48,-28],[48,-28],[-42,38],[42,38]])result*=.72+.28*THREE.MathUtils.smoothstep(Math.hypot(x-tx,z-tz),5,12);}
      if(this.map.id==='serpent'){result+=2.2+Math.max(0,10-Math.abs(z+Math.sin(x*.045)*13)*.42)+Math.sin(x*.07)*1.4;}
      if(this.map.id==='eclipse'){const d=Math.hypot(x,z);result+=2.5+Math.max(0,9-d*.1)+Math.sin(x*.04)*Math.cos(z*.045)*2.8;}
      if(this.map.id==='gaia-blacksite')return 0;
      return Math.max(0,result);
    };
    // Height is queried by every moving unit, projectile and footstep. The
    // original procedural function evaluates dozens of exponential hills per
    // call, which becomes a frame-time hotspot in 40+ unit battles. Bake it
    // once and use bilinear samples; rendering and collision share this same
    // surface, so the approximation cannot cause visual/physics disagreement.
    const rawHeightAt=this.heightAt,step=2,margin=24,min=-this.bounds-margin,size=Math.ceil((this.bounds*2+margin*2)/step)+1,heights=new Float32Array(size*size);
    for(let z=0;z<size;z++)for(let x=0;x<size;x++)heights[z*size+x]=rawHeightAt(min+x*step,min+z*step);
    this.heightAt=(x,z)=>{const gx=(x-min)/step,gz=(z-min)/step;if(gx<0||gz<0||gx>=size-1||gz>=size-1)return rawHeightAt(x,z);const x0=Math.floor(gx),z0=Math.floor(gz),tx=gx-x0,tz=gz-z0,i=z0*size+x0,a=heights[i],b=heights[i+1],c=heights[i+size],d=heights[i+size+1];return(a+(b-a)*tx)+(c+(d-c)*tx-a-(b-a)*tx)*tz};
    this.heightField={step,min,size,heights};
  }
  terrainGeometry() {
    const size=this.gameMode==='domination'?214:this.bounds*2+32;const segments=this.gameMode==='domination'?120:180;const geo = new THREE.PlaneGeometry(size, size, segments, segments); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, this.heightAt(pos.getX(i), pos.getZ(i)));
    geo.computeVertexNormals(); return geo;
  }
  surfaceMaterial(layer) {
    const { texture, repeat, rotation, color, roughness, metalness, transparent, opacity, depthWrite, emissive, emissiveIntensity } = layer;
    return this.materials.surface(texture, { repeat, rotation, color, roughness, metalness, transparent, opacity, depthWrite, emissive, emissiveIntensity });
  }
  addSurfaceMesh(geometry, layer) {
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, this.surfaceMaterial(layer));
    mesh.name = `terrain-surface-${layer.texture}-${layer.kind}`; mesh.receiveShadow = true;
    if (layer.transparent) mesh.renderOrder = 1;
    this.scene.add(mesh); this.surfaceMeshes.push(mesh); return mesh;
  }
  surfaceHeight(x, z, layer) { return this.heightAt(x, z) + .045 + (layer.offset || 0); }
  buildSurfaceDesign(theme) {
    const scale=this.gameMode==='deathmatch'?(this.map.surfaceScale||1):1;
    for (const source of theme.layers) {
      const layer={...source};
      if(scale!==1){if(layer.center)layer.center=layer.center.map(v=>v*scale);if(layer.points)layer.points=layer.points.map(point=>point.map(v=>v*scale));if(layer.size)layer.size=layer.size.map(v=>v*scale);if(layer.radius)layer.radius*=scale;if(layer.innerRadius)layer.innerRadius*=scale;if(layer.outerRadius)layer.outerRadius*=scale;if(layer.width)layer.width*=scale;if(layer.repeat)layer.repeat=layer.repeat.map(v=>v*scale);}
      if (layer.kind === 'ribbon') this.createSurfaceRibbon(layer);
      else if (layer.kind === 'patch') this.createSurfacePatch(layer);
      else if (layer.kind === 'ring') this.createSurfaceRing(layer);
      else if (layer.kind === 'rect') this.createSurfaceRect(layer);
    }
  }
  createSurfacePatch(layer) {
    const segments = 48, bands = Math.max(3, Math.ceil(layer.radius / 3));
    const [cx, cz] = layer.center, random = this.seeded(layer.seed || 1), edge = [];
    const irregularity = layer.irregularity ?? .13;
    for (let i = 0; i < segments; i++) edge.push(1 + (random() - .5) * irregularity * 2);
    const positions = [cx, this.surfaceHeight(cx, cz, layer), cz], uvs = [.5, .5], indices = [];
    for (let band = 1; band <= bands; band++) {
      const t = band / bands;
      for (let i = 0; i < segments; i++) {
        const angle = i / segments * Math.PI * 2, radius = layer.radius * t * (1 + (edge[i] - 1) * t);
        const x = cx + Math.cos(angle) * radius, z = cz + Math.sin(angle) * radius;
        positions.push(x, this.surfaceHeight(x, z, layer), z);
        uvs.push(.5 + Math.cos(angle) * t * .5, .5 + Math.sin(angle) * t * .5);
      }
    }
    for (let i = 0; i < segments; i++) indices.push(0, 1 + i, 1 + (i + 1) % segments);
    for (let band = 1; band < bands; band++) {
      const inner = 1 + (band - 1) * segments, outer = 1 + band * segments;
      for (let i = 0; i < segments; i++) { const next = (i + 1) % segments; indices.push(inner + i, outer + i, outer + next, inner + i, outer + next, inner + next); }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices);
    return this.addSurfaceMesh(geometry, layer);
  }
  createSurfaceRing(layer) {
    const segments = 64, bands = Math.max(2, Math.ceil((layer.outerRadius - layer.innerRadius) / 2.5));
    const [cx, cz] = layer.center, positions = [], uvs = [], indices = [];
    for (let band = 0; band <= bands; band++) {
      const t = band / bands, radius = THREE.MathUtils.lerp(layer.innerRadius, layer.outerRadius, t);
      for (let i = 0; i <= segments; i++) {
        const angle = i / segments * Math.PI * 2, x = cx + Math.cos(angle) * radius, z = cz + Math.sin(angle) * radius;
        positions.push(x, this.surfaceHeight(x, z, layer), z); uvs.push(.5 + Math.cos(angle) * radius / (layer.outerRadius * 2), .5 + Math.sin(angle) * radius / (layer.outerRadius * 2));
      }
    }
    const row = segments + 1;
    for (let band = 0; band < bands; band++) for (let i = 0; i < segments; i++) { const a = band * row + i, b = a + row; indices.push(a, b, b + 1, a, b + 1, a + 1); }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices);
    return this.addSurfaceMesh(geometry, layer);
  }
  createSurfaceRibbon(layer) {
    const source = layer.points.map(([x, z]) => new THREE.Vector2(x, z)), centers = [];
    for (let s = 0; s < source.length - 1; s++) {
      const start = source[s], end = source[s + 1], steps = Math.max(1, Math.ceil(start.distanceTo(end) / 2.5));
      for (let i = s ? 1 : 0; i <= steps; i++) centers.push(start.clone().lerp(end, i / steps));
    }
    const positions = [], uvs = [], indices = [], distances = [0];
    for (let i = 1; i < centers.length; i++) distances.push(distances[i - 1] + centers[i].distanceTo(centers[i - 1]));
    const total = distances[distances.length - 1] || 1;
    for (let i = 0; i < centers.length; i++) {
      const before = centers[Math.max(0, i - 1)], after = centers[Math.min(centers.length - 1, i + 1)];
      const tangent = after.clone().sub(before).normalize(), right = new THREE.Vector2(-tangent.y, tangent.x);
      for (const side of [-1, 1]) {
        const point = centers[i].clone().addScaledVector(right, layer.width * .5 * side);
        positions.push(point.x, this.surfaceHeight(point.x, point.y, layer), point.y); uvs.push(side < 0 ? 0 : 1, distances[i] / total);
      }
    }
    for (let i = 0; i < centers.length - 1; i++) { const a = i * 2, b = a + 2; indices.push(a, b, b + 1, a, b + 1, a + 1); }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices);
    return this.addSurfaceMesh(geometry, layer);
  }
  createSurfaceRect(layer) {
    const [cx, cz] = layer.center, [width, depth] = layer.size, rotation = layer.rotation || 0;
    const xSteps = Math.max(2, Math.ceil(width / 3)), zSteps = Math.max(2, Math.ceil(depth / 3));
    const positions = [], uvs = [], indices = [], cos = Math.cos(rotation), sin = Math.sin(rotation);
    for (let zStep = 0; zStep <= zSteps; zStep++) for (let xStep = 0; xStep <= xSteps; xStep++) {
      const lx = (xStep / xSteps - .5) * width, lz = (zStep / zSteps - .5) * depth;
      const x = cx + lx * cos - lz * sin, z = cz + lx * sin + lz * cos;
      positions.push(x, this.surfaceHeight(x, z, layer), z); uvs.push(xStep / xSteps, zStep / zSteps);
    }
    const row = xSteps + 1;
    for (let zStep = 0; zStep < zSteps; zStep++) for (let xStep = 0; xStep < xSteps; xStep++) { const a = zStep * row + xStep, b = a + row; indices.push(a, b, b + 1, a, b + 1, a + 1); }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices);
    return this.addSurfaceMesh(geometry, layer);
  }
  registerCollider(object,options={},entity=null){
    const collider={object,entity,shape:options.shape||'box',halfX:options.halfX||1,halfZ:options.halfZ||1,radius:options.radius||1,top:options.top||0,bottom:options.bottom??-Infinity,blocking:options.blocking!==false,walkable:Boolean(options.walkable),enabled:true};
    this.colliders.push(collider);this.colliderIndexDirty=true;if(entity){entity.colliderHandles=entity.colliderHandles||[];entity.colliderHandles.push(collider)}return collider;
  }
  colliderFrame(collider){
    const frame=collider._frame||(collider._frame={position:new THREE.Vector3(),quaternion:new THREE.Quaternion(),euler:new THREE.Euler(),rotation:0});
    collider.object.getWorldPosition?.(frame.position);if(!collider.object.getWorldPosition)frame.position.copy(collider.object.position);
    if(collider.object.getWorldQuaternion){collider.object.getWorldQuaternion(frame.quaternion);frame.rotation=frame.euler.setFromQuaternion(frame.quaternion,'YXZ').y}else frame.rotation=collider.object.rotation?.y||0;
    return frame;
  }
  rebuildColliderIndex(){
    this.colliderIndex.clear();const size=this.colliderCellSize;
    for(const collider of this.colliders){const frame=this.colliderFrame(collider),extent=collider.shape==='cylinder'?collider.radius:Math.hypot(collider.halfX,collider.halfZ),minX=Math.floor((frame.position.x-extent)/size),maxX=Math.floor((frame.position.x+extent)/size),minZ=Math.floor((frame.position.z-extent)/size),maxZ=Math.floor((frame.position.z+extent)/size);for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){const key=`${x},${z}`,cell=this.colliderIndex.get(key);if(cell)cell.push(collider);else this.colliderIndex.set(key,[collider])}}
    this.colliderIndexDirty=false;
  }
  collidersInBounds(minX,maxX,minZ,maxZ){
    if(this.colliderIndexDirty)this.rebuildColliderIndex();const size=this.colliderCellSize,result=new Set(),cellMinX=Math.floor(minX/size),cellMaxX=Math.floor(maxX/size),cellMinZ=Math.floor(minZ/size),cellMaxZ=Math.floor(maxZ/size);for(let x=cellMinX;x<=cellMaxX;x++)for(let z=cellMinZ;z<=cellMaxZ;z++){const cell=this.colliderIndex.get(`${x},${z}`);if(cell)for(const collider of cell)result.add(collider)}return result;
  }
  collidersNear(position,padding=0){return this.collidersInBounds(position.x-padding,position.x+padding,position.z-padding,position.z+padding)}
  collidersForSegment(start,end,padding=0){return this.collidersInBounds(Math.min(start.x,end.x)-padding,Math.max(start.x,end.x)+padding,Math.min(start.z,end.z)-padding,Math.max(start.z,end.z)+padding)}
  colliderContains(position,collider,padding=0){
    const frame=this.colliderFrame(collider),dx=position.x-frame.position.x,dz=position.z-frame.position.z;
    if(collider.shape==='cylinder')return dx*dx+dz*dz<=(collider.radius+padding)**2;
    const cos=Math.cos(-frame.rotation),sin=Math.sin(-frame.rotation),lx=dx*cos-dz*sin,lz=dx*sin+dz*cos;
    return Math.abs(lx)<=collider.halfX+padding&&Math.abs(lz)<=collider.halfZ+padding;
  }
  removeCollidersFor(entity){for(const collider of entity?.colliderHandles||[])collider.enabled=false;this.nav?.invalidate();}
  walkableTopAt(position){let top=null;for(const collider of this.collidersNear(position,.08)){if(!collider.enabled||!collider.walkable||collider.entity?.dead||!this.colliderContains(position,collider,.08))continue;const y=this.colliderFrame(collider).position.y+collider.top;if(top===null||y>top)top=y;}return top;}
  groundAt(position) { const terrain=this.heightAt(position.x, position.z),platform=this.walkableTopAt(position);return platform===null?terrain:Math.max(terrain,platform); }
  walkablePosition(position,radius=.72,maxRing=12){const result=position.clone();if(this.nav?.blockedAt(result.x,result.z,radius)){const cell=this.nav.nearestFreeCell(this.nav.cellX(result.x),this.nav.cellZ(result.z),maxRing);if(cell)result.copy(this.nav.toWorld(cell.cx,cell.cz))}result.y=this.groundAt(result);return result}
  deploymentPosition(teamId,index=0,radius=.72){const slots=this.deploymentPositions?.[teamId];if(!slots?.length)return null;return this.walkablePosition(slots[index%slots.length],radius)}
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
  createTeamCompound(team,base){
    const inward=base.clone().multiplyScalar(-1).setY(0).normalize(),side=new THREE.Vector3(-inward.z,0,inward.x),group=new THREE.Group();group.position.copy(base);group.rotation.y=Math.atan2(inward.x,inward.z);group.name=`team-compound-${team.id}`;
    const foundation=new THREE.Mesh(new THREE.CylinderGeometry(25,26,.42,12),this.materials.building(this.map.id==='crossroads'?'sidewalk':this.map.id==='rift'?'corrugated_steel':this.map.id==='wilds'?'moss_stone':'summit_stone',{repeat:5}));foundation.position.y=.08;foundation.receiveShadow=true;group.add(foundation);
    const stripeMat=this.materials.color(team.color,{emissive:team.dark,emissiveIntensity:.55,metalness:.4});
    for(const x of [-15,0,15]){const stripe=new THREE.Mesh(new THREE.BoxGeometry(7,.08,.8),stripeMat);stripe.position.set(x,.34,-17.5);group.add(stripe)}
    for(const x of [-18,18]){const wall=new THREE.Mesh(new THREE.BoxGeometry(1.2,2.4,13),this.materials.building('plating',{repeat:2}));wall.position.set(x,1.2,8);wall.castShadow=wall.receiveShadow=true;group.add(wall);this.registerCollider(wall,{shape:'box',halfX:.6,halfZ:6.5,top:1.2});}
    this.scene.add(group);this.teamCompounds[team.id]={group,foundation,radius:26,inward,side};
    this.registerCollider(foundation,{shape:'cylinder',radius:25,top:.21,blocking:false,walkable:true});
  }
  createCave(position) { const group = new THREE.Group(); group.position.copy(position); const dark = new THREE.MeshBasicMaterial({ color: 0x111522 }); const mouth = new THREE.Mesh(new THREE.CircleGeometry(3.15, 12), dark); mouth.position.set(0, 2.75, .12); group.add(mouth); const arch = new THREE.Mesh(new THREE.TorusGeometry(3.35, .82, 6, 14, Math.PI), this.materials.building('cobble')); arch.position.y = 2.65; arch.castShadow = true; group.add(arch); for (const x of [-2.2, 2.2]) { const pillar = new THREE.Mesh(new THREE.CylinderGeometry(.82, 1.05, 3.1, 7), this.materials.building('cobble')); pillar.position.set(x, 1.45, 0); pillar.castShadow = true; group.add(pillar); } const crystalMat = this.materials.building('crystal', { emissive: 0x1780b0, emissiveIntensity: .9 }); for (const [x, z, s] of [[-4, -1, .7], [3.8, .3, .9], [4.5, -1.4, .55]]) { const c = new THREE.Mesh(new THREE.ConeGeometry(.48, 1.7, 5), crystalMat); c.position.set(x, .85, z); c.scale.setScalar(s); group.add(c); } const ring = new THREE.Mesh(new THREE.RingGeometry(5.1, 5.45, 40), new THREE.MeshBasicMaterial({ color: 0x5bd9ff, transparent: true, opacity: .5, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })); ring.rotation.x = -Math.PI / 2; ring.position.y = .1; group.add(ring); this.caveRing = ring; this.caveGroup = group; this.scene.add(group); }
  planCrateDropZones() {
    if(this.gameMode==='campaign'){
      if(this.map.id==='goldrush'){
        const team=this.teams[0],base=this.basePositions[team.id],toCenter=base.clone().multiplyScalar(-1).setY(0).normalize(),side=new THREE.Vector3(-toCenter.z,0,toCenter.x);
        this.crateDropZonePlans=[{id:'campaign-depot',label:'HOME SUPPLY DROP',kind:'team',teamId:team.id,color:team.color,position:base.clone().addScaledVector(toCenter,31).addScaledVector(side,20),types:['brown'],radius:4.2,interval:{minSeconds:18,maxSeconds:24}}];
      }else if(this.map.id==='gaia-bastion'){
        const team=this.teams[0],base=this.basePositions[team.id],toCenter=base.clone().multiplyScalar(-1).setY(0).normalize(),side=new THREE.Vector3(-toCenter.z,0,toCenter.x);
        this.crateDropZonePlans=[{id:'aegis-supply-depot',label:'FORT AEGIS TRIPLE SUPPLY',kind:'team',teamId:team.id,color:team.color,position:base.clone().addScaledVector(toCenter,34).addScaledVector(side,-24),types:['brown'],radius:5.2,burst:3,interval:{minSeconds:18,maxSeconds:24}}];
      }else this.crateDropZonePlans=[];
      return;
    }
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
      const position = base.clone().addScaledVector(toCenter, 34).addScaledVector(toLeft, 26);
      return { id: `team-${team.id}`, label: `${team.name || team.id.toUpperCase()} DEPOT`, kind: 'team', teamId: team.id, color: team.color, position, types: ['brown'], radius: 4.2 };
    });
    const rareZones = [
      ['rare-southwest', 'EMBER RELAY', -88, -88],
      ['rare-southeast', 'TIDAL RELAY', 88, -88],
      ['rare-northwest', 'TEMPLE RELAY', -88, 88],
      ['rare-northeast', 'FORT RELAY', 88, 88],
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
    this.crateDropScheduler = this.crateDropZones.length ? new CrateDropScheduler(this.crateDropZones) : null;
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
    if(this.gameMode==='campaign'){
      if(this.map.id==='gaia-blacksite')return;
      const population=this.map.id==='bootcamp'?26:['gaia-bastion','storm-dam','sunforge'].includes(this.map.id)?86:64,extent=this.bounds-8;
      for(let i=0;i<population;i++){const x=random()*extent*2-extent,z=random()*extent*2-extent;if(this.nearBase(x,z,28)||Math.abs(x)<11){i--;continue}if(i%3===0)this.createTree(x,z,.65+random()*.45);else this.createRock(x,z,.55+random()*.9)}
      if(this.map.id==='gaia-bastion')for(const [x,z] of [[-62,-8],[-48,24],[55,39],[67,11],[-72,56]])this.wildlife.push(this.factory.createWildlife('bear',new THREE.Vector3(x,this.heightAt(x,z),z)));
      return;
    }
    const population=this.gameMode==='deathmatch'?(this.map.id==='wilds'?360:this.map.id==='crossroads'?125:210):(this.map.id==='wilds'?220:this.map.id==='crossroads'?55:120),extent=this.bounds-12;
    for (let i = 0; i < population; i++) {
      let x = random() * extent*2 - extent, z = random() * extent*2 - extent; if (this.nearBase(x, z, 31) || this.nearDropZone(x, z, 9)) { i--; continue; }
      if (i < population*(this.map.id==='wilds' ? .82 : .54)) this.createTree(x, z, .75 + random() * .65); else this.createRock(x, z, .6 + random() * 1.5);
    }
    for (const [x, z, rotation] of [[-22, -12, .4], [26, 20, -2.5]]) if (!this.nearDropZone(x, z, 8)) this.createSandbags(new THREE.Vector3(x, this.heightAt(x, z), z), rotation);
    [
      ['sheep', -8, 22], ['sheep', 12, -28], ['sheep', -30, -15], ['sheep', 25, 32], ['sheep', -20, 42],
      ['wolf', 2, 14], ['wolf', 18, 2], ['wolf', -25, -35], ['wolf', 35, -12], ['wolf', -38, 5],
      ['slime', -5, 30], ['slime', -22, -18], ['slime', 22, -22], ['slime', 30, 20], ['slime', -40, -40]
    ].forEach(([kind, x, z]) => { if (!this.nearDropZone(x, z, 7)) this.wildlife.push(this.factory.createWildlife(kind, new THREE.Vector3(x, this.heightAt(x, z), z))); });
    if(this.map.id==='wilds')for(let i=0;i<48;i++){const kind=i%5===0?'slime':i%3===0?'wolf':'sheep',a=random()*Math.PI*2,r=24+random()*(this.bounds-58),x=Math.cos(a)*r,z=Math.sin(a)*r;if(!this.nearBase(x,z,32))this.wildlife.push(this.factory.createWildlife(kind,new THREE.Vector3(x,this.heightAt(x,z),z)))}
  }
  // Structures showing off the 10 generated building textures
  buildStructures() {
    if(this.gameMode==='deathmatch'||this.gameMode==='campaign')return;
    const add = (geo, tex, x, y, z, opts = {}) => { const m = new THREE.Mesh(geo, this.materials.building(tex, opts.mat)); m.position.set(x, y + this.heightAt(x, z), z); if (opts.ry) m.rotation.y = opts.ry; m.castShadow = m.receiveShadow = true; this.scene.add(m); if (opts.hp) { const d = { id: crypto.randomUUID(), type: 'prop', subtype: tex, group: m, hp: opts.hp, maxHp: opts.hp, radius: opts.radius || 2, dead: false }; m.userData.entity = d; this.destructibles.push(d);geo.computeBoundingBox();const size=new THREE.Vector3();geo.boundingBox.getSize(size);this.registerCollider(m,{shape:'box',halfX:size.x/2,halfZ:size.z/2,top:geo.boundingBox.max.y},d); } return m; };
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
    if(this.gameMode==='campaign')return;
    const scale=this.gameMode==='deathmatch'?3:1,bunkerPos=new THREE.Vector3(12*scale,this.heightAt(12*scale,24*scale),24*scale);this.bunker=this.factory.createBunker(bunkerPos);this.interactiveStructures.push(this.bunker);
    for(const [x,z,r] of [[-33*scale,-18*scale,.45],[31*scale,-29*scale,-.8],[-38*scale,34*scale,2.25],[37*scale,27*scale,-2.4]]){
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
    else if(this.map.id==='bootcamp')this.buildBootcamp();
    else if(this.map.id==='goldrush')this.buildGoldrush();
    else if(this.map.id==='gaia-bastion')this.buildGaiaBastion();
    else if(this.map.id==='storm-dam')this.buildStormDam();
    else if(this.map.id==='sunforge')this.buildSunforge();
    else if(this.map.id==='gaia-blacksite')this.buildGaiaBlacksite();
    else this.buildSummitArena();
  }
  buildBootcamp(){
    for(const [x,z,r] of [[-19,8,.15],[19,6,-.2],[-17,-13,-.12],[18,-15,.18]]){const wall=this.themedProp(new THREE.BoxGeometry(10,3.2,1.5),'corrugated_steel',x,z,1.6,420,5,{repeat:2});wall.rotation.y=r}
    for(const [x,z] of [[-7,2],[8,-4],[-8,-25],[9,24]])this.themedProp(new THREE.CylinderGeometry(1.4,1.8,5,7),'vehicle_metal',x,z,2.5,360,1.8,{repeat:2});
    for(const z of [-18,18])this.createSandbags(new THREE.Vector3(z<0?-12:12,this.heightAt(z<0?-12:12,z),z),z<0?.45:-.45);
  }
  buildGoldrush(){
    for(const side of [-1,1])for(const [z,w] of [[-48,18],[-13,14],[25,19],[56,15]]){const wall=this.themedProp(new THREE.BoxGeometry(w,4.2,1.8),side<0?'summit_stone':'corrugated_steel',side*(25+(Math.abs(z)%3)*5),z,2.1,620,w*.5,{repeat:3});wall.rotation.y=side*(.18+(z%2)*.05)}
    for(const [x,z] of [[-18,-68],[18,-68],[-22,-83],[22,-83]])this.themedProp(new THREE.CylinderGeometry(2.2,2.8,8,8),'vehicle_metal',x,z,4,680,2.8,{repeat:2});
    for(const [x,z,r] of [[-34,0,.25],[32,5,-.28],[-28,39,-.12],[29,-34,.16]])this.createSandbags(new THREE.Vector3(x,this.heightAt(x,z),z),r);
  }
  missionProp(geometry,texture,x,z,y,hp,radius,options={}){const mesh=this.themedProp(geometry,texture,x,z,y,hp,radius,options);this.missionTargets.push(mesh.userData.entity);return mesh}
  buildGaiaBastion(){
    // Aegis base: two defensive wall belts, barracks, hangars and watch towers.
    for(const z of [68,84,116])for(const x of [-34,-17,17,34]){if(z===84&&Math.abs(x)<20)continue;this.themedProp(new THREE.BoxGeometry(14,4.5,2),'concrete',x,z,2.25,650,7,{repeat:3})}
    for(const [x,z,w,d,h] of [[-30,99,20,13,7],[29,98,23,14,8],[-37,70,16,12,6],[38,70,18,13,6]]){this.themedProp(new THREE.BoxGeometry(w,h,d),'corrugated_steel',x,z,h/2,720,Math.max(w,d)*.45,{repeat:4});this.themedProp(new THREE.BoxGeometry(w+1,.5,d+1),'rooftop',x,z,h+.25,220,Math.max(w,d)*.45,{collider:false,repeat:3})}
    for(const [x,z] of [[-45,83],[45,83],[-43,119],[43,119]]){this.themedProp(new THREE.CylinderGeometry(2.2,2.8,11,8),'vehicle_metal',x,z,5.5,760,2.8,{repeat:2});this.themedProp(new THREE.ConeGeometry(3.4,2.2,8),'plating',x,z,12.1,320,3.4,{collider:false})}
    // Enemy airfield and approach fortifications.
    for(const x of [-42,-22,22,42])this.themedProp(new THREE.BoxGeometry(15,4,2),'plating',x,-78,2,560,7.5,{repeat:3});
    for(const [x,z,r] of [[-32,-49,.2],[31,-46,-.2],[-42,44,.35],[43,48,-.35]])this.createSandbags(new THREE.Vector3(x,this.heightAt(x,z),z),r);
    const enemyBase=Object.values(this.basePositions)[1]||new THREE.Vector3(0,0,-108),towardCenter=enemyBase.clone().multiplyScalar(-1).setY(0).normalize(),airfieldSide=new THREE.Vector3(-towardCenter.z,0,towardCenter.x),jetPos=enemyBase.clone().addScaledVector(airfieldSide,48).addScaledVector(towardCenter,5);jetPos.y=this.heightAt(jetPos.x,jetPos.z);this.createDestroJet(jetPos);
    // Hidden red-crate spots: culvert, ruined farmhouse and bridge maintenance bay.
    for(const [name,x,z] of [['CULVERT RED CACHE',-79,14],['RUINED FARMHOUSE',76,54],['BRIDGE SERVICE BAY',8,-9]]){const pos=new THREE.Vector3(x,this.heightAt(x,z),z);this.secretPlaces.push({name,position:pos.clone(),radius:10});const crate=this.factory.createCrate(pos,CRATE_TYPES.red);crate.noAI=true;crate.sourceDropZoneId='gaia-secret';this.crates.push(crate);for(const dx of [-4,4])this.themedProp(new THREE.BoxGeometry(1.2,3.6,8),'urban_brick',x+dx,z,1.8,340,4,{repeat:2})}
  }
  createDestroJet(position){
    const baseY=position.y+1.15,runway=new THREE.Mesh(new THREE.BoxGeometry(28,.55,34),this.materials.building('asphalt',{repeat:5}));runway.position.set(position.x,this.heightAt(position.x,position.z)+.18,position.z);runway.receiveShadow=true;this.scene.add(runway);this.registerCollider(runway,{shape:'box',halfX:14,halfZ:17,top:.275,blocking:false,walkable:true});
    const group=new THREE.Group();group.position.set(position.x,baseY,position.z);group.rotation.y=Math.PI;group.name='enemy-destrojet';const chrome=this.materials.color(0xc8d7e3,{metalness:.95,roughness:.13,emissive:0x182b3b,emissiveIntensity:.35}),dark=this.materials.color(0x182433,{metalness:.8,roughness:.22}),red=this.materials.color(0xff334d,{emissive:0x8e0016,emissiveIntensity:1.2,metalness:.5}),engineGlows=[],navLights=[];
    const fuselage=new THREE.Mesh(new THREE.CapsuleGeometry(1.65,10,6,12),chrome);fuselage.rotation.x=Math.PI/2;fuselage.position.y=3.1;group.add(fuselage);const nose=new THREE.Mesh(new THREE.ConeGeometry(1.68,5,12),chrome);nose.rotation.x=Math.PI/2;nose.position.set(0,3.1,7.5);group.add(nose);const canopy=new THREE.Mesh(new THREE.SphereGeometry(1.35,16,8,0,Math.PI*2,0,Math.PI/2),this.materials.color(0x57cfff,{transparent:true,opacity:.72,metalness:.35,roughness:.08,emissive:0x06466d,emissiveIntensity:.8}));canopy.scale.set(1,.7,1.8);canopy.position.set(0,4.15,1.4);group.add(canopy);
    for(const side of [-1,1]){const wing=new THREE.Mesh(new THREE.ConeGeometry(5.7,10,3),chrome);wing.rotation.set(Math.PI/2,0,side*Math.PI/2);wing.position.set(side*3.7,2.85,-.4);wing.scale.set(.32,1,1);group.add(wing);const tail=new THREE.Mesh(new THREE.BoxGeometry(.35,3.8,4.2),dark);tail.position.set(side*1.45,4.4,-5.1);tail.rotation.z=side*.28;group.add(tail);const missile=new THREE.Mesh(new THREE.CapsuleGeometry(.28,2.2,3,7),red);missile.rotation.x=Math.PI/2;missile.position.set(side*4.2,2.35,.2);group.add(missile);const nav=new THREE.Mesh(new THREE.SphereGeometry(.19,8,6),new THREE.MeshBasicMaterial({color:side<0?0xff2448:0x55ff9a}));nav.position.set(side*7.2,3,-.35);group.add(nav);navLights.push(nav)}
    for(const x of [-.72,.72]){const engine=new THREE.Mesh(new THREE.CylinderGeometry(.62,.78,2.8,12),dark);engine.rotation.x=Math.PI/2;engine.position.set(x,2.85,-5.8);group.add(engine);const glow=new THREE.Mesh(new THREE.CircleGeometry(.5,12),new THREE.MeshBasicMaterial({color:0x48d8ff,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));glow.position.set(x,2.85,-7.22);glow.rotation.x=-Math.PI/2;group.add(glow);engineGlows.push(glow)}
    this.scene.add(group);this.registerCollider(group,{shape:'box',halfX:7.8,halfZ:9.5,top:4.8,blocking:true});const dropPos=position.clone().add(new THREE.Vector3(20,0,2));dropPos.y=this.heightAt(dropPos.x,dropPos.z)+.08;const drop=new THREE.Group();drop.position.copy(dropPos);const mat=new THREE.MeshBasicMaterial({color:0xff3954,transparent:true,opacity:.8,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false});for(const [inner,outer] of [[3.8,4.45],[5.2,5.45]]){const ring=new THREE.Mesh(new THREE.RingGeometry(inner,outer,48),mat.clone());ring.rotation.x=-Math.PI/2;drop.add(ring)}for(let i=0;i<8;i++){const arrow=new THREE.Mesh(new THREE.ConeGeometry(.35,1.15,4),mat.clone());const a=i/8*Math.PI*2;arrow.position.set(Math.cos(a)*4.8,.45,Math.sin(a)*4.8);arrow.rotation.z=Math.PI;arrow.rotation.y=-a;drop.add(arrow)}const beam=new THREE.Mesh(new THREE.CylinderGeometry(3.6,5.1,24,32,1,true),new THREE.MeshBasicMaterial({color:0xff2448,transparent:true,opacity:.11,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));beam.position.y=12;drop.add(beam);const beaconTop=new THREE.Mesh(new THREE.TorusGeometry(4.5,.18,8,48),mat.clone());beaconTop.rotation.x=Math.PI/2;beaconTop.position.y=23.5;drop.add(beaconTop);
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=150;const ctx=canvas.getContext('2d');ctx.fillStyle='rgba(15,5,12,.88)';ctx.fillRect(3,3,762,144);ctx.strokeStyle='#ff3954';ctx.lineWidth=8;ctx.strokeRect(5,5,758,140);ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='900 64px Impact,system-ui';ctx.fillText('ENEMY EXTRACTION',384,76);const labelTexture=new THREE.CanvasTexture(canvas);labelTexture.colorSpace=THREE.SRGBColorSpace;const label=new THREE.Sprite(new THREE.SpriteMaterial({map:labelTexture,transparent:true,depthWrite:false}));label.position.y=18;label.scale.set(13,2.55,1);drop.add(label);this.scene.add(drop);
    const runwayLights=[];for(const [dx,dz] of [[-12,-15],[12,-15],[-12,15],[12,15]]){const lamp=new THREE.Mesh(new THREE.CylinderGeometry(.18,.28,.6,8),new THREE.MeshBasicMaterial({color:0xff3d55}));lamp.position.set(position.x+dx,this.heightAt(position.x+dx,position.z+dz)+.4,position.z+dz);this.scene.add(lamp);runwayLights.push(lamp)}const jetLight=new THREE.PointLight(0x55dfff,22,42,2);jetLight.position.set(0,5,-5);group.add(jetLight);const extractionLight=new THREE.PointLight(0xff284d,28,46,2);extractionLight.position.set(0,8,0);drop.add(extractionLight);this.destroJet={group,drop,dropPosition:dropPos,beam,beaconTop,engineGlows,navLights,runwayLights,jetLight,extractionLight,baseY};
  }
  buildStormDam(){
    for(const x of [-58,-29,0,29,58]){const pier=this.themedProp(new THREE.BoxGeometry(8,15,20),'concrete',x,3,7.5,1100,10,{repeat:4});pier.rotation.y=.02}
    for(const z of [-34,-66])for(const x of [-72,-36,0,36,72])this.themedProp(new THREE.BoxGeometry(24,3.8,2),'plating',x,z,1.9,560,12,{repeat:3});
    for(const [x,z] of [[-55,-42],[0,-57],[55,-42]]){const tower=this.missionProp(new THREE.CylinderGeometry(2.4,3.4,12,8),'neon_concrete',x,z,6,850,3.4,{repeat:2,emissive:0x00aacc,emissiveIntensity:.7});const crown=new THREE.Mesh(new THREE.TorusGeometry(3.3,.22,8,32),new THREE.MeshBasicMaterial({color:0x61efff}));crown.rotation.x=Math.PI/2;crown.position.set(x,this.heightAt(x,z)+12.5,z);this.scene.add(crown);tower.userData.entity.attachments=[crown]}
    for(const [x,z,w,d,h] of [[-78,46,22,16,9],[76,48,25,16,10],[-36,76,19,14,7],[37,78,19,14,7]])this.themedProp(new THREE.BoxGeometry(w,h,d),'concrete',x,z,h/2,760,Math.max(w,d)*.45,{repeat:4});
    for(const [name,x,z] of [['TURBINE INSPECTION SHAFT',-91,8],['FLOODED CONTROL ARCHIVE',88,13]])this.secretPlaces.push({name,position:new THREE.Vector3(x,this.heightAt(x,z),z),radius:11});
  }
  buildSunforge(){
    for(const radius of [55,78])for(let i=0;i<16;i++){if(i%4===0)continue;const a=i/16*Math.PI*2,x=Math.cos(a)*radius,z=Math.sin(a)*radius;const wall=this.themedProp(new THREE.BoxGeometry(18,5,2.4),'corrugated_steel',x,z,2.5,740,9,{repeat:3});wall.rotation.y=-a}
    for(let i=0;i<8;i++){const a=i/8*Math.PI*2,x=Math.cos(a)*42,z=Math.sin(a)*42;this.themedProp(new THREE.CylinderGeometry(3,4.5,18,10),'vehicle_metal',x,z,9,980,4.5,{repeat:3});const flame=new THREE.Mesh(new THREE.ConeGeometry(1.7,6,8),new THREE.MeshBasicMaterial({color:0xff7b28,transparent:true,opacity:.72,blending:THREE.AdditiveBlending}));flame.position.set(x,this.heightAt(x,z)+21,z);this.scene.add(flame)}
    for(const [x,z] of [[-26,-26],[26,-26],[-26,26],[26,26]]){const lock=this.missionProp(new THREE.BoxGeometry(5,8,5),'neon_concrete',x,z,4,900,3.5,{repeat:2,emissive:0xff3500,emissiveIntensity:.9});const band=new THREE.Mesh(new THREE.TorusGeometry(3.2,.3,8,28),new THREE.MeshBasicMaterial({color:0x48dfff}));band.rotation.x=Math.PI/2;band.position.set(x,this.heightAt(x,z)+4,z);this.scene.add(band);lock.userData.entity.attachments=[band]}
    for(const [name,x,z] of [['SMUGGLER COOLANT TUNNEL',-102,54],['FOREMAN ASH VAULT',96,-62]]){const pos=new THREE.Vector3(x,this.heightAt(x,z),z);this.secretPlaces.push({name,position:pos.clone(),radius:11});const crate=this.factory.createCrate(pos,CRATE_TYPES.red);crate.noAI=true;this.crates.push(crate)}
  }
  buildGaiaBlacksite(){
    const armor='gaia_blacksite_armor',wall=(x,z,w,d,h=6.5,texture=armor,options={})=>this.themedProp(new THREE.BoxGeometry(w,h,d),texture,x,z,h/2,options.hp||1300,Math.max(w,d)*.5,{repeat:options.repeat||3,...options}),cyan=this.materials.color(0x47e7ff,{emissive:0x0e8daa,emissiveIntensity:2.1,metalness:.45}),amber=this.materials.color(0xffc43f,{emissive:0x885800,emissiveIntensity:1.2,metalness:.55}),dark=this.materials.color(0x111923,{metalness:.8,roughness:.28});
    // Perimeter shell with wide deployment gates at both ends.
    wall(-88,0,2.6,264,8);wall(88,0,2.6,264,8);for(const z of [-132,132]){wall(-53,z,68,2.6,8);wall(53,z,68,2.6,8)}
    // Alternating blast walls turn the 260-metre central spine into readable, flanking hallways.
    for(const segment of blacksiteBlastWallSegments())wall(segment.x,segment.z,segment.w,segment.d,6.6,segment.index%2?'corrugated_steel':armor);for(const {z,x:opening} of BLACKSITE_TRANSIT.blastGates){const gap=BLACKSITE_TRANSIT.gateHalfWidth;for(const x of [opening-gap,opening+gap]){const post=wall(x,z,1.2,4,8,'neon_concrete',{emissive:0x0a7189,emissiveIntensity:.6});post.userData.blacksiteDoorPost=true}const lintel=wall(opening,z,gap*2-1,1.4,1.1,armor,{collider:false});lintel.position.y=6.45}
    // Longitudinal dividers create side service lanes while cross-corridors keep multiple tactical routes open.
    for(const x of [-44,44])for(const [z,len] of [[-112,18],[-73,26],[-28,24],[16,24],[60,24],[108,20]])wall(x,z,2.1,len,5.8,'corrugated_steel');
    // Cargo vaults, armories, med bays and the sealed research wing.
    for(const [x,z,w,d,h,texture] of [[-66,-111,30,20,5.2,armor],[64,-110,31,22,5.8,'neon_concrete'],[-66,-70,28,24,5.4,'corrugated_steel'],[65,-27,30,25,5.8,armor],[-64,17,32,23,5.5,'neon_concrete'],[64,60,31,24,5.7,'corrugated_steel'],[-64,105,30,23,5.6,armor],[64,107,32,22,5.8,'neon_concrete']]){const slab=this.themedProp(new THREE.BoxGeometry(w,.42,d),texture,x,z,.21,900,Math.max(w,d)*.45,{repeat:4,walkable:true});slab.userData.blacksiteRoom=true;for(const sx of [-1,1]){const column=wall(x+sx*(w/2-1.2),z,1.4,1.4,h+1,'vehicle_metal');column.userData.blacksiteColumn=true}}
    // Open ceiling trusses sell the indoor scale without hiding the third-person camera.
    for(let z=-121;z<=121;z+=22){const beam=wall(0,z,174,.48,.5,'vehicle_metal',{collider:false});beam.position.y=7.45;for(const x of [-82,-42,0,42,82]){const drop=new THREE.Mesh(new THREE.BoxGeometry(.3,1.4,.3),dark);drop.position.set(x,6.7,z);this.scene.add(drop)}if(Math.abs(z)%44<1){for(const x of [-63,-21,21,63]){const lamp=new THREE.Mesh(new THREE.BoxGeometry(4.2,.16,.55),cyan);lamp.position.set(x,7.12,z);this.scene.add(lamp)}}}
    // Floor beacons and warning pylons lead the eye through the otherwise dark facility.
    for(let z=-118;z<=118;z+=18)for(const x of [-18,18]){const lamp=new THREE.Mesh(new THREE.BoxGeometry(1.6,.08,.32),z%36?cyan:amber);lamp.position.set(x,.09,z);this.scene.add(lamp)}
    for(const [x,z] of [[-80,-119],[80,-119],[-80,-61],[80,-61],[-80,-17],[80,-17],[-80,28],[80,28],[-80,72],[80,72],[-80,116],[80,116]]){const pylon=wall(x,z,1.1,1.1,4.8,'vehicle_metal');const light=new THREE.PointLight((x+z)%3?0x38ddff:0xffbd35,7,18,2);light.position.set(x,4,z);this.scene.add(light);pylon.userData.blacksiteLight=true}
    // Physical cover and visual storytelling: stacked freight, field desks, server banks and blast shields.
    for(const [x,z,r] of [[-25,-113,0],[26,-83,.2],[-63,-42,.5],[62,-2,-.45],[-25,24,.2],[27,61,-.2],[-62,82,.4],[61,96,-.4]])this.createSandbags(new THREE.Vector3(x,0,z),r);
    for(const [x,z] of [[-72,-104],[-61,-104],[-70,-62],[-60,-62],[61,-20],[71,-20],[-69,12],[-58,12],[59,54],[70,54],[-70,99],[-59,99]])for(const y of [1.2,3.7]){const server=wall(x,z,4.6,1.8,4.6,armor,{collider:y<2});server.position.y=y;const strip=new THREE.Mesh(new THREE.BoxGeometry(3.6,.12,1.9),cyan);strip.position.set(x,y+.55,z+1);this.scene.add(strip)}
    const sign=(text,x,z,rotation=0)=>{const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle='rgba(5,13,22,.94)';ctx.fillRect(3,3,506,122);ctx.strokeStyle='#47e7ff';ctx.lineWidth=7;ctx.strokeRect(5,5,502,118);ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='900 46px Impact,system-ui';ctx.fillText(text,256,65);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false}));sprite.position.set(x,5.6,z);sprite.scale.set(7.2,1.8,1);sprite.material.rotation=rotation;this.scene.add(sprite)};
    sign('ATLAS BLACKSITE // TRANSIT',0,116);sign('CARGO VAULT 04',-62,47);sign('BIO-RESEARCH // LEODONES',56,-118);sign('SURFACE EXTRACTION',0,129);
    this.scientistSpawn=new THREE.Vector3(BLACKSITE_TRANSIT.scientist.x,0,BLACKSITE_TRANSIT.scientist.z);this.scientistSpawn.y=this.heightAt(this.scientistSpawn.x,this.scientistSpawn.z);
    // Exact interior formations replace the generic base-ring offset calculation.
    // Every member of both starting rosters gets an authored slot in a clear bay.
    const [playerTeam,enemyTeam]=this.teams;this.deploymentPositions[playerTeam.id]=BLACKSITE_TRANSIT.playerDeployment.map(point=>new THREE.Vector3(point.x,this.heightAt(point.x,point.z),point.z));this.spawnPositions[playerTeam.id]=new THREE.Vector3(BLACKSITE_TRANSIT.playerSpawn.x,this.heightAt(BLACKSITE_TRANSIT.playerSpawn.x,BLACKSITE_TRANSIT.playerSpawn.z),BLACKSITE_TRANSIT.playerSpawn.z);if(enemyTeam){this.deploymentPositions[enemyTeam.id]=BLACKSITE_TRANSIT.enemyDeployment.map(point=>new THREE.Vector3(point.x,this.heightAt(point.x,point.z),point.z));this.spawnPositions[enemyTeam.id]=new THREE.Vector3(BLACKSITE_TRANSIT.enemySpawn.x,this.heightAt(BLACKSITE_TRANSIT.enemySpawn.x,BLACKSITE_TRANSIT.enemySpawn.z),BLACKSITE_TRANSIT.enemySpawn.z)}this.atlasWaveSpawns=BLACKSITE_TRANSIT.enemyWaveSpawns.map(point=>new THREE.Vector3(point.x,this.heightAt(point.x,point.z),point.z));
    this.missionCratePoints=[];for(const [cx,cz] of [[-70,-116],[0,-108],[68,-89],[-67,-73],[55,-55],[-64,-30],[65,-14],[-63,8],[62,27],[-67,51],[64,69],[-64,91],[62,108],[0,70]])for(let i=0;i<3;i++)this.missionCratePoints.push(new THREE.Vector3(cx+(i-1)*2.1,0,cz+(i%2)*2));
    const jetPosition=new THREE.Vector3(BLACKSITE_TRANSIT.extractionJet.x,0,BLACKSITE_TRANSIT.extractionJet.z);jetPosition.y=this.heightAt(jetPosition.x,jetPosition.z);this.createDestroJet(jetPosition);this.destroJet.group.name='gaia-rescue-destrojet';
    this.secretPlaces.push({name:'ATLAS DIRECTOR\'S VAULT',position:new THREE.Vector3(-78,0,-118),radius:9},{name:'LEODONES PROTOTYPE LOCKER',position:new THREE.Vector3(78,0,-113),radius:9});
  }
  themedProp(geometry,texture,x,z,y=0,hp=420,radius=2,options={}){
    const {collider=true,walkable=false,...materialOptions}=options,object=new THREE.Mesh(geometry,this.materials.building(texture,materialOptions));object.position.set(x,this.heightAt(x,z)+y,z);object.castShadow=object.receiveShadow=true;this.scene.add(object);
    const entity={id:crypto.randomUUID(),type:'prop',subtype:texture,group:object,hp,maxHp:hp,radius,dead:false,jellyStrength:.35,navigationIgnored:!collider};object.userData.entity=entity;this.destructibles.push(entity);
    if(collider){geometry.computeBoundingBox();const box=geometry.boundingBox,size=new THREE.Vector3();box.getSize(size);this.registerCollider(object,{shape:'box',halfX:size.x*.5,halfZ:size.z*.5,top:box.max.y,blocking:!walkable,walkable},entity)}return object;
  }
  buildCity(){
    const palette=['urban_brick','neon_concrete','corrugated_steel','city_glass'];let n=0;
    const grid=this.gameMode==='deathmatch'?[-168,-112,-56,0,56,112,168]:[-56,-28,0,28,56];
    for(const x of grid)for(const z of grid){if(this.nearBase(x,z,32)||Math.hypot(x,z)<24||(Math.abs(x)<18||Math.abs(z)<18))continue;const h=9+((n*7)%18),w=16+(n%3)*3,d=16+((n+1)%3)*3,group=new THREE.Group();group.position.set(x,this.heightAt(x,z),z);const body=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),this.materials.building(palette[n%palette.length],{repeat:4}));body.position.y=h/2;body.castShadow=body.receiveShadow=true;group.add(body);const roof=new THREE.Mesh(new THREE.BoxGeometry(w+1,.5,d+1),this.materials.building('rooftop',{repeat:3}));roof.position.y=h+.25;roof.castShadow=roof.receiveShadow=true;group.add(roof);const trim=new THREE.Mesh(new THREE.BoxGeometry(w+1.15,.3,d+1.15),this.materials.building('neon_concrete',{repeat:3}));trim.position.y=h-.15;group.add(trim);this.scene.add(group);const entity={id:crypto.randomUUID(),type:'prop',subtype:'building',group,hp:700+h*30,maxHp:700+h*30,radius:Math.max(w,d)*.45,dead:false,jellyStrength:.25,attachments:[roof,trim]};group.traverse(o=>{if(o.isMesh)o.userData.entity=entity});this.destructibles.push(entity);this.registerCollider(body,{shape:'box',halfX:w/2,halfZ:d/2,top:h/2},entity);n++}
    const carSpots=[[-126,-75,0],[-126,78,Math.PI],[42,-93,0],[42,96,Math.PI],[123,0,Math.PI/2],[-30,126,-Math.PI/2],[-42,15,0],[126,153,Math.PI]];
    carSpots.forEach(([x,z,r],i)=>this.cars.push(this.factory.createCar(new THREE.Vector3(x,this.heightAt(x,z),z),r,[0x39a8ff,0xff4f66,0xffcc38,0x65e27c][i%4])));
    for(const [x,z,r] of [[-15,-42,.2],[96,42,2.8],[-84,126,-1.2]])this.motorcycles.push(this.factory.createMotorcycle(new THREE.Vector3(x,this.heightAt(x,z),z),r));
  }
  buildSummitArena(){for(const [ringRadius,count] of [[66,18],[108,24],[150,30]])for(let i=0;i<count;i++){if(i%6===0)continue;const a=i/count*Math.PI*2,r=ringRadius+(i%2)*3,x=Math.cos(a)*r,z=Math.sin(a)*r;const wall=this.themedProp(new THREE.BoxGeometry(12,4.2,1.5),'summit_stone',x,z,2.1,520,6,{repeat:3});wall.rotation.y=-a}for(let i=0;i<8;i++){const a=i/8*Math.PI*2,x=Math.cos(a)*38,z=Math.sin(a)*38;this.themedProp(new THREE.CylinderGeometry(2.6,3.5,12,8),'marble',x,z,6,720,3.5,{repeat:2})}}
  buildJungleRuins(){for(const [cx,cz] of [[-92,-68],[94,-62],[-76,96],[82,88]])for(let i=0;i<10;i++){const a=i/10*Math.PI*2,r=15+(i%2)*7,x=cx+Math.cos(a)*r,z=cz+Math.sin(a)*r;if(this.nearBase(x,z,31))continue;const pillar=this.themedProp(new THREE.BoxGeometry(3,8+(i%3)*2,3),'moss_stone',x,z,4+(i%3),520,2,{repeat:3});pillar.rotation.y=a*.7}for(let i=0;i<20;i++){const a=i/20*Math.PI*2,r=48+(i%3)*19,x=Math.cos(a)*r,z=Math.sin(a)*r;const idol=this.themedProp(new THREE.ConeGeometry(2.2,9,5),'sandstone',x,z,4.5,440,2.4,{repeat:2});idol.rotation.z=i%2?.12:-.12}}
  buildVolcanicFoundry(){
    const lava=new THREE.Mesh(new THREE.RingGeometry(39,81,96),this.materials.building('lava_crust',{emissive:0xff3d00,emissiveIntensity:.85}));lava.rotation.x=-Math.PI/2;lava.position.y=this.heightAt(0,0)+.08;this.scene.add(lava);
    for(let i=0;i<20;i++){if(i%5===0)continue;const a=i/20*Math.PI*2,r=102+(i%2)*9,x=Math.cos(a)*r,z=Math.sin(a)*r;const tower=this.themedProp(new THREE.CylinderGeometry(3.2,4.5,13,8),'corrugated_steel',x,z,6.5,820,4.5,{repeat:3});tower.rotation.y=a}for(const [x,z,r] of [[-135,-70,.2],[132,-72,-.3],[-126,92,-.15],[128,96,.25]]){const hall=this.themedProp(new THREE.BoxGeometry(28,9,18),'vehicle_metal',x,z,4.5,1100,14,{repeat:4});hall.rotation.y=r;}
  }
  buildSecretPlaces(){
    const plans=DEATHMATCH_SECRET_PLANS[this.map.id]||[];
    for(const {name,x,z,wall:wallTexture,cache:cacheTexture,reward} of plans){
      const objects=[],angle=Math.atan2(-x,-z),group=new THREE.Group();group.name=`secret-${name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`;this.scene.add(group);
      const walls=[[0,7,18,1.4,0],[-8.3,0,1.4,15,0],[8.3,0,1.4,15,0]];
      for(const [dx,dz,w,d,rotation] of walls){const wall=this.themedProp(new THREE.BoxGeometry(w,5,d),wallTexture,x+dx,z+dz,2.5,760,Math.max(w,d)*.5,{repeat:3});wall.rotation.y=angle+rotation;objects.push(wall)}
      const pedestal=this.themedProp(new THREE.CylinderGeometry(3.2,4.2,1.3,8),cacheTexture,x,z,0.65,620,4.2,{repeat:2,walkable:true});objects.push(pedestal);
      for(const side of [-1,1]){const marker=this.themedProp(new THREE.ConeGeometry(.65,3.8,5),'crystal',x+side*5,z-3,1.9,240,.8,{emissive:this.map.accent,emissiveIntensity:.7});objects.push(marker)}
      const caches=[];for(const [dx,type] of [[-1.6,'yellow'],[1.6,reward]]){const position=new THREE.Vector3(x+dx,0,z);position.y=this.groundAt(position);const crate=this.factory.createCrate(position,CRATE_TYPES[type]);crate.sourceDropZoneId=`secret-${name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`;this.crates.push(crate);caches.push(crate)}
      this.secretPlaces.push({name,position:new THREE.Vector3(x,this.heightAt(x,z),z),radius:11,objects,caches});
    }
  }
  buildSunkenCrown(){
    const walls=[[-28,-18,22,2,0],[-28,18,22,2,0],[28,-18,22,2,0],[28,18,22,2,0],[-58,5,18,2,.5],[58,5,18,2,-.5]];
    for(const [x,z,w,h,r] of walls){const wall=this.themedProp(new THREE.BoxGeometry(w,4.5,1.5),'moss_stone',x,z,2.25,620,w*.5,{repeat:3});wall.rotation.y=r;}
    for(let level=0;level<4;level++){const size=30-level*5,y=level*1.6;const terrace=new THREE.Mesh(new THREE.BoxGeometry(size,1.5,size),this.materials.building(level%2?'moss_stone':'sandstone',{repeat:4}));terrace.position.set(0,this.heightAt(0,0)+y,0);terrace.receiveShadow=terrace.castShadow=true;this.scene.add(terrace);this.registerCollider(terrace,{shape:'box',halfX:size/2,halfZ:size/2,top:.75,blocking:false,walkable:true});}
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
    const altar=new THREE.Mesh(new THREE.CylinderGeometry(13,17,3,12),this.materials.building('marble',{repeat:3}));altar.position.set(0,this.heightAt(0,0)+1.5,0);altar.castShadow=altar.receiveShadow=true;this.scene.add(altar);this.registerCollider(altar,{shape:'cylinder',radius:16.5,top:1.5,blocking:true,walkable:true});
    for(const side of [-1,1])for(let step=0;step<4;step++){const height=.65+step*.62,z=side*(20-step*1.35),stairs=new THREE.Mesh(new THREE.BoxGeometry(6.5,height,2),this.materials.building(step%2?'neon_concrete':'marble',{repeat:2}));stairs.position.set(0,this.heightAt(0,z)+height/2,z);stairs.castShadow=stairs.receiveShadow=true;this.scene.add(stairs);this.registerCollider(stairs,{shape:'box',halfX:3.25,halfZ:1,top:height/2,blocking:false,walkable:true});}
  }
  dominationTowerPlans(){
    if(this.map.id==='serpent')return [['FANG',-70,-22],['COIL',-46,28],['HEART',-22,-10],['CROWN',0,18],['SCALE',25,-13],['TEMPLE',49,30],['TAIL',72,-24]];
    if(this.map.id==='eclipse')return [['DAWN',0,-54],['TITAN',52,-18],['DUSK',32,46],['MOON',-32,46],['ABYSS',-52,-18]];
    return [['SUN',0,0],['ROOT',-48,-28],['FLOOD',48,-28],['JAGUAR',-42,38],['SKY',42,38]];
  }
  createDominationTowers(){
    const neutral=0x111725,themeTexture={sunken:'moss_stone',serpent:'summit_stone',eclipse:'neon_concrete'}[this.map.id]||'moss_stone';
    this.dominationTowers=this.dominationTowerPlans().map(([label,x,z],index)=>{
      const position=new THREE.Vector3(x,this.heightAt(x,z),z),group=new THREE.Group();group.position.copy(position);group.name=`domination-tower-${label.toLowerCase()}`;
      const foundation=new THREE.Mesh(new THREE.BoxGeometry(13.8,.35,13.8),this.materials.building(themeTexture,{repeat:3}));foundation.position.y=.175;foundation.castShadow=foundation.receiveShadow=true;group.add(foundation);
      const lowerStep=new THREE.Mesh(new THREE.BoxGeometry(12.4,.34,12.4),this.materials.building('metal',{repeat:3}));lowerStep.position.y=.46;lowerStep.castShadow=lowerStep.receiveShadow=true;group.add(lowerStep);
      const pedestalMat=this.materials.teamTextured('corrugated_steel',neutral,3);pedestalMat.emissive=new THREE.Color(0x000000);pedestalMat.emissiveIntensity=.45;
      const pedestal=new THREE.Mesh(new THREE.BoxGeometry(10.8,.58,10.8),pedestalMat);pedestal.position.y=.86;pedestal.castShadow=pedestal.receiveShadow=true;group.add(pedestal);
      const spireMat=this.materials.teamTextured('vehicle_metal',neutral,2),spire=new THREE.Mesh(new THREE.BoxGeometry(1.8,8,1.8),spireMat);spire.position.y=5.15;spire.castShadow=true;group.add(spire);
      const crown=new THREE.Mesh(new THREE.OctahedronGeometry(1.45),spireMat);crown.position.y=10;crown.rotation.z=Math.PI/4;group.add(crown);
      const squareMats=[0,1].map(()=>new THREE.MeshBasicMaterial({color:neutral,transparent:true,opacity:.18,wireframe:true,depthWrite:false,blending:THREE.AdditiveBlending}));
      const energySquares=squareMats.map((mat,i)=>{const square=new THREE.Mesh(new THREE.BoxGeometry(8.8-i*1.35,.08,8.8-i*1.35),mat);square.position.y=1.21+i*.09;square.scale.setScalar(.72);group.add(square);return square});
      const beamMat=new THREE.MeshBasicMaterial({color:neutral,transparent:true,opacity:.04,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});const beam=new THREE.Mesh(new THREE.CylinderGeometry(1.5,3.2,22,12,1,true),beamMat);beam.position.y=11.5;group.add(beam);
      const cornerLights=[];for(const sx of [-1,1])for(const sz of [-1,1]){const support=new THREE.Mesh(new THREE.BoxGeometry(.48,1.7,.48),this.materials.building('corrugated_steel'));support.position.set(sx*5.35,1.45,sz*5.35);support.castShadow=true;group.add(support);const lampMat=new THREE.MeshBasicMaterial({color:neutral});const lamp=new THREE.Mesh(new THREE.BoxGeometry(.72,.18,.72),lampMat);lamp.position.set(sx*5.35,2.34,sz*5.35);group.add(lamp);cornerLights.push(lamp)}
      this.scene.add(group);
      this.registerCollider(foundation,{shape:'box',halfX:6.9,halfZ:6.9,top:.175,blocking:false,walkable:true});this.registerCollider(lowerStep,{shape:'box',halfX:6.2,halfZ:6.2,top:.17,blocking:false,walkable:true});this.registerCollider(pedestal,{shape:'box',halfX:5.4,halfZ:5.4,top:.29,blocking:false,walkable:true});this.registerCollider(spire,{shape:'box',halfX:.9,halfZ:.9,top:4,bottom:-4,blocking:true});
      return{id:`tower-${index}`,label,position,radius:5.2,group,foundation,lowerStep,pedestal,spire,crown,pedestalMat,spireMat,energySquares,squareMats,beam,beamMat,cornerLights,ownerTeam:null,captureTeam:null,captureProgress:0,contested:false,captureFlash:0};
    });
  }
  buildDecorations() {
    if(this.gameMode==='campaign')return;
    if(this.gameMode==='deathmatch'){
      for(const base of Object.values(this.basePositions)){const inward=base.clone().multiplyScalar(-1).setY(0).normalize(),junction=inward.clone().multiplyScalar(112);this.createRoad(base.clone().addScaledVector(inward,25),junction,5.5);this.createRoad(junction,new THREE.Vector3(0,0,0),4.2)}
      const random=this.seeded(9981);for(let i=0;i<150;i++){const angle=random()*Math.PI*2,radius=this.bounds-18-random()*14,x=Math.cos(angle)*radius,z=Math.sin(angle)*radius;if(this.nearBase(x,z,32))continue;if(this.map.id==='rift'||this.map.id==='crown')this.createRock(x,z,1+random()*2.1);else this.createTree(x,z,.8+random()*.9)}return;
    }
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
    if(this.destroJet){const {group,drop,beam,beaconTop,engineGlows=[],navLights=[],runwayLights=[],jetLight,extractionLight,baseY}=this.destroJet,pulse=.72+Math.sin(time*8)*.25;group.position.y=baseY+Math.sin(time*1.8)*.22;group.rotation.z=Math.sin(time*.9)*.018;group.rotation.x=Math.sin(time*1.15)*.012;drop.rotation.y=time*.9;drop.scale.setScalar(1+Math.sin(time*4.5)*.06);if(beam)beam.material.opacity=.08+Math.sin(time*5)*.045;if(beaconTop){beaconTop.rotation.z=time*1.7;beaconTop.scale.setScalar(1+Math.sin(time*3.5)*.12)}engineGlows.forEach((glow,i)=>{glow.material.opacity=pulse;glow.scale.setScalar(1+Math.sin(time*13+i)*.3)});navLights.forEach((light,i)=>light.visible=Math.sin(time*5+i*Math.PI)>.05);runwayLights.forEach((light,i)=>{light.material.opacity=.45+Math.sin(time*4-i*.7)*.45;light.scale.y=.8+Math.sin(time*5-i)*.2});if(jetLight)jetLight.intensity=18+pulse*12;if(extractionLight)extractionLight.intensity=22+Math.sin(time*4)*8}
    this.waterMaterial.uniforms.uTime.value = time;
    for(const [i,tower] of this.dominationTowers.entries()){
      const capture=tower.captureProgress/5,pulse=.5+.5*Math.sin(time*(tower.contested?13:4)+i),active=Boolean(tower.captureTeam);
      tower.crown.rotation.y=time*(active?2.8:1.05)+i;tower.crown.rotation.z=Math.PI/4+Math.sin(time*2+i)*.12;
      tower.energySquares.forEach((square,n)=>{square.rotation.y=time*(active?(n? -2.35:1.9):(n?-.28:.22))+i*.17;const breathe=active?.72+capture*.32+pulse*.14:.68+pulse*.06;square.scale.setScalar(breathe);square.position.y=1.22+n*.13+(active?Math.sin(time*5+n)*.11:0);square.material.opacity=tower.contested?.72:(active?.25+capture*.52:.11+pulse*.05)});
      tower.beamMat.opacity=tower.contested?.2:(tower.ownerTeam?.1:.025)+capture*.23+tower.captureFlash*.35;tower.beam.scale.x=tower.beam.scale.z=1+capture*.24+pulse*(active?.1:.025);
      for(const lamp of tower.cornerLights)lamp.material.color.setHex(tower.contested?(pulse>.48?0xff334d:0xffd23f):tower.visualColor||0x111725);
      tower.captureFlash=Math.max(0,tower.captureFlash-dt*1.45);tower.group.scale.y=1+Math.sin(time*2.2+i)*.006;
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
      const ground = this.groundAt(c.group.position);
      if (c.dropMarker) { const pulse=.88+Math.sin(time*5)*.12;c.dropMarker.scale.setScalar(pulse);c.dropMarker.rotation.y=time*.35; }
      if (c.carried || c.placed) continue;
      if (c.physicsActive) {
        const body = c.visual || c.group;
        const sample=.35,dx=(this.heightAt(c.group.position.x+sample,c.group.position.z)-this.heightAt(c.group.position.x-sample,c.group.position.z))/(sample*2),dz=(this.heightAt(c.group.position.x,c.group.position.z+sample)-this.heightAt(c.group.position.x,c.group.position.z-sample))/(sample*2);
        c.velocity.x-=dx*8*dt;c.velocity.z-=dz*8*dt;c.velocity.y-=22*dt;c.group.position.addScaledVector(c.velocity,dt);
        body.rotation.x+=c.angularVelocity.x*dt;body.rotation.y+=c.angularVelocity.y*dt;body.rotation.z+=c.angularVelocity.z*dt;
        const landedAt=this.groundAt(c.group.position)+this.crateContactOffset(c);
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
      const ground=this.groundAt(p.group.position)+.05;
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
  navigationBlockedAt(position,radius=.72,entity=null){
    for(const collider of this.collidersNear(position,radius)){if(!collider.enabled||!collider.blocking||collider.entity?.dead||collider.entity===entity)continue;if(this.colliderContains(position,collider,radius))return true;}
    const circles=[...this.destructibles,...this.interactiveStructures,...Object.values(this.baseTurrets||{}),...Object.values(this.factories||{})];
    for(const obstacle of circles){if(!obstacle||obstacle===entity||obstacle.dead||obstacle.colliderHandles?.length)continue;const min=radius+(obstacle.radius||1),dx=position.x-obstacle.group.position.x,dz=position.z-obstacle.group.position.z;if(dx*dx+dz*dz<min*min)return true;}
    return false;
  }
  // global pathfinding entry points (grid built at the end of build())
  findPath(from,to,radius=.72){return this.nav?this.nav.findPath(from,to,Math.max(radius,.78)):null;}
  navLineClear(from,to,radius=.72,maxDistance=Infinity){return this.nav?this.nav.lineClear(from,to,Math.max(radius,.78),maxDistance):true;}
  navigationDirection(position,desired,radius=.72,lookAhead=3,entity=null,preferredSide=1){
    const base=desired.clone().setY(0);if(base.lengthSq()<1e-6)return base;base.normalize();
    // the nav grid answers whisker probes in O(1); dynamic bodies are not
    // rasterized, so the entity exclusion only matters on the slow path
    const blockedProbe=this.nav?sample=>this.nav.blockedAt(sample.x,sample.z,radius):sample=>this.navigationBlockedAt(sample,radius,entity);
    const clear=direction=>{for(const fraction of [.32,.62,1]){const sample=position.clone().addScaledVector(direction,lookAhead*fraction);if(blockedProbe(sample))return false;}return true;};
    if(clear(base))return base;
    const side=preferredSide<0?-1:1,angles=[30,52,76,100,128,155].flatMap(degrees=>[side*degrees,-side*degrees]).map(degrees=>THREE.MathUtils.degToRad(degrees));
    let best=null,bestScore=-Infinity;
    for(const angle of angles){const candidate=base.clone().applyAxisAngle(new THREE.Vector3(0,1,0),angle);if(!clear(candidate))continue;const sideBias=Math.sign(angle)===side ? .035 : 0,score=candidate.dot(base)-Math.abs(angle)*.08+sideBias;if(score>bestScore){best=candidate;bestScore=score;}}
    return best||base.clone().applyAxisAngle(new THREE.Vector3(0,1,0),side*Math.PI*.72);
  }
  resolveCollisions(entity) {
    if (entity.dead || entity.stationary) return 0;
    const pos = entity.group.position;
    const r1 = entity.radius || 0.72;
    let collisions=0;

    // Geometry-aware blockers are used for authored buildings, ruins, tower
    // cores and other large props. Walkable floors deliberately do not block.
    for(const collider of this.collidersNear(pos,r1)){
      if(!collider.enabled||!collider.blocking||collider.entity?.dead||collider.entity===entity)continue;
      const frame=this.colliderFrame(collider),top=frame.position.y+collider.top;
      if(pos.y>=top-1.05)continue;
      const dx=pos.x-frame.position.x,dz=pos.z-frame.position.z;
      if(collider.shape==='cylinder'){
        const min=collider.radius+r1,distSq=dx*dx+dz*dz;if(distSq>=min*min)continue;collisions++;const dist=Math.sqrt(distSq)||1;pos.x=frame.position.x+(distSq?dx/dist:1)*min;pos.z=frame.position.z+(distSq?dz/dist:0)*min;
      }else{
        const cos=Math.cos(-frame.rotation),sin=Math.sin(-frame.rotation),lx=dx*cos-dz*sin,lz=dx*sin+dz*cos,hx=collider.halfX+r1,hz=collider.halfZ+r1;if(Math.abs(lx)>=hx||Math.abs(lz)>=hz)continue;
        collisions++;
        const pushX=hx-Math.abs(lx),pushZ=hz-Math.abs(lz);let outX=lx,outZ=lz;if(pushX<pushZ)outX=(lx<0?-1:1)*hx;else outZ=(lz<0?-1:1)*hz;
        const rcos=Math.cos(frame.rotation),rsin=Math.sin(frame.rotation);pos.x=frame.position.x+outX*rcos-outZ*rsin;pos.z=frame.position.z+outX*rsin+outZ*rcos;
      }
    }

    // 1. Destructibles (rocks, trees, sandbags, neutral buildings)
    for (const obs of [...this.destructibles, ...this.interactiveStructures, ...Object.values(this.baseTurrets||{})]) {
      if (obs.dead||obs.colliderHandles?.length) continue;
      const obsPos = obs.group.position;
      const dx = pos.x - obsPos.x;
      const dz = pos.z - obsPos.z;
      const distSq = dx * dx + dz * dz;
      const minDist = r1 + (obs.radius || 1);
      if (distSq < minDist * minDist) {
        collisions++;
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
        collisions++;
        const dist = Math.sqrt(distSq);
        if (dist > 0.001) {
          const overlap = minDist - dist;
          pos.x += (dx / dist) * overlap;
          pos.z += (dz / dist) * overlap;
        }
      }
    }

    // 3. Cave structure
    if (this.cavePosition && this.caveGroup) {
      const cPos = this.cavePosition;
      const dx = pos.x - cPos.x;
      const dz = pos.z - cPos.z;
      const distSq = dx * dx + dz * dz;
      const minDist = r1 + 4.5;
      if (distSq < minDist * minDist) {
        collisions++;
        const dist = Math.sqrt(distSq);
        if (dist > 0.001) {
          const overlap = minDist - dist;
          pos.x += (dx / dist) * overlap;
          pos.z += (dz / dist) * overlap;
        }
      }
    }
    return collisions;
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
  dispose() { this.waterMaterial.dispose(); for (const mesh of this.surfaceMeshes || []) mesh.geometry.dispose(); }
}
