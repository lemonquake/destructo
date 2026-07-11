import * as THREE from 'three';

const textureLoader = typeof document !== 'undefined' ? new THREE.TextureLoader() : null;
const grenadeTexture = textureLoader?.load('/assets/textures/projectiles/grenade-atlas.png') || null;
const missileTexture = textureLoader?.load('/assets/textures/projectiles/missile-atlas.png') || null;
for (const texture of [grenadeTexture, missileTexture]) {
  if (!texture) continue;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
}

const material = (color, map = null, metalness = .35, roughness = .45) =>
  new THREE.MeshStandardMaterial({ color, map, metalness, roughness });
const part = (geometry, mat, position = null, rotation = null) => {
  const mesh = new THREE.Mesh(geometry, mat);
  if (position) mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  return mesh;
};

export function createGrenadeModel(scale = 1) {
  const root = new THREE.Group();
  const shell = material(0x89904a, grenadeTexture, .5, .42);
  const steel = material(0x333a46, grenadeTexture, .82, .25);
  const body = part(new THREE.IcosahedronGeometry(.18, 1), shell);
  body.scale.set(.9, 1.12, .9); root.add(body);
  const neck = part(new THREE.CylinderGeometry(.075, .09, .1, 8), steel, [0, .2, 0]); root.add(neck);
  const lever = part(new THREE.BoxGeometry(.09, .045, .28), steel, [.075, .245, -.045], [0, 0, -.12]); root.add(lever);
  const pin = part(new THREE.TorusGeometry(.075, .012, 5, 12), steel, [-.09, .22, 0], [Math.PI / 2, 0, 0]); root.add(pin);
  root.scale.setScalar(scale); root.userData.projectileKind = 'grenade';
  return root;
}

export function createMissileModel(scale = 1) {
  const root = new THREE.Group();
  const shell = material(0xd1d4d2, missileTexture, .8, .24);
  const dark = material(0x242a35, missileTexture, .88, .2);
  const band = material(0xf04422, missileTexture, .48, .32);
  const body = part(new THREE.CylinderGeometry(.105, .105, .48, 10), shell, [0, 0, 0], [Math.PI / 2, 0, 0]); root.add(body);
  const nose = part(new THREE.ConeGeometry(.105, .22, 10), dark, [0, 0, .35], [Math.PI / 2, 0, 0]); root.add(nose);
  const stripe = part(new THREE.CylinderGeometry(.111, .111, .075, 10), band, [0, 0, .13], [Math.PI / 2, 0, 0]); root.add(stripe);
  const exhaust = part(new THREE.CylinderGeometry(.085, .105, .1, 10), dark, [0, 0, -.29], [Math.PI / 2, 0, 0]); root.add(exhaust);
  for (let i = 0; i < 4; i++) {
    const fin = part(new THREE.BoxGeometry(.045, .2, .18), dark, [0, 0, -.24]);
    fin.rotation.z = i * Math.PI / 2; fin.position.x = Math.cos(i * Math.PI / 2) * .11; fin.position.y = Math.sin(i * Math.PI / 2) * .11; root.add(fin);
  }
  root.scale.setScalar(scale); root.userData.projectileKind = 'missile';
  return root;
}

export function createProjectileRig() {
  const root = new THREE.Group();
  const basicMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x222222, emissiveIntensity: .45, roughness: .32, transparent: true });
  const basic = part(new THREE.BoxGeometry(.055, .055, .28), basicMaterial); root.add(basic);
  const grenade = createGrenadeModel(); grenade.visible = false; root.add(grenade);
  const missile = createMissileModel(); missile.visible = false; root.add(missile);
  root.userData.parts = { basic, grenade, missile };
  root.userData.materials = [basicMaterial];
  return root;
}

export function configureProjectileRig(root, style, geometry, color) {
  const { basic, grenade, missile } = root.userData.parts;
  const kind = style === 'grenade' ? 'grenade' : style === 'rocket' || style === 'missile' ? 'missile' : 'basic';
  basic.visible = kind === 'basic'; grenade.visible = kind === 'grenade'; missile.visible = kind === 'missile';
  if (basic.visible) { basic.geometry = geometry; basic.material.color.setHex(color); basic.material.emissive.setHex(color); }
  root.userData.activeModel = kind === 'grenade' ? grenade : kind === 'missile' ? missile : basic;
}
