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

export function createTankShellBrownModel(scale = 1.3) {
  const root = new THREE.Group();
  const steel = material(0x5a626a, null, .8, .3);
  const brass = material(0xc29b38, null, .9, .25);
  const tip = material(0xff6b3d, null, .4, .4);
  const body = part(new THREE.CylinderGeometry(.13, .13, .65, 10), steel, [0, 0, 0], [Math.PI / 2, 0, 0]); root.add(body);
  const nose = part(new THREE.ConeGeometry(.13, .35, 10), tip, [0, 0, .5], [Math.PI / 2, 0, 0]); root.add(nose);
  const ring = part(new THREE.CylinderGeometry(.135, .135, .08, 10), brass, [0, 0, -.18], [Math.PI / 2, 0, 0]); root.add(ring);
  root.scale.setScalar(scale); root.userData.projectileKind = 'tank_shell_brown';
  return root;
}

export function createTankShellYellowModel(scale = 1.4) {
  const root = new THREE.Group();
  const coreMat = new THREE.MeshStandardMaterial({ color: 0xffea55, emissive: 0xffb700, emissiveIntensity: 1.8, roughness: .2 });
  const gold = material(0xd6a319, null, .88, .2);
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xfff080, emissive: 0xffd23f, emissiveIntensity: 1.2 });
  const core = part(new THREE.SphereGeometry(.17, 10, 8), coreMat); root.add(core);
  const ring1 = part(new THREE.TorusGeometry(.24, .025, 6, 12), ringMat, [0, 0, 0], [Math.PI / 2, 0, 0]); root.add(ring1);
  const ring2 = part(new THREE.TorusGeometry(.24, .025, 6, 12), gold, [0, 0, 0], [0, Math.PI / 2, 0]); root.add(ring2);
  const tipFront = part(new THREE.ConeGeometry(.12, .3, 8), gold, [0, 0, .28], [Math.PI / 2, 0, 0]); root.add(tipFront);
  root.scale.setScalar(scale); root.userData.projectileKind = 'tank_shell_yellow';
  return root;
}

export function createTankShellBlueModel(scale = 1.4) {
  const root = new THREE.Group();
  const crystalMat = new THREE.MeshStandardMaterial({ color: 0x6ee2ff, emissive: 0x1f94d2, emissiveIntensity: 1.6, roughness: .15, transparent: true, opacity: .9 });
  const chrome = material(0xb0d5f0, null, .95, .15);
  const orb = part(new THREE.OctahedronGeometry(.18, 2), crystalMat); root.add(orb);
  const shell = part(new THREE.CylinderGeometry(.12, .15, .45, 8), chrome, [0, 0, 0], [Math.PI / 2, 0, 0]); root.add(shell);
  for (let i = 0; i < 3; i++) {
    const fin = part(new THREE.BoxGeometry(.035, .18, .15), chrome, [0, 0, -.2]);
    const a = i * Math.PI * 2 / 3;
    fin.rotation.z = a; fin.position.x = Math.cos(a) * .12; fin.position.y = Math.sin(a) * .12; root.add(fin);
  }
  root.scale.setScalar(scale); root.userData.projectileKind = 'tank_shell_blue';
  return root;
}

export function createTankShellRedModel(scale = 1.5) {
  const root = new THREE.Group();
  const darkMetal = material(0x22181c, null, .85, .25);
  const magmaCore = new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: 0xff3300, emissiveIntensity: 2.2 });
  const crimsonNose = material(0xff102c, null, .5, .3);
  const body = part(new THREE.CylinderGeometry(.16, .16, .65, 10), darkMetal, [0, 0, 0], [Math.PI / 2, 0, 0]); root.add(body);
  const nose = part(new THREE.ConeGeometry(.16, .38, 10), crimsonNose, [0, 0, .45], [Math.PI / 2, 0, 0]); root.add(nose);
  const vent = part(new THREE.CylinderGeometry(.11, .14, .18, 10), magmaCore, [0, 0, -.36], [Math.PI / 2, 0, 0]); root.add(vent);
  for (let i = 0; i < 4; i++) {
    const fin = part(new THREE.BoxGeometry(.05, .24, .2), crimsonNose, [0, 0, -.28]);
    fin.rotation.z = i * Math.PI / 2; fin.position.x = Math.cos(i * Math.PI / 2) * .14; fin.position.y = Math.sin(i * Math.PI / 2) * .14; root.add(fin);
  }
  root.scale.setScalar(scale); root.userData.projectileKind = 'tank_shell_red';
  return root;
}

export function createProjectileRig() {
  const root = new THREE.Group();
  const basicMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x222222, emissiveIntensity: .45, roughness: .32, transparent: true });
  const basic = part(new THREE.BoxGeometry(.055, .055, .28), basicMaterial); root.add(basic);
  const grenade = createGrenadeModel(); grenade.visible = false; root.add(grenade);
  const missile = createMissileModel(); missile.visible = false; root.add(missile);
  const tankBrown = createTankShellBrownModel(); tankBrown.visible = false; root.add(tankBrown);
  const tankYellow = createTankShellYellowModel(); tankYellow.visible = false; root.add(tankYellow);
  const tankBlue = createTankShellBlueModel(); tankBlue.visible = false; root.add(tankBlue);
  const tankRed = createTankShellRedModel(); tankRed.visible = false; root.add(tankRed);
  root.userData.parts = { basic, grenade, missile, tankBrown, tankYellow, tankBlue, tankRed };
  root.userData.materials = [basicMaterial];
  return root;
}

export function configureProjectileRig(root, style, geometry, color) {
  const { basic, grenade, missile, tankBrown, tankYellow, tankBlue, tankRed } = root.userData.parts;
  basic.visible = false; grenade.visible = false; missile.visible = false;
  if (tankBrown) tankBrown.visible = false; if (tankYellow) tankYellow.visible = false;
  if (tankBlue) tankBlue.visible = false; if (tankRed) tankRed.visible = false;

  let kind = 'basic';
  if (style === 'grenade') kind = 'grenade';
  else if (style === 'rocket' || style === 'missile') kind = 'missile';
  else if (style === 'tank_shell_brown') kind = 'tankBrown';
  else if (style === 'tank_shell_yellow') kind = 'tankYellow';
  else if (style === 'tank_shell_blue') kind = 'tankBlue';
  else if (style === 'tank_shell_red') kind = 'tankRed';

  if (kind === 'basic') {
    basic.visible = true; basic.geometry = geometry; basic.material.color.setHex(color); basic.material.emissive.setHex(color);
  } else if (root.userData.parts[kind]) {
    root.userData.parts[kind].visible = true;
  }
  root.userData.activeModel = root.userData.parts[kind] || basic;
}

