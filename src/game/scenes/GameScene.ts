import Phaser from "phaser";
import { Player } from "../entities/Player";
import { Enemy, EnemyType } from "../entities/Enemy";
import { CHARACTERS, CharacterDef } from "../data/characters";
import { BALANCE } from "../data/balance";
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
  GATES,
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

  // HUD
  private healthBar!: Phaser.GameObjects.Graphics;
  private staminaBar!: Phaser.GameObjects.Graphics;
  private burnoutText!: Phaser.GameObjects.Text;
  private currencyText!: Phaser.GameObjects.Text;
  private killText!: Phaser.GameObjects.Text;

  // Spawning (temporary — replaced by WaveManager in Phase 3)
  private spawnTimer = 0;
  private spawnInterval = 2000;
  private enemiesSpawned = 0;
  private maxEnemies = 30;

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
    this.spawnTimer = 0;
    this.enemiesSpawned = 0;

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
    this.cameras.main.setZoom(1);
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
        if (!this.gameOver) this.meleeAttack();
      });
    }
    this.input.on("pointerdown", () => {
      if (!this.gameOver) this.meleeAttack();
    });

    // HUD
    this.createHUD();
  }

  update(time: number, delta: number) {
    if (this.gameOver) return;

    this.player.update();
    this.updateHUD();

    // Spawn enemies from gates (temporary system for Phase 2)
    this.spawnTimer += delta;
    if (
      this.spawnTimer >= this.spawnInterval &&
      this.enemiesSpawned < this.maxEnemies
    ) {
      this.spawnTimer = 0;
      this.spawnEnemy();
    }
  }

  private spawnEnemy() {
    // Pick a random gate
    const gate = GATES[Math.floor(Math.random() * GATES.length)];
    // Offset spawn slightly so they don't all stack
    const ox = (Math.random() - 0.5) * 200;
    const oy = (Math.random() - 0.5) * 200;

    const enemy = new Enemy(
      this,
      gate.x + ox,
      gate.y + oy,
      "basic",
      1
    );
    enemy.body.setCollideWorldBounds(true);
    this.enemies.add(enemy);
    this.enemiesSpawned++;
  }

  private meleeAttack() {
    const cost = BALANCE.stamina.punchCost;
    if (!this.player.useStamina(cost)) {
      // No stamina — fizzled swing
      this.showAttackArc(this.getFacingAngle(), 40, false);
      return;
    }

    const range = BALANCE.punch.range;
    const arcHalf = Phaser.Math.DegToRad(BALANCE.punch.arc / 2);
    const attackAngle = this.getFacingAngle();
    const damage = this.player.burnedOut
      ? Math.floor(this.player.stats.damage * BALANCE.burnout.damageMultiplier)
      : this.player.stats.damage;

    let hitCount = 0;

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
        }
        hitCount++;

        // Knockback
        const kb = this.player.burnedOut
          ? BALANCE.punch.knockback * 0.5
          : BALANCE.punch.knockback;
        enemy.body?.setVelocity(
          Math.cos(angleToEnemy) * kb,
          Math.sin(angleToEnemy) * kb
        );
      }
    });

    this.showAttackArc(attackAngle, range, hitCount > 0);
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

  private showAttackArc(angle: number, range: number, hit: boolean) {
    const g = this.add.graphics();
    g.lineStyle(2, hit ? 0xffaa00 : 0x888888, 0.6);

    const arcHalf = Math.PI / 4;
    g.beginPath();
    g.moveTo(this.player.x, this.player.y);
    g.arc(
      this.player.x,
      this.player.y,
      range,
      angle - arcHalf,
      angle + arcHalf,
      false
    );
    g.closePath();
    g.strokePath();

    if (hit) {
      g.fillStyle(0xffaa00, 0.15);
      g.beginPath();
      g.moveTo(this.player.x, this.player.y);
      g.arc(
        this.player.x,
        this.player.y,
        range,
        angle - arcHalf,
        angle + arcHalf,
        false
      );
      g.closePath();
      g.fillPath();
    }

    this.time.delayedCall(100, () => g.destroy());
  }

  private handleEnemyContact: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback =
    (_player, enemyObj) => {
      if (this.gameOver) return;

      const now = this.time.now;
      if (now - this.lastDamageTime < 500) return;
      this.lastDamageTime = now;

      const enemy = enemyObj as Enemy;
      this.player.stats.health -= enemy.damage;

      // Screen flash + shake
      this.cameras.main.flash(100, 255, 0, 0, false);
      this.cameras.main.shake(100, 0.005);

      if (this.player.stats.health <= 0) {
        this.player.stats.health = 0;
        this.triggerGameOver();
      }
    };

  private triggerGameOver() {
    this.gameOver = true;
    this.player.body.setVelocity(0, 0);
    this.player.setTint(0x666666);

    // Freeze enemies
    this.enemies.getChildren().forEach((obj) => {
      const e = obj as Enemy;
      e.body?.setVelocity(0, 0);
    });

    const { width, height } = this.cameras.main;

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, width, height);
    overlay.setScrollFactor(0);
    overlay.setDepth(200);

    this.add
      .text(width / 2, height / 2 - 60, "YOU DIED", {
        fontSize: "48px",
        fontFamily: "monospace",
        color: "#cc3333",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(201);

    this.add
      .text(width / 2, height / 2 + 10, `${this.kills} kills  |  $${this.currency}`, {
        fontSize: "20px",
        fontFamily: "monospace",
        color: "#cccccc",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(201);

    this.add
      .text(width / 2, height / 2 + 50, "R — retry  |  Q — menu", {
        fontSize: "14px",
        fontFamily: "monospace",
        color: "#888888",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(201);

    if (this.input.keyboard) {
      const rKey = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.R
      );
      rKey.once("down", () => {
        this.scene.restart({ characterId: this.characterDef.id });
      });

      const qKey = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.Q
      );
      qKey.once("down", () => {
        this.scene.start("MainMenu");
      });
    }
  }

  private createHUD() {
    const depth = 150;
    const { width, height } = this.cameras.main;

    // Health bar
    this.healthBar = this.add.graphics();
    this.healthBar.setScrollFactor(0).setDepth(depth);

    // Stamina bar
    this.staminaBar = this.add.graphics();
    this.staminaBar.setScrollFactor(0).setDepth(depth);

    // Labels
    this.add
      .text(16, 14, "HP", {
        fontSize: "11px",
        fontFamily: "monospace",
        color: "#9a8fb5",
        fontStyle: "bold",
      })
      .setScrollFactor(0)
      .setDepth(depth);

    this.add
      .text(16, 32, "STA", {
        fontSize: "11px",
        fontFamily: "monospace",
        color: "#9a8fb5",
        fontStyle: "bold",
      })
      .setScrollFactor(0)
      .setDepth(depth);

    // Burnout
    this.burnoutText = this.add
      .text(16, 50, "BURNED OUT", {
        fontSize: "11px",
        fontFamily: "monospace",
        color: "#ff4444",
        fontStyle: "bold",
      })
      .setScrollFactor(0)
      .setDepth(depth)
      .setVisible(false);

    // Currency (top right)
    this.currencyText = this.add
      .text(width - 16, 14, "$0", {
        fontSize: "16px",
        fontFamily: "monospace",
        color: "#e8c840",
        fontStyle: "bold",
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(depth);

    // Kills
    this.killText = this.add
      .text(width - 16, 34, "Kills: 0", {
        fontSize: "12px",
        fontFamily: "monospace",
        color: "#b0a8c0",
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(depth);

    // Controls
    this.add
      .text(width / 2, height - 14, "WASD move · SPACE/CLICK punch · R retry", {
        fontSize: "10px",
        fontFamily: "monospace",
        color: "#5a5566",
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(depth);
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
  }
}
