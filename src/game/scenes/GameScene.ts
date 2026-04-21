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
import { isPublicBuild, PUBLIC_BUILD_UNLOCKABLE_DOOR_LABEL } from "../publicBuild";
import { Pathfinder } from "../systems/Pathfinder";
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
  private scaryboiIntroActive = false;
  private masonCutsceneActive = false;
  private damageBoostActive = false;
  private baseDamage = 0;

  // Wave system
  private waveManager!: WaveManager;

  // RPG Leveling
  private levelingSystem!: LevelingSystem;
  private levelUpActive = false;
  private pendingLevelUps: { level: number; options: BuffOption[] }[] = [];

  // Weapon state — multi-gun: pistol always + optional secondary
  private activeWeapon: string = "pistol"; // currently selected gun to fire
  private secondaryWeapon: string | null = null; // "shotgun" | "smg" | null
  private weaponAmmo: Record<string, { mag: number; reserve: number }> = {};
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

  // Hotbar: 1=pistol, 2=secondary gun, 3=barricade, 4=mine
  private activeSlot = 0;
  private readonly slotCount = 5;

  // Ability state (Q)
  private abilityCooldownTimer = 0; // ms remaining
  private abilityActive = false;
  // Smokescreen state (Jason)
  private smokeCloud: Phaser.GameObjects.Graphics | null = null;
  private smokeX = 0;
  private smokeY = 0;
  private smokeTimer = 0; // ms remaining
  private smokeDrainAccum = 0; // unused, kept for destroySmokescreen reset
  private readonly smokeDuration = 5000;
  private readonly smokeRadius = 128; // 8x8 tiles = 256px diameter = 128px radius
  // Smokescreen buff (Jason) — lingers after smoke dissipates
  private smokeBuffTimer = 0; // ms remaining on damage+stamina buff
  private smokeBuffDamageBonus = 40; // flat damage bonus while buff active (one-shots walkers)
  private smokeBuffRegenBonus = 5; // extra stamina regen/sec while buff active
  private readonly smokeBuffDuration = 9000; // 9 seconds

  // Power + Machines (CoD Zombies perk system)
  private powerOn = false;
  private generator: {
    sprite: Phaser.GameObjects.Sprite;
    x: number;
    y: number;
    promptText?: Phaser.GameObjects.Text;
  } | null = null;
  private machines: {
    machineType: string; // "zyn" | "keg"
    label: string;
    cost: number;
    x: number;
    y: number;
    sprite: Phaser.GameObjects.Sprite;
    purchased: boolean;
    promptText?: Phaser.GameObjects.Text;
  }[] = [];
  private reloadSpeedMultiplier = 1; // Zyn perk: < 1 = faster reload
  private armor = 0; // Keg perk: damage hits armor before HP

  // Shop
  private shopOpen = false;

  // Doors (CoD Zombies style purchasable barriers)
  private doors: {
    zone: Phaser.GameObjects.Zone;
    cost: number;
    label: string;
    opened: boolean;
    paid: boolean; // true after first purchase — reopens free
    locked: boolean; // true = completely locked, shows "Locked" prompt, cannot open
    health: number; // current HP — zombies bash it down
    maxHealth: number; // starting HP (0 = indestructible until purchased)
    broken: boolean; // true once zombies destroy it — permanently open, no repair
    promptText?: Phaser.GameObjects.Text;
    clearCols: number[];
    clearRows: number[];
    savedTiles: { col: number; row: number; gid: number; layer: string }[]; // original tile GIDs for restoring
  }[] = [];
  private wallsBaseLayer?: Phaser.Tilemaps.TilemapLayer;
  private wallsTopLayer?: Phaser.Tilemaps.TilemapLayer;
  private propsLowLayer?: Phaser.Tilemaps.TilemapLayer;
  private propsMidLayer?: Phaser.Tilemaps.TilemapLayer;
  private floorInteriorLayer?: Phaser.Tilemaps.TilemapLayer;

  // Interior darkness — hide outside map when inside a building
  private interiorDarknessRT?: Phaser.GameObjects.RenderTexture;
  private playerInsideBuilding = true; // player spawns inside the house

  // Starting room — chest + door before wave 1
  private startingChestOpened = false;
  private startingDoorOpened = false;
  private startingChestPrompt?: Phaser.GameObjects.Text;
  private startingDoorPrompt?: Phaser.GameObjects.Text;
  private startingDoorBody?: Phaser.GameObjects.Zone; // physics body blocking doorway
  private startingChestSprite?: Phaser.GameObjects.Sprite;
  private hasWeapon = false; // false until player opens chest
  private roofLayer?: Phaser.Tilemaps.TilemapLayer;
  private roofVisible = true;

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
  pathfinder!: Pathfinder; // exposed for Enemy AI
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
    try { this.sound.stopAll(); } catch { /* AudioContext may be closed */ }
  }

  create() {
    hudState.reset();
    this.gameOver = false;
    this.paused = false;
    this.settingsOpen = false;
    this.statsOpen = false;
    this.physics.resume();
    this.game.canvas.style.pointerEvents = "auto";
    this.currency = 0;
    this.kills = 0;
    this.lastDamageTime = 0;
    // Start empty-handed — pistol comes from starting chest
    this.activeWeapon = "pistol"; // weapon type (HUD reference), but no ammo until chest
    this.secondaryWeapon = null;
    this.weaponAmmo = {};
    this.hasWeapon = false;
    this.startingChestOpened = false;
    this.startingDoorOpened = false;
    this.activeSlot = 1;
    this.reloading = false;
    this.reloadTimer = null;
    this.lastPunchTime = 0;
    this.fireHeld = false;
    this.bloodSplats = [];
    this.pendingLevelUps = [];
    this.roofVisible = true;          // match fresh layer alpha=1
    this.playerInsideBuilding = true; // player spawns inside the house
    this.powerOn = false;
    this.generator = null;
    this.machines = [];
    this.reloadSpeedMultiplier = 1;
    this.armor = 0;

    // Slow gameplay by 25%
    this.time.timeScale = 0.75;
    this.physics.world.timeScale = 1 / 0.75; // physics timeScale is inverted (higher = slower)
    this.tweens.timeScale = 0.75;

    // Draw tilemap — Endicott Estate
    const map = this.make.tilemap({ key: "endicott-map" });
    const allTilesets = [
      map.addTilesetImage("cainos-grass", "ts-cainos-grass")!,
      map.addTilesetImage("cainos-stone", "ts-cainos-stone")!,
      map.addTilesetImage("basic-plant", "ts-basic-plant")!,
      map.addTilesetImage("basic-props", "ts-basic-props")!,
      map.addTilesetImage("basic-struct", "ts-basic-struct")!,
      map.addTilesetImage("basic-wall", "ts-basic-wall")!,
      map.addTilesetImage("td-basic-stone", "ts-td-basic-stone")!,
      map.addTilesetImage("td-basic-wall", "ts-td-basic-wall")!,
      map.addTilesetImage("td-basic-plant", "ts-td-basic-plant")!,
      map.addTilesetImage("td-basic-props", "ts-td-basic-props")!,
      map.addTilesetImage("td-basic-struct", "ts-td-basic-struct")!,
      map.addTilesetImage("pipoya-basechip", "ts-pipoya-basechip")!,
    ];
    // Main camera background matches grass so tile seams don't show black gaps
    this.cameras.main.setBackgroundColor(0x5a7a2a);
    map.createLayer("ground", allTilesets, 0, 0)?.setDepth(-2);
    map.createLayer("ground_detail", allTilesets, 0, 0)?.setDepth(-1.5);
    map.createLayer("paths", allTilesets, 0, 0)?.setDepth(-1);
    this.floorInteriorLayer = map.createLayer("floor_interior", allTilesets, 0, 0)?.setDepth(-0.5) ?? undefined;
    this.wallsBaseLayer = map.createLayer("walls_base", allTilesets, 0, 0)?.setDepth(0) ?? undefined;
    map.createLayer("inside walls", allTilesets, 0, 0)?.setDepth(0.5);
    this.wallsTopLayer = map.createLayer("walls_top", allTilesets, 0, 0)?.setDepth(1) ?? undefined;
    this.propsLowLayer = map.createLayer("props_low", allTilesets, 0, 0)?.setDepth(2) ?? undefined;
    this.propsMidLayer = map.createLayer("props_mid", allTilesets, 0, 0)?.setDepth(3) ?? undefined;
    map.createLayer("foliage_painted", allTilesets, 0, 0)?.setDepth(4);
    this.roofLayer = map.createLayer("roof", allTilesets, 0, 0)?.setDepth(26) ?? undefined;
    map.createLayer("overhangs", allTilesets, 0, 0)?.setDepth(25);
    map.createLayer("vfx_marks", allTilesets, 0, 0)?.setDepth(5);
    this.cameras.main.setRoundPixels(true);

    // Expose map dimensions for enemy AI bounds clamping
    (this as any).mapWidth = map.widthInPixels;
    (this as any).mapHeight = map.heightInPixels;

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

    // Extract collision shapes from Tiled BEFORE tree spawning so trees avoid buildings
    const collisionLayer = map.getObjectLayer("collision");
    const collisionRects: { x: number; y: number; w: number; h: number }[] = [];
    const collisionPolygons: { x: number; y: number; points: { x: number; y: number }[] }[] = [];
    if (collisionLayer) {
      for (const obj of collisionLayer.objects) {
        const isEllipse = !!(obj as any).ellipse;
        const polygon = (obj as any).polygon as { x: number; y: number }[] | undefined;

        if (polygon && polygon.length >= 3) {
          // Polygon collision — convert to world coords
          const worldPoints = polygon.map((p: { x: number; y: number }) => ({
            x: obj.x! + p.x,
            y: obj.y! + p.y,
          }));
          collisionPolygons.push({ x: obj.x!, y: obj.y!, points: worldPoints });

          // Arcade physics can't do true polygons — approximate with edge segments
          // Break polygon into small rect bodies along each edge
          for (let i = 0; i < worldPoints.length; i++) {
            const a = worldPoints[i];
            const b = worldPoints[(i + 1) % worldPoints.length];
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const edgeW = Math.max(Math.abs(b.x - a.x), 8);
            const edgeH = Math.max(Math.abs(b.y - a.y), 8);
            const zone = this.add.zone(mx, my, edgeW, edgeH).setOrigin(0.5);
            this.physics.add.existing(zone, true);
            this.obstacles.add(zone);
          }

          // Also store bounding box for tree exclusion
          const xs = worldPoints.map((p: { x: number; y: number }) => p.x);
          const ys = worldPoints.map((p: { x: number; y: number }) => p.y);
          const minX = Math.min(...xs);
          const minY = Math.min(...ys);
          collisionRects.push({
            x: minX, y: minY,
            w: Math.max(...xs) - minX,
            h: Math.max(...ys) - minY,
          });
        } else if (isEllipse) {
          const radius = obj.width! / 2;
          const cx = obj.x! + radius;
          const cy = obj.y! + radius;
          const zone = this.add.zone(cx, cy, radius * 2, radius * 2).setOrigin(0.5);
          this.physics.add.existing(zone, true);
          (zone.body as Phaser.Physics.Arcade.StaticBody).setCircle(radius);
          this.obstacles.add(zone);
          collisionRects.push({ x: obj.x!, y: obj.y!, w: obj.width!, h: obj.height! });
        } else if (obj.width! > 0 && obj.height! > 0) {
          // Standard rectangle — skip zero-size accidental clicks
          const zone = this.add
            .zone(obj.x! + obj.width! / 2, obj.y! + obj.height! / 2, obj.width!, obj.height!)
            .setOrigin(0.5);
          this.physics.add.existing(zone, true);
          this.obstacles.add(zone);
          collisionRects.push({ x: obj.x!, y: obj.y!, w: obj.width!, h: obj.height! });
        }
      }
    }

    // East tree wall — individual sprites so they overlap naturally
    this.spawnTreeWall(collisionRects);

    // Fence border removed — perimeter handled by map tiles

    // A* pathfinding grid — built from collision rects + polygons
    this.pathfinder = new Pathfinder(ENDICOTT_MAP_W, ENDICOTT_MAP_H, collisionRects, collisionPolygons);

    // Starting room — remove Tiled chest tile and replace with half-size sprite
    {
      const propsLayer = map.getLayer("props_low");
      if (propsLayer?.tilemapLayer) {
        propsLayer.tilemapLayer.removeTileAt(50, 52);
      }
      this.startingChestSprite = this.add.sprite(50 * 32 + 16, 52 * 32 + 16, "chest", 0);
      this.startingChestSprite.setScale(0.5);
      this.startingChestSprite.setDepth(2);
    }

    // Starting room door — block the doorway until player presses E
    const startDoorZone = this.add.zone(50 * 32 + 16, 49.5 * 32 + 16, 32, 64).setOrigin(0.5);
    this.physics.add.existing(startDoorZone, true);
    this.obstacles.add(startDoorZone);
    this.startingDoorBody = startDoorZone;

    // Purchasable doors — read from Tiled interactables layer
    this.doors = [];
    const interactLayer = map.getObjectLayer("interactables");
    if (interactLayer) {
      for (const obj of interactLayer.objects) {
        if (obj.type === "door" || (obj as any).type === "door" || (obj as any).class === "door") {
          const props = (obj as any).properties as { name: string; value: any }[] | undefined;
          const cost = props?.find((p: any) => p.name === "cost")?.value ?? 1000;
          const label = props?.find((p: any) => p.name === "label")?.value ?? "Door";
          const locked = props?.find((p: any) => p.name === "locked")?.value ?? false;
          const doorHealth = props?.find((p: any) => p.name === "health")?.value ?? 0;
          const clearColsStr = props?.find((p: any) => p.name === "clearCols")?.value ?? "";
          const clearRowsStr = props?.find((p: any) => p.name === "clearRows")?.value ?? "";
          const clearCols = clearColsStr ? clearColsStr.split(",").map(Number) : [];
          const clearRows = clearRowsStr ? clearRowsStr.split(",").map(Number) : [];

          // Create a collision zone that blocks the doorway
          const doorZone = this.add
            .zone(obj.x! + obj.width! / 2, obj.y! + obj.height! / 2, obj.width!, obj.height!)
            .setOrigin(0.5);
          this.physics.add.existing(doorZone, true);
          this.obstacles.add(doorZone);

          // Save original tile GIDs from all layers so we can restore them when the door closes
          const savedTiles: { col: number; row: number; gid: number; layer: string }[] = [];
          const layerMap: [string, Phaser.Tilemaps.TilemapLayer | undefined][] = [
            ["walls_base", this.wallsBaseLayer],
            ["walls_top", this.wallsTopLayer],
            ["props_low", this.propsLowLayer],
            ["props_mid", this.propsMidLayer],
          ];
          for (const col of clearCols) {
            for (const row of clearRows) {
              for (const [name, layer] of layerMap) {
                const tile = layer?.getTileAt(col, row);
                if (tile) savedTiles.push({ col, row, gid: tile.index, layer: name });
              }
            }
          }

          this.doors.push({ zone: doorZone, cost, label, opened: false, paid: false, locked, health: doorHealth, maxHealth: doorHealth, broken: false, clearCols, clearRows, savedTiles });
        }
      }
    }

    // Generator + Machines — read from interactables layer
    if (interactLayer) {
      for (const obj of interactLayer.objects) {
        const objType = ((obj as any).type || (obj as any).class || "").toLowerCase();
        const props = (obj as any).properties as { name: string; value: any }[] | undefined;
        const cx = obj.x! + (obj.width || 32) / 2;
        const cy = obj.y! + (obj.height || 64) / 2;

        if (objType === "generator") {
          const label = props?.find((p: any) => p.name === "label")?.value ?? "Generator";
          const sprite = this.add.sprite(cx, cy, "generator-off").setDepth(3);
          this.generator = { sprite, x: cx, y: cy };
        } else if (objType === "machine") {
          const name = ((obj as any).name || "").toLowerCase();
          const machineType = name.includes("zyn") ? "zyn" : "keg";
          const cost = props?.find((p: any) => p.name === "cost")?.value ?? 1000;
          const label = props?.find((p: any) => p.name === "label")?.value ?? "Machine";
          const textureKey = `machine-${machineType}-off`;
          const sprite = this.add.sprite(cx, cy, textureKey).setDepth(3);
          this.machines.push({ machineType, label, cost, x: cx, y: cy, sprite, purchased: false });
        }
      }
    }

    // Public demo (e.g. Vercel): only the first $300 Gate is openable; all other purchasable doors stay locked.
    if (isPublicBuild()) {
      for (const door of this.doors) {
        if (door.label !== PUBLIC_BUILD_UNLOCKABLE_DOOR_LABEL) {
          door.locked = true;
        }
      }
    }

    // Player — spawn inside starting room (tile 50, 53)
    const spawnX = 50 * 32 + 16; // tile center
    const spawnY = 53 * 32 + 16;
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

    // Enemy-obstacle collision (includes door-bashing)
    this.physics.add.collider(this.enemies, this.obstacles, this.handleEnemyObstacleCollision, undefined, this);

    // Enemy-enemy collision — only separate when far from player so they can mob up close
    this.physics.add.collider(this.enemies, this.enemies, undefined, (a, b) => {
      const player = this.player;
      if (!player?.active) return true;
      const e1 = a as Enemy;
      const e2 = b as Enemy;
      const d1 = Phaser.Math.Distance.Between(e1.x, e1.y, player.x, player.y);
      const d2 = Phaser.Math.Distance.Between(e2.x, e2.y, player.x, player.y);
      // If both are within attack range of the player, let them stack
      return d1 > 80 || d2 > 80;
    }, this);

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
        if (this.gameOver || this.paused || this.scaryboiIntroActive || this.masonCutsceneActive) return;
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
        if (this.gameOver || this.paused || this.scaryboiIntroActive || this.masonCutsceneActive) return;
        if (this.shopOpen) {
          this.closeShop();
        } else if (this.devMode || this.waveManager.state === "intermission" || this.waveManager.state === "pre_game") {
          this.openShop();
        }
      });

      // E key to interact (chest, starting door, purchasable doors, generator, machines)
      const eKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
      eKey.on("down", () => {
        if (this.gameOver || this.paused || this.shopOpen) return;
        if (this.tryStartingChest()) return;
        if (this.tryStartingDoor()) return;
        if (this.tryInteractGenerator()) return;
        if (this.tryBuyMachine()) return;
        this.tryBuyNearbyDoor();
      });

      // SPACE to skip/ready up during intermission (overrides melee during intermission)
      // (melee SPACE handler above already checks shopOpen but not intermission —
      //  we handle priority in the melee handler by also checking wave state)

      // V key to toggle barricade orientation
      const vKey = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.V
      );
      vKey.on("down", () => {
        if (this.gameOver || this.paused || this.scaryboiIntroActive || this.masonCutsceneActive) return;
        if (this.activeSlot !== 3) return; // only when barricade is selected
        this.barricadeVertical = !this.barricadeVertical;
        const orient = this.barricadeVertical ? "VERTICAL" : "HORIZONTAL";
        this.showWeaponMessage(orient, "#44dd44");
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

      // Dev mode — Shift+Backtick, localhost only
      if (typeof window !== "undefined" && window.location.hostname === "localhost") {
        const backtick = this.input.keyboard.addKey(
          Phaser.Input.Keyboard.KeyCodes.BACKTICK
        );
        backtick.on("down", () => {
          if (!this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT).isDown) return;
          this.devMode = !this.devMode;
          if (this.devMode) {
            this.currency = 99999;
            this.showWeaponMessage("DEV MODE ON", "#ff4444");
          } else {
            this.player.invincible = false;
            hudState.update({ devPanelOpen: false, devSpawningDisabled: false });
            this.waveManager.spawningDisabled = false;
            this.showWeaponMessage("DEV MODE OFF", "#ff4444");
          }
          hudState.update({ devMode: this.devMode });
        });

        // F1: give $9999
        const f1 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F1);
        f1.on("down", () => {
          if (!this.devMode) return;
          this.currency += 9999;
          this.showWeaponMessage("DEV: +$9999", "#ff4444");
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
          this.showWeaponMessage("DEV: WAVE SKIP", "#ff4444");
        });

        // F3: full heal
        const f3 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F3);
        f3.on("down", () => {
          if (!this.devMode) return;
          this.player.stats.health = this.player.stats.maxHealth;
          this.player.stats.stamina = this.player.stats.maxStamina;
          this.player.burnedOut = false;
          this.showWeaponMessage("DEV: FULL HEAL", "#ff4444");
        });

        // F4: god mode toggle (invincible)
        const f4 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F4);
        f4.on("down", () => {
          if (!this.devMode) return;
          this.player.invincible = !this.player.invincible;
          this.showWeaponMessage(this.player.invincible ? "DEV: GOD MODE ON" : "DEV: GOD MODE OFF", "#ff4444");
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
              this.showWeaponMessage(`DEV: JUMP TO WAVE ${payload}`, "#ff4444");
              break;
            case "toggleSpawning":
              this.waveManager.spawningDisabled = !this.waveManager.spawningDisabled;
              hudState.update({ devSpawningDisabled: this.waveManager.spawningDisabled });
              this.showWeaponMessage(
                this.waveManager.spawningDisabled ? "DEV: SPAWNING OFF" : "DEV: SPAWNING ON",
                "#ff4444"
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
              this.showWeaponMessage("DEV: KILLED ALL", "#ff4444");
              break;
            case "spawnEnemy": {
              const { type, count } = payload as { type: string; count: number };
              this.waveManager.devSpawnEnemy(type as any, count);
              this.showWeaponMessage(`DEV: SPAWNED ${count}x ${type.toUpperCase()}`, "#ff4444");
              break;
            }
          }
        });
      }
    }

    // HUD container — still needed for game-over and level-up that use Phaser overlays
    this.hudContainer = this.add.container(0, 0);
    this.hudContainer.setDepth(250);
    this.minimap.ignore(this.hudContainer);
    this.minimap.ignore(this.barricadeGhost);

    // Health/stamina bars are rendered in React (HUDOverlay)

    this.baseDamage = this.player.stats.damage;
    this.damageBoostActive = false;

    this.initShop();
    this.registerReactActions();

    // Wave manager
    // Grab layer refs for field-tile checking
    const groundLayer = map.getLayer("ground")?.tilemapLayer;
    const propsLowLayer = map.getLayer("props_low")?.tilemapLayer;
    const propsMidLayer = map.getLayer("props_mid")?.tilemapLayer;

    // Expose field-tile check for dog roaming AI
    const isFieldTile = (tx: number, ty: number): boolean => {
      if (!groundLayer?.getTileAt(tx, ty)) return false;
      if (this.wallsBaseLayer?.getTileAt(tx, ty)) return false;
      if (this.wallsTopLayer?.getTileAt(tx, ty)) return false;
      if (this.floorInteriorLayer?.getTileAt(tx, ty)) return false;
      if (this.roofLayer?.getTileAt(tx, ty)) return false;
      if (propsLowLayer?.getTileAt(tx, ty)) return false;
      if (propsMidLayer?.getTileAt(tx, ty)) return false;
      return true;
    };
    (this as any).isFieldTile = isFieldTile;

    this.waveManager = new WaveManager({
      scene: this,
      enemies: this.enemies,
      playerCount: 1,
      getPlayerPos: () => ({ x: this.player.x, y: this.player.y }),
      isFieldTile,
      isDoorOpen: (label: string) => {
        const door = this.doors.find((d) => d.label === label);
        // Public demo: missing door data = treat as closed so spawns never leak into locked map areas.
        if (!door) return !isPublicBuild();
        return door.paid || door.broken;
      },
    });

    // Ambient background loops
    try {
      if (this.cache.audio.exists("sfx-ambient-birds")) {
        const birds = this.sound.add("sfx-ambient-birds", { volume: 0.15, loop: true });
        birds.play();
        this.ambientSounds.push(birds);
      }
    } catch { /* AudioContext may be closed during HMR */ }

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
      // Auto-refill stamina at wave start
      this.player.stats.stamina = this.player.stats.maxStamina;
      this.player.burnedOut = false;

      this.showWaveAnnouncement(wave);
    };

    this.waveManager.onIntermissionStart = () => {
      // Wave completion bonus
      const waveBonus = BALANCE.economy.waveCompletionBonus.base +
        this.waveManager.wave * BALANCE.economy.waveCompletionBonus.perWave;
      this.currency += waveBonus;
      this.showWeaponMessage(`+$${waveBonus} WAVE CLEAR`, "#44dd44");

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

    this.waveManager.onBossFlee = () => {
      this.showWeaponMessage("SCARYBOI RETREATS...", "#ff4444");
      this.playSound("sfx-church-bell", 0.3);
    };

    this.waveManager.onBossFirstSpawn = () => {
      this.scaryboiIntroActive = true;
      this.physics.pause();
      this.game.canvas.style.pointerEvents = "none";
      hudState.update({ scaryboiIntroActive: true });
    };

    hudState.registerScaryboiIntroAction(() => {
      // React handles the 700ms fade-out. Re-enable input after it completes.
      this.time.delayedCall(700, () => {
        this.scaryboiIntroActive = false;
        this.physics.resume();
        this.game.canvas.style.pointerEvents = "auto";
        hudState.update({ scaryboiIntroActive: false });
      });
    });

    // MASON — scripted villain callbacks
    this.waveManager.onMasonAnnouncement = () => {
      this.masonCutsceneActive = true;
      this.physics.pause();
      this.game.canvas.style.pointerEvents = "none";
      hudState.update({ masonAnnouncementActive: true });
    };

    this.waveManager.onMasonFirstSpawn = () => {
      this.masonCutsceneActive = true;
      this.physics.pause();
      this.game.canvas.style.pointerEvents = "none";
      hudState.update({ masonFightIntroActive: true });
    };

    this.waveManager.onMasonFinalFight = () => {
      this.masonCutsceneActive = true;
      this.physics.pause();
      this.game.canvas.style.pointerEvents = "none";
      hudState.update({ masonFinalIntroActive: true });
    };

    this.waveManager.onMasonFlee = () => {
      this.showWeaponMessage("MASON RETREATS...", "#7c3aed");
    };

    this.waveManager.onMasonDefeated = () => {
      this.showWeaponMessage("MASON DEFEATED", "#7c3aed");
    };

    hudState.registerMasonAnnouncementAction(() => {
      this.time.delayedCall(700, () => {
        this.masonCutsceneActive = false;
        this.physics.resume();
        this.game.canvas.style.pointerEvents = "auto";
        hudState.update({ masonAnnouncementActive: false, masonFightIntroActive: false, masonFinalIntroActive: false });
      });
    });

    // Player spawns inside — build interior darkness immediately (no fade)
    const spawnTileX = Math.floor(this.player.x / 32);
    const spawnTileY = Math.floor(this.player.y / 32);
    this.buildInteriorDarkness(spawnTileX, spawnTileY);
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

    if (this.gameOver || this.paused || this.scaryboiIntroActive || this.masonCutsceneActive) return;

    // Freeze player movement while shop or level-up overlay is open
    if (this.shopOpen || this.levelUpActive) {
      this.player.body.setVelocity(0, 0);
    } else {
      this.player.update();
    }
    this.waveManager.update(delta);
    this.pathfinder.calculate();

    // Door proximity prompts
    this.updateStartingRoomPrompts();
    this.updateDoorPrompts();
    this.updateMachinePrompts();

    // Roof fade — hide roof when player is under it
    this.updateRoofVisibility();
    this.updateInteriorDarkness();

    // Barricade placement ghost
    const showGhost = this.activeSlot === 3
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
    if (this.fireHeld && !this.shopOpen && (this.activeSlot === 1 || this.activeSlot === 2)) {
      const wDef = BALANCE.weapons[this.activeWeapon as keyof typeof BALANCE.weapons];
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

    // Smokescreen buff tick (Jason) — damage + stamina regen bonus
    if (this.smokeBuffTimer > 0) {
      this.smokeBuffTimer -= delta;
      // Extra stamina regen
      this.player.stats.stamina = Math.min(
        this.player.stats.maxStamina,
        this.player.stats.stamina + this.smokeBuffRegenBonus * (delta / 1000)
      );
      if (this.smokeBuffTimer <= 0) {
        this.smokeBuffTimer = 0;
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
    // Guard against closed AudioContext (happens during HMR / scene teardown)
    try {
      if (this.cache.audio.exists(key) && this.sound?.locked === false) {
        const final = Math.min(volume * this.sfxVolume, 0.6);
        this.sound.play(key, { volume: final });
      }
    } catch {
      // AudioContext closed — safe to ignore
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
    const available: number[] = [1]; // pistol always available
    if (this.secondaryWeapon) available.push(2); // secondary gun
    if ((this.trapInventory.get("barricade" as TrapType) ?? 0) > 0) available.push(3);
    if ((this.trapInventory.get("landmine" as TrapType) ?? 0) > 0) available.push(4);
    return available;
  }

  private cycleSlot(dir: number) {
    const available = this.getAvailableSlots();
    if (available.length === 0) return;

    // Cancel reload when switching weapons
    if (this.reloading) {
      this.reloading = false;
      if (this.reloadTimer) { this.reloadTimer.destroy(); this.reloadTimer = null; }
      this.player.stopReload();
    }

    const currentIdx = available.indexOf(this.activeSlot);
    let nextIdx: number;
    if (currentIdx === -1) {
      nextIdx = 0;
    } else {
      nextIdx = (currentIdx + dir + available.length) % available.length;
    }
    this.selectSlot(available[nextIdx]);
  }

  private selectSlot(index: number) {
    const available = this.getAvailableSlots();
    if (!available.includes(index)) return;

    // Cancel reload when switching weapons
    if ((index === 1 || index === 2) && index !== this.activeSlot && this.reloading) {
      this.reloading = false;
      if (this.reloadTimer) { this.reloadTimer.destroy(); this.reloadTimer = null; }
      this.player.stopReload();
    }

    this.activeSlot = index;
    // Set active weapon when selecting a gun slot
    if (index === 1) this.activeWeapon = "pistol";
    if (index === 2) this.activeWeapon = this.secondaryWeapon!;
    // Set trap index when selecting a trap slot
    if (index === 3) this.selectedTrapIndex = 0; // barricade
    if (index === 4) this.selectedTrapIndex = 1; // mine

    const names: Record<number, string> = {
      1: "PISTOL",
      2: this.secondaryWeapon?.toUpperCase() ?? "WEAPON",
      3: "BARRICADE",
      4: "MINE",
    };
    this.showWeaponMessage(names[index], "#44dd44");
  }

  private useActiveSlot() {
    switch (this.activeSlot) {
      case 1:
      case 2:
        this.fireWeapon();
        break;
      case 3:
        this.selectedTrapIndex = 0; // barricade
        this.placeTrap();
        break;
      case 4:
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
      const baseDmg = this.player.stats.damage + (this.smokeBuffTimer > 0 ? this.smokeBuffDamageBonus : 0);
      const damage = this.player.burnedOut
        ? Math.floor(baseDmg * BALANCE.burnout.damageMultiplier)
        : baseDmg;

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
          this.onEnemyKilled(enemy, "melee");
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

  private onEnemyKilled(enemy: Enemy, source: "melee" | "ranged" | "trap" = "ranged") {
    this.kills++;
    // Kill reward with scavenger bonus — melee kills earn 25% more
    const effective = this.levelingSystem.getEffectiveStats(this.characterDef.stats);
    const baseReward = BALANCE.economy.killReward[enemy.enemyType];
    const meleeBonus = source === "melee" ? 0.25 : 0;
    const bonus = Math.floor(baseReward * (effective.killBonusPct + meleeBonus));
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
        this.onEnemyKilled(enemy, "melee");
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
        this.onEnemyKilled(enemy, "melee");
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
  }

  /** Jason — Smokescreen: smoke cloud that heals player and confuses enemies */
  private abilitySmokescreen() {
    // Play cigarette animation with hold, then cleanly restore state
    this.player.playAbilityAnimation("light-cigarette", 1500);

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

    // Activate damage + stamina buff (lasts longer than smoke)
    this.smokeBuffTimer = this.smokeBuffDuration;
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

  private updateSmokescreen(_delta: number) {
    this.drawSmokeCloud();
    // Smoke is purely visual now — buff (damage + stamina) is applied in the main update loop
  }

  private destroySmokescreen() {
    if (this.smokeCloud) {
      this.smokeCloud.destroy();
      this.smokeCloud = null;
    }
    this.smokeTimer = 0;
    this.smokeDrainAccum = 0;
  }

  /** Get current weapon's ammo object */
  private get currentAmmo() { return this.weaponAmmo[this.activeWeapon]; }
  private get currentWeaponDef() { return BALANCE.weapons[this.activeWeapon as keyof typeof BALANCE.weapons]; }

  private fireWeapon() {
    const ammo = this.currentAmmo;
    if (!ammo) return;
    if (this.reloading) return;

    if (ammo.mag <= 0) {
      if (ammo.reserve > 0) {
        this.startReload();
      } else {
        this.playSound("sfx-dryfire", 0.4);
        this.showWeaponMessage("NO AMMO", "#ff4444");
      }
      return;
    }

    const weaponDef = this.currentWeaponDef;
    if (!weaponDef) return;

    const now = this.time.now;
    if (now - this.lastFireTime < weaponDef.fireRate) return;
    this.lastFireTime = now;

    const angle = this.getFacingAngle();
    const dmgMult = 1;
    const smokeBonus = this.smokeBuffTimer > 0 ? this.smokeBuffDamageBonus : 0;

    // Point-blank hit check
    const pbRange = 30;
    this.enemies.getChildren().forEach((obj) => {
      const enemy = obj as Enemy;
      if (!enemy.active) return;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
      if (dist > pbRange) return;
      for (let p = 0; p < weaponDef.pellets; p++) {
        let damage = Math.floor((weaponDef.damage + smokeBonus) * dmgMult);
        if ("closeRangeBonus" in weaponDef) {
          damage = Math.floor(damage * (weaponDef as any).closeRangeBonus);
        }
        if (this.rollCrit(this.activeWeapon, 0)) {
          damage = Math.floor(damage * BALANCE.crit.damageMultiplier);
          this.showCritEffect(enemy.x, enemy.y, "ranged");
        }
        const killed = enemy.takeDamage(damage, "ranged");
        if (killed) { this.onEnemyKilled(enemy); break; }
      }
    });

    // Spawn projectiles
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
        Math.floor((weaponDef.damage + smokeBonus) * dmgMult),
        weaponDef.range,
        weaponDef.dropoff,
        this.activeWeapon
      );
      this.projectiles.add(proj, true);
      proj.launch();
    }

    ammo.mag--;

    this.player.playShoot(this.activeWeapon);

    // Weapon fire sound
    if (this.activeWeapon === "pistol") {
      this.playSound("sfx-pistol", 0.4);
    } else if (this.activeWeapon === "shotgun") {
      this.playSound("sfx-shotgun", 0.4);
    } else if (this.activeWeapon === "smg") {
      this.playSound("sfx-smg", 0.3);
    }

    // Muzzle flash
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

    // Auto-reload when magazine empties
    if (ammo.mag <= 0) {
      if (ammo.reserve > 0) {
        this.startReload();
      } else {
        this.time.delayedCall(250, () => {
          this.playSound("sfx-dryfire", 1.0);
          this.showWeaponMessage("NO AMMO", "#ff4444");
        });
      }
    }
  }

  private startReload() {
    const ammo = this.currentAmmo;
    const weaponDef = this.currentWeaponDef;
    if (!ammo || !weaponDef || this.reloading) return;
    if (ammo.mag >= weaponDef.magazineSize) return;
    if (ammo.reserve <= 0 && ammo.mag <= 0) return;

    this.reloading = true;
    this.showWeaponMessage("RELOADING", "#ff4444");
    this.player.playReload(this.activeWeapon);

    // Zyn perk: faster reload
    const effectiveReloadMs = Math.floor(weaponDef.reloadMs * this.reloadSpeedMultiplier);

    // Play reload sound mid-animation (magazine click moment, ~50% through)
    const reloadingWeapon = this.activeWeapon; // capture in case player switches
    this.time.delayedCall(Math.floor(effectiveReloadMs * 0.5), () => {
      if (!this.reloading) return; // cancelled
      if (reloadingWeapon === "shotgun") {
        this.playSound("sfx-reload-shotgun", 0.5);
      } else {
        this.playSound("sfx-reload-rifle", 0.5);
      }
    });

    this.reloadTimer = this.time.delayedCall(effectiveReloadMs, () => {
      const wAmmo = this.weaponAmmo[reloadingWeapon];
      const wDef = BALANCE.weapons[reloadingWeapon as keyof typeof BALANCE.weapons];
      if (!wAmmo || !wDef) { this.reloading = false; return; }
      const needed = wDef.magazineSize - wAmmo.mag;
      const loaded = Math.min(needed, wAmmo.reserve);
      wAmmo.mag += loaded;
      wAmmo.reserve -= loaded;
      this.reloading = false;
      this.reloadTimer = null;
      this.showWeaponMessage("RELOADED", "#44dd44");
    });
  }

  private activeWeaponMsg?: Phaser.GameObjects.Text;

  private showWeaponMessage(msg: string, color: string) {
    // Destroy previous message so only 1 shows at a time
    if (this.activeWeaponMsg) {
      this.activeWeaponMsg.destroy();
      this.activeWeaponMsg = undefined;
    }

    const isGreen = color === "#44dd44";
    const txt = this.add.text(
      this.player.x, this.player.y - 40, msg,
      {
        fontFamily: "ChakraPetch, sans-serif",
        fontSize: "36px",
        fontStyle: "bold",
        stroke: "#000000",
        strokeThickness: 6,
        shadow: {
          offsetX: 0, offsetY: 0,
          color: isGreen ? "#00ff88" : "#ff2200",
          blur: 6, fill: true, stroke: false,
        },
      }
    ).setDepth(100).setOrigin(0.5).setScale(0.25).setAlpha(0);

    // Horizontal gradient
    const g = txt.context.createLinearGradient(0, 0, txt.width, 0);
    if (isGreen) {
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.3, "#44ff88");
      g.addColorStop(0.7, "#44ff88");
      g.addColorStop(1, "#ffffff");
    } else {
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.3, "#ff4444");
      g.addColorStop(0.7, "#ff4444");
      g.addColorStop(1, "#ffffff");
    }
    txt.setFill(g);

    this.activeWeaponMsg = txt;

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
          onComplete: () => {
            txt.destroy();
            if (this.activeWeaponMsg === txt) this.activeWeaponMsg = undefined;
          },
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
        this.showWeaponMessage(name.toUpperCase(), "#44dd44");
        return;
      }
    }
    this.showWeaponMessage("NO TRAPS", "#ff4444");
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
        this.onEnemyKilled(enemy, "trap");
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
      const weaponKey = this.activeWeapon;
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
      let incomingDmg = enemy.getEffectiveDamage();
      // Keg perk: armor absorbs damage before HP
      if (this.armor > 0) {
        const absorbed = Math.min(this.armor, incomingDmg);
        this.armor -= absorbed;
        incomingDmg -= absorbed;
        if (this.armor <= 0) {
          this.showWeaponMessage("ARMOR BROKEN", "#ff8844");
        }
      }
      this.player.stats.health -= incomingDmg;
      enemy.playBite();
      this.playBiteSound();

      // Brief nudge on contact — just enough to trigger bite anim, not repel them
      const pushAngle = Phaser.Math.Angle.Between(
        this.player.x,
        this.player.y,
        enemy.x,
        enemy.y
      );
      const pushForce = enemy.enemyType === "fast" ? 80 : enemy.enemyType === "boss" ? 20 : 40;
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
    this.game.canvas.style.pointerEvents = "none"; // Let React handle clicks during game over
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

  private spawnTreeWall(collisionRects: { x: number; y: number; w: number; h: number }[] = []) {
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
    const collisionBuffer = 80; // extra clearance around building walls
    const isExcluded = (x: number, y: number) => {
      for (const z of roadZones) {
        if (
          x > z.x - roadBuffer && x < z.x + z.w + roadBuffer &&
          y > z.y - roadBuffer && y < z.y + z.h + roadBuffer
        ) return true;
      }
      for (const r of collisionRects) {
        if (
          x > r.x - collisionBuffer && x < r.x + r.w + collisionBuffer &&
          y > r.y - collisionBuffer && y < r.y + r.h + collisionBuffer
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
      const fx = x + rng(-12, 12);
      const fy = y + rng(-10, 10);
      if (isExcluded(fx, fy)) return;
      const isDark = Math.random() < 0.3;
      const sheet = isDark ? "dark-trees-64" : "trees-64";
      const frame = Math.floor(Math.random() * 16);
      const tree = this.add.sprite(fx, fy, sheet, frame);
      tree.setOrigin(0.5, 0.8);
      tree.setDepth(fy / 10);
      tree.setScale(rng(0.9, 1.15));
    };

    const placeSparseTree = (x: number, y: number) => {
      const fx = x + rng(-8, 8);
      const fy = y + rng(-8, 8);
      if (isExcluded(fx, fy)) return;
      if (Math.random() < 0.45) return;
      const isDark = Math.random() < 0.4;
      const sheet = isDark ? "dark-trees-64" : "trees-64";
      const frame = Math.floor(Math.random() * 16);
      const tree = this.add.sprite(fx, fy, sheet, frame);
      tree.setOrigin(0.5, 0.8);
      tree.setDepth(fy / 10);
      tree.setScale(rng(0.85, 1.1));
    };

    // --- EAST PERIMETER ---
    // Dense at the far edge, gradually thins toward center
    const eastEdgeX = 57 * 32; // dense wall starts here (pushed right to clear paths)
    for (let baseY = -32; baseY < mapH + 32; baseY += spacingY) {
      const wobble = edgeWobble(baseY, 42);
      // Dense zone: eastEdgeX to map edge
      for (let baseX = eastEdgeX + wobble; baseX < mapW + 32; baseX += spacingX) {
        placeTree(baseX, baseY);
      }
      // Gradient zone: gets sparser the further from the edge (narrower to avoid paths)
      const gradientStart = eastEdgeX + wobble - 64; // ~2 tiles of gradient
      for (let baseX = gradientStart; baseX < eastEdgeX + wobble; baseX += spacingX * 1.3) {
        const distFromEdge = (eastEdgeX + wobble) - baseX;
        const skipChance = distFromEdge / 100; // thins out faster
        if (Math.random() < skipChance) continue;
        placeSparseTree(baseX, baseY);
      }
    }

    // --- SOUTHEAST PERIMETER ---
    // Tighter band, ~2-3 tiles deep with gradient
    const southEdgeY = 57 * 32; // dense wall starts here (pushed down to clear paths)
    for (let baseX = 30 * 32; baseX < eastEdgeX - 64; baseX += spacingX) {
      const wobble = edgeWobble(baseX, 97);
      // Dense zone: southEdgeY to map edge (narrow band)
      for (let baseY = southEdgeY + wobble; baseY < mapH + 32; baseY += spacingY) {
        placeTree(baseX, baseY);
      }
      // Thin gradient above the dense line
      const gradientStart = southEdgeY + wobble - 48; // ~1.5 tiles of gradient
      for (let baseY = gradientStart; baseY < southEdgeY + wobble; baseY += spacingY * 1.5) {
        const distFromEdge = (southEdgeY + wobble) - baseY;
        const skipChance = distFromEdge / 60;
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
          this.updateHUD(); // push stats data immediately (game loop is paused)
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
    // Make canvas non-interactive so React pause menu buttons receive clicks
    this.game.canvas.style.pointerEvents = "none";
    hudState.update({ paused: true });
  }

  private resumeGame() {
    this.paused = false;
    this.settingsOpen = false;
    this.statsOpen = false;
    this.physics.resume();
    this.game.canvas.style.pointerEvents = "auto";
    // Brief grace period to prevent accidental punch on resume
    this.lastPunchTime = this.time.now;
    hudState.update({ paused: false, settingsOpen: false, statsOpen: false });
  }

  // ------- Shop (React overlay — data push only) -------

  private readonly shopIconMap: Record<string, string> = {
    pistol: "/assets/sprites/items/pistol.png",
    shotgun: "/assets/sprites/items/shotgun.png",
    smg: "/assets/sprites/items/smg.png",
    ammo_light: "/assets/sprites/items/ammo.png",
    ammo_shotgun: "/assets/sprites/items/ammo.png",
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
      if (id === "heal" || id === "medkit" || id === "dmgBoost") columns[0].push({ idx });
      else if (["shotgun", "smg", "ammo_light", "ammo_shotgun"].includes(id)) columns[1].push({ idx });
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
      const isEquipped = ["shotgun", "smg"].includes(item.id) && this.secondaryWeapon === item.id;
      const id = item.id;
      let category: "supplies" | "weapons" | "traps" = "supplies";
      if (["shotgun", "smg", "ammo_light", "ammo_shotgun"].includes(id)) category = "weapons";
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

  // ─── Roof visibility ───

  private updateRoofVisibility() {
    if (!this.roofLayer) return;
    const tileX = Math.floor(this.player.x / 32);
    const tileY = Math.floor(this.player.y / 32);
    const tile = this.roofLayer.getTileAt(tileX, tileY);
    const shouldShow = !tile; // hide roof when player is under a roof tile

    if (shouldShow && !this.roofVisible) {
      this.roofVisible = true;
      this.tweens.add({
        targets: this.roofLayer,
        alpha: 1,
        duration: 300,
        ease: "Sine.easeInOut",
      });
    } else if (!shouldShow && this.roofVisible) {
      this.roofVisible = false;
      this.tweens.add({
        targets: this.roofLayer,
        alpha: 0,
        duration: 300,
        ease: "Sine.easeInOut",
      });
    }
  }

  // ─── Interior darkness (fog of war inside buildings) ───

  private updateInteriorDarkness() {
    if (!this.floorInteriorLayer || !this.roofLayer) return;

    const tileX = Math.floor(this.player.x / 32);
    const tileY = Math.floor(this.player.y / 32);
    const roofTile = this.roofLayer.getTileAt(tileX, tileY);
    const isInside = !!roofTile;

    if (isInside && !this.playerInsideBuilding) {
      this.playerInsideBuilding = true;
      this.fadeInInteriorDarkness(tileX, tileY);
    } else if (!isInside && this.playerInsideBuilding) {
      this.playerInsideBuilding = false;
      this.fadeOutInteriorDarkness();
    }
  }

  /** Flood-fill building interior, create black overlay with holes for visible tiles */
  private buildInteriorDarkness(startTileX: number, startTileY: number) {
    if (this.interiorDarknessRT) {
      this.interiorDarknessRT.destroy();
    }
    if (!this.floorInteriorLayer) return;

    // Flood-fill connected interior tiles
    const visited = new Set<string>();
    const queue: [number, number][] = [[startTileX, startTileY]];
    const interiorTiles: [number, number][] = [];

    while (queue.length > 0) {
      const [tx, ty] = queue.pop()!;
      const key = `${tx},${ty}`;
      if (visited.has(key)) continue;
      visited.add(key);

      const tile = this.floorInteriorLayer.getTileAt(tx, ty);
      if (!tile) continue;
      // Only include tiles that are actually under a roof (skip stray floor tiles)
      if (!this.roofLayer?.getTileAt(tx, ty)) continue;

      interiorTiles.push([tx, ty]);
      queue.push([tx - 1, ty], [tx + 1, ty], [tx, ty - 1], [tx, ty + 1]);
    }

    // Expand by 1 tile in cardinal directions — only into tiles with wall/roof content
    const interiorSet = new Set(interiorTiles.map(([tx, ty]) => `${tx},${ty}`));
    const expandedSet = new Set<string>(interiorSet);
    const cardinals = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (const [tx, ty] of interiorTiles) {
      for (const [dx, dy] of cardinals) {
        const nx = tx + dx;
        const ny = ty + dy;
        const key = `${nx},${ny}`;
        if (expandedSet.has(key)) continue;
        const hasWall = this.wallsBaseLayer?.getTileAt(nx, ny)
          || this.wallsTopLayer?.getTileAt(nx, ny)
          || this.roofLayer?.getTileAt(nx, ny);
        if (hasWall) {
          expandedSet.add(key);
        }
      }
    }

    const mapW = 100 * 32;
    const mapH = 60 * 32;

    // Create RenderTexture: fill black, then erase interior tiles
    const rt = this.add.renderTexture(0, 0, mapW, mapH);
    rt.setOrigin(0, 0);
    rt.setDepth(200); // above all game objects (trees go up to ~192), below HUD (150+minimap 160)

    // Fill entirely with black
    rt.fill(0x000000, 1);

    // Erase (punch out) the interior tiles so they're transparent
    const eraser = this.make.graphics({ x: 0, y: 0 });
    eraser.fillStyle(0xffffff, 1);
    for (const key of expandedSet) {
      const [tx, ty] = key.split(",").map(Number);
      eraser.fillRect(tx * 32, ty * 32, 32, 32);
    }
    rt.erase(eraser);
    eraser.destroy();

    this.interiorDarknessRT = rt;
  }

  /** Fade to black, build the interior darkness, then reveal */
  private fadeInInteriorDarkness(tileX: number, tileY: number) {
    // Create a full-screen black overlay for the transition
    const fade = this.add.graphics();
    fade.setDepth(201);
    fade.fillStyle(0x000000, 1);
    fade.fillRect(0, 0, 100 * 32, 60 * 32);
    fade.setAlpha(0);

    this.tweens.add({
      targets: fade,
      alpha: 1,
      duration: 250,
      ease: "Sine.easeIn",
      onComplete: () => {
        // Build the interior mask while screen is black
        this.buildInteriorDarkness(tileX, tileY);
        // Fade the transition overlay out, revealing the masked interior
        this.tweens.add({
          targets: fade,
          alpha: 0,
          duration: 400,
          ease: "Sine.easeOut",
          onComplete: () => fade.destroy(),
        });
      },
    });
  }

  /** Fade to black, remove the interior darkness, then reveal the outside */
  private fadeOutInteriorDarkness() {
    // Create a full-screen black overlay for the transition
    const fade = this.add.graphics();
    fade.setDepth(201);
    fade.fillStyle(0x000000, 1);
    fade.fillRect(0, 0, 100 * 32, 60 * 32);
    fade.setAlpha(0);

    this.tweens.add({
      targets: fade,
      alpha: 1,
      duration: 250,
      ease: "Sine.easeIn",
      onComplete: () => {
        // Remove interior darkness while screen is black
        if (this.interiorDarknessRT) {
          this.interiorDarknessRT.destroy();
          this.interiorDarknessRT = undefined;
        }
        // Fade the transition overlay out, revealing the full map
        this.tweens.add({
          targets: fade,
          alpha: 0,
          duration: 400,
          ease: "Sine.easeOut",
          onComplete: () => fade.destroy(),
        });
      },
    });
  }

  // ─── Starting Room (chest + door before wave 1) ───

  private readonly startChestX = 50 * 32 + 16; // tile (50, 52) center
  private readonly startChestY = 52 * 32 + 16;
  private readonly startDoorX = 50 * 32 + 16;  // tile (50, 49-50) center
  private readonly startDoorY = 49.5 * 32 + 16; // midpoint between rows 49-50
  private readonly startInteractDist = 50; // px

  private updateStartingRoomPrompts() {
    if (this.waveManager.state !== "pre_game") {
      if (this.startingChestPrompt) { this.startingChestPrompt.setVisible(false); }
      if (this.startingDoorPrompt) { this.startingDoorPrompt.setVisible(false); }
      return;
    }

    // Chest prompt
    if (!this.startingChestOpened) {
      const chestDist = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, this.startChestX, this.startChestY
      );
      if (chestDist < this.startInteractDist) {
        if (!this.startingChestPrompt) {
          this.startingChestPrompt = this.createPromptText(this.startChestX, this.startChestY + 20, "[E] OPEN CHEST");
        }
        this.startingChestPrompt.setVisible(true);
      } else {
        if (this.startingChestPrompt) this.startingChestPrompt.setVisible(false);
      }
    } else {
      if (this.startingChestPrompt) this.startingChestPrompt.setVisible(false);
    }

    // Door prompt (only after chest is opened)
    if (this.startingChestOpened && !this.startingDoorOpened) {
      const doorDist = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, this.startDoorX, this.startDoorY
      );
      if (doorDist < this.startInteractDist) {
        if (!this.startingDoorPrompt) {
          this.startingDoorPrompt = this.createPromptText(this.startDoorX, this.startDoorY + 20, "[E] EXIT");
        }
        this.startingDoorPrompt.setVisible(true);
      } else {
        if (this.startingDoorPrompt) this.startingDoorPrompt.setVisible(false);
      }
    } else {
      if (this.startingDoorPrompt) this.startingDoorPrompt.setVisible(false);
    }
  }

  private tryStartingChest(): boolean {
    if (this.startingChestOpened) return false;
    const dist = Phaser.Math.Distance.Between(
      this.player.x, this.player.y, this.startChestX, this.startChestY
    );
    if (dist >= this.startInteractDist) return false;

    this.startingChestOpened = true;
    this.hasWeapon = true;

    // Give pistol
    const pistolDef = BALANCE.weapons.pistol;
    this.activeWeapon = "pistol";
    this.weaponAmmo = {
      pistol: { mag: pistolDef.magazineSize, reserve: pistolDef.magazineSize * 3 },
    };
    this.activeSlot = 1;

    // Swap chest sprite from closed (frame 0) to open (frame 1)
    if (this.startingChestSprite) {
      this.startingChestSprite.setFrame(1);
    }

    // Destroy prompt
    if (this.startingChestPrompt) {
      this.startingChestPrompt.destroy();
      this.startingChestPrompt = undefined;
    }

    this.showWeaponMessage("PISTOL ACQUIRED", "#44dd44");
    this.playSound("sfx-purchase", 0.5);
    return true;
  }

  private tryStartingDoor(): boolean {
    if (this.startingDoorOpened || !this.startingChestOpened) return false;
    const dist = Phaser.Math.Distance.Between(
      this.player.x, this.player.y, this.startDoorX, this.startDoorY
    );
    if (dist >= this.startInteractDist) return false;

    this.startingDoorOpened = true;

    // Remove the door collision body so player can walk through
    if (this.startingDoorBody) {
      this.obstacles.remove(this.startingDoorBody);
      this.startingDoorBody.destroy();
      this.startingDoorBody = undefined;
    }

    // Clear door tiles visually
    this.wallsBaseLayer?.removeTileAt(50, 49);
    this.wallsBaseLayer?.removeTileAt(50, 50);

    // Destroy prompt
    if (this.startingDoorPrompt) {
      this.startingDoorPrompt.destroy();
      this.startingDoorPrompt = undefined;
    }

    // Start wave 1
    this.waveManager.skipPreGame();

    // Monitor player position — once they exit the room (north of row 49), seal it
    const checkExit = this.time.addEvent({
      delay: 100,
      loop: true,
      callback: () => {
        // Player has walked north past the door (row 49 = y 1568)
        if (this.player.y < 49 * 32) {
          checkExit.destroy();
          // Re-add collision to seal the room
          const sealZone = this.add.zone(this.startDoorX, this.startDoorY, 32, 64).setOrigin(0.5);
          this.physics.add.existing(sealZone, true);
          this.obstacles.add(sealZone);
          // Restore door tiles visually
          this.wallsBaseLayer?.putTileAt(2888, 50, 49);
          this.wallsBaseLayer?.putTileAt(2896, 50, 50);
        }
      },
    });

    return true;
  }

  // ─── Interactive prompt styling ───

  private createPromptText(x: number, y: number, label: string, canAfford = true): Phaser.GameObjects.Text {
    const txt = this.add.text(x, y, label, {
      fontFamily: "ChakraPetch, sans-serif",
      fontStyle: "bold",
      fontSize: "5px",
      stroke: "#000000",
      strokeThickness: 1,
      align: "center",
      resolution: 4,
      shadow: { offsetX: 0, offsetY: 0, color: "#00ccff", blur: 3, fill: true, stroke: false },
    }).setOrigin(0.5).setDepth(100);
    this.applyPromptGradient(txt, canAfford);
    return txt;
  }

  private applyPromptGradient(txt: Phaser.GameObjects.Text, canAfford: boolean) {
    const g = txt.context.createLinearGradient(0, 0, txt.width, 0);
    if (canAfford) {
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.4, "#66eeff");
      g.addColorStop(0.6, "#66eeff");
      g.addColorStop(1, "#ffffff");
    } else {
      g.addColorStop(0, "#ff4444");
      g.addColorStop(0.5, "#cc0000");
      g.addColorStop(1, "#ff4444");
    }
    txt.setFill(g);
  }

  // ─── Doors (purchasable barriers) ───

  private getDoorLayer(name: string): Phaser.Tilemaps.TilemapLayer | undefined {
    switch (name) {
      case "walls_base": return this.wallsBaseLayer;
      case "walls_top": return this.wallsTopLayer;
      case "props_low": return this.propsLowLayer;
      case "props_mid": return this.propsMidLayer;
      default: return undefined;
    }
  }

  private readonly doorPromptDist = 60; // px from door center to show prompt

  private updateDoorPrompts() {
    const closeDist = 100; // px — close door when player is this far away
    for (const door of this.doors) {
      // Broken doors stay permanently open
      if (door.broken) {
        if (door.promptText) { door.promptText.setVisible(false); }
        continue;
      }

      const dist = Phaser.Math.Distance.Between(
        this.player.x, this.player.y,
        door.zone.x, door.zone.y
      );

      // If door is open and player walked away, close it (skip if paid — paid doors stay open)
      if (door.opened && !door.paid && dist > closeDist) {
        door.opened = false;
        // Restore door tiles to their original layers
        for (const t of door.savedTiles) {
          this.getDoorLayer(t.layer)?.putTileAt(t.gid, t.col, t.row);
        }
        // Re-enable collision
        (door.zone.body as Phaser.Physics.Arcade.StaticBody).enable = true;
        continue;
      }

      if (door.opened) {
        if (door.promptText) { door.promptText.setVisible(false); }
        continue;
      }

      if (dist < this.doorPromptDist) {
        if (door.locked) {
          // Local dev: "Name — Locked". Public demo: plain "LOCKED" (no price / no [E] — those are for unlocked doors only).
          const label = isPublicBuild() ? "LOCKED" : `${door.label} — Locked`;
          if (!door.promptText) {
            door.promptText = this.createPromptText(door.zone.x, door.zone.y + 20, label, false);
          } else {
            door.promptText.setText(label);
            this.applyPromptGradient(door.promptText, false);
          }
          door.promptText.setVisible(true);
        } else {
          const effectiveCost = door.paid ? 0 : door.cost;
          const canAfford = this.currency >= effectiveCost;
          const costText = effectiveCost > 0 ? ` - $${effectiveCost}` : "";
          const label = `[E] ${door.label}${costText}`;
          if (!door.promptText) {
            door.promptText = this.createPromptText(door.zone.x, door.zone.y + 20, label, canAfford);
          } else {
            door.promptText.setText(label);
            this.applyPromptGradient(door.promptText, canAfford);
          }
          door.promptText.setVisible(true);
        }
      } else {
        if (door.promptText) { door.promptText.setVisible(false); }
      }
    }
  }

  private tryBuyNearbyDoor() {
    for (const door of this.doors) {
      if (door.opened || door.locked || door.broken) continue;
      const dist = Phaser.Math.Distance.Between(
        this.player.x, this.player.y,
        door.zone.x, door.zone.y
      );
      if (dist < this.doorPromptDist) {
        const effectiveCost = door.paid ? 0 : door.cost;
        if (this.currency < effectiveCost) {
          // Can't afford — flash the prompt red
          if (door.promptText) {
            this.applyPromptGradient(door.promptText, false);
            this.time.delayedCall(300, () => {
              if (door.promptText) this.applyPromptGradient(door.promptText, false);
            });
          }
          return;
        }
        // Purchase — remove collision, clear door tiles, hide prompt
        if (!door.paid) {
          this.currency -= door.cost;
          door.paid = true;
        }
        door.opened = true;
        // Disable collision (don't destroy — we'll re-enable when door closes)
        (door.zone.body as Phaser.Physics.Arcade.StaticBody).enable = false;
        if (door.promptText) {
          door.promptText.setVisible(false);
        }
        // Remove door tiles from whichever layers they're on
        for (const t of door.savedTiles) {
          this.getDoorLayer(t.layer)?.removeTileAt(t.col, t.row);
        }
        this.showWeaponMessage(`${door.label} OPENED`, "#44dd44");
        this.playSound("sfx-purchase", 0.5);
        return;
      }
    }
  }

  // ─── Zombie door-breaking ───

  private doorBashCooldowns = new Map<Phaser.GameObjects.Zone, number>(); // zone → last bash time

  private handleEnemyObstacleCollision(enemy: any, obstacle: any) {
    // Check if the obstacle is a door zone that can be bashed
    const door = this.doors.find(d => d.zone === obstacle);
    if (!door || door.locked || door.broken || door.opened || door.maxHealth <= 0) return;

    // Throttle bashing — one hit per enemy per 1.5s
    const now = this.time.now;
    const key = obstacle as Phaser.GameObjects.Zone;
    const lastBash = this.doorBashCooldowns.get(key) ?? 0;
    if (now - lastBash < 1500) return;
    this.doorBashCooldowns.set(key, now);

    // Deal damage based on enemy type
    const enemyObj = enemy as any;
    const bashDamage = enemyObj.enemyType === "boss" ? 25 : enemyObj.enemyType === "fast" ? 5 : 10;
    door.health -= bashDamage;

    // Visual feedback — flash the prompt with damage
    if (door.health > 0) {
      const pct = Math.round((door.health / door.maxHealth) * 100);
      const label = `${door.label} — ${pct}%`;
      if (!door.promptText) {
        door.promptText = this.createPromptText(door.zone.x, door.zone.y + 20, label, false);
      } else {
        door.promptText.setText(label);
        this.applyPromptGradient(door.promptText, false);
      }
      door.promptText.setVisible(true);
      // Hide after 2s if player is far away
      this.time.delayedCall(2000, () => {
        if (door.promptText && !door.opened && !door.broken) {
          const dist = Phaser.Math.Distance.Between(
            this.player.x, this.player.y,
            door.zone.x, door.zone.y
          );
          if (dist > this.doorPromptDist) door.promptText.setVisible(false);
        }
      });
    } else {
      this.breakDoor(door);
    }
  }

  private breakDoor(door: (typeof this.doors)[number]) {
    door.broken = true;
    door.opened = true;
    door.health = 0;

    // Remove collision permanently
    (door.zone.body as Phaser.Physics.Arcade.StaticBody).enable = false;

    // Remove door tiles
    for (const t of door.savedTiles) {
      this.getDoorLayer(t.layer)?.removeTileAt(t.col, t.row);
    }

    // Hide any prompt
    if (door.promptText) {
      door.promptText.destroy();
      door.promptText = undefined;
    }

    this.showWeaponMessage(`${door.label} DESTROYED`, "#ff4444");
    this.playSound("sfx-purchase", 0.3);
  }

  // ─── Generator + Machines (power system) ───

  private readonly machinePromptDist = 60;

  private updateMachinePrompts() {
    // Generator prompt
    if (this.generator && !this.powerOn) {
      const dist = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, this.generator.x, this.generator.y
      );
      if (dist < this.machinePromptDist) {
        if (!this.generator.promptText) {
          this.generator.promptText = this.createPromptText(
            this.generator.x, this.generator.y + 20, "[E] Turn on Generator", true
          );
        }
        this.generator.promptText.setVisible(true);
      } else {
        if (this.generator.promptText) this.generator.promptText.setVisible(false);
      }
    } else if (this.generator?.promptText) {
      this.generator.promptText.setVisible(false);
    }

    // Machine prompts
    for (const machine of this.machines) {
      const dist = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, machine.x, machine.y
      );
      if (dist < this.machinePromptDist) {
        let label: string;
        let canAfford = false;
        if (!this.powerOn) {
          label = "No power.. turn on the generator";
        } else if (machine.purchased) {
          label = `${machine.label} — Already Purchased`;
        } else {
          canAfford = this.currency >= machine.cost;
          label = `[E] ${machine.label} — $${machine.cost}`;
        }
        if (!machine.promptText) {
          machine.promptText = this.createPromptText(machine.x, machine.y + 20, label, canAfford);
        } else {
          machine.promptText.setText(label);
          this.applyPromptGradient(machine.promptText, canAfford);
        }
        machine.promptText.setVisible(true);
      } else {
        if (machine.promptText) machine.promptText.setVisible(false);
      }
    }
  }

  private tryInteractGenerator(): boolean {
    if (!this.generator || this.powerOn) return false;
    const dist = Phaser.Math.Distance.Between(
      this.player.x, this.player.y, this.generator.x, this.generator.y
    );
    if (dist >= this.machinePromptDist) return false;

    this.powerOn = true;

    // Swap generator sprite to lit version
    this.generator.sprite.setTexture("generator-on");

    // Swap all machine sprites to lit versions
    for (const machine of this.machines) {
      machine.sprite.setTexture(`machine-${machine.machineType}-on`);
    }

    // Hide generator prompt
    if (this.generator.promptText) {
      this.generator.promptText.destroy();
      this.generator.promptText = undefined;
    }

    this.showWeaponMessage("POWER ON", "#44dd44");
    this.playSound("sfx-purchase", 0.7);
    return true;
  }

  private tryBuyMachine(): boolean {
    if (!this.powerOn) return false;
    for (const machine of this.machines) {
      if (machine.purchased) continue;
      const dist = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, machine.x, machine.y
      );
      if (dist >= this.machinePromptDist) continue;

      if (this.currency < machine.cost) {
        // Can't afford — flash prompt
        if (machine.promptText) {
          this.applyPromptGradient(machine.promptText, false);
        }
        return true;
      }

      // Purchase
      this.currency -= machine.cost;
      machine.purchased = true;
      this.playSound("sfx-purchase", 0.5);

      // Apply perk
      if (machine.machineType === "zyn") {
        this.reloadSpeedMultiplier = 0.5; // 50% faster reloads
        this.showWeaponMessage("ZYN — QUICK RELOAD", "#44ddff");
      } else if (machine.machineType === "keg") {
        this.armor = 100; // 100 points of armor
        this.showWeaponMessage("KEG — LIQUID COURAGE", "#ffaa22");
      }

      return true;
    }
    return false;
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
      this.showWeaponMessage(`UNLOCKS WAVE ${unlockWave}`, "#ff4444");
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
        break;
      }
      case "medkit": {
        if (this.player.stats.health >= this.player.stats.maxHealth) return;
        this.currency -= price;
        this.player.stats.health = Math.min(
          this.player.stats.maxHealth,
          this.player.stats.health + 80
        );
        break;
      }
      case "dmgBoost": {
        if (this.damageBoostActive) return;
        this.currency -= price;
        this.damageBoostActive = true;
        this.player.stats.damage += 5;
        break;
      }
      case "shotgun":
      case "smg": {
        const weaponDef = BALANCE.weapons[itemId as keyof typeof BALANCE.weapons];
        // Already own this weapon — refill ammo
        if (this.secondaryWeapon === itemId) {
          const wAmmo = this.weaponAmmo[itemId];
          if (!wAmmo) return;
          const totalMax = weaponDef.magazineSize * weaponDef.totalClips;
          if (wAmmo.mag + wAmmo.reserve >= totalMax) return;
          this.currency -= price;
          wAmmo.reserve = totalMax - wAmmo.mag;
          break;
        }
        // Buy new secondary (replaces old secondary if any)
        this.currency -= price;
        this.secondaryWeapon = itemId;
        this.weaponAmmo[itemId] = {
          mag: weaponDef.magazineSize,
          reserve: weaponDef.magazineSize * (weaponDef.totalClips - 1),
        };
        this.activeWeapon = itemId;
        this.activeSlot = 2;
        this.reloading = false;
        if (this.reloadTimer) { this.reloadTimer.destroy(); this.reloadTimer = null; }
        this.showWeaponMessage(weaponDef.name.toUpperCase() + " ACQUIRED", "#44dd44");
        break;
      }
      case "ammo_light": {
        // Light ammo refills both pistol and SMG (if owned)
        let anyRefilled = false;
        for (const wk of ["pistol", "smg"]) {
          if (wk !== "pistol" && this.secondaryWeapon !== wk) continue;
          const wDef = BALANCE.weapons[wk as keyof typeof BALANCE.weapons];
          const wAmmo = this.weaponAmmo[wk];
          if (!wAmmo || !wDef) continue;
          const totalMax = wDef.magazineSize * wDef.totalClips;
          if (wAmmo.mag + wAmmo.reserve >= totalMax) continue;
          const addAmmo = wDef.magazineSize * 2;
          wAmmo.reserve = Math.min(wAmmo.reserve + addAmmo, totalMax - wAmmo.mag);
          anyRefilled = true;
        }
        if (!anyRefilled) return;
        this.currency -= price;
        break;
      }
      case "ammo_shotgun": {
        if (this.secondaryWeapon !== "shotgun") {
          return;
        }
        const wDef = BALANCE.weapons.shotgun;
        const wAmmo = this.weaponAmmo.shotgun;
        if (!wAmmo) return;
        const totalMax = wDef.magazineSize * wDef.totalClips;
        if (wAmmo.mag + wAmmo.reserve >= totalMax) return;
        this.currency -= price;
        const addAmmo = wDef.magazineSize * 2;
        wAmmo.reserve = Math.min(wAmmo.reserve + addAmmo, totalMax - wAmmo.mag);
        break;
      }
      case "barricade":
      case "landmine": {
        const trapType = itemId as TrapType;
        const current = this.trapInventory.get(trapType) ?? 0;
        if (current >= BALANCE.traps.maxPerType) {
          return;
        }
        this.currency -= price;
        this.trapInventory.set(trapType, current + 1);
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
      // No countdown — wave 1 starts when player exits starting room
      countdownSecs = -1;
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
      equippedWeapon: this.hasWeapon ? this.activeWeapon : null,
      ammo: this.currentAmmo?.mag ?? 0,
      maxAmmo: this.currentWeaponDef?.magazineSize ?? 0,
      reserveAmmo: this.currentAmmo?.reserve ?? 0,
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
      statsOpen: this.statsOpen,
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
    this.showWeaponMessage(buff.name.toUpperCase(), "#44dd44");

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
