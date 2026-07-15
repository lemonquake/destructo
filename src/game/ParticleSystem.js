import * as THREE from 'three';

export class ParticleSystem {
  constructor(scene, heightAt = null) {
    this.scene=scene;this.heightAt=heightAt;this.fragments=[];this.rings=[];this.stains=[];this.quality=1;this.cameraPosition=new THREE.Vector3();this.cameraQuaternion=new THREE.Quaternion();
    const geo=new THREE.BoxGeometry(.16,.16,.16);
    for(let i=0;i<260;i++){const mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:0xff6b3d,transparent:true}));mesh.visible=false;scene.add(mesh);this.fragments.push({mesh,velocity:new THREE.Vector3(),life:0,maxLife:1,isWater:false})}
    const ringGeo=new THREE.RingGeometry(.35,.62,10);for(let i=0;i<28;i++){const mesh=new THREE.Mesh(ringGeo,new THREE.MeshBasicMaterial({color:0x343443,transparent:true,side:THREE.DoubleSide,depthWrite:false}));mesh.visible=false;scene.add(mesh);this.rings.push({mesh,life:0,maxLife:1})}
    // pooled blood stains: reused meshes, faded out and hidden after 3s — no allocation per hit
    const stainGeo=new THREE.CircleGeometry(.55,9);
    for(let i=0;i<32;i++){const mesh=new THREE.Mesh(stainGeo,new THREE.MeshBasicMaterial({color:0x9c1622,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-6}));mesh.rotation.x=-Math.PI/2;mesh.visible=false;scene.add(mesh);this.stains.push({mesh,life:0})}

    // Combat effects are fixed-size pools: firing never creates geometry,
    // materials, meshes, or lights in the frame loop.
    this.muzzleFlashes=[];const flashGeo=new THREE.ConeGeometry(.16,.7,6,1,true);flashGeo.translate(0,.35,0);
    for(let i=0;i<64;i++){const mesh=new THREE.Mesh(flashGeo,new THREE.MeshBasicMaterial({color:0xffdc62,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,side:THREE.DoubleSide}));mesh.visible=false;mesh.renderOrder=20;scene.add(mesh);this.muzzleFlashes.push({mesh,life:0,maxLife:.07})}
    this.muzzleLights=[];for(let i=0;i<6;i++){const light=new THREE.PointLight(0xffb33a,0,7,2);light.visible=false;scene.add(light);this.muzzleLights.push({light,life:0,maxLife:.055})}
    // camera-facing flash cores: from the shoulder cam the aligned cone is seen end-on
    // and nearly invisible, so every shot also pops a bright billboarded disc
    this.flashCores=[];const coreGeo=new THREE.CircleGeometry(.5,12);
    for(let i=0;i<40;i++){const mesh=new THREE.Mesh(coreGeo,new THREE.MeshBasicMaterial({color:0xffe9a8,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,side:THREE.DoubleSide}));mesh.visible=false;mesh.renderOrder=21;scene.add(mesh);this.flashCores.push({mesh,life:0,maxLife:.06,startScale:1})}
    // pooled bullet tracers: a single instanced mesh of additive segments laid along each
    // projectile's per-frame travel, fading over ~0.1s to leave a visible trace line
    this.trailLimit=512;this.trails=[];this.trailCursor=0;this._trailDummy=new THREE.Object3D();this._trailColor=new THREE.Color();
    this.trailMesh=new THREE.InstancedMesh(new THREE.BoxGeometry(.05,.05,1),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}),this.trailLimit);
    this.trailMesh.count=0;this.trailMesh.frustumCulled=false;scene.add(this.trailMesh);
    for(let i=0;i<this.trailLimit;i++)this.trails.push({life:0,maxLife:.09,start:new THREE.Vector3(),end:new THREE.Vector3(),color:new THREE.Color()});
    this.impactClouds=[];const cloudGeo=new THREE.IcosahedronGeometry(.32,1);
    for(let i=0;i<48;i++){const mesh=new THREE.Mesh(cloudGeo,new THREE.MeshBasicMaterial({color:0x777781,transparent:true,opacity:0,depthWrite:false,blending:THREE.NormalBlending,toneMapped:false}));mesh.visible=false;scene.add(mesh);this.impactClouds.push({mesh,life:0,maxLife:.5,velocity:new THREE.Vector3(),startScale:1})}

    // pooled water ripples: horizontal rings flat on the water plane
    const rippleGeo = new THREE.RingGeometry(.3, .55, 16);
    this.waterRipples = [];
    for (let i = 0; i < 30; i++) {
      const mesh = new THREE.Mesh(rippleGeo, new THREE.MeshBasicMaterial({
        color: 0x8be5ff,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false
      }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      scene.add(mesh);
      this.waterRipples.push({ mesh, life: 0, maxLife: 1, startScale: 1, targetScale: 1 });
    }
  }
  ground(x,z){return this.heightAt?this.heightAt(x,z):0}
  setQuality(value=1){this.quality=THREE.MathUtils.clamp(value,.35,1)}
  activeEffectCount(){return this.fragments.filter(x=>x.life>0).length+this.rings.filter(x=>x.life>0).length+this.stains.filter(x=>x.life>0).length+this.waterRipples.filter(x=>x.life>0).length+this.muzzleFlashes.filter(x=>x.life>0).length+this.impactClouds.filter(x=>x.life>0).length+this.muzzleLights.filter(x=>x.life>0).length}
  burst(position,color=0xff6a37,count=24,power=8){for(let n=0;n<count;n++){const p=this.fragments.find(x=>x.life<=0);if(!p)break;p.life=p.maxLife=.55+Math.random()*.8;p.mesh.visible=true;p.mesh.material.color.setHex(n%4===0?0xffe66c:color);p.mesh.material.opacity=1;p.mesh.position.copy(position);p.mesh.scale.setScalar(.5+Math.random()*1.4);p.velocity.set((Math.random()-.5)*power,Math.random()*power,(Math.random()-.5)*power)}const ring=this.rings.find(x=>x.life<=0);if(ring){ring.life=ring.maxLife=.7;ring.mesh.visible=true;ring.mesh.position.copy(position);ring.mesh.position.y+=.35;ring.mesh.scale.setScalar(.4);ring.mesh.material.opacity=.75;ring.mesh.lookAt(position.x,position.y+8,position.z)}}
  muzzleFlash(position,direction,weapon){
    if(!position)return;const energy=['plasma','arc'].includes(weapon.projectileStyle),rocket=['rocket','missile'].includes(weapon.projectileStyle),flame=weapon.projectileStyle==='plasma'&&weapon.shotPower<30,launch=Boolean(weapon.mine);
    const dir=(direction?.lengthSq?.()>0?direction:new THREE.Vector3(0,0,1)).clone().normalize();
    const flash=this.muzzleFlashes.find(item=>item.life<=0);if(flash){flash.life=flash.maxLife=flame ? .11 : rocket ? .09 : energy ? .08 : .07;flash.mesh.visible=true;flash.mesh.position.copy(position);flash.mesh.material.color.setHex(energy?weapon.color:flame?0xff6428:launch?0x9eff8a:0xffdc62);flash.mesh.material.opacity=1;flash.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir);const scale=(launch?.65:flame?1.75:rocket?1.35:energy?1.15:weapon.pellets?1.25:1)*1.3;flash.mesh.scale.set(scale,scale*(flame?1.8:1),scale);flash.mesh.rotateY(Math.random()*Math.PI*2)}
    const core=this.flashCores.find(item=>item.life<=0);
    if(core){core.life=core.maxLife=flame?.09:.06;core.mesh.visible=true;core.mesh.position.copy(position).addScaledVector(dir,.12);core.mesh.material.color.setHex(energy?weapon.color:flame?0xff8a3c:launch?0x9eff8a:0xffe9a8);core.mesh.material.opacity=1;core.startScale=(launch?.5:rocket?1.3:flame?1.2:weapon.pellets?1.15:.85)*(.85+Math.random()*.35);core.mesh.scale.setScalar(core.startScale);core.mesh.quaternion.copy(this.cameraQuaternion)}
    // a few hot sparks kicked forward out of the barrel
    if(this.quality>=.7&&!launch){const sparkCount=2+(weapon.pellets?2:0);for(let n=0;n<sparkCount;n++){const s=this.fragments.find(x=>x.life<=0);if(!s)break;s.isWater=false;s.life=s.maxLife=.12+Math.random()*.14;s.mesh.visible=true;s.mesh.material.color.setHex(n%2?0xffe66c:0xffab3f);s.mesh.material.opacity=1;s.mesh.position.copy(position);s.mesh.scale.setScalar(.14+Math.random()*.18);s.velocity.copy(dir).multiplyScalar(7+Math.random()*6);s.velocity.x+=(Math.random()-.5)*3;s.velocity.y+=Math.random()*1.8;s.velocity.z+=(Math.random()-.5)*3}}
    if(this.quality<.55||position.distanceToSquared(this.cameraPosition)>45*45)return;const slot=this.muzzleLights.find(item=>item.life<=0);if(slot){slot.life=slot.maxLife=.05;slot.light.visible=true;slot.light.position.copy(position);slot.light.color.setHex(weapon?.color||0xffb33a);slot.light.intensity=weapon?.explosive?3.2:2.1;slot.light.distance=weapon?.explosive?10:7}
  }
  // fading tracer segment along a projectile's last frame of travel (round-robin pool)
  bulletTrail(start,end,color=0xffdd66){
    if(this.quality<.45||!start||!end)return;
    if(start.distanceToSquared(this.cameraPosition)>130*130)return;
    if(start.distanceToSquared(end)<.0025)return;
    const t=this.trails[this.trailCursor];this.trailCursor=(this.trailCursor+1)%this.trailLimit;
    t.life=t.maxLife=.09;t.start.copy(start);t.end.copy(end);t.color.setHex(color).lerp(this._trailColor.setHex(0xffffff),.35);
  }
  impact(position,color,options={}){
    const normal=options.normal?.clone?.().normalize()||new THREE.Vector3(0,1,0),kind=options.kind||'projectile',cloud=this.impactClouds.find(item=>item.life<=0);if(cloud){cloud.life=cloud.maxLife=kind==='explosive' ? .75 : kind==='boundary' ? .3 : .48;cloud.mesh.visible=true;cloud.mesh.position.copy(position).addScaledVector(normal,.08);cloud.mesh.material.color.setHex(kind==='boundary'?0x8695aa:options.surface==='water'?0x8be5ff:options.surface==='dirt'?0x8d7763:0x656873);cloud.mesh.material.opacity=kind==='explosive' ? .8 : .6;cloud.startScale=kind==='explosive'?1.5:.55;cloud.mesh.scale.setScalar(cloud.startScale);cloud.velocity.copy(normal).multiplyScalar(kind==='explosive'?2.2:.65)}
    const surfaceColors={dirt:0x8d7763,rock:0x777b82,water:0x8be5ff,metal:0xaeb8c5,structure:0x8b8f99,wood:0x8b5a35,tree:0x65704b,boundary:0x8695aa},debrisColor=surfaceColors[options.surface]||color,count=Math.max(2,Math.round((kind==='explosive'?14:7)*this.quality));for(let n=0;n<count;n++){const p=this.fragments.find(x=>x.life<=0);if(!p)break;p.isWater=false;p.life=p.maxLife=.2+Math.random()*.42;p.mesh.visible=true;p.mesh.material.color.setHex(n%3===0?0xfff1a6:debrisColor);p.mesh.material.opacity=1;p.mesh.position.copy(position).addScaledVector(normal,.06);p.mesh.scale.setScalar(.22+Math.random()*.38);const tangent=new THREE.Vector3((Math.random()-.5)*2,Math.random()*.7,(Math.random()-.5)*2).normalize();p.velocity.copy(normal).multiplyScalar(1.5+Math.random()*3.5).addScaledVector(tangent,2+Math.random()*5)}
    if(options.surface==='water')this.waterSplash(position,4,Math.max(6,Math.round(12*this.quality)),.7)
  }
  // blood spray on hit + a stain splattered on the ground under the victim
  blood(position,direction=null,count=10){
    for(let n=0;n<count;n++){const p=this.fragments.find(x=>x.life<=0);if(!p)break;p.life=p.maxLife=.4+Math.random()*.5;p.mesh.visible=true;p.mesh.material.color.setHex(n%3===0?0xd42535:0x8e1220);p.mesh.material.opacity=1;p.mesh.position.copy(position);p.mesh.scale.setScalar(.35+Math.random()*.8);p.velocity.set((Math.random()-.5)*5,2+Math.random()*4.5,(Math.random()-.5)*5);if(direction)p.velocity.addScaledVector(direction,3.5)}
    const s=this.stains.find(x=>x.life<=0);if(s){s.life=3;s.mesh.visible=true;s.mesh.position.set(position.x+(Math.random()-.5)*.8,this.ground(position.x,position.z)+.04,position.z+(Math.random()-.5)*.8);s.mesh.rotation.z=Math.random()*Math.PI*2;s.mesh.scale.setScalar(.7+Math.random()*.9);s.mesh.material.opacity=.85}
  }
  waterSplash(position, velocityY = 5, count = 15, scale = 1.0) {
    const colors = [0xffffff, 0xd0f0ff, 0x8be5ff, 0x5cbaff];
    for (let n = 0; n < count; n++) {
      const p = this.fragments.find(x => x.life <= 0);
      if (!p) break;
      p.isWater = true;
      p.life = p.maxLife = 0.35 + Math.random() * 0.45;
      p.mesh.visible = true;
      p.mesh.material.color.setHex(colors[Math.floor(Math.random() * colors.length)]);
      p.mesh.material.opacity = 0.85;
      p.mesh.position.copy(position).setY(0.12 + Math.random() * 0.08);
      p.mesh.scale.setScalar((0.35 + Math.random() * 0.75) * scale);
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.8 + Math.random() * 2.8) * scale;
      p.velocity.set(
        Math.cos(angle) * speed,
        velocityY * (0.55 + Math.random() * 0.75),
        Math.sin(angle) * speed
      );
    }
    const ripple = this.waterRipples.find(x => x.life <= 0);
    if (ripple) {
      ripple.life = ripple.maxLife = 0.55 + Math.random() * 0.35;
      ripple.mesh.visible = true;
      ripple.mesh.position.copy(position).setY(0.13); // avoid z-fighting
      ripple.startScale = 0.5 * scale;
      ripple.targetScale = 3.5 * scale;
      ripple.mesh.scale.setScalar(ripple.startScale);
      ripple.mesh.material.opacity = 0.75;
    }
  }
  update(dt,camera){
    if(camera?.position)this.cameraPosition.copy(camera.position);
    if(camera?.quaternion)this.cameraQuaternion.copy(camera.quaternion);
    for(const p of this.fragments){
      if(p.life<=0)continue;
      p.life-=dt;
      if(p.life<=0){p.mesh.visible=false;p.isWater=false;continue}
      p.velocity.y-=18*dt;
      p.mesh.position.addScaledVector(p.velocity,dt);
      if (p.isWater) {
        if (p.mesh.position.y < 0.12) {
          p.life = 0;
          p.mesh.visible = false;
          p.isWater = false;
          continue;
        }
      } else {
        const g=this.ground(p.mesh.position.x,p.mesh.position.z)+.08;
        if(p.mesh.position.y<g){p.mesh.position.y=g;p.velocity.y=Math.abs(p.velocity.y)*.32;p.velocity.x*=.72;p.velocity.z*=.72}
      }
      p.mesh.rotation.x+=dt*9;p.mesh.rotation.y+=dt*13;p.mesh.material.opacity=Math.min(1,p.life/.25)
    }
    for(const r of this.rings){if(r.life<=0)continue;r.life-=dt;if(r.life<=0){r.mesh.visible=false;continue}const t=1-r.life/r.maxLife;r.mesh.scale.setScalar(.5+t*5);r.mesh.position.y+=dt*1.2;r.mesh.material.opacity=(1-t)*.65;r.mesh.quaternion.copy(camera.quaternion)}
    for(const s of this.stains){if(s.life<=0)continue;s.life-=dt;if(s.life<=0){s.mesh.visible=false;continue}if(s.life<1)s.mesh.material.opacity=s.life*.85}
    for(const r of this.waterRipples){
      if(r.life<=0)continue;
      r.life-=dt;
      if(r.life<=0){r.mesh.visible=false;continue}
      const t=1-r.life/r.maxLife;
      r.mesh.scale.setScalar(r.startScale+t*r.targetScale);
      r.mesh.material.opacity=(1-t)*0.75;
    }
    for(const flash of this.muzzleFlashes){if(flash.life<=0)continue;flash.life-=dt;if(flash.life<=0){flash.mesh.visible=false;continue}const t=flash.life/flash.maxLife;flash.mesh.material.opacity=t;flash.mesh.scale.multiplyScalar(1+dt*7)}
    for(const core of this.flashCores){if(core.life<=0)continue;core.life-=dt;if(core.life<=0){core.mesh.visible=false;continue}const t=core.life/core.maxLife;core.mesh.material.opacity=t;core.mesh.scale.setScalar(core.startScale*(1.45-t*.45));core.mesh.quaternion.copy(this.cameraQuaternion)}
    let trailCount=0;
    for(const trail of this.trails){
      if(trail.life<=0)continue;trail.life-=dt;if(trail.life<=0)continue;
      const k=trail.life/trail.maxLife,len=trail.start.distanceTo(trail.end);
      this._trailDummy.position.copy(trail.start).lerp(trail.end,.5);
      this._trailDummy.lookAt(trail.end);
      this._trailDummy.scale.set(.5+k*.8,.5+k*.8,Math.max(.01,len));
      this._trailDummy.updateMatrix();
      this.trailMesh.setMatrixAt(trailCount,this._trailDummy.matrix);
      this.trailMesh.setColorAt(trailCount,this._trailColor.copy(trail.color).multiplyScalar(k));
      trailCount++;
    }
    this.trailMesh.count=trailCount;this.trailMesh.instanceMatrix.needsUpdate=true;if(this.trailMesh.instanceColor)this.trailMesh.instanceColor.needsUpdate=true;
    for(const slot of this.muzzleLights){if(slot.life<=0)continue;slot.life-=dt;if(slot.life<=0){slot.light.visible=false;slot.light.intensity=0;continue}slot.light.intensity*=Math.pow(.01,dt/slot.maxLife)}
    for(const cloud of this.impactClouds){if(cloud.life<=0)continue;cloud.life-=dt;if(cloud.life<=0){cloud.mesh.visible=false;continue}const t=1-cloud.life/cloud.maxLife;cloud.mesh.position.addScaledVector(cloud.velocity,dt);cloud.velocity.multiplyScalar(Math.pow(.22,dt));cloud.mesh.scale.setScalar(cloud.startScale*(1+t*2.7));cloud.mesh.material.opacity=(1-t)*.62;cloud.mesh.rotation.x+=dt*1.8;cloud.mesh.rotation.y+=dt*2.3}
  }
}
