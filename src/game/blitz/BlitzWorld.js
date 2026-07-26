// Turns a Crate Blitz tile lattice into meshes, and keeps them in step as
// obstacles crack open and sudden-death blocks drop in.

import * as THREE from 'three';
import { TILE, TILE_SIZE, OBSTACLES, isDestructible } from '../../data/blitzArenas.js';
import { createPillarMesh, createObstacleMesh, createSuddenMesh } from './BlitzModels.js';

const key = (col, row) => `${col},${row}`;

export class BlitzWorld {
  constructor(scene, arenaDef, grid) {
    this.scene = scene;
    this.arena = arenaDef;
    this.grid = grid;
    this.root = new THREE.Group();
    this.root.name = 'blitz-world';
    scene.add(this.root);
    this.tileMeshes = new Map();
    // Shared, world-owned materials: a lattice is hundreds of tiles and each
    // one must not carry its own material instance.
    this.materials = {
      pillar: new THREE.MeshStandardMaterial({ color: 0x6d737d, roughness: 0.7, metalness: 0.35, flatShading: true }),
      pillarCap: new THREE.MeshStandardMaterial({ color: arenaDef.accent, roughness: 0.5, metalness: 0.4, flatShading: true }),
      sudden: new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.5, metalness: 0.6, flatShading: true, emissive: 0x120a1e, emissiveIntensity: 0.5 }),
      floor: new THREE.MeshStandardMaterial({ color: arenaDef.floor, roughness: 0.95, flatShading: true }),
      hazard: new THREE.MeshBasicMaterial({ color: 0xff5a1f, transparent: true, opacity: 0.82, toneMapped: false }),
      conveyor: new THREE.MeshStandardMaterial({ color: 0x2a3550, roughness: 0.6, metalness: 0.4, flatShading: true, emissive: 0x1d2f5a, emissiveIntensity: 0.6 }),
      obstacle: {},
      obstacleTrim: {},
    };
    for (const spec of Object.values(OBSTACLES)) {
      this.materials.obstacle[spec.id] = new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.86, metalness: 0.06, flatShading: true });
      this.materials.obstacleTrim[spec.id] = new THREE.MeshStandardMaterial({ color: spec.trim, roughness: 0.72, metalness: 0.24, flatShading: true });
    }
    this.conveyorMeshes = [];
    this.hazardMeshes = [];
    this.build();
  }
  build() {
    const { grid, arena } = this;
    this.scene.background = new THREE.Color(arena.sky);
    this.scene.fog = new THREE.Fog(arena.fog, 90, 340);
    this.addLights();
    this.addFloor();
    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) this.syncTile(col, row);
    }
    this.addWalls();
  }
  addLights() {
    this.root.add(new THREE.HemisphereLight(0xdff0ff, this.arena.floor, 0.95));
    const sun = new THREE.DirectionalLight(0xfff0d6, 1.55);
    sun.position.set(50, 130, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const span = Math.max(this.grid.cols, this.grid.rows) * TILE_SIZE * 0.75;
    Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 10, far: 340 });
    sun.shadow.camera.updateProjectionMatrix();
    this.root.add(sun);
    this.root.add(new THREE.AmbientLight(0xffffff, 0.36));
    const rim = new THREE.DirectionalLight(new THREE.Color(this.arena.accent), 0.55);
    rim.position.set(-70, 50, -60);
    this.root.add(rim);
  }
  addFloor() {
    const w = this.grid.cols * TILE_SIZE, d = this.grid.rows * TILE_SIZE;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), this.materials.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.root.add(floor);
    // One grid line per tile: the whole mode is about reading tiles, so the
    // tiles are drawn.
    const helper = new THREE.GridHelper(Math.max(w, d), Math.max(this.grid.cols, this.grid.rows), this.arena.accent, 0x000000);
    helper.material.transparent = true;
    helper.material.opacity = 0.2;
    helper.position.y = 0.04;
    this.root.add(helper);
    this.gridHelper = helper;
  }
  // A ring of tall blocks around the lattice so the arena reads as enclosed.
  addWalls() {
    const w = this.grid.cols * TILE_SIZE, d = this.grid.rows * TILE_SIZE, t = TILE_SIZE;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0x3b414d, roughness: 0.8, flatShading: true });
    this.wallGeometry = geometry;
    this.wallMaterial = material;
    for (const [x, z, sx, sz] of [[0, -(d + t) / 2, w + t * 2, t], [0, (d + t) / 2, w + t * 2, t], [-(w + t) / 2, 0, t, d + t * 2], [(w + t) / 2, 0, t, d + t * 2]]) {
      const wall = new THREE.Mesh(geometry, material);
      wall.scale.set(sx, 11, sz);
      wall.position.set(x, 5.5, z);
      wall.castShadow = wall.receiveShadow = true;
      this.root.add(wall);
    }
  }
  // Rebuilds the mesh for one cell to match the current tile value.
  syncTile(col, row) {
    const k = key(col, row);
    const existing = this.tileMeshes.get(k);
    if (existing) {
      this.root.remove(existing);
      this.tileMeshes.delete(k);
      this.conveyorMeshes = this.conveyorMeshes.filter(item => item !== existing);
      this.hazardMeshes = this.hazardMeshes.filter(item => item.mesh !== existing);
      // Geometry is per-mesh; materials belong to the world and are freed once
      // in dispose(), so only the geometry goes here.
      existing.traverse(object => object.geometry?.dispose?.());
    }
    const tile = this.grid.tileAt(col, row);
    const point = this.grid.centerOf(col, row);
    let mesh = null;
    if (tile === TILE.PILLAR) {
      mesh = createPillarMesh(this.materials);
      mesh.position.set(point.x, 0, point.z);
    } else if (isDestructible(tile)) {
      mesh = createObstacleMesh(tile, this.materials);
      mesh.position.set(point.x, 0, point.z);
      // A touch of per-tile rotation so a wall of stock does not look extruded.
      mesh.rotation.y = ((col * 7 + row * 13) % 4) * (Math.PI / 2);
    } else if (tile === TILE.SUDDEN) {
      mesh = createSuddenMesh(this.materials);
      mesh.position.set(point.x, 4.25, point.z);
      mesh.userData.dropFrom = 40;
    } else if (tile === TILE.HAZARD) {
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE), this.materials.hazard);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(point.x, 0.1, point.z);
      const light = new THREE.PointLight(0xff5a1f, 1.4, TILE_SIZE * 3, 2);
      light.position.set(0, 3, 0);
      mesh.add(light);
      this.hazardMeshes.push({ mesh, light });
    } else if (tile === TILE.CONVEYOR) {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(TILE_SIZE * 0.96, 0.3, TILE_SIZE * 0.96), this.materials.conveyor);
      mesh.position.set(point.x, 0.14, point.z);
      this.conveyorMeshes.push(mesh);
    }
    if (!mesh) return null;
    this.root.add(mesh);
    this.tileMeshes.set(k, mesh);
    return mesh;
  }
  // A brick block that survived a blast: darken and drop the top course so the
  // damage is legible without rebuilding the mesh.
  showObstacleDamage(col, row, fraction) {
    const mesh = this.tileMeshes.get(key(col, row));
    const courses = mesh?.userData?.courses;
    if (!courses?.length) return;
    const lost = Math.round(courses.length * (1 - fraction));
    courses.forEach((course, index) => { course.visible = index < courses.length - lost; });
  }
  update(dt, time) {
    // sudden-death blocks slam down rather than popping into place
    for (const mesh of this.tileMeshes.values()) {
      if (!mesh.userData?.dropFrom) continue;
      mesh.userData.dropFrom = Math.max(0, mesh.userData.dropFrom - dt * 120);
      mesh.position.y = 4.25 + mesh.userData.dropFrom;
      if (mesh.userData.dropFrom === 0) delete mesh.userData.dropFrom;
    }
    for (const mesh of this.conveyorMeshes) {
      mesh.material.emissiveIntensity = 0.45 + Math.abs(Math.sin(time * 4 + mesh.position.x * 0.1)) * 0.5;
    }
    for (const hazard of this.hazardMeshes) {
      const pulse = 0.7 + Math.sin(time * 3.4 + hazard.mesh.position.x * 0.12) * 0.16;
      hazard.mesh.material.opacity = pulse;
      hazard.light.intensity = 1.1 + pulse;
    }
  }
  dispose() {
    for (const mesh of this.tileMeshes.values()) this.root.remove(mesh);
    this.tileMeshes.clear();
    this.root.traverse(object => { object.geometry?.dispose?.(); });
    for (const material of Object.values(this.materials)) {
      if (material?.dispose) material.dispose();
      else if (material) for (const item of Object.values(material)) item?.dispose?.();
    }
    this.wallGeometry?.dispose?.();
    this.wallMaterial?.dispose?.();
    this.gridHelper?.material?.dispose?.();
    this.scene.remove(this.root);
    this.scene.background = null;
    this.scene.fog = null;
  }
}

