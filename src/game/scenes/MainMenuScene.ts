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
  private ultimateText!: Phaser.GameObjects.Text;
  private statBars: { label: Phaser.GameObjects.Text; bar: Phaser.GameObjects.Graphics }[] = [];
  private arrowLeft!: Phaser.GameObjects.Text;
  private arrowRight!: Phaser.GameObjects.Text;
  private dotIndicators: Phaser.GameObjects.Graphics[] = [];

  constructor() {
    super({ key: "MainMenu" });
  }

  create() {
    this.statBars = [];
    this.dotIndicators = [];
    this.selectedIndex = 0;

    // 960 x 540
    const { width, height } = this.cameras.main;
    const cx = width / 2;
    const cy = height / 2;

    // Background
    const bg = this.add.graphics();
    bg.fillStyle(0x0a0a0f, 1);
    bg.fillRect(0, 0, width, height);

    // Title (top center)
    this.add.text(cx, 20, "RICKARENA", {
      fontSize: "28px",
      fontFamily: "Rajdhani, sans-serif",
      color: "#ffffff",
      fontStyle: "bold",
      letterSpacing: 8,
    }).setOrigin(0.5);

    this.add.text(cx, 48, "Survive the Pussies.", {
      fontSize: "12px",
      fontFamily: "Rajdhani, sans-serif",
      color: "#555555",
    }).setOrigin(0.5);

    // --- CENTER: Character name + class + sprite ---
    this.nameText = this.add.text(cx, 72, "", {
      fontSize: "34px",
      fontFamily: "Rajdhani, sans-serif",
      color: "#ffffff",
      fontStyle: "bold",
      letterSpacing: 8,
    }).setOrigin(0.5).setDepth(5);

    this.classText = this.add.text(cx, 102, "", {
      fontSize: "14px",
      fontFamily: "Rajdhani, sans-serif",
      color: "#5aabff",
      letterSpacing: 4,
    }).setOrigin(0.5).setDepth(5);

    // Sprite (dead center)
    const spriteY = cy - 15;
    this.showcase = this.add.sprite(cx, spriteY, "rick-south")
      .setScale(2.4)
      .setDepth(2);

    // Arrows flanking sprite
    this.arrowLeft = this.add.text(cx - 130, spriteY + 20, "\u25C0", {
      fontSize: "28px",
      fontFamily: "Rajdhani, sans-serif",
      color: "#5aabff",
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(3);

    this.arrowRight = this.add.text(cx + 130, spriteY + 20, "\u25B6", {
      fontSize: "28px",
      fontFamily: "Rajdhani, sans-serif",
      color: "#5aabff",
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(3);

    this.arrowLeft.on("pointerdown", () => {
      this.selectedIndex = (this.selectedIndex - 1 + CHARACTERS.length) % CHARACTERS.length;
      this.updateSelection();
    });
    this.arrowRight.on("pointerdown", () => {
      this.selectedIndex = (this.selectedIndex + 1) % CHARACTERS.length;
      this.updateSelection();
    });

    // Dot indicators below sprite
    const dotSpacing = 16;
    const dotsStartX = cx - ((CHARACTERS.length - 1) * dotSpacing) / 2;
    const dotsY = spriteY + 155;
    for (let i = 0; i < CHARACTERS.length; i++) {
      const dot = this.add.graphics().setDepth(5);
      dot.x = dotsStartX + i * dotSpacing;
      dot.y = dotsY;
      this.dotIndicators.push(dot);
    }

    // Specialty (below dots)
    this.specialtyText = this.add.text(cx, dotsY + 18, "", {
      fontSize: "12px",
      fontFamily: "Rajdhani, sans-serif",
      color: "#9988aa",
      wordWrap: { width: 260 },
      align: "center",
    }).setOrigin(0.5, 0).setDepth(5);

    // --- LEFT SIDE: Stats ---
    const leftX = cx - 280;

    this.add.text(leftX + 90, 90, "STATS", {
      fontSize: "11px",
      fontFamily: "Rajdhani, sans-serif",
      color: "#555566",
      fontStyle: "bold",
      letterSpacing: 4,
    }).setOrigin(0.5);

    const statDefs = [
      { key: "hp", label: "HP", color: 0x44bb44, max: 150 },
      { key: "damage", label: "DMG", color: 0xdd4444, max: 25 },
      { key: "speed", label: "SPD", color: 0x44aadd, max: 220 },
      { key: "stamina", label: "STA", color: 0xddaa44, max: 120 },
    ];

    const statsStartY = 115;
    const barMaxW = 130;
    const barH = 10;
    const statsBarLeft = leftX + 40;

    statDefs.forEach((stat, i) => {
      const y = statsStartY + i * 30;

      const label = this.add.text(statsBarLeft - 8, y, stat.label, {
        fontSize: "14px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#cccccc",
        fontStyle: "bold",
      }).setOrigin(1, 0.5).setDepth(2);

      const bar = this.add.graphics().setDepth(2);

      this.statBars.push({ label, bar });
    });

    // --- RIGHT SIDE: Abilities ---
    const rightX = cx + 175;

    this.add.text(rightX + 60, 90, "ABILITIES", {
      fontSize: "11px",
      fontFamily: "Rajdhani, sans-serif",
      color: "#555566",
      fontStyle: "bold",
      letterSpacing: 4,
    }).setOrigin(0.5);

    this.abilityText = this.add.text(rightX, 115, "", {
      fontSize: "13px",
      fontFamily: "Rajdhani, sans-serif",
      color: "#aaaacc",
      wordWrap: { width: 220 },
      lineSpacing: 4,
    }).setOrigin(0, 0);

    this.ultimateText = this.add.text(rightX, 175, "", {
      fontSize: "13px",
      fontFamily: "Rajdhani, sans-serif",
      color: "#aaaacc",
      wordWrap: { width: 220 },
      lineSpacing: 4,
    }).setOrigin(0, 0);

    // --- Bottom bar ---
    this.add.text(cx, height - 42, "A/D or \u2190/\u2192 to select  |  E = Map Editor", {
      fontSize: "11px",
      fontFamily: "Rajdhani, sans-serif",
      color: "#444444",
    }).setOrigin(0.5);

    const prompt = this.add.text(cx, height - 20, "ENTER TO PLAY", {
      fontSize: "22px",
      fontFamily: "Rajdhani, sans-serif",
      color: "#5aabff",
      fontStyle: "bold",
    }).setOrigin(0.5);

    this.tweens.add({
      targets: prompt,
      alpha: 0.4,
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
        } else if (event.key === "e" || event.key === "E") {
          this.scene.start("MapEditor");
        }
      });
    }

    this.updateSelection();
  }

  private updateSelection() {
    const char = CHARACTERS[this.selectedIndex];
    const { width } = this.cameras.main;
    const cx = width / 2;
    const leftX = cx - 280;
    const statsBarLeft = leftX + 40;

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
    this.abilityText.setText(`[Q] ${char.ability.name}\n${char.ability.desc}`);
    this.ultimateText.setText(`[R] ${char.ultimate.name}\n${char.ultimate.desc}`);

    // Dots
    this.dotIndicators.forEach((dot, i) => {
      dot.clear();
      if (i === this.selectedIndex) {
        dot.fillStyle(0x5aabff, 1);
        dot.fillCircle(0, 0, 4);
      } else {
        dot.fillStyle(0x333344, 1);
        dot.fillCircle(0, 0, 3);
      }
    });

    // Stat bars
    const statDefs = [
      { key: "hp" as const, max: 150, color: 0x44bb44 },
      { key: "damage" as const, max: 25, color: 0xdd4444 },
      { key: "speed" as const, max: 220, color: 0x44aadd },
      { key: "stamina" as const, max: 120, color: 0xddaa44 },
    ];
    const barMaxW = 130;
    const barH = 10;
    const statsStartY = 115;

    statDefs.forEach((stat, i) => {
      const y = statsStartY + i * 30;
      const val = char.stats[stat.key];
      const pct = Math.min(val / stat.max, 1);

      const g = this.statBars[i].bar;
      g.clear();

      g.fillStyle(0x1a1a2a, 1);
      g.fillRoundedRect(statsBarLeft, y - barH / 2, barMaxW, barH, 4);

      if (barMaxW * pct > 0) {
        g.fillStyle(stat.color, 0.9);
        g.fillRoundedRect(statsBarLeft, y - barH / 2, barMaxW * pct, barH, 4);
      }
    });
  }

  private startGame() {
    const charId = CHARACTERS[this.selectedIndex].id;
    this.scene.start("Game", { characterId: charId });
  }
}
