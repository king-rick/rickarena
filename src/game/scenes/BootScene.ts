import Phaser from "phaser";
import { CHARACTERS, DIRECTIONS } from "../data/characters";

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "Boot" });
  }

  preload() {
    // Load character rotation sprites
    for (const char of CHARACTERS) {
      for (const dir of DIRECTIONS) {
        this.load.image(
          `${char.id}-${dir}`,
          `/assets/sprites/${char.id}/rotations/${dir}.png`
        );
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
    this.load.on("progress", (value: number) => {
      bar.width = 300 * value;
    });
  }

  create() {
    this.scene.start("MainMenu");
  }
}
