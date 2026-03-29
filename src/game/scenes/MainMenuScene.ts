import Phaser from "phaser";
import { CHARACTERS, CharacterDef } from "../data/characters";
import { getAnimKey } from "../data/animations";

export class MainMenuScene extends Phaser.Scene {
  private selectedIndex = 0;
  private showcase!: Phaser.GameObjects.Sprite;
  private nameText!: Phaser.GameObjects.Text;
  private classText!: Phaser.GameObjects.Text;
  private specialtyText!: Phaser.GameObjects.Text;
  private abilityText!: Phaser.GameObjects.Text;
  private arrowLeft!: Phaser.GameObjects.Text;
  private arrowRight!: Phaser.GameObjects.Text;
  private dotIndicators: Phaser.GameObjects.Graphics[] = [];

  constructor() {
    super({ key: "MainMenu" });
  }

  create() {
    this.dotIndicators = [];
    this.selectedIndex = 0;

    const { width, height } = this.cameras.main;
    const cx = width / 2;
    const cy = height / 2;

    // Background
    const bg = this.add.graphics();
    bg.fillStyle(0x080810, 1);
    bg.fillRect(0, 0, width, height);

    // Subtle vignette
    const vignette = this.add.graphics();
    vignette.fillStyle(0x000000, 0.3);
    vignette.fillRect(0, 0, width, height);
    vignette.fillStyle(0x080810, 0);

    // Title
    this.add.text(cx, 48, "RICKARENA", {
      fontSize: "52px",
      fontFamily: "HorrorPixel, monospace",
      color: "#ff2244",
      letterSpacing: 20,
    }).setOrigin(0.5);

    // Subtitle
    this.add.text(cx, 100, "CHOOSE YOUR FIGHTER", {
      fontSize: "16px",
      fontFamily: "HorrorPixel, monospace",
      color: "#553344",
      letterSpacing: 8,
    }).setOrigin(0.5);

    // Center panel frame (9-slice horror panel behind the character)
    const panelW = 480;
    const panelH = 520;
    const panelImg = this.add.nineslice(
      cx, cy + 20,
      "ui-horror-panel",
      undefined,
      panelW, panelH,
      20, 20, 20, 20
    ).setOrigin(0.5).setAlpha(0.7);

    // Character name (large, centered)
    this.nameText = this.add.text(cx, 160, "", {
      fontSize: "56px",
      fontFamily: "HorrorPixel, monospace",
      color: "#ffffff",
      letterSpacing: 10,
    }).setOrigin(0.5).setDepth(5);

    // Class name
    this.classText = this.add.text(cx, 220, "", {
      fontSize: "20px",
      fontFamily: "HorrorPixel, monospace",
      color: "#ff4466",
      letterSpacing: 6,
    }).setOrigin(0.5).setDepth(5);

    // Sprite (dead center)
    const spriteY = cy + 10;
    this.showcase = this.add.sprite(cx, spriteY, "rick-south")
      .setScale(4.8)
      .setDepth(2);

    // Arrows flanking sprite
    this.arrowLeft = this.add.text(cx - 220, spriteY + 20, "\u25C0", {
      fontSize: "48px",
      fontFamily: "HorrorPixel, monospace",
      color: "#ff4466",
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(3);

    this.arrowRight = this.add.text(cx + 220, spriteY + 20, "\u25B6", {
      fontSize: "48px",
      fontFamily: "HorrorPixel, monospace",
      color: "#ff4466",
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(3);

    this.arrowLeft.on("pointerdown", () => {
      this.selectedIndex = (this.selectedIndex - 1 + CHARACTERS.length) % CHARACTERS.length;
      this.updateSelection();
    });
    this.arrowRight.on("pointerdown", () => {
      this.selectedIndex = (this.selectedIndex + 1) % CHARACTERS.length;
      this.updateSelection();
    });

    // Hover effects
    [this.arrowLeft, this.arrowRight].forEach((arrow) => {
      arrow.on("pointerover", () => arrow.setColor("#ff6688"));
      arrow.on("pointerout", () => arrow.setColor("#ff4466"));
    });

    // Dot indicators below sprite
    const dotSpacing = 28;
    const dotsStartX = cx - ((CHARACTERS.length - 1) * dotSpacing) / 2;
    const dotsY = spriteY + 280;
    for (let i = 0; i < CHARACTERS.length; i++) {
      const dot = this.add.graphics().setDepth(5);
      dot.x = dotsStartX + i * dotSpacing;
      dot.y = dotsY;
      this.dotIndicators.push(dot);
    }

    // Specialty text (below dots)
    this.specialtyText = this.add.text(cx, dotsY + 36, "", {
      fontSize: "16px",
      fontFamily: "HorrorPixel, monospace",
      color: "#888899",
      wordWrap: { width: 440 },
      align: "center",
    }).setOrigin(0.5, 0).setDepth(5);

    // Ability text (below specialty)
    this.abilityText = this.add.text(cx, dotsY + 80, "", {
      fontSize: "15px",
      fontFamily: "HorrorPixel, monospace",
      color: "#aa88bb",
      wordWrap: { width: 440 },
      align: "center",
      lineSpacing: 6,
    }).setOrigin(0.5, 0).setDepth(5);

    // Bottom controls
    this.add.text(cx, height - 80, "A/D  or  \u2190/\u2192  to select", {
      fontSize: "14px",
      fontFamily: "HorrorPixel, monospace",
      color: "#333344",
    }).setOrigin(0.5);

    const prompt = this.add.text(cx, height - 44, "ENTER TO PLAY", {
      fontSize: "28px",
      fontFamily: "HorrorPixel, monospace",
      color: "#ff2244",
    }).setOrigin(0.5);

    this.tweens.add({
      targets: prompt,
      alpha: 0.3,
      duration: 1200,
      yoyo: true,
      repeat: -1,
    });

    // Input
    if (this.input.keyboard) {
      this.input.keyboard.on("keydown", (event: KeyboardEvent) => {
        if (event.key === "ArrowLeft" || event.key === "a") {
          this.selectedIndex = (this.selectedIndex - 1 + CHARACTERS.length) % CHARACTERS.length;
          this.updateSelection();
        } else if (event.key === "ArrowRight" || event.key === "d") {
          this.selectedIndex = (this.selectedIndex + 1) % CHARACTERS.length;
          this.updateSelection();
        } else if (event.key === "Enter") {
          this.startGame();
        }
      });
    }

    this.updateSelection();
  }

  private updateSelection() {
    const char = CHARACTERS[this.selectedIndex];

    // Showcase sprite
    const animKey = getAnimKey(char.id, "breathing-idle", "south");
    if (this.anims.exists(animKey)) {
      this.showcase.play(animKey);
    } else {
      this.showcase.setTexture(`${char.id}-south`);
    }

    // Text
    this.nameText.setText(char.name.toUpperCase());
    this.classText.setText(char.className.toUpperCase());
    this.specialtyText.setText(char.specialtyDesc);
    this.abilityText.setText(`[R]  ${char.ability.name}\n${char.ability.desc}`);

    // Dots
    this.dotIndicators.forEach((dot, i) => {
      dot.clear();
      if (i === this.selectedIndex) {
        dot.fillStyle(0xff2244, 1);
        dot.fillCircle(0, 0, 7);
      } else {
        dot.fillStyle(0x333344, 1);
        dot.fillCircle(0, 0, 5);
      }
    });
  }

  private startGame() {
    const charId = CHARACTERS[this.selectedIndex].id;
    this.scene.start("Game", { characterId: charId });
  }
}
