export class QuestSystem {
  constructor(definition = null, callbacks = {}) { this.callbacks = callbacks;this.start(definition); }
  start(definition) { this.definition=definition;this.index=0;this.events=new Map();this.complete=false;this.failed=false;this.failureReason='';if(definition)this.callbacks.onStepChanged?.(this.currentStep(),null);return this; }
  currentStep() { return this.definition?.steps?.[this.index] || null; }
  notify(type,payload={}) { if(this.complete||this.failed)return;this.events.set(type,payload);this.callbacks.onEvent?.(type,payload,this.currentStep()); }
  event(type) { return this.events.get(type); }
  progress(value,goal=this.currentStep()?.goal||1) { const normalized=Math.max(0,Math.min(1,goal?value/goal:0));this.callbacks.onProgress?.(value,goal,normalized,this.currentStep());return normalized; }
  advance(meta={}) { if(this.complete||this.failed)return false;const previous=this.currentStep();this.index++;if(!this.currentStep()){this.complete=true;this.callbacks.onComplete?.(meta)}else this.callbacks.onStepChanged?.(this.currentStep(),previous,meta);return true; }
  fail(reason='MISSION FAILED') { if(this.complete||this.failed)return false;this.failed=true;this.failureReason=reason;this.callbacks.onFail?.(reason);return true; }
  update(dt,context) { if(!this.complete&&!this.failed)this.callbacks.onUpdate?.(dt,context,this); }
}
