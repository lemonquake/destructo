export class PerformanceGovernor {
  constructor(renderer, options = {}) {
    this.renderer = renderer;
    this.maxPixelRatio = options.maxPixelRatio ?? Math.min(globalThis.devicePixelRatio || 1, 1.35);
    this.minPixelRatio = options.minPixelRatio ?? .75;
    this.pixelRatio = this.maxPixelRatio;
    this.quality = 1;
    this.samples = new Float32Array(240);
    this.sampleCount = 0;
    this.sampleCursor = 0;
    this.lowSeconds = 0;
    this.recoverySeconds = 0;
    this.evaluateTimer = 0;
    this.overlayTimer = 0;
    this.warmupRemaining = 2;
    this.effects = null;
    this.shadowPreference=Boolean(renderer.shadowMap?.enabled);
    this.lastDiagnostics = null;
    const query = options.query ?? globalThis.location?.search ?? '';
    if (new URLSearchParams(query).get('perf') === '1' && globalThis.document?.body) this.createOverlay();
  }

  setEffects(effects) { this.effects = effects; this.applyQuality(); }
  setShadowPreference(enabled){this.shadowPreference=Boolean(enabled);this.applyQuality()}
  beginSession() { this.sampleCount=0;this.sampleCursor=0;this.lowSeconds=0;this.recoverySeconds=0;this.evaluateTimer=0;this.warmupRemaining=2; }

  createOverlay() {
    this.overlay = document.createElement('aside');
    this.overlay.id = 'performance-overlay';
    this.overlay.setAttribute('aria-label', 'Performance diagnostics');
    Object.assign(this.overlay.style, { position:'fixed', right:'12px', bottom:'12px', zIndex:'9999', minWidth:'184px', padding:'9px 11px', whiteSpace:'pre', pointerEvents:'none', color:'#9fffc2', background:'rgba(5,10,18,.88)', border:'1px solid #45c77c', borderRadius:'6px', font:'700 11px/1.45 monospace' });
    document.body.appendChild(this.overlay);
    this.overlay.textContent='PERF WARMING UP';
  }

  averageFrameTime() {
    if (!this.sampleCount) return 1 / 60;
    let total = 0;
    for (let i = 0; i < this.sampleCount; i++) total += this.samples[i];
    return total / this.sampleCount;
  }

  update(dt, diagnostics = null) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt=Math.min(dt,.05);
    this.samples[this.sampleCursor] = dt;
    this.sampleCursor = (this.sampleCursor + 1) % this.samples.length;
    this.sampleCount = Math.min(this.sampleCount + 1, this.samples.length);
    this.lastDiagnostics = diagnostics;
    if(this.warmupRemaining>0){this.warmupRemaining=Math.max(0,this.warmupRemaining-dt);if(this.overlay&&this.overlayTimer>=.25){this.overlayTimer=0;this.overlay.textContent=`PERF WARMING UP ${this.warmupRemaining.toFixed(1)}s`;}return}
    this.evaluateTimer += dt;
    this.overlayTimer += dt;
    if (this.evaluateTimer >= .5) {
      const elapsed = this.evaluateTimer;
      this.evaluateTimer = 0;
      const fps = 1 / this.averageFrameTime();
      if (fps < 58) { this.lowSeconds += elapsed; this.recoverySeconds = 0; }
      else if (fps >= 62) { this.recoverySeconds += elapsed; this.lowSeconds = 0; }
      else { this.lowSeconds = Math.max(0, this.lowSeconds - elapsed); this.recoverySeconds = 0; }
      if (this.lowSeconds >= 2 && this.pixelRatio > this.minPixelRatio) {
        this.setPixelRatio(this.pixelRatio - .1);
        this.lowSeconds = 0;
      } else if (this.recoverySeconds >= 8 && this.pixelRatio < this.maxPixelRatio) {
        this.setPixelRatio(this.pixelRatio + .05);
        this.recoverySeconds = 0;
      }
    }
    if (this.overlay && this.overlayTimer >= .25) { this.overlayTimer = 0; this.updateOverlay(); }
  }

  setPixelRatio(value) {
    const next = Math.max(this.minPixelRatio, Math.min(this.maxPixelRatio, Math.round(value * 20) / 20));
    if (next === this.pixelRatio) return;
    this.pixelRatio = next;
    this.quality = Math.max(.35, Math.min(1, (next - this.minPixelRatio) / Math.max(.01, this.maxPixelRatio - this.minPixelRatio)));
    this.renderer.setPixelRatio(next);
    this.applyQuality();
  }

  applyQuality() { this.effects?.setQuality?.(this.quality);if(this.renderer.shadowMap){const enabled=this.shadowPreference&&this.quality>=.45;if(this.renderer.shadowMap.enabled!==enabled){this.renderer.shadowMap.enabled=enabled;if(enabled)this.renderer.shadowMap.needsUpdate=true}} }

  updateOverlay() {
    const fps = 1 / this.averageFrameTime();
    const d = this.lastDiagnostics || {};
    const info = this.renderer.info?.render || {};
    this.overlay.textContent = `FPS ${fps.toFixed(1)}  FRAME ${(1000 / Math.max(1, fps)).toFixed(1)}ms\nCPU ${(d.updateMs||0).toFixed(1)}ms  RENDER ${(d.renderMs||0).toFixed(1)}ms\nAI ${(d.aiMs||0).toFixed(1)}ms  SYSTEMS ${(d.systemsMs||0).toFixed(1)}ms\nDRAWS ${info.calls || 0}  TRI ${info.triangles || 0}\nSHOTS ${d.active || 0}/2048  DENIED ${d.denied || 0}\nEFFECTS ${d.effects || 0}  POOL ${d.poolUsage || 0}%\nPIXEL ${this.pixelRatio.toFixed(2)}  FX ${Math.round(this.quality * 100)}%`;
  }
}
