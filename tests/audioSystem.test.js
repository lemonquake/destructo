import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  instances: [],
  nextId: 1,
  context: { state: 'running', resume: vi.fn(() => Promise.resolve()) }
}));

vi.mock('howler', () => {
  class MockHowl {
    constructor(options) {
      this.options = options;
      this.listeners = [];
      this.active = new Set();
      this.stopped = [];
      this.throwOnPlay = false;
      this._volume = options.volume || 0;
      mocks.instances.push(this);
    }

    play() {
      if (this.throwOnPlay) throw new Error('audio node creation failed');
      const id = mocks.nextId++;
      this.active.add(id);
      return id;
    }

    stop(id) {
      this.active.delete(id);
      this.stopped.push(id);
      this.emit('stop', id);
      return this;
    }

    once(event, callback, id) {
      this.listeners.push({ event, callback, id });
      return this;
    }

    off(event, callback, id) {
      this.listeners = this.listeners.filter(listener =>
        listener.event !== event || listener.callback !== callback || listener.id !== id
      );
      return this;
    }

    emit(event, id) {
      const listeners = this.listeners.filter(listener => listener.event === event && listener.id === id);
      listeners.forEach(listener => listener.callback(id));
    }

    volume(value) {
      if (value === undefined) return this._volume;
      this._volume = value;
      return this;
    }

    rate() { return this; }
    pos() { return this; }
    fade() { return this; }
    playing() { return this.active.size > 0; }
  }

  return {
    Howl: MockHowl,
    Howler: {
      ctx: mocks.context,
      pos: vi.fn(),
      orientation: vi.fn()
    }
  };
});

import { AudioSystem, MAX_ACTIVE_SFX } from '../src/game/AudioSystem.js';

describe('AudioSystem voice management', () => {
  beforeEach(() => {
    mocks.instances.length = 0;
    mocks.nextId = 1;
    mocks.context.state = 'running';
    mocks.context.resume.mockClear();
  });

  it('bounds overlapping sounds and steals old voices instead of exhausting Web Audio', () => {
    const audio = new AudioSystem();

    for (let i = 0; i < 1000; i++) audio.play('pistol');

    expect(audio.activeVoices).toHaveLength(24);
    expect(audio.activeVoices.length).toBeLessThanOrEqual(MAX_ACTIVE_SFX);
    const pistols = audio.sounds.pistol;
    expect(pistols.reduce((total, clip) => total + clip.active.size, 0)).toBe(24);
    expect(pistols.reduce((total, clip) => total + clip.stopped.length, 0)).toBe(976);
  });

  it('keeps important sounds when a lower-priority sound arrives at the global limit', () => {
    const audio = new AudioSystem();
    for (let i = 0; i < 24; i++) audio.play('pistol');
    for (let i = 0; i < 12; i++) audio.play('destructo_hit');
    for (let i = 0; i < 8; i++) audio.play('explosion');
    for (let i = 0; i < 4; i++) audio.play('destructo_damaged');

    expect(audio.activeVoices).toHaveLength(MAX_ACTIVE_SFX);
    expect(audio.play('step_dirt')).toBeUndefined();
    expect(audio.activeVoices).toHaveLength(MAX_ACTIVE_SFX);
  });

  it('releases a voice on completion so later sounds can play', () => {
    const audio = new AudioSystem();
    const id = audio.play('pistol');
    audio.activeVoices[0].clip.emit('end', id);

    expect(audio.activeVoices).toHaveLength(0);
    expect(audio.play('pistol')).toBeTypeOf('number');
    expect(audio.activeVoices).toHaveLength(1);
  });

  it('contains a single playback failure without poisoning the mixer', () => {
    const audio = new AudioSystem();
    audio.sounds.pistol.forEach(clip => { clip.throwOnPlay = true; });

    expect(() => audio.play('pistol')).not.toThrow();
    expect(audio.activeVoices).toHaveLength(0);
    audio.sounds.pistol.forEach(clip => { clip.throwOnPlay = false; });
    expect(audio.play('pistol')).toBeTypeOf('number');
  });

  it('registers every new pistol, ricochet, tree, and Destructo hit variant', () => {
    const audio = new AudioSystem();
    const sources = name => [audio.sounds[name]].flat().map(clip => clip.options.src[0]);

    expect(sources('pistol')).toEqual(['/sounds/pistol.wav', '/sounds/pistol1.wav']);
    expect(sources('ricochet')).toEqual(['/sounds/ricochet1.wav', '/sounds/ricochet2.wav']);
    expect(sources('tree_hit')).toEqual(['/sounds/tree_hit1.wav', '/sounds/tree_hit2.wav', '/sounds/tree_hit3.wav']);
    expect(sources('tree_explode')).toEqual(['/sounds/tree_explode.wav']);
    expect(sources('destructo_hit')).toEqual(['/sounds/destructo_hit1.wav', '/sounds/destructo_hit2.wav', '/sounds/destructo_hit3.wav']);
  });

  it('asks a suspended audio context to resume', () => {
    const audio = new AudioSystem();
    mocks.context.state = 'suspended';

    for (let i = 0; i < 20; i++) audio.play('pistol');

    expect(mocks.context.resume).toHaveBeenCalledOnce();
  });
});
