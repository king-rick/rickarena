/**
 * AudioManager — Extracted from GameScene to centralize all audio state and methods.
 *
 * Owns: SFX playback, theme music, ambient loops, room tone, heartbeat,
 * mason rave music + filter, footstep surface detection, cooldown timers.
 *
 * Requires a Phaser scene reference for sound, tweens, time, and cache access.
 */

import { hudState } from "../HUDState";

type ThemeField = "themeMain" | "themeIntense" | "themeCreepybass" | "themeOutro";
type WaveState = "pre_game" | "active" | "clearing" | "intermission";

export class AudioManager {
  private scene: Phaser.Scene;

  // Volume state
  sfxVolume = 0.5;
  musicVolume = 0.5;
  sfxMuted = false;

  // Theme tracks
  themeMain: Phaser.Sound.BaseSound | null = null;
  themeIntense: Phaser.Sound.BaseSound | null = null;
  themeCreepybass: Phaser.Sound.BaseSound | null = null;
  themeOutro: Phaser.Sound.BaseSound | null = null;

  // Mason rave
  masonRaveMusic: Phaser.Sound.BaseSound | null = null;
  masonRaveMusicFilter: BiquadFilterNode | null = null;

  // Ambient
  ambientSounds: Phaser.Sound.BaseSound[] = [];
  roomTone: Phaser.Sound.BaseSound | null = null;

  // Heartbeat
  heartbeatPlaying = false;

  // Cooldown timers
  private lastPunchSfx = 0;
  private lastDeathSfx = 0;
  private lastBiteSfx = 0;
  private lastFootstepTime = 0;
  private lastGroanTime = 0;
  private lastDogFootstepTime = 0;
  lastScaryboiTauntTime = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Safe volume tween — kills existing tweens on target and guards against destroyed sounds */
  private fadeVolume(target: Phaser.Sound.BaseSound, volume: number, duration: number, ease = "Sine.easeIn", onComplete?: () => void) {
    try { this.scene.tweens.killTweensOf(target); } catch {}
    this.scene.tweens.add({
      targets: target,
      volume,
      duration,
      ease,
      onUpdate: (_tween: Phaser.Tweens.Tween, obj: any) => {
        // If the sound was destroyed mid-tween, kill it
        if (!obj || obj.manager === null || obj.manager === undefined) {
          try { _tween.stop(); } catch {}
        }
      },
      onComplete,
    });
  }

  // ─── Core SFX ───

  /** Play a one-shot SFX, scaled by master sfxVolume */
  playSound(key: string, volume = 0.5) {
    if (this.sfxMuted) return;
    try {
      if (this.scene.cache.audio.exists(key) && this.scene.sound?.locked === false) {
        const final = Math.min(volume * this.sfxVolume, 0.6);
        this.scene.sound.play(key, { volume: final });
      }
    } catch {
      // AudioContext closed — safe to ignore
    }
  }

  // ─── Theme Music ───

  /** Fade in a theme track, stopping any currently playing instance of it first */
  startTheme(key: string, field: ThemeField, volume: number, loop: boolean, fadeMs = 2000) {
    if (!this.scene.cache.audio.exists(key)) return;
    if (this[field]?.isPlaying) return;
    if (this[field]) {
      try { this.scene.tweens.killTweensOf(this[field]); } catch {}
      try { this[field]!.destroy(); } catch {}
      this[field] = null;
    }
    const track = this.scene.sound.add(key, { volume: 0, loop });
    this[field] = track;
    if ("setVolume" in track) (track as Phaser.Sound.WebAudioSound).setVolume(0);
    track.play({ volume: 0 });
    this.scene.time.delayedCall(50, () => {
      if (this[field] !== track) return;
      this.fadeVolume(track, Math.min(volume * this.musicVolume, volume), fadeMs, "Sine.easeIn");
    });
  }

  /** Fade out and stop a theme track */
  stopTheme(field: ThemeField, fadeMs = 1500) {
    const track = this[field];
    if (!track || !track.isPlaying) return;
    this[field] = null;
    this.fadeVolume(track, 0, fadeMs, "Sine.easeOut", () => {
      try { track.stop(); } catch {}
      try { track.destroy(); } catch {}
    });
  }

  /** Called on wave state transitions to manage theme_main and theme_intense */
  updateThemeMusic(state: WaveState, wave: number, gameOver: boolean) {
    if (gameOver) return;

    if (state === "active" || state === "clearing") {
      if (wave >= 10) {
        this.stopTheme("themeMain");
        this.startTheme("theme-intense", "themeIntense", 0.25, true, 3000);
      } else {
        this.startTheme("theme-main", "themeMain", 0.12, true, 2500);
      }
    } else if (state === "intermission") {
      this.stopTheme("themeIntense", 2000);
      if (wave < 10) {
        this.startTheme("theme-main", "themeMain", 0.12, true, 2500);
      } else {
        this.stopTheme("themeMain");
      }
    } else if (state === "pre_game") {
      this.stopTheme("themeMain");
      this.stopTheme("themeIntense");
    }
  }

  // ─── Combat SFX with Cooldowns ───

  playRandomPunch() {
    const now = this.scene.time.now;
    if (now - this.lastPunchSfx < 300) return;
    this.lastPunchSfx = now;
    const keys = [
      "sfx-punch1", "sfx-punch2", "sfx-punch3",
      "sfx-punch-body1", "sfx-punch-body2", "sfx-hit-classic",
      "sfx-punch-foley", "sfx-slap",
    ];
    this.playSound(keys[Math.floor(Math.random() * keys.length)], 0.4);
  }

  playRandomEnemyDeath() {
    const deathKeys = [
      "sfx-enemy-death1", "sfx-enemy-death2", "sfx-enemy-death3", "sfx-enemy-death4",
      "sfx-enemy-death5", "sfx-enemy-death6", "sfx-enemy-death7", "sfx-enemy-death8",
    ];
    this.playSound(deathKeys[Math.floor(Math.random() * deathKeys.length)], 0.3);
    if (Math.random() < 0.3) {
      this.playSound("sfx-gore-splat", 0.25);
    }
  }

  playBiteSound() {
    const now = this.scene.time.now;
    if (now - this.lastBiteSfx < 400) return;
    this.lastBiteSfx = now;
    const keys = ["sfx-bite", "sfx-zombie-bite", "sfx-zombie-bite2", "sfx-zombie-bite3", "sfx-zombie-bite-f"];
    this.playSound(keys[Math.floor(Math.random() * keys.length)], 0.3);
  }

  /** Play dog running footstep (cooldown-limited, random from 4 variants) */
  playDogFootstep(volume = 0.2) {
    const now = this.scene.time.now;
    if (now - this.lastDogFootstepTime < 250) return;
    this.lastDogFootstepTime = now;
    const variants = [1, 4, 5, 7];
    const key = `sfx-step-dog${variants[Math.floor(Math.random() * variants.length)]}`;
    this.playSound(key, volume);
  }

  /** Play footstep sound based on surface at player position */
  playFootstep(playerX: number, playerY: number, pathsLayer: Phaser.Tilemaps.TilemapLayer | undefined, roomTonePlaying: boolean) {
    const now = this.scene.time.now;
    if (now - this.lastFootstepTime < 280) return;
    this.lastFootstepTime = now;

    const tileX = Math.floor(playerX / 32);
    const tileY = Math.floor(playerY / 32);
    if (pathsLayer?.getTileAt(tileX, tileY)) {
      const i = Math.floor(Math.random() * 6) + 1;
      this.playSound(`sfx-step-gravel${i}`, 0.2);
    } else if (roomTonePlaying) {
      const i = Math.floor(Math.random() * 5) + 1;
      this.playSound(`sfx-step-wood${i}`, 0.2);
    } else {
      const i = Math.floor(Math.random() * 6) + 1;
      this.playSound(`sfx-step-grass${i}`, 0.15);
    }
  }

  tryPlayZombieGroan() {
    // MUTED — pending sound audit
  }

  // ─── Ambient / Room Tone ───

  startRoomTone() {
    if (this.roomTone?.isPlaying) return;
    if (!this.scene.cache.audio.exists("sfx-room-tone")) return;
    this.roomTone = this.scene.sound.add("sfx-room-tone", { volume: 0, loop: true });
    this.roomTone.play();
    this.fadeVolume(this.roomTone, 0.1, 800, "Sine.easeIn");
    for (const s of this.ambientSounds) {
      this.fadeVolume(s, 0, 800, "Sine.easeOut");
    }
  }

  stopRoomTone() {
    if (!this.roomTone?.isPlaying) return;
    const tone = this.roomTone;
    this.roomTone = null;
    this.fadeVolume(tone, 0, 500, "Sine.easeOut", () => { try { tone.stop(); } catch {} });
    for (const s of this.ambientSounds) {
      this.fadeVolume(s, 0.15, 800, "Sine.easeIn");
    }
  }

  /** Start ambient bird sounds */
  startAmbientBirds() {
    try {
      if (this.scene.cache.audio.exists("sfx-ambient-birds")) {
        const birds = this.scene.sound.add("sfx-ambient-birds", { volume: 0.15, loop: true });
        birds.play();
        this.ambientSounds.push(birds);
      }
    } catch { /* AudioContext may be closed during HMR */ }
  }

  /** Add rain ambient (called on wave 5) */
  startAmbientRain() {
    if (this.scene.cache.audio.exists("sfx-ambient-rain")) {
      const rain = this.scene.sound.add("sfx-ambient-rain", { volume: 0.08, loop: true });
      rain.play();
      this.ambientSounds.push(rain);
    }
  }

  // ─── Heartbeat ───

  updateHeartbeat(hpPct: number) {
    if (hpPct <= 0.25 && hpPct > 0 && !this.heartbeatPlaying) {
      this.heartbeatPlaying = true;
      this.scene.sound.play("sfx-heartbeat", { loop: true, volume: 0.15 });
    } else if ((hpPct > 0.25 || hpPct <= 0) && this.heartbeatPlaying) {
      this.heartbeatPlaying = false;
      this.scene.sound.stopByKey("sfx-heartbeat");
    }
  }

  stopHeartbeat() {
    if (this.heartbeatPlaying) {
      this.heartbeatPlaying = false;
      this.scene.sound.stopByKey("sfx-heartbeat");
    }
  }

  // ─── Mason Rave Music ───

  /** Start rave music at full volume (used during rave cutscene) */
  startRaveMusic() {
    if (this.masonRaveMusic?.isPlaying) {
      this.masonRaveMusic.stop();
    }
    if (this.masonRaveMusicFilter) {
      try { this.masonRaveMusicFilter.disconnect(); } catch {}
      this.masonRaveMusicFilter = null;
    }
    if (this.scene.cache.audio.exists("sfx-mason-rave-music")) {
      this.masonRaveMusic = this.scene.sound.add("sfx-mason-rave-music", { volume: 0.5, loop: true });
      this.masonRaveMusic.play();
    }
  }

  /** Start rave music with lowpass filter — sounds like it's playing in another room */
  startMuffledRaveMusic() {
    if (!this.scene.cache.audio.exists("sfx-mason-rave-music")) return;
    if (this.masonRaveMusic?.isPlaying) return;

    const ctx = (this.scene.sound as any).context as AudioContext;
    if (!ctx) return;

    this.masonRaveMusic = this.scene.sound.add("sfx-mason-rave-music", { volume: 0.15, loop: true });
    this.masonRaveMusic.play();

    try {
      const webSound = this.masonRaveMusic as Phaser.Sound.WebAudioSound;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 400;
      filter.Q.value = 1;
      this.masonRaveMusicFilter = filter;

      const volumeNode = (webSound as any).volumeNode as GainNode;
      if (volumeNode) {
        volumeNode.disconnect();
        volumeNode.connect(filter);
        filter.connect(ctx.destination);
      }
    } catch {
      // Fallback — no filter, just low volume
    }
  }

  /** Update rave music filter cutoff and volume based on player distance to club */
  updateRaveMusicFilter(playerY: number) {
    if (!this.masonRaveMusicFilter || !this.masonRaveMusic) return;

    const yTop = 600;
    const yBottom = 1000;
    const t = Math.max(0, Math.min(1, (playerY - yTop) / (yBottom - yTop)));
    const minFreq = 400;
    const maxFreq = 20000;
    const freq = minFreq * Math.pow(maxFreq / minFreq, 1 - t);
    this.masonRaveMusicFilter.frequency.value = freq;

    const vol = 0.15 + (1 - t) * 0.30;
    (this.masonRaveMusic as Phaser.Sound.WebAudioSound).setVolume(vol);
  }

  stopRaveMusic() {
    if (this.masonRaveMusic?.isPlaying) this.masonRaveMusic.stop();
    this.masonRaveMusic = null;
  }

  // ─── Volume Handlers (from pause menu) ───

  setSfxVolume(val: number) {
    this.sfxVolume = val;
    this.sfxMuted = val === 0;
    hudState.update({ sfxVolume: val });
    for (const s of this.ambientSounds) {
      if ("setVolume" in s) (s as Phaser.Sound.WebAudioSound).setVolume(val * 0.15);
    }
  }

  setMusicVolume(val: number) {
    this.musicVolume = val;
    hudState.update({ musicVolume: val });
    for (const field of ["themeMain", "themeIntense", "themeCreepybass", "themeOutro"] as const) {
      const track = this[field];
      if (track?.isPlaying && "setVolume" in track) {
        (track as Phaser.Sound.WebAudioSound).setVolume(val * 0.25);
      }
    }
    if (this.masonRaveMusic?.isPlaying && "setVolume" in this.masonRaveMusic) {
      (this.masonRaveMusic as Phaser.Sound.WebAudioSound).setVolume(val * 0.3);
    }
  }

  // ─── Shutdown ───

  shutdown() {
    // Kill all volume tweens on tracked sounds before stopping
    for (const field of ["themeMain", "themeIntense", "themeCreepybass", "themeOutro"] as const) {
      if (this[field]) { try { this.scene.tweens.killTweensOf(this[field]); } catch {} }
    }
    if (this.roomTone) { try { this.scene.tweens.killTweensOf(this.roomTone); } catch {} }
    for (const s of this.ambientSounds) { try { this.scene.tweens.killTweensOf(s); } catch {} }

    if (this.masonRaveMusicFilter) {
      try { this.masonRaveMusicFilter.disconnect(); } catch {}
      this.masonRaveMusicFilter = null;
    }
    this.masonRaveMusic = null;
    try { this.scene.sound.stopByKey("sfx-heartbeat"); } catch {}
    try { this.scene.sound.stopByKey("sfx-ambient-birds"); } catch {}
    try { this.scene.sound.stopByKey("sfx-ambient-rain"); } catch {}
    try { this.scene.sound.stopByKey("sfx-gen-hum"); } catch {}
    try { this.scene.sound.stopAll(); } catch {}
    this.ambientSounds = [];
    this.heartbeatPlaying = false;
    this.themeMain = null;
    this.themeIntense = null;
    this.themeCreepybass = null;
    this.themeOutro = null;
    this.roomTone = null;
  }
}
