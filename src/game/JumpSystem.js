export const JUMP_RULES = Object.freeze({
  gravity: 22,
  jumpVelocity: 12.9,
  jetpackBurnSeconds: 1.25,
  jetpackManaPerSecond: 22,
  jetpackThrust: 32,
  jetpackLiftCap: 7,
  doubleJumpVelocity: 15.6,
});

export function stepJumpState(state,input,dt,rules=JUMP_RULES){
  const next={...state,jetpackActive:false,jumped:false,secondJumped:false,doubleJumped:Boolean(state.doubleJumped)};
  if(input.grounded){next.motion='grounded';next.verticalVelocity=0;next.jetpackBurn=0;next.doubleJumped=false}
  else if(next.motion==='grounded')next.motion='airborne';
  if(input.jumpPressed&&input.grounded&&!input.blocked){next.motion='airborne';next.verticalVelocity=rules.jumpVelocity*(input.jumpScale||1);next.jumped=true}
  else if(input.jumpPressed&&next.motion==='airborne'&&input.hasDoubleJump&&!next.doubleJumped&&!input.blocked){next.verticalVelocity=rules.doubleJumpVelocity*(input.jumpScale||1);next.doubleJumped=true;next.jumped=true;next.secondJumped=true}
  if(next.motion==='airborne'&&input.jumpHeld&&input.hasJetpack&&!input.blocked&&(next.jetpackBurn||0)<rules.jetpackBurnSeconds&&(next.mp||0)>0&&next.verticalVelocity<rules.jetpackLiftCap){
    next.verticalVelocity=Math.min(rules.jetpackLiftCap,next.verticalVelocity+rules.jetpackThrust*dt);
    next.jetpackBurn=Math.min(rules.jetpackBurnSeconds,(next.jetpackBurn||0)+dt);
    next.mp=Math.max(0,next.mp-rules.jetpackManaPerSecond*dt);
    next.jetpackActive=true;
  }
  if(next.motion==='airborne')next.verticalVelocity-=rules.gravity*dt;
  return next;
}
