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

    // Progress bar
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;
    const bar = this.add.rectangle(width / 2, height / 2, 0, 20, 0x4a90d9);

    this.add
      .text(width / 2, height / 2 - 30, "LOADING...", {
        fontSize: "14px",
        fontFamily: "monospace",
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

          this.anims.create({
            key: animKey,
            frames,
            frameRate: anim.type === "walk" ? 10 : 8,
            repeat: anim.type === "walk" || anim.type === "breathing-idle" ? -1 : 0,
          });
        }
      }
    }

    this.scene.start("MainMenu");
  }
}
