import { describe, expect, it } from 'vitest';
import { JUMP_RULES, stepJumpState } from '../src/game/JumpSystem.js';

const grounded={motion:'grounded',verticalVelocity:0,jetpackBurn:0,mp:100};

describe('non-abusable jump state',()=>{
  it('launches only on a grounded press and never retriggers from a held key',()=>{
    const first=stepJumpState(grounded,{grounded:true,jumpPressed:true,jumpHeld:true,hasJetpack:false,blocked:false},.016);expect(first.jumped).toBe(true);expect(first.motion).toBe('airborne');
    const held=stepJumpState(first,{grounded:false,jumpPressed:false,jumpHeld:true,hasJetpack:false,blocked:false},.016);expect(held.jumped).toBe(false);expect(held.verticalVelocity).toBeLessThan(first.verticalVelocity);
  });
  it('does not accept a press merely because an airborne unit is close to a surface',()=>{
    const state={...grounded,motion:'airborne',verticalVelocity:-2};const next=stepJumpState(state,{grounded:false,jumpPressed:true,jumpHeld:true,hasJetpack:false,blocked:false},.016);expect(next.jumped).toBe(false);expect(next.verticalVelocity).toBeLessThan(-2);
  });
  it('lands with zero vertical velocity instead of an automatic crate rebound',()=>{
    const next=stepJumpState({...grounded,motion:'airborne',verticalVelocity:-8,jetpackBurn:.7},{grounded:true,jumpPressed:false,jumpHeld:false,hasJetpack:false,blocked:false},.016);expect(next.motion).toBe('grounded');expect(next.verticalVelocity).toBe(0);expect(next.jetpackBurn).toBe(0);
  });
  it('caps jetpack burn, drains mana, and blocks thrust while carrying heavy cargo',()=>{
    let state={...grounded,motion:'airborne',verticalVelocity:0};for(let i=0;i<120;i++)state=stepJumpState(state,{grounded:false,jumpPressed:false,jumpHeld:true,hasJetpack:true,blocked:false},1/60);expect(state.jetpackBurn).toBeCloseTo(JUMP_RULES.jetpackBurnSeconds,5);expect(state.mp).toBeCloseTo(100-JUMP_RULES.jetpackManaPerSecond*JUMP_RULES.jetpackBurnSeconds,3);expect(state.jetpackActive).toBe(false);
    const heavy=stepJumpState({...grounded,motion:'airborne',verticalVelocity:0},{grounded:false,jumpPressed:false,jumpHeld:true,hasJetpack:true,blocked:true},.1);expect(heavy.jetpackActive).toBe(false);expect(heavy.mp).toBe(100);
  });
});
