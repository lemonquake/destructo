import * as THREE from 'three';
import { MARKETPLACE_COSMETICS } from '../data/marketplaceData.js';

const itemFor = id => MARKETPLACE_COSMETICS.find(item => item.id === id);
const mesh = (geometry, material) => { const value = new THREE.Mesh(geometry, material); value.castShadow = true; value.receiveShadow = true; return value; };
const mat = (materials, color, glow = false) => materials.color(color, glow ? { emissive: color, emissiveIntensity: 1.25, metalness: .45, roughness: .2 } : { metalness: .62, roughness: .3 });

function hatModel(item, materials, teamColor) {
  const { model = 'helmet', primary = teamColor, secondary = 0xffffff } = item?.visual || {};
  const root = new THREE.Group(); root.name = 'hat'; root.position.y = 2.62;
  const main = mat(materials, primary), accent = mat(materials, secondary, ['halo','orbital','mohawk'].includes(model));
  if (model === 'cap') {
    root.add(mesh(new THREE.SphereGeometry(.48, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), main));
    const brim = mesh(new THREE.BoxGeometry(.58,.07,.48), main); brim.position.set(0,.02,.48); root.add(brim);
  } else if (model === 'crown') {
    root.add(mesh(new THREE.CylinderGeometry(.42,.47,.22,8), main));
    for(let i=0;i<6;i++){const a=i/6*Math.PI*2,spike=mesh(new THREE.ConeGeometry(.085,.34,5),i%2?accent:main);spike.position.set(Math.cos(a)*.4,.25,Math.sin(a)*.4);root.add(spike)}
  } else if (model === 'halo' || model === 'orbital') {
    const ring=mesh(new THREE.TorusGeometry(model==='orbital'?.54:.43,.06,8,28),accent);ring.rotation.x=Math.PI/2;ring.position.y=.48;root.add(ring);
    if(model==='orbital')for(let i=0;i<3;i++){const orb=mesh(new THREE.SphereGeometry(.08,8,6),main);const a=i/3*Math.PI*2;orb.position.set(Math.cos(a)*.55,.48,Math.sin(a)*.55);root.add(orb)}
  } else if (model === 'horns') {
    for(const x of [-.42,.42]){const horn=mesh(new THREE.ConeGeometry(.13,.62,7),x<0?main:accent);horn.position.set(x,.14,0);horn.rotation.z=x>0?-.55:.55;root.add(horn)}
  } else if (model === 'mohawk') {
    for(let i=0;i<6;i++){const spike=mesh(new THREE.ConeGeometry(.09,.46,5),i%2?main:accent);spike.position.set(0,.2,.4-i*.16);root.add(spike)}
  } else if (model === 'antenna') {
    const rod=mesh(new THREE.CylinderGeometry(.025,.025,.72,6),main);rod.position.y=.34;root.add(rod);const tip=mesh(new THREE.SphereGeometry(.1,8,6),accent);tip.position.y=.74;root.add(tip);
  } else if (model === 'tophat') {
    root.add(mesh(new THREE.CylinderGeometry(.62,.62,.07,12),main));const tube=mesh(new THREE.CylinderGeometry(.39,.43,.65,12),main);tube.position.y=.35;root.add(tube);const band=mesh(new THREE.CylinderGeometry(.435,.435,.12,12),accent);band.position.y=.14;root.add(band);
  } else {
    const dome=mesh(new THREE.SphereGeometry(.61,10,7,0,Math.PI*2,0,Math.PI/1.72),main);dome.position.y=-.1;root.add(dome);const visor=mesh(new THREE.BoxGeometry(.76,.16,.16),accent);visor.position.set(0,.04,.48);root.add(visor);
  }
  return root;
}

function bootsModel(item, materials) {
  const { model = 'runner', primary = 0x59e065, secondary = 0xffffff } = item?.visual || {};
  const root=new THREE.Group();root.name='boots';const main=mat(materials,primary),accent=mat(materials,secondary,true);
  for(const x of [-.33,.33]){
    const foot=mesh(new THREE.BoxGeometry(model==='armored'?.54:.48,model==='armored'?.36:.29,.72),main);foot.position.set(x,.23,.05);root.add(foot);
    const toe=mesh(new THREE.BoxGeometry(.42,.14,.2),accent);toe.position.set(x,.25,.38);root.add(toe);
    if(['piston','quake'].includes(model)){const coil=mesh(new THREE.TorusGeometry(.17,.045,7,14),accent);coil.rotation.x=Math.PI/2;coil.position.set(x,.47,-.04);root.add(coil)}
    if(['thruster','quake'].includes(model)){const nozzle=mesh(new THREE.CylinderGeometry(.09,.13,.24,7),main);nozzle.rotation.x=Math.PI/2;nozzle.position.set(x,.3,-.42);root.add(nozzle);const flame=mesh(new THREE.ConeGeometry(.075,.36,7),accent);flame.rotation.x=-Math.PI/2;flame.position.set(x,.3,-.62);flame.name='cosmetic-flame';root.add(flame)}
  }
  return root;
}

function attachmentModel(item, materials) {
  const { model = 'jetpack', primary = 0x566273, secondary = 0x55d9ff } = item?.visual || {};
  const root=new THREE.Group();root.name='attachment';root.position.set(0,1.38,-.55);const main=mat(materials,primary),accent=mat(materials,secondary,true);
  if(model==='wings'){
    for(const side of [-1,1])for(let i=0;i<3;i++){const blade=mesh(new THREE.BoxGeometry(.18,.18,1.05-i*.18),i%2?main:accent);blade.position.set(side*(.38+i*.3),.32-i*.18,-.2-i*.14);blade.rotation.y=side*(.55+i*.13);blade.rotation.z=side*(-.4-i*.12);root.add(blade)}
  }else if(model==='drone'||model==='orbitals'){
    const count=model==='orbitals'?3:1;for(let i=0;i<count;i++){const a=i/count*Math.PI*2,drone=new THREE.Group();drone.position.set(Math.cos(a)*(.9+i*.08),.45+i*.12,Math.sin(a)*.45);drone.add(mesh(new THREE.OctahedronGeometry(.2,0),accent));for(const sx of [-1,1]){const wing=mesh(new THREE.BoxGeometry(.32,.05,.16),main);wing.position.x=sx*.25;drone.add(wing)}root.add(drone)}
  }else if(model==='banner'){
    const pole=mesh(new THREE.CylinderGeometry(.035,.035,2.3,6),main);pole.position.set(.5,.35,0);root.add(pole);const flag=mesh(new THREE.PlaneGeometry(.82,.68),accent);flag.position.set(.08,.9,0);flag.rotation.y=Math.PI;root.add(flag);
  }else if(model==='shoulder'){
    const pod=mesh(new THREE.BoxGeometry(1.15,.42,.62),main);pod.position.set(.35,.52,0);root.add(pod);for(let i=0;i<3;i++){const tube=mesh(new THREE.CylinderGeometry(.09,.09,.7,8),accent);tube.rotation.x=Math.PI/2;tube.position.set(i*.28,.52,.02);root.add(tube)}
  }else if(model==='reactor'){
    const cage=mesh(new THREE.TorusGeometry(.46,.1,8,20),main);cage.rotation.x=Math.PI/2;root.add(cage);const core=mesh(new THREE.IcosahedronGeometry(.28,1),accent);root.add(core);for(let i=0;i<3;i++){const ring=mesh(new THREE.TorusGeometry(.33+i*.09,.025,6,22),accent);ring.rotation.set(i*.7,i*.9,0);root.add(ring)}
  }else{
    for(const x of [-.3,.3]){const tank=mesh(new THREE.CylinderGeometry(.2,.25,.88,8),main);tank.position.x=x;root.add(tank);const nozzle=mesh(new THREE.CylinderGeometry(.13,.2,.28,7),accent);nozzle.position.set(x,-.56,0);root.add(nozzle);const flame=mesh(new THREE.ConeGeometry(.12,.56,7),accent);flame.position.set(x,-.95,0);flame.rotation.z=Math.PI;flame.name='cosmetic-flame';root.add(flame)}
  }
  return root;
}

export function createWearableCosmetic(kind, id, materials, teamColor = 0x2fb4ff) {
  const item=itemFor(id)||{id,kind,visual:{primary:teamColor,secondary:0xffffff,model:id}};
  if(kind==='hat')return hatModel(item,materials,teamColor);
  if(kind==='boots')return bootsModel(item,materials);
  if(kind==='attachment'||kind==='jetpack')return attachmentModel(item,materials);
  return new THREE.Group();
}

export function cosmeticVisual(id) { return itemFor(id)?.visual || { primary: 0x2fb4ff, secondary: 0xffffff, model: 'unknown' }; }

