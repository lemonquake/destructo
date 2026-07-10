import * as THREE from 'three';

const textureColors = { grass: ['#5cc24f', '#8ae06a', '#3f9c3f'], dirt: ['#a5673f', '#c98a55', '#7a4c31'], stone: ['#8d8ba1', '#b9b5c9', '#615f78'], water: ['#28b1e6', '#74e2e8', '#1a78b8'], metal: ['#7a8492', '#aeb6bf', '#4a5464'], wood: ['#9c5a30', '#c98846', '#65391f'], uniform: ['#c4c9c6', '#98a09e', '#e2ded2'] };

function makeCanvas(size = 128) { const canvas = document.createElement('canvas'); canvas.width = canvas.height = size; return [canvas, canvas.getContext('2d')]; }
function seededRandom(seed) { return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) | 0) >>> 0) / 4294967296; }
function toTexture(canvas) { const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; return tex; }

function fallbackTexture(kind) {
  const [canvas, ctx] = makeCanvas(); const colors = textureColors[kind] || textureColors.stone;
  ctx.fillStyle = colors[0]; ctx.fillRect(0, 0, 128, 128);
  const random = seededRandom(kind.length * 999);
  for (let i = 0; i < 220; i++) { ctx.fillStyle = colors[i % colors.length]; const s = 2 + random() * 10; ctx.globalAlpha = .18 + random() * .42; ctx.fillRect(random() * 128, random() * 128, s, s); }
  ctx.globalAlpha = 1; return toTexture(canvas);
}

// ── 10 building / structure textures ─────────────────────────────────────────
const BUILDING_PAINTERS = {
  brick(ctx, r) {
    ctx.fillStyle = '#c9563b'; ctx.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 8; y++) for (let x = -1; x < 5; x++) {
      ctx.fillStyle = ['#d96a4a', '#c3502f', '#e07a55', '#b84a2e'][Math.floor(r() * 4)];
      ctx.fillRect(x * 32 + (y % 2 ? 16 : 0) + 1, y * 16 + 1, 30, 14);
    }
  },
  concrete(ctx, r) {
    ctx.fillStyle = '#b9bcc4'; ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 400; i++) { ctx.fillStyle = r() > .5 ? '#a9adb8' : '#c8ccd4'; ctx.globalAlpha = .5; ctx.fillRect(r() * 128, r() * 128, 2 + r() * 4, 2 + r() * 4); }
    ctx.globalAlpha = .8; ctx.strokeStyle = '#8f939e'; ctx.lineWidth = 2; ctx.strokeRect(2, 2, 124, 124); ctx.globalAlpha = 1;
  },
  rooftile(ctx, r) {
    ctx.fillStyle = '#3f7fd1'; ctx.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      ctx.fillStyle = ['#4b8ee0', '#3671bd', '#5a9cef'][Math.floor(r() * 3)];
      ctx.beginPath(); ctx.arc(x * 32 + 16 + (y % 2 ? 16 : 0), y * 32 + 24, 18, Math.PI, 0); ctx.fill();
    }
  },
  sandstone(ctx, r) {
    ctx.fillStyle = '#e7c98a'; ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 250; i++) { ctx.fillStyle = r() > .5 ? '#dcb974' : '#f2d89e'; ctx.globalAlpha = .45; ctx.fillRect(r() * 128, r() * 128, 3 + r() * 6, 2 + r() * 3); }
    ctx.globalAlpha = .6; ctx.strokeStyle = '#c9a45c'; for (let y = 24; y < 128; y += 26) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(128, y + (r() - .5) * 6); ctx.stroke(); } ctx.globalAlpha = 1;
  },
  marble(ctx, r) {
    ctx.fillStyle = '#eef0f4'; ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#b9c2d4'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) { ctx.globalAlpha = .35 + r() * .4; ctx.beginPath(); let x = r() * 128, y = 0; ctx.moveTo(x, y); while (y < 128) { y += 8 + r() * 14; x += (r() - .5) * 26; ctx.lineTo(x, y); } ctx.stroke(); }
    ctx.globalAlpha = 1;
  },
  plating(ctx, r) {
    ctx.fillStyle = '#79879b'; ctx.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      ctx.fillStyle = ['#8997ac', '#6e7d92'][Math.floor(r() * 2)]; ctx.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
      ctx.fillStyle = '#525f72'; for (const [rx, ry] of [[10, 10], [54, 10], [10, 54], [54, 54]]) { ctx.beginPath(); ctx.arc(x * 64 + rx, y * 64 + ry, 3, 0, 7); ctx.fill(); }
    }
  },
  hazard(ctx) {
    ctx.fillStyle = '#ffcf24'; ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#26262e';
    for (let i = -4; i < 8; i++) { ctx.beginPath(); ctx.moveTo(i * 32, 0); ctx.lineTo(i * 32 + 16, 0); ctx.lineTo(i * 32 + 16 + 128, 128); ctx.lineTo(i * 32 + 128, 128); ctx.fill(); }
  },
  cobble(ctx, r) {
    ctx.fillStyle = '#5f6270'; ctx.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
      ctx.fillStyle = ['#7c7f90', '#8d90a2', '#6e7182'][Math.floor(r() * 3)];
      ctx.beginPath(); ctx.ellipse(x * 26 + 13 + (r() - .5) * 5, y * 26 + 13 + (r() - .5) * 5, 11 + r() * 3, 9 + r() * 3, r(), 0, 7); ctx.fill();
    }
  },
  crystal(ctx, r) {
    ctx.fillStyle = '#153a66'; ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 22; i++) { const x = r() * 128, y = r() * 128, s = 6 + r() * 16; ctx.fillStyle = ['#6fe0ff', '#a4ecff', '#3fb9f0'][Math.floor(r() * 3)]; ctx.globalAlpha = .5 + r() * .5; ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * .45, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s * .45, y); ctx.fill(); }
    ctx.globalAlpha = 1;
  },
  lava(ctx, r) {
    ctx.fillStyle = '#2b1414'; ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 16; i++) { ctx.strokeStyle = ['#ff7b2e', '#ffb13c', '#ff4d1c'][Math.floor(r() * 3)]; ctx.lineWidth = 2 + r() * 4; ctx.globalAlpha = .8; ctx.beginPath(); let x = r() * 128, y = r() * 128; ctx.moveTo(x, y); for (let s = 0; s < 5; s++) { x += (r() - .5) * 44; y += (r() - .5) * 44; ctx.lineTo(x, y); } ctx.stroke(); }
    ctx.globalAlpha = 1;
  },
};

// ── 10 destructo skin textures (wrapped around unit bodies) ──────────────────
const SKIN_PAINTERS = {
  camo(ctx, r) { ctx.fillStyle = '#5d7a44'; ctx.fillRect(0, 0, 128, 128); for (let i = 0; i < 40; i++) { ctx.fillStyle = ['#3f5c30', '#82a05e', '#2e4424'][Math.floor(r() * 3)]; ctx.beginPath(); ctx.ellipse(r() * 128, r() * 128, 8 + r() * 16, 6 + r() * 10, r() * 3, 0, 7); ctx.fill(); } },
  tiger(ctx, r) { ctx.fillStyle = '#f2a13c'; ctx.fillRect(0, 0, 128, 128); ctx.fillStyle = '#241d13'; for (let i = 0; i < 12; i++) { const x = i * 11 + r() * 6; ctx.beginPath(); ctx.moveTo(x, -4); ctx.quadraticCurveTo(x + 14, 64, x - 4, 132); ctx.quadraticCurveTo(x + 6, 64, x - 8, -4); ctx.fill(); } },
  digital(ctx, r) { ctx.fillStyle = '#7f9aad'; ctx.fillRect(0, 0, 128, 128); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (r() > .4) { ctx.fillStyle = ['#55707f', '#a4bfd0', '#3d5260', '#c7d8e2'][Math.floor(r() * 4)]; ctx.fillRect(x * 8, y * 8, 8, 8); } },
  hex(ctx, r) { ctx.fillStyle = '#3a3f55'; ctx.fillRect(0, 0, 128, 128); ctx.strokeStyle = '#6ee0ff'; ctx.lineWidth = 1.6; for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) { const cx = x * 24 + (y % 2 ? 12 : 0), cy = y * 22; ctx.globalAlpha = .5 + r() * .5; ctx.beginPath(); for (let k = 0; k <= 6; k++) { const a = k / 6 * Math.PI * 2 + .5; const px = cx + Math.cos(a) * 10, py = cy + Math.sin(a) * 10; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.stroke(); } ctx.globalAlpha = 1; },
  circuit(ctx, r) { ctx.fillStyle = '#123524'; ctx.fillRect(0, 0, 128, 128); ctx.strokeStyle = '#42e08a'; ctx.lineWidth = 2; for (let i = 0; i < 14; i++) { let x = r() * 128, y = r() * 128; ctx.beginPath(); ctx.moveTo(x, y); for (let s = 0; s < 4; s++) { if (r() > .5) x += (r() - .5) * 60; else y += (r() - .5) * 60; ctx.lineTo(x, y); } ctx.stroke(); ctx.fillStyle = '#9fffca'; ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill(); } },
  scales(ctx, r) { ctx.fillStyle = '#7a2f9e'; ctx.fillRect(0, 0, 128, 128); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { ctx.fillStyle = ['#9440bd', '#6b2589', '#a95bd1'][Math.floor(r() * 3)]; ctx.beginPath(); ctx.arc(x * 16 + (y % 2 ? 8 : 0), y * 14 + 8, 9, 0, Math.PI); ctx.fill(); } },
  dots(ctx, r) { ctx.fillStyle = '#ff5f8f'; ctx.fillRect(0, 0, 128, 128); for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) { ctx.fillStyle = ['#fff0f4', '#ffd23f', '#4dd8ff'][Math.floor(r() * 3)]; ctx.beginPath(); ctx.arc(x * 22 + (y % 2 ? 11 : 0) + 6, y * 22 + 8, 5.5, 0, 7); ctx.fill(); } },
  urban(ctx, r) { ctx.fillStyle = '#8e929c'; ctx.fillRect(0, 0, 128, 128); for (let i = 0; i < 48; i++) { ctx.fillStyle = ['#5c606a', '#c2c6ce', '#3b3f49', '#a8acb6'][Math.floor(r() * 4)]; const s = 10 + r() * 22; ctx.save(); ctx.translate(r() * 128, r() * 128); ctx.rotate(Math.floor(r() * 4) * Math.PI / 4); ctx.fillRect(-s / 2, -s / 4, s, s / 2); ctx.restore(); } },
  leopard(ctx, r) { ctx.fillStyle = '#e8b45a'; ctx.fillRect(0, 0, 128, 128); for (let i = 0; i < 34; i++) { const x = r() * 128, y = r() * 128, s = 4 + r() * 6; ctx.fillStyle = '#b57922'; ctx.beginPath(); ctx.arc(x, y, s + 2.5, 0, 7); ctx.fill(); ctx.fillStyle = '#2c1c0c'; ctx.beginPath(); ctx.arc(x + (r() - .5) * 4, y + (r() - .5) * 4, s * .62, 0, 7); ctx.fill(); } },
  stripes(ctx) { ctx.fillStyle = '#e84438'; ctx.fillRect(0, 0, 128, 128); ctx.fillStyle = '#fff5e8'; ctx.fillRect(0, 34, 128, 14); ctx.fillRect(0, 80, 128, 14); ctx.fillStyle = '#2b2f45'; ctx.fillRect(0, 48, 128, 8); ctx.fillRect(0, 94, 128, 8); },
};

export const BUILDING_TEXTURES = Object.freeze(Object.keys(BUILDING_PAINTERS));
export const SKIN_TEXTURES = Object.freeze(Object.keys(SKIN_PAINTERS));

function paintTexture(name, painter) {
  const [canvas, ctx] = makeCanvas(); painter(ctx, seededRandom(name.length * 7919 + name.charCodeAt(0) * 131)); return toTexture(canvas);
}

export class MaterialLibrary {
  constructor(renderer, settings) { this.renderer = renderer; this.settings = settings; this.textures = {}; this.materials = {}; this.dynamicMaterials = []; }
  async load() {
    const loader = new THREE.TextureLoader();
    await Promise.all(Object.keys(textureColors).map(async kind => {
      try { this.textures[kind] = await loader.loadAsync(`/assets/textures/${kind}.png`); }
      catch { this.textures[kind] = fallbackTexture(kind); }
      const t = this.textures[kind]; t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    }));
    for (const [name, painter] of Object.entries(BUILDING_PAINTERS)) this.textures[name] = paintTexture(name, painter);
    for (const [name, painter] of Object.entries(SKIN_PAINTERS)) this.textures[`skin_${name}`] = paintTexture(name, painter);
    this.materials.grass = this.standard('grass', 0x8fe36c, 7);
    this.materials.dirt = this.standard('dirt', 0xe0aa8c, 6);
    this.materials.stone = this.standard('stone', 0xffffff, 4);
    this.materials.metal = this.standard('metal', 0xffffff, 3, .8);
    this.materials.wood = this.standard('wood', 0xffffff, 2);
    Object.assign(this, this.materials);
    return this;
  }
  standard(kind, color, repeat = 1, roughness = 1) {
    const map = this.textures[kind]; map.repeat.set(repeat, repeat);
    return kind === 'grass' || kind === 'dirt'
      ? new THREE.MeshBasicMaterial({ map, color })
      : new THREE.MeshStandardMaterial({ map, color, roughness, metalness: kind === 'metal' ? .35 : 0, flatShading: true });
  }
  // material for buildings/structures using one of the 10 generated textures
  building(name, options = {}) {
    const map = this.textures[name] || this.textures.stone;
    const mat = new THREE.MeshStandardMaterial({ map, roughness: .9, flatShading: true, ...options });
    if (options.repeat) { mat.map = map.clone(); mat.map.needsUpdate = true; mat.map.repeat.set(options.repeat, options.repeat); delete mat.repeat; }
    this.dynamicMaterials.push(mat); return mat;
  }
  // skin-wrapped material for destructo bodies, tinted toward team color
  skin(name, teamColor) {
    const map = this.textures[`skin_${name}`];
    const mat = new THREE.MeshStandardMaterial({ map, color: 0xffffff, emissive: teamColor, emissiveIntensity: .1, flatShading: true, roughness: .9 });
    this.dynamicMaterials.push(mat); return mat;
  }
  color(color, options = {}) { const mat = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: .85, ...options }); this.dynamicMaterials.push(mat); return mat; }
  team(color) { const map = this.textures.uniform; map.repeat.set(3, 3); const mat = new THREE.MeshStandardMaterial({ map, color, emissive: color, emissiveIntensity: .22, flatShading: true, roughness: .9 }); this.dynamicMaterials.push(mat); return mat; }
  dispose() { Object.values(this.materials).forEach(m => m.dispose()); this.dynamicMaterials.forEach(m => m.dispose()); Object.values(this.textures).forEach(t => t.dispose()); }
}

export function createWaterMaterial(texture) {
  const map = texture; map.wrapS = map.wrapT = THREE.MirroredRepeatWrapping; map.repeat.set(9, 2);
  return new THREE.ShaderMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false, uniforms: { uTime: { value: 0 }, uMap: { value: map }, uColorA: { value: new THREE.Color(0x1a8fd4) }, uColorB: { value: new THREE.Color(0x74eee6) } }, vertexShader: `uniform float uTime; varying float vWave; varying vec2 vUv; void main(){vUv=uv; vec3 p=position; float w=sin(p.x*.45+uTime*1.7)*.18+cos(p.y*.52-uTime*1.25)*.13; p.z+=w; vWave=w; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`, fragmentShader: `uniform float uTime; uniform sampler2D uMap; uniform vec3 uColorA; uniform vec3 uColorB; varying float vWave; varying vec2 vUv; void main(){vec2 flowUv=vUv*vec2(9.,2.)+vec2(uTime*.018,sin(uTime*.2)*.025);vec3 tex=texture2D(uMap,flowUv).rgb;float bands=step(.5,fract((vUv.x+vUv.y)*22.));vec3 c=mix(uColorA,uColorB,clamp(vWave*2.+.5,0.,1.));c=mix(c,tex,.4)+bands*.02;gl_FragColor=vec4(c,.85);}` });
}
