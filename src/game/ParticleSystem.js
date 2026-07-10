import * as THREE from 'three';

export class ParticleSystem {
  constructor(scene) {
    this.scene=scene;this.fragments=[];this.rings=[];
    const geo=new THREE.BoxGeometry(.16,.16,.16);
    for(let i=0;i<220;i++){const mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:0xff6b3d,transparent:true}));mesh.visible=false;scene.add(mesh);this.fragments.push({mesh,velocity:new THREE.Vector3(),life:0,maxLife:1})}
    const ringGeo=new THREE.RingGeometry(.35,.62,10);for(let i=0;i<28;i++){const mesh=new THREE.Mesh(ringGeo,new THREE.MeshBasicMaterial({color:0x343443,transparent:true,side:THREE.DoubleSide,depthWrite:false}));mesh.visible=false;scene.add(mesh);this.rings.push({mesh,life:0,maxLife:1})}
  }
  burst(position,color=0xff6a37,count=24,power=8){for(let n=0;n<count;n++){const p=this.fragments.find(x=>x.life<=0);if(!p)break;p.life=p.maxLife=.55+Math.random()*.8;p.mesh.visible=true;p.mesh.material.color.setHex(n%4===0?0xffe66c:color);p.mesh.material.opacity=1;p.mesh.position.copy(position);p.mesh.scale.setScalar(.5+Math.random()*1.4);p.velocity.set((Math.random()-.5)*power,Math.random()*power,(Math.random()-.5)*power)}const ring=this.rings.find(x=>x.life<=0);if(ring){ring.life=ring.maxLife=.7;ring.mesh.visible=true;ring.mesh.position.copy(position);ring.mesh.position.y+=.35;ring.mesh.scale.setScalar(.4);ring.mesh.material.opacity=.75;ring.mesh.lookAt(position.x,position.y+8,position.z)}}
  impact(position,color){this.burst(position,color,5,3)}
  update(dt,camera){for(const p of this.fragments){if(p.life<=0)continue;p.life-=dt;if(p.life<=0){p.mesh.visible=false;continue}p.velocity.y-=18*dt;p.mesh.position.addScaledVector(p.velocity,dt);if(p.mesh.position.y<.08){p.mesh.position.y=.08;p.velocity.y=Math.abs(p.velocity.y)*.32;p.velocity.x*=.72;p.velocity.z*=.72}p.mesh.rotation.x+=dt*9;p.mesh.rotation.y+=dt*13;p.mesh.material.opacity=Math.min(1,p.life/.25)}for(const r of this.rings){if(r.life<=0)continue;r.life-=dt;if(r.life<=0){r.mesh.visible=false;continue}const t=1-r.life/r.maxLife;r.mesh.scale.setScalar(.5+t*5);r.mesh.position.y+=dt*1.2;r.mesh.material.opacity=(1-t)*.65;r.mesh.quaternion.copy(camera.quaternion)}}
}
