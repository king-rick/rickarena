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
import { hudState } from "../HUDState";
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
  private gameOverContainer!: Phaser.GameObjects.Container;
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

  // Hotbar: 0=fists, 1=weapon, 2=barricade, 3=mine
  private activeSlot = 0;
  private readonly slotCount = 4;

  // Ability state (Q)
  private abilityCooldownTimer = 0; // ms remaining
  private abilityActive = false;
  // Smokescreen state (Jason)
  private smokeCloud: Phaser.GameObjects.Graphics | null = null;
  private smokeX = 0;
  private smokeY = 0;
  private smokeTimer = 0; // ms remaining
  private smokeDrainAccum = 0; // accumulates fractional drain damage
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
  private zoomEnabled = false; // toggled in settings
  private countdownText!: Phaser.GameObjects.Text;
  private abilityNameText!: Phaser.GameObjects.Text;
  private abilityStatusText!: Phaser.GameObjects.Text;
  // Slot strip (bottom-left)
  private slotBgs: Phaser.GameObjects.Graphics[] = [];
  private slotIcons: Phaser.GameObjects.Image[] = [];
  private slotLabels: Phaser.GameObjects.Text[] = [];
  private slotCounts: Phaser.GameObjects.Text[] = [];
  private shopCashText!: Phaser.GameObjects.Text;
  private shopSelectedIndex = 0;
  private shopNavCol = 0;
  private shopNavRow = 0;
  private shopGrid: number[][] = []; // [col][row] -> original item index
  private shopCards: {
    bg: Phaser.GameObjects.Graphics;
    icon: Phaser.GameObjects.Image | null;
    name: Phaser.GameObjects.Text;
    desc: Phaser.GameObjects.Text;
    price: Phaser.GameObjects.Text;
    key: Phaser.GameObjects.Text;
    zone: Phaser.GameObjects.Zone;
  }[] = [];

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
    hudState.reset();
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

    // Minimap — bottom-right corner
    const mmSize = 160;
    const mmPadding = 12;
    const { width: screenW, height: screenH } = this.cameras.main;
    const mmX = screenW - mmSize - mmPadding;
    const mmY = screenH - mmSize - mmPadding;
    this.minimap = this.cameras.add(mmX, mmY, mmSize, mmSize);
    this.minimap.setZoom(mmSize / ENDICOTT_MAP_W);
    this.minimap.setBounds(0, 0, ENDICOTT_MAP_W, ENDICOTT_MAP_H);
    this.minimap.centerOn(ENDICOTT_MAP_W / 2, ENDICOTT_MAP_H / 2);
    this.minimap.setBackgroundColor(0x0a0a14);
    this.minimap.setName("minimap");

    // Minimap border — thick, clearly visible
    const mmBorder = this.add.graphics();
    mmBorder.setScrollFactor(0);
    mmBorder.setDepth(200);
    mmBorder.lineStyle(4, 0xff2244, 0.9);
    mmBorder.strokeRect(mmX - 2, mmY - 2, mmSize + 4, mmSize + 4);
    mmBorder.lineStyle(1, 0x0a0a14, 1);
    mmBorder.strokeRect(mmX - 3, mmY - 3, mmSize + 6, mmSize + 6);
    this.minimap.ignore(mmBorder);

    // Zoom percentage text (hidden)
    this.zoomText = this.add.text(
      screenW - mmPadding,
      mmY - 18,
      `${Math.round(this.cameras.main.zoom * 100)}%`,
      { fontSize: "20px", fontFamily: "HorrorPixel, monospace", color: "#ffffff" }
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

    // --- Hotbar input: Q/E cycle, 1-4 direct select, SPACE/F use active slot ---
    if (this.input.keyboard) {
      // SPACE: use active slot OR ready-up during intermission
      const space = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.SPACE
      );
      space.on("down", () => {
        if (this.gameOver || this.paused) return;
        if (this.waveManager.state === "intermission" && !this.waveManager.isReadyUp()) {
          this.closeShop();
          this.waveManager.triggerReady();
          return;
        }
        if (!this.shopOpen) this.meleeAttack(); // Space always punches
      });

      // F key: use active item slot (weapon/trap), hold for auto-fire
      const fKey = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.F
      );
      fKey.on("down", () => {
        this.fireHeld = true;
        if (!this.gameOver && !this.paused && !this.shopOpen) this.useActiveSlot();
      });
      fKey.on("up", () => { this.fireHeld = false; });

      // E: cycle forward through hotbar
      const eKey = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.E
      );
      eKey.on("down", () => {
        if (this.gameOver || this.paused || this.shopOpen) return;
        this.cycleSlot(1);
      });

      // Q: cycle backward through hotbar
      const qKey = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.Q
      );
      qKey.on("down", () => {
        if (this.gameOver || this.paused || this.shopOpen) return;
        this.cycleSlot(-1);
      });

      // 1-4: direct slot select
      const slotKeys = [
        Phaser.Input.Keyboard.KeyCodes.ONE,
        Phaser.Input.Keyboard.KeyCodes.TWO,
        Phaser.Input.Keyboard.KeyCodes.THREE,
        Phaser.Input.Keyboard.KeyCodes.FOUR,
      ];
      slotKeys.forEach((code, idx) => {
        const key = this.input.keyboard!.addKey(code);
        key.on("down", () => {
          if (this.gameOver || this.paused || this.shopOpen) return;
          this.selectSlot(idx);
        });
      });

      // R: ability
      const rKey = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.R
      );
      rKey.on("down", () => {
        if (!this.gameOver && !this.paused && !this.shopOpen) this.useAbility();
      });
    }
    // Left click = melee punch, Right click = use active item slot
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.gameOver || this.paused || this.shopOpen) return;
      if (pointer.rightButtonDown()) {
        this.fireHeld = true;
        this.useActiveSlot();
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
    // setRoundPixels(true) handles pixel snapping at render time —
    // manual rounding here fights with camera lerp and causes jitter
    this.hudContainer.setPosition(cam.worldView.x, cam.worldView.y);
    this.hudContainer.setScale(1 / cam.zoom);

    // Update minimap player dot
    this.minimapDot.clear();
    this.minimapDot.fillStyle(0x00ff00, 1);
    this.minimapDot.fillCircle(this.player.x, this.player.y, 40);
    this.minimapDot.fillStyle(0xffffff, 1);
    this.minimapDot.fillCircle(this.player.x, this.player.y, 20);

    if (this.gameOver || this.paused) return;

    // Freeze player movement while shop is open
    if (this.shopOpen) {
      this.player.body.setVelocity(0, 0);
    } else {
      this.player.update();
    }
    this.waveManager.update(delta);

    // Footsteps while player is moving
    const vel = this.player.body?.velocity;
    if (vel && (Math.abs(vel.x) > 10 || Math.abs(vel.y) > 10)) {
      this.playFootstep();
    }

    // Ambient zombie groans
    this.tryPlayZombieGroan();

    // Hold-to-fire: only for auto weapons (SMG) when weapon slot is active.
    if (this.fireHeld && !this.shopOpen && this.activeSlot === 1 && this.equippedWeapon) {
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

  // ------- Hotbar -------

  /** Get list of slot indices that currently have items */
  private getAvailableSlots(): number[] {
    const available: number[] = [];
    if (this.equippedWeapon) available.push(1); // weapon
    if ((this.trapInventory.get("barricade" as TrapType) ?? 0) > 0) available.push(2);
    if ((this.trapInventory.get("landmine" as TrapType) ?? 0) > 0) available.push(3);
    return available;
  }

  private cycleSlot(dir: number) {
    const available = this.getAvailableSlots();
    if (available.length === 0) return; // nothing to cycle to

    const currentIdx = available.indexOf(this.activeSlot);
    let nextIdx: number;
    if (currentIdx === -1) {
      // Current slot no longer available, pick first available
      nextIdx = 0;
    } else {
      nextIdx = (currentIdx + dir + available.length) % available.length;
    }
    this.selectSlot(available[nextIdx]);
  }

  private selectSlot(index: number) {
    // Only allow selecting slots that have items (1=weapon, 2=barricade, 3=mine)
    const available = this.getAvailableSlots();
    if (index === 0 || !available.includes(index)) return; // can't select fists or empty slots

    this.activeSlot = index;
    const names = ["FISTS", "WEAPON", "BARRICADE", "MINE"];
    // Set trap index when selecting a trap slot
    if (this.activeSlot === 2) this.selectedTrapIndex = 0; // barricade
    if (this.activeSlot === 3) this.selectedTrapIndex = 1; // mine
    this.showWeaponMessage(`${names[this.activeSlot]} SELECTED`, "#ff4466");
  }

  private useActiveSlot() {
    switch (this.activeSlot) {
      case 1: this.fireWeapon(); break;
      case 2:
        this.selectedTrapIndex = 0; // barricade
        this.placeTrap();
        break;
      case 3:
        this.selectedTrapIndex = 1; // mine
        this.placeTrap();
        break;
    }
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

  /** Dan — EMP Grenade: throw in character's facing direction */
  private abilityEMPGrenade() {
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

    // Heal player if inside smoke (slow heal — 4 HP/s)
    const distToSmoke = Phaser.Math.Distance.Between(
      this.player.x, this.player.y, this.smokeX, this.smokeY
    );
    if (distToSmoke <= this.smokeRadius) {
      const healRate = 4; // HP per second — nerfed from 15
      const healAmount = healRate * (delta / 1000);
      this.player.stats.health = Math.min(
        this.player.stats.maxHealth,
        this.player.stats.health + healAmount
      );
    }

    // Enemies in smoke: slowed + health drain
    this.enemies.getChildren().forEach((obj) => {
      const enemy = obj as Enemy;
      if (!enemy.active) return;

      const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, this.smokeX, this.smokeY);
      if (dist <= this.smokeRadius) {
        // Slow enemies to 50% speed while in smoke
        const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
        const slowSpeed = enemy.speed * 0.5;
        enemy.body.setVelocity(
          Math.cos(angle) * slowSpeed,
          Math.sin(angle) * slowSpeed
        );
      }
    });

    // Accumulate smoke drain damage and apply in whole ticks (3 HP/s)
    this.smokeDrainAccum += 3 * (delta / 1000);
    if (this.smokeDrainAccum >= 1) {
      const dmg = Math.floor(this.smokeDrainAccum);
      this.smokeDrainAccum -= dmg;
      this.enemies.getChildren().forEach((obj) => {
        const enemy = obj as Enemy;
        if (!enemy.active) return;
        const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, this.smokeX, this.smokeY);
        if (dist <= this.smokeRadius) {
          const killed = enemy.takeDamage(dmg);
          if (killed) this.onEnemyKilled(enemy);
        }
      });
    }
  }

  private destroySmokescreen() {
    if (this.smokeCloud) {
      this.smokeCloud.destroy();
      this.smokeCloud = null;
    }
    this.smokeTimer = 0;
    this.smokeDrainAccum = 0;
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
      { fontFamily: "HorrorPixel, monospace", fontSize: "22px", color, fontStyle: "bold" }
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
      fontFamily: "HorrorPixel, monospace",
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

    // Game-over container at max depth so it renders above everything (trees, etc.)
    this.gameOverContainer = this.add.container(0, 0);
    this.gameOverContainer.setDepth(500);
    this.hudContainer.add(this.gameOverContainer);
    const goContainer = this.gameOverContainer;

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.75);
    overlay.fillRect(0, 0, width, height);
    overlay.setAlpha(0);
    goContainer.add(overlay);

    // Graveyard splash background (centered, scaled to cover, dimmed)
    const splash = this.add.image(width / 2, height / 2, "ui-splash-graveyard")
      .setAlpha(0)
      .setDisplaySize(width, height);
    splash.setTint(0x666688);
    goContainer.add(splash);

    const diedText = this.add
      .text(width / 2, height / 2 - 80, "YOU DIED", {
        fontSize: "100px",
        fontFamily: "ChainsawCarnage, HorrorPixel, monospace",
        color: "#cc2233",
      })
      .setOrigin(0.5)
      .setAlpha(0);
    goContainer.add(diedText);

    const waveReached = this.waveManager.wave;
    const statsText = this.add
      .text(
        width / 2,
        height / 2 + 50,
        `Wave ${waveReached}  |  ${this.kills} kills`,
        {
          fontSize: "36px",
          fontFamily: "HorrorPixel, monospace",
          color: "#cccccc",
        }
      )
      .setOrigin(0.5)
      .setAlpha(0);
    goContainer.add(statsText);

    // Fade in death screen, then check if score qualifies for leaderboard
    // Splash background fades to lower alpha so it doesn't overpower text
    this.tweens.add({
      targets: splash,
      alpha: 0.35,
      duration: 1000,
      ease: "Cubic.easeIn",
    });
    this.tweens.add({
      targets: [overlay, diedText, statsText],
      alpha: 1,
      duration: 800,
      ease: "Cubic.easeIn",
      onComplete: () => {
        this.time.delayedCall(1200, () => {
          this.checkLeaderboardQualification(overlay, waveReached);
        });
      },
    });
  }

  /** Check if the player's score qualifies for top 5 before showing entry */
  private async checkLeaderboardQualification(overlay: Phaser.GameObjects.Graphics, waveReached: number) {
    try {
      const response = await fetch("/api/leaderboard");
      if (response.ok) {
        const leaderboard = await response.json();
        // Qualifies if fewer than 5 entries or score beats the lowest
        if (leaderboard.length >= 5) {
          const lowest = leaderboard[leaderboard.length - 1];
          if (this.kills < lowest.kills || (this.kills === lowest.kills && waveReached <= lowest.wave)) {
            // Doesn't qualify — skip entry, show leaderboard directly
            this.showLeaderboardDisplay(leaderboard, null, []);
            return;
          }
        }
      }
    } catch (e) {
      // On error, allow entry anyway
    }
    this.showLeaderboardEntry(overlay, waveReached);
  }

  // ---------- Leaderboard ----------

  private showLeaderboardEntry(overlay: Phaser.GameObjects.Graphics, waveReached: number) {
    const { width, height } = this.cameras.main;
    let nameStr = "";
    let submitted = false;
    const MAX_LEN = 8;

    const fontBase = {
      fontFamily: "HorrorPixel, monospace",
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
    this.gameOverContainer.add(promptText);

    // Typed name display with blinking cursor
    const nameText = this.add
      .text(width / 2, height / 2 + 155, "_", {
        ...fontBase,
        fontSize: "52px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.gameOverContainer.add(nameText);

    // Hint text
    const hintText = this.add
      .text(width / 2, height / 2 + 220, "TYPE YOUR NAME    ENTER TO SUBMIT", {
        ...fontBase,
        fontSize: "18px",
        color: "#666666",
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.gameOverContainer.add(hintText);

    // Fade in the entry UI
    const entryElements = [promptText, nameText, hintText];
    this.tweens.add({
      targets: entryElements,
      alpha: 1,
      duration: 400,
      ease: "Cubic.easeIn",
    });

    // Blink cursor
    let cursorVisible = true;
    this.time.addEvent({
      delay: 400,
      loop: true,
      callback: () => {
        if (submitted) return;
        cursorVisible = !cursorVisible;
        nameText.setText(nameStr + (cursorVisible ? "_" : ""));
      },
    });

    // Key handler — type letters directly
    const keyHandler = (event: KeyboardEvent) => {
      if (submitted) return;

      if (event.key === "Enter") {
        if (nameStr.length === 0) return; // need at least 1 char
        submitted = true;
        this.input.keyboard?.off("keydown", keyHandler);
        nameText.setText(nameStr);
        hintText.setText("SUBMITTING...");
        hintText.setColor("#cc3333");
        this.submitLeaderboardScore(
          nameStr,
          this.kills,
          waveReached,
          this.characterDef.id,
          overlay,
          entryElements
        );
      } else if (event.key === "Backspace") {
        nameStr = nameStr.slice(0, -1);
        nameText.setText(nameStr + "_");
      } else if (/^[a-zA-Z0-9]$/.test(event.key) && nameStr.length < MAX_LEN) {
        nameStr += event.key.toUpperCase();
        nameText.setText(nameStr + "_");
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
    const fontBase = { fontFamily: "HorrorPixel, monospace" };

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
        fontFamily: "ChainsawCarnage, HorrorPixel, monospace",
        fontSize: "64px",
        color: "#cc2233",
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.gameOverContainer.add(title);
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
      this.gameOverContainer.add(ht);
      boardContainer.push(ht);
    }

    // Separator line
    const sep = this.add.graphics();
    sep.lineStyle(1, 0x666666, 0.5);
    sep.lineBetween(rankX, headerY + 16, waveX + 60, headerY + 16);
    sep.setAlpha(0);
    this.gameOverContainer.add(sep);
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
        this.gameOverContainer.add(rt);
        boardContainer.push(rt);
      }

      // Highlight bar behind the player's row
      if (isHighlighted) {
        const bar = this.add.graphics();
        bar.fillStyle(0xffcc00, 0.1);
        bar.fillRect(rankX - 10, y - rowHeight / 2, waveX + 70 - rankX, rowHeight);
        bar.setAlpha(0);
        this.gameOverContainer.add(bar);
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
      this.gameOverContainer.add(emptyText);
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
    this.gameOverContainer.add(continueText);
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
        fontFamily: "HorrorPixel, monospace",
        color: "#d0c8e0",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setVisible(false);
    this.hudContainer.add(this.pauseTitle);

    this.pauseQuitBtn = this.add
      .text(width / 2, height / 2 + 40, "[ Q ]  Quit to Menu", {
        fontSize: "30px",
        fontFamily: "HorrorPixel, monospace",
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
        fontFamily: "HorrorPixel, monospace",
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
        fontFamily: "HorrorPixel, monospace",
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
      fontSize: "36px", fontFamily: "HorrorPixel, monospace",
      color: "#d0c8e0", fontStyle: "bold",
    }).setOrigin(0.5);
    this.settingsContainer.add(title);

    let yPos = top + 110;
    const labelStyle = { fontSize: "26px", fontFamily: "HorrorPixel, monospace", color: "#b0a8c0" };
    const valStyle = { fontSize: "26px", fontFamily: "HorrorPixel, monospace", color: "#d0c8e0" };

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
      fontSize: "26px", fontFamily: "HorrorPixel, monospace", color: "#8a82a0",
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
      fontSize: "26px", fontFamily: "HorrorPixel, monospace", color: "#b0a8c0",
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
    this.shopCards = [];

    const items = BALANCE.shop.items;
    const panelW = 900;
    const panelH = 560;
    const panelLeft = width / 2 - panelW / 2;
    const panelTop = height / 2 - panelH / 2;

    // Dim overlay
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.8);
    overlay.fillRect(0, 0, width, height);
    this.shopContainer.add(overlay);

    // Horror panel frame (9-slice)
    const panelBg = this.add.nineslice(
      width / 2, height / 2,
      "ui-horror-panel",
      undefined,
      panelW, panelH,
      20, 20, 20, 20
    ).setOrigin(0.5).setAlpha(0.95);
    this.shopContainer.add(panelBg);

    // Dark fill inside panel for readability
    const bgOverlay = this.add.graphics();
    bgOverlay.fillStyle(0x080810, 0.7);
    bgOverlay.fillRect(panelLeft + 8, panelTop + 8, panelW - 16, panelH - 16);
    this.shopContainer.add(bgOverlay);

    // Header: SHOP + cash
    const shopTitle = this.add.text(panelLeft + 32, panelTop + 28, "SHOP", {
      fontSize: "42px", fontFamily: "ChainsawCarnage, HorrorPixel, monospace", color: "#ff2244", letterSpacing: 8,
    }).setOrigin(0, 0.5);
    this.shopContainer.add(shopTitle);

    this.shopCashText = this.add.text(panelLeft + panelW - 32, panelTop + 28, "$0", {
      fontSize: "36px", fontFamily: "HorrorPixel, monospace", color: "#e8c840",
    }).setOrigin(1, 0.5);
    this.shopContainer.add(this.shopCashText);

    // Header divider
    const headerLine = this.add.image(width / 2, panelTop + 54, "ui-horror-divider")
      .setDisplaySize(panelW - 48, 6);
    this.shopContainer.add(headerLine);

    // Three columns
    const colW = 270;
    const colX = [panelLeft + 32, panelLeft + 32 + colW + 12, panelLeft + 32 + (colW + 12) * 2];
    const colHeaders = ["SUPPLIES", "WEAPONS", "TRAPS"];

    // Column dividers
    const dividers = this.add.graphics();
    dividers.lineStyle(1, 0x331122, 0.6);
    dividers.lineBetween(colX[1] - 6, panelTop + 64, colX[1] - 6, panelTop + panelH - 50);
    dividers.lineBetween(colX[2] - 6, panelTop + 64, colX[2] - 6, panelTop + panelH - 50);
    this.shopContainer.add(dividers);

    // Column headers
    for (let c = 0; c < 3; c++) {
      const header = this.add.text(colX[c], panelTop + 74, colHeaders[c], {
        fontSize: "16px", fontFamily: "HorrorPixel, monospace", color: "#775566", letterSpacing: 4,
      });
      this.shopContainer.add(header);
    }

    // Item-to-column mapping
    const iconMap: Record<string, string> = {
      pistol: "item-pistol", shotgun: "item-shotgun", smg: "item-smg",
      ammo: "item-ammo", extraClip: "item-ammo-box",
      barricade: "trap-barricade", landmine: "item-landmine",
      heal: "item-bandage", dmgBoost: "item-syringe",
    };

    // Organize items into columns
    const columns: { idx: number; item: typeof items[number] }[][] = [[], [], []];
    items.forEach((item, idx) => {
      const id = item.id;
      if (id === "heal" || id === "dmgBoost") columns[0].push({ idx, item });
      else if (["pistol", "shotgun", "smg", "ammo", "extraClip"].includes(id)) columns[1].push({ idx, item });
      else columns[2].push({ idx, item });
    });

    // Build navigation grid: [col][row] -> original item index
    this.shopGrid = columns.map(col => col.map(entry => entry.idx));

    // Render item cards
    const cardH = 72;
    const cardGap = 6;
    const cardsStartY = panelTop + 100;
    let keyNum = 1;

    for (let c = 0; c < 3; c++) {
      for (let r = 0; r < columns[c].length; r++) {
        const { idx, item } = columns[c][r];
        const cx = colX[c];
        const cy = cardsStartY + r * (cardH + cardGap);

        // Card background
        const cardBg = this.add.graphics();
        cardBg.fillStyle(0x141420, 0.8);
        cardBg.fillRoundedRect(cx, cy, colW, cardH, 3);
        this.shopContainer.add(cardBg);

        // Key badge
        const keyText = this.add.text(cx + 8, cy + 8, `[${keyNum}]`, {
          fontSize: "15px", fontFamily: "HorrorPixel, monospace", color: "#ff4466",
        });
        this.shopContainer.add(keyText);

        // Icon
        const texKey = iconMap[item.id];
        let icon: Phaser.GameObjects.Image | null = null;
        if (texKey && this.textures.exists(texKey)) {
          icon = this.add.image(cx + 44, cy + cardH / 2, texKey).setScale(2.4);
          this.shopContainer.add(icon);
        }

        // Name
        const nameText = this.add.text(cx + 76, cy + 12, item.name.toUpperCase(), {
          fontSize: "20px", fontFamily: "HorrorPixel, monospace", color: "#e0daf0",
        });
        this.shopContainer.add(nameText);

        // Description
        const descText = this.add.text(cx + 76, cy + 36, item.desc, {
          fontSize: "15px", fontFamily: "HorrorPixel, monospace", color: "#8a8aaa",
          wordWrap: { width: colW - 90 },
        });
        this.shopContainer.add(descText);

        // Price (right-aligned)
        const priceText = this.add.text(cx + colW - 10, cy + cardH / 2, "", {
          fontSize: "22px", fontFamily: "HorrorPixel, monospace", color: "#e8c840",
        }).setOrigin(1, 0.5);
        this.shopContainer.add(priceText);

        // Click zone
        const zone = this.add.zone(cx + colW / 2, cy + cardH / 2, colW, cardH)
          .setInteractive({ useHandCursor: true });
        zone.on("pointerdown", () => this.buyItem(idx));
        zone.on("pointerover", () => {
          this.shopSelectedIndex = idx;
          this.updateShopDisplay();
        });
        this.shopContainer.add(zone);

        this.shopCards.push({ bg: cardBg, icon, name: nameText, desc: descText, price: priceText, key: keyText, zone });

        keyNum++;
      }
    }

    // Footer
    const footer = this.add.text(width / 2, panelTop + panelH - 20, "[ESC/B] Close  \u00B7  WASD/Arrows navigate  \u00B7  Enter buy", {
      fontSize: "16px", fontFamily: "HorrorPixel, monospace", color: "#555566",
    }).setOrigin(0.5);
    this.shopContainer.add(footer);

    // Key bindings — number keys for direct buy + WASD/arrow navigation
    if (this.input.keyboard) {
      const enterKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
      enterKey.on("down", () => { if (this.shopOpen) this.buyItem(this.shopSelectedIndex); });

      // Build flat index mapping: keyNum -> original item index
      const keyToIdx: number[] = [];
      for (let c = 0; c < 3; c++) {
        for (let r = 0; r < columns[c].length; r++) {
          keyToIdx.push(columns[c][r].idx);
        }
      }

      const keyCodes = [
        Phaser.Input.Keyboard.KeyCodes.ONE, Phaser.Input.Keyboard.KeyCodes.TWO,
        Phaser.Input.Keyboard.KeyCodes.THREE, Phaser.Input.Keyboard.KeyCodes.FOUR,
        Phaser.Input.Keyboard.KeyCodes.FIVE, Phaser.Input.Keyboard.KeyCodes.SIX,
        Phaser.Input.Keyboard.KeyCodes.SEVEN, Phaser.Input.Keyboard.KeyCodes.EIGHT,
        Phaser.Input.Keyboard.KeyCodes.NINE,
      ];
      keyCodes.forEach((code, i) => {
        if (i < keyToIdx.length) {
          const key = this.input.keyboard!.addKey(code);
          key.on("down", () => { if (this.shopOpen) this.buyItem(keyToIdx[i]); });
        }
      });

      // WASD / Arrow navigation through shop grid
      this.input.keyboard.on("keydown", (event: KeyboardEvent) => {
        if (!this.shopOpen || this.shopGrid.length === 0) return;
        let col = this.shopNavCol;
        let row = this.shopNavRow;
        let moved = false;

        if (event.key === "a" || event.key === "A" || event.key === "ArrowLeft") {
          col = Math.max(0, col - 1);
          moved = true;
        } else if (event.key === "d" || event.key === "D" || event.key === "ArrowRight") {
          col = Math.min(this.shopGrid.length - 1, col + 1);
          moved = true;
        } else if (event.key === "w" || event.key === "W" || event.key === "ArrowUp") {
          row = Math.max(0, row - 1);
          moved = true;
        } else if (event.key === "s" || event.key === "S" || event.key === "ArrowDown") {
          row = Math.min((this.shopGrid[col]?.length ?? 1) - 1, row + 1);
          moved = true;
        }

        if (moved) {
          // Clamp row if new column is shorter
          if (!this.shopGrid[col] || this.shopGrid[col].length === 0) return;
          row = Math.min(row, this.shopGrid[col].length - 1);
          this.shopNavCol = col;
          this.shopNavRow = row;
          this.shopSelectedIndex = this.shopGrid[col][row];
          this.updateShopDisplay();
        }
      });
    }
  }

  private updateShopDisplay() {
    const items = BALANCE.shop.items;

    // Reorganize to match card order
    const columns: { idx: number; item: typeof items[number] }[][] = [[], [], []];
    items.forEach((item, idx) => {
      const id = item.id;
      if (id === "heal" || id === "dmgBoost") columns[0].push({ idx, item });
      else if (["pistol", "shotgun", "smg", "ammo", "extraClip"].includes(id)) columns[1].push({ idx, item });
      else columns[2].push({ idx, item });
    });
    const flat = [...columns[0], ...columns[1], ...columns[2]];

    this.shopCashText.setText(`$${this.currency}`);

    flat.forEach((entry, cardIdx) => {
      const card = this.shopCards[cardIdx];
      if (!card) return;
      const { idx, item } = entry;
      const unlockWave = (item as any).unlockWave;
      const locked = unlockWave && this.waveManager.wave < unlockWave;
      const price = this.getItemPrice(idx);
      const canAfford = this.currency >= price;
      const isEquipped = ["pistol", "shotgun", "smg"].includes(item.id)
        && this.equippedWeapon === item.id;

      if (locked) {
        card.name.setColor("#444055");
        card.desc.setText("???");
        card.desc.setColor("#333044");
        card.price.setText(`WAVE ${unlockWave}`);
        card.price.setColor("#553333");
        if (card.icon) card.icon.setAlpha(0.3);
        card.key.setColor("#333044");
      } else if (isEquipped) {
        card.name.setColor("#ff4466");
        card.desc.setText(item.desc);
        card.desc.setColor("#7a7a99");
        card.price.setText("EQUIPPED");
        card.price.setColor("#ff4466");
        if (card.icon) card.icon.setAlpha(1);
        card.key.setColor("#ff4466");
      } else {
        card.name.setColor("#e0daf0");
        card.desc.setText(item.desc);
        card.desc.setColor("#7a7a99");
        card.price.setText(`$${price}`);
        card.price.setColor(canAfford ? "#e8c840" : "#663333");
        if (card.icon) card.icon.setAlpha(canAfford ? 1 : 0.5);
        card.key.setColor(canAfford ? "#ff4466" : "#333044");
      }

      // Hover highlight
      const isSelected = idx === this.shopSelectedIndex;
      const { width: ww, height: hh } = this.cameras.main;
      const panelW = 900;
      const panelTop = hh / 2 - 280;
      const panelLeft = ww / 2 - panelW / 2;
      const colW = 270;
      const colX = [panelLeft + 32, panelLeft + 32 + colW + 12, panelLeft + 32 + (colW + 12) * 2];
      const cardH = 72;
      const cardGap = 6;
      const cardsStartY = panelTop + 100;

      // Find which column and row this card is in
      let col = 0, row = cardIdx;
      if (cardIdx >= columns[0].length + columns[1].length) { col = 2; row = cardIdx - columns[0].length - columns[1].length; }
      else if (cardIdx >= columns[0].length) { col = 1; row = cardIdx - columns[0].length; }
      const cx = colX[col];
      const cy = cardsStartY + row * (cardH + cardGap);

      card.bg.clear();
      card.bg.fillStyle(isSelected ? 0x1a0a10 : 0x0c0c14, 0.8);
      card.bg.fillRoundedRect(cx, cy, colW, cardH, 3);
      if (isSelected) {
        card.bg.lineStyle(1, 0xff2244, 0.5);
        card.bg.strokeRoundedRect(cx, cy, colW, cardH, 3);
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
    this.shopNavCol = 0;
    this.shopNavRow = 0;
    this.shopSelectedIndex = this.shopGrid[0]?.[0] ?? 0;
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
        fontFamily: "HorrorPixel, monospace",
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
        fontFamily: "HorrorPixel, monospace",
        color: "#ff4444",
        fontStyle: "bold",
      })
      .setVisible(false);
    this.hudContainer.add(this.burnoutText);

    this.levelText = this.add.text(20, 82, "Lv.1", {
      fontSize: "18px",
      fontFamily: "HorrorPixel, monospace",
      color: "#d4a843",
      fontStyle: "bold",
    });
    this.hudContainer.add(this.levelText);

    this.xpBar = this.add.graphics();

    // ===== TOP-RIGHT: Skull + kills, Coin + gold =====
    const skullIcon = this.add.image(width - 100, 20, "ui-icon-skull").setOrigin(0, 0).setScale(S);
    this.hudContainer.add(skullIcon);

    this.killText = this.add
      .text(width - 64, 22, "0", {
        fontSize: "24px",
        fontFamily: "HorrorPixel, monospace",
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
        fontFamily: "HorrorPixel, monospace",
        color: "#e8c840",
        fontStyle: "bold",
      })
      .setOrigin(0, 0);
    this.hudContainer.add(this.currencyText);

    // ===== TOP-CENTER: Wave =====
    this.waveText = this.add
      .text(width / 2, 20, "WAVE 1", {
        fontSize: "28px",
        fontFamily: "HorrorPixel, monospace",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0);
    this.hudContainer.add(this.waveText);

    this.waveStatusText = this.add
      .text(width / 2, 52, "", {
        fontSize: "20px",
        fontFamily: "HorrorPixel, monospace",
        color: "#cccccc",
      })
      .setOrigin(0.5, 0);
    this.hudContainer.add(this.waveStatusText);

    // ===== BOTTOM-LEFT: Equipment slot strip =====
    this.slotBgs = [];
    this.slotIcons = [];
    this.slotLabels = [];
    this.slotCounts = [];

    const slotW = 72;
    const slotH = 80;
    const slotGap = 8;
    const slotStartX = 20;
    const slotY = height - slotH - 16;
    const slotNames = ["FISTS", "WEAPON", "BARR", "MINE"];
    const slotTextures = ["item-bandage", "item-pistol", "trap-barricade", "item-landmine"];

    for (let i = 0; i < 4; i++) {
      const sx = slotStartX + i * (slotW + slotGap);

      const bg = this.add.graphics();
      bg.fillStyle(0x0a0a1a, 0.7);
      bg.fillRoundedRect(sx, slotY, slotW, slotH, 4);
      bg.lineStyle(1, 0x2a2a40, 1);
      bg.strokeRoundedRect(sx, slotY, slotW, slotH, 4);
      this.hudContainer.add(bg);
      this.slotBgs.push(bg);

      const icon = this.add.image(sx + slotW / 2, slotY + 28, slotTextures[i])
        .setScale(0.6)
        .setAlpha(i === 0 ? 1 : 0.4);
      this.hudContainer.add(icon);
      this.slotIcons.push(icon);

      const label = this.add.text(sx + slotW / 2, slotY + 54, slotNames[i], {
        fontSize: "13px",
        fontFamily: "HorrorPixel, monospace",
        color: "#aaaacc",
        fontStyle: "bold",
      }).setOrigin(0.5, 0);
      this.hudContainer.add(label);
      this.slotLabels.push(label);

      const count = this.add.text(sx + slotW / 2, slotY + 68, "", {
        fontSize: "12px",
        fontFamily: "HorrorPixel, monospace",
        color: "#e8c840",
      }).setOrigin(0.5, 0);
      this.hudContainer.add(count);
      this.slotCounts.push(count);
    }

    // ===== BOTTOM-LEFT: Ability (above slot strip) =====
    this.abilityNameText = this.add
      .text(20, height - slotH - 42, "", {
        fontSize: "18px",
        fontFamily: "HorrorPixel, monospace",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0, 0);
    this.hudContainer.add(this.abilityNameText);

    this.abilityStatusText = this.add
      .text(200, height - slotH - 42, "", {
        fontSize: "18px",
        fontFamily: "HorrorPixel, monospace",
        color: "#ff4466",
      })
      .setOrigin(0, 0);
    this.hudContainer.add(this.abilityStatusText);

    // ===== CENTER: Announcements =====
    this.waveAnnouncement = this.add
      .text(width / 2, height / 2 - 80, "", {
        fontSize: "72px",
        fontFamily: "HorrorPixel, monospace",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.hudContainer.add(this.waveAnnouncement);

    this.countdownText = this.add
      .text(width / 2, height / 2, "", {
        fontSize: "128px",
        fontFamily: "HorrorPixel, monospace",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.hudContainer.add(this.countdownText);

    // Bottom-center: Controls hint
    const controls = this.add
      .text(width / 2, height - 8, "WASD move | CLICK/SPACE punch | RIGHT-CLICK/F use item | Q/E cycle | R ability | B shop", {
        fontSize: "14px",
        fontFamily: "HorrorPixel, monospace",
        color: "#444455",
      })
      .setOrigin(0.5, 1);
    this.hudContainer.add(controls);

    // Destroy old Phaser HUD elements — React overlay handles all of these now.
    // Keep: waveAnnouncement, countdownText, controls (Phaser-only overlays)
    hpIcon.destroy();
    this.healthBar.destroy();
    staIcon.destroy();
    this.staminaBar.destroy();
    this.burnoutText.destroy();
    this.levelText.destroy();
    this.xpBar.destroy();
    skullIcon.destroy();
    this.killText.destroy();
    coinIcon.destroy();
    this.currencyText.destroy();
    this.waveText.destroy();
    this.waveStatusText.destroy();
    this.abilityNameText.destroy();
    this.abilityStatusText.destroy();
    for (let i = 0; i < this.slotBgs.length; i++) {
      this.slotBgs[i].destroy();
      this.slotIcons[i].destroy();
      this.slotLabels[i].destroy();
      this.slotCounts[i].destroy();
    }
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

    // Wave state (needed for countdown + React)
    const state = this.waveManager.state;
    const wave = this.waveManager.wave;
    let countdownSecs = -1;

    if (state === "pre_game") {
      countdownSecs = this.waveManager.getPreGameTimeLeft();
    } else if (state === "intermission") {
      if (this.waveManager.isReadyUp()) {
        countdownSecs = this.waveManager.getReadyCountdown();
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

    // Push state to React HUD overlay
    hudState.update({
      health: this.player.stats.health,
      maxHealth: this.player.stats.maxHealth,
      stamina: this.player.stats.stamina,
      maxStamina: this.player.stats.maxStamina,
      burnedOut: this.player.burnedOut,
      level: this.levelingSystem.level,
      activeSlot: this.activeSlot,
      equippedWeapon: this.equippedWeapon,
      ammo: this.ammo,
      maxAmmo: this.maxAmmo,
      barricadeCount: this.trapInventory.get("barricade" as TrapType) ?? 0,
      mineCount: this.trapInventory.get("landmine" as TrapType) ?? 0,
      abilityName: this.characterDef.ability.name,
      abilityCooldown: this.abilityCooldownTimer > 0 ? this.abilityCooldownTimer / 1000 : 0,
      abilityKey: "R",
      kills: this.kills,
      currency: this.currency,
      wave,
      waveState: state === "clearing" ? "active" : state as "pre_game" | "active" | "intermission",
      waveEnemiesLeft: state === "active" || state === "clearing" ? this.waveManager.getEnemiesRemaining() : 0,
      waveCountdown: countdownSecs,
      characterName: this.characterDef.name,
      characterId: this.characterDef.id,
      hudVisible: true,
      shopOpen: this.shopOpen,
      paused: false,
      gameOver: this.gameOver,
    });
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

    // Horror panel behind buff cards
    const luPanelW = options.length * 280 + (options.length - 1) * 40 + 80;
    const luPanelH = 380;
    const luPanelX = width / 2;
    const luPanelY = height / 2 + 10;
    const luPanel = this.add.nineslice(
      luPanelX, luPanelY,
      "ui-horror-panel",
      undefined,
      luPanelW, luPanelH,
      20, 20, 20, 20
    ).setAlpha(0.9);
    this.levelUpOverlay.add(luPanel);

    // Dark fill for readability
    const luBgOverlay = this.add.graphics();
    luBgOverlay.fillStyle(0x080810, 0.6);
    luBgOverlay.fillRect(luPanelX - luPanelW / 2 + 8, luPanelY - luPanelH / 2 + 8, luPanelW - 16, luPanelH - 16);
    this.levelUpOverlay.add(luBgOverlay);

    // "LEVEL UP" title
    const title = this.add.text(width / 2, height / 2 - 180, `LEVEL ${level}`, {
      fontSize: "60px",
      fontFamily: "HorrorPixel, monospace",
      color: "#d4a843",
      fontStyle: "bold",
    }).setOrigin(0.5);
    this.levelUpOverlay.add(title);

    const subtitle = this.add.text(width / 2, height / 2 - 120, "Choose a buff", {
      fontSize: "26px",
      fontFamily: "HorrorPixel, monospace",
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
        fontFamily: "HorrorPixel, monospace",
        color: "#888888",
      }).setOrigin(0.5);
      this.levelUpOverlay.add(catLabel);

      // Buff name
      const nameText = this.add.text(cx, cy - 30, opt.name, {
        fontSize: "26px",
        fontFamily: "HorrorPixel, monospace",
        color: "#ffffff",
        fontStyle: "bold",
      }).setOrigin(0.5);
      this.levelUpOverlay.add(nameText);

      // Description
      const descText = this.add.text(cx, cy + 16, opt.desc, {
        fontSize: "20px",
        fontFamily: "HorrorPixel, monospace",
        color: "#cccccc",
      }).setOrigin(0.5);
      this.levelUpOverlay.add(descText);

      // Tier label
      const tierText = this.add.text(cx, cy + 56, opt.tier.toUpperCase(), {
        fontSize: "16px",
        fontFamily: "HorrorPixel, monospace",
        color: "#666666",
      }).setOrigin(0.5);
      this.levelUpOverlay.add(tierText);

      // Key hint
      const keyText = this.add.text(cx, cy + cardH / 2 + 24, `[${i + 1}]`, {
        fontSize: "26px",
        fontFamily: "HorrorPixel, monospace",
        color: "#d4a843",
        fontStyle: "bold",
      }).setOrigin(0.5);
      this.levelUpOverlay.add(keyText);

      // Click zone
      const hitZone = this.add.zone(cx, cy, cardW, cardH).setInteractive();
      hitZone.on("pointerdown", () => this.selectLevelUpBuff(i));
      this.levelUpOverlay.add(hitZone);
    });

    // Keyboard shortcuts — use a keydown listener instead of addKey().once
    // so consecutive level-ups don't lose their bindings
    if (this.input.keyboard) {
      const levelUpKeyHandler = (event: KeyboardEvent) => {
        if (!this.levelUpActive) return;
        if (event.key === "1") this.selectLevelUpBuff(0);
        else if (event.key === "2" && options.length > 1) this.selectLevelUpBuff(1);
      };
      this.input.keyboard.on("keydown", levelUpKeyHandler);
      // Store ref so selectLevelUpBuff can clean it up
      (this.levelUpOverlay as any)._keyHandler = levelUpKeyHandler;
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

    // Clean up UI + keyboard listener
    this.levelUpActive = false;
    const handler = (this.levelUpOverlay as any)._keyHandler;
    if (handler) this.input.keyboard?.off("keydown", handler);
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
