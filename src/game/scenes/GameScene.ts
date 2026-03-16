import Phaser from "phaser";
import { Player } from "../entities/Player";
import { Enemy } from "../entities/Enemy";
import { CHARACTERS, CharacterDef } from "../data/characters";
import { BALANCE } from "../data/balance";
import { WaveManager, WaveState } from "../systems/WaveManager";
import {
  drawMap,
  drawLighting,
  drawHidingGroveCanopy,
  MAP_WIDTH,
  MAP_HEIGHT,
  MANSION,
  LIBRARY,
  GIANT_WILLOW,
  HIDING_GROVE,
} from "../map/EndicottEstate";

export class GameScene extends Phaser.Scene {
  player!: Player;
  private characterDef!: CharacterDef;
  private obstacles!: Phaser.Physics.Arcade.StaticGroup;
  private enemies!: Phaser.Physics.Arcade.Group;

  // Combat state
  private lastDamageTime = 0;
  private currency = 0;
  private kills = 0;
  private gameOver = false;
  private paused = false;
  private damageBoostActive = false;
  private baseDamage = 0;

  // Wave system
  private waveManager!: WaveManager;

  // Shop
  private shopOpen = false;
  private shopContainer!: Phaser.GameObjects.Container;

  // HUD container — scrollFactor(0), scaled 1/zoom so it renders at screen-space
  private hudContainer!: Phaser.GameObjects.Container;

  // Pause UI (inside hudContainer)
  private pauseOverlay!: Phaser.GameObjects.Graphics;
  private pauseTitle!: Phaser.GameObjects.Text;
  private pauseQuitBtn!: Phaser.GameObjects.Text;

  // HUD elements (inside hudContainer)
  private healthBar!: Phaser.GameObjects.Graphics;
  private staminaBar!: Phaser.GameObjects.Graphics;
  private burnoutText!: Phaser.GameObjects.Text;
  private currencyText!: Phaser.GameObjects.Text;
  private killText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private waveStatusText!: Phaser.GameObjects.Text;
  private waveAnnouncement!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: "Game" });
  }

  init(data: { characterId?: string }) {
    const id = data?.characterId || "rick";
    this.characterDef = CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
  }

  create() {
    this.gameOver = false;
    this.currency = 0;
    this.kills = 0;
    this.lastDamageTime = 0;

    // Draw map
    drawMap(this);
    drawHidingGroveCanopy(this);
    drawLighting(this);

    // Obstacles
    this.obstacles = this.physics.add.staticGroup();

    // Mansion
    const mansionZone = this.add
      .zone(
        MANSION.x + MANSION.width / 2,
        MANSION.y + MANSION.height / 2,
        MANSION.width,
        MANSION.height
      )
      .setOrigin(0.5);
    this.physics.add.existing(mansionZone, true);
    this.obstacles.add(mansionZone);

    // Library
    const libraryZone = this.add
      .zone(
        LIBRARY.x + LIBRARY.width / 2,
        LIBRARY.y + LIBRARY.height / 2,
        LIBRARY.width,
        LIBRARY.height
      )
      .setOrigin(0.5);
    this.physics.add.existing(libraryZone, true);
    this.obstacles.add(libraryZone);

    // Giant willow
    const willowSize = GIANT_WILLOW.radius * 1.2;
    const willowZone = this.add
      .zone(GIANT_WILLOW.x, GIANT_WILLOW.y, willowSize, willowSize)
      .setOrigin(0.5);
    this.physics.add.existing(willowZone, true);
    (willowZone.body as Phaser.Physics.Arcade.StaticBody).setCircle(
      GIANT_WILLOW.radius * 0.6
    );
    this.obstacles.add(willowZone);

    // Hiding grove trees
    for (const tree of HIDING_GROVE) {
      const treeZone = this.add
        .zone(tree.x, tree.y, tree.collisionRadius * 2, tree.collisionRadius * 2)
        .setOrigin(0.5);
      this.physics.add.existing(treeZone, true);
      (treeZone.body as Phaser.Physics.Arcade.StaticBody).setCircle(
        tree.collisionRadius
      );
      this.obstacles.add(treeZone);
    }

    // Player
    const spawnX = MAP_WIDTH / 2;
    const spawnY = MAP_HEIGHT / 2 + 300;
    const stats = this.characterDef.stats;

    this.player = new Player(this, spawnX, spawnY, this.characterDef.id, {
      speed: stats.speed,
      maxHealth: stats.hp,
      maxStamina: stats.stamina,
      health: stats.hp,
      stamina: stats.stamina,
      regen: stats.regen,
      damage: stats.damage,
    });

    // Camera
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setZoom(1.3);
    this.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);

    // World bounds
    this.physics.world.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
    this.player.body.setCollideWorldBounds(true);

    // Collisions
    this.physics.add.collider(this.player, this.obstacles);

    // Enemies group
    this.enemies = this.physics.add.group({
      runChildUpdate: true,
    });

    // Enemy-player overlap (contact damage)
    this.physics.add.overlap(
      this.player,
      this.enemies,
      this.handleEnemyContact,
      undefined,
      this
    );

    // Enemy-obstacle collision
    this.physics.add.collider(this.enemies, this.obstacles);

    // Melee attack input
    if (this.input.keyboard) {
      const space = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.SPACE
      );
      space.on("down", () => {
        if (!this.gameOver && !this.paused) this.meleeAttack();
      });
    }
    this.input.on("pointerdown", () => {
      if (!this.gameOver && !this.paused) this.meleeAttack();
    });

    // Pause input
    if (this.input.keyboard) {
      const pKey = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.ESC
      );
      pKey.on("down", () => {
        if (this.gameOver) return;
        if (this.paused) this.resumeGame();
        else this.pauseGame();
      });
    }

    // HUD container — lives in world space, tracks camera position each frame
    this.hudContainer = this.add.container(0, 0);
    this.hudContainer.setDepth(150);

    this.baseDamage = this.player.stats.damage;
    this.damageBoostActive = false;

    this.createHUD();
    this.createPauseUI();
    this.createShopUI();

    // Wave manager
    this.waveManager = new WaveManager({
      scene: this,
      enemies: this.enemies,
      playerCount: 1,
      getPlayerPos: () => ({ x: this.player.x, y: this.player.y }),
    });

    this.waveManager.onWaveStart = (wave) => {
      this.closeShop();
      // Clear damage boost from previous wave
      if (this.damageBoostActive) {
        this.player.stats.damage = this.baseDamage;
        this.damageBoostActive = false;
      }
      this.showWaveAnnouncement(wave);
    };

    this.waveManager.onIntermissionStart = () => {
      this.showIntermissionAnnouncement();
      // Open shop after "WAVE CLEAR" fades a bit
      this.time.delayedCall(1000, () => {
        if (this.waveManager.state === "intermission") {
          this.openShop();
        }
      });
    };
  }

  update(time: number, delta: number) {
    // Always track HUD to camera, even when paused/game over
    const cam = this.cameras.main;
    this.hudContainer.setPosition(cam.worldView.x, cam.worldView.y);
    this.hudContainer.setScale(1 / cam.zoom);

    if (this.gameOver || this.paused) return;

    this.player.update();
    this.waveManager.update(delta);
    this.updateHUD();
  }

  // ------- Combat -------

  private meleeAttack() {
    const cost = BALANCE.stamina.punchCost;
    if (!this.player.useStamina(cost)) return;

    this.player.playPunch(() => {
      // Damage applied when punch animation lands, not on button press
      const range = this.characterDef.stats.punchRange;
      const arcHalf = Phaser.Math.DegToRad(this.characterDef.stats.punchArc / 2);
      const attackAngle = this.getFacingAngle();
      const damage = this.player.burnedOut
        ? Math.floor(this.player.stats.damage * BALANCE.burnout.damageMultiplier)
        : this.player.stats.damage;

      this.enemies.getChildren().forEach((obj) => {
        const enemy = obj as Enemy;
        if (!enemy.active) return;

        const dist = Phaser.Math.Distance.Between(
          this.player.x,
          this.player.y,
          enemy.x,
          enemy.y
        );
        if (dist > range) return;

        const angleToEnemy = Phaser.Math.Angle.Between(
          this.player.x,
          this.player.y,
          enemy.x,
          enemy.y
        );

        let angleDiff = Math.abs(attackAngle - angleToEnemy);
        if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;

        if (angleDiff <= arcHalf) {
          const killed = enemy.takeDamage(damage);
          if (killed) {
            this.kills++;
            this.currency += BALANCE.economy.killReward[enemy.enemyType];
            this.waveManager.onEnemyKilled();
          }

          const kb = this.player.burnedOut
            ? BALANCE.punch.knockback * 0.5
            : BALANCE.punch.knockback;
          enemy.body?.setVelocity(
            Math.cos(angleToEnemy) * kb,
            Math.sin(angleToEnemy) * kb
          );
        }
      });
    });
  }

  private getFacingAngle(): number {
    switch (this.player.facing) {
      case "right":
        return 0;
      case "down":
        return Math.PI / 2;
      case "left":
        return Math.PI;
      case "up":
        return -Math.PI / 2;
    }
  }

  // ------- Damage / Game Over -------

  private handleEnemyContact: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback =
    (_player, enemyObj) => {
      if (this.gameOver) return;

      const now = this.time.now;
      if (now - this.lastDamageTime < 500) return;
      this.lastDamageTime = now;

      const enemy = enemyObj as Enemy;
      this.player.stats.health -= enemy.damage;
      enemy.playBite();

      this.cameras.main.flash(100, 255, 0, 0, false);
      this.cameras.main.shake(100, 0.005);

      if (this.player.stats.health <= 0) {
        this.player.stats.health = 0;
        this.gameOver = true; // Stop all damage immediately
        this.player.body.setVelocity(0, 0);
        this.player.playDeath(() => this.triggerGameOver());
      } else {
        this.player.playHurt();
      }
    };

  private triggerGameOver() {
    this.player.setTint(0x666666);

    this.enemies.getChildren().forEach((obj) => {
      const e = obj as Enemy;
      e.body?.setVelocity(0, 0);
    });

    const { width, height } = this.cameras.main;

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, width, height);
    overlay.setAlpha(0);
    this.hudContainer.add(overlay);

    const diedText = this.add
      .text(width / 2, height / 2 - 40, "YOU DIED", {
        fontSize: "48px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#cc3333",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.hudContainer.add(diedText);

    const waveReached = this.waveManager.wave;
    const statsText = this.add
      .text(
        width / 2,
        height / 2 + 20,
        `Wave ${waveReached}  |  ${this.kills} kills`,
        {
          fontSize: "20px",
          fontFamily: "Rajdhani, sans-serif",
          color: "#cccccc",
        }
      )
      .setOrigin(0.5)
      .setAlpha(0);
    this.hudContainer.add(statsText);

    // Fade in death screen
    this.tweens.add({
      targets: [overlay, diedText, statsText],
      alpha: 1,
      duration: 800,
      ease: "Cubic.easeIn",
      onComplete: () => {
        // Return to menu after showing stats
        this.time.delayedCall(2500, () => {
          this.scene.start("MainMenu");
        });
      },
    });
  }

  // ------- Pause -------

  private createPauseUI() {
    const { width, height } = this.cameras.main;

    this.pauseOverlay = this.add.graphics();
    this.pauseOverlay.fillStyle(0x000000, 0.6);
    this.pauseOverlay.fillRect(0, 0, width, height);
    this.pauseOverlay.setVisible(false);
    this.hudContainer.add(this.pauseOverlay);

    this.pauseTitle = this.add
      .text(width / 2, height / 2 - 40, "PAUSED", {
        fontSize: "36px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#d0c8e0",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setVisible(false);
    this.hudContainer.add(this.pauseTitle);

    this.pauseQuitBtn = this.add
      .text(width / 2, height / 2 + 20, "[ Q ]  Quit to Menu", {
        fontSize: "16px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#8a82a0",
      })
      .setOrigin(0.5)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.hudContainer.add(this.pauseQuitBtn);

    this.pauseQuitBtn.on("pointerover", () => {
      this.pauseQuitBtn.setColor("#d0c8e0");
    });
    this.pauseQuitBtn.on("pointerout", () => {
      this.pauseQuitBtn.setColor("#8a82a0");
    });
    this.pauseQuitBtn.on("pointerdown", () => {
      this.scene.start("MainMenu");
    });
  }

  private pauseGame() {
    this.paused = true;
    this.physics.pause();

    this.pauseOverlay.setVisible(true);
    this.pauseTitle.setVisible(true);
    this.pauseQuitBtn.setVisible(true);

    if (this.input.keyboard) {
      const qKey = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.Q
      );
      qKey.once("down", () => {
        if (this.paused) this.scene.start("MainMenu");
      });
    }
  }

  private resumeGame() {
    this.paused = false;
    this.physics.resume();

    this.pauseOverlay.setVisible(false);
    this.pauseTitle.setVisible(false);
    this.pauseQuitBtn.setVisible(false);

    if (this.input.keyboard) {
      this.input.keyboard.removeKey(Phaser.Input.Keyboard.KeyCodes.Q);
    }
  }

  // ------- Shop -------

  private createShopUI() {
    const { width, height } = this.cameras.main;
    this.shopContainer = this.add.container(0, 0);
    this.shopContainer.setDepth(160);
    this.shopContainer.setVisible(false);
    this.hudContainer.add(this.shopContainer);

    // Semi-transparent backdrop
    const bg = this.add.graphics();
    bg.fillStyle(0x0a0a14, 0.85);
    bg.fillRoundedRect(width / 2 - 160, height / 2 - 100, 320, 200, 12);
    bg.lineStyle(1, 0x4a4565, 0.6);
    bg.strokeRoundedRect(width / 2 - 160, height / 2 - 100, 320, 200, 12);
    this.shopContainer.add(bg);

    // Title
    const title = this.add
      .text(width / 2, height / 2 - 80, "SHOP", {
        fontSize: "22px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#e8c840",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.shopContainer.add(title);

    // Item rows
    const items = BALANCE.shop.items;
    items.forEach((item, i) => {
      const y = height / 2 - 40 + i * 40;
      const keyLabel = this.add
        .text(width / 2 - 140, y, `[${i + 1}]`, {
          fontSize: "14px",
          fontFamily: "Rajdhani, sans-serif",
          color: "#4a90d9",
          fontStyle: "bold",
        })
        .setOrigin(0, 0.5);
      this.shopContainer.add(keyLabel);

      const nameLabel = this.add
        .text(width / 2 - 100, y, item.name, {
          fontSize: "14px",
          fontFamily: "Rajdhani, sans-serif",
          color: "#d0c8e0",
        })
        .setOrigin(0, 0.5);
      this.shopContainer.add(nameLabel);

      const descLabel = this.add
        .text(width / 2 - 100, y + 14, item.desc, {
          fontSize: "10px",
          fontFamily: "Rajdhani, sans-serif",
          color: "#8a82a0",
        })
        .setOrigin(0, 0.5);
      this.shopContainer.add(descLabel);

      const priceLabel = this.add
        .text(width / 2 + 140, y, `$${item.basePrice}`, {
          fontSize: "14px",
          fontFamily: "Rajdhani, sans-serif",
          color: "#e8c840",
          fontStyle: "bold",
        })
        .setOrigin(1, 0.5);
      this.shopContainer.add(priceLabel);
    });

    // Key bindings for shop
    if (this.input.keyboard) {
      const one = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
      const two = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
      const three = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);

      one.on("down", () => { if (this.shopOpen) this.buyItem(0); });
      two.on("down", () => { if (this.shopOpen) this.buyItem(1); });
      three.on("down", () => { if (this.shopOpen) this.buyItem(2); });
    }
  }

  private getItemPrice(index: number): number {
    const item = BALANCE.shop.items[index];
    const inflation = 1 + this.waveManager.wave * BALANCE.economy.priceInflationPerWave;
    return Math.floor(item.basePrice * inflation);
  }

  private openShop() {
    this.shopOpen = true;
    this.shopContainer.setVisible(true);
    this.updateShopPrices();
  }

  private closeShop() {
    this.shopOpen = false;
    this.shopContainer.setVisible(false);
  }

  private updateShopPrices() {
    // Update price labels with inflation
    const items = BALANCE.shop.items;
    const priceLabels = this.shopContainer.list.filter(
      (obj) => obj instanceof Phaser.GameObjects.Text && (obj as Phaser.GameObjects.Text).text.startsWith("$")
    ) as Phaser.GameObjects.Text[];

    // Price labels are the ones starting with $
    let priceIdx = 0;
    for (let i = 0; i < items.length; i++) {
      const price = this.getItemPrice(i);
      if (priceLabels[priceIdx]) {
        priceLabels[priceIdx].setText(`$${price}`);
        priceLabels[priceIdx].setColor(this.currency >= price ? "#e8c840" : "#663333");
        priceIdx++;
      }
    }
  }

  private buyItem(index: number) {
    const price = this.getItemPrice(index);
    if (this.currency < price) return;

    const itemId = BALANCE.shop.items[index].id;

    switch (itemId) {
      case "heal": {
        if (this.player.stats.health >= this.player.stats.maxHealth) return;
        this.currency -= price;
        this.player.stats.health = Math.min(
          this.player.stats.maxHealth,
          this.player.stats.health + this.player.stats.maxHealth * 0.5
        );
        break;
      }
      case "fullHeal": {
        if (this.player.stats.health >= this.player.stats.maxHealth) return;
        this.currency -= price;
        this.player.stats.health = this.player.stats.maxHealth;
        break;
      }
      case "dmgBoost": {
        if (this.damageBoostActive) return;
        this.currency -= price;
        this.damageBoostActive = true;
        this.player.stats.damage = Math.floor(this.baseDamage * 1.25);
        break;
      }
    }

    this.updateShopPrices();
    this.updateHUD();

    // Flash feedback
    const { width, height } = this.cameras.main;
    const flash = this.add
      .text(width / 2, height / 2 + 80, "PURCHASED", {
        fontSize: "12px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#44cc44",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.shopContainer.add(flash);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      y: height / 2 + 65,
      duration: 800,
      onComplete: () => flash.destroy(),
    });
  }

  // ------- Wave Announcements -------

  private showWaveAnnouncement(wave: number) {
    const { width, height } = this.cameras.main;

    this.waveAnnouncement.setText(`WAVE ${wave}`);
    this.waveAnnouncement.setAlpha(1);
    this.waveAnnouncement.setScale(0.5);
    this.waveAnnouncement.setPosition(width / 2, height / 2 - 40);

    this.tweens.add({
      targets: this.waveAnnouncement,
      scaleX: 1,
      scaleY: 1,
      alpha: 0,
      duration: 1500,
      ease: "Cubic.easeOut",
    });
  }

  private showIntermissionAnnouncement() {
    const { width, height } = this.cameras.main;

    this.waveAnnouncement.setText("WAVE CLEAR");
    this.waveAnnouncement.setAlpha(1);
    this.waveAnnouncement.setScale(1);
    this.waveAnnouncement.setPosition(width / 2, height / 2 - 40);

    this.tweens.add({
      targets: this.waveAnnouncement,
      alpha: 0,
      duration: 2000,
      ease: "Cubic.easeOut",
    });
  }

  // ------- HUD -------

  private createHUD() {
    const { width, height } = this.cameras.main;

    // Health bar
    this.healthBar = this.add.graphics();
    this.hudContainer.add(this.healthBar);

    // Stamina bar
    this.staminaBar = this.add.graphics();
    this.hudContainer.add(this.staminaBar);

    // Labels
    const hpLabel = this.add.text(16, 14, "HP", {
      fontSize: "11px",
      fontFamily: "Rajdhani, sans-serif",
      color: "#9a8fb5",
      fontStyle: "bold",
    });
    this.hudContainer.add(hpLabel);

    const staLabel = this.add.text(16, 32, "STA", {
      fontSize: "11px",
      fontFamily: "Rajdhani, sans-serif",
      color: "#9a8fb5",
      fontStyle: "bold",
    });
    this.hudContainer.add(staLabel);

    // Burnout
    this.burnoutText = this.add
      .text(16, 50, "BURNED OUT", {
        fontSize: "11px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#ff4444",
        fontStyle: "bold",
      })
      .setVisible(false);
    this.hudContainer.add(this.burnoutText);

    // Currency (top right)
    this.currencyText = this.add
      .text(width - 16, 14, "$0", {
        fontSize: "16px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#e8c840",
        fontStyle: "bold",
      })
      .setOrigin(1, 0);
    this.hudContainer.add(this.currencyText);

    // Kills
    this.killText = this.add
      .text(width - 16, 34, "Kills: 0", {
        fontSize: "12px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#b0a8c0",
      })
      .setOrigin(1, 0);
    this.hudContainer.add(this.killText);

    // Wave counter (top center)
    this.waveText = this.add
      .text(width / 2, 14, "WAVE 1", {
        fontSize: "16px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#d0c8e0",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0);
    this.hudContainer.add(this.waveText);

    // Wave status
    this.waveStatusText = this.add
      .text(width / 2, 34, "", {
        fontSize: "11px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#8a82a0",
      })
      .setOrigin(0.5, 0);
    this.hudContainer.add(this.waveStatusText);

    // Wave announcement
    this.waveAnnouncement = this.add
      .text(width / 2, height / 2 - 40, "", {
        fontSize: "40px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#d0c8e0",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.hudContainer.add(this.waveAnnouncement);

    // Controls
    const controls = this.add
      .text(width / 2, height - 14, "WASD move · SPACE/CLICK punch · ESC pause", {
        fontSize: "10px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#5a5566",
      })
      .setOrigin(0.5, 1);
    this.hudContainer.add(controls);
  }

  private updateHUD() {
    const barX = 42;
    const barW = 160;
    const barH = 12;

    // Health
    this.healthBar.clear();
    this.healthBar.fillStyle(0x1a1520, 0.9);
    this.healthBar.fillRoundedRect(barX - 1, 13, barW + 2, barH + 2, 4);
    const hpPct = this.player.stats.health / this.player.stats.maxHealth;
    const hpColor =
      hpPct > 0.5 ? 0x33aa33 : hpPct > 0.25 ? 0xbbaa22 : 0xcc3333;
    if (hpPct > 0.001) {
      this.healthBar.fillStyle(hpColor, 1);
      this.healthBar.fillRoundedRect(barX, 14, barW * hpPct, barH, 4);
    }

    // Stamina
    this.staminaBar.clear();
    this.staminaBar.fillStyle(0x1a1520, 0.9);
    this.staminaBar.fillRoundedRect(barX - 1, 31, barW + 2, barH + 2, 4);
    const staPct = this.player.stats.stamina / this.player.stats.maxStamina;
    const staColor = this.player.burnedOut
      ? 0x555555
      : staPct > 0.3
        ? 0x3388bb
        : 0xbb7722;
    if (staPct > 0.001) {
      this.staminaBar.fillStyle(staColor, 1);
      this.staminaBar.fillRoundedRect(barX, 32, barW * staPct, barH, 4);
    }

    this.burnoutText.setVisible(this.player.burnedOut);
    this.currencyText.setText(`$${this.currency}`);
    this.killText.setText(`Kills: ${this.kills}`);

    // Wave HUD
    const state = this.waveManager.state;
    const wave = this.waveManager.wave;

    if (state === "pre_game") {
      this.waveText.setText("GET READY");
      const secs = this.waveManager.getPreGameTimeLeft();
      this.waveStatusText.setText(`Starting in ${secs}s`);
    } else {
      this.waveText.setText(`WAVE ${wave}`);

      if (state === "active" || state === "clearing") {
        const remaining = this.waveManager.getEnemiesRemaining();
        this.waveStatusText.setText(
          `${remaining} enem${remaining === 1 ? "y" : "ies"} remaining`
        );
      } else if (state === "intermission") {
        const secs = this.waveManager.getIntermissionTimeLeft();
        this.waveStatusText.setText(`Next wave in ${secs}s — SHOP OPEN`);
      }
    }
  }
}
