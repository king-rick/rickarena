import Phaser from "phaser";
import { CHARACTERS } from "../data/characters";

export class MainMenuScene extends Phaser.Scene {
  private sprites: Phaser.GameObjects.Image[] = [];

  constructor() {
    super({ key: "MainMenu" });
  }

  create() {
    const { width, height } = this.cameras.main;

    // Title
    this.add
      .text(width / 2, 80, "RICKARENA", {
        fontSize: "48px",
        fontFamily: "monospace",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 130, "Survive the Pussies.", {
        fontSize: "16px",
        fontFamily: "monospace",
        color: "#888888",
      })
      .setOrigin(0.5);

    // Show the 5 playable characters
    const spacing = width / (CHARACTERS.length + 1);

    CHARACTERS.forEach((char, i) => {
      const sprite = this.add
        .image(spacing * (i + 1), height / 2, `${char.id}-south`)
        .setOrigin(0.5);

      sprite.setScale(0.75);
      this.sprites.push(sprite);

      this.add
        .text(spacing * (i + 1), height / 2 + 70, char.name.toUpperCase(), {
          fontSize: "12px",
          fontFamily: "monospace",
          color: "#aaaaaa",
        })
        .setOrigin(0.5);

      this.add
        .text(spacing * (i + 1), height / 2 + 85, char.className, {
          fontSize: "10px",
          fontFamily: "monospace",
          color: "#666666",
        })
        .setOrigin(0.5);
    });

    // Prompt
    const prompt = this.add
      .text(width / 2, height - 60, "Press ENTER or click to play", {
        fontSize: "14px",
        fontFamily: "monospace",
        color: "#4a90d9",
      })
      .setOrigin(0.5);

    // Pulse the prompt
    this.tweens.add({
      targets: prompt,
      alpha: 0.3,
      duration: 1000,
      yoyo: true,
      repeat: -1,
    });

    // Start game on any key or click
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      this.scene.start("Game", { characterId: "rick" });
    };

    if (this.input.keyboard) {
      this.input.keyboard.on("keydown", start);
    }
    this.input.on("pointerdown", start);
  }
}
