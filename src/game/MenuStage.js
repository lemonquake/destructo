import * as THREE from 'three';
import { WEAPONS } from '../data/gameData.js';

// ── Menu diorama choreography (pure logic, unit-testable) ────────────────────
// The vignette loops nothing: it plays once into an endless punchline.
//   JOG    — three Destructos jog a lazy lap around the shooter.
//   AMBUSH — the center Destructo shoulders an assault rifle and opens up.
//   PANIC  — the joggers throw their hands in the air and sprint the circle
//            for their lives, forever, while the gunner keeps missing.
export const MENU_PHASES = Object.freeze({ JOG: 'jog', AMBUSH: 'ambush', PANIC: 'panic' });

export class MenuChoreography {
  constructor({ jogSeconds = 6, ambushSeconds = 1.6, panicRampSeconds = 1.2 } = {}) {
    this.jogSeconds = jogSeconds;
    this.ambushSeconds = ambushSeconds;
    this.panicRampSeconds = panicRampSeconds;
  }
  phaseAt(t) {
    if (t < this.jogSeconds) return MENU_PHASES.JOG;
    if (t < this.jogSeconds + this.ambushSeconds) return MENU_PHASES.AMBUSH;
    return MENU_PHASES.PANIC;
  }
  // orbit speed in rad/s: a lazy jog that breaks into a flat sprint
  runnerSpeed(t) {
    const jog = .62, sprint = 1.9;
    const phase = this.phaseAt(t);
    if (phase === MENU_PHASES.JOG) return jog;
    if (phase === MENU_PHASES.AMBUSH) return jog + (sprint - jog) * .25;
    const ramp = Math.min(1, (t - this.jogSeconds - this.ambushSeconds) / this.panicRampSeconds);
    return jog + (sprint - jog) * (.25 + .75 * ramp);
  }
  // 0..1 — how far the arms are thrown up; full panic only after the ramp
  handsUp(t) {
    if (this.phaseAt(t) !== MENU_PHASES.PANIC) return 0;
    return Math.min(1, (t - this.jogSeconds - this.ambushSeconds) / this.panicRampSeconds);
  }
  // rifle raised from the moment the ambush starts, and never lowered again
  rifleRaised(t) { return t >= this.jogSeconds; }
  // full-auto starts a beat into the ambush so the raise reads first
  firing(t) { return t >= this.jogSeconds + Math.min(.45, this.ambushSeconds * .4); }
}

// ── Visual stage ──────────────────────────────────────────────────────────────
// Everything renders into its own scene with its own materials; Game swaps
// `game.scene` to this while menus are up. Strictly silent: no AudioSystem.
const RUNNER_TEAMS = [
  { id: 'm-blue', color: 0x2fb4ff, dark: 0x11638f, skin: 'digital' },
  { id: 'm-red', color: 0xff5062, dark: 0x8e2634, skin: 'stripes' },
  { id: 'm-green', color: 0x59e065, dark: 0x1f7a2e, skin: 'camo' },
  { id: 'm-yellow', color: 0xffd23f, dark: 0x9c7a10, skin: 'urban' },
];
const RING_RADIUS = 7.2;
const RIFLE_RATE = .095; // full-auto cadence in seconds per tracer

function skyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 4; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, '#2b6fce'); sky.addColorStop(.42, '#59a8e8'); sky.addColorStop(.72, '#9fd7f2'); sky.addColorStop(1, '#ffd88a');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

export class MenuStage {
  constructor(scene, materials, factory, choreography = new MenuChoreography()) {
    this.scene = scene; this.materials = materials; this.factory = factory;
    this.choreo = choreography;
    this.elapsed = 0;
    this.fireTimer = 0;
    this.targetIndex = 0;
    this.tracers = [];
    this.puffs = [];
    this.owned = []; // geometries/materials created here, disposed on teardown
    this.build();
  }
  own(...resources) { this.owned.push(...resources); return resources[0]; }
  basic(options) { return this.own(new THREE.MeshBasicMaterial(options)); }

  build() {
    const scene = this.scene;
    scene.background = this.own(skyTexture());
    scene.fog = new THREE.Fog(0xa8d4ee, 55, 150);

    scene.add(new THREE.HemisphereLight(0xdff2ff, 0x4a6a3c, 1.05));
    const sun = new THREE.DirectionalLight(0xfff3d2, 1.75);
    sun.position.set(-26, 42, -18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -26;
    sun.shadow.camera.right = sun.shadow.camera.top = 26;
    sun.shadow.camera.far = 120;
    sun.shadow.bias = -.0008;
    scene.add(sun);

    // grassy island with a worn dirt ring where the lap happens
    const ground = new THREE.Mesh(this.own(new THREE.CircleGeometry(46, 48)), this.materials.grass);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const track = new THREE.Mesh(this.own(new THREE.RingGeometry(RING_RADIUS - 1.5, RING_RADIUS + 1.5, 64)), this.materials.dirt);
    track.rotation.x = -Math.PI / 2; track.position.y = .02; scene.add(track);

    // scattered supply crates + a leaning signpost sell the "backlot" feel
    for (const [type, x, z, spin] of [['brown', -11.5, 4.5, .4], ['yellow', 12.5, -3, -.3], ['brown', 10.8, 6.4, .9], ['blue', -9.6, -8.2, .15]]) {
      const crate = this.factory.createCrate(new THREE.Vector3(x, 0, z), type);
      crate.group.rotation.y = spin;
    }
    for (const [x, z, s] of [[-16, -13, 1.4], [17, 11, 1.1], [-14, 12, .9]]) {
      const rock = new THREE.Mesh(this.own(new THREE.DodecahedronGeometry(s, 0)), this.materials.stone);
      rock.position.set(x, s * .45, z); rock.castShadow = rock.receiveShadow = true; scene.add(rock);
    }

    // cast: three joggers on the ring, one trigger-happy gunner in the middle
    this.factory.setTeams(Object.fromEntries(RUNNER_TEAMS.map(t => [t.id, t])));
    this.runners = RUNNER_TEAMS.slice(0, 3).map((team, i) => {
      const angle = i / 3 * Math.PI * 2;
      const unit = this.factory.createUnit('scout', team.id, new THREE.Vector3(Math.sin(angle) * RING_RADIUS, 0, Math.cos(angle) * RING_RADIUS), false, { skin: team.skin });
      unit.weaponGroup.visible = false; // joggers are unarmed — that's the joke
      unit.angle = angle;
      unit.groundY = 0;
      return unit;
    });
    const gunnerTeam = RUNNER_TEAMS[3];
    this.shooter = this.factory.createUnit('commando', gunnerTeam.id, new THREE.Vector3(0, 0, 0), false, { skin: gunnerTeam.skin });
    this.factory.setWeaponModel(this.shooter, 'rifle', WEAPONS.rifle);
    this.shooter.groundY = 0;

    // muzzle flash: additive sprite + point light, flicked on per shot
    this.muzzleLight = new THREE.PointLight(0xffd76a, 0, 7);
    this.scene.add(this.muzzleLight);
    const flashMat = this.own(new THREE.SpriteMaterial({ color: 0xffe9a3, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.muzzleFlash = new THREE.Sprite(flashMat);
    this.muzzleFlash.scale.set(1.3, 1.3, 1);
    this.scene.add(this.muzzleFlash);

    this.tracerGeo = this.own(new THREE.BoxGeometry(.055, .055, 1.6));
    this.tracerMat = this.basic({ color: 0xffe27a, transparent: true, opacity: .95, depthWrite: false, blending: THREE.AdditiveBlending });
    this.puffGeo = this.own(new THREE.SphereGeometry(.28, 6, 5));
    this.puffMat = this.basic({ color: 0xd8c9a8, transparent: true, opacity: .8, depthWrite: false });
  }

  spawnTracer(origin, direction) {
    const tracer = new THREE.Mesh(this.tracerGeo, this.tracerMat.clone());
    tracer.position.copy(origin);
    tracer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
    this.owned.push(tracer.material);
    this.scene.add(tracer);
    this.tracers.push({ mesh: tracer, direction: direction.clone(), life: .5 });
  }
  spawnPuff(position) {
    const puff = new THREE.Mesh(this.puffGeo, this.puffMat.clone());
    puff.position.copy(position);
    this.owned.push(puff.material);
    this.scene.add(puff);
    this.puffs.push({ mesh: puff, life: .45 });
  }

  update(dt, time, camera) {
    dt = Math.min(dt, .05);
    this.elapsed += dt;
    const t = this.elapsed, choreo = this.choreo;
    const speed = choreo.runnerSpeed(t), handsUp = choreo.handsUp(t);

    // ── joggers orbit the gunner; stagger keeps them from bunching up
    for (let i = 0; i < this.runners.length; i++) {
      const runner = this.runners[i];
      runner.angle += speed * dt * (1 + Math.sin(t * 1.7 + i * 2.4) * .06);
      const x = Math.sin(runner.angle) * RING_RADIUS, z = Math.cos(runner.angle) * RING_RADIUS;
      // aim velocity along the tangent so animateUnit swings the legs
      runner.velocity.set(x - runner.group.position.x, 0, z - runner.group.position.z).multiplyScalar(1 / Math.max(dt, 1e-4));
      runner.group.position.set(x, 0, z);
      runner.group.rotation.y = runner.angle + Math.PI / 2; // face the tangent
      this.factory.animateUnit(runner, time, dt);
      runner.weaponGroup.visible = false; // animateUnit re-shows it; joggers stay unarmed
      if (handsUp > 0) {
        // arms thrown to the sky, flailing in alternate directions — the
        // classic cartoon "running for your life" silhouette
        const wave = Math.sin(time * 13 + i * 2.1) * .26 * handsUp;
        runner.leftHand.position.set(-.58 + wave * .4, 1.24 + 1.5 * handsUp + wave, .1);
        runner.rightHand.position.set(.58 - wave * .4, 1.24 + 1.5 * handsUp - wave, .1);
        runner.head.rotation.z = Math.sin(time * 9 + i * 1.3) * .12 * handsUp; // panicked head wobble
        runner.body.rotation.x = .14 * handsUp; // lean into the sprint
      }
    }

    // ── the gunner tracks the pack, always a beat behind (nobody gets hit)
    const target = this.runners[this.targetIndex % this.runners.length];
    const lagAngle = target.angle - .55; // aims where the runner just was
    const aimPoint = new THREE.Vector3(Math.sin(lagAngle) * RING_RADIUS, 1.35, Math.cos(lagAngle) * RING_RADIUS);
    const shooter = this.shooter;
    const desiredYaw = Math.atan2(aimPoint.x - shooter.group.position.x, aimPoint.z - shooter.group.position.z);
    let yawDelta = desiredYaw - shooter.group.rotation.y;
    yawDelta = Math.atan2(Math.sin(yawDelta), Math.cos(yawDelta));
    shooter.group.rotation.y += yawDelta * Math.min(1, dt * 4.5);
    shooter.velocity.set(0, 0, 0);
    this.factory.animateUnit(shooter, time, dt);
    if (choreo.rifleRaised(t)) {
      // two-handed shoulder mount over whatever pose animateUnit reset to
      shooter.weaponGroup.position.set(.34, 1.5, .55);
      shooter.weaponGroup.rotation.set(-.06, 0, 0);
      shooter.leftHand.position.set(-.18, 1.48, 1.05);
      shooter.rightHand.position.set(.44, 1.42, .5);
      shooter.head.rotation.x = .08;
    }

    if (choreo.firing(t)) {
      this.fireTimer -= dt;
      if (this.fireTimer <= 0) {
        this.fireTimer = RIFLE_RATE * (0.85 + Math.random() * .4);
        // occasionally swing to chase a different runner
        if (Math.random() < .06) this.targetIndex++;
        shooter.recoil = .8; // reuse the factory's kickback animation
        const muzzle = new THREE.Vector3(.34, 1.55, 1.45).applyAxisAngle(new THREE.Vector3(0, 1, 0), shooter.group.rotation.y).add(shooter.group.position);
        const spread = () => (Math.random() - .5) * .12;
        const dir = aimPoint.clone().sub(muzzle).normalize().add(new THREE.Vector3(spread(), spread() * .5, spread())).normalize();
        this.spawnTracer(muzzle, dir);
        this.muzzleLight.position.copy(muzzle);
        this.muzzleLight.intensity = 6;
        this.muzzleFlash.position.copy(muzzle);
        this.muzzleFlash.material.opacity = .95;
        this.muzzleFlash.material.rotation = Math.random() * Math.PI;
      }
    }
    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 60);
    this.muzzleFlash.material.opacity = Math.max(0, this.muzzleFlash.material.opacity - dt * 12);

    // ── tracers streak out; the ones that reach the ring kick up dirt
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tracer = this.tracers[i];
      tracer.life -= dt;
      tracer.mesh.position.addScaledVector(tracer.direction, dt * 52);
      tracer.mesh.material.opacity = Math.max(0, tracer.life * 2);
      const distSq = tracer.mesh.position.x ** 2 + tracer.mesh.position.z ** 2;
      if (tracer.life <= 0 || distSq > (RING_RADIUS + 2.5) ** 2) {
        if (distSq > (RING_RADIUS - 1) ** 2) this.spawnPuff(new THREE.Vector3(tracer.mesh.position.x, .3, tracer.mesh.position.z));
        this.scene.remove(tracer.mesh);
        tracer.mesh.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const puff = this.puffs[i];
      puff.life -= dt;
      puff.mesh.scale.addScalar(dt * 3.2);
      puff.mesh.material.opacity = Math.max(0, puff.life * 1.8);
      if (puff.life <= 0) { this.scene.remove(puff.mesh); puff.mesh.material.dispose(); this.puffs.splice(i, 1); }
    }

    // ── slow cinematic orbit; the post-lookAt yaw keeps the stage framed
    //    right-of-center regardless of orbit angle, clear of the menu column
    if (camera) {
      const orbit = t * .085;
      camera.position.set(Math.sin(orbit) * 24, 11.5 + Math.sin(t * .3) * .7, Math.cos(orbit) * 24);
      camera.lookAt(0, 1.7, 0);
      camera.rotateY(.24);
    }
  }

  dispose() {
    this.scene.traverse(o => {
      if (o.geometry) o.geometry.dispose?.();
      if (o.material && !Array.isArray(o.material)) o.material.dispose?.();
    });
    for (const resource of this.owned) resource.dispose?.();
    this.owned.length = 0;
    this.tracers.length = 0;
    this.puffs.length = 0;
    this.scene.background = null;
    this.scene.clear();
  }
}
