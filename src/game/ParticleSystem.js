import * as THREE from 'three';

export class ParticleSystem {
  constructor(scene, heightAt = null) {
    this.scene=scene;this.heightAt=heightAt;this.fragments=[];this.rings=[];this.stains=[];
    const geo=new THREE.BoxGeometry(.16,.16,.16);
    for(let i=0;i<260;i++){const mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:0xff6b3d,transparent:true}));mesh.visible=false;scene.add(mesh);this.fragments.push({mesh,velocity:new THREE.Vector3(),life:0,maxLife:1,isWater:false})}
    const ringGeo=new THREE.RingGeometry(.35,.62,10);for(let i=0;i<28;i++){const mesh=new THREE.Mesh(ringGeo,new THREE.MeshBasicMaterial({color:0x343443,transparent:true,side:THREE.DoubleSide,depthWrite:false}));mesh.visible=false;scene.add(mesh);this.rings.push({mesh,life:0,maxLife:1})}
    // pooled blood stains: reused meshes, faded out and hidden after 3s — no allocation per hit
    const stainGeo=new THREE.CircleGeometry(.55,9);
    for(let i=0;i<32;i++){const mesh=new THREE.Mesh(stainGeo,new THREE.MeshBasicMaterial({color:0x9c1622,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-6}));mesh.rotation.x=-Math.PI/2;mesh.visible=false;scene.add(mesh);this.stains.push({mesh,life:0})}

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
  burst(position,color=0xff6a37,count=24,power=8){for(let n=0;n<count;n++){const p=this.fragments.find(x=>x.life<=0);if(!p)break;p.life=p.maxLife=.55+Math.random()*.8;p.mesh.visible=true;p.mesh.material.color.setHex(n%4===0?0xffe66c:color);p.mesh.material.opacity=1;p.mesh.position.copy(position);p.mesh.scale.setScalar(.5+Math.random()*1.4);p.velocity.set((Math.random()-.5)*power,Math.random()*power,(Math.random()-.5)*power)}const ring=this.rings.find(x=>x.life<=0);if(ring){ring.life=ring.maxLife=.7;ring.mesh.visible=true;ring.mesh.position.copy(position);ring.mesh.position.y+=.35;ring.mesh.scale.setScalar(.4);ring.mesh.material.opacity=.75;ring.mesh.lookAt(position.x,position.y+8,position.z)}}
  impact(position,color){this.burst(position,color,5,3)}
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
  }
}
