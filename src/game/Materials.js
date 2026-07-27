import * as THREE from 'three';

const textureColors = { grass: ['#5cc24f', '#8ae06a', '#3f9c3f'], dirt: ['#a5673f', '#c98a55', '#7a4c31'], stone: ['#8d8ba1', '#b9b5c9', '#615f78'], water: ['#28b1e6', '#74e2e8', '#1a78b8'], metal: ['#7a8492', '#aeb6bf', '#4a5464'], wood: ['#9c5a30', '#c98846', '#65391f'], uniform: ['#c4c9c6', '#98a09e', '#e2ded2'] };
export const BASE_TEXTURES = Object.freeze(Object.keys(textureColors));
export const MAP_TEXTURES = Object.freeze(['asphalt','road_lines','neon_concrete','city_glass','urban_brick','corrugated_steel','rooftop','sidewalk','jungle_floor','tree_bark','moss_stone','root_mud','volcanic_rock','lava_crust','summit_stone','vehicle_metal','gaia_blacksite_armor']);

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
  tech_roof(ctx, r) {
    ctx.fillStyle = '#b0b5be'; ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#6e737d'; ctx.lineWidth = 3;
    for (let i = 0; i <= 128; i += 32) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 128); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(128, i); ctx.stroke();
    }
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        ctx.fillStyle = r() > 0.5 ? '#c3c8d2' : '#9ea3ac';
        ctx.fillRect(x * 32 + 3, y * 32 + 3, 26, 26);
        ctx.fillStyle = '#5c6068';
        ctx.fillRect(x * 32 + 6, y * 32 + 6, 2, 2);
        ctx.fillRect(x * 32 + 24, y * 32 + 6, 2, 2);
      }
    }
  },
  tech_pillar(ctx, r) {
    ctx.fillStyle = '#9ea3ac'; ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#c3c8d2'; ctx.fillRect(16, 0, 96, 128);
    ctx.strokeStyle = '#5c6068'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(16, 128); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(112, 0); ctx.lineTo(112, 128); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(64, 0); ctx.lineTo(64, 128); ctx.stroke();
    for (let y = 16; y < 128; y += 32) {
      ctx.fillStyle = '#4a4d54'; ctx.fillRect(16, y, 96, 4);
      ctx.fillStyle = '#d9dce3';
      ctx.beginPath(); ctx.arc(32, y + 2, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(96, y + 2, 2, 0, Math.PI * 2); ctx.fill();
    }
  },
  // ── CRATE EXPECTATIONS · the confectionery pack ───────────────────────────
  // Eighteen candy tiles for the candyland battlefield. Every pattern is laid
  // on a pitch that divides 128 and anything crossing an edge is drawn again on
  // the opposite one, so a wafer wall or a sprinkle road repeats without a seam.
  // The two exceptions are deliberate: `peppermint` and `lollipop_swirl` are
  // radial, and they are only ever mapped onto discs and drums where the tile
  // is used once and its centre is the centre of the thing.
  candy_cane(ctx, r) {
    ctx.fillStyle = '#fff2f5'; ctx.fillRect(0, 0, 128, 128);
    for (let i = -4; i < 8; i++) {
      ctx.fillStyle = i % 2 ? '#ff3b57' : '#ff93a8';
      ctx.beginPath(); ctx.moveTo(i * 32, 0); ctx.lineTo(i * 32 + 15, 0); ctx.lineTo(i * 32 + 15 + 128, 128); ctx.lineTo(i * 32 + 128, 128); ctx.fill();
    }
    ctx.globalAlpha = .3; ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 190; i++) ctx.fillRect(r() * 128, r() * 128, 2, 2);
    ctx.globalAlpha = 1;
  },
  peppermint(ctx, r) {
    ctx.fillStyle = '#fffafc'; ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#ff2f4d';
    for (let i = 0; i < 6; i++) {
      const start = i / 6 * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(64, 64);
      for (let t = 0; t <= 1; t += .05) ctx.lineTo(64 + Math.cos(start + t * 1.5) * t * 92, 64 + Math.sin(start + t * 1.5) * t * 92);
      for (let t = 1; t >= 0; t -= .05) ctx.lineTo(64 + Math.cos(start + .52 + t * 1.5) * t * 92, 64 + Math.sin(start + .52 + t * 1.5) * t * 92);
      ctx.fill();
    }
    ctx.fillStyle = '#fffafc'; ctx.beginPath(); ctx.arc(64, 64, 9, 0, 7); ctx.fill();
    ctx.globalAlpha = .22; ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 120; i++) ctx.fillRect(r() * 128, r() * 128, 2, 2);
    ctx.globalAlpha = 1;
  },
  chocolate(ctx, r) {
    ctx.fillStyle = '#4a2415'; ctx.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      ctx.fillStyle = ['#5d2f1b', '#6b3720', '#54291a'][Math.floor(r() * 3)];
      ctx.fillRect(x * 64 + 4, y * 64 + 4, 56, 56);
      ctx.fillStyle = 'rgba(255,222,190,.16)'; ctx.fillRect(x * 64 + 4, y * 64 + 4, 56, 5);
      ctx.fillStyle = 'rgba(24,10,4,.35)'; ctx.fillRect(x * 64 + 4, y * 64 + 55, 56, 5);
    }
    ctx.globalAlpha = .3;
    for (let i = 0; i < 90; i++) { ctx.fillStyle = r() > .5 ? '#3a1a0e' : '#7c4526'; ctx.fillRect(r() * 128, r() * 128, 3, 3); }
    ctx.globalAlpha = 1;
  },
  white_chocolate(ctx, r) {
    ctx.fillStyle = '#f0dfbb'; ctx.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      ctx.fillStyle = ['#f7e9cb', '#ecd6ac', '#fbf1da'][Math.floor(r() * 3)];
      ctx.fillRect(x * 64 + 4, y * 64 + 4, 56, 56);
      ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(x * 64 + 4, y * 64 + 4, 56, 4);
      ctx.fillStyle = 'rgba(160,124,74,.3)'; ctx.fillRect(x * 64 + 4, y * 64 + 56, 56, 4);
    }
  },
  gingerbread(ctx, r) {
    ctx.fillStyle = '#b06a30'; ctx.fillRect(0, 0, 128, 128);
    ctx.globalAlpha = .5;
    for (let i = 0; i < 300; i++) { ctx.fillStyle = r() > .5 ? '#9d5a26' : '#c47c3f'; ctx.fillRect(r() * 128, r() * 128, 3 + r() * 4, 2 + r() * 3); }
    ctx.globalAlpha = 1;
    // piped icing along both tiling edges, so a wall of biscuit reads as baked panels
    ctx.strokeStyle = '#fffdf6'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    for (const y of [7, 121]) { ctx.beginPath(); for (let x = 0; x <= 128; x += 8) ctx.lineTo(x, y + Math.sin(x * .25) * 3); ctx.stroke(); }
    ctx.fillStyle = '#fffdf6';
    for (const [x, y] of [[20, 64], [64, 40], [104, 76], [44, 100]]) { ctx.beginPath(); ctx.arc(x, y, 4.5, 0, 7); ctx.fill(); }
  },
  licorice(ctx, r) {
    ctx.fillStyle = '#1b1622'; ctx.fillRect(0, 0, 128, 128);
    for (let x = 0; x < 128; x += 16) {
      ctx.fillStyle = ['#2a2233', '#211a29', '#332a3d'][Math.floor(r() * 3)];
      ctx.fillRect(x + 1, 0, 14, 128);
      ctx.fillStyle = 'rgba(190,160,225,.18)'; ctx.fillRect(x + 3, 0, 3, 128);
    }
  },
  frosting(ctx, r) {
    ctx.fillStyle = '#ffe6f3'; ctx.fillRect(0, 0, 128, 128);
    ctx.lineWidth = 13; ctx.lineCap = 'round';
    for (let y = -8; y < 136; y += 22) {
      ctx.strokeStyle = ['#ffd0e8', '#fff3fa', '#ffc0e0'][Math.floor(r() * 3)];
      ctx.beginPath(); for (let x = -8; x <= 136; x += 8) ctx.lineTo(x, y + Math.sin(x * .11) * 6); ctx.stroke();
    }
    // sprinkles, mirrored across both edges so none is ever cut in half
    for (let i = 0; i < 26; i++) {
      const x = r() * 128, y = r() * 128, angle = r() * Math.PI;
      ctx.strokeStyle = ['#ff4d7d', '#57d7ff', '#ffe14d', '#7bff9c', '#c07bff'][Math.floor(r() * 5)];
      ctx.lineWidth = 3.5;
      for (const [ox, oy] of [[0, 0], [128, 0], [-128, 0], [0, 128], [0, -128]]) {
        ctx.beginPath(); ctx.moveTo(x + ox - Math.cos(angle) * 5, y + oy - Math.sin(angle) * 5);
        ctx.lineTo(x + ox + Math.cos(angle) * 5, y + oy + Math.sin(angle) * 5); ctx.stroke();
      }
    }
  },
  sprinkle_icing(ctx, r) {
    ctx.fillStyle = '#fdf7ff'; ctx.fillRect(0, 0, 128, 128);
    ctx.globalAlpha = .5;
    for (let i = 0; i < 160; i++) { ctx.fillStyle = r() > .5 ? '#eee2f4' : '#ffffff'; ctx.fillRect(r() * 128, r() * 128, 4 + r() * 5, 3 + r() * 4); }
    ctx.globalAlpha = 1; ctx.lineWidth = 4; ctx.lineCap = 'round';
    for (let i = 0; i < 46; i++) {
      const x = r() * 128, y = r() * 128, angle = r() * Math.PI;
      ctx.strokeStyle = ['#ff4d7d', '#3fc9ff', '#ffd53f', '#5fe87e', '#b169ff', '#ff8a3f'][Math.floor(r() * 6)];
      for (const [ox, oy] of [[0, 0], [128, 0], [-128, 0], [0, 128], [0, -128]]) {
        ctx.beginPath(); ctx.moveTo(x + ox - Math.cos(angle) * 6, y + oy - Math.sin(angle) * 6);
        ctx.lineTo(x + ox + Math.cos(angle) * 6, y + oy + Math.sin(angle) * 6); ctx.stroke();
      }
    }
  },
  rainbow_road(ctx, r) {
    const bands = ['#ff3b57', '#ff8a2b', '#ffd93b', '#4ede75', '#3fbaff', '#6b6bff', '#c355ff'];
    for (let i = 0; i < bands.length; i++) {
      ctx.fillStyle = bands[i];
      ctx.fillRect(0, Math.round(i * 128 / bands.length), 128, Math.ceil(128 / bands.length) + 1);
    }
    ctx.globalAlpha = .3; ctx.fillStyle = '#ffffff';
    for (let x = 0; x < 128; x += 16) ctx.fillRect(x, 0, 5, 128);
    ctx.globalAlpha = .22; ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 120; i++) ctx.fillRect(r() * 128, r() * 128, 2, 2);
    ctx.globalAlpha = 1;
  },
  cotton_candy(ctx, r) {
    ctx.fillStyle = '#ffbfe4'; ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 220; i++) {
      const x = r() * 128, y = r() * 128, radius = 7 + r() * 16;
      ctx.globalAlpha = .16 + r() * .2;
      ctx.fillStyle = ['#ffe1f2', '#ff9ed4', '#c9c4ff', '#a8e9ff'][Math.floor(r() * 4)];
      for (const [ox, oy] of [[0, 0], [128, 0], [-128, 0], [0, 128], [0, -128]]) { ctx.beginPath(); ctx.arc(x + ox, y + oy, radius, 0, 7); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  },
  gumdrop(ctx, r) {
    ctx.fillStyle = '#ff5f8f'; ctx.fillRect(0, 0, 128, 128);
    ctx.globalAlpha = .28;
    for (let i = 0; i < 90; i++) { ctx.fillStyle = r() > .5 ? '#ff90b4' : '#e03c6c'; ctx.fillRect(r() * 128, r() * 128, 6 + r() * 10, 6 + r() * 10); }
    ctx.globalAlpha = .85;
    // the sugar crust: hundreds of tiny facets catching the light
    for (let i = 0; i < 460; i++) {
      const x = r() * 128, y = r() * 128, size = 1.5 + r() * 2.5;
      ctx.fillStyle = r() > .35 ? 'rgba(255,255,255,.75)' : 'rgba(255,220,240,.5)';
      ctx.beginPath(); ctx.moveTo(x, y - size); ctx.lineTo(x + size, y); ctx.lineTo(x, y + size); ctx.lineTo(x - size, y); ctx.fill();
    }
    ctx.globalAlpha = 1;
  },
  wafer(ctx, r) {
    for (let band = 0; band < 4; band++) {
      ctx.fillStyle = band % 2 ? '#f5d9a4' : '#c08d55';
      ctx.fillRect(0, band * 32, 128, 32);
      if (band % 2) {
        ctx.fillStyle = 'rgba(190,140,80,.35)';
        for (let x = 0; x < 128; x += 16) ctx.fillRect(x, band * 32 + 4, 8, 24);
      } else {
        ctx.fillStyle = 'rgba(255,235,205,.22)'; ctx.fillRect(0, band * 32, 128, 4);
        ctx.fillStyle = 'rgba(90,52,24,.28)'; ctx.fillRect(0, band * 32 + 28, 128, 4);
      }
    }
    ctx.globalAlpha = .25;
    for (let i = 0; i < 120; i++) { ctx.fillStyle = r() > .5 ? '#8a5c2e' : '#ffe8c4'; ctx.fillRect(r() * 128, r() * 128, 3, 2); }
    ctx.globalAlpha = 1;
  },
  caramel(ctx, r) {
    ctx.fillStyle = '#d68b2c'; ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 26; i++) {
      ctx.globalAlpha = .3 + r() * .35;
      ctx.strokeStyle = ['#f4b45a', '#e89b34', '#b96d1a', '#ffd489'][Math.floor(r() * 4)];
      ctx.lineWidth = 4 + r() * 10; ctx.lineCap = 'round';
      ctx.beginPath(); let x = r() * 128, y = -10; ctx.moveTo(x, y);
      while (y < 138) { y += 16 + r() * 14; x += (r() - .5) * 34; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    ctx.globalAlpha = .4; ctx.fillStyle = '#ffe7b4';
    for (let i = 0; i < 60; i++) ctx.fillRect(r() * 128, r() * 128, 3, 2);
    ctx.globalAlpha = 1;
  },
  marshmallow(ctx, r) {
    ctx.fillStyle = '#fff6f8'; ctx.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#ffe4ec' : '#fffdfe';
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x * 64 + 4, y * 64 + 4, 56, 56, 18) : ctx.rect(x * 64 + 4, y * 64 + 4, 56, 56);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.ellipse(x * 64 + 24, y * 64 + 22, 12, 8, -.4, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = .35; ctx.fillStyle = '#ffd2e0';
    for (let i = 0; i < 140; i++) ctx.fillRect(r() * 128, r() * 128, 2, 2);
    ctx.globalAlpha = 1;
  },
  jellybean(ctx, r) {
    ctx.fillStyle = '#2b1c3a'; ctx.fillRect(0, 0, 128, 128);
    const colors = ['#ff4d7d', '#ffd53f', '#5fe87e', '#3fbaff', '#c355ff', '#ff8a3f'];
    for (let i = 0; i < 34; i++) {
      const x = r() * 128, y = r() * 128, angle = r() * Math.PI, color = colors[Math.floor(r() * colors.length)];
      for (const [ox, oy] of [[0, 0], [128, 0], [-128, 0], [0, 128], [0, -128]]) {
        ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x + ox, y + oy, 13, 8, angle, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(x + ox - Math.cos(angle) * 3, y + oy - Math.sin(angle) * 3 - 2, 4.5, 2.4, angle, 0, 7); ctx.fill();
      }
    }
  },
  waffle_cone(ctx, r) {
    ctx.fillStyle = '#d99a4e'; ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#a96f2c'; ctx.lineWidth = 5;
    for (let i = -8; i <= 8; i++) {
      ctx.beginPath(); ctx.moveTo(i * 16, 0); ctx.lineTo(i * 16 + 128, 128); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i * 16, 128); ctx.lineTo(i * 16 + 128, 0); ctx.stroke();
    }
    ctx.globalAlpha = .3; ctx.fillStyle = '#ffe0a8';
    for (let i = 0; i < 130; i++) ctx.fillRect(r() * 128, r() * 128, 3, 3);
    ctx.globalAlpha = 1;
  },
  lollipop_swirl(ctx, r) {
    ctx.fillStyle = '#fff7fb'; ctx.fillRect(0, 0, 128, 128);
    const colors = ['#ff3b7b', '#ffd53f', '#3fd0ff', '#7bff9c'];
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = colors[i]; ctx.lineWidth = 11; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let t = 0; t <= 1; t += .02) {
        const angle = i / 4 * Math.PI * 2 + t * Math.PI * 3.1;
        ctx.lineTo(64 + Math.cos(angle) * t * 88, 64 + Math.sin(angle) * t * 88);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = .3; ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 110; i++) ctx.fillRect(r() * 128, r() * 128, 2, 2);
    ctx.globalAlpha = 1;
  },
  soda_fizz(ctx, r) {
    ctx.fillStyle = '#ff9b3f'; ctx.fillRect(0, 0, 128, 128);
    ctx.globalAlpha = .4;
    for (let i = 0; i < 60; i++) { ctx.fillStyle = r() > .5 ? '#ffc46b' : '#ff7a24'; ctx.fillRect(r() * 128, r() * 128, 8 + r() * 14, 8 + r() * 14); }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 70; i++) {
      const x = r() * 128, y = r() * 128, radius = 2 + r() * 6;
      for (const [ox, oy] of [[0, 0], [128, 0], [-128, 0], [0, 128], [0, -128]]) {
        ctx.strokeStyle = 'rgba(255,246,214,.8)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(x + ox, y + oy, radius, 0, 7); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.arc(x + ox - radius * .3, y + oy - radius * .3, radius * .32, 0, 7); ctx.fill();
      }
    }
  },
  jelly(ctx, r) {
    ctx.fillStyle = '#ff2f6d'; ctx.fillRect(0, 0, 128, 128);
    ctx.globalAlpha = .35;
    for (let i = 0; i < 40; i++) { ctx.fillStyle = r() > .5 ? '#ff6d9c' : '#c8134a'; ctx.beginPath(); ctx.arc(r() * 128, r() * 128, 8 + r() * 20, 0, 7); ctx.fill(); }
    ctx.globalAlpha = .55; ctx.fillStyle = '#ffd0e0';
    for (let i = 0; i < 20; i++) {
      const x = r() * 128, y = r() * 128;
      for (const [ox, oy] of [[0, 0], [128, 0], [-128, 0], [0, 128], [0, -128]]) { ctx.beginPath(); ctx.ellipse(x + ox, y + oy, 7, 3.4, -.6, 0, 7); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  },
  crate_brown(ctx, r) {
    ctx.fillStyle = '#9c5a30'; ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#65391f'; ctx.lineWidth = 2;
    for (let y = 16; y < 128; y += 16) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(128, y); ctx.stroke();
    }
    ctx.fillStyle = '#824924';
    ctx.beginPath(); ctx.moveTo(14, 14); ctx.lineTo(24, 14); ctx.lineTo(114, 104); ctx.lineTo(114, 114); ctx.lineTo(104, 114); ctx.lineTo(14, 24); ctx.fill();
    ctx.beginPath(); ctx.moveTo(114, 14); ctx.lineTo(114, 24); ctx.lineTo(24, 114); ctx.lineTo(14, 114); ctx.lineTo(14, 104); ctx.lineTo(104, 14); ctx.fill();
    ctx.fillStyle = '#3a3c42';
    ctx.fillRect(0, 0, 128, 14);
    ctx.fillRect(0, 114, 128, 14);
    ctx.fillRect(0, 14, 14, 100);
    ctx.fillRect(114, 14, 14, 100);
    ctx.fillStyle = '#9ea0a6';
    for (const [x, y] of [[7, 7], [121, 7], [7, 121], [121, 121], [7, 64], [121, 64], [64, 7], [64, 121]]) {
      ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
    }
  },
  crate_yellow(ctx, r) {
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#2c2e35';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(30 + i * 20, 20);
      ctx.lineTo(45 + i * 20, 20);
      ctx.lineTo(20 + i * 20, 108);
      ctx.lineTo(5 + i * 20, 108);
      ctx.fill();
    }
    ctx.strokeStyle = '#c79415'; ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, 88, 88);
    ctx.fillStyle = '#2c2e35';
    ctx.fillRect(0, 0, 128, 16);
    ctx.fillRect(0, 112, 128, 16);
    ctx.fillRect(0, 16, 16, 96);
    ctx.fillRect(112, 16, 16, 96);
    ctx.fillStyle = '#e5b512';
    for (const [x, y] of [[8, 8], [120, 8], [8, 120], [120, 120]]) {
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    }
  },
  crate_blue(ctx, r) {
    ctx.fillStyle = '#102a54'; ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#00bbff'; ctx.lineWidth = 3;
    ctx.strokeRect(24, 24, 80, 80);
    ctx.beginPath();
    ctx.moveTo(24, 24); ctx.lineTo(8, 8);
    ctx.moveTo(104, 24); ctx.lineTo(120, 8);
    ctx.moveTo(24, 104); ctx.lineTo(8, 120);
    ctx.moveTo(104, 104); ctx.lineTo(120, 120);
    ctx.stroke();
    ctx.fillStyle = '#a4eeff';
    ctx.beginPath(); ctx.arc(64, 64, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7a8492';
    ctx.fillRect(0, 0, 128, 10);
    ctx.fillRect(0, 118, 128, 10);
    ctx.fillRect(0, 10, 10, 108);
    ctx.fillRect(118, 10, 10, 108);
  },
  crate_red(ctx, r) {
    ctx.fillStyle = '#1e1a1d'; ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = '#ff3344'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(20, 64); ctx.lineTo(50, 40); ctx.lineTo(78, 88); ctx.lineTo(108, 64);
    ctx.stroke();
    ctx.fillStyle = '#ffaabb';
    ctx.beginPath(); ctx.arc(50, 40, 3, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(78, 88, 3, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#d9a928';
    ctx.fillRect(0, 0, 128, 14);
    ctx.fillRect(0, 114, 128, 14);
    ctx.fillRect(0, 14, 14, 100);
    ctx.fillRect(114, 14, 14, 100);
    ctx.fillStyle = '#fff0c0';
    for (const [x, y] of [[7, 7], [121, 7], [7, 121], [121, 121]]) {
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    }
  },
};

// Purchasable crate textures are deterministic overlays. They never accept a
// player color: the underlying brown/yellow/blue/red rarity painter remains the
// source of the crate's palette and silhouette-readable gameplay color.
const CRATE_DESIGN_OVERLAYS = Object.freeze({
  scrapline(ctx, r) {
    ctx.save(); ctx.globalAlpha = .42; ctx.strokeStyle = '#e8edf2'; ctx.lineWidth = 3;
    for (let y = 26; y < 128; y += 25) { ctx.beginPath(); ctx.moveTo(15, y); ctx.lineTo(113, y + (r() - .5) * 5); ctx.stroke(); }
    ctx.fillStyle = '#202630';
    for (const [x,y] of [[24,24],[104,24],[24,104],[104,104]]) { ctx.beginPath(); ctx.arc(x,y,5,0,Math.PI*2); ctx.fill(); }
    ctx.restore();
  },
  hazardGrid(ctx) {
    ctx.save(); ctx.globalAlpha = .48; ctx.strokeStyle = '#151a22'; ctx.lineWidth = 5;
    for (let x = -96; x < 224; x += 32) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x+128,128); ctx.stroke(); }
    ctx.globalAlpha = .65; ctx.strokeStyle = '#f3f6f8'; ctx.lineWidth = 2; ctx.strokeRect(25,25,78,78); ctx.restore();
  },
  reactorTrace(ctx, r) {
    ctx.save(); ctx.globalAlpha = .68; ctx.strokeStyle = '#d9fbff'; ctx.lineWidth = 2;
    for (let i=0;i<8;i++) { let x=16+r()*96,y=16+r()*96;ctx.beginPath();ctx.moveTo(x,y);for(let n=0;n<3;n++){r()>.5?x+=r()>.5?16:-16:y+=r()>.5?16:-16;ctx.lineTo(x,y)}ctx.stroke();ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill(); }
    ctx.restore();
  },
  rivetCamo(ctx, r) {
    ctx.save(); ctx.globalAlpha = .32; ctx.fillStyle = '#10151d';
    for (let i=0;i<18;i++){const x=r()*128,y=r()*128,w=18+r()*28;ctx.save();ctx.translate(x,y);ctx.rotate((r()-.5)*1.4);ctx.fillRect(-w/2,-6,w,12);ctx.restore()}
    ctx.globalAlpha=.7;ctx.fillStyle='#f5f7f8';for(let y=12;y<128;y+=26)for(let x=12;x<128;x+=26){ctx.beginPath();ctx.arc(x,y,2,0,Math.PI*2);ctx.fill()}ctx.restore();
  },
});

function paintCrateDesignTexture(typeId, designId) {
  const [canvas, ctx] = makeCanvas();
  const base = BUILDING_PAINTERS[`crate_${typeId}`] || BUILDING_PAINTERS.crate_brown;
  const seed = `${typeId}:${designId}`;
  base(ctx, seededRandom(seed.length * 7919 + seed.charCodeAt(0) * 131));
  CRATE_DESIGN_OVERLAYS[designId]?.(ctx, seededRandom(seed.length * 3571 + seed.charCodeAt(seed.length - 1) * 97));
  return toTexture(canvas);
}

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

// Paint the exact procedural uniform used in battle into setup-screen canvases.
export function paintSkinPreview(canvas, name) {
  const painter = SKIN_PAINTERS[name] || SKIN_PAINTERS.camo;
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  painter(ctx, seededRandom(name.length * 7919 + name.charCodeAt(0) * 131));
}

// ── map-picker card art ─────────────────────────────────────────────────────
// Most battlefields show their signature texture asset in the setup screen.
// Candyland has no raster asset — its whole surface is painted at runtime — so
// it paints its own postcard instead: the layer-cake mountain, the spiral road
// climbing it, a rainbow bridge and the cocoa run, under a sugar-floss sky.
export const MAP_PREVIEW_PAINTERS = Object.freeze({
  crown(ctx, width, height) {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#ffd9f1'); sky.addColorStop(.55, '#ffeaf7'); sky.addColorStop(1, '#c9f6e2');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);
    // floss clouds
    ctx.fillStyle = 'rgba(255,255,255,.72)';
    for (const [cx, cy, radius] of [[.16, .16, .09], [.24, .18, .07], [.8, .12, .08], [.72, .15, .06]]) {
      ctx.beginPath(); ctx.arc(cx * width, cy * height, radius * width, 0, 7); ctx.fill();
    }
    // the cocoa run cutting across the foreground
    ctx.strokeStyle = '#5d2f1b'; ctx.lineWidth = height * .09; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-10, height * .93); ctx.quadraticCurveTo(width * .45, height * .78, width + 10, height * .95); ctx.stroke();
    // the layer cake: four tiers, widest at the bottom
    const tiers = [[.46, .74, '#5d2f1b'], [.36, .60, '#f0dfbb'], [.26, .47, '#ff9ec9'], [.16, .35, '#fff2f5']];
    for (const [half, top, color] of tiers) {
      ctx.fillStyle = color;
      ctx.fillRect(width * (.5 - half), height * top, width * half * 2, height * (.95 - top));
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.fillRect(width * (.5 - half), height * top, width * half * 2, height * .035);
    }
    // the spiral candy road, wrapping the cake tier by tier
    ctx.lineWidth = height * .028; ctx.strokeStyle = '#ff3b57';
    for (let i = 0; i < 4; i++) {
      const y = height * (.40 + i * .13), half = width * (.17 + i * .1);
      ctx.beginPath(); ctx.moveTo(width * .5 - half, y + height * .03); ctx.lineTo(width * .5 + half, y); ctx.stroke();
    }
    // a rainbow bridge reaching in from the right
    const bands = ['#ff3b57', '#ff8a2b', '#ffd93b', '#4ede75', '#3fbaff', '#c355ff'];
    bands.forEach((color, i) => {
      ctx.strokeStyle = color; ctx.lineWidth = height * .016;
      ctx.beginPath();
      ctx.moveTo(width + 6, height * (.62 + i * .018));
      ctx.quadraticCurveTo(width * .78, height * (.34 + i * .018), width * .62, height * (.47 + i * .018));
      ctx.stroke();
    });
    // the cherry on top and its glow
    ctx.fillStyle = '#ff2f4d'; ctx.beginPath(); ctx.arc(width * .5, height * .29, height * .05, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(width * .485, height * .275, height * .016, 0, 7); ctx.fill();
    // lollipops on the near ground
    for (const [x, scale] of [[.08, 1], [.19, .7], [.9, .85]]) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = height * .015;
      ctx.beginPath(); ctx.moveTo(width * x, height * .98); ctx.lineTo(width * x, height * (.98 - .2 * scale)); ctx.stroke();
      ctx.fillStyle = '#ff5f9e'; ctx.beginPath(); ctx.arc(width * x, height * (.98 - .22 * scale), height * .055 * scale, 0, 7); ctx.fill();
      ctx.strokeStyle = '#fff7fb'; ctx.lineWidth = height * .012;
      ctx.beginPath(); ctx.arc(width * x, height * (.98 - .22 * scale), height * .028 * scale, 0, 4.4); ctx.stroke();
    }
    // sprinkles over the whole card
    const random = seededRandom(4242);
    for (let i = 0; i < 46; i++) {
      const x = random() * width, y = random() * height * .96, angle = random() * Math.PI;
      ctx.strokeStyle = bands[Math.floor(random() * bands.length)]; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(x - Math.cos(angle) * 4, y - Math.sin(angle) * 4);
      ctx.lineTo(x + Math.cos(angle) * 4, y + Math.sin(angle) * 4); ctx.stroke();
    }
  },
});
export function paintMapPreview(canvas, mapId) {
  const painter = MAP_PREVIEW_PAINTERS[mapId];
  if (!painter || !canvas?.getContext) return false;
  painter(canvas.getContext('2d'), canvas.width || 300, canvas.height || 220);
  return true;
}

function paintTexture(name, painter) {
  const [canvas, ctx] = makeCanvas(); painter(ctx, seededRandom(name.length * 7919 + name.charCodeAt(0) * 131)); return toTexture(canvas);
}

export class MaterialLibrary {
  constructor(renderer, settings) { this.renderer = renderer; this.settings = settings; this.textures = {}; this.materials = {}; this.dynamicMaterials = []; this.ownedTextures = []; this.surfaceMaterials = new Map(); }
  async load() {
    const loader = new THREE.TextureLoader();
    await Promise.all(Object.keys(textureColors).map(async kind => {
      try { this.textures[kind] = await loader.loadAsync(`/assets/textures/${kind}.png`); }
      catch { this.textures[kind] = fallbackTexture(kind); }
      const t = this.textures[kind]; t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    }));
    await Promise.all(MAP_TEXTURES.map(async name => {
      try {
        const extension=name==='gaia_blacksite_armor'?'png':'webp';
        const t = await loader.loadAsync(`/assets/textures/maps/${name}.${extension}`);
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy()); this.textures[name] = t;
      } catch { this.textures[name] = fallbackTexture('stone'); }
    }));
    for (const [name, painter] of Object.entries(BUILDING_PAINTERS)) this.textures[name] = paintTexture(name, painter);
    for (const [name, painter] of Object.entries(SKIN_PAINTERS)) this.textures[`skin_${name}`] = paintTexture(name, painter);
    // The production jungle tile is authored as a high-resolution raster asset;
    // the remaining nine deterministic painters are kept as fast seamless game textures.
    try { const camo = await loader.loadAsync('/assets/textures/uniforms/camo.png'); camo.wrapS=camo.wrapT=THREE.RepeatWrapping;camo.colorSpace=THREE.SRGBColorSpace;camo.anisotropy=Math.min(4,this.renderer.capabilities.getMaxAnisotropy());this.textures.skin_camo=camo; } catch { /* procedural camo remains active */ }
    this.materials.grass = this.standard('grass', 0x8fe36c, 7);
    this.materials.dirt = this.standard('dirt', 0xe0aa8c, 6);
    this.materials.stone = this.standard('stone', 0xffffff, 4);
    this.materials.metal = this.standard('metal', 0xffffff, 3, .8);
    this.materials.wood = this.standard('wood', 0xffffff, 2);
    this.materials.treeCrown = this.color(0x4bb84f, { roughness: 0.85 });
    Object.assign(this, this.materials);
    return this;
  }
  standard(kind, color, repeat = 1, roughness = 1) {
    const map = this.textures[kind]; map.repeat.set(repeat, repeat);
    // grass is lit + flat-shaded so the terrain hills read as low-poly facets
    return kind === 'dirt'
      ? new THREE.MeshBasicMaterial({ map, color })
      : new THREE.MeshStandardMaterial({ map, color, roughness, metalness: kind === 'metal' ? .35 : 0, flatShading: true });
  }
  surface(name, options = {}) {
    const {
      repeat = [1, 1], rotation = 0, color = 0xffffff, roughness = .96,
      metalness = 0, transparent = false, opacity = 1, depthWrite = true,
      emissive = 0x000000, emissiveIntensity = 0,
    } = options;
    const repeatPair = Array.isArray(repeat) ? repeat : [repeat, repeat];
    const key = JSON.stringify({ name, repeat: repeatPair, rotation, color, roughness, metalness, transparent, opacity, depthWrite, emissive, emissiveIntensity });
    if (this.surfaceMaterials.has(key)) return this.surfaceMaterials.get(key);
    const source = this.textures[name] || this.textures.stone;
    const map = source.clone();
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.center.set(.5, .5); map.rotation = rotation; map.repeat.set(repeatPair[0], repeatPair[1]); map.needsUpdate = true;
    const material = new THREE.MeshStandardMaterial({ map, color, roughness, metalness, transparent, opacity, depthWrite, emissive, emissiveIntensity, flatShading: true });
    this.ownedTextures.push(map); this.dynamicMaterials.push(material); this.surfaceMaterials.set(key, material);
    return material;
  }
  // material for buildings/structures using one of the 10 generated textures
  building(name, options = {}) {
    const map = this.textures[name] || this.textures.stone;
    const { repeat, ...materialOptions } = options;
    const mat = new THREE.MeshStandardMaterial({ map, roughness: .9, flatShading: true, ...materialOptions });
    if (repeat) { mat.map = map.clone(); mat.map.needsUpdate = true; mat.map.repeat.set(repeat, repeat); }
    this.dynamicMaterials.push(mat); return mat;
  }
  // skin-wrapped material for destructo bodies, tinted toward team color
  skin(name, teamColor) {
    const map = this.textures[`skin_${name}`];
    const mat = new THREE.MeshStandardMaterial({ map, color: 0xffffff, flatShading: true, roughness: .9 });
    this.dynamicMaterials.push(mat); return mat;
  }
  color(color, options = {}) { const mat = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: .85, ...options }); this.dynamicMaterials.push(mat); return mat; }
  teamTextured(name, color, repeat = 1) {
    const map = this.textures[name] || this.textures.stone;
    const mat = new THREE.MeshStandardMaterial({ map, color, roughness: .6, metalness: .4, flatShading: true });
    if (repeat !== 1) { mat.map = map.clone(); mat.map.needsUpdate = true; mat.map.repeat.set(repeat, repeat); }
    this.dynamicMaterials.push(mat); return mat;
  }
  crate(typeId, designId = 'standard') {
    const textureKey = designId === 'standard' ? `crate_${typeId}` : `crate_${typeId}_${designId}`;
    if (!this.textures[textureKey] && CRATE_DESIGN_OVERLAYS[designId]) this.textures[textureKey] = paintCrateDesignTexture(typeId, designId);
    const map = this.textures[textureKey] || this.textures[`crate_${typeId}`] || this.textures.stone;
    const isRareOrLegendary = typeId === 'blue' || typeId === 'red';
    const mat = new THREE.MeshStandardMaterial({
      map,
      roughness: isRareOrLegendary ? 0.35 : 0.72,
      metalness: typeId === 'brown' ? 0.15 : 0.75,
      flatShading: true,
      emissive: isRareOrLegendary ? (typeId === 'blue' ? 0x0c4780 : 0x800c14) : 0x000000,
      emissiveIntensity: isRareOrLegendary ? 0.35 : 0
    });
    this.dynamicMaterials.push(mat); return mat;
  }
  team(color) { const map = this.textures.uniform; map.repeat.set(3, 3); const mat = new THREE.MeshStandardMaterial({ map, color, emissive: color, emissiveIntensity: .22, flatShading: true, roughness: .9 }); this.dynamicMaterials.push(mat); return mat; }
  dispose() { Object.values(this.materials).forEach(m => m.dispose()); this.dynamicMaterials.forEach(m => m.dispose()); this.ownedTextures.forEach(t => t.dispose()); Object.values(this.textures).forEach(t => t.dispose()); this.surfaceMaterials.clear(); }
}

export function createWaterMaterial(texture) {
  const map = texture; map.wrapS = map.wrapT = THREE.MirroredRepeatWrapping; map.repeat.set(9, 2);
  return new THREE.ShaderMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false, uniforms: { uTime: { value: 0 }, uMap: { value: map }, uColorA: { value: new THREE.Color(0x1a8fd4) }, uColorB: { value: new THREE.Color(0x74eee6) } }, vertexShader: `uniform float uTime; varying float vWave; varying vec2 vUv; void main(){vUv=uv; vec3 p=position; float w=sin(p.x*.45+uTime*1.7)*.18+cos(p.y*.52-uTime*1.25)*.13; p.z+=w; vWave=w; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`, fragmentShader: `uniform float uTime; uniform sampler2D uMap; uniform vec3 uColorA; uniform vec3 uColorB; varying float vWave; varying vec2 vUv; void main(){vec2 flowUv=vUv*vec2(9.,2.)+vec2(uTime*.018,sin(uTime*.2)*.025);vec3 tex=texture2D(uMap,flowUv).rgb;float bands=step(.5,fract((vUv.x+vUv.y)*22.));vec3 c=mix(uColorA,uColorB,clamp(vWave*2.+.5,0.,1.));c=mix(c,tex,.4)+bands*.02;gl_FragColor=vec4(c,.85);}` });
}
