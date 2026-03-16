import Phaser from "phaser";
import { CHARACTERS, DIRECTIONS } from "../data/characters";
import {
  CHARACTER_ANIMATIONS,
  getFrameKey,
  getAnimKey,
} from "../data/animations";

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "Boot" });
  }

  preload() {
    // Load character rotation sprites (static, used as fallback)
    for (const char of CHARACTERS) {
      for (const dir of DIRECTIONS) {
        this.load.image(
          `${char.id}-${dir}`,
          `/assets/sprites/${char.id}/rotations/${dir}.png`
        );
      }
    }

    // Load animation frames for characters that have them
    for (const [charId, anims] of Object.entries(CHARACTER_ANIMATIONS)) {
      for (const anim of anims) {
        for (const dir of DIRECTIONS) {
          for (let f = 0; f < anim.frames; f++) {
            const key = getFrameKey(charId, anim.type, dir, f);
            const path = `/assets/sprites/${charId}/${anim.type}/${dir}/frame_${String(f).padStart(3, "0")}.png`;
            this.load.image(key, path);
          }
        }
      }
    }

    // Load enemy rotation sprites
    for (const dir of DIRECTIONS) {
      this.load.image(
        `pussy-${dir}`,
        `/assets/sprites/pussy/rotations/${dir}.png`
      );
    }

    // Tiles
    this.load.image("grass-tile", "/assets/sprites/tiles/grass-patch.png");

    // Item sprites
    this.load.image("item-pistol", "/assets/sprites/items/pistol.png");
    this.load.image("item-shotgun", "/assets/sprites/items/shotgun.png");
    this.load.image("item-smg", "/assets/sprites/items/smg.png");
    this.load.image("item-grenade", "/assets/sprites/items/grenade.png");
    this.load.image("bullet", "/assets/sprites/items/bullet.png");
    this.load.image("trap-spikes", "/assets/sprites/items/trap-spikes.png");
    this.load.image("trap-barricade", "/assets/sprites/items/trap-barricade.png");
    this.load.image("trap-landmine", "/assets/sprites/items/trap-landmine.png");

    // Audio
    // Weapons
    this.load.audio("sfx-pistol", "/assets/audio/weapons/pistol-fire-1.wav");
    this.load.audio("sfx-shotgun", "/assets/audio/weapons/shotgun-blast-el.wav");
    this.load.audio("sfx-smg", "/assets/audio/weapons/smg-fire-1.wav");
    this.load.audio("sfx-dryfire", "/assets/audio/weapons/dry-fire-click.wav");
    // Melee
    this.load.audio("sfx-punch1", "/assets/audio/melee/punch-hit-1.wav");
    this.load.audio("sfx-punch2", "/assets/audio/melee/punch-hit-2.wav");
    this.load.audio("sfx-punch3", "/assets/audio/melee/punch-hit-3.wav");
    this.load.audio("sfx-whoosh", "/assets/audio/melee/punch-whoosh.wav");
    this.load.audio("sfx-grunt", "/assets/audio/melee/grunt-effort.wav");
    // Enemies
    this.load.audio("sfx-enemy-death1", "/assets/audio/enemies/enemy-death-retro.wav");
    this.load.audio("sfx-enemy-death2", "/assets/audio/enemies/enemy-horror-moan.wav");
    this.load.audio("sfx-enemy-death3", "/assets/audio/enemies/wilhelm-1.wav");
    this.load.audio("sfx-enemy-death4", "/assets/audio/enemies/wilhelm-2.wav");
    this.load.audio("sfx-bite", "/assets/audio/enemies/bite-chomp.wav");
    this.load.audio("sfx-zombie-bite", "/assets/audio/enemies/zombie-bite-1.wav");
    // Traps
    this.load.audio("sfx-explosion", "/assets/audio/traps/explosion.wav");
    this.load.audio("sfx-trap-place", "/assets/audio/traps/trap-place.wav");
    // UI
    this.load.audio("sfx-buy", "/assets/audio/ui/shop-buy.wav");
    this.load.audio("sfx-click", "/assets/audio/ui/ui-click.wav");
    // Ambient
    this.load.audio("sfx-ambient-birds", "/assets/audio/ambient/forest-birds.wav");
    this.load.audio("sfx-creepy-whisper", "/assets/audio/ambient/creepy-whisper.wav");

    // Progress bar
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;
    const bar = this.add.rectangle(width / 2, height / 2, 0, 20, 0x4a90d9);

    this.add
      .text(width / 2, height / 2 - 30, "LOADING...", {
        fontSize: "14px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#666666",
      })
      .setOrigin(0.5);

    this.load.on("progress", (value: number) => {
      bar.width = 300 * value;
    });
  }

  create() {
    // Register animations
    for (const [charId, anims] of Object.entries(CHARACTER_ANIMATIONS)) {
      for (const anim of anims) {
        for (const dir of DIRECTIONS) {
          const animKey = getAnimKey(charId, anim.type, dir);
          const frames: Phaser.Types.Animations.AnimationFrame[] = [];

          for (let f = 0; f < anim.frames; f++) {
            frames.push({ key: getFrameKey(charId, anim.type, dir, f) });
          }

          const isLooping =
            anim.type === "walk" || anim.type === "breathing-idle";

          let frameRate = 8;
          if (anim.type === "walk") frameRate = 10;
          else if (anim.type === "cross-punch") frameRate = 18;
          else if (anim.type === "taking-punch") frameRate = 14;
          else if (anim.type === "falling-back-death") frameRate = 10;

          this.anims.create({
            key: animKey,
            frames,
            frameRate,
            repeat: isLooping ? -1 : 0,
          });
        }
      }
    }

    this.scene.start("MainMenu");
  }
}
