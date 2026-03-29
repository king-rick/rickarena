import Phaser from "phaser";
import { Player } from "../entities/Player";
import { Enemy } from "../entities/Enemy";
import { Projectile, ensureBulletTexture } from "../entities/Projectile";
import { Trap, TrapType, ensureTrapTextures } from "../entities/Trap";
import { CHARACTERS, CharacterDef } from "../data/characters";
import { BALANCE } from "../data/balance";
import { WaveManager, WaveState } from "../systems/WaveManager";
import { LevelingSystem, BuffOption } from "../systems/LevelingSystem";
import { hasAnimation, getAnimKey } from "../data/animations";
// Village map constants
const VILLAGE_MAP_W = 80 * 16;  // 1280px
const VILLAGE_MAP_H = 65 * 16;  // 1040px

// Endicott Estate map constants (60x60 tiles at 32px)
const ENDICOTT_MAP_W = 60 * 32;  // 1920px
const ENDICOTT_MAP_H = 60 * 32;  // 1920px

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

  // RPG Leveling
  private levelingSystem!: LevelingSystem;
  private xpBar!: Phaser.GameObjects.Graphics;
  private levelText!: Phaser.GameObjects.Text;
  private levelUpOverlay!: Phaser.GameObjects.Container;
  private levelUpActive = false;
  private pendingLevelUps: { level: number; options: BuffOption[] }[] = [];

  // Weapon state
  private equippedWeapon: string | null = null; // null = fists
  private ammo = 0;
  private maxAmmo = 0;
  private lastFireTime = 0;
  private fireHeld = false;
  private hasExtraClip = false; // doubled ammo capacity for current weapon
  private projectiles!: Phaser.Physics.Arcade.Group;

  // Trap state
  private trapInventory: Map<TrapType, number> = new Map();
  private selectedTrapIndex = 0; // cycles through available trap types
  private readonly trapTypes: TrapType[] = ["barricade", "landmine"];
  private barricadeVertical = false; // toggle for barricade orientation
  private traps!: Phaser.Physics.Arcade.Group;
  private barricades!: Phaser.Physics.Arcade.StaticGroup;

  // Ability state (Q)
  private abilityCooldownTimer = 0; // ms remaining
  private abilityActive = false;
  // Smokescreen state (Jason)
  private smokeCloud: Phaser.GameObjects.Graphics | null = null;
  private smokeX = 0;
  private smokeY = 0;
  private smokeTimer = 0; // ms remaining
  private readonly smokeDuration = 5000;
  private readonly smokeRadius = 128; // 8x8 tiles = 256px diameter = 128px radius

  // Shop
  private shopOpen = false;
  private shopContainer!: Phaser.GameObjects.Container;

  // HUD container — scrollFactor(0), scaled 1/zoom so it renders at screen-space
  private hudContainer!: Phaser.GameObjects.Container;
  private minimap!: Phaser.Cameras.Scene2D.Camera;
  private minimapDot!: Phaser.GameObjects.Graphics;

  // Pause UI (inside hudContainer)
  private pauseOverlay!: Phaser.GameObjects.Graphics;
  private pauseTitle!: Phaser.GameObjects.Text;
  private pauseQuitBtn!: Phaser.GameObjects.Text;
  private pauseRestartBtn!: Phaser.GameObjects.Text;
  private pauseSettingsBtn!: Phaser.GameObjects.Text;
  private settingsContainer!: Phaser.GameObjects.Container;
  private settingsOpen = false;
  private sfxVolume = 0.3;
  private musicVolume = 1;
  private sfxMuted = false;
  private musicMuted = false;
  private wheelHandler?: (e: WheelEvent) => void;
  private zoomText!: Phaser.GameObjects.Text;
  private ambientSounds: Phaser.Sound.BaseSound[] = [];

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
  private zoomEnabled = false; // toggled in settings
  private trapText!: Phaser.GameObjects.Text;
  private countdownText!: Phaser.GameObjects.Text;
  private abilityCDText!: Phaser.GameObjects.Text;
  private shopCashText!: Phaser.GameObjects.Text;
  private shopSelectedIndex = 0;
  private shopItemName!: Phaser.GameObjects.Text;
  private shopItemDesc!: Phaser.GameObjects.Text;
  private shopItemPrice!: Phaser.GameObjects.Text;
  private shopItemStatus!: Phaser.GameObjects.Text;
  private shopItemIconGfx!: Phaser.GameObjects.Graphics;
  private shopItemIconImg!: Phaser.GameObjects.Image;
  private shopDots: Phaser.GameObjects.Graphics[] = [];
  private shopCategoryText!: Phaser.GameObjects.Text;

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
    this.pendingLevelUps = [];

    // Slow gameplay by 25%
    this.time.timeScale = 0.75;
    this.physics.world.timeScale = 1 / 0.75; // physics timeScale is inverted (higher = slower)
    this.tweens.timeScale = 0.75;

    // Draw tilemap — Endicott Estate
    const map = this.make.tilemap({ key: "endicott-map" });
    const grassTs = map.addTilesetImage("cainos-grass", "ts-cainos-grass");
    const stoneTs = map.addTilesetImage("cainos-stone", "ts-cainos-stone");
    const plantTs = map.addTilesetImage("basic-plant", "ts-basic-plant");
    const propsTs = map.addTilesetImage("basic-props", "ts-basic-props");
    const structTs = map.addTilesetImage("basic-struct", "ts-basic-struct");
    const wallTs = map.addTilesetImage("basic-wall", "ts-basic-wall");
    const portTs = map.addTilesetImage("port-town", "ts-port-town");
    const estateTs = map.addTilesetImage("pixellab-estate", "ts-pixellab-estate");
    const bpBushTs = map.addTilesetImage("bp-bushes", "ts-bp-bushes");
    const bpStoneTs = map.addTilesetImage("bp-stone-path", "ts-bp-stone-path");
    const bpGroundTs = map.addTilesetImage("bp-ground-32", "ts-bp-ground-32");
    const bpTreesTs = map.addTilesetImage("bp-trees-64", "ts-bp-trees-64");
    const bpRocksTs = map.addTilesetImage("bp-rocks-64", "ts-bp-rocks-64");
    const bpDirtTs = map.addTilesetImage("bp-dirt-path", "ts-bp-dirt-path");
    const nyknckRoadsTs = map.addTilesetImage("nyknck-roads", "ts-nyknck-roads");
    const kenneyUrbanTs = map.addTilesetImage("kenney-urban", "ts-kenney-urban");
    const allTilesets = [grassTs!, stoneTs!, plantTs!, propsTs!, structTs!, wallTs!, portTs!, estateTs!, bpBushTs!, bpStoneTs!, bpGroundTs!, bpTreesTs!, bpRocksTs!, bpDirtTs!, nyknckRoadsTs!, kenneyUrbanTs!];
    // Solid fill behind tilemap to mask seam artifacts at non-integer zoom
    const groundFill = this.add.rectangle(
      ENDICOTT_MAP_W / 2, ENDICOTT_MAP_H / 2,
      ENDICOTT_MAP_W, ENDICOTT_MAP_H,
      0x5a7a2a // approximate grass color
    ).setDepth(-3);
    this.minimap?.ignore(groundFill);
    map.createLayer("ground", allTilesets, 0, 0)?.setDepth(-2);
    map.createLayer("paths", allTilesets, 0, 0)?.setDepth(-1);
    map.createLayer("buildings", allTilesets, 0, 0)?.setDepth(0);
    map.createLayer("decorations", allTilesets, 0, 0)?.setDepth(1);
    this.cameras.main.setRoundPixels(true);

    // Spawn sprites from Tiled object layer
    const spritesLayer = map.getObjectLayer("sprites");
    if (spritesLayer) {
      for (const obj of spritesLayer.objects) {
        if (obj.name === "endicott-v1" || obj.name === "fountain" || obj.name === "greenhouse" || obj.name === "gazebo") {
          const spr = this.add.sprite(0, 0, obj.name);
          spr.setOrigin(0, 1);
          spr.setPosition(obj.x!, obj.y!);
          spr.setDisplaySize(obj.width!, obj.height!);
          spr.setDepth(2);
          if (obj.rotation) spr.setAngle(obj.rotation);
        }
      }
    }

    // East tree wall — individual sprites so they overlap naturally
    this.spawnTreeWall();

    // Obstacles — loaded from Tiled object layer
    this.obstacles = this.physics.add.staticGroup();
    const collisionLayer = map.getObjectLayer("collision");
    if (collisionLayer) {
      for (const obj of collisionLayer.objects) {
        const isEllipse = !!(obj as any).ellipse;
        if (isEllipse) {
          // Circle collision: obj.x/y is top-left of bounding box in Tiled
          const radius = obj.width! / 2;
          const cx = obj.x! + radius;
          const cy = obj.y! + radius;
          const zone = this.add.zone(cx, cy, radius * 2, radius * 2).setOrigin(0.5);
          this.physics.add.existing(zone, true);
          (zone.body as Phaser.Physics.Arcade.StaticBody).setCircle(radius);
          this.obstacles.add(zone);
        } else {
          // Rectangle collision: obj.x/y is top-left
          const zone = this.add
            .zone(obj.x! + obj.width! / 2, obj.y! + obj.height! / 2, obj.width!, obj.height!)
            .setOrigin(0.5);
          this.physics.add.existing(zone, true);
          this.obstacles.add(zone);
        }
      }
    }

    // Player — spawn at south gate
    const spawnX = ENDICOTT_MAP_W / 2;
    const spawnY = ENDICOTT_MAP_H - 64;
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

    // RPG Leveling system — level-ups are queued and shown during intermission
    this.levelingSystem = new LevelingSystem();
    this.levelingSystem.onLevelUp = (level, options) => {
      this.pendingLevelUps.push({ level, options });
    };

    // Camera (1080p — wider view than 540p at same zoom)
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setZoom(5.0);
    this.cameras.main.setBounds(0, 0, ENDICOTT_MAP_W, ENDICOTT_MAP_H);
    this.cameras.main.setRoundPixels(true);

    // Minimap — bottom-right corner, shows full map with player dot
    const mmSize = 160;
    const mmPadding = 12;
    const { width: screenW, height: screenH } = this.cameras.main;
    this.minimap = this.cameras.add(
      screenW - mmSize - mmPadding,
      screenH - mmSize - mmPadding,
      mmSize,
      mmSize
    );
    this.minimap.setZoom(mmSize / ENDICOTT_MAP_W);
    this.minimap.setBounds(0, 0, ENDICOTT_MAP_W, ENDICOTT_MAP_H);
    this.minimap.centerOn(ENDICOTT_MAP_W / 2, ENDICOTT_MAP_H / 2);
    this.minimap.setBackgroundColor(0x0a0a14);
    this.minimap.setName("minimap");

    // Minimap border (rendered on main camera only)
    const mmBorder = this.add.graphics();
    mmBorder.setScrollFactor(0);
    mmBorder.setDepth(200);
    mmBorder.lineStyle(3, 0x4a4565, 0.8);
    mmBorder.strokeRect(
      screenW - mmSize - mmPadding,
      screenH - mmSize - mmPadding,
      mmSize,
      mmSize
    );
    this.minimap.ignore(mmBorder);

    // Zoom percentage text (hidden until zoom is enabled in settings)
    this.zoomText = this.add.text(
      screenW - mmPadding,
      screenH - mmSize - mmPadding - 18,
      `${Math.round(this.cameras.main.zoom * 100)}%`,
      { fontSize: "20px", fontFamily: "Rajdhani, sans-serif", color: "#ffffff" }
    ).setOrigin(1, 0).setDepth(200).setVisible(false);
    this.minimap.ignore(this.zoomText);


    // Player indicator dot for minimap (large enough to see at minimap zoom)
    this.minimapDot = this.add.graphics();
    this.minimapDot.setDepth(160);
    // Main camera shouldn't render the dot (it's only for minimap)
    this.cameras.main.ignore(this.minimapDot);

    // World bounds
    this.physics.world.setBounds(0, 0, ENDICOTT_MAP_W, ENDICOTT_MAP_H);
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
        if (this.gameOver || this.paused) return;
        // During intermission, SPACE skips to next wave
        if (this.waveManager.state === "intermission" && !this.waveManager.isReadyUp()) {
          this.closeShop();
          this.waveManager.triggerReady();
          return;
        }
        if (!this.shopOpen) this.meleeAttack();
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

      // Select trap type directly (8=barricade, 9=landmine)
      const trapKeys = [
        { code: Phaser.Input.Keyboard.KeyCodes.EIGHT, index: 0 },
        { code: Phaser.Input.Keyboard.KeyCodes.NINE, index: 1 },
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
      // Ability (Q key)
      const qKey = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.Q
      );
      qKey.on("down", () => {
        if (!this.gameOver && !this.paused && !this.shopOpen) this.useAbility();
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
    this.input.mouse?.disableContextMenu();

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
        if (this.settingsOpen) { this.closeSettings(); return; }
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

      // SPACE to skip/ready up during intermission (overrides melee during intermission)
      // (melee SPACE handler above already checks shopOpen but not intermission —
      //  we handle priority in the melee handler by also checking wave state)

      // V key to toggle barricade orientation
      const vKey = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.V
      );
      vKey.on("down", () => {
        if (this.gameOver || this.paused) return;
        this.barricadeVertical = !this.barricadeVertical;
        const orient = this.barricadeVertical ? "VERTICAL" : "HORIZONTAL";
        this.showWeaponMessage(`BARRICADE: ${orient}`, "#dddd44");
      });
    }

    // HUD container — lives in world space, tracks camera position each frame
    this.hudContainer = this.add.container(0, 0);
    this.hudContainer.setDepth(150);
    // Hide HUD from minimap
    this.minimap.ignore(this.hudContainer);
    this.hudContainer.add(this.zoomText);

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

    // Ambient background loops
    if (this.cache.audio.exists("sfx-ambient-birds")) {
      const birds = this.sound.add("sfx-ambient-birds", { volume: 0.15, loop: true });
      birds.play();
      this.ambientSounds.push(birds);
    }

    this.waveManager.onWaveStart = (wave) => {
      this.closeShop();
      // MUTED — pending sound audit
      // Layer in rain ambience starting wave 5
      if (wave === 5 && this.cache.audio.exists("sfx-ambient-rain")) {
        const rain = this.sound.add("sfx-ambient-rain", { volume: 0.08, loop: true });
        rain.play();
        this.ambientSounds.push(rain);
      }
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
      // Show queued level-ups first, then open shop
      this.time.delayedCall(1000, () => {
        if (this.waveManager.state === "intermission") {
          this.showNextPendingLevelUp();
        }
      });
    };
  }

  update(time: number, delta: number) {
    // Always track HUD to camera, even when paused/game over
    const cam = this.cameras.main;
    // Snap camera to integer pixels to prevent tile seam artifacts
    cam.scrollX = Math.round(cam.scrollX);
    cam.scrollY = Math.round(cam.scrollY);
    this.hudContainer.setPosition(cam.worldView.x, cam.worldView.y);
    this.hudContainer.setScale(1 / cam.zoom);

    // Update minimap player dot
    this.minimapDot.clear();
    this.minimapDot.fillStyle(0x00ff00, 1);
    this.minimapDot.fillCircle(this.player.x, this.player.y, 40);
    this.minimapDot.fillStyle(0xffffff, 1);
    this.minimapDot.fillCircle(this.player.x, this.player.y, 20);

    if (this.gameOver || this.paused) return;

    this.player.update();
    this.waveManager.update(delta);

    // Footsteps while player is moving
    const vel = this.player.body?.velocity;
    if (vel && (Math.abs(vel.x) > 10 || Math.abs(vel.y) > 10)) {
      this.playFootstep();
    }

    // Ambient zombie groans
    this.tryPlayZombieGroan();

    // Hold-to-fire: only for auto weapons (SMG). Semi-auto fires on press only.
    if (this.fireHeld && !this.shopOpen && this.equippedWeapon) {
      const wDef = BALANCE.weapons[this.equippedWeapon as keyof typeof BALANCE.weapons];
      if (wDef?.auto) this.fireWeapon();
    }

    // Ability cooldown
    if (this.abilityCooldownTimer > 0) {
      this.abilityCooldownTimer -= delta;
    }

    // Smokescreen tick (Jason)
    if (this.smokeTimer > 0) {
      this.smokeTimer -= delta;
      this.updateSmokescreen(delta);
      if (this.smokeTimer <= 0) {
        this.destroySmokescreen();
      }
    }

    this.updateHUD();
  }

  // ------- Audio Helpers -------

  private lastPunchSfx = 0;
  private lastDeathSfx = 0;
  private lastBiteSfx = 0;
  private lastFootstepTime = 0;
  private lastGroanTime = 0;

  private playSound(key: string, volume = 0.5) {
    if (this.sfxMuted) return;
    if (this.cache.audio.exists(key)) {
      this.sound.play(key, { volume: volume * this.sfxVolume });
    }
  }

  private playRandomPunch() {
    const now = this.time.now;
    if (now - this.lastPunchSfx < 300) return;
    this.lastPunchSfx = now;
    const keys = [
      "sfx-punch1", "sfx-punch2", "sfx-punch3",
      "sfx-punch-body1", "sfx-punch-body2", "sfx-hit-classic",
      "sfx-punch-foley", "sfx-slap",
    ];
    this.playSound(keys[Math.floor(Math.random() * keys.length)], 0.4);
  }

  private playRandomEnemyDeath() {
    // MUTED — pending sound audit
  }

  private playBiteSound() {
    // MUTED — pending sound audit
  }

  /** Play footstep sound based on player position (grass default, gravel on paths, wood on deck) */
  private playFootstep() {
    const now = this.time.now;
    if (now - this.lastFootstepTime < 280) return; // ~3.5 steps/sec
    this.lastFootstepTime = now;

    // TODO: surface detection from tilemap layers (road=gravel, building=wood)
    // For now, all grass footsteps
    const i = Math.floor(Math.random() * 6) + 1;
    this.playSound(`sfx-step-grass${i}`, 0.15);
  }

  /** Random zombie groan from nearby enemies — atmospheric idle sound */
  private tryPlayZombieGroan() {
    // MUTED — pending sound audit
  }

  /** Play player damage grunt */
  private playPlayerHurt() {
    this.playSound("sfx-player-grunt", 0.35);
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
            this.onEnemyKilled(enemy);
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

  // ------- Shared kill handler -------

  private onEnemyKilled(enemy: Enemy) {
    this.kills++;
    this.currency += BALANCE.economy.killReward[enemy.enemyType];
    this.waveManager.onEnemyKilled();
    this.playRandomEnemyDeath();

    // RPG XP
    const xpReward = BALANCE.leveling.xpPerKill[enemy.enemyType];
    this.levelingSystem.addXP(xpReward);
  }

  // ------- Ability System (Q) -------

  private useAbility() {
    if (this.abilityCooldownTimer > 0) return;

    const charId = this.characterDef.id;
    switch (charId) {
      case "rick": this.abilitySuperkick(); break;
      case "dan": this.abilityEMPGrenade(); break;
      case "pj": this.abilityBladeDash(); break;
      case "jason": this.abilitySmokescreen(); break;
    }

    this.abilityCooldownTimer = this.characterDef.ability.cooldown * 1000;
  }

  /** Rick — Superkick: devastating kick with huge range, damage, and knockback */
  private abilitySuperkick() {
    // Play high-kick animation
    if (hasAnimation(this.characterDef.id, "high-kick")) {
      const kickKey = getAnimKey(this.characterDef.id, "high-kick", this.player["currentDir"]);
      if (this.anims.exists(kickKey)) {
        this.player.play(kickKey);
        this.player.once("animationcomplete", () => {
          const idleKey = getAnimKey(this.characterDef.id, "breathing-idle", this.player["currentDir"]);
          if (this.anims.exists(idleKey)) this.player.play(idleKey, true);
        });
      }
    }

    const angle = this.getFacingAngle();
    const range = 140; // big reach
    const arc = Phaser.Math.DegToRad(130); // wide sweep
    const damage = this.characterDef.stats.damage * 8; // 200 dmg — devastating
    const knockback = 700;
    let hits = 0;

    // Screen shake for impact feel
    this.cameras.main.shake(200, 0.008);

    this.enemies.getChildren().forEach((obj) => {
      const enemy = obj as Enemy;
      if (!enemy.active) return;

      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
      if (dist > range) return;

      const enemyAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y, enemy.x, enemy.y);
      let diff = enemyAngle - angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > arc / 2) return;

      const killed = enemy.takeDamage(damage);
      if (killed) {
        this.onEnemyKilled(enemy);
      } else {
        // Massive knockback
        enemy.body.setVelocity(
          Math.cos(enemyAngle) * knockback,
          Math.sin(enemyAngle) * knockback
        );
        enemy.applyKnockbackStun(800);
      }
      hits++;
    });

    // Kick arc visual — flash a wide arc in front of the player
    const arcGfx = this.add.graphics().setDepth(5);
    arcGfx.fillStyle(0xff4444, 0.25);
    arcGfx.slice(this.player.x, this.player.y, range, angle - arc / 2, angle + arc / 2, false);
    arcGfx.fillPath();
    this.tweens.add({
      targets: arcGfx,
      alpha: 0,
      duration: 250,
      onComplete: () => arcGfx.destroy(),
    });

    this.playSound("sfx-punch1", 0.6);
    this.playSound("sfx-hit-classic", 0.5);
    if (hits > 0) this.playSound("sfx-whoosh", 0.4);
    this.showWeaponMessage("SUPERKICK!", "#ff4444");
  }

  /** Dan — EMP Grenade: throw a grenade that flies forward and detonates on landing */
  private abilityEMPGrenade() {
    // Play throw animation first, grenade launches after animation completes
    const angle = this.getFacingAngle();
    const throwDist = 160; // ~5 tiles away
    const gx = this.player.x + Math.cos(angle) * throwDist;
    const gy = this.player.y + Math.sin(angle) * throwDist;

    const launchGrenade = () => {
      // Create visible grenade projectile
      const grenade = this.add.image(this.player.x, this.player.y, "item-grenade")
        .setScale(0.8)
        .setDepth(6);

      // Grenade flies in an arc to landing point
      this.tweens.add({
        targets: grenade,
        x: gx,
        y: gy,
        duration: 450,
        ease: "Sine.easeOut",
      });
      // Vertical arc (scale Y to simulate arc height)
      this.tweens.add({
        targets: grenade,
        scaleX: 1.1,
        scaleY: 1.1,
        duration: 225,
        yoyo: true,
        ease: "Sine.easeOut",
        onComplete: () => {
          grenade.destroy();
          this.detonateEMP(gx, gy);
        },
      });
    };

    if (hasAnimation(this.characterDef.id, "throw-grenade")) {
      const throwKey = getAnimKey(this.characterDef.id, "throw-grenade", this.player["currentDir"]);
      if (this.anims.exists(throwKey)) {
        this.player.play(throwKey);
        this.player.once("animationcomplete", () => {
          const idleKey = getAnimKey(this.characterDef.id, "breathing-idle", this.player["currentDir"]);
          if (this.anims.exists(idleKey)) this.player.play(idleKey, true);
          launchGrenade();
        });
      } else {
        launchGrenade();
      }
    } else {
      launchGrenade();
    }
  }

  /** Detonates the EMP at a world position */
  private detonateEMP(gx: number, gy: number) {
    const blastRadius = 160;
    const stunDuration = 3000;

    // Screen shake
    this.cameras.main.shake(150, 0.006);

    // Visual: EMP blast with spark sprite + expanding ring
    const empFlash = this.add.image(gx, gy, "fx-spark").setDepth(5);
    empFlash.setScale(blastRadius / 8);
    empFlash.setAlpha(0.9);
    empFlash.setTint(0x44aaff);

    const ring = this.add.graphics().setDepth(5);
    ring.lineStyle(3, 0x88ccff, 0.6);
    ring.strokeCircle(gx, gy, blastRadius);

    this.tweens.add({
      targets: [empFlash, ring],
      alpha: 0,
      duration: 500,
      onComplete: () => { empFlash.destroy(); ring.destroy(); },
    });

    let stunCount = 0;
    this.enemies.getChildren().forEach((obj) => {
      const enemy = obj as Enemy;
      if (!enemy.active) return;

      const dist = Phaser.Math.Distance.Between(gx, gy, enemy.x, enemy.y);
      if (dist <= blastRadius) {
        enemy.applyKnockbackStun(stunDuration);
        enemy.body.setVelocity(0, 0);
        stunCount++;
      }
    });

    this.playSound("sfx-explosion", 0.4);
    this.showWeaponMessage(`EMP! ${stunCount} STUNNED`, "#44aaff");
  }

  /** PJ — Katana Slash: wide arc swing in facing direction, high damage */
  private abilityBladeDash() {
    // Play katana animation
    if (hasAnimation(this.characterDef.id, "swinging-katana")) {
      const slashKey = getAnimKey(this.characterDef.id, "swinging-katana", this.player["currentDir"]);
      if (this.anims.exists(slashKey)) {
        this.player.play(slashKey);
        this.player.once("animationcomplete", () => {
          const idleKey = getAnimKey(this.characterDef.id, "breathing-idle", this.player["currentDir"]);
          if (this.anims.exists(idleKey)) this.player.play(idleKey, true);
        });
      }
    }

    const angle = this.getFacingAngle();
    const range = 110; // katana reach
    const arc = Phaser.Math.DegToRad(140); // wide slash arc
    const damage = this.characterDef.stats.damage * 14; // 196 dmg — devastating
    const knockback = 350;
    let hits = 0;

    this.cameras.main.shake(120, 0.005);

    this.enemies.getChildren().forEach((obj) => {
      const enemy = obj as Enemy;
      if (!enemy.active) return;

      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
      if (dist > range) return;

      const enemyAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y, enemy.x, enemy.y);
      let diff = enemyAngle - angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > arc / 2) return;

      const killed = enemy.takeDamage(damage);
      if (killed) {
        this.onEnemyKilled(enemy);
      } else {
        enemy.body.setVelocity(
          Math.cos(enemyAngle) * knockback,
          Math.sin(enemyAngle) * knockback
        );
        enemy.applyKnockbackStun(500);
      }
      hits++;
    });

    // Slash arc visual
    const arcGfx = this.add.graphics().setDepth(5);
    arcGfx.fillStyle(0xeeeeff, 0.2);
    arcGfx.slice(this.player.x, this.player.y, range, angle - arc / 2, angle + arc / 2, false);
    arcGfx.fillPath();
    arcGfx.lineStyle(2, 0xeeeeff, 0.5);
    arcGfx.beginPath();
    arcGfx.arc(this.player.x, this.player.y, range, angle - arc / 2, angle + arc / 2, false);
    arcGfx.strokePath();
    this.tweens.add({
      targets: arcGfx,
      alpha: 0,
      duration: 250,
      onComplete: () => arcGfx.destroy(),
    });

    this.playSound("sfx-whoosh", 0.5);
    if (hits > 0) this.playSound("sfx-hit-classic", 0.5);
    this.showWeaponMessage("KATANA SLASH!", "#eeeeff");
  }

  /** Jason — Smokescreen: smoke cloud that heals player and confuses enemies */
  private abilitySmokescreen() {
    // Play cigarette animation
    if (hasAnimation(this.characterDef.id, "light-cigarette")) {
      const smokeKey = getAnimKey(this.characterDef.id, "light-cigarette", this.player["currentDir"]);
      if (this.anims.exists(smokeKey)) {
        this.player.play(smokeKey);
        this.player.once("animationcomplete", () => {
          const idleKey = getAnimKey(this.characterDef.id, "breathing-idle", this.player["currentDir"]);
          if (this.anims.exists(idleKey)) this.player.play(idleKey, true);
        });
      }
    }

    // Destroy any existing smoke
    this.destroySmokescreen();

    // Place smoke at player position
    this.smokeX = this.player.x;
    this.smokeY = this.player.y;
    this.smokeTimer = this.smokeDuration;

    // Draw smoke cloud
    this.smokeCloud = this.add.graphics();
    this.smokeCloud.setDepth(3);
    this.smokeCloud.setAlpha(0.5);
    this.drawSmokeCloud();

    this.showWeaponMessage("SMOKESCREEN!", "#88aa88");
  }

  private drawSmokeCloud() {
    if (!this.smokeCloud) return;
    this.smokeCloud.clear();
    const alpha = Math.min(1, this.smokeTimer / 1000) * 0.5;
    this.smokeCloud.setAlpha(alpha);
    // Multiple overlapping circles for organic smoke look
    for (let i = 0; i < 8; i++) {
      const ox = Math.sin(i * 0.8 + this.smokeTimer * 0.001) * this.smokeRadius * 0.3;
      const oy = Math.cos(i * 1.1 + this.smokeTimer * 0.0015) * this.smokeRadius * 0.3;
      const r = this.smokeRadius * (0.5 + Math.sin(i * 2.3) * 0.2);
      this.smokeCloud.fillStyle(0x556655, 0.15 + Math.sin(i) * 0.05);
      this.smokeCloud.fillCircle(this.smokeX + ox, this.smokeY + oy, r);
    }
  }

  private updateSmokescreen(delta: number) {
    this.drawSmokeCloud();

    // Heal player if inside smoke
    const distToSmoke = Phaser.Math.Distance.Between(
      this.player.x, this.player.y, this.smokeX, this.smokeY
    );
    if (distToSmoke <= this.smokeRadius) {
      const healRate = 15; // HP per second
      const healAmount = healRate * (delta / 1000);
      this.player.stats.health = Math.min(
        this.player.stats.maxHealth,
        this.player.stats.health + healAmount
      );
    }

    // Confuse enemies touching smoke — they wander aimlessly
    this.enemies.getChildren().forEach((obj) => {
      const enemy = obj as Enemy;
      if (!enemy.active) return;

      const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, this.smokeX, this.smokeY);
      if (dist <= this.smokeRadius) {
        // Apply confusion: stun + random velocity (wander)
        enemy.applyKnockbackStun(200); // re-apply each frame to keep them confused
        const wanderAngle = Math.random() * Math.PI * 2;
        const wanderSpeed = 30 + Math.random() * 40;
        enemy.body.setVelocity(
          Math.cos(wanderAngle) * wanderSpeed,
          Math.sin(wanderAngle) * wanderSpeed
        );
      }
    });
  }

  private destroySmokescreen() {
    if (this.smokeCloud) {
      this.smokeCloud.destroy();
      this.smokeCloud = null;
    }
    this.smokeTimer = 0;
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
        weaponDef.dropoff,
        this.equippedWeapon!
      );
      this.projectiles.add(proj, true); // add to scene + group
      proj.launch(); // set velocity after body exists
    }

    this.ammo--;

    // Play shooting animation on the player sprite
    this.player.playShoot(this.equippedWeapon!);

    // MUTED — pending sound audit

    // Muzzle flash sprite
    const flashDist = 20;
    const flash = this.add.image(
      this.player.x + Math.cos(angle) * flashDist,
      this.player.y + Math.sin(angle) * flashDist,
      "fx-muzzle-flash"
    );
    flash.setDepth(60);
    flash.setRotation(angle);
    flash.setAlpha(0.9);
    this.time.delayedCall(60, () => flash.destroy());

    if (this.ammo <= 0) {
      this.equippedWeapon = null;
      // MUTED — pending sound audit
      this.showWeaponMessage("OUT OF AMMO", "#cc3333");
    }
  }

  private showWeaponMessage(msg: string, color: string) {
    const cam = this.cameras.main;
    const txt = this.add.text(
      this.player.x, this.player.y - 80, msg,
      { fontFamily: "Rajdhani, sans-serif", fontSize: "22px", color, fontStyle: "bold" }
    ).setDepth(100).setOrigin(0.5);

    this.tweens.add({
      targets: txt,
      y: this.player.y - 140,
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
    let placeX = this.player.x + Math.cos(angle) * placeDist;
    let placeY = this.player.y + Math.sin(angle) * placeDist;

    // Snap barricades to 32px grid so they line up cleanly
    if (trapType === "barricade") {
      placeX = Math.round(placeX / 32) * 32;
      placeY = Math.round(placeY / 32) * 32;
    }

    const trap = new Trap(this, placeX, placeY, trapType, trapType === "barricade" && this.barricadeVertical);

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
        this.onEnemyKilled(enemy);
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
        this.onEnemyKilled(enemy);
      }

      // Knockback from bullet — shotgun pellets stack knockback for big pushes
      const angle = Phaser.Math.Angle.Between(
        this.player.x,
        this.player.y,
        enemy.x,
        enemy.y
      );
      const weaponDef = BALANCE.weapons[proj.weaponType as keyof typeof BALANCE.weapons];
      const baseKnockback = (weaponDef as any)?.knockback ?? 50;
      // Fast enemies get pushed harder by shotgun (lighter = easier to knock around)
      const typeMult = enemy.enemyType === "fast" ? 1.5 : enemy.enemyType === "tank" ? 0.5 : 1.0;
      const knockForce = baseKnockback * typeMult;

      // Shotgun blasts need longer stun so the knockback actually plays out
      if (baseKnockback > 50) {
        enemy.applyKnockbackStun(300);
      }

      // Add to existing velocity so multiple pellets stack
      const currentVx = enemy.body?.velocity.x ?? 0;
      const currentVy = enemy.body?.velocity.y ?? 0;
      enemy.body?.setVelocity(
        currentVx + Math.cos(angle) * knockForce,
        currentVy + Math.sin(angle) * knockForce
      );

      proj.destroy();
    };

  // ------- Damage / Game Over -------

  private handleEnemyContact: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback =
    (_player, enemyObj) => {
      if (this.gameOver) return;
      if (this.player.isPunching) return; // i-frames during punch

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
      this.playPlayerHurt();

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
      .text(width / 2, height / 2 - 80, "YOU DIED", {
        fontSize: "80px",
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
        height / 2 + 40,
        `Wave ${waveReached}  |  ${this.kills} kills`,
        {
          fontSize: "36px",
          fontFamily: "Rajdhani, sans-serif",
          color: "#cccccc",
        }
      )
      .setOrigin(0.5)
      .setAlpha(0);
    this.hudContainer.add(statsText);

    // Fade in death screen, then show leaderboard entry
    this.tweens.add({
      targets: [overlay, diedText, statsText],
      alpha: 1,
      duration: 800,
      ease: "Cubic.easeIn",
      onComplete: () => {
        this.time.delayedCall(1200, () => {
          this.showLeaderboardEntry(overlay, waveReached);
        });
      },
    });
  }

  // ---------- Leaderboard ----------

  private showLeaderboardEntry(overlay: Phaser.GameObjects.Graphics, waveReached: number) {
    const { width, height } = this.cameras.main;
    const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const letters = [0, 0, 0]; // indices into ALPHABET
    let cursorPos = 0;
    let submitted = false;

    const fontBase = {
      fontFamily: "Rajdhani, sans-serif",
    };

    // "ENTER YOUR NAME" prompt
    const promptText = this.add
      .text(width / 2, height / 2 + 100, "ENTER YOUR NAME", {
        ...fontBase,
        fontSize: "28px",
        color: "#999999",
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.hudContainer.add(promptText);

    // Letter displays — 3 characters with spacing
    const letterSpacing = 60;
    const startX = width / 2 - letterSpacing;
    const letterY = height / 2 + 155;

    const letterTexts: Phaser.GameObjects.Text[] = [];
    for (let i = 0; i < 3; i++) {
      const lt = this.add
        .text(startX + i * letterSpacing, letterY, ALPHABET[letters[i]], {
          ...fontBase,
          fontSize: "52px",
          color: i === 0 ? "#ffffff" : "#666666",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setAlpha(0);
      this.hudContainer.add(lt);
      letterTexts.push(lt);
    }

    // Up/down arrows for active letter
    const arrowUp = this.add
      .text(startX, letterY - 42, "\u25B2", {
        ...fontBase,
        fontSize: "22px",
        color: "#cc3333",
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.hudContainer.add(arrowUp);

    const arrowDown = this.add
      .text(startX, letterY + 42, "\u25BC", {
        ...fontBase,
        fontSize: "22px",
        color: "#cc3333",
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.hudContainer.add(arrowDown);

    // Hint text
    const hintText = this.add
      .text(
        width / 2,
        height / 2 + 220,
        "\u2191\u2193 change letter    \u2190\u2192 move    ENTER submit",
        {
          ...fontBase,
          fontSize: "18px",
          color: "#666666",
        }
      )
      .setOrigin(0.5)
      .setAlpha(0);
    this.hudContainer.add(hintText);

    // Fade in the entry UI
    const entryElements = [promptText, ...letterTexts, arrowUp, arrowDown, hintText];
    this.tweens.add({
      targets: entryElements,
      alpha: 1,
      duration: 400,
      ease: "Cubic.easeIn",
    });

    const updateDisplay = () => {
      for (let i = 0; i < 3; i++) {
        letterTexts[i].setText(ALPHABET[letters[i]]);
        letterTexts[i].setColor(i === cursorPos ? "#ffffff" : "#666666");
      }
      arrowUp.setX(startX + cursorPos * letterSpacing);
      arrowDown.setX(startX + cursorPos * letterSpacing);
    };

    // Blink cursor
    this.time.addEvent({
      delay: 400,
      loop: true,
      callback: () => {
        if (submitted) return;
        const lt = letterTexts[cursorPos];
        lt.setAlpha(lt.alpha > 0.5 ? 0.3 : 1);
      },
    });

    // Key handler
    const keyHandler = (event: KeyboardEvent) => {
      if (submitted) return;

      switch (event.key) {
        case "ArrowUp":
        case "w":
          letters[cursorPos] = (letters[cursorPos] + 1) % 26;
          updateDisplay();
          break;
        case "ArrowDown":
        case "s":
          letters[cursorPos] = (letters[cursorPos] - 1 + 26) % 26;
          updateDisplay();
          break;
        case "ArrowLeft":
        case "a":
          if (cursorPos > 0) {
            letterTexts[cursorPos].setAlpha(1);
            cursorPos--;
            updateDisplay();
          }
          break;
        case "ArrowRight":
        case "d":
          if (cursorPos < 2) {
            letterTexts[cursorPos].setAlpha(1);
            cursorPos++;
            updateDisplay();
          }
          break;
        case "Enter":
          submitted = true;
          this.input.keyboard?.off("keydown", keyHandler);
          const name = letters.map((i) => ALPHABET[i]).join("");
          // Stop blinking — make all letters solid
          letterTexts.forEach((lt) => lt.setAlpha(1));
          hintText.setText("SUBMITTING...");
          hintText.setColor("#cc3333");
          this.submitLeaderboardScore(
            name,
            this.kills,
            waveReached,
            this.characterDef.id,
            overlay,
            entryElements
          );
          break;
      }
    };

    this.input.keyboard?.on("keydown", keyHandler);
  }

  private async submitLeaderboardScore(
    name: string,
    kills: number,
    wave: number,
    characterId: string,
    overlay: Phaser.GameObjects.Graphics,
    entryElements: Phaser.GameObjects.GameObject[]
  ) {
    let submittedId: number | null = null;

    try {
      const response = await fetch("/api/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          kills,
          wave,
          character_id: characterId,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        submittedId = data.id;
      }
    } catch (e) {
      console.error("Failed to submit leaderboard score:", e);
    }

    // Fetch the leaderboard
    let leaderboard: { id: number; name: string; kills: number; wave: number; character_id: string }[] = [];
    try {
      const response = await fetch("/api/leaderboard");
      if (response.ok) {
        leaderboard = await response.json();
      }
    } catch (e) {
      console.error("Failed to fetch leaderboard:", e);
    }

    this.showLeaderboardDisplay(leaderboard, submittedId, entryElements);
  }

  private showLeaderboardDisplay(
    leaderboard: { id: number; name: string; kills: number; wave: number; character_id: string }[],
    highlightId: number | null,
    entryElements: Phaser.GameObjects.GameObject[]
  ) {
    const { width, height } = this.cameras.main;
    const fontBase = { fontFamily: "Rajdhani, sans-serif" };

    // Fade out entry UI elements (not the overlay/died/stats — keep those)
    this.tweens.add({
      targets: entryElements,
      alpha: 0,
      duration: 300,
      ease: "Cubic.easeOut",
    });

    const boardContainer: Phaser.GameObjects.GameObject[] = [];

    // Title
    const title = this.add
      .text(width / 2, 60, "LEADERBOARD", {
        ...fontBase,
        fontSize: "48px",
        color: "#cc3333",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.hudContainer.add(title);
    boardContainer.push(title);

    // Column headers
    const headerY = 110;
    const rankX = width / 2 - 240;
    const nameX = width / 2 - 160;
    const killsX = width / 2 + 60;
    const waveX = width / 2 + 180;

    const headers = [
      { text: "#", x: rankX },
      { text: "NAME", x: nameX },
      { text: "KILLS", x: killsX },
      { text: "WAVE", x: waveX },
    ];

    for (const h of headers) {
      const ht = this.add
        .text(h.x, headerY, h.text, {
          ...fontBase,
          fontSize: "22px",
          color: "#999999",
          fontStyle: "bold",
        })
        .setOrigin(0, 0.5)
        .setAlpha(0);
      this.hudContainer.add(ht);
      boardContainer.push(ht);
    }

    // Separator line
    const sep = this.add.graphics();
    sep.lineStyle(1, 0x666666, 0.5);
    sep.lineBetween(rankX, headerY + 16, waveX + 60, headerY + 16);
    sep.setAlpha(0);
    this.hudContainer.add(sep);
    boardContainer.push(sep);

    // Rows
    const rowStartY = headerY + 36;
    const rowHeight = 32;
    const maxRows = Math.min(leaderboard.length, 20);

    for (let i = 0; i < maxRows; i++) {
      const entry = leaderboard[i];
      const y = rowStartY + i * rowHeight;
      const isHighlighted = entry.id === highlightId;
      const color = isHighlighted ? "#ffcc00" : "#cccccc";
      const fontSize = isHighlighted ? "22px" : "20px";

      const rowData = [
        { text: `${i + 1}`, x: rankX },
        { text: entry.name, x: nameX },
        { text: `${entry.kills}`, x: killsX },
        { text: `${entry.wave}`, x: waveX },
      ];

      for (const rd of rowData) {
        const rt = this.add
          .text(rd.x, y, rd.text, {
            ...fontBase,
            fontSize,
            color,
          })
          .setOrigin(0, 0.5)
          .setAlpha(0);
        this.hudContainer.add(rt);
        boardContainer.push(rt);
      }

      // Highlight bar behind the player's row
      if (isHighlighted) {
        const bar = this.add.graphics();
        bar.fillStyle(0xffcc00, 0.1);
        bar.fillRect(rankX - 10, y - rowHeight / 2, waveX + 70 - rankX, rowHeight);
        bar.setAlpha(0);
        this.hudContainer.add(bar);
        boardContainer.push(bar);
      }
    }

    // If leaderboard is empty, show a message
    if (maxRows === 0) {
      const emptyText = this.add
        .text(width / 2, rowStartY + 40, "No scores yet. You're the first!", {
          ...fontBase,
          fontSize: "24px",
          color: "#666666",
        })
        .setOrigin(0.5)
        .setAlpha(0);
      this.hudContainer.add(emptyText);
      boardContainer.push(emptyText);
    }

    // "Press any key to continue" prompt
    const continueText = this.add
      .text(width / 2, height - 50, "PRESS ANY KEY TO CONTINUE", {
        ...fontBase,
        fontSize: "22px",
        color: "#666666",
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.hudContainer.add(continueText);
    boardContainer.push(continueText);

    // Fade in the leaderboard
    this.tweens.add({
      targets: boardContainer,
      alpha: 1,
      duration: 500,
      delay: 400,
      ease: "Cubic.easeIn",
      onComplete: () => {
        // Blink the continue text
        this.tweens.add({
          targets: continueText,
          alpha: 0.3,
          yoyo: true,
          repeat: -1,
          duration: 600,
        });

        // Wait for any key to return to menu
        const returnHandler = () => {
          this.input.keyboard?.off("keydown", returnHandler);
          this.scene.start("MainMenu");
        };
        // Small delay so the submit Enter key doesn't immediately trigger
        this.time.delayedCall(500, () => {
          this.input.keyboard?.on("keydown", returnHandler);
        });
      },
    });
  }

  // ------- Pause -------

  private spawnTreeWall() {
    const mapW = ENDICOTT_MAP_W;
    const mapH = ENDICOTT_MAP_H;
    const rng = (min: number, max: number) => min + Math.random() * (max - min);
    const spacingX = 40;
    const spacingY = 44;

    // Build path exclusion grid — no trees within 10 tiles (320px) of any path
    const pathBuffer = 320;
    const map = this.make.tilemap({ key: "endicott-map" });
    const pathsLayer = map.getLayer("paths");
    const pathCenters: { x: number; y: number }[] = [];
    if (pathsLayer) {
      for (let ty = 0; ty < pathsLayer.height; ty++) {
        for (let tx = 0; tx < pathsLayer.width; tx++) {
          const tile = pathsLayer.data[ty][tx];
          if (tile && tile.index > 0) {
            pathCenters.push({ x: tx * 32 + 16, y: ty * 32 + 16 });
          }
        }
      }
    }
    const isNearPath = (x: number, y: number) => {
      for (const p of pathCenters) {
        const dx = x - p.x;
        const dy = y - p.y;
        if (dx * dx + dy * dy < pathBuffer * pathBuffer) return true;
      }
      return false;
    };

    // Seeded-ish noise for organic tree line edges
    // Returns a wavy offset (in pixels) so the boundary isn't a straight line
    const edgeWobble = (pos: number, seed: number) => {
      const s1 = Math.sin(pos * 0.008 + seed) * 48;
      const s2 = Math.sin(pos * 0.023 + seed * 2.7) * 24;
      const s3 = Math.sin(pos * 0.051 + seed * 5.1) * 12;
      return s1 + s2 + s3;
    };

    const placeTree = (x: number, y: number) => {
      if (isNearPath(x, y)) return;
      const isDark = Math.random() < 0.3;
      const sheet = isDark ? "dark-trees-64" : "trees-64";
      const frame = Math.floor(Math.random() * 16);
      const tree = this.add.sprite(x + rng(-12, 12), y + rng(-10, 10), sheet, frame);
      tree.setOrigin(0.5, 0.8);
      tree.setDepth(y / 10);
      tree.setScale(rng(0.9, 1.15));
    };

    const placeSparseTree = (x: number, y: number) => {
      if (isNearPath(x, y)) return;
      if (Math.random() < 0.45) return;
      const isDark = Math.random() < 0.4;
      const sheet = isDark ? "dark-trees-64" : "trees-64";
      const frame = Math.floor(Math.random() * 16);
      const tree = this.add.sprite(x + rng(-8, 8), y + rng(-8, 8), sheet, frame);
      tree.setOrigin(0.5, 0.8);
      tree.setDepth(y / 10);
      tree.setScale(rng(0.85, 1.1));
    };

    // --- EAST PERIMETER ---
    // Dense at the far edge, gradually thins toward center
    const eastEdgeX = 55 * 32; // dense wall starts here
    for (let baseY = -32; baseY < mapH + 32; baseY += spacingY) {
      const wobble = edgeWobble(baseY, 42);
      // Dense zone: eastEdgeX to map edge
      for (let baseX = eastEdgeX + wobble; baseX < mapW + 32; baseX += spacingX) {
        placeTree(baseX, baseY);
      }
      // Gradient zone: gets sparser the further from the edge
      const gradientStart = eastEdgeX + wobble - 160; // ~5 tiles of gradient
      for (let baseX = gradientStart; baseX < eastEdgeX + wobble; baseX += spacingX * 1.3) {
        const distFromEdge = (eastEdgeX + wobble) - baseX;
        const skipChance = distFromEdge / 200; // further from edge = more likely to skip
        if (Math.random() < skipChance) continue;
        placeSparseTree(baseX, baseY);
      }
    }

    // --- SOUTHEAST PERIMETER ---
    // Tighter band, ~2-3 tiles deep with gradient
    const southEdgeY = 55 * 32; // dense wall starts here
    for (let baseX = 30 * 32; baseX < eastEdgeX - 64; baseX += spacingX) {
      const wobble = edgeWobble(baseX, 97);
      // Dense zone: southEdgeY to map edge (narrow band)
      for (let baseY = southEdgeY + wobble; baseY < mapH + 32; baseY += spacingY) {
        placeTree(baseX, baseY);
      }
      // Thin gradient above the dense line
      const gradientStart = southEdgeY + wobble - 80; // ~2-3 tiles of gradient
      for (let baseY = gradientStart; baseY < southEdgeY + wobble; baseY += spacingY * 1.5) {
        const distFromEdge = (southEdgeY + wobble) - baseY;
        const skipChance = distFromEdge / 100;
        if (Math.random() < skipChance) continue;
        placeSparseTree(baseX, baseY);
      }
    }
  }

  private createPauseUI() {
    const { width, height } = this.cameras.main;

    this.pauseOverlay = this.add.graphics();
    this.pauseOverlay.fillStyle(0x000000, 0.6);
    this.pauseOverlay.fillRect(0, 0, width, height);
    this.pauseOverlay.setVisible(false);
    this.hudContainer.add(this.pauseOverlay);

    this.pauseTitle = this.add
      .text(width / 2, height / 2 - 80, "PAUSED", {
        fontSize: "64px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#d0c8e0",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setVisible(false);
    this.hudContainer.add(this.pauseTitle);

    this.pauseQuitBtn = this.add
      .text(width / 2, height / 2 + 40, "[ Q ]  Quit to Menu", {
        fontSize: "30px",
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

    // Restart button
    this.pauseRestartBtn = this.add
      .text(width / 2, height / 2 + 80, "[ R ]  Restart", {
        fontSize: "30px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#8a82a0",
      })
      .setOrigin(0.5)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.hudContainer.add(this.pauseRestartBtn);

    this.pauseRestartBtn.on("pointerover", () => {
      this.pauseRestartBtn.setColor("#d0c8e0");
    });
    this.pauseRestartBtn.on("pointerout", () => {
      this.pauseRestartBtn.setColor("#8a82a0");
    });
    this.pauseRestartBtn.on("pointerdown", () => {
      this.scene.restart({ characterId: this.characterDef.id });
    });

    // Settings button
    this.pauseSettingsBtn = this.add
      .text(width / 2, height / 2 + 140, "[ S ]  Settings", {
        fontSize: "30px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#8a82a0",
      })
      .setOrigin(0.5)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.hudContainer.add(this.pauseSettingsBtn);

    this.pauseSettingsBtn.on("pointerover", () => {
      this.pauseSettingsBtn.setColor("#d0c8e0");
    });
    this.pauseSettingsBtn.on("pointerout", () => {
      this.pauseSettingsBtn.setColor("#8a82a0");
    });
    this.pauseSettingsBtn.on("pointerdown", () => {
      this.openSettings();
    });

    this.createSettingsUI();
  }

  private createSettingsUI() {
    const { width, height } = this.cameras.main;
    this.settingsContainer = this.add.container(0, 0);
    this.settingsContainer.setDepth(170);
    this.settingsContainer.setVisible(false);
    this.hudContainer.add(this.settingsContainer);

    const panelW = 640;
    const panelH = 340;
    const cx = width / 2;
    const cy = height / 2;
    const left = cx - panelW / 2;
    const top = cy - panelH / 2;

    // Panel background
    const bg = this.add.graphics();
    bg.fillStyle(0x12121f, 0.95);
    bg.fillRoundedRect(left, top, panelW, panelH, 12);
    bg.lineStyle(2, 0x4a4565, 0.6);
    bg.strokeRoundedRect(left, top, panelW, panelH, 12);
    this.settingsContainer.add(bg);

    // Title
    const title = this.add.text(cx, top + 40, "SETTINGS", {
      fontSize: "36px", fontFamily: "Rajdhani, sans-serif",
      color: "#d0c8e0", fontStyle: "bold",
    }).setOrigin(0.5);
    this.settingsContainer.add(title);

    let yPos = top + 110;
    const labelStyle = { fontSize: "26px", fontFamily: "Rajdhani, sans-serif", color: "#b0a8c0" };
    const valStyle = { fontSize: "26px", fontFamily: "Rajdhani, sans-serif", color: "#d0c8e0" };

    // --- SFX Volume ---
    this.settingsContainer.add(this.add.text(left + 40, yPos, "Sound Volume", labelStyle));
    const sfxValText = this.add.text(left + panelW - 40, yPos, "100%", valStyle).setOrigin(1, 0);
    this.settingsContainer.add(sfxValText);
    yPos += 44;
    const sfxSlider = this.createSlider(left + 40, yPos, panelW - 80, this.sfxVolume, (val) => {
      this.sfxVolume = val;
      this.sfxMuted = val === 0;
      sfxValText.setText(`${Math.round(val * 100)}%`);
      for (const s of this.ambientSounds) {
        if ("setVolume" in s) (s as Phaser.Sound.WebAudioSound).setVolume(val * 0.15);
      }
    });
    this.settingsContainer.add(sfxSlider);
    yPos += 60;

    // --- Scroll Zoom Toggle ---
    const zoomToggle = this.createToggle(left + 40, yPos, "Scroll Zoom", this.zoomEnabled, (on) => {
      this.zoomEnabled = on;
      if (on) {
        this.zoomText.setVisible(true);
        this.zoomText.setText(`${Math.round(this.cameras.main.zoom * 100)}%`);
        this.wheelHandler = (e: WheelEvent) => {
          e.preventDefault();
          const cam = this.cameras.main;
          const zoomStops = [2, 2.5, 3, 3.5, 4, 5];
          const curIdx = zoomStops.reduce((closest, val, idx) =>
            Math.abs(val - cam.zoom) < Math.abs(zoomStops[closest] - cam.zoom) ? idx : closest, 0);
          const nextIdx = Phaser.Math.Clamp(curIdx + (e.deltaY > 0 ? -1 : 1), 0, zoomStops.length - 1);
          cam.setZoom(zoomStops[nextIdx]);
          this.zoomText.setText(`${Math.round(zoomStops[nextIdx] * 100)}%`);
        };
        window.addEventListener("wheel", this.wheelHandler, { passive: false });
      } else {
        this.zoomText.setVisible(false);
        if (this.wheelHandler) {
          window.removeEventListener("wheel", this.wheelHandler);
          this.wheelHandler = undefined;
        }
        this.cameras.main.setZoom(5.0);
      }
    });
    this.settingsContainer.add(zoomToggle);

    // Back button
    const backBtn = this.add.text(cx, top + panelH - 50, "[ ESC ]  Back", {
      fontSize: "26px", fontFamily: "Rajdhani, sans-serif", color: "#8a82a0",
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    backBtn.on("pointerover", () => backBtn.setColor("#d0c8e0"));
    backBtn.on("pointerout", () => backBtn.setColor("#8a82a0"));
    backBtn.on("pointerdown", () => this.closeSettings());
    this.settingsContainer.add(backBtn);
  }

  private createSlider(x: number, y: number, w: number, initial: number, onChange: (val: number) => void): Phaser.GameObjects.Container {
    const container = this.add.container(0, 0);

    // Track
    const track = this.add.graphics();
    track.fillStyle(0x2a2a3a, 1);
    track.fillRoundedRect(x, y + 8, w, 12, 6);
    container.add(track);

    // Fill
    const fill = this.add.graphics();
    container.add(fill);

    // Knob
    const knob = this.add.graphics();
    container.add(knob);

    const drawSlider = (val: number) => {
      fill.clear();
      fill.fillStyle(0x4a90d9, 1);
      fill.fillRoundedRect(x, y + 8, w * val, 12, 6);
      knob.clear();
      knob.fillStyle(0xd0c8e0, 1);
      knob.fillCircle(x + w * val, y + 14, 12);
    };
    drawSlider(initial);

    // Invisible hit area
    const hitZone = this.add.zone(x + w / 2, y + 14, w + 30, 36).setInteractive({ useHandCursor: true });
    container.add(hitZone);

    let dragging = false;
    const updateFromPointer = (px: number) => {
      const val = Phaser.Math.Clamp((px - x) / w, 0, 1);
      drawSlider(val);
      onChange(val);
    };

    const toLocal = (p: Phaser.Input.Pointer) =>
      (p.worldX - this.hudContainer.x) / this.hudContainer.scaleX;

    hitZone.on("pointerdown", (p: Phaser.Input.Pointer) => {
      dragging = true;
      updateFromPointer(toLocal(p));
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (dragging) updateFromPointer(toLocal(p));
    });
    this.input.on("pointerup", () => { dragging = false; });

    return container;
  }

  private createToggle(x: number, y: number, label: string, initial: boolean, onChange: (on: boolean) => void): Phaser.GameObjects.Container {
    const container = this.add.container(0, 0);
    let isOn = initial;

    const labelText = this.add.text(x, y, label, {
      fontSize: "26px", fontFamily: "Rajdhani, sans-serif", color: "#b0a8c0",
    });
    container.add(labelText);

    const boxX = x + 440;
    const box = this.add.graphics();
    const drawToggle = () => {
      box.clear();
      box.fillStyle(isOn ? 0x4a90d9 : 0x2a2a3a, 1);
      box.fillRoundedRect(boxX, y + 2, 64, 28, 14);
      box.fillStyle(0xd0c8e0, 1);
      box.fillCircle(isOn ? boxX + 50 : boxX + 14, y + 16, 10);
    };
    drawToggle();
    container.add(box);

    const hitZone = this.add.zone(boxX + 32, y + 16, 72, 36).setInteractive({ useHandCursor: true });
    hitZone.on("pointerdown", () => {
      isOn = !isOn;
      drawToggle();
      onChange(isOn);
    });
    container.add(hitZone);

    return container;
  }

  private openSettings() {
    this.settingsOpen = true;
    this.pauseTitle.setVisible(false);
    this.pauseQuitBtn.setVisible(false);
    this.pauseRestartBtn.setVisible(false);
    this.pauseSettingsBtn.setVisible(false);
    this.settingsContainer.setVisible(true);
  }

  private closeSettings() {
    this.settingsOpen = false;
    this.settingsContainer.setVisible(false);
    this.pauseTitle.setVisible(true);
    this.pauseQuitBtn.setVisible(true);
    this.pauseRestartBtn.setVisible(true);
    this.pauseSettingsBtn.setVisible(true);
  }

  private pauseGame() {
    this.paused = true;
    this.physics.pause();

    this.pauseOverlay.setVisible(true);
    this.pauseTitle.setVisible(true);
    this.pauseQuitBtn.setVisible(true);
    this.pauseRestartBtn.setVisible(true);
    this.pauseSettingsBtn.setVisible(true);

    this.pauseKeyHandler = (event: KeyboardEvent) => {
      if (event.key === "q" || event.key === "Q") {
        if (this.paused && !this.settingsOpen) this.scene.start("MainMenu");
      }
      if (event.key === "r" || event.key === "R") {
        if (this.paused && !this.settingsOpen) this.scene.restart({ characterId: this.characterDef.id });
      }
      if (event.key === "s" || event.key === "S") {
        if (this.paused && !this.settingsOpen) this.openSettings();
      }
    };
    window.addEventListener("keydown", this.pauseKeyHandler);
  }

  private pauseKeyHandler?: (event: KeyboardEvent) => void;

  private resumeGame() {
    this.paused = false;
    this.physics.resume();

    this.pauseOverlay.setVisible(false);
    this.pauseTitle.setVisible(false);
    this.pauseQuitBtn.setVisible(false);
    this.pauseRestartBtn.setVisible(false);
    this.pauseSettingsBtn.setVisible(false);
    this.settingsContainer.setVisible(false);
    this.settingsOpen = false;

    if (this.pauseKeyHandler) {
      window.removeEventListener("keydown", this.pauseKeyHandler);
      this.pauseKeyHandler = undefined;
    }
  }

  // ------- Shop -------

  private createShopUI() {
    const { width, height } = this.cameras.main;
    this.shopContainer = this.add.container(0, 0);
    this.shopContainer.setDepth(160);
    this.shopContainer.setVisible(false);
    this.hudContainer.add(this.shopContainer);
    this.shopDots = [];

    const items = BALANCE.shop.items;
    const panelW = 680;
    const panelH = 480;
    const panelLeft = width / 2 - panelW / 2;
    const panelTop = height / 2 - panelH / 2;
    const cx = width / 2;
    const cy = height / 2;

    // Dim overlay
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.5);
    overlay.fillRect(0, 0, width, height);
    this.shopContainer.add(overlay);

    // Panel background
    const bg = this.add.graphics();
    bg.fillStyle(0x0a0a14, 0.95);
    bg.fillRoundedRect(panelLeft, panelTop, panelW, panelH, 16);
    bg.lineStyle(2, 0x3a3550, 0.8);
    bg.strokeRoundedRect(panelLeft, panelTop, panelW, panelH, 16);
    this.shopContainer.add(bg);

    // Header: SHOP + cash
    this.add.text(cx, panelTop + 32, "SHOP", {
      fontSize: "32px", fontFamily: "Rajdhani, sans-serif", color: "#ffffff", fontStyle: "bold", letterSpacing: 8,
    }).setOrigin(0.5).setDepth(161);
    this.shopContainer.add(this.shopContainer.last!);

    this.shopCashText = this.add.text(panelLeft + panelW - 32, panelTop + 32, "$0", {
      fontSize: "32px", fontFamily: "Rajdhani, sans-serif", color: "#e8c840", fontStyle: "bold",
    }).setOrigin(1, 0.5);
    this.shopContainer.add(this.shopCashText);

    // Category label (SUPPLIES / WEAPONS / TRAPS)
    this.shopCategoryText = this.add.text(cx, panelTop + 76, "", {
      fontSize: "18px", fontFamily: "Rajdhani, sans-serif", color: "#5a5577", fontStyle: "bold", letterSpacing: 4,
    }).setOrigin(0.5);
    this.shopContainer.add(this.shopCategoryText);

    // Item icon (graphics fallback for items without sprites)
    this.shopItemIconGfx = this.add.graphics();
    this.shopContainer.add(this.shopItemIconGfx);

    // Item icon (image for items with sprites)
    this.shopItemIconImg = this.add.image(cx, panelTop + 150, "item-pistol")
      .setOrigin(0.5)
      .setScale(3.6)
      .setVisible(false);
    this.shopContainer.add(this.shopItemIconImg);

    // Item name (big, centered)
    this.shopItemName = this.add.text(cx, panelTop + 220, "", {
      fontSize: "40px", fontFamily: "Rajdhani, sans-serif", color: "#e0daf0", fontStyle: "bold",
    }).setOrigin(0.5);
    this.shopContainer.add(this.shopItemName);

    // Description
    this.shopItemDesc = this.add.text(cx, panelTop + 268, "", {
      fontSize: "22px", fontFamily: "Rajdhani, sans-serif", color: "#9990aa",
      wordWrap: { width: panelW - 120 }, align: "center",
    }).setOrigin(0.5, 0);
    this.shopContainer.add(this.shopItemDesc);

    // Price
    this.shopItemPrice = this.add.text(cx, panelTop + 330, "", {
      fontSize: "36px", fontFamily: "Rajdhani, sans-serif", color: "#e8c840", fontStyle: "bold",
    }).setOrigin(0.5);
    this.shopContainer.add(this.shopItemPrice);

    // Status text (LOCKED / PURCHASED / CAN'T AFFORD etc)
    this.shopItemStatus = this.add.text(cx, panelTop + 372, "", {
      fontSize: "20px", fontFamily: "Rajdhani, sans-serif", color: "#888899",
    }).setOrigin(0.5);
    this.shopContainer.add(this.shopItemStatus);

    // Left/right arrows
    const arrowL = this.add.text(panelLeft + 28, cy, "\u25C0", {
      fontSize: "40px", fontFamily: "Rajdhani, sans-serif", color: "#5aabff",
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    arrowL.on("pointerdown", () => this.shopNavigate(-1));
    this.shopContainer.add(arrowL);

    const arrowR = this.add.text(panelLeft + panelW - 28, cy, "\u25B6", {
      fontSize: "40px", fontFamily: "Rajdhani, sans-serif", color: "#5aabff",
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    arrowR.on("pointerdown", () => this.shopNavigate(1));
    this.shopContainer.add(arrowR);

    // Dot indicators
    const dotSpacing = 18;
    const dotsStartX = cx - ((items.length - 1) * dotSpacing) / 2;
    const dotsY = panelTop + panelH - 36;
    for (let i = 0; i < items.length; i++) {
      const dot = this.add.graphics();
      dot.x = dotsStartX + i * dotSpacing;
      dot.y = dotsY;
      this.shopContainer.add(dot);
      this.shopDots.push(dot);
    }

    // Close hint
    const closeHint = this.add.text(cx, panelTop + panelH + 28, "[ESC] or [B] to close  \u00B7  [ENTER] to buy  \u00B7  [A/D] browse", {
      fontSize: "18px", fontFamily: "Rajdhani, sans-serif", color: "#555566",
    }).setOrigin(0.5);
    this.shopContainer.add(closeHint);

    // Key bindings for shop navigation + purchase
    if (this.input.keyboard) {
      // A/D and arrows to browse
      const leftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
      const rightKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
      leftKey.on("down", () => { if (this.shopOpen) this.shopNavigate(-1); });
      rightKey.on("down", () => { if (this.shopOpen) this.shopNavigate(1); });

      // Enter to buy selected
      const enterKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
      enterKey.on("down", () => { if (this.shopOpen) this.buyItem(this.shopSelectedIndex); });

      // Number keys + numpad for direct buy
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
        Phaser.Input.Keyboard.KeyCodes.MINUS,
      ];
      const numpadCodes = [
        Phaser.Input.Keyboard.KeyCodes.NUMPAD_ONE,
        Phaser.Input.Keyboard.KeyCodes.NUMPAD_TWO,
        Phaser.Input.Keyboard.KeyCodes.NUMPAD_THREE,
        Phaser.Input.Keyboard.KeyCodes.NUMPAD_FOUR,
        Phaser.Input.Keyboard.KeyCodes.NUMPAD_FIVE,
        Phaser.Input.Keyboard.KeyCodes.NUMPAD_SIX,
        Phaser.Input.Keyboard.KeyCodes.NUMPAD_SEVEN,
        Phaser.Input.Keyboard.KeyCodes.NUMPAD_EIGHT,
        Phaser.Input.Keyboard.KeyCodes.NUMPAD_NINE,
        Phaser.Input.Keyboard.KeyCodes.NUMPAD_ZERO,
      ];
      keyCodes.forEach((code, i) => {
        if (i < items.length) {
          const key = this.input.keyboard!.addKey(code);
          key.on("down", () => { if (this.shopOpen) this.buyItem(i); });
        }
      });
      numpadCodes.forEach((code, i) => {
        if (i < items.length) {
          const key = this.input.keyboard!.addKey(code);
          key.on("down", () => { if (this.shopOpen) this.buyItem(i); });
        }
      });
    }
  }

  private shopNavigate(dir: number) {
    const items = BALANCE.shop.items;
    this.shopSelectedIndex = (this.shopSelectedIndex + dir + items.length) % items.length;
    this.updateShopDisplay();
  }

  private updateShopDisplay() {
    const items = BALANCE.shop.items;
    const item = items[this.shopSelectedIndex];
    const unlockWave = (item as any).unlockWave;
    const locked = unlockWave && this.waveManager.wave < unlockWave;
    const price = this.getItemPrice(this.shopSelectedIndex);
    const canAfford = this.currency >= price;

    // Category
    const idx = this.shopSelectedIndex;
    let category = "SUPPLIES";
    if (idx >= 3 && idx <= 7) category = "WEAPONS";
    else if (idx >= 8) category = "TRAPS";
    this.shopCategoryText.setText(category);

    // Item icon
    const iconMap: Record<string, string> = {
      pistol: "item-pistol",
      shotgun: "item-shotgun",
      smg: "item-smg",
      ammo: "item-ammo",
      extraClip: "item-ammo-box",
      spikes: "trap-spikes",
      barricade: "trap-barricade",
      landmine: "item-landmine",
    };
    const consumableColors: Record<string, number> = {
      heal: 0x44bb44,
      fullHeal: 0x33dd99,
      dmgBoost: 0xdd4444,
    };

    const { width, height } = this.cameras.main;
    const panelTop = height / 2 - 240;
    const iconTexture = iconMap[item.id];
    this.shopItemIconGfx.clear();

    if (iconTexture && this.textures.exists(iconTexture)) {
      this.shopItemIconImg.setTexture(iconTexture);
      this.shopItemIconImg.setVisible(true);
      this.shopItemIconImg.setAlpha(locked ? 0.3 : 1);
    } else if (consumableColors[item.id]) {
      this.shopItemIconImg.setVisible(false);
      const color = consumableColors[item.id];
      this.shopItemIconGfx.fillStyle(color, locked ? 0.3 : 0.9);
      this.shopItemIconGfx.fillRoundedRect(width / 2 - 28, panelTop + 116, 56, 56, 10);
      this.shopItemIconGfx.lineStyle(2, 0xffffff, locked ? 0.1 : 0.3);
      this.shopItemIconGfx.strokeRoundedRect(width / 2 - 28, panelTop + 116, 56, 56, 10);
    } else {
      this.shopItemIconImg.setVisible(false);
    }

    // Item info
    this.shopItemName.setText(item.name.toUpperCase());

    if (locked) {
      this.shopItemName.setColor("#444055");
      this.shopItemDesc.setText("???");
      this.shopItemDesc.setColor("#333044");
      this.shopItemPrice.setText(`WAVE ${unlockWave}`);
      this.shopItemPrice.setColor("#553333");
      this.shopItemStatus.setText("LOCKED");
      this.shopItemStatus.setColor("#553333");
    } else {
      this.shopItemName.setColor("#e0daf0");
      this.shopItemDesc.setText(item.desc);
      this.shopItemDesc.setColor("#9990aa");
      this.shopItemPrice.setText(`$${price}`);
      this.shopItemPrice.setColor(canAfford ? "#e8c840" : "#663333");
      this.shopItemStatus.setText(canAfford ? "ENTER TO BUY" : "NOT ENOUGH CASH");
      this.shopItemStatus.setColor(canAfford ? "#5aabff" : "#663333");
    }

    // Cash
    this.shopCashText.setText(`$${this.currency}`);

    // Dots
    this.shopDots.forEach((dot, i) => {
      dot.clear();
      if (i === this.shopSelectedIndex) {
        dot.fillStyle(0x5aabff, 1);
        dot.fillCircle(0, 0, 5);
      } else {
        dot.fillStyle(0x333344, 1);
        dot.fillCircle(0, 0, 3);
      }
    });
  }

  private getItemPrice(index: number): number {
    const item = BALANCE.shop.items[index];
    const inflation = 1 + this.waveManager.wave * BALANCE.economy.priceInflationPerWave;
    return Math.floor(item.basePrice * inflation);
  }

  private openShop() {
    this.shopOpen = true;
    this.shopContainer.setVisible(true);
    this.updateShopDisplay();
  }

  private closeShop() {
    this.shopOpen = false;
    this.shopContainer.setVisible(false);
  }

  private buyItem(index: number) {
    const item = BALANCE.shop.items[index];
    const price = this.getItemPrice(index);
    if (this.currency < price) {
      this.playSound("sfx-error", 0.3);
      return;
    }

    // Wave-lock check
    const unlockWave = (item as any).unlockWave;
    if (unlockWave && this.waveManager.wave < unlockWave) {
      this.playSound("sfx-error", 0.3);
      this.showWeaponMessage(`UNLOCKS WAVE ${unlockWave}`, "#cc3333");
      return;
    }

    const itemId = item.id;

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
      case "dmgBoost": {
        if (this.damageBoostActive) return;
        this.currency -= price;
        this.damageBoostActive = true;
        this.player.stats.damage = Math.floor(this.baseDamage * 1.25);
        break;
      }
      case "pistol":
      case "shotgun": {
      // case "smg": // SMG disabled pending balance pass
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
        this.hasExtraClip = false; // reset on new weapon
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
      case "extraClip": {
        if (!this.equippedWeapon) return; // no weapon
        if (this.hasExtraClip) {
          this.showWeaponMessage("ALREADY UPGRADED", "#cc3333");
          return;
        }
        this.currency -= price;
        this.hasExtraClip = true;
        this.maxAmmo = this.maxAmmo * 2;
        this.ammo = this.maxAmmo; // refill to new max
        this.showWeaponMessage("EXTRA CLIP — AMMO DOUBLED", "#44dd44");
        break;
      }
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
    this.updateShopDisplay();
    this.updateHUD();

    // Flash feedback
    const { width, height } = this.cameras.main;
    const flash = this.add
      .text(width / 2, height / 2 + 160, "PURCHASED", {
        fontSize: "24px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#44cc44",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.shopContainer.add(flash);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      y: height / 2 + 130,
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
    const S = 2; // scale factor for 1080p (base was 540p)

    // ===== TOP-LEFT: HP + Stamina bars (no panel, just bars) =====
    const hpIcon = this.add.image(20, 20, "ui-icon-heart").setOrigin(0, 0).setScale(S);
    this.hudContainer.add(hpIcon);

    this.healthBar = this.add.graphics();
    this.hudContainer.add(this.healthBar);

    const staIcon = this.add.image(20, 52, "ui-icon-lightning").setOrigin(0, 0).setScale(S);
    this.hudContainer.add(staIcon);

    this.staminaBar = this.add.graphics();
    this.hudContainer.add(this.staminaBar);

    this.burnoutText = this.add
      .text(60, 82, "BURNED OUT", {
        fontSize: "18px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#ff4444",
        fontStyle: "bold",
      })
      .setVisible(false);
    this.hudContainer.add(this.burnoutText);

    this.levelText = this.add.text(20, 82, "Lv.1", {
      fontSize: "18px",
      fontFamily: "Rajdhani, sans-serif",
      color: "#d4a843",
      fontStyle: "bold",
    });
    this.hudContainer.add(this.levelText);

    this.xpBar = this.add.graphics();

    // ===== TOP-RIGHT: Skull + kills, Coin + gold (no panel, just icons + numbers) =====
    const skullIcon = this.add.image(width - 100, 20, "ui-icon-skull").setOrigin(0, 0).setScale(S);
    this.hudContainer.add(skullIcon);

    this.killText = this.add
      .text(width - 64, 22, "0", {
        fontSize: "24px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0, 0);
    this.hudContainer.add(this.killText);

    const coinIcon = this.add.image(width - 100, 50, "ui-icon-coin").setOrigin(0, 0).setScale(S);
    this.hudContainer.add(coinIcon);

    this.currencyText = this.add
      .text(width - 64, 52, "0", {
        fontSize: "24px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#e8c840",
        fontStyle: "bold",
      })
      .setOrigin(0, 0);
    this.hudContainer.add(this.currencyText);

    // ===== TOP-CENTER: Wave =====
    this.waveText = this.add
      .text(width / 2, 20, "WAVE 1", {
        fontSize: "28px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0);
    this.hudContainer.add(this.waveText);

    this.waveStatusText = this.add
      .text(width / 2, 52, "", {
        fontSize: "20px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#cccccc",
      })
      .setOrigin(0.5, 0);
    this.hudContainer.add(this.waveStatusText);

    // ===== BOTTOM-LEFT: Weapon + Ammo (minimal, no panel) =====
    this.weaponIcon = this.add.image(24, height - 60, "item-pistol")
      .setOrigin(0, 0.5)
      .setScale(3)
      .setVisible(false);
    this.hudContainer.add(this.weaponIcon);

    this.weaponText = this.add
      .text(24, height - 84, "FISTS", {
        fontSize: "22px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0, 0);
    this.hudContainer.add(this.weaponText);

    this.ammoText = this.add
      .text(24, height - 36, "", {
        fontSize: "20px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#ffffff",
      })
      .setOrigin(0, 0);
    this.hudContainer.add(this.ammoText);

    // ===== BOTTOM-RIGHT: Ability + Traps (minimal, no panel) =====
    this.abilityCDText = this.add
      .text(width - 24, height - 84, "", {
        fontSize: "22px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(1, 0);
    this.hudContainer.add(this.abilityCDText);

    this.trapText = this.add
      .text(width - 24, height - 36, "", {
        fontSize: "20px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#ffffff",
      })
      .setOrigin(1, 0);
    this.hudContainer.add(this.trapText);

    // ===== CENTER: Announcements =====
    this.waveAnnouncement = this.add
      .text(width / 2, height / 2 - 80, "", {
        fontSize: "72px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.hudContainer.add(this.waveAnnouncement);

    this.countdownText = this.add
      .text(width / 2, height / 2, "", {
        fontSize: "128px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.hudContainer.add(this.countdownText);

    // Bottom-center: Controls hint
    const controls = this.add
      .text(width / 2, height - 8, "WASD move | CLICK punch | RIGHT-CLICK fire | Q ability | SPACE skip | B shop", {
        fontSize: "14px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#444455",
      })
      .setOrigin(0.5, 1);
    this.hudContainer.add(controls);
  }

  private drawGlowBar(
    gfx: Phaser.GameObjects.Graphics,
    x: number, y: number, w: number, h: number,
    pct: number,
    baseColor: number, brightColor: number, glowColor: number,
    radius: number
  ) {
    const fillW = w * pct;
    if (fillW < 1) return;

    // Outer glow (slightly larger, low alpha)
    gfx.fillStyle(glowColor, 0.25);
    gfx.fillRoundedRect(x - 2, y - 2, fillW + 4, h + 4, radius + 1);

    // Main fill (base color)
    gfx.fillStyle(baseColor, 1);
    gfx.fillRoundedRect(x, y, fillW, h, radius);

    // Top gradient highlight (brighter, covers top 40% of bar)
    gfx.fillStyle(brightColor, 0.45);
    gfx.fillRoundedRect(x, y, fillW, Math.floor(h * 0.4), radius);

    // Bottom edge darken (subtle depth)
    gfx.fillStyle(0x000000, 0.15);
    gfx.fillRoundedRect(x, y + Math.floor(h * 0.75), fillW, Math.ceil(h * 0.25), radius);
  }

  private updateHUD() {
    // Bar positions: after 32px icon + 4px gap
    const barX = 56;
    const barW = 220;
    const barH = 18;
    const barR = 4;

    // Health bar
    this.healthBar.clear();
    this.healthBar.fillStyle(0x0d0a12, 0.8);
    this.healthBar.fillRoundedRect(barX - 1, 22, barW + 2, barH + 2, barR + 1);
    this.healthBar.fillStyle(0x1a1520, 0.6);
    this.healthBar.fillRoundedRect(barX, 23, barW, barH, barR);
    const hpPct = this.player.stats.health / this.player.stats.maxHealth;
    if (hpPct > 0.001) {
      if (hpPct > 0.5) {
        this.drawGlowBar(this.healthBar, barX, 23, barW, barH, hpPct,
          0xbb2222, 0xee5555, 0xdd3333, barR);
      } else if (hpPct > 0.25) {
        this.drawGlowBar(this.healthBar, barX, 23, barW, barH, hpPct,
          0x992211, 0xcc4433, 0xbb3322, barR);
      } else {
        this.drawGlowBar(this.healthBar, barX, 23, barW, barH, hpPct,
          0x771111, 0xaa3333, 0x991111, barR);
      }
    }

    // Stamina bar
    this.staminaBar.clear();
    this.staminaBar.fillStyle(0x0d0a12, 0.8);
    this.staminaBar.fillRoundedRect(barX - 1, 54, barW + 2, barH + 2, barR + 1);
    this.staminaBar.fillStyle(0x1a1520, 0.6);
    this.staminaBar.fillRoundedRect(barX, 55, barW, barH, barR);
    const staPct = this.player.stats.stamina / this.player.stats.maxStamina;
    if (staPct > 0.001) {
      if (this.player.burnedOut) {
        this.drawGlowBar(this.staminaBar, barX, 55, barW, barH, staPct,
          0x444444, 0x666666, 0x555555, barR);
      } else if (staPct > 0.3) {
        this.drawGlowBar(this.staminaBar, barX, 55, barW, barH, staPct,
          0x2d9e2d, 0x55dd55, 0x33cc33, barR);
      } else {
        this.drawGlowBar(this.staminaBar, barX, 55, barW, barH, staPct,
          0xaa6622, 0xdd9944, 0xcc8833, barR);
      }
    }

    this.burnoutText.setVisible(this.player.burnedOut);

    // Level text only (no XP bar)
    this.xpBar.clear();
    this.levelText.setText(`Lv.${this.levelingSystem.level}`);

    // Apply leveling buffs to player effective stats
    const effective = this.levelingSystem.getEffectiveStats(this.characterDef.stats);
    this.player.stats.maxHealth = effective.maxHealth;
    this.player.stats.maxStamina = effective.maxStamina;
    this.player.stats.speed = effective.speed;
    this.player.stats.regen = effective.regen;
    this.baseDamage = effective.damage;
    if (!this.damageBoostActive) {
      this.player.stats.damage = effective.damage;
    }

    // Top-right: kills + currency (icon-based, no emoji)
    this.killText.setText(`${this.kills}`);
    this.currencyText.setText(`${this.currency}`);

    // Bottom-right: ability cooldown
    if (this.abilityCooldownTimer > 0) {
      const secs = Math.ceil(this.abilityCooldownTimer / 1000);
      this.abilityCDText.setText(`[Q] ${this.characterDef.ability.name}  ${secs}s`);
      this.abilityCDText.setColor("#888888");
    } else {
      this.abilityCDText.setText(`[Q] ${this.characterDef.ability.name}  READY`);
      this.abilityCDText.setColor("#ffffff");
    }

    // Bottom-left: weapon + ammo
    if (this.equippedWeapon) {
      const wDef = BALANCE.weapons[this.equippedWeapon as keyof typeof BALANCE.weapons];
      this.weaponIcon.setTexture(`item-${this.equippedWeapon}`);
      this.weaponIcon.setVisible(true);
      this.weaponText.setText(wDef.name.toUpperCase());
      this.weaponText.setColor("#ffffff");
      this.weaponText.setX(36);
      this.ammoText.setText(`${this.ammo} / ${this.maxAmmo}`);
      this.ammoText.setColor(this.ammo > 0 ? "#ffffff" : "#cc3333");
    } else {
      this.weaponIcon.setVisible(false);
      this.weaponText.setX(36);
      this.weaponText.setText("FISTS");
      this.weaponText.setColor("#ffffff");
      this.ammoText.setText("");
    }

    // Bottom-right: trap inventory
    const trapParts: string[] = [];
    let hasAny = false;
    for (let i = 0; i < this.trapTypes.length; i++) {
      const type = this.trapTypes[i];
      const count = this.trapInventory.get(type) ?? 0;
      if (count > 0) hasAny = true;
      const shortName = type === "barricade" ? "BARR" : "MINE";
      const selected = i === this.selectedTrapIndex && count > 0;
      const prefix = selected ? ">" : " ";
      trapParts.push(`${prefix}${shortName} x${count}`);
    }
    if (hasAny) {
      this.trapText.setText(`[T] Place  ${trapParts.join("  ")}`);
    } else {
      this.trapText.setText("");
    }

    // Wave HUD
    const state = this.waveManager.state;
    const wave = this.waveManager.wave;
    let countdownSecs = -1;

    if (state === "pre_game") {
      this.waveText.setText("GET READY");
      const secs = this.waveManager.getPreGameTimeLeft();
      this.waveStatusText.setText(`Starting in ${secs}s`);
      countdownSecs = secs;
    } else {
      this.waveText.setText(`WAVE ${wave}`);

      if (state === "active" || state === "clearing") {
        const remaining = this.waveManager.getEnemiesRemaining();
        this.waveStatusText.setText(
          `${remaining} enem${remaining === 1 ? "y" : "ies"} remaining`
        );
      } else if (state === "intermission") {
        if (this.waveManager.isReadyUp()) {
          const secs = this.waveManager.getReadyCountdown();
          this.waveStatusText.setText(`Starting in ${secs}s...`);
          countdownSecs = secs;
        } else {
          const timeLeft = this.waveManager.getIntermissionTimeLeft();
          this.waveStatusText.setText(`${timeLeft}s  |  SPACE skip  |  B shop`);
        }
      }
    }

    // Big countdown: 3...2...1
    if (countdownSecs >= 1 && countdownSecs <= 3) {
      const numStr = `${countdownSecs}`;
      if (this.countdownText.text !== numStr) {
        this.countdownText.setText(numStr);
        this.countdownText.setAlpha(1);
        this.countdownText.setScale(1.5);
        this.tweens.add({
          targets: this.countdownText,
          scaleX: 1,
          scaleY: 1,
          alpha: 0.3,
          duration: 900,
          ease: "Cubic.easeOut",
        });
      }
    } else if (countdownSecs <= 0 && this.countdownText.alpha > 0) {
      this.countdownText.setAlpha(0);
    }
  }

  // ------- Level-Up UI -------

  private showLevelUpUI(level: number, options: BuffOption[]) {
    this.levelUpActive = true;

    const { width, height } = this.cameras.main;
    this.levelUpOverlay = this.add.container(0, 0);
    this.levelUpOverlay.setDepth(200);
    this.hudContainer.add(this.levelUpOverlay);

    // Dim overlay
    const dim = this.add.graphics();
    dim.fillStyle(0x000000, 0.6);
    dim.fillRect(0, 0, width, height);
    this.levelUpOverlay.add(dim);

    // "LEVEL UP" title
    const title = this.add.text(width / 2, height / 2 - 180, `LEVEL ${level}`, {
      fontSize: "60px",
      fontFamily: "Rajdhani, sans-serif",
      color: "#d4a843",
      fontStyle: "bold",
    }).setOrigin(0.5);
    this.levelUpOverlay.add(title);

    const subtitle = this.add.text(width / 2, height / 2 - 120, "Choose a buff", {
      fontSize: "26px",
      fontFamily: "Rajdhani, sans-serif",
      color: "#aaaaaa",
    }).setOrigin(0.5);
    this.levelUpOverlay.add(subtitle);

    // Buff cards
    const cardW = 280;
    const cardH = 200;
    const gap = 40;
    const totalW = options.length * cardW + (options.length - 1) * gap;
    const startX = width / 2 - totalW / 2;

    const categoryColors: Record<string, number> = {
      strength: 0xcc4444,
      health: 0x33aa33,
      stamina: 0x3388bb,
      speed: 0xdddd44,
      luck: 0xdd88dd,
    };

    options.forEach((opt, i) => {
      const cx = startX + i * (cardW + gap) + cardW / 2;
      const cy = height / 2 + 10;

      // Card background
      const card = this.add.graphics();
      card.fillStyle(0x1a1a2e, 0.9);
      card.fillRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 12);
      card.lineStyle(3, categoryColors[opt.category] ?? 0xffffff, 0.8);
      card.strokeRoundedRect(cx - cardW / 2, cy - cardH / 2, cardW, cardH, 12);
      this.levelUpOverlay.add(card);

      // Category label
      const catLabel = this.add.text(cx, cy - 70, opt.category.toUpperCase(), {
        fontSize: "18px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#888888",
      }).setOrigin(0.5);
      this.levelUpOverlay.add(catLabel);

      // Buff name
      const nameText = this.add.text(cx, cy - 30, opt.name, {
        fontSize: "26px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#ffffff",
        fontStyle: "bold",
      }).setOrigin(0.5);
      this.levelUpOverlay.add(nameText);

      // Description
      const descText = this.add.text(cx, cy + 16, opt.desc, {
        fontSize: "20px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#cccccc",
      }).setOrigin(0.5);
      this.levelUpOverlay.add(descText);

      // Tier label
      const tierText = this.add.text(cx, cy + 56, opt.tier.toUpperCase(), {
        fontSize: "16px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#666666",
      }).setOrigin(0.5);
      this.levelUpOverlay.add(tierText);

      // Key hint
      const keyText = this.add.text(cx, cy + cardH / 2 + 24, `[${i + 1}]`, {
        fontSize: "26px",
        fontFamily: "Rajdhani, sans-serif",
        color: "#d4a843",
        fontStyle: "bold",
      }).setOrigin(0.5);
      this.levelUpOverlay.add(keyText);

      // Click zone
      const hitZone = this.add.zone(cx, cy, cardW, cardH).setInteractive();
      hitZone.on("pointerdown", () => this.selectLevelUpBuff(i));
      this.levelUpOverlay.add(hitZone);
    });

    // Keyboard shortcuts (number row + numpad)
    if (this.input.keyboard) {
      const key1 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
      const key2 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
      const numpad1 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_ONE);
      const numpad2 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_TWO);
      key1.once("down", () => { if (this.levelUpActive) this.selectLevelUpBuff(0); });
      key2.once("down", () => { if (this.levelUpActive && options.length > 1) this.selectLevelUpBuff(1); });
      numpad1.once("down", () => { if (this.levelUpActive) this.selectLevelUpBuff(0); });
      numpad2.once("down", () => { if (this.levelUpActive && options.length > 1) this.selectLevelUpBuff(1); });
    }
  }

  private selectLevelUpBuff(index: number) {
    if (!this.levelUpActive) return;

    const buff = this.levelingSystem.selectBuff(index);
    if (!buff) return;

    // If health buff, heal by the increase amount (not to full)
    if (buff.category === "health") {
      const effective = this.levelingSystem.getEffectiveStats(this.characterDef.stats);
      const hpIncrease = effective.maxHealth - this.player.stats.maxHealth;
      this.player.stats.health = Math.min(
        effective.maxHealth,
        this.player.stats.health + hpIncrease
      );
    }

    // If stamina buff, increase current stamina proportionally
    if (buff.category === "stamina") {
      const effective = this.levelingSystem.getEffectiveStats(this.characterDef.stats);
      const staIncrease = effective.maxStamina - this.player.stats.maxStamina;
      this.player.stats.stamina = Math.min(
        effective.maxStamina,
        this.player.stats.stamina + staIncrease
      );
    }

    // Clean up UI
    this.levelUpActive = false;
    this.levelUpOverlay.destroy();

    // Flash the buff name
    this.showWeaponMessage(buff.name.toUpperCase(), "#d4a843");

    // Show next pending level-up or open shop
    this.time.delayedCall(300, () => {
      this.showNextPendingLevelUp();
    });
  }

  private showNextPendingLevelUp() {
    if (this.pendingLevelUps.length > 0) {
      const next = this.pendingLevelUps.shift()!;
      this.showLevelUpUI(next.level, next.options);
    } else {
      // All level-ups processed, open shop
      if (this.waveManager.state === "intermission") {
        this.openShop();
      }
    }
  }
}
