import Phaser from "phaser";
import { Player } from "../entities/Player";
import { Enemy } from "../entities/Enemy";
import { Projectile, ensureBulletTexture } from "../entities/Projectile";
import { Trap, TrapType, ensureTrapTextures } from "../entities/Trap";
import { CHARACTERS, CharacterDef, BASE_STATS } from "../data/characters";
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
  private paused = false;
  private damageBoostActive = false;
  private baseDamage = 0;

  // Wave system
  private waveManager!: WaveManager;

  // RPG Leveling
  private levelingSystem!: LevelingSystem;
  private levelUpActive = false;
  private pendingLevelUps: { level: number; options: BuffOption[] }[] = [];

  // Weapon state
  private equippedWeapon: string | null = null; // null = fists
  private magazineAmmo = 0; // rounds in current magazine
  private magazineSize = 0; // max rounds per magazine
  private reserveAmmo = 0; // rounds in reserve (remaining clips)
  private lastFireTime = 0;
  private fireHeld = false;
  private dryFired = false; // true after empty click, reset on trigger release
  private reloading = false;
  private reloadTimer: Phaser.Time.TimerEvent | null = null;
  private projectiles!: Phaser.Physics.Arcade.Group;

  // Melee cooldown
  private lastPunchTime = 0;

  // Trap state
  private trapInventory: Map<TrapType, number> = new Map();
  private selectedTrapIndex = 0; // cycles through available trap types
  private readonly trapTypes: TrapType[] = ["barricade", "landmine"];
  private barricadeVertical = false; // toggle for barricade orientation
  private barricadeGhost!: Phaser.GameObjects.Image;
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

  // HUD container — scrollFactor(0), scaled 1/zoom so it renders at screen-space
  private hudContainer!: Phaser.GameObjects.Container;
  private minimap!: Phaser.Cameras.Scene2D.Camera;
  private minimapDot!: Phaser.GameObjects.Graphics;
  private settingsOpen = false;
  private sfxVolume = 0.5;
  private musicVolume = 1;
  private sfxMuted = false;
  private musicMuted = false;
  private wheelHandler?: (e: WheelEvent) => void;
  private zoomEnabled = false;
  private ambientSounds: Phaser.Sound.BaseSound[] = [];
  private devMode = false;
  private statsOpen = false;
  private shopSelectedIndex = 0;
  private shopNavCol = 0;
  private shopNavRow = 0;
  private shopGrid: number[][] = []; // [col][row] -> original item index

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
    // Start with pistol — 3 clips worth (can buy up to totalClips max)
    const pistolDef = BALANCE.weapons.pistol;
    this.equippedWeapon = "pistol";
    this.magazineSize = pistolDef.magazineSize;
    this.magazineAmmo = pistolDef.magazineSize; // 1 mag loaded
    this.reserveAmmo = pistolDef.magazineSize * 2; // 2 reserve clips (24 total)
    this.activeSlot = 1;
    this.reloading = false;
    this.reloadTimer = null;
    this.lastPunchTime = 0;
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
    const structTs = map.addTilesetImage("basic-struct", "ts-basic-struct");
    const wallTs = map.addTilesetImage("basic-wall", "ts-basic-wall");
    const bpGroundTs = map.addTilesetImage("bp-ground-32", "ts-bp-ground-32");
    const allTilesets = [grassTs!, structTs!, wallTs!, bpGroundTs!];
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

    // Obstacles group — must be created before fence so fence can register collision
    this.obstacles = this.physics.add.staticGroup();

    // East tree wall — individual sprites so they overlap naturally
    this.spawnTreeWall();

    // Fence border around the map perimeter
    this.spawnFenceBorder();
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
    this.minimap.setZoom(mmSize / ENDICOTT_MAP_W * 3);
    this.minimap.setBounds(0, 0, ENDICOTT_MAP_W, ENDICOTT_MAP_H);
    this.minimap.setBackgroundColor(0x0a0a14);
    this.minimap.setName("minimap");

    // Circular mask for minimap
    const mmMaskGraphics = this.make.graphics({ x: 0, y: 0, add: false } as any);
    mmMaskGraphics.fillStyle(0xffffff);
    mmMaskGraphics.fillCircle(mmX + mmSize / 2, mmY + mmSize / 2, mmSize / 2);
    const mmMask = mmMaskGraphics.createGeometryMask();
    this.minimap.setMask(mmMask);

    // Push minimap position to React for border rendering
    hudState.update({ minimapX: mmX, minimapY: mmY, minimapSize: mmSize });


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

    // Barricade placement ghost preview
    this.barricadeGhost = this.add.image(0, 0, "trap-barricade");
    this.barricadeGhost.setAlpha(0.4);
    this.barricadeGhost.setTint(0x44ff44);
    this.barricadeGhost.setDepth(3);
    this.barricadeGhost.setVisible(false);

    // --- Hotbar input: Q/E cycle, 1-4 direct select, SPACE/F use active slot ---
    if (this.input.keyboard) {
      // SPACE: use active slot OR ready-up during intermission
      const space = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.SPACE
      );
      space.on("down", () => {
        if (this.gameOver || this.paused) return;
        if (this.levelUpActive) return; // Don't punch while picking buffs
        if (this.waveManager.state === "pre_game") {
          this.waveManager.skipPreGame();
          return;
        }
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
      fKey.on("up", () => { this.fireHeld = false; this.dryFired = false; this.player.stopHoldShoot(); });

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

      // G: manual reload
      const gKey = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.G
      );
      gKey.on("down", () => {
        if (!this.gameOver && !this.paused && !this.shopOpen) this.startReload();
      });
    }
    // Left click = melee punch, Right click = use active item slot
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.gameOver || this.paused || this.shopOpen) return;
      if (pointer.button === 2) {
        this.fireHeld = true;
        this.useActiveSlot();
      } else if (pointer.button === 0) {
        this.meleeAttack();
      }
    });
    this.input.mouse?.disableContextMenu();

    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 2) {
        this.fireHeld = false;
        this.dryFired = false;
        this.player.stopHoldShoot();
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
        if (this.statsOpen) { this.statsOpen = false; hudState.update({ statsOpen: false }); return; }
        if (this.settingsOpen) { this.settingsOpen = false; hudState.update({ settingsOpen: false }); return; }
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
        } else if (this.devMode || this.waveManager.state === "intermission" || this.waveManager.state === "pre_game") {
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

      // TAB key to toggle stats screen
      const tabKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);
      tabKey.on("down", (event: KeyboardEvent) => {
        event?.preventDefault?.();
        if (this.gameOver) return;
        this.statsOpen = !this.statsOpen;
        hudState.update({ statsOpen: this.statsOpen });
        if (this.statsOpen && !this.paused) {
          this.pauseGame();
        }
      });

      // Dev mode — backtick key, localhost only
      if (typeof window !== "undefined" && window.location.hostname === "localhost") {
        const backtick = this.input.keyboard.addKey(
          Phaser.Input.Keyboard.KeyCodes.BACKTICK
        );
        backtick.on("down", () => {
          this.devMode = !this.devMode;
          if (this.devMode) {
            this.currency = 99999;
            this.showWeaponMessage("DEV MODE ON", "#ff00ff");
          } else {
            this.player.invincible = false;
            hudState.update({ devPanelOpen: false, devSpawningDisabled: false });
            this.waveManager.spawningDisabled = false;
            this.showWeaponMessage("DEV MODE OFF", "#888888");
          }
          hudState.update({ devMode: this.devMode });
        });

        // F1: give $9999
        const f1 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F1);
        f1.on("down", () => {
          if (!this.devMode) return;
          this.currency += 9999;
          this.showWeaponMessage("DEV: +$9999", "#ff00ff");
        });

        // F2: skip to next wave
        const f2 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F2);
        f2.on("down", () => {
          if (!this.devMode) return;
          // Kill all enemies and clear spawn queue
          this.enemies.getChildren().forEach((e) => {
            if (e.active) {
              (e as Enemy).takeDamage(999999);
              if (e.active) e.destroy(); // force destroy if still alive
            }
          });
          // Zero out remaining spawns so wave ends immediately
          (this.waveManager as any).enemiesToSpawn = 0;
          (this.waveManager as any).enemiesAlive = 0;
          this.showWeaponMessage("DEV: WAVE SKIP", "#ff00ff");
        });

        // F3: full heal
        const f3 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F3);
        f3.on("down", () => {
          if (!this.devMode) return;
          this.player.stats.health = this.player.stats.maxHealth;
          this.player.stats.stamina = this.player.stats.maxStamina;
          this.player.burnedOut = false;
          this.showWeaponMessage("DEV: FULL HEAL", "#ff00ff");
        });

        // F4: god mode toggle (invincible)
        const f4 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F4);
        f4.on("down", () => {
          if (!this.devMode) return;
          this.player.invincible = !this.player.invincible;
          this.showWeaponMessage(this.player.invincible ? "DEV: GOD MODE ON" : "DEV: GOD MODE OFF", "#ff00ff");
        });

        // F5: dev panel toggle
        const f5 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F5);
        f5.on("down", () => {
          if (!this.devMode) return;
          const isOpen = hudState.getField("devPanelOpen");
          hudState.update({ devPanelOpen: !isOpen });
        });

        // Register dev action handler
        hudState.registerDevAction((action: string, payload?: any) => {
          if (!this.devMode) return;
          switch (action) {
            case "closePanel":
              hudState.update({ devPanelOpen: false });
              break;
            case "jumpToWave":
              this.waveManager.devJumpToWave(payload as number);
              this.showWeaponMessage(`DEV: JUMP TO WAVE ${payload}`, "#ff00ff");
              break;
            case "toggleSpawning":
              this.waveManager.spawningDisabled = !this.waveManager.spawningDisabled;
              hudState.update({ devSpawningDisabled: this.waveManager.spawningDisabled });
              this.showWeaponMessage(
                this.waveManager.spawningDisabled ? "DEV: SPAWNING OFF" : "DEV: SPAWNING ON",
                "#ff00ff"
              );
              break;
            case "killAll":
              this.enemies.getChildren().forEach((e) => {
                if (e.active) {
                  (e as Enemy).takeDamage(999999);
                  if (e.active) e.destroy();
                }
              });
              (this.waveManager as any).enemiesToSpawn = 0;
              (this.waveManager as any).enemiesAlive = 0;
              this.showWeaponMessage("DEV: KILLED ALL", "#ff00ff");
              break;
            case "spawnEnemy": {
              const { type, count } = payload as { type: string; count: number };
              this.waveManager.devSpawnEnemy(type as any, count);
              this.showWeaponMessage(`DEV: SPAWNED ${count}x ${type.toUpperCase()}`, "#ff00ff");
              break;
            }
          }
        });
      }
    }

    // HUD container — still needed for game-over and level-up that use Phaser overlays
    this.hudContainer = this.add.container(0, 0);
    this.hudContainer.setDepth(150);
    this.minimap.ignore(this.hudContainer);
    this.minimap.ignore(this.barricadeGhost);

    // Health/stamina bars are rendered in React (HUDOverlay)

    this.baseDamage = this.player.stats.damage;
    this.damageBoostActive = false;

    this.initShop();
    this.registerReactActions();

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
      // Church bell toll on wave start
      this.playSound("sfx-church-bell", 0.6);
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
      // Wave completion bonus
      const waveBonus = BALANCE.economy.waveCompletionBonus.base +
        this.waveManager.wave * BALANCE.economy.waveCompletionBonus.perWave;
      this.currency += waveBonus;
      this.showWeaponMessage(`+$${waveBonus} WAVE CLEAR`, "#44dd66");

      // Interest on banked cash
      const interest = Math.min(
        Math.floor(this.currency * BALANCE.economy.interestRate),
        BALANCE.economy.interestCap
      );
      if (interest > 0) {
        this.currency += interest;
      }

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

    // Update minimap: follow player and draw dot
    this.minimap.centerOn(this.player.x, this.player.y);
    this.minimapDot.clear();
    // Player dot — small green with white center
    this.minimapDot.fillStyle(0x00ff00, 1);
    this.minimapDot.fillCircle(this.player.x, this.player.y, 18);
    this.minimapDot.fillStyle(0xffffff, 1);
    this.minimapDot.fillCircle(this.player.x, this.player.y, 8);
    // Enemy dots — small red
    this.enemies.getChildren().forEach((e) => {
      const enemy = e as Enemy;
      if (enemy.active) {
        this.minimapDot.fillStyle(0xff2244, 0.8);
        this.minimapDot.fillCircle(enemy.x, enemy.y, 12);
      }
    });

    if (this.gameOver || this.paused) return;

    // Freeze player movement while shop or level-up overlay is open
    if (this.shopOpen || this.levelUpActive) {
      this.player.body.setVelocity(0, 0);
    } else {
      this.player.update();
    }
    this.waveManager.update(delta);

    // Barricade placement ghost
    const showGhost = this.activeSlot === 2
      && !this.shopOpen && !this.levelUpActive
      && (this.trapInventory.get("barricade" as TrapType) ?? 0) > 0;
    if (showGhost) {
      const angle = this.getFacingAngle();
      const placeDist = 40;
      let gx = this.player.x + Math.cos(angle) * placeDist;
      let gy = this.player.y + Math.sin(angle) * placeDist;
      gx = Math.round(gx / 24) * 24;
      gy = Math.round(gy / 24) * 24;
      this.barricadeGhost.setPosition(gx, gy);
      this.barricadeGhost.setTexture(this.barricadeVertical ? "trap-barricade-v" : "trap-barricade");
      this.barricadeGhost.setVisible(true);
    } else {
      this.barricadeGhost.setVisible(false);
    }

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

    // Panting — play once on burnout start
    if (this.player.burnedOut && !this.wasBurnedOut) {
      this.playSound("sfx-player-panting", 0.3);
    }
    this.wasBurnedOut = this.player.burnedOut;

    this.updateHUD();
  }

  // ------- Audio Helpers -------

  private lastPunchSfx = 0;
  private wasBurnedOut = false;
  private lastDeathSfx = 0;
  private lastBiteSfx = 0;
  private lastFootstepTime = 0;
  private lastGroanTime = 0;

  /** Normalized volume tiers to keep all SFX consistent regardless of source file levels.
   *  Pass raw 0-1 volume — it gets scaled by master sfxVolume and clamped. */
  private playSound(key: string, volume = 0.5) {
    if (this.sfxMuted) return;
    if (this.cache.audio.exists(key)) {
      // Clamp final volume to prevent any single sound from blowing out
      const final = Math.min(volume * this.sfxVolume, 0.6);
      this.sound.play(key, { volume: final });
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
    const deathKeys = [
      "sfx-enemy-death1", "sfx-enemy-death2", "sfx-enemy-death3", "sfx-enemy-death4",
      "sfx-enemy-death5", "sfx-enemy-death6", "sfx-enemy-death7", "sfx-enemy-death8",
    ];
    this.playSound(deathKeys[Math.floor(Math.random() * deathKeys.length)], 0.3);
    // ~30% chance to layer gore splat on top
    if (Math.random() < 0.3) {
      this.playSound("sfx-gore-splat", 0.25);
    }
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
    // Punch cooldown — prevents mashing faster than intended
    const now = this.time.now;
    const cd = this.player.burnedOut ? BALANCE.punch.burnoutCooldownMs : BALANCE.punch.cooldownMs;
    if (now - this.lastPunchTime < cd) return;

    const cost = BALANCE.stamina.punchCost;
    if (!this.player.useStamina(cost)) return;
    this.lastPunchTime = now;

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

        // Angle to enemy for arc check + knockback direction
        // At point-blank (< 20px), skip arc check — always hits
        const angleToEnemy = dist < 20
          ? attackAngle  // use facing direction for knockback when overlapping
          : Phaser.Math.Angle.Between(this.player.x, this.player.y, enemy.x, enemy.y);

        if (dist >= 20) {
          let angleDiff = Math.abs(attackAngle - angleToEnemy);
          if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;
          if (angleDiff > arcHalf) return;
        }

        hitAny = true;
        let finalDmg = damage;
        if (this.rollCrit("fists", 0)) {
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
        if (enemy.enemyType === "fast") kb *= 1.8;
        enemy.body?.setVelocity(
          Math.cos(angleToEnemy) * kb,
          Math.sin(angleToEnemy) * kb
        );
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
    const dir = (this.player as any).currentDir as string;
    switch (dir) {
      case "east":        return 0;
      case "south-east":  return Math.PI / 4;
      case "south":       return Math.PI / 2;
      case "south-west":  return Math.PI * 3 / 4;
      case "west":        return Math.PI;
      case "north-west":  return -Math.PI * 3 / 4;
      case "north":       return -Math.PI / 2;
      case "north-east":  return -Math.PI / 4;
      default:            return Math.PI / 2; // fallback south
    }
  }

  // ------- Shared kill handler -------

  private onEnemyKilled(enemy: Enemy) {
    this.kills++;
    // Kill reward with scavenger bonus
    const effective = this.levelingSystem.getEffectiveStats(this.characterDef.stats);
    const baseReward = BALANCE.economy.killReward[enemy.enemyType];
    const bonus = Math.floor(baseReward * effective.killBonusPct);
    this.currency += baseReward + bonus;
    this.waveManager.onEnemyKilled();
    this.playRandomEnemyDeath();

    // RPG XP
    const xpReward = BALANCE.economy.xpPerKill[enemy.enemyType];
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
    const knockback = 350;
    let hits = 0;

    // Screen shake for impact feel
    this.cameras.main.shake(120, 0.004);

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

    this.playSound("sfx-punch1", 0.4);
    this.playSound("sfx-hit-classic", 0.35);
    if (hits > 0) this.playSound("sfx-whoosh", 0.3);
    this.showWeaponMessage("SUPERKICK!", "#ff4444");
  }

  /** Dan — EMP Grenade: throw in character's facing direction */
  private abilityEMPGrenade() {
    const angle = this.getFacingAngle();
    const throwDist = 160; // ~5 tiles away
    const gx = this.player.x + Math.cos(angle) * throwDist;
    const gy = this.player.y + Math.sin(angle) * throwDist;

    // Draw projected landing line + target circle
    const landingGfx = this.add.graphics().setDepth(5);
    const drawLanding = () => {
      landingGfx.clear();
      // Dashed line from player to landing point
      landingGfx.lineStyle(1, 0x44aaff, 0.4);
      const steps = 12;
      for (let i = 0; i < steps; i += 2) {
        const t0 = i / steps;
        const t1 = (i + 1) / steps;
        landingGfx.lineBetween(
          this.player.x + (gx - this.player.x) * t0,
          this.player.y + (gy - this.player.y) * t0,
          this.player.x + (gx - this.player.x) * t1,
          this.player.y + (gy - this.player.y) * t1,
        );
      }
      // Target circle at landing point
      landingGfx.lineStyle(1, 0x44aaff, 0.5);
      landingGfx.strokeCircle(gx, gy, 16);
      landingGfx.lineStyle(1, 0x44aaff, 0.25);
      landingGfx.strokeCircle(gx, gy, 160); // blast radius preview
    };
    drawLanding();

    const launchGrenade = () => {
      landingGfx.destroy();

      // Create visible grenade projectile (small)
      const grenade = this.add.image(this.player.x, this.player.y, "item-grenade")
        .setScale(0.4)
        .setDepth(6);

      // Grenade flies in an arc to landing point
      this.tweens.add({
        targets: grenade,
        x: gx,
        y: gy,
        duration: 450,
        ease: "Sine.easeOut",
      });
      // Vertical arc (scale to simulate arc height)
      this.tweens.add({
        targets: grenade,
        scaleX: 0.6,
        scaleY: 0.6,
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
        // EMP does moderate damage in addition to stun
        const empDamage = Math.floor(this.characterDef.stats.damage * 3);
        const killed = enemy.takeDamage(empDamage);
        if (killed) {
          this.onEnemyKilled(enemy);
        } else {
          enemy.applyKnockbackStun(stunDuration);
          enemy.body.setVelocity(0, 0);
          // Play idle texture so stunned enemies stop walking
          enemy.stopAndIdle();
        }
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
    const knockback = 180;
    let hits = 0;

    this.cameras.main.shake(80, 0.003);

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

    this.playSound("sfx-whoosh", 0.35);
    if (hits > 0) this.playSound("sfx-hit-classic", 0.35);
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

    // Heal player if inside smoke (8 HP/s)
    const distToSmoke = Phaser.Math.Distance.Between(
      this.player.x, this.player.y, this.smokeX, this.smokeY
    );
    if (distToSmoke <= this.smokeRadius) {
      const healRate = 8; // HP per second
      const healAmount = healRate * (delta / 1000);
      this.player.stats.health = Math.min(
        this.player.stats.maxHealth,
        this.player.stats.health + healAmount
      );
    }

    // Enemies in smoke: slowed + damage over time
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
        // Damage over time: 6 HP/s to enemies in smoke
        const dotDamage = 6 * (delta / 1000);
        const killed = enemy.takeDamage(Math.ceil(dotDamage));
        if (killed) this.onEnemyKilled(enemy);
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
    if (this.reloading) return; // can't fire while reloading

    if (this.magazineAmmo <= 0) {
      // Magazine empty — auto-reload if we have reserve ammo
      if (this.reserveAmmo > 0) {
        this.startReload();
      } else {
        this.playSound("sfx-dryfire", 0.4);
        this.showWeaponMessage("OUT OF AMMO", "#cc3333");
      }
      return;
    }

    const weaponDef = BALANCE.weapons[this.equippedWeapon as keyof typeof BALANCE.weapons];
    if (!weaponDef) return;

    const now = this.time.now;
    if (now - this.lastFireTime < weaponDef.fireRate) return;
    this.lastFireTime = now;

    const angle = this.getFacingAngle();
    const dmgMult = 1;

    // Point-blank hit check: directly damage enemies closer than the projectile spawn offset
    // so bullets don't fly past enemies that are right on top of the player
    const pbRange = 30;
    this.enemies.getChildren().forEach((obj) => {
      const enemy = obj as Enemy;
      if (!enemy.active) return;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
      if (dist > pbRange) return;
      for (let p = 0; p < weaponDef.pellets; p++) {
        let damage = Math.floor(weaponDef.damage * dmgMult);
        // SMG close-range bonus
        if ("closeRangeBonus" in weaponDef) {
          damage = Math.floor(damage * (weaponDef as any).closeRangeBonus);
        }
        const weaponKey = this.equippedWeapon ?? "pistol";
        if (this.rollCrit(weaponKey, 0)) {
          damage = Math.floor(damage * BALANCE.crit.damageMultiplier);
          this.showCritEffect(enemy.x, enemy.y, "ranged");
        }
        const killed = enemy.takeDamage(damage, "ranged");
        if (killed) { this.onEnemyKilled(enemy); break; }
      }
    });

    // Spawn projectiles offset from player center for normal-range hits
    const spawnOffset = 24;
    const spawnX = this.player.x + Math.cos(angle) * spawnOffset;
    const spawnY = this.player.y + Math.sin(angle) * spawnOffset;

    for (let i = 0; i < weaponDef.pellets; i++) {
      const spreadRad = Phaser.Math.DegToRad(weaponDef.spread);
      const pelletAngle = angle + (Math.random() - 0.5) * spreadRad;

      const proj = new Projectile(
        this,
        spawnX,
        spawnY,
        pelletAngle,
        weaponDef.speed,
        Math.floor(weaponDef.damage * dmgMult),
        weaponDef.range,
        weaponDef.dropoff,
        this.equippedWeapon!
      );
      this.projectiles.add(proj, true);
      proj.launch();
    }

    this.magazineAmmo--;

    // Play shooting animation on the player sprite
    this.player.playShoot(this.equippedWeapon!);

    // Weapon fire sound
    if (this.equippedWeapon === "pistol") {
      this.playSound("sfx-pistol", 0.4);
    } else if (this.equippedWeapon === "shotgun") {
      this.playSound("sfx-shotgun", 0.4);
    } else if (this.equippedWeapon === "smg") {
      this.playSound("sfx-smg", 0.3);
    }

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

    // Auto-reload when magazine empties, or dry-click if totally out
    if (this.magazineAmmo <= 0) {
      if (this.reserveAmmo > 0) {
        this.startReload();
      } else {
        this.time.delayedCall(250, () => {
          this.playSound("sfx-dryfire", 1.0);
          this.showWeaponMessage("OUT OF AMMO", "#cc3333");
        });
      }
    }
  }

  private startReload() {
    if (!this.equippedWeapon || this.reloading) return;
    if (this.magazineAmmo >= this.magazineSize) return; // already full
    if (this.reserveAmmo <= 0 && this.magazineAmmo <= 0) return; // nothing to reload

    const weaponDef = BALANCE.weapons[this.equippedWeapon as keyof typeof BALANCE.weapons];
    if (!weaponDef) return;

    this.reloading = true;
    this.showWeaponMessage("RELOADING...", "#ffaa33");

    this.reloadTimer = this.time.delayedCall(weaponDef.reloadMs, () => {
      if (!this.equippedWeapon) { this.reloading = false; return; }
      const needed = this.magazineSize - this.magazineAmmo;
      const loaded = Math.min(needed, this.reserveAmmo);
      this.magazineAmmo += loaded;
      this.reserveAmmo -= loaded;
      this.reloading = false;
      this.reloadTimer = null;
      // Reload complete sound per weapon
      if (this.equippedWeapon === "shotgun") {
        this.playSound("sfx-reload-shotgun", 0.5);
      } else {
        this.playSound("sfx-reload-rifle", 0.5);
      }
      this.showWeaponMessage("RELOADED", "#44dd44");
    });
  }

  private showWeaponMessage(msg: string, _color: string) {
    // Render at high res then scale down so the font is crisp at 5x camera zoom
    const txt = this.add.text(
      this.player.x, this.player.y - 40, msg,
      {
        fontFamily: "ChainsawCarnage, HorrorPixel, monospace",
        fontSize: "36px",
        stroke: "#000000",
        strokeThickness: 6,
      }
    ).setDepth(100).setOrigin(0.5).setScale(0.25).setAlpha(0);

    // Vertical gradient fill: bright red top to dark red bottom
    const gradient = txt.context.createLinearGradient(0, 0, 0, txt.height);
    gradient.addColorStop(0, "#ff4444");
    gradient.addColorStop(1, "#8b0000");
    txt.setFill(gradient);

    this.tweens.add({
      targets: txt,
      alpha: 1,
      duration: 150,
      ease: "Power1",
      onComplete: () => {
        this.tweens.add({
          targets: txt,
          y: this.player.y - 60,
          alpha: 0,
          duration: 400,
          delay: 300,
          ease: "Power2",
          onComplete: () => txt.destroy(),
        });
      },
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

    // Snap barricades to 24px grid — tight enough for H/V corners to connect
    // Same-orientation pieces overlap posts at 48px spacing (every 2 cells)
    if (trapType === "barricade") {
      placeX = Math.round(placeX / 24) * 24;
      placeY = Math.round(placeY / 24) * 24;
    }

    this.barricadeGhost.setVisible(false);

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
      if (!enemy.active || !trap.active || enemy.dying) return;

      const wasDying = enemy.dying;
      const shouldRemove = trap.trigger(enemy, this);
      if (trap.trapType === "landmine" && shouldRemove) {
        this.playSound("sfx-explosion", 0.4);
      }
      if (shouldRemove) {
        trap.destroy();
      }

      // Track kills from traps (dying flag, not active — active stays true during death animation)
      if (!wasDying && enemy.dying) {
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

      barricade.takeDamage(enemy.getEffectiveDamage());
    };

  private rollCrit(weaponKey: string, distanceRatio: number): boolean {
    const effective = this.levelingSystem.getEffectiveStats(this.characterDef.stats);
    const charCrit = effective.critChance;
    const weaponCrit = BALANCE.crit.weaponCrit[weaponKey as keyof typeof BALANCE.crit.weaponCrit] ?? 0;
    const distCrit = BALANCE.crit.closeCritBonus * (1 - distanceRatio);
    const levelCrit = (this.levelingSystem.level - 1) * BALANCE.crit.critPerLevel;

    const totalCrit = charCrit + weaponCrit + distCrit + levelCrit;
    return Math.random() < totalCrit;
  }

  private showCritEffect(x: number, y: number, source: "melee" | "ranged" = "melee") {
    const label = source === "ranged" ? "HEADSHOT" : "CRIT!";
    const color1 = source === "ranged" ? "#ffdd44" : "#ff4444";
    const color2 = source === "ranged" ? "#cc8800" : "#8b0000";

    const txt = this.add.text(x, y - 20, label, {
      fontFamily: "ChainsawCarnage, HorrorPixel, monospace",
      fontSize: "36px",
      stroke: "#000000",
      strokeThickness: 6,
    }).setDepth(100).setOrigin(0.5).setScale(0.25).setAlpha(0);

    const gradient = txt.context.createLinearGradient(0, 0, 0, txt.height);
    gradient.addColorStop(0, color1);
    gradient.addColorStop(1, color2);
    txt.setFill(gradient);

    if (source === "ranged") {
      this.playSound("sfx-click", 0.6); // ping on headshot
    }

    this.tweens.add({
      targets: txt,
      alpha: 1,
      duration: 150,
      ease: "Power1",
      onComplete: () => {
        this.tweens.add({
          targets: txt,
          y: y - 40,
          alpha: 0,
          duration: 400,
          delay: 300,
          ease: "Power2",
          onComplete: () => txt.destroy(),
        });
      },
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
        this.showCritEffect(enemy.x, enemy.y, "ranged");
      }

      const killed = enemy.takeDamage(damage, "ranged");
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
      const typeMult = enemy.enemyType === "fast" ? 1.5 : enemy.enemyType === "boss" ? 0.2 : 1.0;
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
      if (this.player.invincible) return; // dev god mode
      if (this.player.isPunching) return; // i-frames during punch

      const now = this.time.now;
      if (now - this.lastDamageTime < 500) return;
      this.lastDamageTime = now;

      const enemy = enemyObj as Enemy;
      this.player.stats.health -= enemy.getEffectiveDamage();
      enemy.playBite();
      this.playBiteSound();

      // Push enemy away on contact so they don't stay glued to player
      const pushAngle = Phaser.Math.Angle.Between(
        this.player.x,
        this.player.y,
        enemy.x,
        enemy.y
      );
      const pushForce = enemy.enemyType === "fast" ? 200 : enemy.enemyType === "boss" ? 40 : 120;
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

    const waveReached = this.waveManager.wave;

    // Push death screen to React — include health=0 so the bar visually empties
    hudState.update({
      health: 0,
      gameOver: true,
      gameOverPhase: "death",
      gameOverWave: waveReached,
      gameOverKills: this.kills,
      gameOverCharName: this.characterDef.name,
    });

    // After delay, check if score qualifies for leaderboard
    this.time.delayedCall(2000, () => {
      this.checkLeaderboardQualification(waveReached);
    });
  }

  private async checkLeaderboardQualification(waveReached: number) {
    try {
      const response = await fetch("/api/leaderboard");
      if (response.ok) {
        const leaderboard = await response.json();
        if (leaderboard.length >= 5) {
          const lowest = leaderboard[leaderboard.length - 1];
          if (this.kills < lowest.kills || (this.kills === lowest.kills && waveReached <= lowest.wave)) {
            // Doesn't qualify — skip entry, show leaderboard directly
            hudState.update({
              gameOverPhase: "leaderboard",
              leaderboard,
              leaderboardHighlightId: null,
            });
            return;
          }
        }
      }
    } catch (e) {
      // On error, allow entry anyway
    }
    // Qualifies — show name entry
    hudState.update({ gameOverPhase: "entry" });
  }

  private async submitLeaderboardScore(name: string, kills: number, wave: number, characterId: string) {
    let submittedId: number | null = null;

    try {
      const response = await fetch("/api/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, kills, wave, character_id: characterId }),
      });
      if (response.ok) {
        const data = await response.json();
        submittedId = data.id;
      }
    } catch (e) {
      console.error("Failed to submit leaderboard score:", e);
    }

    // Fetch updated leaderboard
    let leaderboard: { id: number; name: string; kills: number; wave: number; character_id: string }[] = [];
    try {
      const response = await fetch("/api/leaderboard");
      if (response.ok) {
        leaderboard = await response.json();
      }
    } catch (e) {
      console.error("Failed to fetch leaderboard:", e);
    }

    hudState.update({
      gameOverPhase: "leaderboard",
      leaderboard,
      leaderboardHighlightId: submittedId,
    });
  }

  private async fetchLeaderboard() {
    let leaderboard: { id: number; name: string; kills: number; wave: number; character_id: string }[] = [];
    try {
      const response = await fetch("/api/leaderboard");
      if (response.ok) {
        leaderboard = await response.json();
      }
    } catch (e) {
      console.error("Failed to fetch leaderboard:", e);
    }
    hudState.update({
      gameOverPhase: "leaderboard",
      leaderboard,
      leaderboardHighlightId: null,
    });
  }

  private spawnFenceBorder() {
    const mapW = ENDICOTT_MAP_W;
    const mapH = ENDICOTT_MAP_H;
    const hTex = "trap-barricade";   // horizontal (64x32)
    const vTex = "trap-barricade-v"; // vertical (32x64)
    const margin = 2;
    const depth = 3;
    const hStep = 48; // tighter horizontal spacing
    const vStep = 48; // tighter vertical spacing

    // Road gap definitions (pixel ranges to skip fence placement)
    const southRoadX = { min: 864, max: 1024 };  // centered on player spawn (x=960)
    const northRoadX = { min: 800, max: 928 };    // based on decoration tiles
    const westRoadY  = { min: 704, max: 896 };    // based on decoration tiles

    const addFence = (x: number, y: number, tex: string) => {
      const fence = this.add.image(x, y, tex);
      fence.setDepth(depth);
      this.physics.add.existing(fence, true); // true = static body
      this.obstacles.add(fence);
    };

    // North edge (horizontal barricades) — skip north road gap
    for (let x = 0; x < mapW; x += hStep) {
      const cx = x + 32;
      if (cx > northRoadX.min && cx < northRoadX.max) continue;
      addFence(cx, margin + 16, hTex);
    }
    // South edge — skip south road gap
    for (let x = 0; x < mapW; x += hStep) {
      const cx = x + 32;
      if (cx > southRoadX.min && cx < southRoadX.max) continue;
      addFence(cx, mapH - margin - 16, hTex);
    }
    // West edge (vertical barricades) — skip west road gap
    for (let y = 0; y < mapH; y += vStep) {
      const cy = y + 32;
      if (cy > westRoadY.min && cy < westRoadY.max) continue;
      addFence(margin + 16, cy, vTex);
    }
    // East edge — no road gap (forest side)
    for (let y = 0; y < mapH; y += vStep) {
      addFence(mapW - margin - 16, y + 32, vTex);
    }
  }

  private spawnTreeWall() {
    const mapW = ENDICOTT_MAP_W;
    const mapH = ENDICOTT_MAP_H;
    const rng = (min: number, max: number) => min + Math.random() * (max - min);
    const spacingX = 40;
    const spacingY = 44;

    // Road exclusion zones — no trees near road exits or main paths
    // Each zone is a rectangle { x, y, w, h } in world coordinates
    const roadZones = [
      // South road exit (centered on spawn x=960)
      { x: 864, y: 1700, w: 160, h: 300 },
      // North road exit
      { x: 800, y: 0, w: 128, h: 300 },
      // West road exit
      { x: 0, y: 704, w: 300, h: 192 },
    ];
    const roadBuffer = 80; // extra clearance around road zones
    const isNearPath = (x: number, y: number) => {
      for (const z of roadZones) {
        if (
          x > z.x - roadBuffer && x < z.x + z.w + roadBuffer &&
          y > z.y - roadBuffer && y < z.y + z.h + roadBuffer
        ) return true;
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

  // ------- Pause / Settings (React-rendered, action-driven) -------

  private registerReactActions() {
    // Pause actions from React
    hudState.registerPauseAction((action: string, payload?: any) => {
      switch (action) {
        case "quit":
          hudState.update({ paused: false, settingsOpen: false, hudVisible: false });
          this.scene.start("MainMenu");
          break;
        case "restart":
          hudState.update({ paused: false, settingsOpen: false, hudVisible: false });
          this.scene.restart({ characterId: this.characterDef.id });
          break;
        case "resume": this.resumeGame(); break;
        case "openStats":
          this.statsOpen = true;
          hudState.update({ statsOpen: true });
          break;
        case "closeStats":
          this.statsOpen = false;
          hudState.update({ statsOpen: false });
          break;
        case "openSettings":
          this.settingsOpen = true;
          hudState.update({ settingsOpen: true });
          break;
        case "closeSettings":
          this.settingsOpen = false;
          hudState.update({ settingsOpen: false });
          break;
        case "setVolume": {
          const val = payload as number;
          this.sfxVolume = val;
          this.sfxMuted = val === 0;
          hudState.update({ sfxVolume: val });
          for (const s of this.ambientSounds) {
            if ("setVolume" in s) (s as Phaser.Sound.WebAudioSound).setVolume(val * 0.15);
          }
          break;
        }
        case "toggleZoom": {
          this.zoomEnabled = !this.zoomEnabled;
          hudState.update({ zoomEnabled: this.zoomEnabled });
          if (this.zoomEnabled) {
            hudState.update({ zoomVisible: true, zoomPercent: Math.round(this.cameras.main.zoom * 100) });
            this.wheelHandler = (e: WheelEvent) => {
              e.preventDefault();
              const cam = this.cameras.main;
              const zoomStops = [2, 2.5, 3, 3.5, 4, 5];
              const curIdx = zoomStops.reduce((closest, val, idx) =>
                Math.abs(val - cam.zoom) < Math.abs(zoomStops[closest] - cam.zoom) ? idx : closest, 0);
              const nextIdx = Phaser.Math.Clamp(curIdx + (e.deltaY > 0 ? -1 : 1), 0, zoomStops.length - 1);
              cam.setZoom(zoomStops[nextIdx]);
              hudState.update({ zoomPercent: Math.round(zoomStops[nextIdx] * 100) });
            };
            window.addEventListener("wheel", this.wheelHandler, { passive: false });
          } else {
            hudState.update({ zoomVisible: false });
            if (this.wheelHandler) {
              window.removeEventListener("wheel", this.wheelHandler);
              this.wheelHandler = undefined;
            }
            this.cameras.main.setZoom(5.0);
          }
          break;
        }
      }
    });

    // Level-up actions from React
    hudState.registerLevelUpAction((action: string, payload?: any) => {
      if (action === "select") this.selectLevelUpBuff(payload as number);
    });

    // Game-over actions from React
    hudState.registerGameOverAction((action: string, payload?: any) => {
      if (action === "submitName") {
        this.submitLeaderboardScore(payload as string, this.kills, this.waveManager.wave, this.characterDef.id);
      } else if (action === "skipScore") {
        // Skip leaderboard, go straight to showing it without saving
        this.fetchLeaderboard();
      } else if (action === "returnToMenu") {
        this.scene.start("MainMenu");
      }
    });
  }

  private pauseGame() {
    this.paused = true;
    this.physics.pause();
    hudState.update({ paused: true });
  }

  private resumeGame() {
    this.paused = false;
    this.settingsOpen = false;
    this.statsOpen = false;
    this.physics.resume();
    hudState.update({ paused: false, settingsOpen: false, statsOpen: false });
  }

  // ------- Shop (React overlay — data push only) -------

  private readonly shopIconMap: Record<string, string> = {
    pistol: "/assets/sprites/items/pistol.png",
    shotgun: "/assets/sprites/items/shotgun.png",
    smg: "/assets/sprites/items/smg.png",
    ammo: "/assets/sprites/items/ammo.png",
    extraClip: "/assets/sprites/items/ammo-box.png",
    barricade: "/assets/sprites/items/trap-barricade.png",
    landmine: "/assets/sprites/items/landmine.png",
    heal: "/assets/sprites/items/bandage.png",
    dmgBoost: "/assets/sprites/items/syringe.png",
  };

  private initShop() {
    const items = BALANCE.shop.items;

    // Build navigation grid: [col][row] -> original item index
    const columns: { idx: number }[][] = [[], [], []];
    items.forEach((item, idx) => {
      const id = item.id;
      if (id === "heal" || id === "dmgBoost") columns[0].push({ idx });
      else if (["pistol", "shotgun", "smg", "ammo", "extraClip"].includes(id)) columns[1].push({ idx });
      else columns[2].push({ idx });
    });
    this.shopGrid = columns.map(col => col.map(entry => entry.idx));

    // Register React -> Phaser callback
    hudState.registerShopAction((action, payload) => {
      if (action === "buy" && payload !== undefined) {
        this.buyItem(payload);
      } else if (action === "buySelected") {
        this.buyItem(this.shopSelectedIndex);
      } else if (action === "buyKey" && payload !== undefined) {
        // Number key direct buy: build flat index
        const flat = [...columns[0], ...columns[1], ...columns[2]];
        const idx = payload - 1; // 1-indexed to 0-indexed
        if (idx >= 0 && idx < flat.length) {
          this.buyItem(flat[idx].idx);
        }
      } else if (action === "hover" && payload !== undefined) {
        this.shopSelectedIndex = payload;
        this.pushShopData();
      } else if (action === "close") {
        this.closeShop();
      } else if (action === "nav" && payload !== undefined) {
        this.navigateShop(payload);
      }
    });
  }

  private navigateShop(direction: number) {
    if (!this.shopOpen || this.shopGrid.length === 0) return;
    let col = this.shopNavCol;
    let row = this.shopNavRow;

    if (direction === 0) row = Math.max(0, row - 1); // up
    else if (direction === 1) row = Math.min((this.shopGrid[col]?.length ?? 1) - 1, row + 1); // down
    else if (direction === 2) col = Math.max(0, col - 1); // left
    else if (direction === 3) col = Math.min(this.shopGrid.length - 1, col + 1); // right

    if (!this.shopGrid[col] || this.shopGrid[col].length === 0) return;
    row = Math.min(row, this.shopGrid[col].length - 1);
    this.shopNavCol = col;
    this.shopNavRow = row;
    this.shopSelectedIndex = this.shopGrid[col][row];
    this.pushShopData();
  }

  /** Push current shop item state to React via HUDState */
  private pushShopData() {
    const items = BALANCE.shop.items;
    const shopItems = items.map((item, idx) => {
      const unlockWave = (item as any).unlockWave;
      const locked = this.devMode ? false : (unlockWave ? this.waveManager.wave < unlockWave : false);
      const price = this.getItemPrice(idx);
      const canAfford = this.currency >= price;
      const isEquipped = ["pistol", "shotgun", "smg"].includes(item.id) && this.equippedWeapon === item.id;
      const id = item.id;
      let category: "supplies" | "weapons" | "traps" = "supplies";
      if (["pistol", "shotgun", "smg", "ammo", "extraClip"].includes(id)) category = "weapons";
      else if (["barricade", "landmine"].includes(id)) category = "traps";

      return {
        id: item.id,
        name: item.name,
        desc: item.desc,
        price,
        icon: this.shopIconMap[item.id] || "",
        locked,
        unlockWave: unlockWave || undefined,
        equipped: isEquipped,
        canAfford,
        category,
      };
    });

    hudState.update({
      shopItems,
      shopSelectedIndex: this.shopSelectedIndex,
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
    this.waveManager.setFrozen(true);
    this.pushShopData();
    this.updateHUD();
  }

  private closeShop() {
    this.shopOpen = false;
    this.waveManager.setFrozen(false);
    this.updateHUD();
  }

  private buyItem(index: number) {
    const item = BALANCE.shop.items[index];
    const price = this.getItemPrice(index);
    if (this.currency < price) {
      this.playSound("sfx-error", 0.3);
      return;
    }

    // Wave-lock check (bypassed in dev mode)
    const unlockWave = (item as any).unlockWave;
    if (!this.devMode && unlockWave && this.waveManager.wave < unlockWave) {
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
          this.player.stats.health + 30
        );
        this.showWeaponMessage("+30 HP", "#44dd66");
        break;
      }
      case "medkit": {
        if (this.player.stats.health >= this.player.stats.maxHealth) return;
        this.currency -= price;
        this.player.stats.health = Math.min(
          this.player.stats.maxHealth,
          this.player.stats.health + 80
        );
        this.showWeaponMessage("+80 HP", "#44dd66");
        break;
      }
      case "dmgBoost": {
        if (this.damageBoostActive) return;
        this.currency -= price;
        this.damageBoostActive = true;
        this.player.stats.damage += 5;
        this.showWeaponMessage("+5 DAMAGE", "#ff8844");
        break;
      }
      case "shotgun":
      case "smg": {
        const weaponDef = BALANCE.weapons[itemId as keyof typeof BALANCE.weapons];
        // Already holding this weapon — buy ammo refill instead
        if (this.equippedWeapon === itemId) {
          const totalMax = weaponDef.magazineSize * weaponDef.totalClips;
          const totalCurrent = this.magazineAmmo + this.reserveAmmo;
          if (totalCurrent >= totalMax) return;
          this.currency -= price;
          this.reserveAmmo = totalMax - this.magazineAmmo;
          this.showWeaponMessage("AMMO REFILLED", "#44dd44");
          break;
        }
        this.currency -= price;
        this.equippedWeapon = itemId;
        this.magazineSize = weaponDef.magazineSize;
        this.magazineAmmo = weaponDef.magazineSize; // full first mag
        this.reserveAmmo = weaponDef.magazineSize * (weaponDef.totalClips - 1); // remaining clips
        this.reloading = false;
        if (this.reloadTimer) { this.reloadTimer.destroy(); this.reloadTimer = null; }
        this.activeSlot = 1;
        this.showWeaponMessage(weaponDef.name.toUpperCase() + " EQUIPPED", "#dddd44");
        break;
      }
      case "ammo": {
        if (!this.equippedWeapon) return;
        const wDef = BALANCE.weapons[this.equippedWeapon as keyof typeof BALANCE.weapons];
        const totalMax = wDef.magazineSize * wDef.totalClips;
        const totalCurrent = this.magazineAmmo + this.reserveAmmo;
        if (totalCurrent >= totalMax) return;
        this.currency -= price;
        const addAmmo = wDef.magazineSize * 2; // 2 clips per purchase
        this.reserveAmmo = Math.min(this.reserveAmmo + addAmmo, totalMax - this.magazineAmmo);
        this.showWeaponMessage(`+${Math.min(addAmmo, totalMax - totalCurrent)} AMMO`, "#44dd44");
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
    this.pushShopData();
    this.updateHUD();

    // Flash feedback via React
    hudState.update({ shopMessage: "PURCHASED", shopMessageColor: "#44cc44" });
    this.time.delayedCall(1200, () => {
      hudState.update({ shopMessage: "", shopMessageColor: "" });
    });
  }

  // ------- Wave Announcements -------

  private showWaveAnnouncement(wave: number) {
    hudState.update({ waveAnnouncement: `WAVE ${wave}`, waveAnnouncementKey: Date.now() });
  }

  private showIntermissionAnnouncement() {
    hudState.update({ waveAnnouncement: "WAVE CLEAR", waveAnnouncementKey: Date.now() });
  }

  // ------- HUD -------

  // All HUD rendering is handled by React. See HUDOverlay.tsx and components/hud/*.

  private lastCountdownVal = -1;

  private updateHUD() {
    // Dev mode: keep cash topped up
    if (this.devMode && this.currency < 99999) this.currency = 99999;

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

    // Wave state
    const state = this.waveManager.state;
    const wave = this.waveManager.wave;
    let countdownSecs = -1;

    if (state === "pre_game") {
      countdownSecs = this.waveManager.getPreGameTimeLeft();
    } else if (state === "intermission") {
      if (this.waveManager.isReadyUp()) {
        countdownSecs = this.waveManager.getReadyCountdown();
      } else {
        countdownSecs = this.waveManager.getIntermissionTimeLeft();
      }
    }

    // Trigger countdown animation in React when value changes
    let countdownKey = 0;
    if (countdownSecs >= 1 && countdownSecs <= 5 && countdownSecs !== this.lastCountdownVal) {
      countdownKey = Date.now();
    }
    this.lastCountdownVal = countdownSecs;

    // Push all state to React HUD overlay
    hudState.update({
      health: this.player.stats.health,
      maxHealth: this.player.stats.maxHealth,
      stamina: this.player.stats.stamina,
      maxStamina: this.player.stats.maxStamina,
      burnedOut: this.player.burnedOut,
      level: this.levelingSystem.level,
      activeSlot: this.activeSlot,
      equippedWeapon: this.equippedWeapon,
      ammo: this.magazineAmmo,
      maxAmmo: this.magazineSize,
      reserveAmmo: this.reserveAmmo,
      reloading: this.reloading,
      barricadeCount: this.trapInventory.get("barricade" as TrapType) ?? 0,
      mineCount: this.trapInventory.get("landmine" as TrapType) ?? 0,
      abilityName: this.characterDef.ability.name,
      abilityCooldown: this.abilityCooldownTimer > 0 ? this.abilityCooldownTimer / 1000 : 0,
      abilityMaxCooldown: this.characterDef.ability.cooldown,
      abilityKey: "R",
      kills: this.kills,
      currency: this.currency,
      wave,
      waveState: state === "clearing" ? "active" : state as "pre_game" | "active" | "intermission",
      waveEnemiesLeft: state === "active" || state === "clearing" ? this.waveManager.getEnemiesRemaining() : 0,
      waveCountdown: countdownSecs,
      ...(countdownKey ? { countdownKey } : {}),
      characterName: this.characterDef.name,
      characterId: this.characterDef.id,
      hudVisible: true,
      shopOpen: this.shopOpen,
      paused: this.paused,
      gameOver: this.gameOver,
      settingsOpen: this.settingsOpen,
      sfxVolume: this.sfxVolume,
      zoomEnabled: this.zoomEnabled,
      // Stats screen data (only computed when open)
      ...(this.statsOpen ? {
        statsEffective: this.levelingSystem.getEffectiveStats({
          damage: BASE_STATS.damage,
          hp: BASE_STATS.hp,
          stamina: BASE_STATS.stamina,
          speed: BASE_STATS.speed,
          regen: BASE_STATS.regen,
          critChance: BASE_STATS.critChance,
        }),
        statsBase: {
          damage: BASE_STATS.damage,
          hp: BASE_STATS.hp,
          stamina: BASE_STATS.stamina,
          speed: BASE_STATS.speed,
          regen: BASE_STATS.regen,
          critChance: BASE_STATS.critChance,
        },
        statsBuffs: this.levelingSystem.appliedBuffs.map(b => ({
          category: b.category,
          tier: b.tier,
          name: b.name,
        })),
        statsXp: this.levelingSystem.xp,
        statsXpNeeded: this.levelingSystem.xpToNextLevel(),
        statsClassName: this.characterDef.className,
      } : {}),
    });
  }

  // ------- Level-Up (React-rendered) -------

  private showLevelUpUI(level: number, options: BuffOption[]) {
    this.levelUpActive = true;
    this.waveManager.setFrozen(true);
    hudState.update({ levelUpActive: true, levelUpLevel: level, levelUpOptions: options });
  }

  private selectLevelUpBuff(index: number) {
    if (!this.levelUpActive) return;

    const buff = this.levelingSystem.selectBuff(index);
    if (!buff) return;

    if (buff.category === "health") {
      const effective = this.levelingSystem.getEffectiveStats(this.characterDef.stats);
      const hpIncrease = effective.maxHealth - this.player.stats.maxHealth;
      this.player.stats.health = Math.min(effective.maxHealth, this.player.stats.health + hpIncrease);
    }

    if (buff.category === "stamina") {
      const effective = this.levelingSystem.getEffectiveStats(this.characterDef.stats);
      const staIncrease = effective.maxStamina - this.player.stats.maxStamina;
      this.player.stats.stamina = Math.min(effective.maxStamina, this.player.stats.stamina + staIncrease);
    }

    this.levelUpActive = false;
    this.waveManager.setFrozen(false);
    hudState.update({ levelUpActive: false });
    this.showWeaponMessage(buff.name.toUpperCase(), "#ffffff");

    this.time.delayedCall(300, () => {
      this.showNextPendingLevelUp();
    });
  }

  private showNextPendingLevelUp() {
    if (this.pendingLevelUps.length > 0) {
      const next = this.pendingLevelUps.shift()!;
      // Re-arm LevelingSystem so selectBuff() won't bail out
      this.levelingSystem.setPending(next.options);
      this.showLevelUpUI(next.level, next.options);
    } else {
      // Always open shop after level-ups resolve (don't gate on state —
      // the intermission auto-timer could have expired during level-up picks)
      this.openShop();
    }
  }
}
