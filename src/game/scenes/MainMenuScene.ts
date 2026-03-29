import Phaser from "phaser";
import { CHARACTERS } from "../data/characters";
import { hudState } from "../HUDState";

export class MainMenuScene extends Phaser.Scene {
  private selectedIndex = 0;

  constructor() {
    super({ key: "MainMenu" });
  }

  create() {
    this.selectedIndex = 0;

    const { width, height } = this.cameras.main;

    // Dark background (visible behind React overlay edges if any)
    const bg = this.add.graphics();
    bg.fillStyle(0x080810, 1);
    bg.fillRect(0, 0, width, height);

    // Push menu state to React
    hudState.update({
      menuVisible: true,
      menuCharIndex: this.selectedIndex,
      hudVisible: false,
      gameOver: false,
    });

    // Register React -> Phaser actions
    hudState.registerMenuAction((action) => {
      if (action === "prev") {
        this.selectedIndex = (this.selectedIndex - 1 + CHARACTERS.length) % CHARACTERS.length;
        hudState.update({ menuCharIndex: this.selectedIndex });
      } else if (action === "next") {
        this.selectedIndex = (this.selectedIndex + 1) % CHARACTERS.length;
        hudState.update({ menuCharIndex: this.selectedIndex });
      } else if (action === "start") {
        this.startGame();
      }
    });
  }

  private startGame() {
    const charId = CHARACTERS[this.selectedIndex].id;
    hudState.update({ menuVisible: false });
    this.scene.start("Game", { characterId: charId });
  }
}
