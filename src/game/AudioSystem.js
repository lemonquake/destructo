import { Howl, Howler } from 'howler';
import * as THREE from 'three';

export const MAX_ACTIVE_SFX = 48;

const SOUND_PROFILES = {
  button_click: { group: 'ui', priority: 4 },
  change_team: { group: 'ui', priority: 4 },
  change_texture: { group: 'ui', priority: 4 },
  pickup: { group: 'ui', priority: 3 },
  build: { group: 'ui', priority: 3 },
  defeat: { group: 'voice', priority: 5 },
  destructo_death: { group: 'voice', priority: 5 },
  destructo_explosion_death: { group: 'voice', priority: 5 },
  destructo_damaged: { group: 'voice', priority: 4 },
  destructo_damaged_running: { group: 'voice', priority: 4 },
  destructo_grunt: { group: 'voice', priority: 3 },
  destructo_hit: { group: 'impact', priority: 2 },
  explosion: { group: 'explosion', priority: 4 },
  tree_explode: { group: 'explosion', priority: 3 },
  pistol: { group: 'weapon', priority: 2 },
  machinegun: { group: 'weapon', priority: 2 },
  shotgun: { group: 'weapon', priority: 3 },
  sniper: { group: 'weapon', priority: 3 },
  grenade_launcher: { group: 'weapon', priority: 3 },
  turret: { group: 'weapon', priority: 2 },
  uzi: { group: 'weapon', priority: 2 },
  ricochet: { group: 'impact', priority: 1 },
  tree_hit: { group: 'impact', priority: 1 },
  step_rock: { group: 'movement', priority: 0 },
  step_dirt: { group: 'movement', priority: 0 },
  step_water: { group: 'movement', priority: 0 },
  water_splash: { group: 'movement', priority: 1 }
};

const GROUP_LIMITS = { ui: 6, voice: 8, explosion: 8, weapon: 24, movement: 8, impact: 12 };
const DEFAULT_PROFILE = { group: 'impact', priority: 1 };

export class AudioSystem {
  constructor(volumeSlider = 0.55) {
    this.volumeSlider = volumeSlider;
    this.currentMusic = null;
    this.currentMusicSrc = null;
    this.activeVoices = [];
    this.nextVoiceSequence = 0;
    this.resumePromise = null;
    this.musicMuted = false;
    this.soundsMuted = false;

    const normalPanner = {
      panningModel: 'HRTF', refDistance: 35, rolloffFactor: 1,
      maxDistance: 250, distanceModel: 'inverse'
    };
    const explosionPanner = {
      panningModel: 'HRTF', refDistance: 60, rolloffFactor: .5,
      maxDistance: 1000, distanceModel: 'inverse'
    };
    // Howler's pool only limits finished nodes, not concurrent playback. The
    // active voice budget below is what keeps large battles from exhausting
    // the browser's Web Audio graph.
    const sound = (file, options = normalPanner) => new Howl({ src: [`/sounds/${file}`], pool: 8, ...options });
    const variants = files => files.map(file => sound(file));

    this.sounds = {
      button_click: sound('button_click.wav', {}),
      change_team: sound('change_team.wav', {}),
      change_texture: sound('change_texture.wav', {}),
      destructo_death: variants(['destructo_death.wav', 'destructo_death2.wav', 'destructo_death3.wav', 'destructo_death4.wav', 'destructo_death5.wav', 'destructo_death6.wav', 'destructo_death7.wav']),
      destructo_explosion_death: sound('destructo_dies_from_explosion.wav'),
      destructo_damaged: sound('destructo_damaged.wav'),
      destructo_damaged_running: sound('destructo_damaged2.wav'),
      destructo_grunt: variants(['destructo_grunt.wav', 'destructo_grunt2.wav']),
      destructo_hit: variants(['destructo_hit1.wav', 'destructo_hit2.wav', 'destructo_hit3.wav']),
      destructo_bloodsplash: sound('destructo_bloodsplash.wav'),
      defeat: sound('defeat.wav', {}),
      explosion: sound('grenade_explosion.wav', explosionPanner),
      grenade_launcher: sound('grenade_launcher.wav'),
      machinegun: sound('machinegun.wav'),
      metal_hit: variants(['metal_hit1.wav', 'metal_hit2.wav', 'metal_hit3.wav', 'metal_hit4.wav']),
      pistol: variants(['pistol.wav', 'pistol1.wav']),
      ricochet: variants(['ricochet1.wav', 'ricochet2.wav']),
      rock_hit: variants(['rock_hit1.wav', 'rock_hit2.wav']),
      shotgun: sound('shotgun.wav'),
      sniper: sound('sniper.wav'),
      structure_death: sound('structure_death.wav'),
      turret: variants(['turret1.wav', 'turret2.wav']),
      tree_hit: variants(['tree_hit1.wav', 'tree_hit2.wav', 'tree_hit3.wav']),
      tree_explode: sound('tree_explode.wav', explosionPanner),
      wood_hit: sound('wood_hit.wav'),
      uzi: sound('uzi.wav'),
      step_rock: variants(['step_rock.wav', 'step_rock2.wav']),
      step_dirt: variants(['step_dirt.wav', 'step_dirt2.wav']),
      step_water: variants(['step_water.wav', 'step_water2.wav']),
      water_splash: sound('water_splash.wav'),
      pickup: sound('change_texture.wav', {}),
      build: sound('change_team.wav', {})
    };
  }

  play(name, pos = null, rate = 1) {
    if (this.soundsMuted) return;
    if (typeof pos === 'number') { rate = pos; pos = null; }
    const entry = this.sounds[name];
    if (!entry) return;
    const clip = Array.isArray(entry) ? entry[Math.floor(Math.random() * entry.length)] : entry;
    const profile = SOUND_PROFILES[name] || DEFAULT_PROFILE;

    if (!this.makeVoiceRoom(profile)) return;
    this.resumeAudioContext();

    let scale = .55;
    if (['pistol', 'machinegun', 'shotgun', 'sniper', 'grenade_launcher', 'turret', 'uzi'].includes(name)) scale = .28;
    else if (['step_rock', 'step_dirt', 'step_water'].includes(name)) scale = .20;
    else if (['destructo_damaged', 'destructo_damaged_running', 'destructo_death', 'destructo_explosion_death', 'defeat'].includes(name)) scale = .38;
    else if (['metal_hit', 'rock_hit', 'wood_hit', 'tree_hit', 'ricochet', 'destructo_hit', 'destructo_bloodsplash'].includes(name)) scale = .30;
    else if (name === 'explosion' || name === 'tree_explode') scale = .45;
    else if (name === 'water_splash') scale = .32;
    else if (name === 'destructo_grunt') scale = .30;

    let id;
    try {
      id = clip.play();
      if (id == null) return;
      clip.volume(this.volumeSlider * scale, id);
      clip.rate(Math.max(.5, Math.min(2, Number.isFinite(rate) ? rate : 1)), id);
      if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z)) clip.pos(pos.x, pos.y, pos.z, id);
    } catch {
      if (id != null) {
        try { clip.stop(id); } catch { /* A failed voice is already unusable. */ }
      }
      return;
    }

    const voice = { clip, id, group: profile.group, priority: profile.priority, sequence: this.nextVoiceSequence++ };
    this.activeVoices.push(voice);
    const cleanup = () => this.removeVoice(voice, cleanup);
    voice.cleanup = cleanup;
    clip.once('end', cleanup, id);
    clip.once('stop', cleanup, id);
    clip.once('playerror', cleanup, id);
    return id;
  }

  makeVoiceRoom(profile) {
    const groupVoices = this.activeVoices.filter(voice => voice.group === profile.group);
    if (groupVoices.length >= GROUP_LIMITS[profile.group]) {
      const victim = this.pickVictim(groupVoices, profile.priority);
      if (!victim) return false;
      this.stopVoice(victim);
    }
    if (this.activeVoices.length >= MAX_ACTIVE_SFX) {
      const victim = this.pickVictim(this.activeVoices, profile.priority);
      if (!victim) return false;
      this.stopVoice(victim);
    }
    return true;
  }

  pickVictim(voices, incomingPriority) {
    const candidates = voices.filter(voice => voice.priority <= incomingPriority);
    if (!candidates.length) return null;
    return candidates.reduce((oldest, voice) =>
      voice.priority < oldest.priority || (voice.priority === oldest.priority && voice.sequence < oldest.sequence) ? voice : oldest
    );
  }

  stopVoice(voice) {
    this.removeVoice(voice, voice.cleanup);
    try { voice.clip.stop(voice.id); } catch { /* Keep the mixer usable if one Howl fails. */ }
  }

  removeVoice(voice, cleanup) {
    const index = this.activeVoices.indexOf(voice);
    if (index !== -1) this.activeVoices.splice(index, 1);
    if (cleanup && typeof voice.clip.off === 'function') {
      voice.clip.off('end', cleanup, voice.id);
      voice.clip.off('stop', cleanup, voice.id);
      voice.clip.off('playerror', cleanup, voice.id);
    }
  }

  resumeAudioContext() {
    const context = Howler.ctx;
    if (!context || this.resumePromise || (context.state !== 'suspended' && context.state !== 'interrupted')) return;
    try {
      const resumed = context.resume();
      if (resumed && typeof resumed.then === 'function') {
        this.resumePromise = Promise.resolve(resumed).catch(() => {}).finally(() => { this.resumePromise = null; });
      }
    } catch { /* A later user gesture/Howler auto-unlock can resume it. */ }
  }

  playMusic(srcUrl, loop = true) {
    this.resumeAudioContext();
    if (this.currentMusicSrc === srcUrl) {
      if (this.currentMusic) {
        this.currentMusic.volume(this.musicMuted ? 0 : this.volumeSlider * .60);
        if (!this.currentMusic.playing()) this.currentMusic.play();
      }
      return;
    }
    if (this.currentMusic) {
      const oldMusic = this.currentMusic;
      oldMusic.fade(oldMusic.volume(), 0, 500);
      setTimeout(() => oldMusic.stop(), 500);
    }
    this.currentMusicSrc = srcUrl;
    this.currentMusic = new Howl({ src: [srcUrl], loop, volume: 0, html5: true });
    this.currentMusic.play();
    this.currentMusic.fade(0, this.musicMuted ? 0 : this.volumeSlider * .60, 500);
  }

  setVolume(value) {
    this.volumeSlider = value;
    if (this.currentMusic) this.currentMusic.volume(this.musicMuted ? 0 : value * .60);
  }

  setMusicMuted(muted) { this.musicMuted = Boolean(muted); if (this.currentMusic) this.currentMusic.volume(this.musicMuted ? 0 : this.volumeSlider * .60); return this.musicMuted; }
  setSoundsMuted(muted) { this.soundsMuted = Boolean(muted); if (this.soundsMuted) for (const voice of [...this.activeVoices]) this.stopVoice(voice); return this.soundsMuted; }

  updateListener(camera) {
    if (!camera) return;
    Howler.pos(camera.position.x, camera.position.y, camera.position.z);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    Howler.orientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
  }
}
