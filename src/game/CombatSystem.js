import * as THREE from 'three';
import { configureProjectileRig, createProjectileRig } from './ProjectileModels.js';
import { MARKETPLACE_COSMETICS } from '../data/marketplaceData.js';

const tube = (radius, length, sides = 8) => { const g = new THREE.CylinderGeometry(radius, radius, length, sides); g.rotateX(Math.PI / 2); return g; };
const PROJECTILE_GEOS = Object.freeze({
  slug: new THREE.SphereGeometry(.09, 6, 4), dart: new THREE.ConeGeometry(.055, .4, 6).rotateX(Math.PI / 2), lance: new THREE.BoxGeometry(.055, .055, .55),
  tracer: new THREE.BoxGeometry(.055, .055, .28), grenade: new THREE.DodecahedronGeometry(.17, 0), pellet: new THREE.SphereGeometry(.055, 5, 3),
  bolt: new THREE.OctahedronGeometry(.1, 0), mine: tube(.24, .1, 10), rocket: tube(.1, .52, 8), missile: tube(.1, .52, 8), arc: new THREE.TorusGeometry(.13, .035, 5, 10), plasma: new THREE.IcosahedronGeometry(.17, 1),
  tank_shell_brown: tube(.13, .65, 8), tank_shell_yellow: new THREE.SphereGeometry(.17, 8, 6), tank_shell_blue: new THREE.OctahedronGeometry(.18, 1), tank_shell_red: tube(.16, .65, 8),
});
const STYLE_NAMES=Object.keys(PROJECTILE_GEOS),DETAIL_STYLES=new Set(['grenade','rocket','missile','tank_shell_brown','tank_shell_yellow','tank_shell_blue','tank_shell_red']);
// approximate z-length of each projectile geometry — used to stretch instances along
// last frame's travel so fast bullets render as continuous tracers instead of dots
const STYLE_LENGTHS={slug:.18,dart:.4,lance:.55,tracer:.28,grenade:.34,pellet:.11,bolt:.2,mine:.1,rocket:.52,missile:.52,arc:.33,plasma:.34,tank_shell_brown:.65,tank_shell_yellow:.45,tank_shell_blue:.45,tank_shell_red:.65};
const WORLD_GRAVITY=18,POWER_REFERENCE=50,POOL_SIZE=2048,MINE_POOL_SIZE=256,DETAIL_POOL_SIZE=128,SPATIAL_CELL=8;
export const PROJECTILE_SPREAD_SCALE=.7;
export const ballisticGravity=weapon=>weapon?.ballistic===false||weapon?.mine?0:WORLD_GRAVITY*(POWER_REFERENCE/Math.max(1,weapon?.shotPower||POWER_REFERENCE));

function solveAt(origin,target,weapon){
  const speed=Math.max(.001,weapon?.bulletSpeed||0),gravity=ballisticGravity(weapon),dx=target.x-origin.x,dz=target.z-origin.z,x=Math.hypot(dx,dz),dy=target.y-origin.y;
  if(!gravity||x<1e-5)return target.clone().sub(origin).normalize();
  const speed2=speed*speed,disc=speed2*speed2-gravity*(gravity*x*x+2*dy*speed2);if(disc<0)return null;
  const tan=(speed2-Math.sqrt(disc))/(gravity*x),cos=1/Math.sqrt(1+tan*tan),sin=tan*cos;
  return new THREE.Vector3(dx/x*cos,sin,dz/x*cos).normalize();
}
export function solveBallisticDirection(origin,target,weapon,targetVelocity=null){
  if(!origin||!target||!weapon)return null;if(weapon.ballistic===false)return target.clone().sub(origin).normalize();
  let point=target.clone(),direction=solveAt(origin,point,weapon);if(!direction||!targetVelocity)return direction;
  for(let i=0;i<2;i++){const horizontal=Math.hypot(point.x-origin.x,point.z-origin.z),horizontalSpeed=Math.max(.001,(weapon.bulletSpeed||0)*Math.hypot(direction.x,direction.z)),time=horizontal/horizontalSpeed;point.copy(target).addScaledVector(targetVelocity,time);direction=solveAt(origin,point,weapon);if(!direction)break}
  return direction;
}

const finiteVector=v=>Number.isFinite(v.x)&&Number.isFinite(v.y)&&Number.isFinite(v.z);
const targetHeight=target=>target?.type==='unit'?1.2:target?.type==='vehicle'?1.5:1;

export class CombatSystem {
  constructor(scene, particles, getTargets, onDeath, onDamage = null, isHostile = null, heightAt = null, onStat = null, getImpulseTargets = null, worldQuery = null) {
    this.scene=scene;this.particles=particles;this.getTargets=getTargets;this.onDeath=onDeath;this.onDamage=onDamage;this.isHostile=isHostile||((a,b)=>a!==b);this.heightAt=heightAt;this.onStat=onStat;this.getImpulseTargets=getImpulseTargets||(()=>[]);this.world=worldQuery;
    this.pool=[];this.freeSlots=[];this.freeMineSlots=[];this.activeSlots=new Set();this.activeCount=0;this.activeMines=0;this.projectileSpawnDenied=0;this.hash=new Map();this._candidateSet=new Set();this._dummy=new THREE.Object3D();this._matrix=new THREE.Matrix4();this._color=new THREE.Color();this._travel=new THREE.Vector3();this._spreadRight=new THREE.Vector3();this._spreadUp=new THREE.Vector3();this._spreadAxis=new THREE.Vector3();
    for(let i=0;i<POOL_SIZE+MINE_POOL_SIZE;i++){const mineSlot=i>=POOL_SIZE;this.pool.push({index:i,mineSlot,active:false,position:new THREE.Vector3(),previous:new THREE.Vector3(),velocity:new THREE.Vector3(),age:0,maxAge:Infinity,shooter:null,weapon:null,mine:false,trailTimer:0,detail:null,style:'slug',scale:1});(mineSlot?this.freeMineSlots:this.freeSlots).push((mineSlot?POOL_SIZE+MINE_POOL_SIZE:POOL_SIZE)-1-(i-(mineSlot?POOL_SIZE:0)))}
    this.instanceMeshes={};for(const style of STYLE_NAMES){const material=new THREE.MeshBasicMaterial({color:0xffffff,vertexColors:true,toneMapped:false});const mesh=new THREE.InstancedMesh(PROJECTILE_GEOS[style],material,POOL_SIZE);mesh.count=0;mesh.frustumCulled=false;mesh.castShadow=false;mesh.receiveShadow=false;scene.add(mesh);this.instanceMeshes[style]=mesh}
    this.detailPool=[];for(let i=0;i<DETAIL_POOL_SIZE;i++){const mesh=createProjectileRig();mesh.visible=false;scene.add(mesh);this.detailPool.push({mesh,active:false})}
  }
  setWorld(world){this.world=world;return this}
  ground(x,z){return this.world?.groundAt?this.world.groundAt({x,z}):this.heightAt?this.heightAt(x,z):0}
  surfaceAt(position){return this.world?.surfaceAt?.(position)||'dirt'}
  projectileFloor(position){return this.world?.isWater?.(position) ? .12 : this.ground(position.x,position.z)}
  canHit(shooter,target){return target.type==='prop'||target.team==='neutral'||shooter.team==='neutral'||this.isHostile(shooter.team,target.team)}
  muzzleAnchors(shooter){return (shooter?.muzzleAnchors||[]).filter(anchor=>anchor?.getWorldPosition)}
  muzzlePosition(shooter,index=0,out=new THREE.Vector3()){
    const anchors=this.muzzleAnchors(shooter);
    if(anchors.length){
      const anchor=anchors[index%anchors.length];
      if(anchor?.updateWorldMatrix)anchor.updateWorldMatrix(true,false);
      else if(shooter.group?.updateMatrixWorld)shooter.group.updateMatrixWorld(true);
      return anchor.getWorldPosition(out);
    }
    if(shooter.group?.updateMatrixWorld)shooter.group.updateMatrixWorld(true);
    const start=shooter.group.position,muzzleHeight=shooter.type==='turret'?2.55:shooter.type==='vehicle'?2.35:1.35;return out.set(start.x,start.y+muzzleHeight,start.z).addScaledVector(shooter.aim||new THREE.Vector3(0,0,1),1.05)
  }
  ballisticDirectionFor(shooter,target){if(!shooter?.weapon||!target?.group)return null;const origin=this.muzzlePosition(shooter,0,new THREE.Vector3()),point=target.group.position.clone().add(new THREE.Vector3(0,targetHeight(target),0));return solveBallisticDirection(origin,point,shooter.weapon,target.velocity)}
  ballisticDirectionTo(shooter,point,targetVelocity=null){if(!shooter?.weapon||!point)return null;return solveBallisticDirection(this.muzzlePosition(shooter,0,new THREE.Vector3()),point,shooter.weapon,targetVelocity)}
  shoot(shooter,direction){
    if(shooter.dead||shooter.fireCooldown>0||shooter.freeze>0)return false;const base=shooter.weapon,pellets=base.pellets||1,available=base.mine?this.freeMineSlots:this.freeSlots;if(available.length<pellets){this.projectileSpawnDenied++;return false}
    if(Number.isFinite(shooter.ammo)&&shooter.weaponId!=='pistol'){if(shooter.ammo<=0)return false;shooter.ammo--}
    let multiplier=shooter.nextShotMultiplier||1;if(shooter.overchargeShots>0){multiplier*=3;shooter.overchargeShots--}if(shooter.buffs?.damage>0)multiplier*=1.5;if(shooter.passive?.id==='sharpshooter')multiplier*=1.18;const w=multiplier===1?base:{...base,damage:base.damage*multiplier};let rateBoost=(shooter.overdriveTimer>0?2:1)*(shooter.rallyTimer>0?1.25:1)*(shooter.frenzyTimer>0?2:1)*(shooter.buffs?.rapid>0?1.7:1);if(shooter.passive?.id==='rapidhands')rateBoost*=1.15;shooter.fireCooldown=w.rate/rateBoost;
    const anchors=this.muzzleAnchors(shooter),flashCount=Math.max(1,anchors.length&&w.pellets?anchors.length:1);for(let i=0;i<flashCount;i++)this.particles?.muzzleFlash?.(this.muzzlePosition(shooter,i,new THREE.Vector3()),direction,w,anchors[i]||null);
    for(let i=0;i<pellets;i++)this.spawn(shooter,direction,w,i);
    shooter.nextShotMultiplier=1;shooter.cloakTimer=0;shooter.recoil=Math.min(1,.35+(w.recoil||0)*.09);if(shooter.velocity&&w.recoil)shooter.velocity.addScaledVector(direction,-(w.recoil||0));this.playShotAudio(shooter);return true
  }
  playShotAudio(shooter){if(!this.audio||!shooter.group?.position)return;let soundName='pistol',rate=.85+Math.random()*.3;if(shooter.type==='turret'){soundName='turret';rate=.7+Math.random()*.15}else if(shooter.weaponId){if(shooter.weaponId==='uzi')soundName='uzi';else if(shooter.weaponId==='flamethrower'){soundName='turret';rate=1.6+Math.random()*.2}else if(shooter.weaponId==='railgun'){soundName='sniper';rate=.55}else if(shooter.weaponId==='freezeray'){soundName='sniper';rate=1.75}else if(shooter.weaponId==='cannon'){soundName='shotgun';rate=.35}else if(['machinegun','smg','rifle'].includes(shooter.weaponId))soundName='machinegun';else if(['shotgun','rocket','grenade'].includes(shooter.weaponId))soundName='shotgun';else if(shooter.weaponId==='grenadelauncher')soundName='grenade_launcher';else if(shooter.weaponId==='sniper')soundName='sniper';else if(['tesla','plasma'].includes(shooter.weaponId)){soundName='sniper';rate=1.35}}this.audio.play(soundName,shooter.group.position,rate)}
  spawn(shooter,direction,w,muzzleIndex=0){
    const equippedProj=shooter.projectileStyle;if(equippedProj){const cosmetic=MARKETPLACE_COSMETICS.find(item=>item.id===equippedProj&&item.kind==='projectile'),model=cosmetic?.visual?.model,style={laser:'lance',plasma:'plasma',pellet:'pellet',bolt:'bolt',comet:'plasma',heart:'bolt'}[model]||'tracer';w={...w,projectileStyle:style,color:cosmetic?.visual?.primary||w.color}}
    const slot=(w.mine?this.freeMineSlots:this.freeSlots).pop();if(slot===undefined){this.projectileSpawnDenied++;return null}const p=this.pool[slot];p.active=true;this.activeSlots.add(slot);p.shooter=shooter;p.weapon=w;p.age=0;p.trailTimer=0;p.mine=Boolean(w.mine);p.maxAge=p.mine?12:Infinity;p.style=w.projectileStyle||'slug';p.scale=w.projectileScale||1;p.detail=null;if(p.mine)this.activeMines++;else this.activeCount++;
    p.position.copy(this.muzzlePosition(shooter,muzzleIndex,p.position));if(p.mine){p.position.y=this.ground(p.position.x,p.position.z)+.12;p.velocity.set(0,0,0);p.scale*=2.2}else{const speed=w.bulletSpeed||0,spread=(w.spread||0)*PROJECTILE_SPREAD_SCALE;p.velocity.copy(direction).normalize();
      // spread is a cone half-angle in radians applied perpendicular to the shot —
      // never scaled by bullet speed, so the round always converges on the aim point
      if(spread>0){const axis=Math.abs(p.velocity.y)>.99?this._spreadAxis.set(1,0,0):this._spreadAxis.set(0,1,0),right=this._spreadRight.crossVectors(p.velocity,axis).normalize(),up=this._spreadUp.crossVectors(right,p.velocity).normalize(),theta=Math.random()*Math.PI*2,radius=Math.tan(spread)*Math.sqrt(Math.random());p.velocity.addScaledVector(right,Math.cos(theta)*radius).addScaledVector(up,Math.sin(theta)*radius)}
      p.velocity.normalize().multiplyScalar(speed);p.position.addScaledVector(p.velocity,.002);if(this.onStat&&shooter.team)this.onStat(shooter.team,'bulletsFired')}
    p.previous.copy(p.position);if(DETAIL_STYLES.has(p.style)){const detail=this.detailPool.find(item=>!item.active);if(detail){detail.active=true;detail.mesh.visible=true;configureProjectileRig(detail.mesh,p.style,PROJECTILE_GEOS[p.style]||PROJECTILE_GEOS.slug,w.color);detail.mesh.scale.setScalar(p.scale);p.detail=detail;this.syncDetail(p)}}return p
  }
  rebuildSpatialHash(){this.hash.clear();const targets=new Set([...(this.getTargets?.()||[]),...(this.getImpulseTargets?.()||[])]);for(const target of targets){if(!target?.group||target.dead||target.carried||target.placed)continue;const p=target.group.position,key=`${Math.floor(p.x/SPATIAL_CELL)},${Math.floor(p.z/SPATIAL_CELL)}`;let cell=this.hash.get(key);if(!cell){cell=[];this.hash.set(key,cell)}cell.push(target)}}
  candidatesFor(start,end,padding=2){this._candidateSet.clear();const minX=Math.floor((Math.min(start.x,end.x)-padding)/SPATIAL_CELL),maxX=Math.floor((Math.max(start.x,end.x)+padding)/SPATIAL_CELL),minZ=Math.floor((Math.min(start.z,end.z)-padding)/SPATIAL_CELL),maxZ=Math.floor((Math.max(start.z,end.z)+padding)/SPATIAL_CELL);for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){const cell=this.hash.get(`${x},${z}`);if(cell)for(const target of cell)this._candidateSet.add(target)}return this._candidateSet}
  segmentSphere(start,end,center,radius){const d=end.clone().sub(start),m=start.clone().sub(center),a=d.lengthSq();if(a<1e-10)return m.lengthSq()<=radius*radius?0:null;const b=m.dot(d),c=m.lengthSq()-radius*radius;if(c<=0)return 0;const disc=b*b-a*c;if(disc<0)return null;const t=(-b-Math.sqrt(disc))/a;return t>=0&&t<=1?t:null}
  colliderHit(start,end,collider){if(!collider?.enabled||collider.entity?.dead)return null;const frame=this.world.colliderFrame(collider),d=end.clone().sub(start),toLocal=point=>{const dx=point.x-frame.position.x,dz=point.z-frame.position.z,cos=Math.cos(-frame.rotation),sin=Math.sin(-frame.rotation);return new THREE.Vector3(dx*cos-dz*sin,point.y-frame.position.y,dx*sin+dz*cos)},a=toLocal(start),b=toLocal(end),v=b.clone().sub(a),minY=-.2,maxY=collider.top+.15;
    if(collider.shape==='cylinder'){const A=v.x*v.x+v.z*v.z,B=2*(a.x*v.x+a.z*v.z),C=a.x*a.x+a.z*a.z-collider.radius*collider.radius,disc=B*B-4*A*C;if(A<1e-9||disc<0)return null;for(const t of [(-B-Math.sqrt(disc))/(2*A),(-B+Math.sqrt(disc))/(2*A)])if(t>=0&&t<=1){const y=a.y+v.y*t;if(y>=minY&&y<=maxY)return t}return null}
    let near=0,far=1;for(const [origin,delta,min,max] of [[a.x,v.x,-collider.halfX,collider.halfX],[a.y,v.y,minY,maxY],[a.z,v.z,-collider.halfZ,collider.halfZ]]){if(Math.abs(delta)<1e-9){if(origin<min||origin>max)return null;continue}let t1=(min-origin)/delta,t2=(max-origin)/delta;if(t1>t2)[t1,t2]=[t2,t1];near=Math.max(near,t1);far=Math.min(far,t2);if(near>far)return null}return near>=0&&near<=1?near:null
  }
  terrainHit(start,end){const distance=start.distanceTo(end),steps=Math.max(1,Math.min(10,Math.ceil(distance))),delta=end.clone().sub(start),point=new THREE.Vector3(),previous=start.clone(),surfaceY=this.projectileFloor(previous),previousGap=previous.y-surfaceY;if(previousGap<=0)return{t:0,surface:this.surfaceAt(previous)};for(let i=1;i<=steps;i++){const t=i/steps;point.copy(start).addScaledVector(delta,t);const ground=this.projectileFloor(point),gap=point.y-ground;if(gap<=0){let lo=(i-1)/steps,hi=t;for(let n=0;n<6;n++){const mid=(lo+hi)/2;point.copy(start).addScaledVector(delta,mid);const h=this.projectileFloor(point);if(point.y-h>0)lo=mid;else hi=mid}point.copy(start).addScaledVector(delta,hi);return{t:hi,surface:this.surfaceAt(point)}}previous.copy(point)}return null}
  boundsHit(start,end){const b=this.world?.bounds;if(!b)return null;if(Math.abs(end.x)<=b&&Math.abs(end.z)<=b)return null;const d=end.clone().sub(start),times=[];if(d.x>0)times.push((b-start.x)/d.x);else if(d.x<0)times.push((-b-start.x)/d.x);if(d.z>0)times.push((b-start.z)/d.z);else if(d.z<0)times.push((-b-start.z)/d.z);const valid=times.filter(t=>t>=0&&t<=1).sort((a,b)=>a-b);return valid.length?valid[0]:1}
  findImpact(p,start,end){
    let best=null,bestT=Infinity;const pointAt=t=>start.clone().lerp(end,t);
    const isSelfOrRider=target=>{
      if(!target||!p.shooter)return false;
      if(target===p.shooter)return true;
      if(p.shooter.driver===target)return true;
      if(Array.isArray(p.shooter.passengers)&&p.shooter.passengers.includes(target))return true;
      if(p.shooter.passenger===target)return true;
      return false;
    };
    for(const target of this.candidatesFor(start,end,p.mine?3:2)){
      if(!target||target.dead||isSelfOrRider(target)||target.mountedTurret||target.mountedBunker||!this.canHit(p.shooter,target))continue;
      const center=target.group.position.clone().add(new THREE.Vector3(0,targetHeight(target),0)),radius=(target.radius||1)+(p.mine?2:.2),t=this.segmentSphere(start,end,center,radius);
      if(t!==null&&t<bestT){bestT=t;const point=pointAt(t);best={t,point,normal:point.clone().sub(center).normalize(),surface:target.type,target,reason:'target'}}
    }
    const colliders=this.world?.collidersForSegment?.(start,end,p.mine?3:2)||this.world?.colliders||[];
    for(const collider of colliders){
      if(isSelfOrRider(collider.entity)||collider.entity?.mountedTurret||collider.entity?.mountedBunker)continue;
      const target=collider.entity;
      if(target&&!this.canHit(p.shooter,target))continue;
      const t=this.colliderHit(start,end,collider);
      if(t!==null&&t<bestT){bestT=t;const point=pointAt(t);best={t,point,normal:p.velocity.clone().normalize().negate(),surface:target?.subtype||'structure',target,reason:'collider'}}
    }
    const terrain=this.terrainHit(start,end);if(terrain&&terrain.t<bestT){bestT=terrain.t;best={t:terrain.t,point:pointAt(terrain.t),normal:new THREE.Vector3(0,1,0),surface:terrain.surface,target:null,reason:'terrain'}}const boundary=this.boundsHit(start,end);if(boundary!==null&&boundary<bestT)best={t:boundary,point:pointAt(boundary),normal:p.velocity.clone().setY(0).normalize().negate(),surface:'boundary',target:null,reason:'bounds'};return best
  }
  update(dt){this.rebuildSpatialHash();for(const slot of this.activeSlots){const p=this.pool[slot];if(!p.active)continue;p.age+=dt;if(p.weapon.crimson){p.trailTimer-=dt;if(p.trailTimer<=0){p.trailTimer=.055;this.particles?.impact?.(p.position,0xff102c,{kind:'energy'})}}
      if(p.mine){const hit=this.findImpact(p,p.position,p.position);if(hit){this.explode(p,hit);continue}if(p.age>p.maxAge){this.release(p);continue}}
      else{p.previous.copy(p.position);const gravity=ballisticGravity(p.weapon);p.position.addScaledVector(p.velocity,dt);if(gravity)p.position.y-=.5*gravity*dt*dt;p.velocity.y-=gravity*dt;if(!finiteVector(p.position)||!finiteVector(p.velocity)){this.release(p);continue}const impact=this.findImpact(p,p.previous,p.position);this.particles?.bulletTrail?.(p.previous,impact?impact.point:p.position,p.weapon.color);if(impact){p.position.copy(impact.point);if(impact.reason==='bounds'){this.particles?.impact?.(impact.point,p.weapon.color,{kind:'boundary',normal:impact.normal,surface:'boundary'});this.release(p)}else if(p.weapon.explosive)this.explode(p,impact);else this.hit(p,impact);continue}}
      if(p.detail){if(p.style==='grenade'){p.detail.mesh.rotation.x+=dt*12;p.detail.mesh.rotation.y+=dt*8}this.syncDetail(p)}}this.syncInstances()
  }
  syncDetail(p){const mesh=p.detail?.mesh;if(!mesh)return;mesh.position.copy(p.position);if(p.velocity.lengthSq()>.001)mesh.lookAt(p.position.clone().add(p.velocity))}
  syncInstances(){const counts=Object.fromEntries(STYLE_NAMES.map(style=>[style,0]));for(const slot of this.activeSlots){const p=this.pool[slot];if(!p.active||p.detail)continue;const mesh=this.instanceMeshes[p.style]||this.instanceMeshes.slug,index=counts[p.style]??0;this._dummy.position.copy(p.position);this._dummy.scale.setScalar(p.scale);if(p.mine)this._dummy.scale.set(p.scale,p.scale*.2,p.scale);else if(p.velocity.lengthSq()>.001){
      // stretch the instance to cover the distance travelled this frame so fast rounds
      // draw as an unbroken streak between their previous and current positions
      const seg=this._travel.copy(p.position).sub(p.previous),len=seg.length(),baseLen=STYLE_LENGTHS[p.style]||.2;
      if(len>baseLen*p.scale){const stretch=Math.min(9,len/(baseLen*p.scale));this._dummy.scale.z=p.scale*stretch;this._dummy.position.addScaledVector(seg.multiplyScalar(1/len),-Math.min(len,baseLen*p.scale*stretch)*.5)}
      this._dummy.lookAt(p.position.clone().add(p.velocity))}this._dummy.updateMatrix();mesh.setMatrixAt(index,this._dummy.matrix);mesh.setColorAt(index,this._color.setHex(p.weapon.color));counts[p.style]=index+1}for(const style of STYLE_NAMES){const mesh=this.instanceMeshes[style];mesh.count=counts[style];mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true}}
  hit(p,impact){if(!impact?.point){const target=impact,point=target?.group?.position?.clone?.()||p.position?.clone?.()||p.mesh?.position?.clone?.()||new THREE.Vector3();impact={target,point,normal:p.velocity?.clone?.().normalize().negate()||new THREE.Vector3(0,1,0),surface:target?.subtype||target?.type||'dirt',reason:'target'}}if(this.onStat&&p.shooter?.team)this.onStat(p.shooter.team,'bulletsHit');const target=impact.target;if(target){if(target.type==='crate')this.applyPhysicsImpulse(target,p.velocity,p.weapon.knockback||Math.min(8,p.weapon.damage*.12));else this.applyDamage(target,p.weapon.damage,p.shooter,p.velocity,p.weapon.knockback)}this.particles?.impact?.(impact.point,p.weapon.color,{normal:impact.normal,surface:impact.surface,kind:'projectile'});const subtype=(target?.subtype||'').toLowerCase(),softTarget=target?.type==='unit'||target?.type==='wildlife'||(target?.type==='prop'&&(subtype.includes('tree')||subtype.includes('wood')));if(!softTarget)this.audio?.play('ricochet',impact.point,.9+Math.random()*.25);if(p.weapon.crimson){this.particles?.burst?.(impact.point,0xff001f,46,15);this.particles?.burst?.(impact.point,0xff5268,24,20)}this.release(p)}
  explode(p,impact){
    if(this.onStat&&p.shooter?.team)this.onStat(p.shooter.team,'bulletsHit');
    const pos=(impact?.point||p.position).clone();
    const style = p.style || '';
    const isBlue = style === 'tank_shell_blue';
    const isYellow = style === 'tank_shell_yellow';
    const isRed = style === 'tank_shell_red';

    this.particles?.impact?.(pos,p.weapon.color,{normal:impact?.normal,surface:impact?.surface,kind:'explosive'});
    this.particles?.burst?.(pos,p.weapon.color,isRed ? 90 : isBlue ? 54 : isYellow ? 64 : p.weapon.crimson ? 72 : 36, isRed ? 22 : isBlue ? 14 : 12);
    if(isRed) { this.particles?.burst?.(pos, 0xff5200, 50, 18); this.particles?.burst?.(pos, 0x220508, 40, 10); }
    else if(isBlue) { this.particles?.burst?.(pos, 0xffffff, 30, 8); }
    else if(isYellow) { this.particles?.burst?.(pos, 0xfffaab, 36, 15); }
    this.audio?.play('explosion',pos,.95+Math.random()*.15);

    for(const target of this.getTargets()){
      if(!target||target.dead||target===p.shooter||target.mountedTurret||target.mountedBunker||!this.canHit(p.shooter,target))continue;
      const dist=target.group.position.distanceTo(pos),radius=(isRed ? 8.5 : isBlue ? 6.5 : isYellow ? 6.0 : 5.2)*(p.weapon.projectileScale||1);
      if(dist>radius)continue;
      const falloff=1-dist/radius,dir=target.group.position.clone().sub(pos).setY(.4).normalize();
      this.applyDamage(target,p.weapon.damage*falloff,p.shooter,dir,p.weapon.knockback*falloff,true);
      if (isBlue && target.freeze !== undefined) { target.freeze = Math.max(target.freeze || 0, 1.8 * falloff); }
    }
    this.applyRadialPhysics(pos,(isRed ? 8.5 : isBlue ? 6.5 : 5.2)*(p.weapon.projectileScale||1),p.weapon.knockback||12);
    this.release(p);
  }
  applyPhysicsImpulse(target,direction,strength){if(!target?.velocity||!direction||!strength||target.carried||target.placed)return;const mass=Math.max(.75,target.mass||1),dir=direction.clone().normalize(),scale=strength/Math.pow(mass,.82);target.velocity.addScaledVector(dir,scale);target.velocity.y=Math.min(target.velocity.y,Math.max(1.4,scale*.32));target.physicsActive=true;target.falling=true;target.grounded=false;if(target.angularVelocity){target.angularVelocity.x+=(dir.z+(Math.random()-.5)*.45)*scale*.32;target.angularVelocity.y+=(Math.random()-.5)*scale*.18;target.angularVelocity.z+=(-dir.x+(Math.random()-.5)*.45)*scale*.32}}
  applyRadialPhysics(position,radius,knockback){for(const target of this.getImpulseTargets()){if(!target||target.carried||target.placed)continue;const dist=target.group.position.distanceTo(position);if(dist>radius)continue;const falloff=Math.max(.12,1-dist/radius),dir=target.group.position.clone().sub(position).setY(Math.max(.16,.45-dist/radius*.2)).normalize();this.applyPhysicsImpulse(target,dir,knockback*falloff)}}
  applyDamage(target,damage,source,direction,knockback=0,explosive=false,reflected=false){if(target?.invulnerable||target.dead||target.critical)return;const cover=target.mountedTurret||target.mountedBunker||target.mountedMotorcycle;if(cover&&!cover.dead)return this.applyDamage(cover,damage,source,direction,knockback,explosive,reflected);if(Number.isFinite(target.armor))damage*=Math.max(.15,1-target.armor);if(target.barrierTimer>0)damage*=.35;if(target.passive?.id==='thickskin')damage*=.88;else if(target.team&&target.team!=='neutral'){for(const ally of this.getTargets()){if(!ally||ally.dead||ally===target||ally.passive?.id!=='thickskin'||this.isHostile(ally.team,target.team))continue;if(ally.group.position.distanceToSquared(target.group.position)<25){damage*=.92;break}}}if(explosive&&target.passive?.id==='blastproof')damage*=.6;if(target.passive?.id==='lucky'&&Math.random()<.12)damage=0;if(target.rearPlate&&direction&&target.aim&&direction.dot(target.aim)>.35)damage*=.6;if(target.shield>0&&damage>0){const soaked=Math.min(target.shield,damage);target.shield-=soaked;damage-=soaked}target.hp-=damage;if(damage>0&&target.passive?.id==='adrenaline')target.statusTimer=Math.max(target.statusTimer||0,3);if(damage>0&&source?.passive?.id==='vampiric'&&Number.isFinite(source.maxHp))source.hp=Math.min(source.maxHp,source.hp+damage*.12);if(!reflected&&damage>0&&target.passive?.id==='thorns'&&source&&!source.dead&&Number.isFinite(source.hp))this.applyDamage(source,damage*.1,target,null,0,false,true);if(target.hp<=0&&target.passive?.id==='laststand'&&!target.lastStandUsed){target.lastStandUsed=true;target.hp=1}this.onDamage?.(target,damage,source,direction,explosive);if(target.velocity&&direction&&knockback&&target.passive?.id!=='stonefeet'){const dir=direction.clone().normalize();target.velocity.addScaledVector(dir,knockback);if(knockback>6){target.state='tumble';target.stun=Math.min(1.5,.25+knockback*.07)}}if(target.hp<=0){target.hp=0;if(target.delayedExplosion){target.critical=true;target.explosionTimer=3;target.lastDamageSource=source;target.lastDamageExplosive=explosive;return}target.dead=true;this.onDeath(target,source,{explosive})}}
  radial(position,radius,damage,source,knockback=8){this.particles?.burst?.(position.clone().add(new THREE.Vector3(0,.5,0)),0xffb44a,28,9);for(const target of this.getTargets()){if(!target||target.dead||target===source||target.mountedTurret||target.mountedBunker||(source&&!this.canHit(source,target)))continue;const dist=target.group.position.distanceTo(position);if(dist>radius)continue;const falloff=1-dist/radius,dir=target.group.position.clone().sub(position).setY(.35).normalize();this.applyDamage(target,damage*falloff,source,dir,knockback*falloff,true)}this.applyRadialPhysics(position,radius,knockback)}
  release(p){if(!p?.active)return;const wasMine=p.mine;p.active=false;this.activeSlots.delete(p.index);p.shooter=null;p.weapon=null;if(p.detail){p.detail.active=false;p.detail.mesh.visible=false;p.detail=null}if(wasMine){this.freeMineSlots.push(p.index);this.activeMines=Math.max(0,this.activeMines-1)}else{this.freeSlots.push(p.index);this.activeCount=Math.max(0,this.activeCount-1)}}
  diagnostics(){return{active:this.activeCount,mines:this.activeMines,poolSize:POOL_SIZE,minePoolSize:MINE_POOL_SIZE,free:this.freeSlots.length,freeMines:this.freeMineSlots.length,denied:this.projectileSpawnDenied,poolUsage:Math.round(this.activeCount/POOL_SIZE*100),effects:this.particles?.activeEffectCount?.()||0,activeProjectiles:this.activeCount,freeProjectiles:this.freeSlots.length,projectileSpawnDenied:this.projectileSpawnDenied}}
}
