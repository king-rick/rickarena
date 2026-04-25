import Phaser from "phaser";
import { CHARACTERS } from "../data/characters";
import { hudState } from "../HUDState";

export class MainMenuScene extends Phaser.Scene {
  private selectedIndex = 0;
  private phase: "title" | "charSelect" = "title";

  constructor() {
    super({ key: "MainMenu" });
  }

  create() {
    this.selectedIndex = 0;
    this.phase = "title";

    const { width, height } = this.cameras.main;

    // Dark background
    const bg = this.add.graphics();
    bg.fillStyle(0x080810, 1);
    bg.fillRect(0, 0, width, height);

    // Show main menu title screen
    hudState.update({
      mainMenuVisible: true,
      menuVisible: false,
      menuCharIndex: this.selectedIndex,
      hudVisible: false,
      gameOver: false,
    });

    // Register main menu actions (PLAY / CONTROLS / LEADERBOARD)
    hudState.registerMainMenuAction((action) => {
      if (action === "play") {
        this.phase = "charSelect";
        hudState.update({ mainMenuVisible: false, menuVisible: true });
      }
    });

    // Register character select actions
    hudState.registerMenuAction((action) => {
      if (this.phase !== "charSelect") return;
      if (action === "prev") {
        this.selectedIndex = (this.selectedIndex - 1 + CHARACTERS.length) % CHARACTERS.length;
        hudState.update({ menuCharIndex: this.selectedIndex });
      } else if (action === "next") {
        this.selectedIndex = (this.selectedIndex + 1) % CHARACTERS.length;
        hudState.update({ menuCharIndex: this.selectedIndex });
      } else if (action === "start") {
        this.startGame();
      } else if (action === "back") {
        this.phase = "title";
        hudState.update({ menuVisible: false, mainMenuVisible: true });
      }
    });
  }

  private startGame() {
    const charId = CHARACTERS[this.selectedIndex].id;
    hudState.update({ menuVisible: false, mainMenuVisible: false });
    // Show character loading screen for 2 seconds, then start game
    hudState.update({
      loadingScreenCharId: charId,
      loadingScreenVisible: true,
    });
    this.time.delayedCall(2000, () => {
      hudState.update({ loadingScreenVisible: false });
      this.scene.start("Game", { characterId: charId });
    });
  }
}
