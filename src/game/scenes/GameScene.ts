import Phaser from "phaser";
import { Player } from "../entities/Player";
import { Enemy } from "../entities/Enemy";
import { Projectile, ensureBulletTexture } from "../entities/Projectile";
import { Trap, TrapType, ensureTrapTextures } from "../entities/Trap";
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
  TREES,
} from "../map/EndicottEstate";

export class GameScene extends Phaser.Scene {
  player!: Player;
  private characterDef!: CharacterDef;
  private obstacles!: Phaser.Physics.Arcade.StaticGroup;
  private enemies!: Phaser.Physics.Arcade.Group;

  // Blood splats (tracked for wave-based cleanup)
  bloodSplats: { gfx: Phaser.GameObjects.Graphics; spawnWave: number }[] = [];

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

  // Weapon state
  private equippedWeapon: string | null = null; // null = fists
  private ammo = 0;
  private maxAmmo = 0;
  private lastFireTime = 0;
  private fireHeld = false;
  private projectiles!: Phaser.Physics.Arcade.Group;

  // Trap state
  private trapInventory: Map<TrapType, number> = new Map();
  private selectedTrapIndex = 0; // cycles through available trap types
  private readonly trapTypes: TrapType[] = ["spikes", "barricade", "landmine"];
  private traps!: Phaser.Physics.Arcade.Group;
  private barricades!: Phaser.Physics.Arcade.StaticGroup;

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
  private weaponText!: Phaser.GameObjects.Text;
  private weaponIcon!: Phaser.GameObjects.Image;
  private ammoText!: Phaser.GameObjects.Text;
  private trapText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: "Game" });
  }

  init(data: { characterId?: string }) {
    const id = data?.characterId || "rick";
    this.characterDef = CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
  }

  shutdown() {
    this.sound.stopAll();
  }

  create() {
    this.gameOver = false;
    this.currency = 0;
    this.kills = 0;
    this.lastDamageTime = 0;
    this.equippedWeapon = null;
    this.ammo = 0;
    this.fireHeld = false;
    this.bloodSplats = [];

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

    // Willow trees (scattered around the estate)
    for (const tree of TREES) {
      const trunkRadius = tree.size * 0.15; // trunk collision, not full canopy
      const zone = this.add
        .zone(tree.x, tree.y, trunkRadius * 2, trunkRadius * 2)
        .setOrigin(0.5);
      this.physics.add.existing(zone, true);
      (zone.body as Phaser.Physics.Arcade.StaticBody).setCircle(trunkRadius);
      this.obstacles.add(zone);
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

    // Enemy-player collision (physical barrier + contact damage)
    // Collider keeps enemies from walking through the player —
    // they push up against you but can't enter your space
    this.physics.add.collider(
      this.player,
      this.enemies,
      this.handleEnemyContact,
      undefined,
      this
    );

    // Enemy-obstacle collision
    this.physics.add.collider(this.enemies, this.obstacles);

    // Enemy-enemy collision so they spread out instead of stacking
    this.physics.add.collider(this.enemies, this.enemies);

    // Projectiles
    ensureBulletTexture(this);
    this.projectiles = this.physics.add.group();

    // Projectile-enemy overlap
    this.physics.add.overlap(
      this.projectiles,
      this.enemies,
      this.handleProjectileHit,
      undefined,
      this
    );

    // Projectile-obstacle collision (bullets stop on walls)
    this.physics.add.collider(this.projectiles, this.obstacles, (proj) => {
      (proj as Projectile).destroy();
    });

    // Traps
    ensureTrapTextures(this);
    this.trapInventory = new Map();
    this.traps = this.physics.add.group(); // spikes + landmines (overlap with enemies)
    this.barricades = this.physics.add.staticGroup(); // barricades (collide with enemies)

    // Spike/landmine trigger on enemy overlap
    this.physics.add.overlap(
      this.enemies,
      this.traps,
      this.handleTrapTrigger,
      undefined,
      this
    );

    // Barricades block enemies and take damage over time
    this.physics.add.collider(
      this.enemies,
      this.barricades,
      this.handleBarricadeHit,
      undefined,
      this
    );

    // Player can't walk through barricades
    this.physics.add.collider(this.player, this.barricades);

    // Melee attack input (SPACE)
    if (this.input.keyboard) {
      const space = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.SPACE
      );
      space.on("down", () => {
        if (!this.gameOver && !this.paused && !this.shopOpen) this.meleeAttack();
      });

      // Fire weapon (F key)
      const fKey = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.F
      );
      fKey.on("down", () => {
        this.fireHeld = true;
        if (!this.gameOver && !this.paused && !this.shopOpen) this.fireWeapon();
      });
      fKey.on("up", () => { this.fireHeld = false; });

      // Place trap (T key)
      const tKey = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.T
      );
      tKey.on("down", () => {
        if (!this.gameOver && !this.paused && !this.shopOpen) this.placeTrap();
      });

      // Select trap type directly (8=spikes, 9=barricade, 0=landmine)
      // These keys also buy in shop — when shop is closed, they select trap
      const trapKeys = [
        { code: Phaser.Input.Keyboard.KeyCodes.EIGHT, index: 0 },
        { code: Phaser.Input.Keyboard.KeyCodes.NINE, index: 1 },
        { code: Phaser.Input.Keyboard.KeyCodes.ZERO, index: 2 },
      ];
      trapKeys.forEach(({ code, index }) => {
        const key = this.input.keyboard!.addKey(code);
        key.on("down", () => {
          if (this.gameOver || this.paused || this.shopOpen) return;
          const type = this.trapTypes[index];
          const count = this.trapInventory.get(type) ?? 0;
          if (count > 0) {
            this.selectedTrapIndex = index;
            const name = BALANCE.traps[type].name;
            this.showWeaponMessage(`${name.toUpperCase()} SELECTED`, "#dddd44");
          }
        });
      });
    }
    // Right-click to fire weapon
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.gameOver || this.paused || this.shopOpen) return;
      if (pointer.rightButtonDown()) {
        this.fireHeld = true;
        this.fireWeapon();
      } else {
        this.meleeAttack();
      }
    });
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonReleased()) {
        this.fireHeld = false;
      }
    });

    // Pause input
    if (this.input.keyboard) {
      const pKey = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.ESC
      );
      pKey.on("down", () => {
        if (this.gameOver) return;
        if (this.shopOpen) { this.closeShop(); return; }
        if (this.paused) this.resumeGame();
        else this.pauseGame();
      });

      // B key to toggle shop (open during intermission, close anytime)
      const bKey = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.B
      );
      bKey.on("down", () => {
        if (this.gameOver || this.paused) return;
        if (this.shopOpen) {
          this.closeShop();
        } else if (this.waveManager.state === "intermission" || this.waveManager.state === "pre_game") {
          this.openShop();
        }
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

    // Ambient background loop
    if (this.cache.audio.exists("sfx-ambient-birds")) {
      this.sound.play("sfx-ambient-birds", { volume: 0.15, loop: true });
    }

    this.waveManager.onWaveStart = (wave) => {
      this.closeShop();
      // Clear damage boost from previous wave
      if (this.damageBoostActive) {
        this.player.stats.damage = this.baseDamage;
        this.damageBoostActive = false;
      }
      // Fade and remove blood splats from 3+ waves ago
      this.bloodSplats = this.bloodSplats.filter((b) => {
        if (wave - b.spawnWave >= 3) {
          this.tweens.add({
            targets: b.gfx,
            alpha: 0,
            duration: 1000,
            onComplete: () => b.gfx.destroy(),
          });
          return false;
        }
        return true;
      });
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

    // Hold-to-fire: only for auto weapons (SMG). Semi-auto fires on press only.
    if (this.fireHeld && !this.shopOpen && this.equippedWeapon) {
      const wDef = BALANCE.weapons[this.equippedWeapon as keyof typeof BALANCE.weapons];
      if (wDef?.auto) this.fireWeapon();
    }

    this.updateHUD();
  }

  // ------- Audio Helpers -------

  private lastPunchSfx = 0;
  private lastDeathSfx = 0;
  private lastBiteSfx = 0;

  private playSound(key: string, volume = 0.5) {
    this.sound.play(key, { volume });
  }

  private playRandomPunch() {
    const now = this.time.now;
    if (now - this.lastPunchSfx < 300) return; // max ~3 per second
    this.lastPunchSfx = now;
    const keys = ["sfx-punch1", "sfx-punch2", "sfx-punch3"];
    this.playSound(keys[Math.floor(Math.random() * keys.length)], 0.4);
  }

  private playRandomEnemyDeath() {
    const now = this.time.now;
    if (now - this.lastDeathSfx < 600) return; // max ~1.5 per second
    this.lastDeathSfx = now;
    // Only play ~40% of the time even when off cooldown
    if (Math.random() > 0.4) return;
    const keys = ["sfx-enemy-death1", "sfx-enemy-death2", "sfx-enemy-death3", "sfx-enemy-death4"];
    this.playSound(keys[Math.floor(Math.random() * keys.length)], 0.5);
  }

  private playBiteSound() {
    const now = this.time.now;
    if (now - this.lastBiteSfx < 800) return; // max ~1 per second
    this.lastBiteSfx = now;
    const biteKey = Math.random() < 0.5 ? "sfx-bite" : "sfx-zombie-bite";
    this.playSound(biteKey, 0.3);
  }

  // ------- Combat -------

  private meleeAttack() {
    // Fist specialists (Rick) use less stamina on melee
    const baseCost = BALANCE.stamina.punchCost;
    const cost = this.characterDef.weaponSpecialty === "Fists"
      ? Math.floor(baseCost * 0.5) // 50% stamina cost
      : baseCost;
    if (!this.player.useStamina(cost)) return;

    this.player.playPunch(() => {
      // Damage applied when punch animation lands, not on button press
      const range = this.characterDef.stats.punchRange;
      const arcHalf = Phaser.Math.DegToRad(this.characterDef.stats.punchArc / 2);
      const attackAngle = this.getFacingAngle();
      const damage = this.player.burnedOut
        ? Math.floor(this.player.stats.damage * BALANCE.burnout.damageMultiplier)
        : this.player.stats.damage;

      let hitAny = false;
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
          hitAny = true;
          let finalDmg = damage;
          if (this.rollCrit("fists", 0)) { // distance 0 = melee range
            finalDmg = Math.floor(finalDmg * BALANCE.crit.damageMultiplier);
            this.showCritEffect(enemy.x, enemy.y);
          }
          const killed = enemy.takeDamage(finalDmg);
          if (killed) {
            this.kills++;
            this.currency += BALANCE.economy.killReward[enemy.enemyType];
            this.waveManager.onEnemyKilled();
            this.playRandomEnemyDeath();
          }

          let kb = this.player.burnedOut
            ? BALANCE.punch.knockback * 0.5
            : BALANCE.punch.knockback;
          // Fast enemies are lighter — punch sends them flying
          if (enemy.enemyType === "fast") kb *= 1.8;
          enemy.body?.setVelocity(
            Math.cos(angleToEnemy) * kb,
            Math.sin(angleToEnemy) * kb
          );
        }
      });
      if (hitAny) {
        this.playRandomPunch();
      } else {
        // Missed punch — whoosh + grunt
        this.playSound("sfx-whoosh", 0.3);
        if (Math.random() < 0.4) this.playSound("sfx-grunt", 0.25);
      }
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

  private fireWeapon() {
    if (!this.equippedWeapon) return;
    if (this.ammo <= 0) {
      this.equippedWeapon = null;
      return;
    }

    const weaponDef = BALANCE.weapons[this.equippedWeapon as keyof typeof BALANCE.weapons];
    if (!weaponDef) return;

    const now = this.time.now;
    if (now - this.lastFireTime < weaponDef.fireRate) return;
    this.lastFireTime = now;

    const angle = this.getFacingAngle();
    const isGeneralist = this.characterDef.weaponSpecialty === "Generalist";
    const isProficient = !isGeneralist && this.characterDef.weaponSpecialty === weaponDef.proficiency;
    const dmgMult = isProficient ? BALANCE.proficiencyBonus.damageMultiplier
      : isGeneralist ? BALANCE.proficiencyBonus.generalistMultiplier
      : 1;

    for (let i = 0; i < weaponDef.pellets; i++) {
      const spreadRad = Phaser.Math.DegToRad(weaponDef.spread);
      const pelletAngle = angle + (Math.random() - 0.5) * spreadRad;

      const proj = new Projectile(
        this,
        this.player.x,
        this.player.y,
        pelletAngle,
        weaponDef.speed,
        Math.floor(weaponDef.damage * dmgMult),
        weaponDef.range,
        weaponDef.dropoff
      );
      this.projectiles.add(proj, true); // add to scene + group
      proj.launch(); // set velocity after body exists
    }

    this.ammo--;

    // Weapon fire sound
    const sfxMap: Record<string, string> = {
      pistol: "sfx-pistol",
      shotgun: "sfx-shotgun",
      smg: "sfx-smg",
    };
    const sfxKey = sfxMap[this.equippedWeapon!];
    if (sfxKey) this.playSound(sfxKey, this.equippedWeapon === "smg" ? 0.2 : 0.35);

    // Muzzle flash
    const flashDist = 20;
    const flash = this.add.circle(
      this.player.x + Math.cos(angle) * flashDist,
      this.player.y + Math.sin(angle) * flashDist,
      6,
      0xffdd44,
      0.8
    );
    flash.setDepth(60);
    this.time.delayedCall(50, () => flash.destroy());

    if (this.ammo <= 0) {
      this.equippedWeapon = null;
      this.playSound("sfx-dryfire", 0.4);
      this.showWeaponMessage("OUT OF AMMO", "#cc3333");
    }
  }

  private showWeaponMessage(msg: string, color: string) {
    const cam = this.cameras.main;
    const txt = this.add.text(
      this.player.x, this.player.y - 40, msg,
      { fontFamily: "Rajdhani, sans-serif", fontSize: "12px", color, fontStyle: "bold" }
    ).setDepth(100).setOrigin(0.5);

    this.tweens.add({
      targets: txt,
      y: this.player.y - 70,
      alpha: 0,
      duration: 800,
      onComplete: () => txt.destroy(),
    });
  }

  // ------- Traps -------

  private cycleTrap() {
    // Find next trap type that has inventory
    const startIndex = this.selectedTrapIndex;
    for (let i = 1; i <= this.trapTypes.length; i++) {
      const idx = (startIndex + i) % this.trapTypes.length;
      const count = this.trapInventory.get(this.trapTypes[idx]) ?? 0;
      if (count > 0) {
        this.selectedTrapIndex = idx;
        const name = BALANCE.traps[this.trapTypes[idx]].name;
        this.showWeaponMessage(`${name.toUpperCase()} SELECTED`, "#dddd44");
        return;
      }
    }
    this.showWeaponMessage("NO TRAPS", "#cc3333");
  }

  private placeTrap() {
    // Use currently selected trap type
    const trapType = this.trapTypes[this.selectedTrapIndex];
    const count = this.trapInventory.get(trapType) ?? 0;
    if (count <= 0) {
      // Try to auto-cycle to one that has stock
      this.cycleTrap();
      return;
    }

    // Place in front of player based on facing direction
    const angle = this.getFacingAngle();
    const placeDist = 40;
    const placeX = this.player.x + Math.cos(angle) * placeDist;
    const placeY = this.player.y + Math.sin(angle) * placeDist;

    const trap = new Trap(this, placeX, placeY, trapType);

    if (trapType === "barricade") {
      this.barricades.add(trap, true);
      // Static body needs manual refresh
      (trap.body as unknown as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
    } else {
      this.traps.add(trap, true);
    }
    trap.init();

    // Consume from inventory
    const remaining = (this.trapInventory.get(trapType) ?? 1) - 1;
    if (remaining <= 0) {
      this.trapInventory.delete(trapType);
    } else {
      this.trapInventory.set(trapType, remaining);
    }

    this.playSound("sfx-trap-place", 0.4);
    this.showWeaponMessage(`${BALANCE.traps[trapType].name.toUpperCase()} PLACED`, "#44dd44");
  }

  private handleTrapTrigger: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback =
    (enemyObj, trapObj) => {
      const enemy = enemyObj as Enemy;
      const trap = trapObj as Trap;
      if (!enemy.active || !trap.active) return;

      const shouldRemove = trap.trigger(enemy, this);
      if (trap.trapType === "landmine" && shouldRemove) {
        this.playSound("sfx-explosion", 0.5);
      }
      if (shouldRemove) {
        trap.destroy();
      }

      // Track kills from traps
      if (!enemy.active) {
        this.kills++;
        this.currency += BALANCE.economy.killReward[enemy.enemyType];
        this.waveManager.onEnemyKilled();
        this.playRandomEnemyDeath();
      }
    };

  private lastBarricadeHitTime = 0;
  private handleBarricadeHit: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback =
    (enemyObj, barricadeObj) => {
      const enemy = enemyObj as Enemy;
      const barricade = barricadeObj as Trap;
      if (!enemy.active || !barricade.active) return;

      // Enemies damage barricades on contact (throttled)
      const now = this.time.now;
      if (now - this.lastBarricadeHitTime < 500) return;
      this.lastBarricadeHitTime = now;

      barricade.takeDamage(enemy.damage);
    };

  private rollCrit(weaponKey: string, distanceRatio: number): boolean {
    const charCrit = this.characterDef.stats.critChance;
    const weaponCrit = BALANCE.crit.weaponCrit[weaponKey as keyof typeof BALANCE.crit.weaponCrit] ?? 0;
    const isGeneralist = this.characterDef.weaponSpecialty === "Generalist";
    const isProficient = !isGeneralist && this.characterDef.weaponSpecialty ===
      (BALANCE.weapons[weaponKey as keyof typeof BALANCE.weapons] as any)?.proficiency;
    const profCrit = isProficient ? BALANCE.proficiencyBonus.critBonus
      : isGeneralist ? BALANCE.proficiencyBonus.generalistCritBonus
      : 0;
    // Closer = higher crit chance (distanceRatio 0 = point blank, 1 = max range)
    const distCrit = BALANCE.crit.closeCritBonus * (1 - distanceRatio);

    const totalCrit = charCrit + weaponCrit + profCrit + distCrit;
    return Math.random() < totalCrit;
  }

  private showCritEffect(x: number, y: number) {
    const txt = this.add.text(x, y - 20, "CRIT!", {
      fontFamily: "Rajdhani, sans-serif",
      fontSize: "14px",
      color: "#ff4444",
      fontStyle: "bold",
    }).setDepth(100).setOrigin(0.5);

    this.tweens.add({
      targets: txt,
      y: y - 50,
      alpha: 0,
      duration: 600,
      onComplete: () => txt.destroy(),
    });
  }

  private handleProjectileHit: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback =
    (projObj, enemyObj) => {
      const proj = projObj as Projectile;
      const enemy = enemyObj as Enemy;

      let damage = proj.damage;
      const weaponKey = this.equippedWeapon ?? "pistol";
      if (this.rollCrit(weaponKey, proj.distanceRatio)) {
        damage = Math.floor(damage * BALANCE.crit.damageMultiplier);
        this.showCritEffect(enemy.x, enemy.y);
      }

      const killed = enemy.takeDamage(damage);
      if (killed) {
        this.kills++;
        this.currency += BALANCE.economy.killReward[enemy.enemyType];
        this.waveManager.onEnemyKilled();
        this.playRandomEnemyDeath();
      }

      // Small knockback from bullet
      const angle = Phaser.Math.Angle.Between(
        this.player.x,
        this.player.y,
        enemy.x,
        enemy.y
      );
      enemy.body?.setVelocity(
        Math.cos(angle) * 50,
        Math.sin(angle) * 50
      );

      proj.destroy();
    };

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
      this.playBiteSound();

      // Push enemy away on contact so they don't stay glued to player
      const pushAngle = Phaser.Math.Angle.Between(
        this.player.x,
        this.player.y,
        enemy.x,
        enemy.y
      );
      const pushForce = enemy.enemyType === "fast" ? 200 : 120;
      enemy.body?.setVelocity(
        Math.cos(pushAngle) * pushForce,
        Math.sin(pushAngle) * pushForce
      );

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
    const items = BALANCE.shop.items;
    const panelH = 80 + items.length * 28;
    const panelTop = height / 2 - panelH / 2;

    const bg = this.add.graphics();
    bg.fillStyle(0x0a0a14, 0.85);
    bg.fillRoundedRect(width / 2 - 175, panelTop, 350, panelH, 12);
    bg.lineStyle(1, 0x4a4565, 0.6);
    bg.strokeRoundedRect(width / 2 - 175, panelTop, 350, panelH, 12);
    this.shopContainer.add(bg);

    // Title
    const title = this.add
      .text(width / 2, panelTop + 20, "SHOP", {
        fontSize: "22px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#e8c840",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.shopContainer.add(title);

    // Item rows
    items.forEach((item, i) => {
      const y = panelTop + 50 + i * 28;
      const keyLabel = this.add
        .text(width / 2 - 155, y, `[${i < 9 ? i + 1 : 0}]`, {
          fontSize: "12px",
          fontFamily: "Rajdhani, sans-serif",
          color: "#4a90d9",
          fontStyle: "bold",
        })
        .setOrigin(0, 0.5);
      this.shopContainer.add(keyLabel);

      const nameLabel = this.add
        .text(width / 2 - 115, y, item.name, {
          fontSize: "12px",
          fontFamily: "Rajdhani, sans-serif",
          color: "#d0c8e0",
        })
        .setOrigin(0, 0.5);
      this.shopContainer.add(nameLabel);

      const descLabel = this.add
        .text(width / 2 + 10, y, item.desc, {
          fontSize: "10px",
          fontFamily: "Rajdhani, sans-serif",
          color: "#8a82a0",
        })
        .setOrigin(0, 0.5);
      this.shopContainer.add(descLabel);

      const priceLabel = this.add
        .text(width / 2 + 155, y, `$${item.basePrice}`, {
          fontSize: "12px",
          fontFamily: "Rajdhani, sans-serif",
          color: "#e8c840",
          fontStyle: "bold",
        })
        .setOrigin(1, 0.5);
      this.shopContainer.add(priceLabel);
    });

    // Hints
    const hint = this.add
      .text(width / 2, panelTop + panelH - 24, "F or RIGHT-CLICK to fire  |  T to place trap", {
        fontSize: "9px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#5a5566",
      })
      .setOrigin(0.5);
    this.shopContainer.add(hint);

    const closeHint = this.add
      .text(width / 2, panelTop + panelH - 10, "[ESC] or [B] to close shop", {
        fontSize: "9px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#6a6577",
      })
      .setOrigin(0.5);
    this.shopContainer.add(closeHint);

    // Key bindings for shop (1-0 for up to 10 items)
    if (this.input.keyboard) {
      const keyCodes = [
        Phaser.Input.Keyboard.KeyCodes.ONE,
        Phaser.Input.Keyboard.KeyCodes.TWO,
        Phaser.Input.Keyboard.KeyCodes.THREE,
        Phaser.Input.Keyboard.KeyCodes.FOUR,
        Phaser.Input.Keyboard.KeyCodes.FIVE,
        Phaser.Input.Keyboard.KeyCodes.SIX,
        Phaser.Input.Keyboard.KeyCodes.SEVEN,
        Phaser.Input.Keyboard.KeyCodes.EIGHT,
        Phaser.Input.Keyboard.KeyCodes.NINE,
        Phaser.Input.Keyboard.KeyCodes.ZERO,
      ];
      keyCodes.forEach((code, i) => {
        if (i < items.length) {
          const key = this.input.keyboard!.addKey(code);
          key.on("down", () => { if (this.shopOpen) this.buyItem(i); });
        }
      });
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
      case "pistol":
      case "shotgun":
      case "smg": {
        // Already holding this weapon with ammo — buy ammo refill instead
        if (this.equippedWeapon === itemId && this.ammo > 0) {
          if (this.ammo >= this.maxAmmo) return;
          this.currency -= price;
          this.ammo = this.maxAmmo;
          this.showWeaponMessage("AMMO REFILLED", "#44dd44");
          break;
        }
        const weaponDef = BALANCE.weapons[itemId as keyof typeof BALANCE.weapons];
        const isGeneralist = this.characterDef.weaponSpecialty === "Generalist";
        const isProficient = !isGeneralist && this.characterDef.weaponSpecialty === weaponDef.proficiency;
        const ammoAmount = isProficient
          ? Math.floor(weaponDef.ammo * BALANCE.proficiencyBonus.ammoBonus)
          : isGeneralist
          ? Math.floor(weaponDef.ammo * 1.1) // Dan gets 10% extra ammo with everything
          : weaponDef.ammo;
        this.currency -= price;
        this.equippedWeapon = itemId;
        this.ammo = ammoAmount;
        this.maxAmmo = ammoAmount;
        this.showWeaponMessage(weaponDef.name.toUpperCase() + " EQUIPPED", "#dddd44");
        break;
      }
      case "ammo": {
        if (!this.equippedWeapon) return; // no weapon to refill
        if (this.ammo >= this.maxAmmo) return; // already full
        this.currency -= price;
        this.ammo = this.maxAmmo;
        break;
      }
      case "spikes":
      case "barricade":
      case "landmine": {
        const trapType = itemId as TrapType;
        const current = this.trapInventory.get(trapType) ?? 0;
        if (current >= BALANCE.traps.maxPerType) {
          this.showWeaponMessage("MAX TRAPS", "#cc3333");
          return;
        }
        this.currency -= price;
        this.trapInventory.set(trapType, current + 1);
        this.showWeaponMessage(
          `${BALANCE.traps[trapType].name.toUpperCase()} x${current + 1}`,
          "#44dd44"
        );
        break;
      }
    }

    this.playSound("sfx-buy", 0.4);
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

    // Weapon icon (right side, next to text)
    this.weaponIcon = this.add.image(width - 16, 62, "item-pistol")
      .setOrigin(1, 0.5)
      .setScale(1.2)
      .setVisible(false);
    this.hudContainer.add(this.weaponIcon);

    // Weapon display (below kills, right side)
    this.weaponText = this.add
      .text(width - 16, 54, "FISTS", {
        fontSize: "11px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#8a82a0",
      })
      .setOrigin(1, 0);
    this.hudContainer.add(this.weaponText);

    this.ammoText = this.add
      .text(width - 16, 68, "", {
        fontSize: "11px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#b0a8c0",
      })
      .setOrigin(1, 0);
    this.hudContainer.add(this.ammoText);

    // Trap inventory (right side, below ammo)
    this.trapText = this.add
      .text(width - 16, 86, "", {
        fontSize: "12px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#b0a8c0",
        lineSpacing: 2,
      })
      .setOrigin(1, 0);
    this.hudContainer.add(this.trapText);

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
      .text(width / 2, height - 14, "WASD move · SPACE/CLICK punch · F/RIGHT-CLICK fire · ESC pause", {
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

    // Weapon HUD
    if (this.equippedWeapon) {
      const wDef = BALANCE.weapons[this.equippedWeapon as keyof typeof BALANCE.weapons];
      this.weaponIcon.setTexture(`item-${this.equippedWeapon}`);
      this.weaponIcon.setVisible(true);
      const iconW = this.weaponIcon.displayWidth + 6;
      this.weaponText.setText(wDef.name.toUpperCase());
      this.weaponText.setColor("#d0c8e0");
      this.weaponText.setX(this.weaponIcon.x - iconW);
      this.ammoText.setText(`${this.ammo}/${this.maxAmmo}`);
      this.ammoText.setColor(this.ammo > 0 ? "#b0a8c0" : "#cc3333");
    } else {
      this.weaponIcon.setVisible(false);
      const { width } = this.cameras.main;
      this.weaponText.setX(width - 16);
      this.weaponText.setText("FISTS");
      this.weaponText.setColor("#8a82a0");
      this.ammoText.setText("");
    }

    // Trap inventory HUD — show all types, highlight selected
    const trapParts: string[] = [];
    let hasAny = false;
    for (let i = 0; i < this.trapTypes.length; i++) {
      const type = this.trapTypes[i];
      const count = this.trapInventory.get(type) ?? 0;
      if (count > 0) hasAny = true;
      const keyNum = i === 2 ? "0" : `${i + 8}`;
      const shortName = type === "spikes" ? "SPIKES" : type === "barricade" ? "BARRICADE" : "LANDMINE";
      const selected = i === this.selectedTrapIndex && count > 0;
      const prefix = selected ? ">" : " ";
      trapParts.push(`${prefix} [${keyNum}] ${shortName} x${count}`);
    }
    if (hasAny) {
      this.trapText.setText(`[8/9/0] Select  [T] Place\n${trapParts.join("\n")}`);
    } else {
      this.trapText.setText("");
    }

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
