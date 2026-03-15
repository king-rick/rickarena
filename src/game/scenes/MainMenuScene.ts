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

    // Show all 5 characters + 1 enemy in a row as proof sprites loaded
    const allIds = [...CHARACTERS.map((c) => c.id), "pussy"];
    const spacing = width / (allIds.length + 1);

    allIds.forEach((id, i) => {
      const sprite = this.add
        .image(spacing * (i + 1), height / 2, `${id}-south`)
        .setOrigin(0.5);

      // Scale down 128px sprites to fit nicely
      sprite.setScale(0.75);
      this.sprites.push(sprite);

      // Label
      const label = id === "pussy" ? "PUSSY" : id.toUpperCase();
      this.add
        .text(spacing * (i + 1), height / 2 + 70, label, {
          fontSize: "12px",
          fontFamily: "monospace",
          color: "#aaaaaa",
        })
        .setOrigin(0.5);
    });

    // Prompt
    this.add
      .text(width / 2, height - 60, "Phase 0 — Sprites Loaded", {
        fontSize: "14px",
        fontFamily: "monospace",
        color: "#4a90d9",
      })
      .setOrigin(0.5);
  }
}
