import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "Boot" });
  }

  preload() {
    // Nothing to preload — all assets are loaded in PreloadScene
  }

  async create() {
    // Ensure HorrorPixel font is loaded before any scene tries to use it
    try {
      await Promise.all([
        document.fonts.load("16px HorrorPixel"),
        document.fonts.load("16px ChainsawCarnage"),
        document.fonts.load("16px Special Elite"),
      ]);
    } catch {
      // Fonts may already be loaded via CSS, continue regardless
    }

    // Show the React intro screen immediately while assets load in PreloadScene
    const { hudState } = await import("../HUDState");
    hudState.update({ mainMenuVisible: true });

    // Transition to the PreloadScene which loads assets in the background
    this.scene.start("Preload");
  }
}
