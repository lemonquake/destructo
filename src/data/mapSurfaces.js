const ribbon = (texture, width, points, options = {}) => ({ kind: 'ribbon', texture, width, points, ...options });
const patch = (texture, center, radius, options = {}) => ({ kind: 'patch', texture, center, radius, ...options });
const ring = (texture, center, innerRadius, outerRadius, options = {}) => ({ kind: 'ring', texture, center, innerRadius, outerRadius, ...options });
const rect = (texture, center, size, options = {}) => ({ kind: 'rect', texture, center, size, ...options });

// Surface art is intentionally separate from collision and height generation. These
// themes only paint the existing terrain, so map balance and navigation stay stable.
export const MAP_SURFACE_THEMES = Object.freeze({
  crossroads: Object.freeze({
    base: { texture: 'dirt', repeat: [12, 12], color: 0x817a72, roughness: 1 },
    layers: [
      patch('dirt', [-57, -54], 15, { repeat: [3, 3], color: 0x8e786c, seed: 11 }),
      patch('dirt', [55, 48], 17, { repeat: [3, 3], color: 0x806f68, seed: 12 }),
      ...[[-28, -28], [28, 28], [-28, 28], [28, -28]].map(([x, z], i) => rect('grass', [x, z], [12, 12], { repeat: [2, 2], color: i % 2 ? 0x789e62 : 0x6f955b, rotation: i * .17 })),
      rect('grass', [0, 42], [5, 22], { repeat: [1, 3], color: 0x789e62 }),
      rect('sidewalk', [0, 0], [18, 18], { repeat: [2, 2], color: 0xc8c4b7, rotation: Math.PI / 4 }),
      ...[-42, -14, 14, 42].map(x => ribbon('asphalt', 11, [[x, -75], [x, 75]], { repeat: [1, 10], color: 0xd6d8dc })),
      ...[-42, -14, 14, 42].map(z => ribbon('asphalt', 11, [[-75, z], [75, z]], { repeat: [1, 10], color: 0xd6d8dc, offset: 0.012 })),
      ribbon('road_lines', 7.5, [[-75, 14], [75, 14]], { repeat: [1, 9], offset: 0.024 }),
    ],
  }),
  crown: Object.freeze({
    base: { texture: 'grass', repeat: [18, 18], color: 0x9da28a, roughness: 1 },
    layers: [
      ...[-2.35, -.8, .75, 2.3].map((angle, i) => ribbon('dirt', 5.5, [[Math.cos(angle) * 72, Math.sin(angle) * 72], [Math.cos(angle) * 31, Math.sin(angle) * 31], [0, 0]], { repeat: [1, 8], color: 0xb59678, offset: i * .002 })),
      ring('dirt', [0, 0], 21, 29, { repeat: [4, 4], color: 0xa98c71 }),
      patch('summit_stone', [0, 0], 20, { repeat: [4, 4], color: 0xe1ddd2, seed: 21, irregularity: .04 }),
      ring('stone', [0, 0], 7.5, 10.5, { repeat: [3, 3], color: 0xc9c5c8, offset: .018 }),
    ],
  }),
  wilds: Object.freeze({
    base: { texture: 'grass', repeat: [20, 20], color: 0x829572, roughness: 1 },
    layers: [
      ribbon('dirt', 5, [[-70, -50], [-37, -24], [-9, -8], [18, 9], [52, 44], [72, 57]], { repeat: [1, 11], color: 0x9c7254 }),
      ribbon('dirt', 4, [[-58, 55], [-28, 30], [-8, -8], [20, -36], [58, -58]], { repeat: [1, 10], color: 0x9c7254, offset: .012 }),
      ...[[-39, 35, 14], [34, 31, 12], [30, -39, 15], [-36, -34, 13]].map(([x, z, r], i) => patch('jungle_floor', [x, z], r, { repeat: [3, 3], seed: 31 + i, color: 0xb7c89c })),
      ...[[-18, 18, 8], [22, -16, 9], [0, 42, 7]].map(([x, z, r], i) => patch('root_mud', [x, z], r, { repeat: [2, 2], seed: 41 + i, color: 0xb39575, offset: .018 })),
    ],
  }),
  rift: Object.freeze({
    base: { texture: 'dirt', repeat: [14, 14], color: 0x78625c, roughness: 1 },
    layers: [
      ...[-2.4, -.8, .8, 2.4].map((angle, i) => ribbon('volcanic_rock', 11, [[Math.cos(angle) * 76, Math.sin(angle) * 76], [Math.cos(angle) * 37, Math.sin(angle) * 37], [Math.cos(angle) * 24, Math.sin(angle) * 24]], { repeat: [1, 7], color: 0xb7a5a1, offset: i * .003 })),
      ring('volcanic_rock', [0, 0], 27, 39, { repeat: [5, 5], color: 0xb4a3a0 }),
      ring('lava_crust', [0, 0], 14, 26, { repeat: [4, 4], emissive: 0x5f1100, emissiveIntensity: .42, offset: .018 }),
      rect('metal', [0, -45], [26, 18], { repeat: [4, 3], color: 0x85878d, rotation: .08 }),
      rect('stone', [42, 28], [20, 16], { repeat: [3, 2], color: 0x8c8588, rotation: -.18 }),
    ],
  }),
  sunken: Object.freeze({
    base: { texture: 'grass', repeat: [20, 20], color: 0x71816b, roughness: 1 },
    layers: [
      ribbon('root_mud', 8, [[-82, 6], [-48, -4], [-18, 6], [12, -2], [48, 8], [82, -4]], { repeat: [1, 12], color: 0x8c735e }),
      ribbon('dirt', 5, [[-62, -55], [-42, -28], [0, 0], [42, 38], [67, 64]], { repeat: [1, 10], color: 0xa08261, offset: .012 }),
      ...[[0, 0, 18], [-48, -28, 10], [48, -28, 10], [-42, 38, 10], [42, 38, 10]].map(([x, z, r], i) => patch('moss_stone', [x, z], r, { repeat: [3, 3], seed: 51 + i, color: 0xb9b8a1 })),
      ...[[-24, 8, 10], [25, 5, 11], [0, -36, 9]].map(([x, z, r], i) => patch('water', [x, z], r, { repeat: [2, 2], seed: 61 + i, color: 0x69b8bc, transparent: true, opacity: .58, depthWrite: false, offset: .03 })),
    ],
  }),
  serpent: Object.freeze({
    base: { texture: 'grass', repeat: [20, 20], color: 0x69775d, roughness: 1 },
    layers: [
      ribbon('dirt', 7, [[-88, -24], [-67, -18], [-46, 25], [-22, -8], [0, 17], [25, -11], [49, 27], [76, -23], [90, -18]], { repeat: [1, 15], color: 0x937154 }),
      ribbon('summit_stone', 12, [[-82, -18], [-58, 2], [-32, 4], [0, 17], [28, 2], [56, 4], [82, -20]], { repeat: [1, 12], color: 0x9da09a, offset: .014 }),
      ...[[-70, -22], [-46, 28], [-22, -10], [0, 18], [25, -13], [49, 30], [72, -24]].map(([x, z], i) => patch('moss_stone', [x, z], 8.5, { repeat: [2, 2], seed: 71 + i, color: 0xaaa990, offset: .026 })),
      ...[[-30, 42, 10], [35, -42, 11]].map(([x, z, r], i) => patch('root_mud', [x, z], r, { repeat: [2, 2], seed: 81 + i, color: 0x92765b })),
    ],
  }),
  eclipse: Object.freeze({
    base: { texture: 'grass', repeat: [20, 20], color: 0x586752, roughness: 1 },
    layers: [
      ...[-2.5, -1.25, 0, 1.25, 2.5].map((angle, i) => ribbon('dirt', 6, [[Math.cos(angle) * 92, Math.sin(angle) * 92], [Math.cos(angle) * 53, Math.sin(angle) * 53], [0, 0]], { repeat: [1, 12], color: 0x80664f, offset: i * .002 })),
      ...[[0, -54], [52, -18], [32, 46], [-32, 46], [-52, -18]].map(([x, z], i) => patch('moss_stone', [x, z], 11, { repeat: [3, 3], seed: 91 + i, color: 0xa6a396 })),
      ring('root_mud', [0, 0], 18, 46, { repeat: [6, 6], color: 0x806b5c }),
      patch('marble', [0, 0], 17, { repeat: [4, 4], seed: 99, color: 0xb9aec7, offset: .018 }),
      ring('neon_concrete', [0, 0], 12.5, 15.5, { repeat: [3, 3], color: 0x745b8f, emissive: 0x29113f, emissiveIntensity: .25, offset: .032 }),
    ],
  }),
});

export const surfaceTexturesForTheme = theme => [theme.base.texture, ...theme.layers.map(layer => layer.texture)];
