import { describe, expect, it } from 'vitest';
import { MenuChoreography, MENU_PHASES } from '../src/game/MenuStage.js';

describe('main menu diorama choreography', () => {
  const choreo = new MenuChoreography({ jogSeconds: 6, ambushSeconds: 1.6, panicRampSeconds: 1.2 });

  it('plays jog, then ambush, then endless panic', () => {
    expect(choreo.phaseAt(0)).toBe(MENU_PHASES.JOG);
    expect(choreo.phaseAt(5.99)).toBe(MENU_PHASES.JOG);
    expect(choreo.phaseAt(6.5)).toBe(MENU_PHASES.AMBUSH);
    expect(choreo.phaseAt(7.6)).toBe(MENU_PHASES.PANIC);
    expect(choreo.phaseAt(9999)).toBe(MENU_PHASES.PANIC); // it never ends for them
  });

  it('keeps the joggers casual until the shooting starts', () => {
    const jog = choreo.runnerSpeed(1);
    expect(choreo.runnerSpeed(3)).toBe(jog);
    expect(choreo.runnerSpeed(6.5)).toBeGreaterThan(jog);
    // panic sprint tops out and holds forever
    expect(choreo.runnerSpeed(30)).toBeCloseTo(choreo.runnerSpeed(300));
    expect(choreo.runnerSpeed(30)).toBeGreaterThan(choreo.runnerSpeed(6.5));
  });

  it('raises hands only in panic, ramping to fully thrown up', () => {
    expect(choreo.handsUp(3)).toBe(0);
    expect(choreo.handsUp(6.7)).toBe(0); // ambush: still processing what is happening
    const early = choreo.handsUp(7.9);
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(1);
    expect(choreo.handsUp(20)).toBe(1);
  });

  it('shoulders the rifle at the ambush and never stops firing after the first burst', () => {
    expect(choreo.rifleRaised(5.9)).toBe(false);
    expect(choreo.rifleRaised(6)).toBe(true);
    expect(choreo.firing(6.1)).toBe(false); // the raise reads before the trigger pull
    expect(choreo.firing(6.5)).toBe(true);
    expect(choreo.firing(500)).toBe(true);
  });
});
