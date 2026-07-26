// Builds the visible arena from the geometry records in src/data/arenaMaps.js.
// One record in, one mesh out — so what the AI collides with and what the
// player sees can never drift apart.

import * as THREE from 'three';
import { rampHeightAt } from './ArenaTerrain.js';

const PALETTE = {
  steel: { color: 0x5c6675, roughness: 0.62, metalness: 0.45 },
  plate: { color: 0x7b6a52, roughness: 0.7, metalness: 0.3 },
  grate: { color: 0x3f4a58, roughness: 0.5, metalness: 0.6 },
  crate: { color: 0xb5793a, roughness: 0.85, metalness: 0.05 },
  concrete: { color: 0x8d8d92, roughness: 0.95, metalness: 0.02 },
  neon: { color: 0x2a1c4a, roughness: 0.4, metalness: 0.5, emissive: 0x5a2ea8, emissiveIntensity: 0.35 },
  city: { color: 0x182538, roughness: 0.82, metalness: 0.12 },
  cityConcrete: { color: 0x454f5d, roughness: 0.94, metalness: 0.03 },
  cityNeon: { color: 0x211638, roughness: 0.48, metalness: 0.35, emissive: 0x381d66, emissiveIntensity: 0.28 },
  asphalt: { color: 0x2c3038, roughness: 0.98, metalness: 0.02 },
  rock: { color: 0x50413c, roughness: 0.98, metalness: 0.02 },
  obsidian: { color: 0x241d26, roughness: 0.35, metalness: 0.5 },
  hazardstripe: { color: 0xffb02e, roughness: 0.55, metalness: 0.25, emissive: 0x7a4a00, emissiveIntensity: 0.3 },
};

// Triangular prism rising toward local +Z. `dir` rotates it into place.
export function createRampGeometry(width, depth, rise) {
  const hw = width / 2, hd = depth / 2;
  const positions = [];
  const push = (...points) => { for (const p of points) positions.push(p[0], p[1], p[2]); };
  const a = [-hw, 0, -hd], b = [hw, 0, -hd], c = [hw, rise, hd], d = [-hw, rise, hd];
  const a2 = [-hw, 0, hd], b2 = [hw, 0, hd];
  push(a, b, c); push(a, c, d);          // slope
  push(a2, c, b2); push(a2, d, c);       // underside cap (back wall)
  push(a, a2, b2); push(a, b2, b);       // floor
  push(a, d, a2);                        // left side
  push(b, b2, c);                        // right side
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export class ArenaWorld {
  constructor(scene, mapDef, terrain) {
    this.scene = scene;
    this.map = mapDef;
    this.terrain = terrain;
    this.materials = new Map();
    this.pieceMeshes = new Map();
    this.hazardMeshes = [];
    this.disposables = [];
    this.root = new THREE.Group();
    this.root.name = 'arena-world';
    scene.add(this.root);
    this.build();
  }
  material(name) {
    if (this.materials.has(name)) return this.materials.get(name);
    const spec = PALETTE[name] || PALETTE.steel;
    const material = new THREE.MeshStandardMaterial({ flatShading: true, ...spec });
    this.materials.set(name, material);
    return material;
  }
  build() {
    const { map } = this;
    this.scene.background = new THREE.Color(map.sky);
    this.scene.fog = new THREE.Fog(map.fog, 130, 420);
    this.addLights();
    this.addGround();
    for (const piece of this.terrain.pieces) {
      const mesh = this.addPiece(piece);
      if (mesh) this.pieceMeshes.set(piece, mesh);
    }
    this.addSkyline();
  }
  addLights() {
    const hemi = new THREE.HemisphereLight(0xdff0ff, this.map.ground, 0.95);
    this.root.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0d6, 1.4);
    sun.position.set(90, 160, 60);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0008;
    const span = this.map.bounds + 40;
    Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 10, far: 420 });
    sun.shadow.camera.updateProjectionMatrix();
    this.root.add(sun);
    this.root.add(new THREE.AmbientLight(0xffffff, 0.42));
    // A tinted rim light from the far side keeps silhouettes readable in shadow.
    const rim = new THREE.DirectionalLight(new THREE.Color(this.map.accent), 0.65);
    rim.position.set(-110, 70, -90);
    this.root.add(rim);
  }
  addGround() {
    const size = this.map.bounds * 2 + 12;
    const geometry = new THREE.PlaneGeometry(size, size, 1, 1);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: this.map.ground, roughness: 0.96, flatShading: true }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    this.disposables.push(geometry, mesh.material);
    // driving grid so speed reads even on an empty floor
    const grid = new THREE.GridHelper(size, Math.round(size / 12), this.map.accent, 0x000000);
    grid.material.opacity = 0.12;
    grid.material.transparent = true;
    grid.position.y = 0.03;
    this.root.add(grid);
    this.disposables.push(grid.material);
  }
  addPiece(piece) {
    if (piece.t === 'decal') {
      const geometry = new THREE.PlaneGeometry(piece.w, piece.d);
      const material = new THREE.MeshBasicMaterial({ color: piece.color, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(piece.x, piece.y || 0.045, piece.z);
      this.root.add(mesh);
      this.disposables.push(geometry, material);
      return mesh;
    }
    if (piece.t === 'hazard') return this.addHazard(piece);
    if (piece.t === 'pillar') {
      const geometry = new THREE.CylinderGeometry(piece.r, piece.r * 1.12, piece.h, 8);
      const mesh = new THREE.Mesh(geometry, this.material(piece.mat));
      mesh.position.set(piece.x, piece.base + piece.h / 2, piece.z);
      mesh.castShadow = mesh.receiveShadow = true;
      this.root.add(mesh);
      this.disposables.push(geometry);
      return mesh;
    }
    if (piece.t === 'ramp') {
      const alongZ = piece.dir % 180 === 0;
      const geometry = createRampGeometry(alongZ ? piece.w : piece.d, alongZ ? piece.d : piece.w, piece.rise);
      const mesh = new THREE.Mesh(geometry, this.material(piece.mat));
      mesh.position.set(piece.x, piece.base, piece.z);
      mesh.rotation.y = (piece.dir * Math.PI) / 180;
      mesh.castShadow = mesh.receiveShadow = true;
      this.root.add(mesh);
      this.disposables.push(geometry);
      if (piece.launch) this.addLaunchMarkings(piece);
      return mesh;
    }
    const geometry = new THREE.BoxGeometry(piece.w, piece.h, piece.d);
    // Keep city façades readable against bright fog and exposure changes.
    const material = piece.destructible
      ? new THREE.MeshBasicMaterial({ color: (PALETTE[piece.mat] || PALETTE.city).color, fog: true })
      : this.material(piece.mat);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(piece.x, piece.base + piece.h / 2, piece.z);
    mesh.castShadow = mesh.receiveShadow = true;
    this.root.add(mesh);
    this.disposables.push(geometry);
    if (piece.destructible) {
      this.disposables.push(material);
      this.addBuildingDetail(mesh, piece);
    }
    if (piece.t === 'box' && piece.h > 6 && !piece.destructible) this.addEdgeTrim(piece);
    return mesh;
  }
  addBuildingDetail(mesh, piece) {
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color: 0x9fd9ff, transparent: true, opacity: 0.38, toneMapped: false })
    );
    mesh.add(edges);
    this.disposables.push(edges.geometry, edges.material);

    const capGeometry = new THREE.BoxGeometry(piece.w * 0.72, 0.45, piece.d * 0.72);
    const capMaterial = new THREE.MeshBasicMaterial({ color: 0x182533, toneMapped: false });
    const cap = new THREE.Mesh(capGeometry, capMaterial);
    cap.position.y = piece.h / 2 + 0.23;
    mesh.add(cap);
    this.disposables.push(capGeometry, capMaterial);
  }
  showPieceDamage(piece, fraction) {
    const mesh = this.pieceMeshes.get(piece);
    if (!mesh?.material) return;
    if (!mesh.material.userData.baseColor) mesh.material.userData.baseColor = mesh.material.color.clone();
    mesh.material.color.copy(mesh.material.userData.baseColor).lerp(new THREE.Color(0xa52b1d), (1 - fraction) * 0.58);
  }
  removePiece(piece) {
    const mesh = this.pieceMeshes.get(piece);
    if (!mesh) return false;
    this.pieceMeshes.delete(piece);
    this.root.remove(mesh);
    mesh.traverse(object => {
      object.geometry?.dispose?.();
      if (object.material && !this.materials.has(object.material)) {
        if (Array.isArray(object.material)) object.material.forEach(material => material.dispose?.());
        else object.material.dispose?.();
      }
    });
    return true;
  }
  // A bright lip around tall decks: falling off is a decision, not a surprise.
  addEdgeTrim(piece) {
    const top = piece.base + piece.h;
    const material = new THREE.MeshBasicMaterial({ color: this.map.accent, transparent: true, opacity: 0.55, toneMapped: false });
    this.materials.set(`trim-${piece.x}-${piece.z}-${top}`, material);
    const geometry = new THREE.BoxGeometry(piece.w + 0.3, 0.28, piece.d + 0.3);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(piece.x, top + 0.14, piece.z);
    this.root.add(mesh);
    this.disposables.push(geometry, material);
  }
  addLaunchMarkings(piece) {
    const alongZ = piece.dir % 180 === 0;
    const geometry = new THREE.PlaneGeometry(alongZ ? piece.w * 0.7 : 2.4, alongZ ? 2.4 : piece.d * 0.7);
    const material = new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.75, toneMapped: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(piece.x, piece.base + piece.rise + 0.4, piece.z);
    this.root.add(mesh);
    this.disposables.push(geometry, material);
  }
  addHazard(piece) {
    const geometry = new THREE.CircleGeometry(piece.r, 22);
    const material = new THREE.MeshBasicMaterial({ color: piece.color, transparent: true, opacity: 0.82, toneMapped: false });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(piece.x, 0.12, piece.z);
    this.root.add(mesh);
    const light = new THREE.PointLight(piece.color, 1.6, piece.r * 3.4, 2);
    light.position.set(piece.x, 3, piece.z);
    this.root.add(light);
    this.hazardMeshes.push({ mesh, light, base: 0.82 });
    this.disposables.push(geometry, material);
    return mesh;
  }
  // Distant scenery so the arena does not float in a void.
  addSkyline() {
    const B = this.map.bounds;
    const material = new THREE.MeshStandardMaterial({ color: this.map.fog, roughness: 1, flatShading: true });
    this.disposables.push(material);
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    this.disposables.push(geometry);
    const count = 44;
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (i % 3) * 0.11;
      const distance = B + 70 + (i % 5) * 26;
      const height = 40 + ((i * 37) % 90);
      dummy.position.set(Math.sin(angle) * distance, height / 2 - 6, Math.cos(angle) * distance);
      dummy.scale.set(22 + (i % 4) * 8, height, 22 + (i % 3) * 10);
      dummy.rotation.y = angle;
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.root.add(mesh);
  }
  update(dt, time) {
    // hazards pulse so they stay legible at speed
    for (const hazard of this.hazardMeshes) {
      const pulse = 0.72 + Math.sin(time * 3.1 + hazard.mesh.position.x * 0.1) * 0.16;
      hazard.mesh.material.opacity = pulse;
      hazard.light.intensity = 1.2 + pulse;
    }
  }
  surfaceHeight(x, z) { return this.terrain.groundAt(x, z); }
  dispose() {
    this.root.traverse(object => {
      object.geometry?.dispose?.();
      if (Array.isArray(object.material)) object.material.forEach(m => m.dispose?.());
      else if (object.material && !this.materials.has(object.material.name)) object.material.dispose?.();
    });
    for (const material of this.materials.values()) material.dispose?.();
    this.materials.clear();
    this.pieceMeshes.clear();
    this.scene.remove(this.root);
    this.scene.background = null;
    this.scene.fog = null;
  }
}

export const arenaWorldInternals = { PALETTE, rampHeightAt };
