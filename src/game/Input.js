import nipplejs from 'nipplejs';

export class Input {
  constructor(domElement) {
    this.domElement = domElement;
    this.keys = new Set(); this.pressed = new Set(); this.mouse = { x: innerWidth / 2, y: innerHeight / 2, down: false, alt: false, right: false, rightStart: 0, rightPressed: false, dx: 0, dy: 0, wheelDelta: 0 };
    this.moveAxis = { x: 0, y: 0 }; this.aimAxis = { x: 0, y: 0 };
    this.enabled = false; this.mobile = matchMedia('(pointer: coarse)').matches;
    this.bind();
  }
  bind() {
    addEventListener('keydown', e => {
      if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
      if (this.enabled && ['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', e => {
      if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
      this.keys.delete(e.code);
    });
    addEventListener('blur', () => { this.keys.clear(); this.mouse.down = false; this.mouse.right = false; });
    this.domElement.addEventListener('pointermove', e => {
      if (this.mouse.down || this.mouse.right || document.pointerLockElement) {
        this.mouse.dx += e.movementX;
        this.mouse.dy += e.movementY;
      }
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
    });
    this.domElement.addEventListener('pointerdown', e => {
      if (!this.enabled) return;
      if (e.button === 0) this.mouse.down = true;
      if (e.button === 2) { this.mouse.right = true; this.mouse.rightStart = performance.now(); this.mouse.rightPressed = true; }
    });
    addEventListener('pointerup', e => {
      if (e.button === 0) this.mouse.down = false;
      if (e.button === 2) {
        // quick tap = squad command; long press is consumed live by the lock-aim logic
        if (this.mouse.right && performance.now() - this.mouse.rightStart < 300) this.mouse.alt = true;
        this.mouse.right = false;
      }
    });
    addEventListener('wheel', e => {
      this.mouse.wheelDelta = e.deltaY;
    }, { passive: true });
    this.domElement.addEventListener('contextmenu', e => e.preventDefault());
    if (this.mobile) this.setupMobile();
  }
  rightHeldFor() { return this.mouse.right ? (performance.now() - this.mouse.rightStart) / 1000 : 0; }
  setupMobile() {
    const root = document.querySelector('#mobile-controls'); root.classList.remove('hidden');
    const common = { mode: 'static', size: 110, color: 'white', fadeTime: 0 };
    const move = nipplejs.create({ ...common, zone: document.querySelector('#move-stick'), position: { left: '75px', bottom: '80px' } });
    const aim = nipplejs.create({ ...common, zone: document.querySelector('#aim-stick'), position: { right: '75px', bottom: '80px' } });
    move.on('move', (_, d) => { this.moveAxis.x = d.vector.x; this.moveAxis.y = d.vector.y; }).on('end', () => this.moveAxis = { x: 0, y: 0 });
    aim.on('move', (_, d) => { this.aimAxis.x = d.vector.x; this.aimAxis.y = d.vector.y; this.mouse.down = d.distance > 34; }).on('end', () => { this.aimAxis = { x: 0, y: 0 }; this.mouse.down = false; });
  }
  axis() {
    const x = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0) + this.moveAxis.x;
    const z = (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0) - (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) - this.moveAxis.y;
    const length = Math.hypot(x, z) || 1; return { x: x / Math.max(1, length), z: z / Math.max(1, length) };
  }
  consume(code) { const hit = this.pressed.has(code); this.pressed.delete(code); return hit; }
  endFrame() { this.pressed.clear(); this.mouse.rightPressed = false; this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheelDelta = 0; }
}
