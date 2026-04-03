import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "Boot" });
  }

  preload() {
    // Load the background loading screen first so it can be shown in PreloadScene
    this.load.image("loading-bg", "/assets/loading-screen-group-v2.png");
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

    // Set linear filtering on the loading background so it looks smooth and high-res
    const tex = this.textures.get("loading-bg");
    if (tex && tex.source && tex.source[0]) {
      tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
    }

    // Transition to the PreloadScene which shows the background while loading other assets
    this.scene.start("Preload");
  }
}
