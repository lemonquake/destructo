import { Howl, Howler } from 'howler';
import * as THREE from 'three';

export class AudioSystem {
  constructor(volumeSlider = 0.55) {
    this.volumeSlider = volumeSlider;
    this.currentMusic = null;
    this.currentMusicSrc = null;

    // Configured with panner attributes for spatial 3D audio
    const normalPanner = {
      panningModel: 'HRTF',
      refDistance: 35.0, // Match default top-down camera distance so focal point sounds are at 100% volume
      rolloffFactor: 1.0,
      maxDistance: 250,
      distanceModel: 'inverse'
    };

    const explosionPanner = {
      panningModel: 'HRTF',
      refDistance: 60.0, // Explosions should have a larger range of audibility
      rolloffFactor: 0.5,
      maxDistance: 1000,
      distanceModel: 'inverse'
    };

    // Load actual audio files with proper configuration
    this.sounds = {
      button_click: new Howl({ src: ['/sounds/button_click.wav'] }),
      change_team: new Howl({ src: ['/sounds/change_team.wav'] }),
      change_texture: new Howl({ src: ['/sounds/change_texture.wav'] }),
      destructo_death: new Howl({ src: ['/sounds/destructo_death.wav'], ...normalPanner }),
      destructo_grunt: [
        new Howl({ src: ['/sounds/destructo_grunt.wav'], ...normalPanner }),
        new Howl({ src: ['/sounds/destructo_grunt2.wav'], ...normalPanner })
      ],
      destructo_hit: new Howl({ src: ['/sounds/destructo_hit1.wav'], ...normalPanner }),
      explosion: new Howl({ src: ['/sounds/grenade_explosion.wav'], ...explosionPanner }),
      grenade_launcher: new Howl({ src: ['/sounds/grenade_launcher.wav'], ...normalPanner }),
      machinegun: new Howl({ src: ['/sounds/machinegun.wav'], ...normalPanner }),
      metal_hit: [
        new Howl({ src: ['/sounds/metal_hit1.wav'], ...normalPanner }),
        new Howl({ src: ['/sounds/metal_hit2.wav'], ...normalPanner }),
        new Howl({ src: ['/sounds/metal_hit3.wav'], ...normalPanner }),
        new Howl({ src: ['/sounds/metal_hit4.wav'], ...normalPanner })
      ],
      pistol: new Howl({ src: ['/sounds/pistol.wav'], ...normalPanner }),
      rock_hit: [
        new Howl({ src: ['/sounds/rock_hit1.wav'], ...normalPanner }),
        new Howl({ src: ['/sounds/rock_hit2.wav'], ...normalPanner })
      ],
      shotgun: new Howl({ src: ['/sounds/shotgun.wav'], ...normalPanner }),
      sniper: new Howl({ src: ['/sounds/sniper.wav'], ...normalPanner }),
      structure_death: new Howl({ src: ['/sounds/structure_death.wav'], ...normalPanner }),
      turret: [
        new Howl({ src: ['/sounds/turret1.wav'], ...normalPanner }),
        new Howl({ src: ['/sounds/turret2.wav'], ...normalPanner })
      ],
      wood_hit: new Howl({ src: ['/sounds/wood_hit.wav'], ...normalPanner }),

      destructo_bloodsplash: new Howl({ src: ['/sounds/destructo_bloodsplash.wav'], ...normalPanner }),
      uzi: new Howl({ src: ['/sounds/uzi.wav'], ...normalPanner }),

      // Real audio assets in place of default generated sounds
      pickup: new Howl({ src: ['/sounds/change_texture.wav'] }),
      build: new Howl({ src: ['/sounds/change_team.wav'] })
    };
  }

  play(name, pos = null, rate = 1) {
    // If the second argument is a number, treat it as the rate parameter (supports legacy play(name, rate) calls)
    if (typeof pos === 'number') {
      rate = pos;
      pos = null;
    }

    const entry = this.sounds[name];
    if (!entry) return;

    // Pick variation if it's an array
    const sound = Array.isArray(entry) ? entry[Math.floor(Math.random() * entry.length)] : entry;

    // Determine base scaling factor
    let scale = 0.75; // Default for sounds (75% max volume)
    if (['pistol', 'machinegun', 'shotgun', 'sniper', 'grenade_launcher', 'turret', 'uzi'].includes(name)) {
      scale = 0.40; // Gunshot sounds scaled to max 40% volume
    } else if (name === 'destructo_grunt') {
      scale = 0.75 * 0.50; // Grunt sounds have a max volume of 50% of the sound volume
    } else if (name === 'explosion') {
      scale = 1.0; // Explosion sounds have 100% volume
    }

    const volume = this.volumeSlider * scale;
    
    // Play the sound
    const id = sound.play();
    sound.volume(volume, id);
    sound.rate(rate, id);

    // Apply spatial coordinates if position is supplied and has finite numeric properties
    if (pos && typeof pos.x === 'number' && typeof pos.y === 'number' && typeof pos.z === 'number' && typeof sound.pos === 'function') {
      sound.pos(pos.x, pos.y, pos.z, id);
    }

    return id;
  }

  playMusic(srcUrl, loop = true) {
    if (this.currentMusicSrc === srcUrl) {
      // If already playing, ensure target volume is set correctly
      if (this.currentMusic) {
        this.currentMusic.volume(this.volumeSlider * 0.60);
      }
      return;
    }

    if (this.currentMusic) {
      const oldMusic = this.currentMusic;
      oldMusic.fade(oldMusic.volume(), 0, 500);
      setTimeout(() => oldMusic.stop(), 500);
    }

    this.currentMusicSrc = srcUrl;
    
    // Create new music instance with max volume 60%
    this.currentMusic = new Howl({
      src: [srcUrl],
      loop: loop,
      volume: 0,
      html5: true // Stream background music
    });

    const targetVolume = this.volumeSlider * 0.60;
    this.currentMusic.play();
    this.currentMusic.fade(0, targetVolume, 500);
  }

  setVolume(v) {
    this.volumeSlider = v;
    if (this.currentMusic) {
      this.currentMusic.volume(v * 0.60);
    }
  }

  updateListener(camera) {
    if (!camera) return;
    // Set AudioListener position to camera position
    Howler.pos(camera.position.x, camera.position.y, camera.position.z);

    // Get camera orientation vectors
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    Howler.orientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
  }
}
