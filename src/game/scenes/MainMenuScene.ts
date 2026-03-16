import Phaser from "phaser";
import { CHARACTERS } from "../data/characters";

export class MainMenuScene extends Phaser.Scene {
  private selectedIndex = 0;
  private sprites: Phaser.GameObjects.Image[] = [];
  private nameTexts: Phaser.GameObjects.Text[] = [];
  private classTexts: Phaser.GameObjects.Text[] = [];
  private selector!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: "MainMenu" });
  }

  create() {
    this.sprites = [];
    this.nameTexts = [];
    this.classTexts = [];
    this.selectedIndex = 0;

    const { width, height } = this.cameras.main;

    // Title
    this.add
      .text(width / 2, 80, "RICKARENA", {
        fontSize: "48px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, 130, "Survive the Pussies.", {
        fontSize: "16px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#888888",
      })
      .setOrigin(0.5);

    // Character lineup
    const spacing = width / (CHARACTERS.length + 1);

    // Selection indicator (drawn behind sprites)
    this.selector = this.add.graphics();
    this.selector.setDepth(0);

    CHARACTERS.forEach((char, i) => {
      const x = spacing * (i + 1);
      const y = height / 2;

      const sprite = this.add
        .image(x, y, `${char.id}-south`)
        .setOrigin(0.5)
        .setScale(0.75)
        .setInteractive({ useHandCursor: true })
        .setDepth(1);

      sprite.on("pointerdown", () => {
        this.selectedIndex = i;
        this.updateSelection();
      });

      this.sprites.push(sprite);

      const nameText = this.add
        .text(x, y + 70, char.name.toUpperCase(), {
          fontSize: "12px",
          fontFamily: "Rajdhani, sans-serif",
          color: "#aaaaaa",
        })
        .setOrigin(0.5)
        .setDepth(1);
      this.nameTexts.push(nameText);

      const classText = this.add
        .text(x, y + 85, char.className, {
          fontSize: "10px",
          fontFamily: "Rajdhani, sans-serif",
          color: "#666666",
        })
        .setOrigin(0.5)
        .setDepth(1);
      this.classTexts.push(classText);
    });

    // Prompt
    const prompt = this.add
      .text(width / 2, height - 60, "Select a character · ENTER to play", {
        fontSize: "14px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#4a90d9",
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: prompt,
      alpha: 0.3,
      duration: 1000,
      yoyo: true,
      repeat: -1,
    });

    // Arrow keys / A-D to cycle, ENTER to start
    if (this.input.keyboard) {
      this.input.keyboard.on("keydown", (event: KeyboardEvent) => {
        if (event.key === "ArrowLeft" || event.key === "a") {
          this.selectedIndex =
            (this.selectedIndex - 1 + CHARACTERS.length) % CHARACTERS.length;
          this.updateSelection();
        } else if (event.key === "ArrowRight" || event.key === "d") {
          this.selectedIndex =
            (this.selectedIndex + 1) % CHARACTERS.length;
          this.updateSelection();
        } else if (event.key === "Enter") {
          this.startGame();
        }
      });
    }

    // Double-click sprite to start
    CHARACTERS.forEach((_char, i) => {
      this.sprites[i].on("pointerdown", () => {
        if (this.selectedIndex === i) {
          // Already selected, start the game
          this.startGame();
        }
      });
    });

    this.updateSelection();
  }

  private updateSelection() {
    // Highlight selected, dim others
    this.sprites.forEach((sprite, i) => {
      if (i === this.selectedIndex) {
        sprite.setScale(0.85);
        sprite.clearTint();
        this.nameTexts[i].setColor("#ffffff");
        this.classTexts[i].setColor("#aaaaaa");
      } else {
        sprite.setScale(0.65);
        sprite.setTint(0x555555);
        this.nameTexts[i].setColor("#555555");
        this.classTexts[i].setColor("#444444");
      }
    });

    // Draw selection ring
    this.selector.clear();
    const sprite = this.sprites[this.selectedIndex];
    this.selector.lineStyle(2, 0x4a90d9, 0.8);
    this.selector.strokeRoundedRect(
      sprite.x - 40,
      sprite.y - 55,
      80,
      130,
      8
    );
  }

  private startGame() {
    const charId = CHARACTERS[this.selectedIndex].id;
    this.scene.start("Game", { characterId: charId });
  }
}
