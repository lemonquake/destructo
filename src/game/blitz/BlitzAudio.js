// Crate Blitz owns its own mixer.
//
// The mode ships with its own recorded set under /sounds/crate_blitz — bomb
// booms, per-material obstacle bursts, four death cries, four laughs and five
// background tracks. None of it belongs in the shared AudioSystem bank (which
// is built around the infantry game), so it lives here and is created and torn
// down with the match.
//
// The laugh is deliberately delayed: a kill reads as "boom, silence, cackle",
// which is funnier and stops the laugh fighting the explosion for headroom.

import { Howl } from 'howler';

const ROOT = '/sounds/crate_blitz';
export const KILL_LAUGH_DELAY = 1;

// name → files. An array is a variant pool; one is picked at random per play.
const BANK = {
  bombBoom: ['bomb_boom1.wav', 'bomb_boom2.wav'],
  bombExplode: ['bomb_explode1.wav', 'bomb_explode2.wav', 'bomb_explode3.wav'],
  brick: ['brick_explode.wav'],
  wood: ['wood_explosion.wav'],
  debris: ['debris_explode.wav'],
  death: ['death1.wav', 'death2.wav', 'death3.wav', 'death4.wav'],
  laugh: ['laugh1.wav', 'laugh2.wav', 'laugh3.wav', 'laugh4.wav'],
};

export const BGM_TRACKS = Object.freeze(['bgm1.mp3', 'bgm2.mp3', 'bgm3.mp3', 'bgm4.mp3', 'bgm5.mp3']);

// Per-cue mix so the recorded set sits together: the boom is the loudest thing
// in the mode, obstacle bursts sit under it, and voices cut through both.
const GAIN = {
  bombBoom: 0.72, bombExplode: 0.66, brick: 0.42, wood: 0.44,
  debris: 0.40, death: 0.62, laugh: 0.70,
};

// Fisher-Yates. Used for the track order so a session never repeats the same
// sequence, and re-shuffled every time the playlist wraps.
export function shuffled(list, random = Math.random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export class BlitzAudio {
  constructor({ volume = 0.55, muted = false, musicMuted = false, random = Math.random } = {}) {
    this.volume = volume;
    this.muted = muted;
    this.musicMuted = musicMuted;
    this.random = random;
    this.timers = new Set();
    this.disposed = false;
    this.clips = {};
    for (const [name, files] of Object.entries(BANK)) {
      this.clips[name] = files.map(file => new Howl({
        src: [`${ROOT}/${file}`],
        pool: 6,
        // Positional audio would put half the lattice in one ear on a top-down
        // camera. The board is small; play everything centred.
        volume: this.volume * (GAIN[name] ?? 0.5),
      }));
    }
    this.order = shuffled(BGM_TRACKS, random);
    this.trackIndex = 0;
    this.music = null;
  }

  // ── sfx ───────────────────────────────────────────────────────────────────
  play(name, { rate = 1, gain = 1 } = {}) {
    if (this.disposed || this.muted) return null;
    const pool = this.clips[name];
    if (!pool?.length) return null;
    const clip = pool[Math.floor(this.random() * pool.length)];
    try {
      const id = clip.play();
      if (id == null) return null;
      clip.volume(this.volume * (GAIN[name] ?? 0.5) * gain, id);
      clip.rate(Math.max(0.5, Math.min(2, rate)), id);
      return id;
    } catch { return null; }
  }

  // The blast itself: two layers, a body and a crack, slightly detuned per
  // charge so a chain reaction does not sound like one sample on repeat.
  explosion(power = 3) {
    const rate = 1.08 - Math.min(0.22, power * 0.03);
    this.play('bombExplode', { rate: rate + (this.random() - 0.5) * 0.08 });
    this.play('bombBoom', { rate: rate + (this.random() - 0.5) * 0.06, gain: 0.85 });
  }

  // Obstacles are voiced by what they are made of — that is the whole point of
  // having more than one obstacle type.
  obstacle(material) {
    const cue = material === 'brick' ? 'brick' : material === 'debris' ? 'debris' : 'wood';
    this.play(cue, { rate: 0.94 + this.random() * 0.16 });
  }

  death() { this.play('death', { rate: 0.96 + this.random() * 0.1 }); }

  // A kill laughs at the victim a beat later. Timers are tracked so quitting
  // mid-match cannot leave a cackle playing over the menu.
  laughAfterKill(delay = KILL_LAUGH_DELAY) {
    if (this.disposed || this.muted) return;
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      this.play('laugh', { rate: 0.97 + this.random() * 0.1 });
    }, delay * 1000);
    this.timers.add(timer);
  }

  // ── music ─────────────────────────────────────────────────────────────────
  // Every track, in a random order, one after another, forever. Each track is
  // played once (loop:false) and `end` advances the playlist; when the order is
  // exhausted it is re-shuffled so the next lap is a different sequence.
  startMusic() {
    if (this.disposed) return;
    this.playTrack(this.order[this.trackIndex % this.order.length]);
  }
  playTrack(file) {
    this.stopMusic();
    this.music = new Howl({
      src: [`${ROOT}/bgm/${file}`],
      html5: true,
      loop: false,
      volume: 0,
    });
    this.music.once('end', () => this.nextTrack());
    // A missing or undecodable track must not end the music for the match.
    this.music.once('loaderror', () => this.nextTrack());
    this.music.once('playerror', () => this.nextTrack());
    this.music.play();
    this.music.fade(0, this.musicVolume(), 700);
  }
  nextTrack() {
    if (this.disposed) return;
    this.trackIndex++;
    if (this.trackIndex >= this.order.length) {
      this.order = shuffled(BGM_TRACKS, this.random);
      this.trackIndex = 0;
    }
    this.playTrack(this.order[this.trackIndex]);
  }
  musicVolume() { return this.musicMuted ? 0 : this.volume * 0.42; }
  stopMusic() {
    if (!this.music) return;
    const old = this.music;
    this.music = null;
    try { old.off(); old.stop(); old.unload(); } catch { /* already gone */ }
  }

  setVolume(value) {
    this.volume = value;
    this.music?.volume(this.musicVolume());
  }
  setMuted(muted) { this.muted = Boolean(muted); }
  setMusicMuted(muted) {
    this.musicMuted = Boolean(muted);
    this.music?.volume(this.musicVolume());
  }

  dispose() {
    this.disposed = true;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.stopMusic();
    for (const pool of Object.values(this.clips)) {
      for (const clip of pool) { try { clip.stop(); clip.unload(); } catch { /* already gone */ } }
    }
    this.clips = {};
  }
}

export const blitzAudioInternals = { BANK, GAIN, ROOT };
