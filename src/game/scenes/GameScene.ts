import Phaser from "phaser";
import { Player } from "../entities/Player";
import { Enemy, EnemyType, angleToDirection } from "../entities/Enemy";
import { Projectile, ensureBulletTexture } from "../entities/Projectile";
import { Trap, TrapType, ensureTrapTextures } from "../entities/Trap";
import { CHARACTERS, CharacterDef, BASE_STATS } from "../data/characters";
import { BALANCE } from "../data/balance";
import { WaveManager, WaveState } from "../systems/WaveManager";
import { LevelingSystem, BuffOption } from "../systems/LevelingSystem";
import { hasAnimation, getAnimKey } from "../data/animations";
import { hudState } from "../HUDState";
import { isPublicBuild, PUBLIC_BUILD_UNLOCKABLE_DOOR_LABEL } from "../publicBuild";
import { Pathfinder, pointInPolygon } from "../systems/Pathfinder";
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
  bloodSplats: { obj: Phaser.GameObjects.Sprite | Phaser.GameObjects.Graphics; spawnWave: number }[] = [];
  private currentWave = 1;

  // Combat state
  private lastDamageTime = 0;
  private currency = 0;
  private kills = 0;
  private gameOver = false;
  private paused = false;
  private scaryboiIntroActive = false;
  private scaryboiBannerReady = false;     // true only after banner is actually visible (gates Space dismiss)
  private scaryboiDismissing = false;      // prevents double-dismiss during cutscene fade
  private scaryboiLetterboxBars: Phaser.GameObjects.Rectangle[] | null = null;
  private scaryboiCutsceneBoss: Enemy | null = null;
  private scaryboiCutsceneGracePeriodMs = 2000;
  private scaryboiCutsceneIsIndoor = false;
  private scaryboiZone2Triggered = false;  // prevents re-triggering zone2 encounter
  private scaryboiSouthTriggered = false;  // prevents re-triggering south building encounter
  private scaryboiEstateTriggered = false; // prevents re-triggering estate encounter
  private pendingScaryboiSpawn: { x: number; y: number; hpPercent: number; gracePeriodMs: number; enc: string } | null = null;
  private masonRavePhase: "" | "rave_setup" | "cutscene_1" | "zombie_fight" | "dramatic_pause" | "cutscene_2" | "boss_fight" = "";
  private masonTriggered = false;
  private masonEnemy: Enemy | null = null;
  private masonRaveZombies: Enemy[] = [];
  private masonLetterboxBars: Phaser.GameObjects.Rectangle[] | null = null;
  private masonBannerReady = false;
  private masonDismissing = false;
  private damageBoostActive = false;
  private baseDamage = 0;

  // Wave system
  private waveManager!: WaveManager;

  // RPG Leveling
  private levelingSystem!: LevelingSystem;
  private levelUpActive = false;
  private pendingLevelUps: { level: number; options: BuffOption[] }[] = [];

  // Weapon state — multi-gun inventory: pistol always slot 0, acquired guns added in order
  private activeWeapon: string = "pistol"; // currently selected gun to fire
  private weapons: string[] = ["pistol"]; // ordered weapon list, pistol always first
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

  // Hotbar: weapons first (1..N), then barricade, then mine
  private activeSlot = 0;
  private readonly slotCount = 9; // max slots (guns + traps)

  // Grenade system
  private grenadeCount = 0;
  private grenadeKeyDown = false;
  private grenadeKeyDownTime = 0;
  private grenadeAiming = false;
  private grenadeAimLine!: Phaser.GameObjects.Graphics;
  private grenadeAimReticle!: Phaser.GameObjects.Image;
  private grenadeThrowing = false; // true during throw animation lock

  // Ability state (Q)
  private abilityCooldownTimer = 0; // ms remaining
  private abilityActive = false;
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
  private propsIndoorLayer?: Phaser.Tilemaps.TilemapLayer;
  private floorInteriorLayer?: Phaser.Tilemaps.TilemapLayer;

  // Outdoor-only layers — hidden when player enters a building
  private groundLayer?: Phaser.Tilemaps.TilemapLayer;
  private groundDetailLayer?: Phaser.Tilemaps.TilemapLayer;
  private pathsLayer?: Phaser.Tilemaps.TilemapLayer;
  private foliagePaintedLayer?: Phaser.Tilemaps.TilemapLayer;
  private overhangsLayer?: Phaser.Tilemaps.TilemapLayer;
  private vfxMarksLayer?: Phaser.Tilemaps.TilemapLayer;
  private insideWallsLayer?: Phaser.Tilemaps.TilemapLayer;

  // Interior visibility — toggle outdoor layers when inside a building
  private playerInsideBuilding = true; // player spawns inside the house

  // Spawn reachability — flood fill from player to find tiles zombies can spawn on
  private reachableTiles: Set<number> = new Set();
  private reachableDirty = true; // recompute on next spawn check

  // Starting room — chest + door before wave 1
  private startingChestOpened = false;
  private startingDoorOpened = false;
  private startingChestPrompt?: Phaser.GameObjects.Text;
  private startingDoorPrompt?: Phaser.GameObjects.Text;
  private startingDoorBody?: Phaser.GameObjects.Zone; // physics body blocking doorway
  private startingChestSprite?: Phaser.GameObjects.Sprite;
  private hasWeapon = false; // false until player opens chest

  // Loot chests (placed via Tiled interactables layer, type "chest")
  private lootChests: {
    x: number;
    y: number;
    label: string;
    opened: boolean;
    sprite: Phaser.GameObjects.Sprite;
    promptText?: Phaser.GameObjects.Text;
  }[] = [];

  private roofLayer?: Phaser.Tilemaps.TilemapLayer;
  private roofVisible = true;

  // Signpost interaction
  private signActive = false;
  private signOverlay?: Phaser.GameObjects.Container;
  private signPrompt?: Phaser.GameObjects.Text;
  private readonly signTileX = 50;
  private readonly signTileY = 44; // top tile of the 2-tile sign (44-45)
  private readonly signInteractDist = 60;

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
    this.weapons = ["pistol"];
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
    this.grenadeCount = 0; // set properly after player creation
    this.grenadeKeyDown = false;
    this.grenadeAiming = false;
    this.grenadeThrowing = false;

    // SCARYBOI encounter state
    this.scaryboiIntroActive = false;
    this.scaryboiBannerReady = false;
    this.scaryboiDismissing = false;
    this.scaryboiLetterboxBars = null;
    this.scaryboiCutsceneBoss = null;
    this.scaryboiCutsceneGracePeriodMs = 2000;
    this.scaryboiCutsceneIsIndoor = false;
    this.scaryboiZone2Triggered = false;
    this.scaryboiSouthTriggered = false;
    this.scaryboiEstateTriggered = false;
    this.pendingScaryboiSpawn = null;

    // Mason encounter state
    this.masonRavePhase = "";
    this.masonTriggered = false;
    this.masonEnemy = null;
    this.masonRaveZombies = [];
    this.masonLetterboxBars = null;
    this.masonBannerReady = false;
    this.masonDismissing = false;

    // Misc state
    this.damageBoostActive = false;
    this.baseDamage = 0;
    this.levelUpActive = false;
    this.signActive = false;
    this.signOverlay = undefined;
    this.signPrompt = undefined;
    this.lastFireTime = 0;
    this.dryFired = false;
    this.shopSelectedIndex = 0;
    this.shopNavCol = 0;
    this.shopNavRow = 0;
    this.barricadeVertical = false;
    this.lootChests = [];

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
      map.addTilesetImage("rickarena-props", "ts-rickarena-props")!,
    ];
    // Main camera background matches grass so tile seams don't show black gaps
    this.cameras.main.setBackgroundColor(0x5a7a2a);
    this.groundLayer = map.createLayer("ground", allTilesets, 0, 0)?.setDepth(-2) ?? undefined;
    this.groundDetailLayer = map.createLayer("ground_detail", allTilesets, 0, 0)?.setDepth(-1.5) ?? undefined;
    this.pathsLayer = map.createLayer("paths", allTilesets, 0, 0)?.setDepth(-1) ?? undefined;
    this.floorInteriorLayer = map.createLayer("floor_interior", allTilesets, 0, 0)?.setDepth(-0.5) ?? undefined;
    this.wallsBaseLayer = map.createLayer("walls_base", allTilesets, 0, 0)?.setDepth(0) ?? undefined;
    this.insideWallsLayer = map.createLayer("inside walls", allTilesets, 0, 0)?.setDepth(0.5) ?? undefined;
    this.wallsTopLayer = map.createLayer("walls_top", allTilesets, 0, 0)?.setDepth(1) ?? undefined;
    this.propsLowLayer = map.createLayer("props_low", allTilesets, 0, 0)?.setDepth(2) ?? undefined;
    this.propsIndoorLayer = map.createLayer("props_indoor", allTilesets, 0, 0)?.setDepth(2) ?? undefined;

    // Spawn DJ gear as sprites — the tileset image is missing these tiles
    // PA speakers (32x64) at tile (42,5) and (53,5) mirrored
    const paPositions = [
      { col: 42, row: 5, flipX: false },
      { col: 53, row: 5, flipX: true },
    ];
    for (const pa of paPositions) {
      const topLeftX = pa.col * 32;
      const topLeftY = (pa.row + 1) * 32 - 64;
      const sprite = this.add.image(topLeftX + 16, topLeftY + 32, "prop-pa-speaker");
      sprite.setScale(1.2);
      sprite.setDepth(2);
      if (pa.flipX) sprite.setFlipX(true);
      this.propsIndoorLayer?.removeTileAt(pa.col, pa.row);
    }
    // DJ table (64x32 native) scaled to span 3 tiles (47,6)-(49,6)
    {
      const centerX = 48 * 32 + 16; // center of tile 48
      const centerY = 6 * 32 + 16;
      const sprite = this.add.image(centerX, centerY, "prop-dj-table");
      sprite.setScale(1.5); // 64→96px wide (3 tiles), 32→48px tall (proportional)
      sprite.setDepth(6); // above Mason (depth 5) so he appears behind the booth
      this.propsIndoorLayer?.removeTileAt(47, 6);
      this.propsIndoorLayer?.removeTileAt(48, 6);
      this.propsIndoorLayer?.removeTileAt(49, 6);
    }
    this.propsMidLayer = map.createLayer("props_mid", allTilesets, 0, 0)?.setDepth(3) ?? undefined;
    this.foliagePaintedLayer = map.createLayer("foliage_painted", allTilesets, 0, 0)?.setDepth(25) ?? undefined;
    this.roofLayer = map.createLayer("roof", allTilesets, 0, 0)?.setDepth(26) ?? undefined;
    this.overhangsLayer = map.createLayer("overhangs", allTilesets, 0, 0)?.setDepth(25) ?? undefined;
    this.vfxMarksLayer = map.createLayer("vfx_marks", allTilesets, 0, 0)?.setDepth(5) ?? undefined;
    this.cameras.main.setRoundPixels(true);

    // Expose map dimensions for enemy AI bounds clamping
    (this as any).mapWidth = map.widthInPixels;
    (this as any).mapHeight = map.heightInPixels;

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

    // Signpost collision — 2-tile tall sign at (50, 44-45)
    {
      const signX = this.signTileX * 32 + 16;
      const signY = (this.signTileY + 0.5) * 32 + 16; // center of the 2-tile span
      const signZone = this.add.zone(signX, signY, 32, 64).setOrigin(0.5);
      this.physics.add.existing(signZone, true);
      this.obstacles.add(signZone);
    }

    // Fence border + tree walls removed — perimeter handled by Tiled map tiles

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

    // All doors: unlock and set uniform price from balance
    for (const door of this.doors) {
      door.locked = false;
      door.cost = BALANCE.economy.doorCost;
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
        } else if (objType === "chest") {
          const label = props?.find((p: any) => p.name === "label")?.value ?? "Chest";
          // Remove the Tiled visual tile so we don't get a double sprite
          const chestTileX = Math.floor(obj.x! / 32);
          const chestTileY = Math.floor(obj.y! / 32);
          for (const layer of [this.propsLowLayer, this.propsMidLayer, this.propsIndoorLayer]) {
            layer?.removeTileAt(chestTileX, chestTileY);
          }
          const sprite = this.add.sprite(cx, cy, "chest", 0).setScale(0.5).setDepth(2);
          this.lootChests.push({ x: cx, y: cy, label, opened: false, sprite });
        } else if (objType === "machine") {
          const name = ((obj as any).name || "").toLowerCase();
          const machineType = name.includes("zyn") ? "zyn" : "keg";
          const label = props?.find((p: any) => p.name === "label")?.value ?? "Machine";
          const cost = BALANCE.economy.machineCost; // uniform price from balance
          const textureKey = `machine-${machineType}-off`;
          // Remove the Tiled visual tile so we don't get a double sprite (tiles are 64px tall = 2 rows)
          const machineTileX = Math.floor(obj.x! / 32);
          const machineTileY = Math.floor(obj.y! / 32);
          for (const layer of [this.propsLowLayer, this.propsMidLayer, this.propsIndoorLayer]) {
            layer?.removeTileAt(machineTileX, machineTileY);
            layer?.removeTileAt(machineTileX, machineTileY + 1);
          }
          const sprite = this.add.sprite(cx, cy, textureKey).setDepth(3);
          this.machines.push({ machineType, label, cost, x: cx, y: cy, sprite, purchased: false });
        }
      }
    }

    // All purchasable doors are available (Gate, South Building, Estate Entrance)

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
    this.cameras.main.setZoom(4.0);
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
    // Cap velocity so collision separation can never launch the player beyond sprint speed
    (this.player.body as Phaser.Physics.Arcade.Body).setMaxVelocity(260, 260);

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
      (_player, enemyObj) => (enemyObj as Enemy).visible,
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
    // Runtime RPG rocket texture
    if (!this.textures.exists("rpg-projectile")) {
      const gfx = this.add.graphics();
      gfx.fillStyle(0x886644, 1);
      gfx.fillRect(0, 0, 12, 5);
      gfx.fillStyle(0xff4422, 1);
      gfx.fillRect(0, 1, 3, 3); // exhaust glow
      gfx.fillStyle(0xcccccc, 1);
      gfx.fillRect(9, 1, 3, 3); // warhead tip
      gfx.generateTexture("rpg-projectile", 12, 5);
      gfx.destroy();
    }
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
      const p = proj as Projectile;
      if (p.weaponType === "rpg") {
        this.rpgExplode(p.x, p.y);
      }
      p.destroy();
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

    // Grenade aiming line (Graphics) + reticle sprite
    this.grenadeAimLine = this.add.graphics();
    this.grenadeAimLine.setDepth(8);
    this.grenadeAimReticle = this.add.image(0, 0, "grenade-aim-reticle");
    this.grenadeAimReticle.setDepth(8);
    this.grenadeAimReticle.setVisible(false);
    this.grenadeAimReticle.setAlpha(0.8);
    this.grenadeAimReticle.setScale(0.5);
    this.grenadeCount = BALANCE.grenade.startCount;
    this.player.grenadeCount = this.grenadeCount;

    // --- Hotbar input: Q/E cycle, 1-4 direct select, SPACE/F use active slot ---
    if (this.input.keyboard) {
      // SPACE: use active slot OR ready-up during intermission
      const space = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.SPACE
      );
      space.on("down", () => {
        if (this.gameOver || this.paused) return;
        if (this.signActive) {
          this.dismissSign();
          return;
        }
        if (this.masonCutsceneActive && this.masonBannerReady) {
          this.dismissMasonDialogue();
          return;
        }
        if (this.masonCutsceneActive) return;
        if (this.scaryboiIntroActive && this.scaryboiBannerReady) {
          // React component handles quote advancement via its own Space listener
          return;
        }
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
        if (this.player.isSprinting) return;
        this.fireHeld = true;
        if (!this.gameOver && !this.paused && !this.shopOpen) this.useActiveSlot();
      });
      fKey.on("up", () => { this.fireHeld = false; this.dryFired = false; this.player.stopHoldShoot(); });

      // Q: ability
      const qKey = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.Q
      );
      qKey.on("down", () => {
        if (!this.gameOver && !this.paused && !this.shopOpen) this.useAbility();
      });

      // 1-9: direct slot select
      const slotKeys = [
        Phaser.Input.Keyboard.KeyCodes.ONE,
        Phaser.Input.Keyboard.KeyCodes.TWO,
        Phaser.Input.Keyboard.KeyCodes.THREE,
        Phaser.Input.Keyboard.KeyCodes.FOUR,
        Phaser.Input.Keyboard.KeyCodes.FIVE,
        Phaser.Input.Keyboard.KeyCodes.SIX,
        Phaser.Input.Keyboard.KeyCodes.SEVEN,
        Phaser.Input.Keyboard.KeyCodes.EIGHT,
        Phaser.Input.Keyboard.KeyCodes.NINE,
      ];
      slotKeys.forEach((code, idx) => {
        const key = this.input.keyboard!.addKey(code);
        key.on("down", () => {
          if (this.gameOver || this.paused || this.shopOpen) return;
          this.selectSlot(idx + 1); // slots are 1-indexed
        });
      });

      // R: reload
      const rKey = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.R
      );
      rKey.on("down", () => {
        if (!this.gameOver && !this.paused && !this.shopOpen) this.startReload();
      });

      // G: grenade (hold for aim, release to throw)
      const gKey = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.G
      );
      gKey.on("down", () => {
        if (this.gameOver || this.paused || this.shopOpen || this.grenadeThrowing) return;
        if (this.grenadeCount <= 0) return;
        this.grenadeKeyDown = true;
        this.grenadeKeyDownTime = this.time.now;
        this.grenadeAiming = false;
      });
      gKey.on("up", () => {
        if (!this.grenadeKeyDown) return;
        this.grenadeKeyDown = false;
        this.grenadeAiming = false;
        this.hideGrenadeAim();
        if (this.grenadeCount > 0 && !this.grenadeThrowing) {
          this.throwGrenade();
        }
      });
    }
    // Left click = melee punch, Right click = use active item slot
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.gameOver || this.paused || this.shopOpen) return;
      if (pointer.button === 2) {
        if (this.player.isSprinting) return;
        this.fireHeld = true;
        this.useActiveSlot();
      } else if (pointer.button === 0) {
        this.meleeAttack();
      }
    });
    this.input.mouse?.disableContextMenu();

    // Reset stuck input state when browser steals focus (e.g. alt-tab)
    window.addEventListener("blur", () => {
      this.fireHeld = false;
      this.dryFired = false;
      this.player?.stopHoldShoot();
      this.grenadeKeyDown = false;
      this.grenadeAiming = false;
      this.hideGrenadeAim?.();
    });

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
        if (this.gameOver || this.paused || this.scaryboiIntroActive || this.masonCutsceneActive || this.signActive) return;
        if (this.shopOpen) {
          this.closeShop();
        } else if (this.devMode || this.waveManager.state === "intermission" || this.waveManager.state === "pre_game") {
          this.openShop();
        }
      });

      // E key: interact if near something, otherwise cycle hotbar forward
      const eKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
      eKey.on("down", () => {
        if (this.gameOver || this.paused || this.shopOpen) return;
        if (this.signActive) return;
        if (this.trySignInteract()) return;
        if (this.tryStartingChest()) return;
        if (this.tryLootChest()) return;
        if (this.tryStartingDoor()) return;
        if (this.tryInteractGenerator()) return;
        if (this.tryBuyMachine()) return;
        if (this.tryBuyNearbyDoor()) return;
        this.cycleSlot(1);
      });

      // SPACE to skip/ready up during intermission (overrides melee during intermission)
      // (melee SPACE handler above already checks shopOpen but not intermission —
      //  we handle priority in the melee handler by also checking wave state)

      // V key to toggle barricade orientation
      const vKey = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.V
      );
      vKey.on("down", () => {
        if (this.gameOver || this.paused || this.scaryboiIntroActive || this.masonCutsceneActive || this.signActive) return;
        if (this.activeSlot !== this.barricadeSlot) return; // only when barricade is selected
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
          this.rebuildShopGrid();
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
    this.minimap.ignore(this.grenadeAimLine);
    this.minimap.ignore(this.grenadeAimReticle);

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

    // Check if a world position overlaps any collision object (bushes, trees, buildings)
    const isCollisionFree = (wx: number, wy: number): boolean => {
      for (const r of collisionRects) {
        if (wx >= r.x && wx <= r.x + r.w && wy >= r.y && wy <= r.y + r.h) return false;
      }
      for (const p of collisionPolygons) {
        if (pointInPolygon(wx, wy, p.points)) return false;
      }
      return true;
    };

    this.waveManager = new WaveManager({
      scene: this,
      enemies: this.enemies,
      playerCount: 1,
      getPlayerPos: () => ({ x: this.player.x, y: this.player.y }),
      isFieldTile,
      isCollisionFree,
      isSpawnReachable: (wx: number, wy: number) => this.isSpawnReachable(wx, wy),
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
      this.currentWave = wave;
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
            targets: b.obj,
            alpha: 0,
            duration: 1000,
            onComplete: () => b.obj.destroy(),
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
      // Wave completion bonus — flat: $50 waves 1-5, $100 waves 6+
      const wcb = BALANCE.economy.waveCompletionBonus;
      const waveBonus = this.waveManager.wave >= wcb.lateWave ? wcb.lateBonus : wcb.earlyBonus;
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

    this.waveManager.onEncounterTrigger = (enc) => {
      this.spawnScaryboiEncounter(enc);
    };

    this.waveManager.onBossKilled = () => {
      // Drop RPG at boss death location
      const boss = this.waveManager.bossEnemy;
      if (boss) {
        this.spawnRpgPickup(boss.x, boss.y);
      }
      // Re-open estate door
      const estateDoor = this.doors.find(d => d.label === "Estate Entrance");
      if (estateDoor && !estateDoor.opened) {
        (estateDoor.zone.body as Phaser.Physics.Arcade.StaticBody).enable = false;
        if (estateDoor.promptText) estateDoor.promptText.setVisible(false);
        for (const t of estateDoor.savedTiles) {
          this.getDoorLayer(t.layer)?.removeTileAt(t.col, t.row);
        }
        estateDoor.opened = true;
        this.reachableDirty = true;
      }
      this.showWeaponMessage("SCARYBOI DEFEATED!", "#44dd44");
    };

    hudState.registerScaryboiIntroAction(() => {
      // "Bring it" button clicked in React banner — same as pressing Space
      this.dismissScaryboiIntro();
    });

    // Mason dialogue callback — player dismissed the dialogue card (SPACE or click)
    hudState.registerMasonDialogueAction(() => {
      this.dismissMasonDialogue();
    });


    // Player spawns inside — hide outdoor layers immediately (no fade)
    this.setOutdoorLayersVisible(false);
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

    if (this.gameOver || this.paused || this.scaryboiIntroActive || this.masonCutsceneActive || this.signActive) return;

    // Freeze gameplay while shop, level-up, or dev panel is open
    const devPanelOpen = this.devMode && hudState.getField("devPanelOpen");
    const menuOpen = this.shopOpen || this.levelUpActive || devPanelOpen;
    if (menuOpen) {
      if (!this.physics.world.isPaused) {
        this.physics.world.pause();
      }
      return;
    } else if (this.physics.world.isPaused) {
      this.physics.world.resume();
    }
    this.player.update();
    this.waveManager.update(delta);
    this.pathfinder.calculate();

    // Door proximity prompts
    this.updateStartingRoomPrompts();
    this.updateLootChestPrompts();
    this.updateSignPrompt();
    this.updateDoorPrompts();
    this.updateMachinePrompts();

    // Mason estate trigger — player reaches top of stairs
    if (!this.masonTriggered) {
      const ptx = Math.floor(this.player.x / 32);
      const pty = Math.floor(this.player.y / 32);
      if (
        (ptx === 39 && pty === 18) ||
        (ptx === 39 && pty === 19) ||
        (ptx === 39 && pty === 11) ||
        (ptx === 39 && pty === 12)
      ) {
        this.triggerMasonRave();
      }
    }

    // Mason rave phase checks — cutscene1 triggers when first rave zombie is killed
    if (this.masonRavePhase === "rave_setup") {
      const anyKilled = this.masonRaveZombies.some(z => !z.active || z.dying);
      if (anyKilled) this.triggerMasonCutscene1();
    }
    if (this.masonRavePhase === "zombie_fight") {
      const allDead = this.masonRaveZombies.every(z => !z.active || z.dying);
      if (allDead) this.triggerDramaticPause();
    }
    if (this.masonRavePhase === "dramatic_pause" && this.player.y <= 400) {
      this.triggerMasonCutscene2();
    }

    // SCARYBOI location-based encounter triggers
    if (!this.waveManager.isScaryboiDefeated() && !this.waveManager.isBossActive()) {
      const ptx = Math.floor(this.player.x / 32);
      const pty = Math.floor(this.player.y / 32);
      // Zone2 (Gate): tile strip just past the gate — player faces SCARYBOI head-on
      const gateDoor = this.doors.find(d => d.label === "Gate");
      if (!this.scaryboiZone2Triggered && (gateDoor?.opened || gateDoor?.broken) && pty === 37 && ptx >= 18 && ptx <= 22) {
        this.waveManager.triggerEncounter("zone2");
      }
      // South Building: player walks inside — only if door opened/purchased
      const southDoor = this.doors.find(d => d.label === "South Building");
      if (!this.scaryboiSouthTriggered && (!southDoor || southDoor.opened || southDoor.broken) && ptx >= 2 && ptx <= 16 && pty >= 37 && pty <= 46) {
        this.waveManager.triggerEncounter("southBuilding");
      }
      // Estate final stand: only triggers once both other encounters are done
      if (!this.scaryboiEstateTriggered && !this.waveManager.isEstateLocked() && ptx >= 30 && ptx <= 45 && pty >= 18 && pty <= 24) {
        this.waveManager.triggerEncounter("estate");
      }
    }

    // Roof fade — hide roof when player is under it
    this.updateRoofVisibility();
    this.updateInteriorDarkness();
    this.updateEnemyIndoorVisibility();
    this.updateCanopyFade();

    // Barricade placement ghost
    const showGhost = this.activeSlot === this.barricadeSlot
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

    // Grenade aiming line (while G held)
    if (this.grenadeKeyDown && !this.grenadeThrowing) {
      const holdTime = this.time.now - this.grenadeKeyDownTime;
      if (holdTime >= BALANCE.grenade.aimThresholdMs) {
        if (!this.grenadeAiming) {
          // First frame of aiming — freeze player on "hand raised" frame
          this.grenadeAiming = true;
          this.showGrenadeAimPose();
        }
        this.drawGrenadeAimLine();
      }
    } else {
      this.hideGrenadeAim();
    }

    // Footsteps while player is moving
    const vel = this.player.body?.velocity;
    if (vel && (Math.abs(vel.x) > 10 || Math.abs(vel.y) > 10)) {
      this.playFootstep();
    }

    // Ambient zombie groans
    this.tryPlayZombieGroan();

    // Hold-to-fire: only for auto weapons (SMG) when weapon slot is active.
    if (this.fireHeld && !this.shopOpen && !this.grenadeAiming && !this.grenadeThrowing && !this.player.isSprinting && this.isWeaponSlot(this.activeSlot)) {
      const wDef = BALANCE.weapons[this.activeWeapon as keyof typeof BALANCE.weapons];
      if (wDef?.auto) this.fireWeapon();
    }

    // Ability cooldown
    if (this.abilityCooldownTimer > 0) {
      this.abilityCooldownTimer -= delta;
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

  // ------- Grenades -------

  /** Convert 8-direction string to angle in radians */
  private directionToAngle(dir: string): number {
    switch (dir) {
      case "north": return -Math.PI / 2;
      case "north-east": return -Math.PI / 4;
      case "east": return 0;
      case "south-east": return Math.PI / 4;
      case "south": return Math.PI / 2;
      case "south-west": return 3 * Math.PI / 4;
      case "west": return Math.PI;
      case "north-west": return -3 * Math.PI / 4;
      default: return Math.PI / 2; // default south
    }
  }

  /** Get hand offset from player center based on facing direction */
  private getHandOffset(dir: string): { x: number; y: number } {
    switch (dir) {
      case "north":      return { x: 6, y: -12 };
      case "north-east":  return { x: 10, y: -10 };
      case "east":        return { x: 12, y: -4 };
      case "south-east":  return { x: 10, y: 2 };
      case "south":       return { x: -6, y: 4 };
      case "south-west":  return { x: -10, y: 2 };
      case "west":        return { x: -12, y: -4 };
      case "north-west":  return { x: -10, y: -10 };
      default:            return { x: 0, y: 0 };
    }
  }

  /** Freeze player on the "hand raised" throw frame while aiming */
  private showGrenadeAimPose() {
    const throwAnimType = hasAnimation(this.characterDef.id, "throw-grenade") ? "throw-grenade" : "cross-punch";
    const throwKey = getAnimKey(this.characterDef.id, throwAnimType, this.player.currentDir);
    if (this.anims.exists(throwKey)) {
      this.player.play(throwKey);
      // Freeze on frame 1 (hand raised with grenade)
      this.player.anims.pause(this.player.anims.currentAnim!.frames[1]);
    }
  }

  /** Draw thin pulsing red laser arc from hand to landing point */
  private drawGrenadeAimLine() {
    this.grenadeAimLine.clear();
    const dir = this.player.currentDir;
    const angle = this.directionToAngle(dir);
    const hand = this.getHandOffset(dir);
    const maxRange = BALANCE.grenade.maxRange;

    const startX = this.player.x + hand.x;
    const startY = this.player.y + hand.y;
    const targetX = this.player.x + Math.cos(angle) * maxRange;
    const targetY = this.player.y + Math.sin(angle) * maxRange;
    const peakHeight = BALANCE.grenade.arcPeakPx;

    const segments = 32;

    // Pulsing alpha based on time
    const pulse = 0.4 + 0.3 * Math.sin(this.time.now * 0.008);

    // Outer glow pass
    this.grenadeAimLine.lineStyle(2, 0xff2222, pulse * 0.3);
    this.grenadeAimLine.beginPath();
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const x = startX + (targetX - startX) * t;
      const y = startY + (targetY - startY) * t;
      const arcOffset = -peakHeight * 4 * t * (1 - t);
      if (i === 0) this.grenadeAimLine.moveTo(x, y + arcOffset);
      else this.grenadeAimLine.lineTo(x, y + arcOffset);
    }
    this.grenadeAimLine.strokePath();

    // Core thin laser
    this.grenadeAimLine.lineStyle(0.5, 0xff4444, pulse);
    this.grenadeAimLine.beginPath();
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const x = startX + (targetX - startX) * t;
      const y = startY + (targetY - startY) * t;
      const arcOffset = -peakHeight * 4 * t * (1 - t);
      if (i === 0) this.grenadeAimLine.moveTo(x, y + arcOffset);
      else this.grenadeAimLine.lineTo(x, y + arcOffset);
    }
    this.grenadeAimLine.strokePath();

    // Place reticle at landing point
    this.grenadeAimReticle.setPosition(targetX, targetY);
    this.grenadeAimReticle.setVisible(true);
    this.grenadeAimReticle.setAlpha(pulse);
  }

  /** Hide grenade aim visuals */
  private hideGrenadeAim() {
    this.grenadeAimLine.clear();
    this.grenadeAimReticle.setVisible(false);
  }

  /** Throw a grenade in the player's facing direction */
  private throwGrenade() {
    if (this.grenadeCount <= 0 || this.grenadeThrowing) return;

    this.grenadeCount--;
    this.player.grenadeCount = this.grenadeCount;
    this.grenadeThrowing = true;

    // Get target position from player facing direction
    const angle = this.directionToAngle(this.player.currentDir);
    const maxRange = BALANCE.grenade.maxRange;
    const targetX = this.player.x + Math.cos(angle) * maxRange;
    const targetY = this.player.y + Math.sin(angle) * maxRange;

    const startX = this.player.x;
    const startY = this.player.y;

    // Play throw animation (locks shooting for ~400ms but player can move)
    this.player.playThrowGrenade(() => {
      this.grenadeThrowing = false;
    });

    // Create grenade projectile sprite (tiny — player is 0.25 scale)
    const grenadeTexture = this.textures.exists("fx-grenade-spin-1") ? "fx-grenade-spin-1" : "item-grenade";
    const grenade = this.add.sprite(startX, startY, grenadeTexture);
    grenade.setDepth(7);
    grenade.setScale(0.18);

    // Clear aim line immediately on throw
    this.hideGrenadeAim();

    // Animate grenade flight
    const flightMs = BALANCE.grenade.flightMs;
    const peakHeight = BALANCE.grenade.arcPeakPx;
    let elapsed = 0;
    let spinFrame = 1;
    const spinInterval = 80; // ms between spin frames
    let lastSpinTime = 0;

    const flightUpdate = this.time.addEvent({
      delay: 16,
      repeat: Math.ceil(flightMs / 16),
      callback: () => {
        elapsed += 16;
        const t = Math.min(elapsed / flightMs, 1);

        // Position along straight line
        const x = startX + (targetX - startX) * t;
        const y = startY + (targetY - startY) * t;

        // Parabolic arc offset (peaks at midpoint)
        const arcOffset = -peakHeight * 4 * t * (1 - t);
        grenade.setPosition(x, y + arcOffset);

        // Subtle scale for depth (0.18 → 0.22 → 0.18)
        const scaleT = 0.18 + 0.04 * Math.sin(t * Math.PI);
        grenade.setScale(scaleT);

        // Spin animation
        lastSpinTime += 16;
        if (lastSpinTime >= spinInterval) {
          lastSpinTime = 0;
          spinFrame = (spinFrame % 4) + 1;
          const spinKey = `fx-grenade-spin-${spinFrame}`;
          if (this.textures.exists(spinKey)) {
            grenade.setTexture(spinKey);
          }
        }

        // Flight complete
        if (t >= 1) {
          flightUpdate.destroy();
          grenade.setPosition(targetX, targetY);
          grenade.setScale(0.18);

          // Fuse delay then detonate
          this.time.delayedCall(BALANCE.grenade.fuseMs, () => {
            this.detonateGrenade(targetX, targetY);
            grenade.destroy();
          });
        }
      },
    });
  }

  /** Grenade explosion — AoE damage, knockback, VFX */
  private detonateGrenade(x: number, y: number) {
    const { damage, radius, knockback } = BALANCE.grenade;

    // Damage all enemies in radius
    this.enemies.getChildren().forEach((obj) => {
      const enemy = obj as Enemy;
      if (!enemy.active || enemy.dying) return;
      const dist = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);
      if (dist <= radius) {
        const dmgMult = 1 - (dist / radius) * 0.5; // damage falloff
        const finalDmg = Math.floor(damage * dmgMult);
        enemy.takeDamage(finalDmg);

        // Knockback from blast center
        const kbAngle = Phaser.Math.Angle.Between(x, y, enemy.x, enemy.y);
        const resist = enemy.enemyType === "boss"
          ? (BALANCE.enemies.boss.knockbackResist ?? 0.8)
          : enemy.enemyType === "mason"
          ? (BALANCE.enemies.mason.knockbackResist ?? 0.98)
          : 1;
        const kbForce = knockback * resist;
        enemy.body?.setVelocity(
          Math.cos(kbAngle) * kbForce,
          Math.sin(kbAngle) * kbForce
        );

        // Track kills from grenades
        if (enemy.dying) {
          this.onEnemyKilled(enemy, "trap");
        }
      }
    });

    // Explosion VFX — play grenade-explosion frames
    const explosionSprite = this.add.sprite(x, y, "fx-grenade-explosion-1");
    explosionSprite.setDepth(8);
    explosionSprite.setScale(1.5); // explosion sprite is ~64px, scale to ~96px — fits 100px radius
    explosionSprite.setAlpha(0.85);

    let expFrame = 1;
    const expTimer = this.time.addEvent({
      delay: 60,
      repeat: 4,
      callback: () => {
        expFrame++;
        const expKey = `fx-grenade-explosion-${expFrame}`;
        if (this.textures.exists(expKey)) {
          explosionSprite.setTexture(expKey);
        }
        if (expFrame >= 5) {
          expTimer.destroy();
          this.tweens.add({
            targets: explosionSprite,
            alpha: 0,
            duration: 200,
            onComplete: () => explosionSprite.destroy(),
          });
        }
      },
    });

    // Camera shake + orange flash
    this.cameras.main.shake(100, 0.005);
    this.cameras.main.flash(80, 255, 150, 0, false);

    // Sound
    this.playSound("sfx-explosion", 0.5);
  }

  // ------- Hotbar -------

  /** Slot layout: weapons[0]=slot1, weapons[1]=slot2, ..., then barricade, then mine */
  private get barricadeSlot(): number { return this.weapons.length + 1; }
  private get mineSlot(): number { return this.weapons.length + 2; }

  /** Get list of slot indices that currently have items */
  private getAvailableSlots(): number[] {
    // Weapon slots: 1..weapons.length
    const available: number[] = this.weapons.map((_, i) => i + 1);
    if ((this.trapInventory.get("barricade" as TrapType) ?? 0) > 0) available.push(this.barricadeSlot);
    if ((this.trapInventory.get("landmine" as TrapType) ?? 0) > 0) available.push(this.mineSlot);
    return available;
  }

  /** Check if a slot index is a weapon slot */
  private isWeaponSlot(slot: number): boolean {
    return slot >= 1 && slot <= this.weapons.length;
  }

  /** Get weapon name for a slot index */
  private getWeaponForSlot(slot: number): string | null {
    if (slot >= 1 && slot <= this.weapons.length) return this.weapons[slot - 1];
    return null;
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

    // Cancel reload when switching to a different weapon
    if (this.isWeaponSlot(index) && index !== this.activeSlot && this.reloading) {
      this.reloading = false;
      if (this.reloadTimer) { this.reloadTimer.destroy(); this.reloadTimer = null; }
      this.player.stopReload();
    }

    this.activeSlot = index;

    // Set active weapon when selecting a gun slot
    const weapon = this.getWeaponForSlot(index);
    if (weapon) {
      this.activeWeapon = weapon;
    }
    // Set trap index when selecting a trap slot
    if (index === this.barricadeSlot) this.selectedTrapIndex = 0;
    if (index === this.mineSlot) this.selectedTrapIndex = 1;

    // Show weapon/item name
    let name = "WEAPON";
    if (weapon) {
      const wDef = BALANCE.weapons[weapon as keyof typeof BALANCE.weapons];
      name = wDef?.name?.toUpperCase() ?? weapon.toUpperCase();
    } else if (index === this.barricadeSlot) {
      name = "BARRICADE";
    } else if (index === this.mineSlot) {
      name = "MINE";
    }
    this.showWeaponMessage(name, "#44dd44");
  }

  private useActiveSlot() {
    if (this.isWeaponSlot(this.activeSlot)) {
      this.fireWeapon();
    } else if (this.activeSlot === this.barricadeSlot) {
      this.selectedTrapIndex = 0;
      this.placeTrap();
    } else if (this.activeSlot === this.mineSlot) {
      this.selectedTrapIndex = 1;
      this.placeTrap();
    }
  }

  /** Add a weapon to the inventory (no duplicates) */
  private addWeapon(weaponId: string, ammo: { mag: number; reserve: number }) {
    if (!this.weapons.includes(weaponId)) {
      this.weapons.push(weaponId);
    }
    this.weaponAmmo[weaponId] = ammo;
  }

  /** Remove a depleted weapon from inventory */
  private removeWeapon(weaponId: string) {
    delete this.weaponAmmo[weaponId];
    const idx = this.weapons.indexOf(weaponId);
    if (idx > 0) this.weapons.splice(idx, 1); // never remove pistol (idx 0)
    this.activeWeapon = "pistol";
    this.activeSlot = 1;
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
      const baseDmg = this.player.stats.damage;
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
        } else {
          // Hit splat on melee: 30% for zombies, 20% for dogs, skip bosses
          const isBoss = enemy.enemyType === "boss" || enemy.enemyType === "mason";
          const hitChance = enemy.enemyType === "fast" ? 0.2 : 0.3;
          if (!isBoss && Math.random() < hitChance) {
            this.spawnBloodSplat(enemy.x, enemy.y, "hit", enemy.enemyType);
          }
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
    // Kill reward — flat bonuses: melee +$5, scavenger adds flat $
    const effective = this.levelingSystem.getEffectiveStats(this.characterDef.stats);
    const baseReward = BALANCE.economy.killReward[enemy.enemyType];
    const meleeFlat = source === "melee" ? BALANCE.economy.meleeBonus : 0;
    const scavengerFlat = Math.floor(effective.killBonusFlat);
    this.currency += baseReward + meleeFlat + scavengerFlat;
    this.waveManager.onEnemyKilled();
    this.playRandomEnemyDeath();

    // Mason death — re-open estate entrance
    if (enemy.enemyType === "mason") {
      const estateDoor = this.doors.find(d => d.label === "Estate Entrance");
      if (estateDoor && !estateDoor.opened) {
        (estateDoor.zone.body as Phaser.Physics.Arcade.StaticBody).enable = false;
        if (estateDoor.promptText) estateDoor.promptText.setVisible(false);
        for (const t of estateDoor.savedTiles) {
          this.getDoorLayer(t.layer)?.removeTileAt(t.col, t.row);
        }
        estateDoor.opened = true;
        this.reachableDirty = true;
      }
      this.showWeaponMessage("BIGBOSSBABY DEFEATED!", "#44dd44");
    }

    // Blood splat on melee/ability/trap kills (ranged kills handled in handleProjectileHit)
    if (source === "melee" || source === "trap") {
      this.spawnBloodSplat(enemy.x, enemy.y, "kill", enemy.enemyType);
    }

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
      case "dan": this.abilityElectricFist(); break;
      case "pj": this.abilityBladeDash(); break;
      case "jason": this.abilitySledgehammerSlam(); break;
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
    const range = 100;
    const arc = Phaser.Math.DegToRad(60); // tight cone — boss killer, not crowd clearer
    const damage = 400;
    const knockback = 200;
    const maxHits = 2; // focused single-target kick, hits 1-2 enemies max
    let hits = 0;

    // Screen shake for impact feel
    this.cameras.main.shake(120, 0.004);

    // Sort by distance so we hit the closest enemies first
    const candidates = (this.enemies.getChildren() as Enemy[])
      .filter(e => e.active && !e.dying)
      .map(e => ({ enemy: e, dist: Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y) }))
      .filter(c => c.dist <= range)
      .sort((a, b) => a.dist - b.dist);

    for (const { enemy } of candidates) {
      if (hits >= maxHits) break;

      const enemyAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y, enemy.x, enemy.y);
      let diff = enemyAngle - angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > arc / 2) continue;

      const killed = enemy.takeDamage(damage);
      if (killed) {
        this.onEnemyKilled(enemy, "melee");
      } else {
        enemy.body.setVelocity(
          Math.cos(enemyAngle) * knockback,
          Math.sin(enemyAngle) * knockback
        );
        enemy.applyKnockbackStun(600);
        this.spawnBloodSplat(enemy.x, enemy.y, "hit", enemy.enemyType);
      }
      hits++;
    }

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

    // Spawn red sparks at foot contact point
    const footX = this.player.x + Math.cos(angle) * 24;
    const footY = this.player.y + Math.sin(angle) * 24;
    this.spawnContactSparks(footX, footY, "-red");

    this.playSound("sfx-punch1", 0.4);
    this.playSound("sfx-hit-classic", 0.35);
    if (hits > 0) this.playSound("sfx-whoosh", 0.3);
  }

  /** Spawn colored lightning sparks at a contact point. Color: "" (blue), "-red", "-green", "-orange" */
  private spawnContactSparks(x: number, y: number, color: string, spread = 28, count?: number) {
    const sparkCount = count ?? (4 + Math.floor(Math.random() * 3)); // 4-6 sparks
    const prefix = `fx-lightning-bolt${color}`;

    for (let i = 0; i < sparkCount; i++) {
      const ox = (Math.random() - 0.5) * spread;
      const oy = (Math.random() - 0.5) * spread;
      const sparkX = x + ox;
      const sparkY = y + oy;

      this.time.delayedCall(i * 35, () => {
        if (!this.textures.exists(`${prefix}-1`)) return;

        const spark = this.add.sprite(sparkX, sparkY, `${prefix}-1`);
        spark.setDepth(this.player.depth + 1);
        spark.setRotation(Math.random() * Math.PI * 2);
        spark.setScale(0.04 + Math.random() * 0.04, 0.08 + Math.random() * 0.05);
        spark.setAlpha(0.8 + Math.random() * 0.2);

        let frame = 0;
        const flickerTimer = this.time.addEvent({
          delay: 45,
          repeat: 3,
          callback: () => {
            if (!spark.active) return;
            frame = (frame + 1) % 5;
            spark.setTexture(`${prefix}-${frame + 1}`);
            spark.setAlpha(0.5 + Math.random() * 0.5);
          },
        });

        this.time.delayedCall(180 + Math.random() * 120, () => {
          flickerTimer.destroy();
          if (spark.active) {
            this.tweens.add({
              targets: spark,
              alpha: 0,
              duration: 70,
              onComplete: () => spark.destroy(),
            });
          }
        });
      });
    }
  }

  /** Dan — Electric Fist: electrified punch that chains lightning to nearby enemies */
  private abilityElectricFist() {
    // Play electric fist animation
    const efAnimType = hasAnimation(this.characterDef.id, "electric-fist") ? "electric-fist" : "cross-punch";
    const punchKey = getAnimKey(this.characterDef.id, efAnimType, this.player["currentDir"]);
    if (this.anims.exists(punchKey)) {
      this.player.play(punchKey);
      this.player.once("animationcomplete", () => {
        const idleKey = getAnimKey(this.characterDef.id, "breathing-idle", this.player["currentDir"]);
        if (this.anims.exists(idleKey)) this.player.play(idleKey, true);
      });
    }

    const angle = this.getFacingAngle();
    const punchRange = 60;
    const punchArc = Phaser.Math.DegToRad(90);
    const damage = 150;
    const knockback = 50;
    const stunDuration = 2000;
    const chainRadius = 80; // ~2.5 tiles — tight chain range
    const maxChainTargets = 12;

    this.cameras.main.shake(100, 0.004);

    // Find the primary target (closest enemy in punch cone)
    let primaryTarget: Enemy | null = null;
    let primaryDist = Infinity;

    this.enemies.getChildren().forEach((obj) => {
      const enemy = obj as Enemy;
      if (!enemy.active) return;

      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
      if (dist > punchRange) return;

      const enemyAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y, enemy.x, enemy.y);
      let diff = enemyAngle - angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > punchArc / 2) return;

      if (dist < primaryDist) {
        primaryDist = dist;
        primaryTarget = enemy;
      }
    });

    // Spawn errant electric sparks around fist regardless of hit
    this.spawnFistSparks(angle);

    if (!primaryTarget) {
      this.playSound("sfx-whoosh", 0.3);
      return;
    }

    const electrocuteDelay = 400; // stun animation before death

    // Hit primary target immediately — knockback + electrocute
    const pa = Phaser.Math.Angle.Between(this.player.x, this.player.y, (primaryTarget as Enemy).x, (primaryTarget as Enemy).y);
    (primaryTarget as Enemy).body.setVelocity(Math.cos(pa) * knockback, Math.sin(pa) * knockback);
    (primaryTarget as Enemy).applyElectricDamage(damage, electrocuteDelay, () => {
      this.onEnemyKilled(primaryTarget!, "melee");
    });

    // Spawn orb flash on primary target
    this.spawnLightningOrb(primaryTarget as Enemy);

    // Build chain target list (don't apply damage yet — bolt must reach them first)
    const chainedEnemies: Enemy[] = [primaryTarget];
    let chainSource = primaryTarget as Enemy;

    const chainTargets: Enemy[] = [];
    for (let c = 0; c < maxChainTargets; c++) {
      let closest: Enemy | null = null;
      let closestDist = Infinity;

      this.enemies.getChildren().forEach((obj) => {
        const enemy = obj as Enemy;
        if (!enemy.active || chainedEnemies.includes(enemy)) return;

        const dist = Phaser.Math.Distance.Between(chainSource.x, chainSource.y, enemy.x, enemy.y);
        if (dist <= chainRadius && dist < closestDist) {
          closestDist = dist;
          closest = enemy;
        }
      });

      if (!closest) break;

      chainTargets.push(closest);
      chainedEnemies.push(closest);
      chainSource = closest;
    }

    // Sequential chain: bolt travels from target to target, applying damage on arrival
    this.chainLightningSequential(primaryTarget as Enemy, chainTargets, damage, electrocuteDelay);

    this.playSound("sfx-punch1", 0.4);
    this.playSound("sfx-hit-classic", 0.35);
  }

  // ------- Blood Splatter VFX -------

  /**
   * Spawn a blood splat VFX at the given position.
   * - "hit": momentary spray (variants 2/4), plays 3 frames then disappears
   * - "kill": ground pool (variants 1/3), plays 3 frames then persists as a stain
   */
  private spawnBloodSplat(x: number, y: number, type: "hit" | "kill", enemyType: EnemyType) {
    // Check if blood textures are loaded
    if (!this.textures.exists("fx-blood-1-1")) return;

    // Dogs: smaller splats, lower chance on hits
    // Bosses: only bleed on ability kills (handled by caller)
    const isDog = enemyType === "fast";

    if (type === "hit") {
      // Momentary spray — pick variant 2 (spray burst) or 4 (blood mist)
      const variant = isDog ? 4 : (Math.random() < 0.5 ? 2 : 4);
      const splat = this.add.sprite(x, y - 4, `fx-blood-${variant}-1`);
      splat.setDepth(1);
      splat.setScale(isDog ? 0.3 : 0.45);
      splat.setAlpha(0.85);
      // Slight random rotation for variety
      splat.setRotation(Math.random() * Math.PI * 2);

      let frame = 0;
      const animTimer = this.time.addEvent({
        delay: 80,
        repeat: 2,
        callback: () => {
          frame++;
          if (!splat.active) return;
          splat.setTexture(`fx-blood-${variant}-${Math.min(frame + 1, 3)}`);
          splat.setAlpha(0.85 - frame * 0.2);
        },
      });
      this.time.delayedCall(350, () => {
        animTimer.destroy();
        if (splat.active) {
          this.tweens.add({ targets: splat, alpha: 0, duration: 150, onComplete: () => splat.destroy() });
        }
      });
    } else {
      // Kill splat — ground pool that persists
      const variant = isDog ? 1 : (Math.random() < 0.5 ? 1 : 3);
      const splat = this.add.sprite(x, y, `fx-blood-${variant}-1`);
      splat.setDepth(1);
      splat.setScale(isDog ? 0.2 : (variant === 3 ? 0.35 : 0.3));
      splat.setAlpha(0.9);
      splat.setRotation(Math.random() * Math.PI * 2);

      let frame = 0;
      const animTimer = this.time.addEvent({
        delay: 100,
        repeat: 2,
        callback: () => {
          frame++;
          if (!splat.active) return;
          splat.setTexture(`fx-blood-${variant}-${Math.min(frame + 1, 3)}`);
        },
      });
      // After animation, fade to stain opacity and persist
      this.time.delayedCall(400, () => {
        animTimer.destroy();
        if (splat.active) {
          this.tweens.add({
            targets: splat,
            alpha: 0.45,
            duration: 8000,
          });
        }
      });
      // Track for wave-based cleanup
      this.bloodSplats.push({ obj: splat, spawnWave: this.currentWave });
    }
  }

  /** Flash an orb at an enemy's position for ~400ms then fade out */
  private spawnLightningOrb(enemy: Enemy) {
    const orb = this.add.sprite(enemy.x, enemy.y - 4, "fx-lightning-orb-1");
    orb.setDepth(enemy.depth + 1);
    orb.setScale(0.5);
    orb.setAlpha(0.9);

    let frame = 0;
    const flickerTimer = this.time.addEvent({
      delay: 80,
      repeat: 4, // 5 ticks = 400ms
      callback: () => {
        if (!orb.active) return;
        frame = (frame + 1) % 4;
        orb.setTexture(`fx-lightning-orb-${frame + 1}`);
        if (enemy.active) orb.setPosition(enemy.x, enemy.y - 4);
        orb.setAlpha(0.7 + Math.random() * 0.3);
        orb.setScale(0.4 + Math.random() * 0.2);
      },
    });

    // Fade out and destroy
    this.time.delayedCall(400, () => {
      flickerTimer.destroy();
      if (orb.active) {
        this.tweens.add({
          targets: orb,
          alpha: 0,
          duration: 150,
          onComplete: () => orb.destroy(),
        });
      }
    });
  }

  /** Sequential chain lightning: bolt travels from source to each target in order */
  private chainLightningSequential(
    source: Enemy,
    targets: Enemy[],
    damage: number,
    electrocuteDelay: number,
  ) {
    if (targets.length === 0) return;

    const boltTravelMs = 120; // how fast the bolt travels between each pair
    let currentSource = source;

    targets.forEach((target, index) => {
      const delay = index * boltTravelMs;

      this.time.delayedCall(delay, () => {
        if (!target.active) return;

        // Spawn bolt from currentSource to target
        const src = index === 0 ? source : targets[index - 1];
        this.spawnLightningBolt(src, target, boltTravelMs);

        // Apply damage + stun when bolt arrives
        target.applyElectricDamage(damage, electrocuteDelay, () => {
          this.onEnemyKilled(target, "melee");
        });

        // Flash orb at contact point
        this.spawnLightningOrb(target);
      });
    });
  }

  /** Spawn a bolt between two enemies that appears briefly then fades */
  private spawnLightningBolt(src: Enemy, tgt: Enemy, durationMs: number) {
    const mx = (src.x + tgt.x) / 2;
    const my = (src.y + tgt.y) / 2;
    const dist = Phaser.Math.Distance.Between(src.x, src.y, tgt.x, tgt.y);
    const ang = Phaser.Math.Angle.Between(src.x, src.y, tgt.x, tgt.y);

    const bolt = this.add.sprite(mx, my, "fx-lightning-bolt-1");
    bolt.setDepth(src.depth + 1);
    bolt.setRotation(ang);
    // Scale bolt to span distance; Y scale keeps it thin
    bolt.setScale(dist / 128, 0.35);
    bolt.setAlpha(0.9);

    // Flicker through frames while visible
    let frame = 0;
    const flickerTimer = this.time.addEvent({
      delay: 60,
      repeat: 5,
      callback: () => {
        if (!bolt.active) return;
        frame = (frame + 1) % 5;
        bolt.setTexture(`fx-lightning-bolt-${frame + 1}`);
        bolt.setAlpha(0.6 + Math.random() * 0.4);
      },
    });

    // Fade out quickly — lightning is fast
    this.time.delayedCall(durationMs + 200, () => {
      flickerTimer.destroy();
      if (bolt.active) {
        this.tweens.add({
          targets: bolt,
          alpha: 0,
          duration: 100,
          onComplete: () => bolt.destroy(),
        });
      }
    });
  }

  /** Spawn small errant lightning bolts around the player's fist */
  private spawnFistSparks(facingAngle: number) {
    const sparkCount = 3 + Math.floor(Math.random() * 3); // 3-5 sparks
    const fistOffset = 20; // distance from player center to fist
    const fistX = this.player.x + Math.cos(facingAngle) * fistOffset;
    const fistY = this.player.y + Math.sin(facingAngle) * fistOffset;

    for (let i = 0; i < sparkCount; i++) {
      // Random offset around fist position
      const ox = (Math.random() - 0.5) * 24;
      const oy = (Math.random() - 0.5) * 24;
      const sparkX = fistX + ox;
      const sparkY = fistY + oy;

      // Stagger spawn slightly for natural feel
      this.time.delayedCall(i * 40, () => {
        if (!this.textures.exists("fx-lightning-bolt-1")) return;

        const spark = this.add.sprite(sparkX, sparkY, "fx-lightning-bolt-1");
        spark.setDepth(this.player.depth + 1);
        spark.setRotation(Math.random() * Math.PI * 2);
        spark.setScale(0.04 + Math.random() * 0.04, 0.08 + Math.random() * 0.05);
        spark.setAlpha(0.7 + Math.random() * 0.3);

        // Flicker through bolt frames
        let frame = 0;
        const flickerTimer = this.time.addEvent({
          delay: 50,
          repeat: 3,
          callback: () => {
            if (!spark.active) return;
            frame = (frame + 1) % 5;
            spark.setTexture(`fx-lightning-bolt-${frame + 1}`);
            spark.setAlpha(0.5 + Math.random() * 0.5);
          },
        });

        // Quick fade out
        this.time.delayedCall(200 + Math.random() * 150, () => {
          flickerTimer.destroy();
          if (spark.active) {
            this.tweens.add({
              targets: spark,
              alpha: 0,
              duration: 80,
              onComplete: () => spark.destroy(),
            });
          }
        });
      });
    }
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
    const range = 120;
    const arc = Phaser.Math.DegToRad(140); // wide slash arc — cleave identity
    const damage = 200;
    const knockback = 100;
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

      const killed = enemy.takeDamage(damage, "katana");
      if (killed) {
        this.onEnemyKilled(enemy, "melee");
      } else {
        enemy.body.setVelocity(
          Math.cos(enemyAngle) * knockback,
          Math.sin(enemyAngle) * knockback
        );
        enemy.applyKnockbackStun(300);
        // Ability always spawns blood spray (even on bosses)
        this.spawnBloodSplat(enemy.x, enemy.y, "hit", enemy.enemyType);
      }
      // Green sparks at katana contact point on each enemy hit
      this.spawnContactSparks(enemy.x, enemy.y, "-green", 20);
      hits++;
    });

    // Green sparks at blade tip even on whiff
    if (hits === 0) {
      const bladeX = this.player.x + Math.cos(angle) * 30;
      const bladeY = this.player.y + Math.sin(angle) * 30;
      this.spawnContactSparks(bladeX, bladeY, "-green", 16, 3);
    }

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
  /** Jason — Sledgehammer Slam: 360° ground pound that hits everything around you */
  private abilitySledgehammerSlam() {
    // Invincible + no knockback during slam
    this.abilityActive = true;

    // Play sledgehammer slam animation
    const shAnimType = hasAnimation(this.characterDef.id, "swinging-sledgehammer") ? "swinging-sledgehammer" : "cross-punch";
    const slamKey = getAnimKey(this.characterDef.id, shAnimType, this.player["currentDir"]);
    if (this.anims.exists(slamKey)) {
      this.player.play(slamKey);
      this.player.once("animationcomplete", () => {
        this.abilityActive = false;
        const idleKey = getAnimKey(this.characterDef.id, "breathing-idle", this.player["currentDir"]);
        if (this.anims.exists(idleKey)) this.player.play(idleKey, true);
      });
    } else {
      // No animation — clear flag after expected duration
      this.time.delayedCall(650, () => { this.abilityActive = false; });
    }

    const radius = 100; // full 360° circle
    const damage = 200;
    const knockback = 150;
    const stunDuration = 500;

    // Delay damage to sync with hammer impact frame (~300ms into 9-frame anim at 14fps)
    this.time.delayedCall(300, () => {
      let hits = 0;

      // Strong screen shake — ground slam on impact
      this.cameras.main.shake(180, 0.008);

      this.enemies.getChildren().forEach((obj) => {
        const enemy = obj as Enemy;
        if (!enemy.active) return;

        const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
        if (dist > radius) return;

        const enemyAngle = Phaser.Math.Angle.Between(this.player.x, this.player.y, enemy.x, enemy.y);
        const killed = enemy.takeDamage(damage);
        if (killed) {
          this.onEnemyKilled(enemy, "melee");
        } else {
          enemy.body.setVelocity(
            Math.cos(enemyAngle) * knockback,
            Math.sin(enemyAngle) * knockback
          );
          enemy.applyKnockbackStun(stunDuration);
          // Ability always spawns blood spray (even on bosses)
          this.spawnBloodSplat(enemy.x, enemy.y, "hit", enemy.enemyType);
        }
        hits++;
      });

      // Orange sparks radiating from ground impact point
      this.spawnContactSparks(this.player.x, this.player.y, "-orange", 36, 6);

      // Shockwave VFX at impact
      this.spawnSledgehammerVFX();

      this.playSound("sfx-explosion", 0.4);
      if (hits > 0) this.playSound("sfx-hit-classic", 0.35);
    });
  }

  /** Spawn dust burst VFX for sledgehammer slam */
  private spawnSledgehammerVFX() {
    const px = this.player.x;
    const py = this.player.y;

    const hasEmberSprites = this.textures.exists("fx-slam-ember-1");

    // Dust burst at hammer impact point (small, centered)
    const hasDustSprites = this.textures.exists("fx-dust-burst-1");
    if (hasDustSprites) {
      const dust = this.add.sprite(px, py, "fx-dust-burst-1");
      dust.setDepth(3);
      dust.setScale(0.4);
      dust.setAlpha(0.8);
      let dustFrame = 0;
      const dustTimer = this.time.addEvent({
        delay: 80, repeat: 3,
        callback: () => {
          dustFrame++;
          if (!dust.active) return;
          dust.setTexture(`fx-dust-burst-${Math.min(dustFrame + 1, 4)}`);
          dust.setScale(0.4 + dustFrame * 0.2);
          dust.setAlpha(0.8 - dustFrame * 0.15);
        },
      });
      this.time.delayedCall(400, () => {
        dustTimer.destroy();
        if (dust.active) {
          this.tweens.add({ targets: dust, alpha: 0, duration: 200, onComplete: () => dust.destroy() });
        }
      });
    }

    // Ember ring AOE — expands outward showing damage radius
    if (hasEmberSprites) {
      const ember = this.add.sprite(px, py, "fx-slam-ember-1");
      ember.setDepth(2);
      ember.setScale(0.3);
      ember.setAlpha(0.5);
      ember.setBlendMode(Phaser.BlendModes.ADD);

      let emberFrame = 0;
      const emberTimer = this.time.addEvent({
        delay: 80,
        repeat: 3,
        callback: () => {
          emberFrame++;
          if (!ember.active) return;
          ember.setTexture(`fx-slam-ember-${Math.min(emberFrame + 1, 4)}`);
          ember.setScale(0.3 + emberFrame * 0.25);
          ember.setAlpha(0.5 - emberFrame * 0.1);
        },
      });

      this.time.delayedCall(400, () => {
        emberTimer.destroy();
        if (ember.active) {
          this.tweens.add({
            targets: ember,
            alpha: 0,
            duration: 200,
            onComplete: () => ember.destroy(),
          });
        }
      });
    }
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
      } else if (!this.dryFired) {
        this.dryFired = true;
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
    const bonusDmg = 0; // placeholder for future damage buff systems

    // Point-blank hit check
    const pbRange = 30;
    this.enemies.getChildren().forEach((obj) => {
      const enemy = obj as Enemy;
      if (!enemy.active) return;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
      if (dist > pbRange) return;
      for (let p = 0; p < weaponDef.pellets; p++) {
        let damage = Math.floor((weaponDef.damage + bonusDmg) * dmgMult);
        if ("closeRangeBonus" in weaponDef) {
          damage = Math.floor(damage * (weaponDef as any).closeRangeBonus);
        }
        if (this.rollCrit(this.activeWeapon, 0)) {
          damage = Math.floor(damage * BALANCE.crit.damageMultiplier);
          this.showCritEffect(enemy.x, enemy.y, "ranged");
        }
        const killed = enemy.takeDamage(damage, "ranged");
        if (killed) {
          this.onEnemyKilled(enemy);
          this.spawnBloodSplat(enemy.x, enemy.y, "kill", enemy.enemyType);
          break;
        }
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
        Math.floor((weaponDef.damage + bonusDmg) * dmgMult),
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
    } else if (this.activeWeapon === "rpg") {
      this.playSound("sfx-shotgun", 0.5); // placeholder — reuse shotgun boom
    } else if (this.activeWeapon === "assault_rifle") {
      this.playSound("sfx-smg", 0.35); // placeholder — reuse smg sound
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
        // Consumable weapons (RPG only) disappear when all ammo is spent
        const isConsumable = this.activeWeapon === "rpg";
        if (isConsumable) {
          const depletedWeapon = this.activeWeapon;
          this.time.delayedCall(300, () => {
            this.showWeaponMessage(`${this.currentWeaponDef?.name?.toUpperCase() ?? "WEAPON"} DEPLETED`, "#ff4444");
            this.removeWeapon(depletedWeapon);
          });
        } else if (!this.dryFired) {
          this.dryFired = true;
          this.time.delayedCall(250, () => {
            this.playSound("sfx-dryfire", 1.0);
            this.showWeaponMessage("NO AMMO", "#ff4444");
          });
        }
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

    const totalCrit = Math.min(charCrit + weaponCrit + distCrit + levelCrit, 0.05); // hard cap 5%
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

      // RPG: AoE explosion instead of single-target hit
      if (proj.weaponType === "rpg") {
        this.rpgExplode(proj.x, proj.y);
        proj.destroy();
        return;
      }

      const killed = enemy.takeDamage(damage, "ranged");
      if (killed) {
        this.onEnemyKilled(enemy);
        this.spawnBloodSplat(enemy.x, enemy.y, "kill", enemy.enemyType);
      } else {
        // Hit splat: 30% for zombies, 20% for dogs, skip bosses
        const isBoss = enemy.enemyType === "boss" || enemy.enemyType === "mason";
        const hitChance = enemy.enemyType === "fast" ? 0.2 : 0.3;
        if (!isBoss && Math.random() < hitChance) {
          this.spawnBloodSplat(enemy.x, enemy.y, "hit", enemy.enemyType);
        }
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
      let typeMult = 1.0;
      if (enemy.enemyType === "fast") typeMult = 1.5;
      else if (enemy.enemyType === "boss") typeMult = 0.2;
      else if (enemy.enemyType === "mason") {
        // Mason: zero knockback from pistol, slight from shotgun, none from SMG
        const wt = proj.weaponType;
        typeMult = wt === "shotgun" ? 0.08 : 0;
      }
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

      // Mason weapon-specific stagger: no stagger from pistol, stagger from SMG and shotgun
      if (enemy.enemyType === "mason" && !killed) {
        const wt = proj.weaponType;
        if (wt === "smg" || wt === "shotgun") {
          enemy.playTakingPunch();
        }
      }

      proj.destroy();
    };

  /** RPG AoE explosion — damages all enemies in radius, self-damage if player is close */
  private rpgExplode(x: number, y: number) {
    const rpgDef = BALANCE.weapons.rpg as any;
    const radius = rpgDef.aoeRadius ?? 100;
    const baseDmg = rpgDef.damage;

    // Damage all enemies in radius
    this.enemies.getChildren().forEach((obj) => {
      const e = obj as Enemy;
      if (!e.active) return;
      const dist = Phaser.Math.Distance.Between(x, y, e.x, e.y);
      if (dist > radius) return;
      const dmgMult = 1 - (dist / radius) * 0.5;
      const dmg = Math.floor(baseDmg * dmgMult);
      const killed = e.takeDamage(dmg, "ranged");
      if (killed) {
        this.onEnemyKilled(e);
        this.spawnBloodSplat(e.x, e.y, "kill", e.enemyType);
      }
      // Knockback from explosion
      const angle = Phaser.Math.Angle.Between(x, y, e.x, e.y);
      e.body?.setVelocity(Math.cos(angle) * 250, Math.sin(angle) * 250);
      e.applyKnockbackStun(400);
    });

    // Self-damage if player is within blast radius
    const playerDist = Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y);
    if (playerDist <= radius && !this.player.invincible) {
      const selfDmg = rpgDef.selfDamage ?? 20;
      this.player.stats.health = Math.max(1, this.player.stats.health - selfDmg);
      this.cameras.main.shake(200, 0.01);
    }

    // Explosion VFX
    const boom = this.add.image(x, y, "fx-explosion");
    boom.setDepth(60);
    boom.setScale(radius / 8);
    boom.setAlpha(0.9);
    this.tweens.add({
      targets: boom,
      alpha: 0,
      scaleX: boom.scaleX * 1.5,
      scaleY: boom.scaleY * 1.5,
      duration: 400,
      onComplete: () => boom.destroy(),
    });

    this.playSound("sfx-explosion", 0.6);
    this.cameras.main.flash(100, 255, 200, 50, false);
  }

  // ------- Damage / Game Over -------

  private handleEnemyContact: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback =
    (_player, enemyObj) => {
      if (this.gameOver) return;
      if (this.shopOpen || this.levelUpActive) return;
      if (this.devMode && hudState.getField("devPanelOpen")) return;
      if (this.player.invincible) return; // dev god mode
      if (this.player.isPunching) return; // i-frames during punch
      if (this.abilityActive) return; // invincible during ability (e.g. Jason slam)

      const now = this.time.now;
      if (now - this.lastDamageTime < 500) return;
      this.lastDamageTime = now;

      const enemy = enemyObj as Enemy;
      if (enemy.isStunned()) return; // stunned enemies can't attack
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
            this.cameras.main.setZoom(4.0);
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
    grenade: "/assets/sprites/items/grenade.png",
    heal: "/assets/sprites/items/bandage.png",
    dmgBoost: "/assets/sprites/items/syringe.png",
    rpg: "/assets/sprites/items/rpg.png",
    assault_rifle: "/assets/sprites/items/assault-rifle.png",
  };

  private initShop() {
    this.rebuildShopGrid();

    // Register React -> Phaser callback
    hudState.registerShopAction((action, payload) => {
      if (action === "buy" && payload !== undefined) {
        this.buyShopItem(payload);
      } else if (action === "buySelected") {
        this.buyShopItem(this.shopSelectedIndex);
      } else if (action === "buyKey" && payload !== undefined) {
        const idx = payload - 1; // 1-indexed to 0-indexed
        const flat = this.shopGrid.flat();
        if (idx >= 0 && idx < flat.length) {
          this.buyShopItem(flat[idx]);
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

  /** Rebuild shop navigation grid based on currently visible items */
  private rebuildShopGrid() {
    const items = BALANCE.shop.items;
    const columns: number[][] = [[], [], []];
    items.forEach((item, idx) => {
      // Skip dev-only and hidden items when not in dev mode
      if ((item as any).devOnly && !this.devMode) return;
      if ((item as any).hidden && !this.devMode) return;
      const id = item.id;
      if (id === "heal" || id === "medkit" || id === "dmgBoost") columns[0].push(idx);
      else if (["shotgun", "smg", "ammo_light", "ammo_shotgun", "ammo_heavy", "rpg", "assault_rifle"].includes(id)) columns[1].push(idx);
      else columns[2].push(idx);
    });
    this.shopGrid = columns;
  }

  /** Buy item using the visible shop index (maps to original BALANCE index internally) */
  private buyShopItem(visibleIndex: number) {
    const shopItems = hudState.getField("shopItems") as any[];
    if (!shopItems || visibleIndex < 0 || visibleIndex >= shopItems.length) return;
    const item = shopItems[visibleIndex];
    const originalIdx = item._originalIdx ?? visibleIndex;
    this.buyItem(originalIdx);
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
    // Filter out dev-only items when not in dev mode — they shouldn't even appear
    const visibleItems = items.filter((item) => {
      if ((item as any).devOnly && !this.devMode) return false;
      if ((item as any).hidden && !this.devMode) return false;
      return true;
    });
    const shopItems = visibleItems.map((item) => {
      const originalIdx = items.indexOf(item);
      const price = this.getItemPrice(originalIdx);
      const canAfford = this.currency >= price;
      const isEquipped = ["shotgun", "smg", "rpg", "assault_rifle"].includes(item.id) && this.weapons.includes(item.id);
      const id = item.id;
      let category: "supplies" | "weapons" | "traps" = "supplies";
      if (["shotgun", "smg", "ammo_light", "ammo_shotgun", "ammo_heavy", "rpg", "assault_rifle"].includes(id)) category = "weapons";
      else if (["barricade", "landmine", "grenade"].includes(id)) category = "traps";

      return {
        id: item.id,
        name: item.name,
        desc: item.desc,
        price,
        icon: this.shopIconMap[item.id] || "",
        locked: false,
        equipped: isEquipped,
        canAfford,
        category,
        _originalIdx: originalIdx,
      };
    });

    hudState.update({
      shopItems: shopItems as any,
      shopSelectedIndex: this.shopSelectedIndex,
    });
  }

  private getItemPrice(index: number): number {
    const item = BALANCE.shop.items[index];
    const inflation = 1 + this.waveManager.wave * BALANCE.economy.priceInflationPerWave;
    return Math.floor(item.basePrice * inflation);
  }

  // ─── Canopy fade (tree canopies go transparent near player + red glow on hidden characters) ───

  private fadedCanopyTiles: { tile: Phaser.Tilemaps.Tile }[] = [];
  private canopyGlowSprites: Set<Phaser.GameObjects.Sprite> = new Set();

  /** Check if a sprite is substantially under canopy (checks head + center + feet) */
  private isUnderCanopy(x: number, y: number): boolean {
    const check = (cx: number, cy: number) => {
      const tx = Math.floor(cx / 32);
      const ty = Math.floor(cy / 32);
      return !!(this.foliagePaintedLayer?.getTileAt(tx, ty) || this.overhangsLayer?.getTileAt(tx, ty));
    };
    // Sample 3 points vertically on the sprite — require at least 2 hits
    const hits = (check(x, y) ? 1 : 0) + (check(x, y - 12) ? 1 : 0) + (check(x, y - 24) ? 1 : 0);
    return hits >= 2;
  }

  private updateCanopyFade() {
    // Restore previously faded tiles
    for (const { tile } of this.fadedCanopyTiles) {
      tile.alpha = 1;
    }
    this.fadedCanopyTiles.length = 0;

    // Remove glow from sprites that were glowing last frame
    for (const sprite of this.canopyGlowSprites) {
      if (sprite.active && sprite.preFX) {
        sprite.preFX.clear();
      }
    }
    this.canopyGlowSprites.clear();

    if (this.playerInsideBuilding) return;

    const px = this.player.x;
    const py = this.player.y;
    const fadeRadius = 4; // tiles
    const tileX = Math.floor(px / 32);
    const tileY = Math.floor(py / 32);

    const canopyLayers = [this.foliagePaintedLayer, this.overhangsLayer];

    for (const layer of canopyLayers) {
      if (!layer) continue;
      for (let dy = -fadeRadius; dy <= fadeRadius; dy++) {
        for (let dx = -fadeRadius; dx <= fadeRadius; dx++) {
          const tx = tileX + dx;
          const ty = tileY + dy;
          const tile = layer.getTileAt(tx, ty);
          if (!tile) continue;

          const worldTileCenterX = tx * 32 + 16;
          const worldTileCenterY = ty * 32 + 16;
          const dist = Phaser.Math.Distance.Between(px, py, worldTileCenterX, worldTileCenterY) / 32;

          if (dist < fadeRadius) {
            const t = Math.max(0, (dist - 1) / (fadeRadius - 1));
            tile.alpha = 0.55 + t * 0.45; // 0.55 at center, 1.0 at edge
            this.fadedCanopyTiles.push({ tile });
          }
        }
      }
    }

    // Red glow outline on player and enemies under canopy
    const addGlow = (sprite: Phaser.GameObjects.Sprite) => {
      if (!sprite.active || !sprite.preFX) return;
      sprite.preFX.addGlow(0xff2222, 2, 0, false, 0.15, 10);
      this.canopyGlowSprites.add(sprite);
    };

    if (this.isUnderCanopy(this.player.x, this.player.y)) {
      addGlow(this.player);
    }

    this.enemies.getChildren().forEach((obj) => {
      const enemy = obj as Phaser.GameObjects.Sprite;
      if (enemy.active && this.isUnderCanopy(enemy.x, enemy.y)) {
        addGlow(enemy);
      }
    });
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

  // ─── Interior visibility (hide outdoor layers when inside a building) ───

  /** Layers that should be hidden when the player is inside a building */
  private get outdoorLayers(): (Phaser.Tilemaps.TilemapLayer | undefined)[] {
    return [this.groundLayer, this.groundDetailLayer, this.pathsLayer, this.foliagePaintedLayer, this.overhangsLayer, this.vfxMarksLayer, this.propsLowLayer, this.propsMidLayer, this.insideWallsLayer];
  }

  private updateInteriorDarkness() {
    if (!this.floorInteriorLayer || !this.roofLayer) return;

    const tileX = Math.floor(this.player.x / 32);
    const tileY = Math.floor(this.player.y / 32);
    const roofTile = this.roofLayer.getTileAt(tileX, tileY);
    const isInside = !!roofTile;

    if (isInside && !this.playerInsideBuilding) {
      this.playerInsideBuilding = true;
      this.fadeInteriorTransition(true);
    } else if (!isInside && this.playerInsideBuilding) {
      this.playerInsideBuilding = false;
      this.fadeInteriorTransition(false);
    }
  }

  /**
   * Hide enemies that aren't in the same indoor/outdoor zone as the player.
   * When player is inside (under roof tile), hide enemies that are outside (no roof tile), and vice versa.
   */
  private updateEnemyIndoorVisibility() {
    if (!this.roofLayer) return;
    const playerInside = this.playerInsideBuilding;

    this.enemies.getChildren().forEach((obj) => {
      const enemy = obj as Enemy;
      if (!enemy.active) return;

      // Bosses are always visible (SCARYBOI, Mason)
      const isBoss = enemy.enemyType === "boss" || enemy.enemyType === "mason";
      if (isBoss) return;

      const etx = Math.floor(enemy.x / 32);
      const ety = Math.floor(enemy.y / 32);
      const enemyInside = !!this.roofLayer!.getTileAt(etx, ety);

      // Show enemy only if in same zone as player
      const shouldShow = playerInside === enemyInside;
      enemy.setVisible(shouldShow);
      (enemy as any).healthBarGfx?.setVisible(shouldShow);
    });
  }

  /** Set outdoor layers visible/hidden immediately (no fade, for game start) */
  private setOutdoorLayersVisible(visible: boolean) {
    const alpha = visible ? 1 : 0;
    for (const layer of this.outdoorLayers) {
      layer?.setAlpha(alpha);
    }
    // Set camera background to black when inside so hidden ground shows black
    this.cameras.main.setBackgroundColor(visible ? 0x5a7a2a : 0x000000);
  }

  /**
   * Flood fill from the player's position on the pathfinding grid to find all
   * tiles reachable without passing through collision or closed doors.
   * Cached and recomputed when doors open/close (reachableDirty flag).
   */
  private computeReachableTiles() {
    this.reachableTiles.clear();
    if (!this.pathfinder) return;

    const { w: gridW, h: gridH } = this.pathfinder.getGridSize();
    const startCol = Math.floor(this.player.x / 32);
    const startRow = Math.floor(this.player.y / 32);
    const key = (col: number, row: number) => row * gridW + col;

    // Build set of tiles blocked by closed doors
    const doorBlocked = new Set<number>();
    for (const door of this.doors) {
      if (door.paid || door.broken) continue; // door is open
      const zone = door.zone;
      const body = zone.body as Phaser.Physics.Arcade.StaticBody;
      if (!body.enable) continue; // collision disabled = open
      const left = Math.floor((zone.x - zone.width / 2) / 32);
      const top = Math.floor((zone.y - zone.height / 2) / 32);
      const right = Math.ceil((zone.x + zone.width / 2) / 32);
      const bottom = Math.ceil((zone.y + zone.height / 2) / 32);
      for (let r = top; r < bottom; r++) {
        for (let c = left; c < right; c++) {
          doorBlocked.add(key(c, r));
        }
      }
    }
    // Also block starting door if still closed
    if (!this.startingDoorOpened && this.startingDoorBody) {
      const z = this.startingDoorBody;
      const left = Math.floor((z.x - z.width / 2) / 32);
      const top = Math.floor((z.y - z.height / 2) / 32);
      const right = Math.ceil((z.x + z.width / 2) / 32);
      const bottom = Math.ceil((z.y + z.height / 2) / 32);
      for (let r = top; r < bottom; r++) {
        for (let c = left; c < right; c++) {
          doorBlocked.add(key(c, r));
        }
      }
    }

    // BFS flood fill from player position
    const queue: number[] = []; // packed as key values
    const startKey = key(startCol, startRow);
    this.reachableTiles.add(startKey);
    queue.push(startKey);

    let head = 0;
    while (head < queue.length) {
      const k = queue[head++];
      const col = k % gridW;
      const row = (k - col) / gridW;
      for (const [dc, dr] of [[0,1],[0,-1],[1,0],[-1,0]]) {
        const nc = col + dc;
        const nr = row + dr;
        if (nc < 0 || nc >= gridW || nr < 0 || nr >= gridH) continue;
        const nk = key(nc, nr);
        if (this.reachableTiles.has(nk)) continue;
        if (!this.pathfinder!.isWalkable(nc, nr)) continue;
        if (doorBlocked.has(nk)) continue;
        this.reachableTiles.add(nk);
        queue.push(nk);
      }
    }

    this.reachableDirty = false;
  }

  /** Check if a world position is reachable from the player (for spawn validation) */
  isSpawnReachable(wx: number, wy: number): boolean {
    if (this.reachableDirty) this.computeReachableTiles();
    if (!this.pathfinder) return true;
    const col = Math.floor(wx / 32);
    const row = Math.floor(wy / 32);
    const { w: gridW } = this.pathfinder.getGridSize();
    return this.reachableTiles.has(row * gridW + col);
  }

  /** Fade to black, toggle outdoor layers, then reveal */
  private fadeInteriorTransition(enteringBuilding: boolean) {
    const fade = this.add.graphics();
    fade.setDepth(300);
    fade.fillStyle(0x000000, 1);
    fade.fillRect(0, 0, 100 * 32, 60 * 32);
    fade.setAlpha(0);

    this.tweens.add({
      targets: fade,
      alpha: 1,
      duration: 250,
      ease: "Sine.easeIn",
      onComplete: () => {
        this.setOutdoorLayersVisible(!enteringBuilding);
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

  // ─── Loot Chests (Tiled interactables) ───

  private updateLootChestPrompts() {
    for (const chest of this.lootChests) {
      if (chest.opened) {
        if (chest.promptText) chest.promptText.setVisible(false);
        continue;
      }
      const dist = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, chest.x, chest.y
      );
      if (dist < 60) {
        if (!chest.promptText) {
          chest.promptText = this.createPromptText(chest.x, chest.y + 20, "[E] OPEN CHEST");
        }
        chest.promptText.setVisible(true);
      } else {
        if (chest.promptText) chest.promptText.setVisible(false);
      }
    }
  }

  private tryLootChest(): boolean {
    for (const chest of this.lootChests) {
      if (chest.opened) continue;
      const dist = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, chest.x, chest.y
      );
      if (dist >= 60) continue;

      chest.opened = true;
      chest.sprite.setFrame(1); // open sprite

      if (chest.promptText) {
        chest.promptText.destroy();
        chest.promptText = undefined;
      }

      // Give Assault Rifle with full ammo
      const wpDef = (BALANCE.weapons as any).assault_rifle;
      this.addWeapon("assault_rifle", {
        mag: wpDef.magazineSize,
        reserve: wpDef.magazineSize * (wpDef.totalClips - 1),
      });
      this.activeWeapon = "assault_rifle";
      this.activeSlot = this.weapons.indexOf("assault_rifle") + 1;
      this.showWeaponMessage("ASSAULT RIFLE ACQUIRED!", "#ffdd44");
      this.playSound("sfx-purchase", 0.6);
      return true;
    }
    return false;
  }

  // ─── Signpost interaction ───

  private updateSignPrompt() {
    if (this.signActive) {
      if (this.signPrompt) this.signPrompt.setVisible(false);
      return;
    }
    const signWorldX = this.signTileX * 32 + 16;
    const signWorldY = this.signTileY * 32 + 32; // center of the 2-tile sign
    const dist = Phaser.Math.Distance.Between(
      this.player.x, this.player.y, signWorldX, signWorldY
    );
    if (dist < this.signInteractDist) {
      if (!this.signPrompt) {
        this.signPrompt = this.createPromptText(signWorldX, signWorldY + 30, "[E] READ SIGN");
      }
      this.signPrompt.setVisible(true);
    } else {
      if (this.signPrompt) this.signPrompt.setVisible(false);
    }
  }

  private trySignInteract(): boolean {
    if (this.signActive) return false;
    const signWorldX = this.signTileX * 32 + 16;
    const signWorldY = this.signTileY * 32 + 32;
    const dist = Phaser.Math.Distance.Between(
      this.player.x, this.player.y, signWorldX, signWorldY
    );
    if (dist >= this.signInteractDist) return false;

    this.signActive = true;
    this.physics.pause();
    if (this.signPrompt) this.signPrompt.setVisible(false);

    // Build overlay — fixed to screen using scrollFactor(0)
    const cam = this.cameras.main;
    const screenCX = cam.width / 2;
    const screenCY = cam.height / 2;
    const container = this.add.container(screenCX, screenCY).setDepth(500).setScrollFactor(0);

    // Dark backdrop
    const backdrop = this.add.rectangle(0, 0, cam.width * 4, cam.height * 4, 0x000000, 0.6);
    container.add(backdrop);

    // Wooden sign board
    const boardW = 130;
    const boardH = 100;

    // Post
    const post = this.add.rectangle(0, boardH / 2 + 12, 8, 28, 0x5c3a1e);
    container.add(post);

    // Planks — each angled slightly for a rustic look
    const planks = [
      { y: -30, w: 80, angle: -3, text: "↑  Estate", color: "#f5e6c8" },
      { y: -6, w: 90, angle: 2, text: "←  Library", color: "#f5e6c8" },
      { y: 18, w: 85, angle: -2, text: "↖  Fountain", color: "#f5e6c8" },
    ];

    for (const p of planks) {
      // Plank background
      const plank = this.add.rectangle(0, p.y, p.w, 18, 0xc9a96e);
      plank.setStrokeStyle(1, 0x8b6914);
      plank.setAngle(p.angle);
      container.add(plank);

      // Plank text
      const txt = this.add.text(0, p.y, p.text, {
        fontFamily: "ChakraPetch, sans-serif",
        fontStyle: "bold",
        fontSize: "8px",
        color: "#3b2510",
        align: "center",
        resolution: 4,
      }).setOrigin(0.5).setAngle(p.angle);
      container.add(txt);
    }

    // "Press SPACE to close" hint
    const hint = this.add.text(0, boardH / 2 + 35, "[ SPACE ]", {
      fontFamily: "ChakraPetch, sans-serif",
      fontSize: "6px",
      color: "#aaaaaa",
      align: "center",
      resolution: 4,
    }).setOrigin(0.5);
    container.add(hint);

    // Fade in
    container.setAlpha(0);
    this.tweens.add({ targets: container, alpha: 1, duration: 200, ease: "Sine.easeOut" });

    this.signOverlay = container;

    // Also allow click to dismiss
    backdrop.setInteractive();
    backdrop.once("pointerdown", () => this.dismissSign());

    return true;
  }

  private dismissSign() {
    if (!this.signActive) return;
    this.signActive = false;
    this.physics.resume();

    if (this.signOverlay) {
      this.tweens.add({
        targets: this.signOverlay,
        alpha: 0,
        duration: 150,
        ease: "Sine.easeIn",
        onComplete: () => {
          this.signOverlay?.destroy();
          this.signOverlay = undefined;
        },
      });
    }
  }

  private tryStartingDoor(): boolean {
    if (this.startingDoorOpened || !this.startingChestOpened) return false;
    const dist = Phaser.Math.Distance.Between(
      this.player.x, this.player.y, this.startDoorX, this.startDoorY
    );
    if (dist >= this.startInteractDist) return false;

    this.startingDoorOpened = true;
    this.reachableDirty = true; // recompute spawn reachability

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

  /** Helper: true during cutscene_1 or cutscene_2 (physics paused, player frozen) */
  private get masonCutsceneActive(): boolean {
    return this.masonRavePhase === "cutscene_1" || this.masonRavePhase === "cutscene_2";
  }

  /** Phase 0: Spawn Mason + dancing zombies, seal estate, player walks freely */
  private triggerMasonRave() {
    this.masonTriggered = true;
    this.masonRavePhase = "rave_setup";

    // Seal estate entrance
    const estateDoor = this.doors.find(d => d.label === "Estate Entrance");
    if (estateDoor && estateDoor.opened) {
      (estateDoor.zone.body as Phaser.Physics.Arcade.StaticBody).enable = true;
      for (const t of estateDoor.savedTiles) {
        this.getDoorLayer(t.layer)?.putTileAt(t.gid, t.col, t.row);
      }
      estateDoor.opened = false;
      this.reachableDirty = true;
    }

    // Spawn Mason behind the DJ table, facing south, breathing-idle
    const masonX = 48 * 32 + 16; // center of tile 48, aligned with DJ table
    const masonY = 170;
    const mason = new Enemy(this, masonX, masonY, "mason", 1, 1);
    this.enemies.add(mason);
    mason.setDepth(5);
    mason.fleeing = true;
    mason.setFacing("south");
    mason.body.setVelocity(0, 0);
    mason.body.setImmovable(true);
    const masonIdleKey = getAnimKey("mason", "breathing-idle", "south");
    if (this.anims.exists(masonIdleKey)) mason.play(masonIdleKey, true);
    this.masonEnemy = mason;

    // Spawn dancing zombies scattered across the ballroom
    this.masonRaveZombies = [];
    const directions: Array<"south" | "south-east" | "south-west" | "east" | "west"> = ["south", "south-east", "south-west", "east", "west"];
    const speedTiers: Array<"shamble" | "jog" | "run"> = ["jog", "jog", "run"];
    for (let i = 0; i < 35; i++) {
      const zx = 1250 + Math.random() * 500;
      const zy = 220 + Math.random() * 280;
      const tier = speedTiers[i % speedTiers.length];
      const zombie = new Enemy(this, zx, zy, "basic", 1.5, 2, tier);
      this.enemies.add(zombie);
      zombie.raveZombie = true;
      zombie.setScale(0.34);
      zombie.body.setImmovable(true);
      zombie.startDancing(directions[i % directions.length]);
      this.masonRaveZombies.push(zombie);
    }
  }

  /** Phase 1: Camera pan to Mason, show first dialogue card */
  private triggerMasonCutscene1() {
    this.masonRavePhase = "cutscene_1";
    this.physics.pause();
    this.game.canvas.style.pointerEvents = "none";

    // Switch player to breathing-idle
    const idleKey = getAnimKey(this.characterDef.id, "breathing-idle", this.player.currentDir);
    if (this.anims.exists(idleKey)) this.player.play(idleKey, true);

    // Letterbox bars
    const screenW = this.cameras.main.width;
    const screenH = this.cameras.main.height;
    const barH = Math.round(screenH * 0.13);
    const topBar = this.add.rectangle(screenW / 2, -barH / 2, screenW, barH, 0x000000)
      .setScrollFactor(0).setDepth(290).setAlpha(1);
    const bottomBar = this.add.rectangle(screenW / 2, screenH + barH / 2, screenW, barH, 0x000000)
      .setScrollFactor(0).setDepth(290).setAlpha(1);
    this.masonLetterboxBars = [topBar, bottomBar];

    this.tweens.add({ targets: topBar, y: barH / 2, duration: 500, ease: "Quart.easeOut" });
    this.tweens.add({ targets: bottomBar, y: screenH - barH / 2, duration: 500, ease: "Quart.easeOut" });

    // Camera pan to Mason
    this.cameras.main.stopFollow();
    const masonPanX = 48 * 32 + 16;
    this.cameras.main.pan(masonPanX, 170, 1500, "Sine.easeInOut", false, (_cam: Phaser.Cameras.Scene2D.Camera, progress: number) => {
      if (progress >= 1) {
        this.masonBannerReady = true;
        hudState.update({
          masonDialogueActive: true,
          masonDialogueQuote: "You dare interrupt my rave? This is MY dancefloor.",
        });
      }
    });
  }

  /** Dismiss the Mason dialogue card (Space or click) and proceed */
  private dismissMasonDialogue() {
    if (!this.masonCutsceneActive || this.masonDismissing) return;
    this.masonDismissing = true;
    this.masonBannerReady = false;

    // Hide React banner
    hudState.update({ masonDialogueActive: false });
    this.game.canvas.style.pointerEvents = "auto";

    // Camera pan back to player
    this.cameras.main.pan(this.player.x, this.player.y, 1000, "Sine.easeInOut", false, (_cam: Phaser.Cameras.Scene2D.Camera, progress: number) => {
      if (progress < 1) return;
      this.cameras.main.startFollow(this.player, true, 0.08, 0.08);

      // Retract letterbox bars
      this.retractMasonLetterbox(() => {
        this.physics.resume();
        this.masonDismissing = false;

        if (this.masonRavePhase === "cutscene_1") {
          // Activate zombies — they stop dancing and attack
          this.masonRavePhase = "zombie_fight";
          for (const z of this.masonRaveZombies) {
            if (z.active && !z.dying) {
              z.stopDancing();
              z.body.setImmovable(false);
            }
          }
          this.showWeaponMessage("KILL THE ZOMBIES!", "#ff4444");
        } else if (this.masonRavePhase === "cutscene_2") {
          // Mason jumps in to fight
          this.masonRavePhase = "boss_fight";
          if (this.masonEnemy?.active) {
            this.playMasonJumpEntry(this.masonEnemy);
          }
        }
      });
    });
  }

  /** Retract Mason letterbox bars with tween, then call onComplete */
  private retractMasonLetterbox(onComplete: () => void) {
    if (!this.masonLetterboxBars) { onComplete(); return; }
    const [topBar, bottomBar] = this.masonLetterboxBars;
    this.masonLetterboxBars = null;
    const barH = topBar.height;
    const screenH = this.cameras.main.height;
    this.tweens.add({
      targets: topBar,
      y: -barH / 2,
      duration: 350,
      ease: "Quart.easeIn",
      onComplete: () => topBar.destroy(),
    });
    this.tweens.add({
      targets: bottomBar,
      y: screenH + barH / 2,
      duration: 350,
      ease: "Quart.easeIn",
      onComplete: () => { bottomBar.destroy(); onComplete(); },
    });
  }

  /** All rave zombies dead — brief dramatic pause, then player walks north */
  private triggerDramaticPause() {
    this.masonRavePhase = "dramatic_pause";
    this.showWeaponMessage("...", "#aaaaaa");
  }

  /** Phase 2: Second cutscene — camera pan to Mason, second dialogue */
  private triggerMasonCutscene2() {
    this.masonRavePhase = "cutscene_2";
    this.physics.pause();
    this.game.canvas.style.pointerEvents = "none";

    const idleKey = getAnimKey(this.characterDef.id, "breathing-idle", this.player.currentDir);
    if (this.anims.exists(idleKey)) this.player.play(idleKey, true);

    const screenW = this.cameras.main.width;
    const screenH = this.cameras.main.height;
    const barH = Math.round(screenH * 0.13);
    const topBar = this.add.rectangle(screenW / 2, -barH / 2, screenW, barH, 0x000000)
      .setScrollFactor(0).setDepth(290).setAlpha(1);
    const bottomBar = this.add.rectangle(screenW / 2, screenH + barH / 2, screenW, barH, 0x000000)
      .setScrollFactor(0).setDepth(290).setAlpha(1);
    this.masonLetterboxBars = [topBar, bottomBar];

    this.tweens.add({ targets: topBar, y: barH / 2, duration: 500, ease: "Quart.easeOut" });
    this.tweens.add({ targets: bottomBar, y: screenH - barH / 2, duration: 500, ease: "Quart.easeOut" });

    this.cameras.main.stopFollow();
    const masonPanX2 = 48 * 32 + 16;
    this.cameras.main.pan(masonPanX2, 170, 1500, "Sine.easeInOut", false, (_cam: Phaser.Cameras.Scene2D.Camera, progress: number) => {
      if (progress >= 1) {
        this.masonBannerReady = true;
        hudState.update({
          masonDialogueActive: true,
          masonDialogueQuote: "Fine. You want a fight? I'll show you how a DJ drops the beat.",
        });
      }
    });
  }

  /** Mason jump-lands near the player and activates combat AI */
  private playMasonJumpEntry(mason: Enemy) {
    const targetX = this.player.x;
    const targetY = this.player.y - 60; // land just north of player

    // Tween Mason from DJ table to near player
    this.tweens.add({
      targets: mason,
      x: targetX,
      y: targetY,
      duration: 800,
      ease: "Quad.easeIn",
      onComplete: () => {
        // Camera shake on landing
        this.cameras.main.shake(300, 0.012);

        // Face the player
        const angle = Phaser.Math.Angle.Between(mason.x, mason.y, this.player.x, this.player.y);
        mason.setFacing(angleToDirection(angle) as any);

        // Activate combat AI
        mason.fleeing = false;
        mason.body.setImmovable(false);
        this.showWeaponMessage("BIGBOSSBABY WANTS TO FIGHT!", "#7c3aed");
      },
    });
  }

  // Fixed spawn positions per encounter (tile coords × 32, centered in tile)
  private readonly SCARYBOI_SPAWN: Record<"zone2" | "southBuilding" | "estate", { x: number; y: number }> = {
    zone2:         { x: 20 * 32 + 16, y: 35 * 32 + 16 },
    southBuilding: { x: 12 * 32 + 16, y: 45 * 32 + 16 },
    estate:        { x: 33 * 32 + 16, y: 22 * 32 + 16 },
  };

  // Per-encounter cutscene data — quote and VO are easy to swap later
  private readonly SCARYBOI_CUTSCENE_DATA: Record<"zone2" | "southBuilding" | "estate", { quotes: string[]; voSrc: string }> = {
    zone2: {
      quotes: [
        "You know, there's a big party going on inside...",
        "But your name isn't on the guest list.",
      ],
      voSrc: "/assets/audio/voice/scaryboi-vo-zone2.mp3",
    },
    southBuilding: {
      quotes: [
        "The righteous BigBaby will bless us all with his tasty beats tonight...",
        "You will not reach him. You are not worthy.",
      ],
      voSrc: "/assets/audio/voice/scaryboi-vo-south.mp3",
    },
    estate: {
      quotes: [
        "BigBaby's dancefloor has no tolerance for Jabronis and haters...",
        "And neither do I.",
      ],
      voSrc: "/assets/audio/voice/scaryboi-vo-estate.mp3",
    },
  };

  /** Spawn SCARYBOI for a specific encounter */
  private spawnScaryboiEncounter(enc: "zone2" | "southBuilding" | "estate") {
    const encConfig = this.waveManager.getCurrentEncounterConfig();

    // Mark location triggers so they don't re-fire
    if (enc === "zone2") this.scaryboiZone2Triggered = true;
    if (enc === "southBuilding") this.scaryboiSouthTriggered = true;
    if (enc === "estate") this.scaryboiEstateTriggered = true;

    const { x: spawnX, y: spawnY } = this.SCARYBOI_SPAWN[enc];

    // Every encounter gets a cutscene — first has backflip, subsequent are shorter
    const isFirst = !this.waveManager.hasSeenScaryboi();
    if (isFirst) this.waveManager.markScaryboiSeen();
    this.playScaryboiCutscene(spawnX, spawnY, encConfig, enc as "zone2" | "southBuilding" | "estate", isFirst);

    // Estate: seal door behind player
    if (enc === "estate") {
      const estateDoor = this.doors.find(d => d.label === "Estate Entrance");
      if (estateDoor && estateDoor.opened) {
        (estateDoor.zone.body as Phaser.Physics.Arcade.StaticBody).enable = true;
        for (const t of estateDoor.savedTiles) {
          this.getDoorLayer(t.layer)?.putTileAt(t.gid, t.col, t.row);
        }
        estateDoor.opened = false;
        this.reachableDirty = true;
      }
    }
  }

  /** Actually create the SCARYBOI entity and play smoke-appear */
  private doScaryboiSpawn(spawnX: number, spawnY: number, hpPercent: number, gracePeriodMs: number, enc: string) {
    const maxHp = (BALANCE.enemies.boss as any).hp as number;
    const boss = new Enemy(this, spawnX, spawnY, "boss", 1, 1);
    boss.health = Math.round(maxHp * hpPercent);
    boss.maxHealth = maxHp;
    boss.body.setCollideWorldBounds(true);
    this.enemies.add(boss);

    // All encounters: SCARYBOI faces south (toward player)
    boss.setFacing("south");
    const isIndoor = enc === "southBuilding";
    boss.initBossEncounter(gracePeriodMs, isIndoor);
    this.waveManager.registerBossEnemy(boss);

    // Smoke appear for encounters 1 & 2, standing idle for encounter 3
    if (enc !== "estate") {
      boss.playSmokeAppear();
    }

  }

  /**
   * Cinematic freeze cutscene for SCARYBOI encounters.
   * Encounter 1: letterbox → smoke → backflip → idle → banner
   * Encounters 2+: letterbox → smoke → idle → banner (no backflip)
   */
  private playScaryboiCutscene(
    spawnX: number,
    spawnY: number,
    encConfig: { hpPercent: number; gracePeriodMs: number },
    enc: "zone2" | "southBuilding" | "estate",
    isFirst: boolean
  ) {
    this.scaryboiIntroActive = true;
    this.scaryboiCutsceneGracePeriodMs = encConfig.gracePeriodMs;
    this.scaryboiCutsceneIsIndoor = enc === "southBuilding";
    this.physics.pause();
    this.game.canvas.style.pointerEvents = "none";

    // Switch player to breathing-idle immediately
    const idleKey = getAnimKey(this.characterDef.id, "breathing-idle", this.player.currentDir);
    if (this.anims.exists(idleKey)) this.player.play(idleKey, true);

    const screenW = this.cameras.main.width;
    const screenH = this.cameras.main.height;
    const barH = Math.round(screenH * 0.13);

    // Letterbox bars start off-screen, fixed to camera (scrollFactor 0)
    const topBar = this.add.rectangle(screenW / 2, -barH / 2, screenW, barH, 0x000000)
      .setScrollFactor(0).setDepth(290).setAlpha(1);
    const bottomBar = this.add.rectangle(screenW / 2, screenH + barH / 2, screenW, barH, 0x000000)
      .setScrollFactor(0).setDepth(290).setAlpha(1);
    this.scaryboiLetterboxBars = [topBar, bottomBar];

    // Bars slide in simultaneously — cinematic wipe
    this.tweens.add({ targets: topBar, y: barH / 2, duration: 500, ease: "Quart.easeOut" });
    this.tweens.add({
      targets: bottomBar,
      y: screenH - barH / 2,
      duration: 500,
      ease: "Quart.easeOut",
      onComplete: () => {
        // Bars settled — spawn boss in cutscene mode (no AI, no grace period yet)
        const maxHp = (BALANCE.enemies.boss as any).hp as number;
        const boss = new Enemy(this, spawnX, spawnY, "boss", 1, 1);
        boss.health = Math.round(maxHp * encConfig.hpPercent);
        boss.maxHealth = maxHp;
        boss.body.setCollideWorldBounds(true);
        boss.bossCutscene = true;
        boss.setFacing("south");
        this.enemies.add(boss);
        this.waveManager.registerBossEnemy(boss);
        this.scaryboiCutsceneBoss = boss;

        // Encounter 1: full sequence (smoke → backflip → idle)
        // Encounters 2+: short sequence (smoke → idle, no backflip)
        const cutsceneData = this.SCARYBOI_CUTSCENE_DATA[enc];
        const onBannerReady = () => {
          this.scaryboiBannerReady = true;
          hudState.update({
            scaryboiIntroActive: true,
            scaryboiEncounterIndex: isFirst ? 0 : enc === "southBuilding" ? 1 : 2,
            scaryboiQuotes: cutsceneData.quotes,
            scaryboiVoSrc: cutsceneData.voSrc,
          });
        };
        if (isFirst) {
          boss.playCutsceneSequence(onBannerReady);
        } else {
          boss.playCutsceneSequenceShort(onBannerReady);
        }
      },
    });
  }

  /** Dismiss the SCARYBOI cutscene (Space key or "Bring it" button) */
  private dismissScaryboiIntro() {
    if (!this.scaryboiIntroActive || this.scaryboiDismissing) return;
    this.scaryboiDismissing = true;
    this.scaryboiBannerReady = false;

    // Hide React banner immediately
    hudState.update({ scaryboiIntroActive: false });
    this.game.canvas.style.pointerEvents = "auto";

    const screenH = this.cameras.main.height;
    if (this.scaryboiLetterboxBars) {
      const [topBar, bottomBar] = this.scaryboiLetterboxBars;
      this.scaryboiLetterboxBars = null;
      const barH = topBar.height;
      this.tweens.add({
        targets: topBar,
        y: -barH / 2,
        duration: 350,
        ease: "Quart.easeIn",
        onComplete: () => topBar.destroy(),
      });
      this.tweens.add({
        targets: bottomBar,
        y: screenH + barH / 2,
        duration: 350,
        ease: "Quart.easeIn",
        onComplete: () => bottomBar.destroy(),
      });
    }

    // Resume gameplay after bars slide out, then hand off to boss
    this.time.delayedCall(350, () => {
      this.scaryboiIntroActive = false;
      this.scaryboiDismissing = false;
      this.physics.resume();

      // End cutscene mode and start the actual encounter with grace period
      if (this.scaryboiCutsceneBoss?.active) {
        this.scaryboiCutsceneBoss.startEncounterAfterCutscene(
          this.scaryboiCutsceneGracePeriodMs,
          this.scaryboiCutsceneIsIndoor
        );
      }
      this.scaryboiCutsceneBoss = null;
    });
  }

  /** Spawn RPG pickup at a world position (dropped by SCARYBOI on death) */
  private spawnRpgPickup(x: number, y: number) {
    const tex = this.textures.exists("item-rpg") ? "item-rpg" : "item-pistol";
    const pickup = this.add.image(x, y, tex)
      .setDepth(10)
      .setScale(1.5);

    // Gentle bob animation
    this.tweens.add({
      targets: pickup,
      y: y - 5,
      yoyo: true,
      repeat: -1,
      duration: 800,
      ease: "Sine.easeInOut",
    });

    // Check proximity each frame for auto-pickup
    const checkPickup = () => {
      if (!pickup.active || !this.player?.active) return;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, pickup.x, y);
      if (d < 40) {
        // Equip RPG with full ammo
        const wpDef = (BALANCE.weapons as any).rpg;
        this.addWeapon("rpg", {
          mag: wpDef.magazineSize,
          reserve: wpDef.magazineSize * (wpDef.totalClips - 1),
        });
        this.activeWeapon = "rpg";
        this.activeSlot = this.weapons.indexOf("rpg") + 1;
        this.showWeaponMessage("RPG ACQUIRED!", "#ffdd44");
        this.playSound("sfx-purchase", 0.6);
        pickup.destroy();
        this.events.off("update", checkPickup);
      }
    };
    this.events.on("update", checkPickup);
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

      // Doors stay open permanently once opened (paid or bashed)

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

  private tryBuyNearbyDoor(): boolean {
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
          return true; // near a door, consumed the input
        }
        // Purchase — remove collision, clear door tiles, hide prompt
        if (!door.paid) {
          this.currency -= door.cost;
          door.paid = true;
        }
        door.opened = true;
        this.reachableDirty = true; // recompute spawn reachability
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
        // Notify WaveManager when Gate opens (triggers zone2 SCARYBOI encounter)
        if (door.label === "Gate") {
          this.waveManager.notifyGateOpened();
        }
        return true;
      }
    }
    return false;
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
    this.reachableDirty = true; // recompute spawn reachability

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
    if (door.label === "Gate") {
      this.waveManager.notifyGateOpened();
    }
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
      case "smg":
      case "rpg":
      case "assault_rifle": {
        const weaponDef = BALANCE.weapons[itemId as keyof typeof BALANCE.weapons];
        // Already own this weapon — refill ammo
        if (this.weapons.includes(itemId)) {
          const wAmmo = this.weaponAmmo[itemId];
          if (!wAmmo) return;
          const totalMax = weaponDef.magazineSize * weaponDef.totalClips;
          if (wAmmo.mag + wAmmo.reserve >= totalMax) return;
          this.currency -= price;
          wAmmo.reserve = totalMax - wAmmo.mag;
          break;
        }
        // Buy new weapon — adds to inventory
        this.currency -= price;
        this.addWeapon(itemId, {
          mag: weaponDef.magazineSize,
          reserve: weaponDef.magazineSize * (weaponDef.totalClips - 1),
        });
        this.activeWeapon = itemId;
        this.activeSlot = this.weapons.indexOf(itemId) + 1;
        this.reloading = false;
        if (this.reloadTimer) { this.reloadTimer.destroy(); this.reloadTimer = null; }
        this.showWeaponMessage(weaponDef.name.toUpperCase() + " ACQUIRED", "#44dd44");
        break;
      }
      case "ammo_light": {
        // Light ammo refills pistol and SMG (if owned)
        let anyRefilled = false;
        for (const wk of ["pistol", "smg"]) {
          if (!this.weapons.includes(wk)) continue;
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
        if (!this.weapons.includes("shotgun")) {
          return;
        }
        const wDef = BALANCE.weapons.shotgun;
        const wAmmo = this.weaponAmmo.shotgun;
        if (!wAmmo) return;
        const totalMax = wDef.magazineSize * wDef.totalClips;
        if (wAmmo.mag + wAmmo.reserve >= totalMax) return;
        this.currency -= price;
        const addAmmo = 6; // 6 shells per purchase
        wAmmo.reserve = Math.min(wAmmo.reserve + addAmmo, totalMax - wAmmo.mag);
        break;
      }
      case "ammo_heavy": {
        if (!this.weapons.includes("assault_rifle")) {
          return;
        }
        const arDef = BALANCE.weapons.assault_rifle;
        const arAmmo = this.weaponAmmo.assault_rifle;
        if (!arAmmo) return;
        const arTotalMax = arDef.magazineSize * arDef.totalClips;
        if (arAmmo.mag + arAmmo.reserve >= arTotalMax) return;
        this.currency -= price;
        const addHeavy = arDef.magazineSize * 2;
        arAmmo.reserve = Math.min(arAmmo.reserve + addHeavy, arTotalMax - arAmmo.mag);
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
      case "grenade": {
        if (this.grenadeCount >= BALANCE.grenade.maxCount) return;
        this.currency -= price;
        this.grenadeCount++;
        this.player.grenadeCount = this.grenadeCount;
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
    // Assault Rifle speed penalty when equipped
    const akPenalty = this.activeWeapon === "assault_rifle" ? ((BALANCE.weapons.assault_rifle as any).speedPenalty ?? 1) : 1;
    this.player.stats.speed = effective.speed * akPenalty;
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
      activeItemType: this.isWeaponSlot(this.activeSlot) ? "weapon" : this.activeSlot === this.barricadeSlot ? "barricade" : this.activeSlot === this.mineSlot ? "mine" : null,
      ammo: this.currentAmmo?.mag ?? 0,
      maxAmmo: this.currentWeaponDef?.magazineSize ?? 0,
      reserveAmmo: this.currentAmmo?.reserve ?? 0,
      reloading: this.reloading,
      barricadeCount: this.trapInventory.get("barricade" as TrapType) ?? 0,
      mineCount: this.trapInventory.get("landmine" as TrapType) ?? 0,
      grenadeCount: this.grenadeCount,
      abilityName: this.characterDef.ability.name,
      abilityCooldown: this.abilityCooldownTimer > 0 ? this.abilityCooldownTimer / 1000 : 0,
      abilityMaxCooldown: this.characterDef.ability.cooldown,
      abilityKey: "Q",
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
