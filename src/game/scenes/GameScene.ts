import Phaser from "phaser";
import { Player } from "../entities/Player";
import { Enemy, EnemyType, angleToDirection } from "../entities/Enemy";
import { Projectile, ensureBulletTexture } from "../entities/Projectile";
import { Trap, TrapType, ensureTrapTextures } from "../entities/Trap";
import { CHARACTERS, CharacterDef, BASE_STATS, Direction } from "../data/characters";
import { BALANCE } from "../data/balance";
import { WaveManager, WaveState, GatedZone, RoomZone } from "../systems/WaveManager";
import { ZoneSpawnManager } from "../systems/ZoneSpawnManager";
import { LevelingSystem, BuffOption } from "../systems/LevelingSystem";
import { hasAnimation, getAnimKey } from "../data/animations";
import { hudState } from "../HUDState";
import { isPublicBuild, PUBLIC_BUILD_UNLOCKABLE_DOOR_LABEL } from "../publicBuild";
import { Pathfinder, pointInPolygon } from "../systems/Pathfinder";
import { AudioManager } from "../systems/AudioManager";
// Village map constants
const VILLAGE_MAP_W = 80 * 16;  // 1280px
const VILLAGE_MAP_H = 65 * 16;  // 1040px

// Endicott Estate map constants (60x60 tiles at 32px)
const ENDICOTT_MAP_W = 100 * 32;  // 3200px
const ENDICOTT_MAP_H = 60 * 32;   // 1920px

export class GameScene extends Phaser.Scene {
  player!: Player;
  audio!: AudioManager;
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
  private scaryboiCutsceneBoss: Enemy | null = null;
  private scaryboiCutsceneGracePeriodMs = 2000;
  private scaryboiCutsceneIsIndoor = false;
  private scaryboiGateTriggered = false;  // prevents re-triggering zone2 encounter
  private scaryboiLibraryTriggered = false;  // prevents re-triggering south building encounter
  private scaryboiEstateTriggered = false; // prevents re-triggering estate encounter
  private pendingScaryboiSpawn: { x: number; y: number; hpPercent: number; gracePeriodMs: number; enc: string; isFirst: boolean } | null = null;
  private masonRavePhase: "" | "rave_setup" | "cutscene_1" | "zombie_fight" | "dramatic_pause" | "cutscene_2" | "boss_fight" = "";
  private masonTriggered = false;
  private masonEnemy: Enemy | null = null;
  private masonAuraLight: Phaser.GameObjects.Light | null = null;
  private masonRaveZombies: Enemy[] = [];
  private raveCrowdRect = { x: 1387, y: 249, w: 306, h: 187 };
  private masonBannerReady = false;
  private masonDismissing = false;
  private masonClubEffects: Phaser.GameObjects.GameObject[] = [];
  private scaryboiProximityFade = false; // true when player is near a SCARYBOI zone and crossfading
  private postCutsceneImmunity = 0; // ms remaining of damage immunity after rave cutscene

  // Kyle intro cutscene
  private kyleIntroTriggered = false;
  private _explorationThemeStarted = false;
  private kyleIntroPhase: "" | "run_to_door" | "kyle_shoots" | "exterior_dialogue" | "fade_to_interior" | "interior_dialogue" | "done" = "";
  private kyleDialogueIndex = 0;
  private kyleNpc: Phaser.GameObjects.Sprite | null = null;
  private kyleScriptedZombie: Enemy | null = null;
  private kyleTriggerRect = { x: 0, y: 0, w: 0, h: 0 };
  private kyleShopPos = { x: 0, y: 0 };          // kyle_npc_rudys point from Tiled
  private kylePacing = false;
  private kylePaceTarget: { x: number; y: number } | null = null;
  // Waypoint paths from Tiled (kyle_cs_player0..N, kyle_cs_zombie0..N, kyle_cs_kyle0..N)
  private kyleCSPlayerPath: { x: number; y: number }[] = []; // only last point used (door)
  private kyleCSZombiePath: { x: number; y: number }[] = [];
  private kyleCSKylePath: { x: number; y: number }[] = [];
  private kyleCSZombieWaypoint = 0;
  private kyleCSKyleWaypoint = 0;
  private kyleCSKyleStarted = false;
  private kyleCSPlayerAtDoor = false;
  private kyleCSPlayerDoorTimer = 0; // ms spent banging on door
  private kyleCSRunningSound: Phaser.Sound.BaseSound | null = null;

  // Room-based visibility — populated from Tiled "zones" layer polygons at runtime
  private visibilityZones: { name: string; points: { x: number; y: number }[] }[] = [];
  private roomOccluder: Phaser.GameObjects.RenderTexture | null = null;
  private currentZoneName: string | null = null;

  exclusionZones: { x: number; y: number; w: number; h: number }[] = [];
  private scaryboiTriggerZones: { encounter: string; requires: string; x: number; y: number; w: number; h: number }[] = [];
  private teleportPoints: { name: string; target: string; x: number; y: number }[] = [];
  private teleporting = false;
  private damageBoostActive = false;
  private baseDamage = 0;

  // Wave system (legacy — being replaced by zone spawning)
  private waveManager!: WaveManager;
  // Zone-based spawning (replaces waves)
  private zoneSpawnManager!: ZoneSpawnManager;
  private timeSurvived = 0; // ms — tracks game time for leaderboard

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

  // Consumable hotbar (keys 1-4) — fixed slot order: bandage=0, grenade=1, mine=2
  private static readonly CONSUMABLE_SLOT_ORDER = ["bandage", "grenade", "mine"];
  private consumableSlotAssignments: string[] = []; // ordered item types, max 6
  private consumableActiveFlash = -1; // slot index that was just used (for HUD flash), -1 = none

  // Grenade system
  private grenadeCount = 0;
  private bandageCount = 0;
  private rudysDesks: { name: string; x: number; y: number; stocked: boolean }[] = [];
  private deskGlows: Phaser.GameObjects.Graphics[] = [];
  // Car interactables — 1 has shotgun loot, 2 have alarms
  private cars: { name: string; x: number; y: number; opened: boolean; hasLoot: boolean; alarmKey?: string }[] = [];
  private playerLight!: Phaser.GameObjects.Light;   // small ambient around player
  private playerConeLight!: Phaser.GameObjects.Light; // mid-beam
  private playerConeFar!: Phaser.GameObjects.Light;   // far-beam
  private rudysLight!: Phaser.GameObjects.Light;
  private rudysInteriorLights: Phaser.GameObjects.Light[] = [];
  private landmarkLights: { name: string; light: Phaser.GameObjects.Light; flicker: string }[] = [];
  private triggeredLights: Map<string, Phaser.GameObjects.Light[]> = new Map();
  private flashlightActive = true;   // whether lights are currently showing (runtime state)
  private flashlightUserOn = true;    // whether user has toggled flashlight on (T key)
  private sprintSoundTimer = 0;      // ms until next sprint sound emission for detection
  private _lastGunfireTime = 0;      // timestamp of last gunshot for stealth barometer
  private _displayedStealth = 0;     // smoothed stealth value sent to HUD
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
  private genHumSound: Phaser.Sound.BaseSound | null = null;
  private streetlampLights: { light: Phaser.GameObjects.Light; intensity: number }[] = [];
  private generator: {
    sprite: Phaser.GameObjects.Sprite;
    x: number;
    y: number;
    promptText?: Phaser.GameObjects.Container;
  } | null = null;
  private machines: {
    machineType: string; // "zyn" | "keg"
    label: string;
    cost: number;
    x: number;
    y: number;
    sprite: Phaser.GameObjects.Sprite;
    purchased: boolean;
    promptText?: Phaser.GameObjects.Container;
  }[] = [];
  private reloadSpeedMultiplier = 1; // Zyn perk: < 1 = faster reload
  private armor = 0; // Keg perk: damage hits armor before HP

  // Shop
  private shopOpen = false;
  private shopSign!: Phaser.GameObjects.Image;
  private shopSignGlow: Phaser.GameObjects.Light | null = null;

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
    promptText?: Phaser.GameObjects.Container;
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

  // Starting room — door before wave 1
  private startingDoorOpened = false;
  private startingDoorPrompt?: Phaser.GameObjects.Container;
  private startingDoorBody?: Phaser.GameObjects.Zone; // physics body blocking doorway
  private hasWeapon = false; // false until Kyle gives pistol

  // Loot chests (placed via Tiled interactables layer, type "chest")
  private lootChests: {
    x: number;
    y: number;
    label: string;
    opened: boolean;
    sprite: Phaser.GameObjects.Sprite;
    promptText?: Phaser.GameObjects.Container;
  }[] = [];

  private roofLayer?: Phaser.Tilemaps.TilemapLayer;
  private roofVisible = true;

  // Intermission timer (30s between waves, managed by GameScene)
  private waveStartTimer = -1; // ms remaining for 3-2-1 center countdown, -1 = inactive
  private intermissionTimer = -1; // ms remaining for 30s intermission, -1 = inactive
  private intermissionLocked = false; // true when 30s expired — shop/desks locked, must exit Rudy's

  // Axe + chopable fences
  private hasAxe = false;
  private axePickupActive = false;
  private logSearched = false;
  private logPrompt?: Phaser.GameObjects.Container;
  private logWorldCX = 57 * 32 + 16;
  private logWorldCY = 33 * 32 + 16;
  private readonly interactDist = 60;
  private chopableFences: {
    tileX: number; tileY: number;
    layers: { name: string; gid: number }[];
    body: Phaser.GameObjects.Zone | null;
    chopped: boolean;
    prompt?: Phaser.GameObjects.Container;
  }[] = [];
  private inventoryOpen = false;

  // React interaction prompt — set per-frame by updateXxxPrompts, pushed to HUDState
  private activePromptLabel = "";
  private activePromptKey = "";
  private activePromptWorldX = 0;
  private activePromptWorldY = 0;
  private activePromptCanAfford = true;
  private activePromptVisible = false;

  // Objective tracker
  private objectivesComplete: { [key: string]: boolean } = {
    exit_room: false,
    investigate_rudys: false,
    search_tables: false,
    chop_fence: false,
    power_on: false,
    explore_library: false,
    defeat_scaryboi: false,
    investigate_music: false,
    crash_rave: false,
    defeat_bigbaby: false,
  };

  // HUD container — scrollFactor(0), scaled 1/zoom so it renders at screen-space
  private hudContainer!: Phaser.GameObjects.Container;
  private minimap!: Phaser.Cameras.Scene2D.Camera;
  private minimapDot!: Phaser.GameObjects.Graphics;
  private settingsOpen = false;
  private wheelHandler?: (e: WheelEvent) => void;
  private zoomEnabled = false;
  private devMode = false;
  pathfinder!: Pathfinder; // exposed for Enemy AI
  private statsOpen = false;
  private shopSelectedIndex = 0;
  private shopNavCol = 0;
  private shopNavRow = 0;
  private shopGrid: number[][] = []; // [col][row] -> original item index

  constructor() {
    super({ key: "Game" });
    this.audio = new AudioManager(this);
  }

  init(data: { characterId?: string }) {
    const id = data?.characterId || "rick";
    this.characterDef = CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
  }

  shutdown() {
    this.clearDeskGlows();
    this.audio.shutdown();
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
    this.timeSurvived = 0;
    this.lastDamageTime = 0;
    // Start empty-handed — pistol comes from Kyle
    this.activeWeapon = "pistol";
    this.weapons = ["pistol"];
    this.weaponAmmo = {};
    this.hasWeapon = false;
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
    if (this.genHumSound && (this.genHumSound as any).isPlaying) this.genHumSound.stop();
    this.genHumSound = null;
    this.streetlampLights = [];
    this.machines = [];
    this.reloadSpeedMultiplier = 1;
    this.armor = 0;
    this.grenadeCount = 0; // set properly after player creation
    this.bandageCount = 0;
    this.rudysDesks = [];
    this.cars = [];
    this.grenadeKeyDown = false;
    this.grenadeAiming = false;
    this.grenadeThrowing = false;

    // Letterbox (React)
    hudState.update({ letterboxActive: false });

    // SCARYBOI encounter state
    this.scaryboiIntroActive = false;
    this.scaryboiBannerReady = false;
    this.scaryboiDismissing = false;
    this.scaryboiCutsceneBoss = null;
    this.scaryboiCutsceneGracePeriodMs = 2000;
    this.scaryboiCutsceneIsIndoor = false;
    this.scaryboiGateTriggered = false;
    this.scaryboiLibraryTriggered = false;
    this.scaryboiEstateTriggered = false;
    this.scaryboiProximityFade = false;
    this.pendingScaryboiSpawn = null;

    // Kyle intro state
    this.kyleIntroTriggered = false;
    this._explorationThemeStarted = false;
    this.kyleIntroPhase = "";
    this.kyleDialogueIndex = 0;
    this.kyleNpc = null;
    this.kylePacing = false;
    this.kylePaceTarget = null;
    this.kyleScriptedZombie = null;

    // Mason encounter state
    this.masonRavePhase = "";
    this.masonTriggered = false;
    this.masonEnemy = null;
    this.masonAuraLight = null;
    this.masonRaveZombies = [];
    this.masonBannerReady = false;
    this.masonDismissing = false;
    this.audio.shutdown();

    // Misc state
    this.damageBoostActive = false;
    this.baseDamage = 0;
    this.levelUpActive = false;
    this.waveStartTimer = -1;
    this.hasAxe = false;
    this.axePickupActive = false;
    this.currentZoneName = null;
    if (this.roomOccluder) this.roomOccluder.setVisible(false);
    this.logSearched = false;
    this.inventoryOpen = false;
    this.chopableFences = [];
    this.fenceHintShown = false;
    this.objectivesComplete = {
      exit_room: false, investigate_rudys: false, search_tables: false,
      chop_fence: false, power_on: false,
      explore_library: false, defeat_scaryboi: false,
      investigate_music: false, crash_rave: false, defeat_bigbaby: false,
    };
    this.lastFireTime = 0;
    this.dryFired = false;
    this.shopSelectedIndex = 0;
    this.shopNavCol = 0;
    this.shopNavRow = 0;
    this.barricadeVertical = false;
    this.lootChests = [];
    this.intermissionTimer = -1;
    this.intermissionLocked = false;

    // Slow gameplay by 25%
    this.time.timeScale = 0.75;
    this.physics.world.timeScale = 1 / 0.75; // physics timeScale is inverted (higher = slower)
    this.tweens.timeScale = 0.75;

    // Draw tilemap — Endicott Estate
    const map = this.make.tilemap({ key: "endicott-map" });
    const tilesetDefs: [string, string][] = [
      ["cainos-grass", "ts-cainos-grass"],
      ["cainos-stone", "ts-cainos-stone"],
      ["basic-plant", "ts-basic-plant"],
      ["basic-props", "ts-basic-props"],
      ["basic-struct", "ts-basic-struct"],
      ["basic-wall", "ts-basic-wall"],
      ["td-basic-stone", "ts-td-basic-stone"],
      ["td-basic-wall", "ts-td-basic-wall"],
      ["td-basic-plant", "ts-td-basic-plant"],
      ["td-basic-props", "ts-td-basic-props"],
      ["td-basic-struct", "ts-td-basic-struct"],
      ["pipoya-basechip", "ts-pipoya-basechip"],
      ["rickarena-props", "ts-rickarena-props"],
      ["zp-wasteland", "ts-zp-wasteland"],
      ["zp-interior", "ts-zp-interior"],
      ["zc-buildings-rubble", "ts-zc-buildings-rubble"],
      ["zc-roads-vehicles", "ts-zc-roads-vehicles"],
      ["zc-facades-walls", "ts-zc-facades-walls"],
      ["zc-storefronts", "ts-zc-storefronts"],
      ["zc-shop-interiors", "ts-zc-shop-interiors"],
      ["zc-furniture", "ts-zc-furniture"],
      ["zc-small-props", "ts-zc-small-props"],
      ["zc-building-ext", "ts-zc-building-ext"],
      ["rudys", "ts-rudys"],
      ["Sprite-0001", "ts-sprite-0001"],
      ["grass-pavement-rick-0002", "ts-grass-pavement-rick-0002"],
      ["Sprite-0003", "ts-sprite-0003"],
      ["fancy_mansion_furnitureset", "ts-fancy-mansion-furnitureset"],
      ["fancy_mansion_room_door_tiles", "ts-fancy-mansion-room-door-tiles"],
      ["Interiors_tilesets", "ts-interiors-tilesets"],
    ];
    const allTilesets: Phaser.Tilemaps.Tileset[] = [];
    for (const [name, key] of tilesetDefs) {
      const ts = map.addTilesetImage(name, key);
      if (ts) { allTilesets.push(ts); }
      else { console.warn(`[GameScene] Failed to add tileset: ${name} (key=${key})`); }
    }
    // Main camera background matches grass so tile seams don't show black gaps
    this.cameras.main.setBackgroundColor(0x5a7a2a);
    this.groundLayer = map.createLayer("ground", allTilesets, 0, 0)?.setDepth(-2) ?? undefined;
    this.groundDetailLayer = map.createLayer("ground_detail", allTilesets, 0, 0)?.setDepth(-1.5) ?? undefined;
    this.pathsLayer = map.createLayer("paths", allTilesets, 0, 0)?.setDepth(-1) ?? undefined;
    this.floorInteriorLayer = map.createLayer("floor_interior", allTilesets, 0, 0)?.setDepth(-0.5) ?? undefined;
    this.wallsBaseLayer = map.createLayer("walls_base", allTilesets, 0, 0)?.setDepth(0) ?? undefined;
    this.insideWallsLayer = map.createLayer("inside_walls", allTilesets, 0, 0)?.setDepth(0.5) ?? undefined;
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
      sprite.setPipeline("Light2D");
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
      sprite.setPipeline("Light2D");
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
    console.log(`[GameScene] Tilesets loaded: ${allTilesets.length}/${tilesetDefs.length}`);
    console.log(`[GameScene] Layers: ground=${!!this.groundLayer} walls=${!!this.wallsBaseLayer} roof=${!!this.roofLayer}`);

    // ─── Light2D test: enable on ground layers only ───
    this.lights.enable();
    this.lights.setAmbientColor(0x3a3a3a); // ~77% darkness (~23% brightness)
    const light2dLayers = [
      this.groundLayer, this.groundDetailLayer, this.pathsLayer,
      this.wallsBaseLayer, this.wallsTopLayer, this.insideWallsLayer,
      this.propsLowLayer, this.propsMidLayer, this.propsIndoorLayer,
      this.floorInteriorLayer,
      this.foliagePaintedLayer, this.overhangsLayer,
      this.roofLayer, this.vfxMarksLayer,
    ];
    for (const layer of light2dLayers) {
      if (layer) layer.setPipeline("Light2D");
    }
    // Player flashlight — radial ambient (follows player, updated in update())
    // Flashlight: soft ambient + two beam lights chained in facing direction
    this.playerLight = this.lights.addLight(0, 0, 120, 0xffe08a, 0.25);
    this.playerConeLight = this.lights.addLight(0, 0, 110, 0xffe08a, 0.7);
    this.playerConeFar = this.lights.addLight(0, 0, 140, 0xffe08a, 0.35);
    // Rudy's storefront — no ambient glow, neon sign only
    const rudysCenterX = 80 * 32 + 16;
    const rudysCenterY = 55 * 32 + 16;
    this.rudysLight = this.lights.addLight(rudysCenterX, rudysCenterY, 0, 0x000000, 0);
    // ─── Landmark lights — driven by Tiled "landmarks" object layer ───
    this.initLandmarkLights(map);

    // Rudy's interior lights — cold, eerie fluorescent (pre-power)
    const rudysIntX = 80 * 32 + 16;
    const rudysIntY = 54 * 32 + 16;
    // Main ceiling fluorescent — harsh white, wide reach, unstable
    const fluoro1 = this.lights.addLight(rudysIntX, rudysIntY, 280, 0xe8e8f0, 0.7);
    this.rudysInteriorLights.push(fluoro1);
    // Secondary light near desks (south side)
    const fluoro2 = this.lights.addLight(rudysIntX, 56 * 32, 200, 0xdde0e8, 0.5);
    this.rudysInteriorLights.push(fluoro2);
    // Eerie flicker on main light — harsh strobe-like snap between bright and near-dark
    this.tweens.add({
      targets: fluoro1,
      intensity: { from: 0.15, to: 0.85 },
      duration: 120,
      yoyo: true,
      repeat: -1,
      ease: "Stepped",
      hold: 60,
      repeatDelay: 300 + Math.random() * 600,
    });
    // Secondary light: unsettling slow throb
    this.tweens.add({
      targets: fluoro2,
      intensity: { from: 0.15, to: 0.6 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    // Random violent blackout — full dark then harsh snap back
    this.time.addEvent({
      delay: 2000,
      loop: true,
      callback: () => {
        if (this.powerOn) return;
        fluoro1.intensity = 0.02;
        fluoro2.intensity = 0.02;
        this.time.delayedCall(60, () => {
          if (this.powerOn) return;
          fluoro1.intensity = 0.9;
          fluoro2.intensity = 0.6;
          this.time.delayedCall(40, () => {
            if (this.powerOn) return;
            fluoro1.intensity = 0.02;
            fluoro2.intensity = 0.02;
            this.time.delayedCall(120, () => {
              if (this.powerOn) return;
              fluoro1.intensity = 0.02;
              this.time.delayedCall(80, () => {
                if (this.powerOn) return;
                fluoro1.intensity = 0.85;
                fluoro2.intensity = 0.5;
              });
            });
          });
        });
      },
    });

    // Shop open/closed sign at tile 46,31
    this.shopSign = this.add.image(46 * 32 + 16, 31 * 32 + 16, "sign-closed").setDepth(10);
    this.shopSign.setTint(0x888888); // darken closed sign so it blends with the darkness
    this.shopSign.setPipeline("Light2D");

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

    // Dumpster (axe), fences — read positions from Tiled interactables
    const earlyInteractLayer = map.getObjectLayer("interactables");
    const fenceTilesFromTiled: [number, number][] = [];
    if (earlyInteractLayer) {
      for (const obj of earlyInteractLayer.objects) {
        if (obj.name === "dumpster") {
          this.logWorldCX = obj.x! + (obj.width ?? 32) / 2;
          this.logWorldCY = obj.y! + (obj.height ?? 32) / 2;
        } else if (obj.name.startsWith("fence_")) {
          fenceTilesFromTiled.push([Math.floor(obj.x! / 32), Math.floor(obj.y! / 32)]);
        }
      }
    }


    // Chopable fences — find collision bodies overlapping each fence tile
    {
      const fenceTiles = fenceTilesFromTiled;
      this.chopableFences = fenceTiles.map(([tx, ty]) => {
        // Save tile GIDs from all relevant layers
        const layers: { name: string; gid: number }[] = [];
        const layerMap: [string, Phaser.Tilemaps.TilemapLayer | undefined][] = [
          ["props_low", this.propsLowLayer],
          ["props_mid", this.propsMidLayer],
          ["props_indoor", this.propsIndoorLayer],
        ];
        for (const [name, layer] of layerMap) {
          const tile = layer?.getTileAt(tx, ty);
          if (tile) layers.push({ name, gid: tile.index });
        }

        // Find the collision body overlapping this tile
        const tileX1 = tx * 32;
        const tileY1 = ty * 32;
        const tileX2 = tileX1 + 32;
        const tileY2 = tileY1 + 32;
        let matchedBody: Phaser.GameObjects.Zone | null = null;
        for (const child of this.obstacles.getChildren()) {
          const zone = child as Phaser.GameObjects.Zone;
          const body = zone.body as Phaser.Physics.Arcade.StaticBody;
          if (!body) continue;
          const bx1 = body.x;
          const by1 = body.y;
          const bx2 = bx1 + body.width;
          const by2 = by1 + body.height;
          // Check overlap and body is small (< 2 tiles) — must be the dedicated fence collision
          if (bx1 < tileX2 && bx2 > tileX1 && by1 < tileY2 && by2 > tileY1 &&
              body.width < 64 && body.height < 64) {
            matchedBody = zone;
            break;
          }
        }

        return { tileX: tx, tileY: ty, layers, body: matchedBody, chopped: false };
      });
    }

    // Fence border + tree walls removed — perimeter handled by Tiled map tiles

    // A* pathfinding grid — built from collision rects + polygons
    this.pathfinder = new Pathfinder(ENDICOTT_MAP_W, ENDICOTT_MAP_H, collisionRects, collisionPolygons);

    // Starting room chest + door — positions read from Tiled interactables after door loop

    // Purchasable doors — read from Tiled interactables layer
    this.doors = [];
    const interactLayer = map.getObjectLayer("interactables");
    if (interactLayer) {
      for (const obj of interactLayer.objects) {
        if ((obj.type === "door" || (obj as any).type === "door" || (obj as any).class === "door") && obj.name !== "starting_door") {
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

    // All doors: uniform price from balance. Locked states come from Tiled.
    for (const door of this.doors) {
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
          sprite.setPipeline("Light2D");
          this.generator = { sprite, x: cx, y: cy };
        } else if (objType === "chest" && obj.name !== "starting_chest") {
          const label = props?.find((p: any) => p.name === "label")?.value ?? "Chest";
          // Remove the Tiled visual tile so we don't get a double sprite
          const chestTileX = Math.floor(obj.x! / 32);
          const chestTileY = Math.floor(obj.y! / 32);
          for (const layer of [this.propsLowLayer, this.propsMidLayer, this.propsIndoorLayer]) {
            layer?.removeTileAt(chestTileX, chestTileY);
          }
          const sprite = this.add.sprite(cx, cy, "chest", 0).setScale(0.5).setDepth(2);
          sprite.setPipeline("Light2D");
          this.lootChests.push({ x: cx, y: cy, label, opened: false, sprite });
        } else if (["med_desk", "ammo_desk", "equipment_desk"].includes(obj.name || "")) {
          this.rudysDesks.push({ name: obj.name!, x: cx, y: cy, stocked: true });
        } else if (objType === "car") {
          this.cars.push({ name: obj.name!, x: cx, y: cy, opened: false, hasLoot: false });
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
          sprite.setPipeline("Light2D");
          this.machines.push({ machineType, label, cost, x: cx, y: cy, sprite, purchased: false });
        }
      }
    }

    // Car loot randomization — 1 random car gets shotgun, 2 get alarms
    if (this.cars.length > 0) {
      const alarmKeys = ["sfx-car-alarm-horn-1", "sfx-car-alarm-horn-2", "sfx-car-alarm-horn-3"];
      // Fisher-Yates shuffle for unbiased randomization
      const lootIdx = Math.floor(Math.random() * this.cars.length);
      this.cars[lootIdx].hasLoot = true;
      for (let i = 0; i < this.cars.length; i++) {
        if (i === lootIdx) continue;
        this.cars[i].alarmKey = alarmKeys[Math.floor(Math.random() * alarmKeys.length)];
      }
    }

    // Starting room door — read from Tiled interactables
    if (interactLayer) {
      for (const obj of interactLayer.objects) {
        if (obj.name === "starting_door") {
          const w = obj.width || 32;
          const h = obj.height || 64;
          const cx = obj.x! + w / 2;
          const cy = obj.y! + h / 2;
          this.startDoorX = cx;
          this.startDoorY = cy;
          this.startDoorW = w;
          this.startDoorH = h;
          // Create collision zone blocking the doorway
          this.startingDoorBody = this.add.zone(cx, cy, w, h).setOrigin(0.5);
          this.physics.add.existing(this.startingDoorBody, true);
          this.obstacles.add(this.startingDoorBody);
          // Save tile GIDs so we can restore them when sealing the room
          const leftCol = Math.floor(obj.x! / 32);
          const topRow = Math.floor(obj.y! / 32);
          const rightCol = Math.ceil((obj.x! + w) / 32);
          const bottomRow = Math.ceil((obj.y! + h) / 32);
          const layerMap: [string, Phaser.Tilemaps.TilemapLayer | undefined][] = [
            ["walls_base", this.wallsBaseLayer],
            ["walls_top", this.wallsTopLayer],
          ];
          for (let row = topRow; row < bottomRow; row++) {
            for (let col = leftCol; col < rightCol; col++) {
              for (const [, layer] of layerMap) {
                const tile = layer?.getTileAt(col, row);
                if (tile) this.startingDoorSavedTiles.push({ col, row, gid: tile.index });
              }
            }
          }
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
    this.player.setPipeline("Light2D");

    // RPG Leveling system — level-ups are queued and shown during intermission
    this.levelingSystem = new LevelingSystem();
    this.levelingSystem.onLevelUp = (level, options) => {
      this.pendingLevelUps.push({ level, options });
    };

    // Camera (1080p — wider view than 540p at same zoom)
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setZoom(4.0);
    this.cameras.main.setBounds(0, 0, ENDICOTT_MAP_W, ENDICOTT_MAP_H);
    this.cameras.main.setBackgroundColor(0x000000);
    this.cameras.main.setRoundPixels(true);

    // Minimap — bottom-right corner
    const mmSize = 160;
    const mmPadding = 12;
    const { width: screenW, height: screenH } = this.cameras.main;
    const mmX = screenW - mmSize - mmPadding;
    const mmY = screenH - mmSize - mmPadding;
    this.minimap = this.cameras.add(mmX, mmY, mmSize, mmSize);
    this.minimap.setZoom(mmSize / ENDICOTT_MAP_W * 5);
    this.minimap.setBounds(0, 0, ENDICOTT_MAP_W, ENDICOTT_MAP_H);
    this.minimap.setBackgroundColor(0x0a0a14);
    this.minimap.setName("minimap");

    // Square minimap — no mask needed

    // Push minimap position to React for border rendering
    hudState.update({ minimapX: mmX, minimapY: mmY, minimapSize: mmSize });

    // Player indicator dot for minimap (large enough to see at minimap zoom)
    this.minimapDot = this.add.graphics();
    this.minimapDot.setDepth(160);
    // Main camera shouldn't render the dot (it's only for minimap)
    this.cameras.main.ignore(this.minimapDot);

    // Room visibility occluder — blacks out areas outside the player's current room
    this.roomOccluder = this.add.renderTexture(0, 0, ENDICOTT_MAP_W, ENDICOTT_MAP_H);
    this.roomOccluder.setOrigin(0, 0).setDepth(60).setVisible(false);
    this.currentZoneName = null;

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
        if (this.axePickupActive) {
          this.dismissAxePickup();
          return;
        }
        if (this.kyleIntroActive) return; // React KyleDialogue handles Space
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
        if (this.shopOpen) {
          this.closeShop();
          return;
        }
        if (!this.shopOpen) this.meleeAttack(); // Space always punches
      });

      // F key: toggle flashlight
      const fKey = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.F
      );
      fKey.on("down", () => {
        if (this.gameOver || this.paused || this.shopOpen) return;
        if (this.scaryboiIntroActive || this.masonCutsceneActive || this.kyleIntroActive) return;
        this.flashlightUserOn = !this.flashlightUserOn;
        hudState.update({ flashlightOn: this.flashlightUserOn });
      });

      // Q: ability
      const qKey = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.Q
      );
      qKey.on("down", () => {
        if (!this.gameOver && !this.paused && !this.shopOpen) this.useAbility();
      });

      // 1-4: consumable hotbar (tap = use, hold = grenade aim if grenade)
      const consumableKeys = [
        Phaser.Input.Keyboard.KeyCodes.ONE,
        Phaser.Input.Keyboard.KeyCodes.TWO,
        Phaser.Input.Keyboard.KeyCodes.THREE,
        Phaser.Input.Keyboard.KeyCodes.FOUR,
      ];
      consumableKeys.forEach((code, idx) => {
        const key = this.input.keyboard!.addKey(code);
        key.on("down", () => {
          if (this.gameOver || this.paused || this.shopOpen || this.scaryboiIntroActive || this.masonCutsceneActive || this.kyleIntroActive) return;
          const type = this.consumableSlotAssignments[idx];
          if (!type || this.getConsumableCount(type) <= 0) return;
          if (type === "grenade") {
            // Start grenade hold (same as G key down)
            if (this.grenadeThrowing) return;
            this.grenadeKeyDown = true;
            this.grenadeKeyDownTime = this.time.now;
            this.grenadeAiming = false;
          } else {
            this.useConsumableSlot(idx);
          }
        });
        key.on("up", () => {
          const type = this.consumableSlotAssignments[idx];
          if (type === "grenade" && this.grenadeKeyDown) {
            // Release grenade (same as G key up)
            this.grenadeKeyDown = false;
            this.grenadeAiming = false;
            this.hideGrenadeAim();
            if (this.grenadeCount > 0 && !this.grenadeThrowing) {
              this.throwGrenade();
              this.consumableActiveFlash = idx;
              this.time.delayedCall(300, () => { if (this.consumableActiveFlash === idx) this.consumableActiveFlash = -1; });
            }
          }
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
        if (this.gameOver || this.paused || this.shopOpen || this.grenadeThrowing || this.scaryboiIntroActive || this.masonCutsceneActive || this.kyleIntroActive) return;
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
      if (this.gameOver || this.paused || this.shopOpen || this.scaryboiIntroActive || this.masonCutsceneActive || this.kyleIntroActive) return;
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
        // ESC skips active cutscenes
        if (this.kyleIntroActive) { this.skipKyleIntroCutscene(); return; }
        if (this.scaryboiIntroActive) { this.skipScaryboiCutscene(); return; }
        if (this.masonCutsceneActive) { this.skipMasonCutscene(); return; }
        if (this.shopOpen) { this.closeShop(); return; }
        if (this.inventoryOpen) { this.dismissInventory(); return; }
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
        if (this.gameOver || this.paused || this.scaryboiIntroActive || this.masonCutsceneActive || this.axePickupActive || this.inventoryOpen) return;
        if (this.shopOpen) {
          this.closeShop();
        } else if (this.devMode) {
          this.openShop(); // dev mode can open shop anywhere
        }
      });

      // E key: interact if near something, otherwise cycle weapons + fists
      const eKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
      eKey.on("down", () => {
        if (this.gameOver || this.paused || this.shopOpen) return;
        if (this.trySilentKill()) return;
        if (this.trySearchLog()) return;
        if (this.tryChopFence()) return;
        if (this.tryLootChest()) return;
        if (this.tryStartingDoor()) return;
        if (this.tryInteractGenerator()) return;
        if (this.tryBuyMachine()) return;
        if (this.tryBuyNearbyDoor()) return;
        if (this.tryDeskInteract()) return;
        if (this.tryCarInteract()) return;
        if (this.tryInteractKyle()) return;
        if (this.tryTeleport()) return;
        this.cycleWeaponSlot();
      });

      // SPACE to skip/ready up during intermission (overrides melee during intermission)
      // (melee SPACE handler above already checks shopOpen but not intermission —
      //  we handle priority in the melee handler by also checking wave state)

      // V key to toggle barricade orientation
      const vKey = this.input.keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.V
      );
      vKey.on("down", () => {
        if (this.gameOver || this.paused || this.scaryboiIntroActive || this.masonCutsceneActive || this.axePickupActive || this.inventoryOpen) return;
        if (this.activeSlot !== this.barricadeSlot) return; // only when barricade is selected
        this.barricadeVertical = !this.barricadeVertical;
        const orient = this.barricadeVertical ? "VERTICAL" : "HORIZONTAL";
        this.showWeaponMessage(orient, "#44dd44");
      });

      // TAB key — skip intermission
      const tabKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);
      tabKey.on("down", (event: KeyboardEvent) => {
        event?.preventDefault?.();
        if (this.intermissionTimer > 0 && !this.shopOpen && !this.audio.roomTone?.isPlaying) {
          this.skipIntermission();
        }
      });

      // I key to toggle inventory
      const iKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.I);
      iKey.on("down", () => {
        if (this.gameOver) return;
        if (this.inventoryOpen) {
          this.dismissInventory();
        } else {
          this.openInventory();
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
            this.hasAxe = true;
            this.showWeaponMessage("DEV MODE ON", "#ff4444");
          } else {
            this.player.invincible = false;
            hudState.update({ devPanelOpen: false, devSpawningDisabled: false });
            this.zoneSpawnManager.spawningDisabled = false;
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
          this.showWeaponMessage("DEV: KILLED ALL", "#ff4444");
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
            case "toggleSpawning":
              this.zoneSpawnManager.spawningDisabled = !this.zoneSpawnManager.spawningDisabled;
              hudState.update({ devSpawningDisabled: this.zoneSpawnManager.spawningDisabled });
              this.showWeaponMessage(
                this.zoneSpawnManager.spawningDisabled ? "DEV: SPAWNING OFF" : "DEV: SPAWNING ON",
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
              this.showWeaponMessage("DEV: KILLED ALL", "#ff4444");
              break;
            case "spawnEnemy": {
              const { type, count } = payload as { type: string; count: number };
              this.zoneSpawnManager.devSpawnEnemy(type as any, count);
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
    if (this.roomOccluder) this.minimap.ignore(this.roomOccluder);

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

    // ─── Read zone data from Tiled for spawn logic ───
    const navLayer = map.getObjectLayer("zones_navigation");
    const gatedZones: GatedZone[] = [];
    if (navLayer) {
      for (const obj of navLayer.objects) {
        const cls = ((obj as any).type || (obj as any).class || "").toLowerCase();
        const props = (obj as any).properties as { name: string; value: any }[] | undefined;
        if (cls === "exclusion_zone") {
          this.exclusionZones.push({ x: obj.x!, y: obj.y!, w: obj.width!, h: obj.height! });
        } else if (cls === "gated_zone") {
          const gate = props?.find(p => p.name === "gate")?.value ?? "";
          gatedZones.push({ label: gate, x: obj.x!, y: obj.y!, w: obj.width!, h: obj.height! });
        }
        if (obj.name === "rave_crowd") {
          this.raveCrowdRect = { x: obj.x!, y: obj.y!, w: obj.width!, h: obj.height! };
        }
      }
    }

    // Read room polygons + entrance points from Tiled zones layer for anti-camp
    const zonesLayer = map.getObjectLayer("zones");
    const roomBounds = new Map<string, { x: number; y: number; w: number; h: number }>();
    const entrancePoints = new Map<string, { x: number; y: number }[]>();
    if (zonesLayer) {
      for (const obj of zonesLayer.objects) {
        if ((obj as any).polygon) {
          const pts = ((obj as any).polygon as { x: number; y: number }[]).map(p => ({ x: obj.x! + p.x, y: obj.y! + p.y }));
          const xs = pts.map(p => p.x);
          const ys = pts.map(p => p.y);
          roomBounds.set(obj.name, { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) });
          this.visibilityZones.push({ name: obj.name, points: pts });
        } else if (obj.name.startsWith("entrance_")) {
          const roomName = obj.name.replace("entrance_", "");
          if (!entrancePoints.has(roomName)) entrancePoints.set(roomName, []);
          entrancePoints.get(roomName)!.push({ x: obj.x!, y: obj.y! });
        }
      }
    }
    const roomZones: RoomZone[] = [];
    for (const [name, bounds] of roomBounds) {
      const entrances = entrancePoints.get(name);
      if (entrances) roomZones.push({ label: name, ...bounds, entrances });
    }

    // Read trigger zones + teleport points from Tiled
    const triggersLayer = map.getObjectLayer("zones_triggers");
    if (triggersLayer) {
      for (const obj of triggersLayer.objects) {
        const props = (obj as any).properties as { name: string; value: any }[] | undefined;
        const objType = props?.find(p => p.name === "type")?.value ?? "";

        if (objType === "teleport") {
          const target = props?.find(p => p.name === "target")?.value ?? "";
          // Skip unfinished teleports (no matching interior target yet)
          const disabled = ["teleport_crackhouse_exterior", "teleport_project_exterior"];
          if (target && !disabled.includes(obj.name!)) {
            this.teleportPoints.push({ name: obj.name!, target, x: obj.x!, y: obj.y! });
          }
        } else if (obj.name === "kyle_intro") {
          this.kyleTriggerRect = { x: obj.x!, y: obj.y!, w: obj.width!, h: obj.height! };
        } else if (obj.name === "kyle_npc_rudys") {
          this.kyleShopPos = { x: obj.x!, y: obj.y! };
        } else if (obj.name?.startsWith("kyle_cs_")) {
          // Waypoint paths: kyle_cs_player0, kyle_cs_zombie1, kyle_cs_kyle2, etc.
          const match = obj.name.match(/^kyle_cs_(player|zombie|kyle)(\d+)$/);
          if (match) {
            const actor = match[1];
            const idx = parseInt(match[2]);
            const pt = { x: obj.x!, y: obj.y!, _idx: idx };
            if (actor === "player") (this.kyleCSPlayerPath as any).push(pt);
            else if (actor === "zombie") (this.kyleCSZombiePath as any).push(pt);
            else if (actor === "kyle") (this.kyleCSKylePath as any).push(pt);
          }
        } else {
          const encounter = props?.find(p => p.name === "encounter")?.value ?? "";
          const requires = props?.find(p => p.name === "requires")?.value ?? "";
          this.scaryboiTriggerZones.push({ encounter, requires, x: obj.x!, y: obj.y!, w: obj.width!, h: obj.height! });
        }
      }
    }

    // Sort kyle cutscene waypoints by index
    const sortWaypoints = (arr: any[]) => {
      arr.sort((a: any, b: any) => a._idx - b._idx);
      arr.forEach((p: any) => delete p._idx);
    };
    sortWaypoints(this.kyleCSPlayerPath);
    sortWaypoints(this.kyleCSZombiePath);
    sortWaypoints(this.kyleCSKylePath);

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
    this.waveManager.setZoneData({ exclusionZones: this.exclusionZones, gatedZones, roomZones });

    // ─── Zone Spawn Manager (replaces waves) ───
    const isDoorOpenFn = (label: string) => {
      const door = this.doors.find((d) => d.label === label);
      if (!door) return !isPublicBuild();
      return door.paid || door.broken;
    };
    this.zoneSpawnManager = new ZoneSpawnManager({
      scene: this,
      enemies: this.enemies,
      getPlayerPos: () => ({ x: this.player.x, y: this.player.y }),
      isCollisionFree,
      isFieldTile,
      isDoorOpen: isDoorOpenFn,
    });
    // Read spawn_zones from Tiled (if they exist), otherwise generate defaults
    const spawnZonesLayer = map.getObjectLayer("spawn_zones");
    const spawnZonesData: { name: string; tier: number; x: number; y: number; w: number; h: number }[] = [];
    if (spawnZonesLayer) {
      for (const obj of spawnZonesLayer.objects) {
        const props = (obj as any).properties as { name: string; value: any }[] | undefined;
        const tier = props?.find(p => p.name === "tier")?.value ?? 1;
        spawnZonesData.push({ name: obj.name!, tier, x: obj.x!, y: obj.y!, w: obj.width!, h: obj.height! });
      }
    }
    this.zoneSpawnManager.setZoneData({ exclusionZones: this.exclusionZones, gatedZones, spawnZones: spawnZonesData });
    this.zoneSpawnManager.generateDefaultZones(); // fills in defaults if no Tiled spawn_zones

    // Zone spawn callbacks (replaces WaveManager callbacks)
    this.zoneSpawnManager.onBossFlee = () => {
      const enc = this.zoneSpawnManager.getActiveEncounter();
      if (enc === "library") {
        this.completeObjective("explore_library");
        this.time.delayedCall(600, () => this.audio.playSound("sfx-scaryboi-flee-south", 0.5));
      } else {
        this.time.delayedCall(600, () => this.audio.playSound("sfx-scaryboi-flee-gate1", 0.5));
      }
      this.audio.playSound("sfx-church-bell", 0.3);
      this.audio.stopTheme("themeIntense", 2000);
      this.audio.startTheme("theme-main", "themeMain", 0.12, true, 2500);
    };
    this.zoneSpawnManager.onEncounterTrigger = (enc) => {
      this.spawnScaryboiEncounter(enc);
    };
    this.zoneSpawnManager.onBossKilled = () => {
      const boss = this.zoneSpawnManager.bossEnemy;
      if (boss) this.spawnRpgPickup(boss.x, boss.y);
      const estateDoor = this.doors.find(d => d.label === "gate2");
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
      this.completeObjective("defeat_scaryboi");
      this.time.delayedCall(400, () => this.audio.playSound("sfx-scaryboi-death", 0.5));
      this.audio.stopTheme("themeIntense", 2000);
      this.audio.startTheme("theme-main", "themeMain", 0.12, true, 2500);
      this.zoneSpawnManager.spawningDisabled = true;
      const lairZone = this.visibilityZones.find(z => z.name === "scaryboi_lair");
      this.enemies.getChildren().forEach((obj) => {
        const e = obj as Enemy;
        if (!e.active || e.dying) return;
        if (e.raveZombie) return;
        if (lairZone && this.pointInPolygon(e.x, e.y, lairZone.points)) return;
        e.takeDamage(999999);
        if (e.active) e.destroy();
      });

      // Objective updates automatically via getCurrentObjective() chain
      hudState.update({ currentObjective: this.getCurrentObjective() });
    };

    hudState.registerScaryboiIntroAction((action: string) => {
      if (action === "skip") {
        this.skipScaryboiCutscene();
      } else {
        this.dismissScaryboiIntro();
      }
    });

    // Mason dialogue callback — advance/dismiss or skip cutscene
    hudState.registerMasonDialogueAction((action: string) => {
      if (action === "skip") {
        this.skipMasonCutscene();
      } else {
        this.dismissMasonDialogue();
      }
    });

    // Kyle dialogue callback — advance or skip cutscene
    hudState.registerKyleDialogueAction((action: string) => {
      if (action === "skip") {
        this.skipKyleIntroCutscene();
      } else {
        this.advanceKyleDialogue();
      }
    });

    // (Wave start confirm removed — replaced by 3-second countdown after shop close)

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

    // Always process pathfinding queue — even during cutscenes — so callbacks
    // don't pile up and leave enemies with stale/empty paths after resume
    this.pathfinder.calculate();

    // Room visibility: check which zone the player is in and update occluder
    this.updateRoomVisibility();

    // Update flashlight — disable indoors or when user toggled off
    {
      const indoors = this.currentZoneName !== null || !!this.audio.roomTone?.isPlaying;
      const shouldShow = this.flashlightUserOn && !indoors;
      if (!shouldShow && this.flashlightActive) {
        this.flashlightActive = false;
        if (this.playerLight) this.lights.removeLight(this.playerLight);
        if (this.playerConeLight) this.lights.removeLight(this.playerConeLight);
        if (this.playerConeFar) this.lights.removeLight(this.playerConeFar);
        (this.playerLight as any) = null;
        (this.playerConeLight as any) = null;
        (this.playerConeFar as any) = null;
      } else if (shouldShow && !this.flashlightActive) {
        this.flashlightActive = true;
        this.playerLight = this.lights.addLight(this.player.x, this.player.y, 120, 0xffe08a, 0.25);
        this.playerConeLight = this.lights.addLight(this.player.x, this.player.y, 110, 0xffe08a, 0.7);
        this.playerConeFar = this.lights.addLight(this.player.x, this.player.y, 140, 0xffe08a, 0.35);
      }
      if (this.flashlightActive && this.playerLight) {
        this.playerLight.setPosition(this.player.x, this.player.y);
        let dx = 0, dy = 0;
        switch (this.player.facing) {
          case "up": dy = -1; break;
          case "down": dy = 1; break;
          case "left": dx = -1; break;
          case "right": dx = 1; break;
        }
        this.playerConeLight.setPosition(
          this.player.x + dx * 70,
          this.player.y + dy * 70
        );
        this.playerConeFar.setPosition(
          this.player.x + dx * 140,
          this.player.y + dy * 140
        );
      }
    }

    // Enemy visibility — fade based on distance from light sources
    this.updateEnemyVisibility();

    // Wave start countdown (runs regardless of menu state)
    this.updateWaveStartTimer(delta);

    // Kyle intro cutscene runs its own update loop — must tick before the early-return guard
    if (this.kyleIntroActive) {
      this.updateKyleIntroCutscene(delta);
      hudState.update({
        hudVisible: true,
        cutsceneActive: true,
        health: this.player.stats.health,
        maxHealth: this.player.stats.maxHealth,
      });
      return;
    }

    // Update intermission timer (ticks even while inside Rudy's / shopping / level-up)
    if (!this.gameOver && !this.paused) {
      this.updateIntermissionTimer(delta);
    }

    if (this.gameOver || this.paused || this.scaryboiIntroActive || this.masonCutsceneActive || this.axePickupActive || this.inventoryOpen) {
      if (this.lastPromptJson !== "") { this.lastPromptJson = ""; hudState.update({ interactionPrompt: null }); }
      return;
    }

    // Freeze gameplay while shop, level-up, or dev panel is open
    const devPanelOpen = this.devMode && hudState.getField("devPanelOpen");
    const menuOpen = this.shopOpen || this.levelUpActive || devPanelOpen;
    if (menuOpen) {
      if (!this.physics.world.isPaused) {
        this.player.body?.setVelocity(0, 0);
        this.player.anims?.pause();
        this.physics.world.pause();
      }
      if (this.lastPromptJson !== "") { this.lastPromptJson = ""; hudState.update({ interactionPrompt: null }); }
      return;
    } else if (this.physics.world.isPaused) {
      this.physics.world.resume();
      this.player.anims?.resume();
    }
    // Post-cutscene immunity countdown
    if (this.postCutsceneImmunity > 0) this.postCutsceneImmunity -= delta;

    // Sync flashlight + weapon state to Player for animation selection
    this.player.flashlightOn = this.flashlightUserOn;
    this.player.equippedWeapon = this.hasWeapon ? this.activeWeapon : null;

    this.player.update();
    this.zoneSpawnManager.update(delta);
    this.timeSurvived += delta;

    // Detection pass — check if unaware enemies can see/hear the player
    this.updateEnemyDetection(delta);

    // Door proximity prompts
    this.updateStartingRoomPrompts();
    this.updateLootChestPrompts();
    this.updateLogPrompt();
    this.updateFencePrompts();
    this.updateDoorPrompts();
    this.updateMachinePrompts();
    this.updateDeskPrompts();
    this.updateCarPrompts();
    this.updateKyleShopPrompt();
    this.updateTeleportPrompts();
    this.updateSilentKillPrompt();
    this.pushPromptToHUD();

    // Post-SCARYBOI: when lair is cleared, start muffled rave music
    if (this.zoneSpawnManager.spawningDisabled && !this.masonTriggered && !this.audio.masonRaveMusic) {
      const aliveEnemies = this.enemies.getChildren().filter(e => (e as Enemy).active && !(e as Enemy).dying);
      if (aliveEnemies.length === 0) {
        this.audio.startMuffledRaveMusic();
      }
    }

    // Update muffled music filter based on player position (lair → stairs → club)
    if (this.audio.masonRaveMusic?.isPlaying && this.audio.masonRaveMusicFilter) {
      this.audio.updateRaveMusicFilter(this.player.y);
    }

    // Mason aura light — follows his position
    if (this.masonAuraLight && this.masonEnemy?.active) {
      this.masonAuraLight.x = this.masonEnemy.x;
      this.masonAuraLight.y = this.masonEnemy.y;
    }

    // Mason estate trigger — player reaches top of stairs
    if (!this.masonTriggered) {
      const ptx = Math.floor(this.player.x / 32);
      const pty = Math.floor(this.player.y / 32);
      if (
        (ptx === 39 && pty === 11) ||
        (ptx === 39 && pty === 12)
      ) {
        this.masonTriggered = true;
        // Fade to black → kill all zombies → spawn rave → fade in
        this.cameras.main.fadeOut(500, 0, 0, 0);
        this.cameras.main.once("camerafadeoutcomplete", () => {
          // Kill all wave zombies
          this.enemies.getChildren().forEach((e) => {
            if (e.active) {
              (e as Enemy).takeDamage(999999);
              if (e.active) e.destroy();
            }
          });
          this.zoneSpawnManager.spawningDisabled = true;

          // Spawn rave (mason + dancing zombies)
          this.triggerMasonRave();

          // Brief blackout hold, then fade back in
          this.time.delayedCall(500, () => {
            this.cameras.main.fadeIn(500, 0, 0, 0);
          });
        });
      }
    }

    // Mason rave phase checks — cutscene1 triggers when first rave zombie is killed
    if (this.masonRavePhase === "rave_setup") {
      const anyKilled = this.masonRaveZombies.some(z => !z.active || z.dying);
      if (anyKilled) {
        this.completeObjective("crash_rave");
        this.triggerMasonCutscene1();
      }
    }
    if (this.masonRavePhase === "zombie_fight") {
      const allDead = this.masonRaveZombies.every(z => !z.active || z.dying);
      if (allDead) this.triggerDramaticPause();
    }
    if (this.masonRavePhase === "dramatic_pause" && this.player.y <= 400) {
      this.triggerMasonCutscene2();
    }


    // Kyle intro cutscene — update state machine
    this.updateKyleIntroCutscene(delta);
    this.updateKylePacing();

    // Kyle intro trigger — player enters rect near Rudy's
    if (!this.kyleIntroTriggered && this.kyleTriggerRect.w > 0) {
      const px = this.player.x;
      const py = this.player.y;
      const kr = this.kyleTriggerRect;
      if (px >= kr.x && px <= kr.x + kr.w && py >= kr.y && py <= kr.y + kr.h) {
        this.triggerKyleIntroCutscene();
      }
    }

    // SCARYBOI proximity crossfade — fade theme_main → theme_creepybass as player approaches
    if (!this.zoneSpawnManager.isScaryboiDefeated() && !this.zoneSpawnManager.bossActive && !this.scaryboiIntroActive) {
      const FADE_DIST = 200; // ~6 tiles
      let nearZone = false;
      for (const tz of this.scaryboiTriggerZones) {
        const enc = tz.encounter as "gate" | "library" | "estate";
        if (enc === "gate" && this.scaryboiGateTriggered) continue;
        if (enc === "library" && this.scaryboiLibraryTriggered) continue;
        if (enc === "estate" && this.scaryboiEstateTriggered) continue;
        // Distance to nearest edge of zone rectangle (works for indoor zones too)
        const nearX = Phaser.Math.Clamp(this.player.x, tz.x, tz.x + tz.w);
        const nearY = Phaser.Math.Clamp(this.player.y, tz.y, tz.y + tz.h);
        const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, nearX, nearY);
        if (dist < FADE_DIST) { nearZone = true; break; }
      }
      if (nearZone && !this.scaryboiProximityFade) {
        this.scaryboiProximityFade = true;
        this.audio.stopTheme("themeMain", 2000);
        this.audio.stopTheme("themeIntense", 2000);
        this.audio.startTheme("theme-creepybass", "themeCreepybass", 0.2, false, 2000);
      } else if (!nearZone && this.scaryboiProximityFade) {
        this.scaryboiProximityFade = false;
        this.audio.stopTheme("themeCreepybass", 2000);
        // Restart whatever theme should be playing
        this.audio.updateThemeMusic("active", 1, this.gameOver);
      }
    }

    // SCARYBOI location-based encounter triggers — rectangles from Tiled zones_triggers
    if (!this.zoneSpawnManager.isScaryboiDefeated() && !this.zoneSpawnManager.bossActive) {
      const px = this.player.x;
      const py = this.player.y;
      for (const tz of this.scaryboiTriggerZones) {
        if (px < tz.x || px > tz.x + tz.w || py < tz.y || py > tz.y + tz.h) continue;
        const enc = tz.encounter as "gate" | "library" | "estate";
        // Check if already triggered
        if (enc === "gate" && this.scaryboiGateTriggered) continue;
        if (enc === "library" && this.scaryboiLibraryTriggered) continue;
        if (enc === "estate" && this.scaryboiEstateTriggered) continue;
        // Check door requirement
        if (tz.requires) {
          const door = this.doors.find(d => d.label === tz.requires);
          if (door && !door.opened && !door.broken) continue;
        }
        // Estate special check — both other encounters must be done
        if (enc === "estate" && this.zoneSpawnManager.isEstateLocked()) continue;
        this.zoneSpawnManager.triggerEncounter(enc);
      }
    }

    // Roof fade — hide roof when player is under it
    this.updateRoofVisibility();
    this.updateInteriorDarkness();
    this.updateEnemyIndoorVisibility();
    this.updateCanopyFade();

    // Barricade placement ghost (disabled — barricades use instant-place via hotbar now)
    const showGhost = false;
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
      this.audio.playFootstep(this.player.x, this.player.y, this.pathsLayer, !!this.audio.roomTone?.isPlaying);
    }

    // Ambient zombie groans
    this.audio.tryPlayZombieGroan();

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
      this.audio.playSound("sfx-player-panting", 0.3);
      this.audio.playSound("sfx-burnout-dan", 0.25);
    }
    this.wasBurnedOut = this.player.burnedOut;

    // Heartbeat loop when low HP (≤25%)
    const hpPct = this.player.stats.health / this.player.stats.maxHealth;
    this.audio.updateHeartbeat(hpPct);

    this.updateHUD();
  }

  // ------- Audio Helpers -------

  private wasBurnedOut = false;

  /** Play a SCARYBOI taunt after he deals damage. Character-specific for Muff, generic otherwise.
   *  Maniacal laugh plays very rarely. Cooldown prevents spam. */
  private maybePlayScaryboiTaunt(forcePlay = false) {
    const now = this.time.now;
    const cooldown = forcePlay ? 0 : 12000; // 12s between taunts normally, 0 on kill
    if (now - this.audio.lastScaryboiTauntTime < cooldown) return;

    // 20% chance on damage, 100% on kill (forcePlay)
    if (!forcePlay && Math.random() > 0.2) return;

    this.audio.lastScaryboiTauntTime = now;

    // Very rare maniacal laugh (5% chance, separate from taunts)
    if (Math.random() < 0.05) {
      this.time.delayedCall(300, () => this.audio.playSound("sfx-scaryboi-laugh", 0.45));
      return;
    }

    // Character-specific taunts for Muff (Jason)
    if (this.characterDef.id === "jason") {
      const jasonTaunts = ["sfx-scaryboi-taunt-jason1", "sfx-scaryboi-taunt-jason2", "sfx-scaryboi-taunt-jason3"];
      const pick = jasonTaunts[Math.floor(Math.random() * jasonTaunts.length)];
      this.time.delayedCall(300, () => this.audio.playSound(pick, 0.45));
      return;
    }

    // Generic taunt for other characters
    this.time.delayedCall(300, () => this.audio.playSound("sfx-scaryboi-taunt-generic1", 0.45));
  }

  /** Play player damage grunt */
  private playPlayerHurt() {
    this.audio.playSound("sfx-player-grunt", 0.35);
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

    // Grenade damage (no wave scaling in zone mode)
    const scaledDamage = damage;

    // Damage all enemies in radius
    this.enemies.getChildren().forEach((obj) => {
      const enemy = obj as Enemy;
      if (!enemy.active || enemy.dying) return;
      const dist = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);
      if (dist <= radius) {
        const dmgMult = 1 - (dist / radius) * 0.5; // damage falloff
        const finalDmg = Math.floor(scaledDamage * dmgMult);
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
    this.audio.playSound("sfx-explosion", 0.5);
  }

  // ------- Hotbar -------

  /** Slot layout: weapons[0]=slot1, weapons[1]=slot2, ..., then barricade, then mine */
  private get barricadeSlot(): number { return this.weapons.length + 1; }
  private get mineSlot(): number { return this.weapons.length + 2; }
  private get bandageSlot(): number { return this.weapons.length + 3; }

  /** Get list of slot indices that currently have items */
  private getAvailableSlots(): number[] {
    // Weapon slots: 1..weapons.length
    const available: number[] = this.weapons.map((_, i) => i + 1);
    if ((this.trapInventory.get("barricade" as TrapType) ?? 0) > 0) available.push(this.barricadeSlot);
    if ((this.trapInventory.get("landmine" as TrapType) ?? 0) > 0) available.push(this.mineSlot);
    if (this.bandageCount > 0) available.push(this.bandageSlot);
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

  /** Cycle between guns only (no fists). E key behavior. */
  private cycleWeaponSlot() {
    if (this.weapons.length <= 1) return; // only one gun, nothing to cycle

    if (this.reloading) {
      this.reloading = false;
      if (this.reloadTimer) { this.reloadTimer.destroy(); this.reloadTimer = null; }
      this.player.stopReload();
    }

    const currentIdx = this.weapons.indexOf(this.activeWeapon);
    const nextIdx = (currentIdx + 1) % this.weapons.length;
    this.selectSlot(nextIdx + 1); // slot = weapon index + 1
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

    const prevSlot = this.activeSlot;
    this.activeSlot = index;

    // Set active weapon when selecting a gun slot
    const weapon = this.getWeaponForSlot(index);
    if (weapon) {
      this.activeWeapon = weapon;
    }
    if (index !== prevSlot) this.audio.playSound("sfx-weapon-switch", 0.3);
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
    } else if (index === this.bandageSlot) {
      name = "BANDAGE";
    }
    this.showWeaponMessage(name, "#44dd44");
  }

  private useActiveSlot() {
    if (this.isWeaponSlot(this.activeSlot)) {
      this.fireWeapon();
    } else if (this.activeSlot === 0) {
      // Fists — no-op for right-click (melee is left-click)
    }
  }

  /** Add a weapon to the inventory (no duplicates) */
  private addWeapon(weaponId: string, ammo: { mag: number; reserve: number }) {
    const bankedReserve = this.weaponAmmo[weaponId]?.reserve ?? 0;
    if (!this.weapons.includes(weaponId)) {
      this.weapons.push(weaponId);
    }
    this.weaponAmmo[weaponId] = { mag: ammo.mag, reserve: ammo.reserve + bankedReserve };
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
        this.audio.playRandomPunch();
      } else {
        // Missed punch — whoosh + grunt
        this.audio.playSound("sfx-whoosh", 0.3);
        if (Math.random() < 0.4) this.audio.playSound("sfx-grunt", 0.25);
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
    this.audio.playRandomEnemyDeath();

    // Mason death — victory!
    if (enemy.enemyType === "mason") {
      // Fade out toxic aura
      if (this.masonAuraLight) {
        const aura = this.masonAuraLight;
        this.masonAuraLight = null;
        this.tweens.add({ targets: aura, intensity: 0, duration: 1000, onComplete: () => this.lights.removeLight(aura) });
      }
      this.completeObjective("defeat_bigbaby");
      this.cleanupClubAtmosphere();
      this.audio.stopRaveMusic();
      // Brief pause, then trigger victory
      this.time.delayedCall(2000, () => this.triggerVictory());
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
    const damage = 450;
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

    this.audio.playSound("sfx-punch1", 0.4);
    this.audio.playSound("sfx-hit-classic", 0.35);
    if (hits > 0) this.audio.playSound("sfx-whoosh", 0.3);
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
    const maxChainTargets = 8; // primary + 8 chains = 9 max kills

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
      this.audio.playSound("sfx-whoosh", 0.3);
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

    this.audio.playSound("sfx-punch1", 0.4);
    this.audio.playSound("sfx-hit-classic", 0.35);
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

    this.audio.playSound("sfx-whoosh", 0.35);
    if (hits > 0) this.audio.playSound("sfx-hit-classic", 0.35);
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

      const maxKills = 9;
      this.enemies.getChildren().forEach((obj) => {
        if (hits >= maxKills) return;
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

      this.audio.playSound("sfx-explosion", 0.4);
      if (hits > 0) this.audio.playSound("sfx-hit-classic", 0.35);
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
        this.audio.playSound("sfx-dryfire", 0.4);
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
      this.audio.playSound("sfx-pistol", 0.4);
    } else if (this.activeWeapon === "shotgun") {
      this.audio.playSound("sfx-shotgun", 0.4);
    } else if (this.activeWeapon === "smg") {
      this.audio.playSound("sfx-smg", 0.3);
    } else if (this.activeWeapon === "rpg") {
      this.audio.playSound("sfx-shotgun", 0.5); // placeholder — reuse shotgun boom
    } else if (this.activeWeapon === "assault_rifle") {
      this.audio.playSound("sfx-smg", 0.35); // placeholder — reuse smg sound
    }

    // Gunfire alerts nearby enemies (detection system) — no extra spawns, just awareness
    this.emitSoundEvent(this.player.x, this.player.y, BALANCE.detection.gunfireSoundRadius);
    this._lastGunfireTime = this.time.now;

    // Muzzle flash
    const flashDist = 20;
    const flashX = this.player.x + Math.cos(angle) * flashDist;
    const flashY = this.player.y + Math.sin(angle) * flashDist;
    const flash = this.add.image(flashX, flashY, "fx-muzzle-flash");
    flash.setDepth(60);
    flash.setRotation(angle);
    flash.setAlpha(0.9);

    // Muzzle flash point light — brief bright burst that illuminates nearby area
    const muzzleLight = this.lights.addLight(flashX, flashY, 200, 0xffcc44, 1.2);
    this.time.delayedCall(60, () => {
      flash.destroy();
      this.lights.removeLight(muzzleLight);
    });

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
            this.audio.playSound("sfx-dryfire", 1.0);
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
        this.audio.playSound("sfx-reload-shotgun", 0.5);
      } else {
        this.audio.playSound("sfx-reload-rifle", 0.5);
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
      this.audio.playSound("sfx-reload-complete", 0.4);
    });
  }



  private showWeaponMessage(msg: string, color: string) {
    const current = hudState.getField("notifications") || [];
    const notification = { id: Date.now() + Math.random(), text: msg, color };
    hudState.update({ notifications: [...current, notification] });
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

    this.audio.playSound("sfx-trap-place", 0.4);
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
        this.audio.playSound("sfx-explosion", 0.4);
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
    // No headshots from melee
    if (weaponKey === "fists") return false;

    const effective = this.levelingSystem.getEffectiveStats(this.characterDef.stats);
    const charCrit = effective.critChance;
    const weaponCrit = BALANCE.crit.weaponCrit[weaponKey as keyof typeof BALANCE.crit.weaponCrit] ?? 0;
    const distCrit = BALANCE.crit.closeCritBonus * (1 - distanceRatio);
    const levelCrit = (this.levelingSystem.level - 1) * BALANCE.crit.critPerLevel;

    const totalCrit = charCrit + weaponCrit + distCrit + levelCrit;
    return Math.random() < totalCrit;
  }

  private showCritEffect(x: number, y: number, _source: "melee" | "ranged" = "ranged") {
    const label = "HEADSHOT";
    const color1 = "#ffdd44";
    const color2 = "#cc8800";

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

    {
      this.audio.playSound("sfx-click", 0.6); // ping on headshot
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
        // Bullet impact thud — 25% chance on non-kill hits
        if (Math.random() < 0.25) {
          this.audio.playSound("sfx-bullet-impact", 0.2);
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

    this.audio.playSound("sfx-explosion", 0.6);
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
      if (this.masonRavePhase === "rave_setup") return; // dancing zombies don't attack during rave vibes
      if (this.postCutsceneImmunity > 0) return; // brief immunity after rave cutscene ends
      if (this.kyleIntroActive) return; // impervious during Kyle intro cutscene

      const now = this.time.now;
      if (now - this.lastDamageTime < 500) return;

      const enemy = enemyObj as Enemy;
      if (enemy.isStunned()) return; // stunned enemies can't attack

      // Per-enemy bite cooldown — same zombie can't chomp repeatedly
      const biteCooldown = BALANCE.enemies.biteCooldownMs ?? 1200;
      if (now - enemy.lastBiteTime < biteCooldown) return;
      enemy.lastBiteTime = now;
      this.lastDamageTime = now;
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
      this.audio.playBiteSound();

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

      // SCARYBOI taunt after dealing damage
      if (enemy.enemyType === "boss") {
        this.maybePlayScaryboiTaunt(false);
      }

      if (this.player.stats.health <= 0) {
        this.player.stats.health = 0;
        this.gameOver = true; // Stop all damage immediately
        // Kill heartbeat immediately on death
        this.audio.stopHeartbeat();
        this.player.body.setVelocity(0, 0);
        // SCARYBOI taunt on kill (guaranteed)
        if (enemy.enemyType === "boss") {
          this.maybePlayScaryboiTaunt(true);
        }
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

    const survivalSeconds = Math.floor(this.timeSurvived / 1000);

    // Stop all theme music, play outro
    this.audio.stopTheme("themeMain", 500);
    this.audio.stopTheme("themeIntense", 500);
    this.audio.stopTheme("themeCreepybass", 500);
    this.audio.startTheme("theme-outro", "themeOutro", 0.3, false, 1500);

    // Push death screen to React — include health=0 so the bar visually empties
    this.game.canvas.style.pointerEvents = "none"; // Let React handle clicks during game over
    hudState.update({
      health: 0,
      gameOver: true,
      gameOverPhase: "death",
      gameOverWave: survivalSeconds, // repurposed: shows time survived
      gameOverKills: this.kills,
      gameOverCharName: this.characterDef.name,
    });

    // After delay, check if score qualifies for leaderboard
    this.time.delayedCall(2000, () => {
      this.checkLeaderboardQualification(survivalSeconds);
    });
  }

  private triggerVictory() {
    this.gameOver = true;

    // Stop all theme music, play outro
    this.audio.stopTheme("themeMain", 500);
    this.audio.stopTheme("themeIntense", 500);
    this.audio.stopTheme("themeCreepybass", 500);
    this.audio.startTheme("theme-outro", "themeOutro", 0.3, false, 1500);

    // Freeze all remaining enemies
    this.enemies.getChildren().forEach((obj) => {
      const e = obj as Enemy;
      e.body?.setVelocity(0, 0);
    });

    this.game.canvas.style.pointerEvents = "none";
    hudState.update({
      gameOver: true,
      gameOverPhase: "victory",
      gameOverWave: Math.floor(this.timeSurvived / 1000), // repurposed: time survived
      gameOverKills: this.kills,
      gameOverCharName: this.characterDef.name,
    });

    // After victory message, go to leaderboard
    this.time.delayedCall(5000, () => {
      this.checkLeaderboardQualification(Math.floor(this.timeSurvived / 1000));
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
    hudState.registerGameAction((action: string) => {
      if (action === "dismissAxePickup") this.dismissAxePickup();
    });

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
          // Opens the inventory/stats screen from pause menu
          this.openInventory();
          break;
        case "closeStats":
          this.dismissInventory();
          break;
        case "openSettings":
          this.settingsOpen = true;
          hudState.update({ settingsOpen: true });
          break;
        case "closeSettings":
          this.settingsOpen = false;
          hudState.update({ settingsOpen: false });
          break;
        case "setVolume":
          this.audio.setSfxVolume(payload as number);
          break;
        case "setMusicVolume":
          this.audio.setMusicVolume(payload as number);
          break;
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

    // Inventory actions from React
    hudState.registerInventoryAction((action: string) => {
      if (action === "close") this.dismissInventory();
    });

    // Game-over actions from React
    hudState.registerGameOverAction((action: string, payload?: any) => {
      if (action === "submitName") {
        this.submitLeaderboardScore(payload as string, this.kills, Math.floor(this.timeSurvived / 1000), this.characterDef.id);
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
    first_aid: "/assets/sprites/items/bandage.png",
    shotgun: "/assets/sprites/items/shotgun.png",
    smg: "/assets/sprites/items/smg.png",
    ammo_light: "/assets/sprites/items/ammo-light.png",
    ammo_shotgun: "/assets/sprites/items/ammo-shotgun.png",
    ammo_heavy: "/assets/sprites/items/ammo-heavy.png",
    landmine: "/assets/sprites/items/landmine.png",
    grenade: "/assets/sprites/items/grenade.png",
  };

  private initLandmarkLights(map: Phaser.Tilemaps.Tilemap) {
    const layer = map.getObjectLayer("landmarks");
    if (!layer) return;

    const neonLetterControls: { setOn: (on: boolean) => void; cx: number; cy: number }[] = [];
    const neonCutoutGraphics: Phaser.GameObjects.Graphics[] = [];

    for (const obj of layer.objects) {
      const objType = obj.type || "";
      if (objType !== "neon_sign" && objType !== "streetlamp" && objType !== "light") continue;

      const props: Record<string, any> = {};
      if (obj.properties) {
        for (const p of obj.properties as { name: string; value: any }[]) {
          props[p.name] = p.value;
        }
      }

      const colorHex = props.color ?? "#ffffff";
      const color = parseInt(colorHex.replace("#", ""), 16);
      const radius = props.radius ?? 150;
      const intensity = props.intensity ?? 0.8;
      const flicker = props.flicker ?? "steady";
      const ox = obj.x ?? 0;
      const oy = obj.y ?? 0;

      // ── Neon sign: per-letter polygons with creepy motel flicker ──
      if (objType === "neon_sign" && obj.polygon && obj.polygon.length > 1) {
        const objName = obj.name ?? "";
        const pts = obj.polygon as { x: number; y: number }[];

        // Cutouts — dark outline only (traces the inner holes for legibility)
        if (objName.includes("cutout")) {
          const cutoutOutline = this.add.graphics();
          cutoutOutline.setDepth(28);
          cutoutOutline.lineStyle(2, 0xffd6aa, 0.7);
          cutoutOutline.beginPath();
          cutoutOutline.moveTo(ox + pts[0].x, oy + pts[0].y);
          for (let i = 1; i < pts.length; i++) cutoutOutline.lineTo(ox + pts[i].x, oy + pts[i].y);
          cutoutOutline.closePath();
          cutoutOutline.strokePath();
          neonCutoutGraphics.push(cutoutOutline);
          continue;
        }

        const neonOrange = 0xcc4400;

        // Outer glow (soft halo around sign)
        const glowOuter = this.add.graphics();
        glowOuter.setDepth(26);
        glowOuter.fillStyle(neonOrange, 0.15);
        glowOuter.lineStyle(6, neonOrange, 0.2);
        glowOuter.beginPath();
        glowOuter.moveTo(ox + pts[0].x, oy + pts[0].y);
        for (let i = 1; i < pts.length; i++) glowOuter.lineTo(ox + pts[i].x, oy + pts[i].y);
        glowOuter.closePath();
        glowOuter.fillPath();
        glowOuter.strokePath();

        // Mid glow — brighter orange fill
        const glowMid = this.add.graphics();
        glowMid.setDepth(26);
        glowMid.fillStyle(neonOrange, 0.35);
        glowMid.lineStyle(3, 0xe55500, 0.5);
        glowMid.beginPath();
        glowMid.moveTo(ox + pts[0].x, oy + pts[0].y);
        for (let i = 1; i < pts.length; i++) glowMid.lineTo(ox + pts[i].x, oy + pts[i].y);
        glowMid.closePath();
        glowMid.fillPath();
        glowMid.strokePath();

        // Inner core — warm orange center, NOT white
        const glowCore = this.add.graphics();
        glowCore.setDepth(27);
        glowCore.fillStyle(0xe55500, 0.6);
        glowCore.lineStyle(1.5, 0xff6600, 0.8);
        glowCore.beginPath();
        glowCore.moveTo(ox + pts[0].x, oy + pts[0].y);
        for (let i = 1; i < pts.length; i++) glowCore.lineTo(ox + pts[i].x, oy + pts[i].y);
        glowCore.closePath();
        glowCore.fillPath();
        glowCore.strokePath();

        // Crisp neon-white outline on top of glow — defines letter edges
        const topOutline = this.add.graphics();
        topOutline.setDepth(28);
        topOutline.lineStyle(1.5, 0xffd6aa, 0.7);
        topOutline.beginPath();
        topOutline.moveTo(ox + pts[0].x, oy + pts[0].y);
        for (let i = 1; i < pts.length; i++) topOutline.lineTo(ox + pts[i].x, oy + pts[i].y);
        topOutline.closePath();
        topOutline.strokePath();

        // Collect letter controls for grouped flicker (set up after loop)
        const setLetterOn = (on: boolean) => {
          const a = on ? 1 : 0;
          glowOuter.setAlpha(a);
          glowMid.setAlpha(a);
          glowCore.setAlpha(a);
          topOutline.setAlpha(a);
        };
        setLetterOn(false); // start dark
        neonLetterControls.push({ setOn: setLetterOn, cx: ox, cy: oy });

        continue;
      }

      // ── Point lights (streetlamp, light) ──
      let cx = ox;
      let cy = oy;
      if (obj.polygon && obj.polygon.length > 0) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const pt of obj.polygon as { x: number; y: number }[]) {
          if (pt.x < minX) minX = pt.x;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.y > maxY) maxY = pt.y;
        }
        cx += (minX + maxX) / 2;
        cy += (minY + maxY) / 2;
      }

      const trigger = props.trigger as string | undefined;
      const parsedIntensity = typeof intensity === "string" ? parseFloat(intensity) : intensity;
      const parsedRadius = typeof radius === "string" ? parseInt(radius as string, 10) : radius;

      const light = this.lights.addLight(cx, cy, parsedRadius, color, trigger ? 0 : parsedIntensity);
      this.landmarkLights.push({ name: obj.name ?? "", light, flicker });

      // Triggered lights start off — stored for later activation
      if (trigger) {
        if (!this.triggeredLights.has(trigger)) this.triggeredLights.set(trigger, []);
        this.triggeredLights.get(trigger)!.push(light);
        // Store the intended intensity on the light object for activation
        (light as any)._triggerIntensity = parsedIntensity;
        continue; // no flicker until triggered
      }

      // Track streetlamps for power-on activation
      if (objType === "streetlamp") {
        this.streetlampLights.push({ light, intensity: parsedIntensity });
      }

      if (flicker === "candle") {
        // Mostly OFF — occasional 2s flicker burst after ~5s dark
        // Once power is on, flicker cycle stops and lights stay steady
        light.intensity = 0;
        const flickerCycle = () => {
          if (this.powerOn) return; // power on — stop flickering
          // Dark phase: 4-7 seconds off
          const darkTime = 4000 + Math.random() * 3000;
          this.time.delayedCall(darkTime, () => {
            if (this.powerOn) return;
            // Flicker ON phase: rapid stuttery pulses for ~2s
            const flickerDuration = 1500 + Math.random() * 1000;
            const startTime = this.time.now;
            const flickerEvent = this.time.addEvent({
              delay: 50 + Math.random() * 80,
              loop: true,
              callback: () => {
                if (this.powerOn) { flickerEvent.remove(); return; }
                const elapsed = this.time.now - startTime;
                if (elapsed >= flickerDuration) {
                  // Flicker phase done — go dark again
                  light.intensity = 0;
                  flickerEvent.remove();
                  flickerCycle();
                  return;
                }
                // Stuttery on/off pulses with varying brightness
                if (Math.random() < 0.3) {
                  // Brief dark gap mid-flicker
                  light.intensity = 0;
                } else {
                  light.intensity = parsedIntensity * (0.4 + Math.random() * 0.6);
                }
              },
            });
          });
        };
        // Stagger initial start so lamps don't sync
        this.time.delayedCall(Math.random() * 5000, flickerCycle);
      } else if (flicker === "fluorescent") {
        this.tweens.add({
          targets: light,
          intensity: { from: parsedIntensity * 0.15, to: parsedIntensity },
          duration: 120,
          yoyo: true,
          repeat: -1,
          ease: "Stepped",
          hold: 60,
          repeatDelay: 300 + Math.random() * 600,
        });
      }
    }

    // ── Neon sign shared light + creepy flicker ──
    if (neonLetterControls.length > 0) {
      // One shared point light at center of all letters
      let sumX = 0, sumY = 0;
      for (const lc of neonLetterControls) { sumX += lc.cx; sumY += lc.cy; }
      const sharedCx = sumX / neonLetterControls.length;
      const sharedCy = sumY / neonLetterControls.length;
      const neonLight = this.lights.addLight(sharedCx, sharedCy, 120, 0xcc4400, 0);
      this.landmarkLights.push({ name: "rudys_neon", light: neonLight, flicker: "neon" });

      // Hide cutout outlines initially (sign starts dark)
      for (const cg of neonCutoutGraphics) cg.setAlpha(0);

      const setAllOn = (on: boolean) => {
        for (const lc of neonLetterControls) lc.setOn(on);
        for (const cg of neonCutoutGraphics) cg.setAlpha(on ? 1 : 0);
        neonLight.intensity = on ? 0.32 : 0;
      };

      // Initial power-on sequence: darkness → stuttery flick → hold
      const flicks = [
        { on: true,  delay: 800 },
        { on: false, delay: 150 },
        { on: true,  delay: 100 },
        { on: false, delay: 80 },
        { on: true,  delay: 0 },
      ];
      let cumDelay = 600;
      for (const f of flicks) {
        this.time.delayedCall(cumDelay, () => setAllOn(f.on));
        cumDelay += f.delay;
      }

      // Ongoing flicker — two layers:
      // 1) Full-sign dropout: all letters off together (less frequent, every 6-12s)
      this.time.addEvent({
        delay: 6000 + Math.random() * 6000,
        loop: true,
        callback: () => {
          setAllOn(false);
          this.time.delayedCall(80 + Math.random() * 100, () => {
            setAllOn(true);
            this.time.delayedCall(50 + Math.random() * 60, () => {
              setAllOn(false);
              this.time.delayedCall(100 + Math.random() * 150, () => {
                setAllOn(true);
              });
            });
          });
        },
      });

      // 2) Individual letter flicker: each letter gets its own random dropout loop
      for (const lc of neonLetterControls) {
        const scheduleFlicker = () => {
          const nextDelay = 2000 + Math.random() * 5000;
          this.time.delayedCall(nextDelay, () => {
            lc.setOn(false);
            this.time.delayedCall(60 + Math.random() * 80, () => {
              lc.setOn(true);
              // ~40% chance of a double-flick
              if (Math.random() < 0.4) {
                this.time.delayedCall(40 + Math.random() * 50, () => {
                  lc.setOn(false);
                  this.time.delayedCall(80 + Math.random() * 120, () => {
                    lc.setOn(true);
                    scheduleFlicker();
                  });
                });
              } else {
                scheduleFlicker();
              }
            });
          });
        };
        // Stagger initial start so letters don't sync up
        this.time.delayedCall(1800 + Math.random() * 3000, scheduleFlicker);
      }
    }

    // ── Traffic light cycling ──
    // Group traffic lights by prefix (e.g. "traffic1_green" → group "traffic1")
    const trafficGroups = new Map<string, { green?: Phaser.GameObjects.Light; yellow?: Phaser.GameObjects.Light; red?: Phaser.GameObjects.Light }>();
    for (const lm of this.landmarkLights) {
      const match = lm.name.match(/^(traffic\d+)_(green|yellow|red)$/);
      if (!match) continue;
      const [, group, bulb] = match;
      if (!trafficGroups.has(group)) trafficGroups.set(group, {});
      const g = trafficGroups.get(group)!;
      if (bulb === "green") g.green = lm.light;
      else if (bulb === "yellow") g.yellow = lm.light;
      else if (bulb === "red") g.red = lm.light;
    }

    for (const [, tl] of trafficGroups) {
      // Ensure traffic lights have enough radius to be visible
      if (tl.green) tl.green.radius = Math.max(tl.green.radius, 120);
      if (tl.yellow) tl.yellow.radius = Math.max(tl.yellow.radius, 120);
      if (tl.red) tl.red.radius = Math.max(tl.red.radius, 120);

      // Cycle: green 5s → yellow 1.5s → red 5s → repeat
      const setTrafficState = (state: "green" | "yellow" | "red") => {
        if (tl.green) tl.green.intensity = state === "green" ? 0.6 : 0.03;
        if (tl.yellow) tl.yellow.intensity = state === "yellow" ? 0.6 : 0.03;
        if (tl.red) tl.red.intensity = state === "red" ? 0.6 : 0.03;
      };

      // Start cycling immediately with small stagger between groups
      const cycle = () => {
        setTrafficState("green");
        this.time.delayedCall(5000, () => {
          setTrafficState("yellow");
          this.time.delayedCall(1500, () => {
            setTrafficState("red");
            this.time.delayedCall(5000, cycle);
          });
        });
      };
      cycle();
    }
  }

  /** Activate all lights with the given trigger name */
  fireLandmarkTrigger(trigger: string) {
    const lights = this.triggeredLights.get(trigger);
    if (!lights) return;
    for (const light of lights) {
      const target = (light as any)._triggerIntensity ?? 0.8;
      this.tweens.add({ targets: light, intensity: target, duration: 1500, ease: "Sine.easeOut" });
    }
    this.triggeredLights.delete(trigger);
  }

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
      if (["first_aid"].includes(id)) columns[0].push(idx);
      else if (["shotgun", "ammo_light", "ammo_shotgun", "ammo_heavy"].includes(id)) columns[1].push(idx);
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
      const isEquipped = ["shotgun", "smg"].includes(item.id) && this.weapons.includes(item.id);
      const id = item.id;
      let category: "supplies" | "weapons" | "traps" = "supplies";
      if (["shotgun", "smg"].includes(id)) category = "weapons";
      else if (["first_aid", "ammo_light", "ammo_shotgun", "ammo_heavy"].includes(id)) category = "supplies";
      else if (["landmine", "grenade"].includes(id)) category = "traps";

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
    return item.basePrice; // flat prices — no wave inflation
  }

  // ─── Canopy fade (tree canopies go transparent near player) ───

  private fadedCanopyTiles: { tile: Phaser.Tilemaps.Tile }[] = [];

  private updateCanopyFade() {
    // Restore previously faded tiles
    for (const { tile } of this.fadedCanopyTiles) {
      tile.alpha = 1;
    }
    this.fadedCanopyTiles.length = 0;

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
            tile.alpha = 0.30 + t * 0.70; // 0.30 at center, 1.0 at edge
            this.fadedCanopyTiles.push({ tile });
          }
        }
      }
    }
  }

  // ─── Teleport points ───

  private nearestTeleport: (typeof this.teleportPoints)[number] | null = null;

  private updateTeleportPrompts() {
    if (this.teleporting || this.teleportPoints.length === 0) return;

    const px = this.player.x;
    const py = this.player.y;
    this.nearestTeleport = null;

    for (const tp of this.teleportPoints) {
      const dist = Phaser.Math.Distance.Between(px, py, tp.x, tp.y);
      if (dist < this.startInteractDist) {
        const isExterior = tp.name.includes("exterior");
        this.nearestTeleport = tp;
        const label = isExterior ? "E  Enter" : "E  Exit";
        this.setActivePrompt(label, tp.x, tp.y - 14);
        return;
      }
    }
  }

  private tryTeleport(): boolean {
    if (this.teleporting || !this.nearestTeleport) return false;
    const dest = this.teleportPoints.find(p => p.name === this.nearestTeleport!.target);
    if (!dest) return false;

    // If exiting Rudy's after Kyle intro, trigger next wave on arrival
    const leavingRudys = this.nearestTeleport.name === "teleport_rudys_interior"
      && this.kyleIntroTriggered;

    // Entering Rudy's — start room tone; leaving — stop it
    const enteringRudys = this.nearestTeleport.name.includes("exterior");
    if (enteringRudys) {
      this.audio.startRoomTone();
    } else if (leavingRudys) {
      this.audio.stopRoomTone();
    }

    this.doTeleport(dest.x, dest.y, () => {
      if (leavingRudys) {
        this.zoneSpawnManager.setFrozen(false);
        // Start exploration theme on first exit from Rudy's
        if (!this._explorationThemeStarted) {
          this._explorationThemeStarted = true;
          this.audio.startTheme("theme-main", "themeMain", 0.12, true, 2500);
          // Reset stealth state so bar starts clean after cutscene
          this._displayedStealth = 0;
          this._lastGunfireTime = 0;
        }
      }
    });
    return true;
  }

  private doTeleport(destX: number, destY: number, onComplete?: () => void) {
    this.teleporting = true;
    this.player.body?.setVelocity(0, 0);

    // Fade out
    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      // Offset slightly so player doesn't re-trigger the destination point
      this.player.setPosition(destX, destY + 32);
      this.cameras.main.centerOn(destX, destY + 32);

      // Fade in
      this.cameras.main.fadeIn(200, 0, 0, 0);
      this.cameras.main.once("camerafadeincomplete", () => {
        this.teleporting = false;
        onComplete?.();
      });
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
    return [this.groundLayer, this.groundDetailLayer, this.pathsLayer, this.foliagePaintedLayer, this.overhangsLayer, this.vfxMarksLayer, this.propsLowLayer, this.propsMidLayer];
  }

  private updateInteriorDarkness() {
    if (!this.floorInteriorLayer || !this.roofLayer) return;

    const tileX = Math.floor(this.player.x / 32);
    const tileY = Math.floor(this.player.y / 32);
    const roofTile = this.roofLayer.getTileAt(tileX, tileY);
    const isInside = !!roofTile;

    if (isInside && !this.playerInsideBuilding) {
      this.playerInsideBuilding = true;
      if (this.teleporting) {
        // During teleport, just toggle layers — teleport already fades
        this.setOutdoorLayersVisible(false);
      } else {
        this.fadeInteriorTransition(true);
      }
    } else if (!isInside && this.playerInsideBuilding) {
      this.playerInsideBuilding = false;
      if (this.teleporting) {
        this.setOutdoorLayersVisible(true);
      } else {
        this.fadeInteriorTransition(false);
      }
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

  private startDoorX = 0;
  private startDoorY = 0;
  private startDoorW = 32;
  private startDoorH = 64;
  private startingDoorSavedTiles: { col: number; row: number; gid: number }[] = [];
  private readonly startInteractDist = 50; // px

  private updateStartingRoomPrompts() {
    if (this.kyleIntroTriggered) {
      if (this.startingDoorPrompt) { this.startingDoorPrompt.setVisible(false); }
      return;
    }

    // Door prompt
    if (!this.startingDoorOpened) {
      const doorDist = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, this.startDoorX, this.startDoorY
      );
      if (doorDist < this.startInteractDist) {
        this.setActivePrompt("E  Exit", this.startDoorX, this.startDoorY - 14);
      }
    }
  }

  // ─── Loot Chests (Tiled interactables) ───

  private updateLootChestPrompts() {
    for (const chest of this.lootChests) {
      if (chest.opened) continue;
      const dist = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, chest.x, chest.y
      );
      if (dist < 60) {
        this.setActivePrompt("E  Open Chest", chest.x, chest.y - 14);
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
      this.showWeaponMessage("ASSAULT RIFLE", "#ffdd44");
      this.audio.playSound("sfx-reload-rifle", 0.5);
      return true;
    }
    return false;
  }
  // ─── Rudy's Desks ───

  private updateDeskPrompts() {
    if (this.intermissionLocked) return; // desks locked after intermission expires
    for (const desk of this.rudysDesks) {
      if (!desk.stocked) continue;
      const dist = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, desk.x, desk.y
      );
      if (dist < BALANCE.desks.interactRange) {
        const label = desk.name === "med_desk" ? "Bandages"
          : desk.name === "ammo_desk" ? "Ammo"
          : "Equipment";
        this.setActivePrompt(`E  ${label}`, desk.x, desk.y - 14);
      }
    }
  }

  private tryDeskInteract(): boolean {
    if (this.intermissionLocked) return false;
    for (const desk of this.rudysDesks) {
      if (!desk.stocked) continue;
      const dist = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, desk.x, desk.y
      );
      if (dist >= BALANCE.desks.interactRange) continue;

      desk.stocked = false;
      this.audio.playSound("sfx-buy", 0.5);

      if (desk.name === "med_desk") {
        const give = BALANCE.bandage.deskGiveCount;
        this.bandageCount = Math.min(this.bandageCount + give, BALANCE.bandage.maxStack);
        this.assignConsumableSlot("bandage");
        this.showWeaponMessage(`+${give} BANDAGES`, "#44dd44");
      } else if (desk.name === "ammo_desk") {
        // Add pistol rounds to reserve
        if (this.weaponAmmo.pistol) {
          this.weaponAmmo.pistol.reserve += BALANCE.desks.ammoDesk.pistolRounds;
        }
        // Add shotgun shells (bank if no shotgun yet)
        if (this.weaponAmmo.shotgun) {
          this.weaponAmmo.shotgun.reserve += BALANCE.desks.ammoDesk.shotgunShells;
        } else {
          this.weaponAmmo.shotgun = { mag: 0, reserve: BALANCE.desks.ammoDesk.shotgunShells };
        }
        this.showWeaponMessage("+AMMO", "#44dd44");
      } else if (desk.name === "equipment_desk") {
        // Grenades
        this.grenadeCount = Math.min(
          this.grenadeCount + BALANCE.desks.equipmentDesk.grenades,
          BALANCE.grenade.maxCount
        );
        this.player.grenadeCount = this.grenadeCount;
        this.assignConsumableSlot("grenade");
        // Landmines
        const currentMines = this.trapInventory.get("landmine" as any) ?? 0;
        this.trapInventory.set("landmine" as any, currentMines + BALANCE.desks.equipmentDesk.landmines);
        this.assignConsumableSlot("mine");
        this.showWeaponMessage("+GRENADE +LANDMINE", "#44dd44");
      }

      // Remove glow for this desk
      const deskIdx = this.rudysDesks.indexOf(desk);
      if (deskIdx >= 0 && this.deskGlows[deskIdx]) {
        this.deskGlows[deskIdx].destroy();
        this.deskGlows[deskIdx] = null!;
      }

      // Complete objective once all desks are looted
      if (this.rudysDesks.every(d => !d.stocked)) {
        this.completeObjective("search_tables");
      }
      return true;
    }
    return false;
  }

  private showDeskGlows() {
    if (!this.add) return;
    this.clearDeskGlows();
    for (const desk of this.rudysDesks) {
      const gfx = this.add.graphics();
      gfx.setDepth(1);
      // Pulsing red glow rectangle around the desk tile
      gfx.lineStyle(2, 0xff2244, 0.8);
      gfx.strokeRect(desk.x - 16, desk.y - 16, 32, 32);
      gfx.lineStyle(4, 0xff2244, 0.3);
      gfx.strokeRect(desk.x - 18, desk.y - 18, 36, 36);
      this.deskGlows.push(gfx);

      // Pulse animation
      this.tweens.add({
        targets: gfx,
        alpha: { from: 1, to: 0.3 },
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
  }

  private clearDeskGlows() {
    for (const gfx of this.deskGlows) {
      if (gfx) gfx.destroy();
    }
    this.deskGlows = [];
  }

  // ─── Cars (loot / alarm interactables) ───

  private updateCarPrompts() {
    if (!this._explorationThemeStarted) return; // locked until player exits Rudy's after cutscene
    for (const car of this.cars) {
      if (car.opened) continue;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, car.x, car.y);
      if (dist < 60) {
        this.setActivePrompt("E  Search Car", car.x, car.y - 14);
      }
    }
  }

  private tryCarInteract(): boolean {
    if (!this._explorationThemeStarted) return false;
    for (const car of this.cars) {
      if (car.opened) continue;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, car.x, car.y);
      if (dist >= 60) continue;

      car.opened = true;

      if (car.hasLoot) {
        // Shotgun loot — 1 magazine loaded
        this.addWeapon("shotgun", { mag: BALANCE.weapons.shotgun.magazineSize, reserve: 0 });
        this.showWeaponMessage("FOUND SHOTGUN", "#44dd44");
        this.audio.playSound("sfx-buy", 0.4);
      } else {
        // Car alarm — flash lights + play SFX
        this.triggerCarAlarm(car);
      }
      return true;
    }
    return false;
  }

  private triggerCarAlarm(car: { name: string; x: number; y: number; alarmKey?: string }) {
    const alarmKey = car.alarmKey ?? "sfx-car-alarm-horn-1";
    this.audio.playSound(alarmKey, 0.6);

    // Car alarm is LOUD — alert all existing enemies + spawn a surge converging on the car
    this.emitSoundEvent(car.x, car.y, 800);
    this.zoneSpawnManager.triggerCarAlarmSurge(car.x, car.y);

    // Find matching headlight/taillight lights from landmarkLights
    const prefix = car.name + "_";
    const carLights = this.landmarkLights.filter(lm => lm.name.startsWith(prefix));

    if (carLights.length === 0) return;

    // Set radius for alarm flash (colors already correct from Tiled)
    for (const lm of carLights) {
      lm.light.radius = lm.name.includes("headlight") ? 100 : 70;
    }

    // Abrupt hard on/off flash for ~4 seconds — DUH DUH DUH rhythm
    const flashDuration = 4000;
    const beatMs = 250; // quarter-second beats: on-off-on-off
    const startTime = this.time.now;
    const flashEvent = this.time.addEvent({
      delay: 30, // check frequently for snappy transitions
      loop: true,
      callback: () => {
        const elapsed = this.time.now - startTime;
        if (elapsed >= flashDuration) {
          for (const lm of carLights) lm.light.intensity = 0;
          flashEvent.remove();
          return;
        }
        // Hard square-wave toggle — full intensity or zero, no in-between
        const on = Math.floor(elapsed / beatMs) % 2 === 0;
        for (const lm of carLights) {
          lm.light.intensity = on ? 2.5 : 0;
        }
      },
    });
  }

  // ─── Silent Kill ───

  /** Find the nearest basic zombie that the player can silently kill from behind */
  private findSilentKillTarget(): Enemy | null {
    const maxDist = 50; // must be close
    let best: Enemy | null = null;
    let bestDist = maxDist;

    const playerAngle = this.directionToAngle(this.player.currentDir);

    for (const obj of this.enemies.getChildren()) {
      const e = obj as Enemy;
      if (!e.active || e.dying || e.spawning) continue;
      if (e.enemyType !== "basic") continue; // only basic zombies
      if (e.detectionState !== "unaware") continue; // must be unaware

      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y);
      if (dist >= bestDist) continue;

      // Check player is behind the zombie: angle from zombie to player should be
      // roughly opposite to the zombie's facing direction (player is in its blind spot)
      const zombieFacing = this.directionToAngle(e.currentDir);
      const angleFromZombieToPlayer = Phaser.Math.Angle.Between(e.x, e.y, this.player.x, this.player.y);
      const angleDiff = Math.abs(Phaser.Math.Angle.Wrap(angleFromZombieToPlayer - zombieFacing));
      // Player must be behind the zombie (>120° from its facing = in its back half)
      if (angleDiff < Phaser.Math.DegToRad(120)) continue;

      // Also check player is facing toward the zombie
      const angleToZombie = Phaser.Math.Angle.Between(this.player.x, this.player.y, e.x, e.y);
      const playerAngleDiff = Math.abs(Phaser.Math.Angle.Wrap(angleToZombie - playerAngle));
      if (playerAngleDiff > Phaser.Math.DegToRad(60)) continue;

      best = e;
      bestDist = dist;
    }
    return best;
  }

  private updateSilentKillPrompt() {
    const target = this.findSilentKillTarget();
    if (target) {
      this.setActivePrompt("E  Silent Kill", target.x, target.y - 20);
    }
  }

  private trySilentKill(): boolean {
    const target = this.findSilentKillTarget();
    if (!target) return false;

    // Instant kill — no noise, no aggro
    target.takeDamage(999999);
    this.onEnemyKilled(target, "melee");
    this.spawnBloodSplat(target.x, target.y, "kill", target.enemyType);
    return true;
  }

  // ─── Bandages ───

  private useBandage() {
    if (this.bandageCount <= 0) return;
    if (this.player.stats.health >= this.player.stats.maxHealth) return;

    this.bandageCount--;
    this.player.stats.health = Math.min(
      this.player.stats.health + BALANCE.bandage.healAmount,
      this.player.stats.maxHealth
    );
    this.audio.playSound("sfx-bandage-use", 0.4);
    this.showWeaponMessage("+25 HP", "#44dd44");
  }

  // ------- Consumable Hotbar (keys 1-4) -------

  private readonly CONSUMABLE_ICONS: Record<string, string> = {
    grenade: "/assets/sprites/items/grenade.png",
    bandage: "/assets/sprites/items/bandage.png",
    mine: "/assets/sprites/items/trap-landmine.png",
    barricade: "/assets/sprites/items/trap-barricade.png",
  };

  private readonly CONSUMABLE_NAMES: Record<string, string> = {
    grenade: "Grenade",
    bandage: "Bandage",
    mine: "Mine",
    barricade: "Barricade",
  };

  /** Get count for a consumable type */
  private getConsumableCount(type: string): number {
    switch (type) {
      case "grenade": return this.grenadeCount;
      case "bandage": return this.bandageCount;
      case "mine": return this.trapInventory.get("landmine" as TrapType) ?? 0;
      case "barricade": return this.trapInventory.get("barricade" as TrapType) ?? 0;
      default: return 0;
    }
  }

  /** Ensure a consumable type has a slot assignment. Uses fixed slot order. */
  private assignConsumableSlot(type: string) {
    if (this.consumableSlotAssignments.includes(type)) return;
    // Insert at fixed position based on CONSUMABLE_SLOT_ORDER
    const order = (this.constructor as typeof GameScene).CONSUMABLE_SLOT_ORDER;
    const targetIdx = order.indexOf(type);
    if (targetIdx === -1) {
      // Unknown type — append at end
      this.consumableSlotAssignments.push(type);
      return;
    }
    // Find correct insertion point to maintain order
    let insertAt = 0;
    for (let i = 0; i < this.consumableSlotAssignments.length; i++) {
      const existingIdx = order.indexOf(this.consumableSlotAssignments[i]);
      if (existingIdx < targetIdx) insertAt = i + 1;
    }
    this.consumableSlotAssignments.splice(insertAt, 0, type);
  }

  /** Remove a consumable type from slot assignments (when count hits 0) */
  private removeConsumableSlot(_type: string) {
    // No-op — keep fixed slots so key bindings don't shift.
    // buildConsumableSlots handles showing 0-count items as empty.
  }

  /** Use the consumable in a given hotbar slot (0-3). Called from key 1-4 press. */
  private useConsumableSlot(slotIndex: number) {
    if (slotIndex >= this.consumableSlotAssignments.length) return;
    const type = this.consumableSlotAssignments[slotIndex];
    if (!type || this.getConsumableCount(type) <= 0) return;

    switch (type) {
      case "bandage":
        this.useBandage();
        break;
      case "grenade":
        // Quick throw (same as G tap)
        if (this.grenadeCount <= 0 || this.grenadeThrowing) return;
        this.throwGrenade();
        break;
      case "mine":
        this.selectedTrapIndex = 1;
        this.placeTrap();
        break;
      case "barricade":
        this.selectedTrapIndex = 0;
        this.placeTrap();
        break;
    }
    this.consumableActiveFlash = slotIndex;
    this.time.delayedCall(300, () => { if (this.consumableActiveFlash === slotIndex) this.consumableActiveFlash = -1; });
  }

  /** Build consumable slots array for HUD. Prunes empty types. */
  private buildConsumableSlots(): { type: string; count: number; icon: string; name: string }[] {
    // Keep all assigned slots (even 0-count) so key bindings stay fixed
    return this.consumableSlotAssignments.map(type => ({
      type,
      count: this.getConsumableCount(type),
      icon: this.CONSUMABLE_ICONS[type] ?? "",
      name: this.CONSUMABLE_NAMES[type] ?? type,
    }));
  }

  // ------- Log / Axe / Chopable Fences -------

  private updateLogPrompt() {
    if (!this._explorationThemeStarted) return; // locked until player exits Rudy's after cutscene
    if (this.logSearched) return;
    const logWorldX = this.logWorldCX;
    const logWorldY = this.logWorldCY;
    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, logWorldX, logWorldY);
    if (dist < this.interactDist) {
      this.setActivePrompt("E  Search Dumpster", logWorldX, logWorldY - 14);
    }
  }

  private trySearchLog(): boolean {
    if (!this._explorationThemeStarted) return false;
    if (this.logSearched || this.hasAxe) return false;
    const logWorldX = this.logWorldCX;
    const logWorldY = this.logWorldCY;
    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, logWorldX, logWorldY);
    if (dist >= this.interactDist) return false;

    this.logSearched = true;
    this.hasAxe = true;
    if (this.logPrompt) this.logPrompt.setVisible(false);
    this.audio.playSound("sfx-buy", 0.6);
    this.showAxePickupCutscene();
    return true;
  }

  private showAxePickupCutscene() {
    this.axePickupActive = true;
    this.physics.pause();
    hudState.update({ axePickupActive: true });
  }

  private dismissAxePickup() {
    if (!this.axePickupActive) return;
    this.axePickupActive = false;
    this.physics.resume();
    hudState.update({ axePickupActive: false });
  }

  private updateFencePrompts() {
    if (!this.hasAxe) return;
    for (const fence of this.chopableFences) {
      if (fence.chopped) continue;
      const fx = fence.tileX * 32 + 16;
      const fy = fence.tileY * 32 + 16;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, fx, fy);
      if (dist < this.interactDist) {
        this.setActivePrompt("E  Chop Fence", fx, fy - 14);
      }
    }
  }

  private openInventory() {
    if (this.inventoryOpen) return;
    this.inventoryOpen = true;
    this.physics.pause();
    this.pushInventoryData();
    hudState.update({ inventoryOpen: true });
  }

  private dismissInventory() {
    if (!this.inventoryOpen) return;
    this.inventoryOpen = false;
    // If level-up was active, clear it so the update loop doesn't stay frozen
    if (this.levelUpActive) {
      this.levelUpActive = false;
      this.zoneSpawnManager.setFrozen(false);
      hudState.update({ levelUpActive: false });
    }
    this.physics.resume();
    hudState.update({ inventoryOpen: false });
  }

  private pushInventoryData() {
    const slots: { id: string; name: string; icon: string; count?: number }[] = [];

    // Grenades
    if (this.grenadeCount > 0) {
      slots.push({ id: "grenade", name: "Grenade", icon: "/assets/sprites/items/grenade.png", count: this.grenadeCount });
    }
    // Landmines
    const mineCount = this.trapInventory.get("landmine" as any) ?? 0;
    if (mineCount > 0) {
      slots.push({ id: "landmine", name: "Landmine", icon: "/assets/sprites/items/landmine.png", count: mineCount });
    }
    // Bandages
    if (this.bandageCount > 0) {
      slots.push({ id: "bandage", name: "Bandage", icon: "/assets/sprites/items/bandage.png", count: this.bandageCount });
    }

    // Pad to 8
    while (slots.length < 8) {
      slots.push({ id: "", name: "", icon: "" });
    }

    // Push stats data too
    const effective = this.levelingSystem.getEffectiveStats(this.characterDef.stats);
    const buffList = this.levelingSystem.appliedBuffs.map(b => ({
      category: b.category,
      tier: b.tier,
      name: b.name,
    }));

    hudState.update({
      inventorySlots: slots,
      inventoryHasAxe: this.hasAxe,
      statsEffective: effective,
      statsBuffs: buffList,
      statsXp: this.levelingSystem.xp,
      statsXpNeeded: this.levelingSystem.xpToNextLevel(),
    });
  }

  private fenceHintShown = false;

  private showFenceHintBanner() {
    if (this.fenceHintShown) return;
    this.fenceHintShown = true;
    this.showWeaponMessage("Maybe you can find something to chop this down with..", "#f5d8a8");
  }

  private tryChopFence(): boolean {
    for (const fence of this.chopableFences) {
      if (fence.chopped) continue;
      const fx = fence.tileX * 32 + 16;
      const fy = fence.tileY * 32 + 16;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, fx, fy);
      if (dist < this.interactDist) {
        if (!this.hasAxe) {
          this.showFenceHintBanner();
          return true; // consume input
        }
        fence.chopped = true;
        if (fence.prompt) fence.prompt.setVisible(false);

        // Remove tile sprites
        for (const l of fence.layers) {
          this.getDoorLayer(l.name)?.removeTileAt(fence.tileX, fence.tileY);
        }

        // Remove collision body
        if (fence.body) {
          (fence.body.body as Phaser.Physics.Arcade.StaticBody).enable = false;
        }

        // Update pathfinding grid
        this.pathfinder.setWalkable(fence.tileX, fence.tileY, true);
        this.reachableDirty = true;

        this.audio.playSound("sfx-fence-break", 0.5);
        this.showWeaponMessage("FENCE CHOPPED", "#44dd44");
        this.completeObjective("chop_fence");
        return true;
      }
    }
    return false;
  }

  // ─── Objective tracker ───

  private getCurrentObjective(): string | null {
    // Intermission lockout takes priority
    if (this.intermissionLocked) return "Exit Rudy's";

    // (intermission skip removed — no waves)

    const o = this.objectivesComplete;
    if (!o.exit_room) return "Exit the Room";
    if (!o.investigate_rudys) return "Look for Survivors";
    if (!o.search_tables) return "Search the Supply Tables";
    if (!o.chop_fence) return "Find a Way Past the Fence";
    if (!o.explore_library) return "Explore the Library";
    if (!o.defeat_scaryboi) return "Defeat SCARYBOI Once and For All";
    if (!o.investigate_music) return "Investigate the Music";
    if (!o.crash_rave) return "Crash the Rave";
    if (!o.defeat_bigbaby) return "Defeat DJ BigBaby";
    return null;
  }

  private completeObjective(id: string) {
    if (this.objectivesComplete[id]) return;
    this.objectivesComplete[id] = true;
    hudState.update({ currentObjective: this.getCurrentObjective() });

    // Unlock Gate 2 when both power + library objectives are met
    if (this.objectivesComplete.power_on && this.objectivesComplete.explore_library) {
      const gate2 = this.doors.find(d => d.label === "gate2");
      if (gate2 && gate2.locked) gate2.locked = false;
    }

  }

  private tryStartingDoor(): boolean {
    if (this.startingDoorOpened) return false;
    const dist = Phaser.Math.Distance.Between(
      this.player.x, this.player.y, this.startDoorX, this.startDoorY
    );
    if (dist >= this.startInteractDist) return false;

    this.startingDoorOpened = true;
    this.reachableDirty = true; // recompute spawn reachability
    this.completeObjective("exit_room");
    this.audio.playSound("sfx-door-open", 0.5);

    // Remove the door collision body so player can walk through
    if (this.startingDoorBody) {
      this.obstacles.remove(this.startingDoorBody);
      this.startingDoorBody.destroy();
      this.startingDoorBody = undefined;
    }

    // Clear door tiles visually — compute tile coords from Tiled position
    const doorLeftCol = Math.floor((this.startDoorX - this.startDoorW / 2) / 32);
    const doorTopRow = Math.floor((this.startDoorY - this.startDoorH / 2) / 32);
    const doorRightCol = Math.ceil((this.startDoorX + this.startDoorW / 2) / 32);
    const doorBottomRow = Math.ceil((this.startDoorY + this.startDoorH / 2) / 32);
    for (let row = doorTopRow; row < doorBottomRow; row++) {
      for (let col = doorLeftCol; col < doorRightCol; col++) {
        this.wallsBaseLayer?.removeTileAt(col, row);
        this.pathfinder.setWalkable(col, row, true);
      }
    }

    // Destroy prompt
    if (this.startingDoorPrompt) {
      this.startingDoorPrompt.destroy();
      this.startingDoorPrompt = undefined;
    }

    // Wave 1 deferred — starts when player exits Rudy's after Kyle cutscene

    // Monitor player position — once they exit the room (north of door top), seal it
    const sealThresholdY = doorTopRow * 32;
    const checkExit = this.time.addEvent({
      delay: 100,
      loop: true,
      callback: () => {
        if (this.player.y < sealThresholdY) {
          checkExit.destroy();
          // Re-add collision to seal the room
          const sealZone = this.add.zone(this.startDoorX, this.startDoorY, this.startDoorW, this.startDoorH).setOrigin(0.5);
          this.physics.add.existing(sealZone, true);
          this.obstacles.add(sealZone);
          // Restore door tiles visually from saved GIDs
          for (const saved of this.startingDoorSavedTiles) {
            this.wallsBaseLayer?.putTileAt(saved.gid, saved.col, saved.row);
            this.pathfinder.setWalkable(saved.col, saved.row, false);
          }
        }
      },
    });

    return true;
  }

  // ─── Interactive prompt styling ───

  private createPromptText(x: number, y: number, label: string, canAfford = true): Phaser.GameObjects.Container {
    // Split "E  Action Text" into key hint + label, or use full label if no key prefix
    let actionLabel = label;
    let keyHint = "";
    if (label.startsWith("E  ")) {
      actionLabel = label.slice(3);
      keyHint = "E";
    }

    const labelTxt = this.add.text(0, 0, actionLabel, {
      fontFamily: "'Special Elite', serif",
      fontSize: "24px",
      color: "#e0e0e0",
      stroke: "rgba(0, 0, 0, 0.9)",
      strokeThickness: 3,
      align: "center",
      shadow: { offsetX: 0, offsetY: 1, color: "rgba(0,0,0,0.8)", blur: 2, fill: true, stroke: false },
    }).setOrigin(0.5);

    const container = this.add.container(x, y, [labelTxt]).setDepth(100).setScale(0.25).setAlpha(0);
    container.setData("labelTxt", labelTxt);

    if (keyHint) {
      const keyTxt = this.add.text(labelTxt.width / 2 + 8, 4, keyHint, {
        fontFamily: "'Special Elite', serif",
        fontSize: "16px",
        color: "#cccccc",
        stroke: "rgba(0, 0, 0, 0.9)",
        strokeThickness: 2,
        shadow: { offsetX: 0, offsetY: 1, color: "rgba(0,0,0,0.8)", blur: 2, fill: true, stroke: false },
      }).setOrigin(0, 0.5);
      container.add(keyTxt);
      container.setData("keyTxt", keyTxt);
    }

    this.applyPromptGradient(container, canAfford);
    return container;
  }

  private applyPromptGradient(container: Phaser.GameObjects.Container, canAfford: boolean) {
    const labelTxt = container.getData("labelTxt") as Phaser.GameObjects.Text | undefined;
    if (!labelTxt) return;
    if (canAfford) {
      labelTxt.setColor("#e0e0e0");
      labelTxt.setStroke("rgba(0, 0, 0, 0.9)", 3);
    } else {
      labelTxt.setColor("#ff6666");
      labelTxt.setStroke("rgba(80, 10, 10, 0.9)", 3);
    }
  }

  private setPromptLabel(container: Phaser.GameObjects.Container, label: string) {
    const labelTxt = container.getData("labelTxt") as Phaser.GameObjects.Text | undefined;
    if (!labelTxt) return;
    // Strip "E  " prefix — key hint is a separate text object
    const text = label.startsWith("E  ") ? label.slice(3) : label;
    labelTxt.setText(text);
    // Reposition key hint after label width changes
    const keyTxt = container.getData("keyTxt") as Phaser.GameObjects.Text | undefined;
    if (keyTxt) keyTxt.setX(labelTxt.width / 2 + 10);
  }

  /** Set the active interaction prompt for this frame (React-rendered) */
  private setActivePrompt(label: string, worldX: number, worldY: number, canAfford = true) {
    let keyHint = "";
    let actionLabel = label;
    if (label.startsWith("E  ")) {
      keyHint = "E";
      actionLabel = label.slice(3);
    }
    this.activePromptLabel = actionLabel;
    this.activePromptKey = keyHint;
    this.activePromptWorldX = worldX;
    this.activePromptWorldY = worldY;
    this.activePromptCanAfford = canAfford;
    this.activePromptVisible = true;
  }

  // Cache to avoid pushing identical prompt data every frame
  private lastPromptJson = "";

  /** Push active prompt screen position to HUDState (called after all prompt updates) */
  private pushPromptToHUD() {
    if (!this.activePromptVisible) {
      if (this.lastPromptJson !== "") {
        this.lastPromptJson = "";
        hudState.update({ interactionPrompt: null });
      }
      return;
    }
    const cam = this.cameras.main;
    // Convert world position to 0-1 fraction of the camera viewport
    const fracX = (this.activePromptWorldX - cam.worldView.x) / cam.worldView.width;
    const fracY = (this.activePromptWorldY - cam.worldView.y) / cam.worldView.height;
    // Round fractions to 3 decimal places to reduce churn
    const rx = Math.round(fracX * 1000);
    const ry = Math.round(fracY * 1000);
    const json = `${this.activePromptLabel}|${this.activePromptKey}|${rx}|${ry}|${this.activePromptCanAfford}`;
    if (json !== this.lastPromptJson) {
      this.lastPromptJson = json;
      hudState.update({
        interactionPrompt: {
          label: this.activePromptLabel,
          keyHint: this.activePromptKey,
          screenX: fracX * 100,
          screenY: fracY * 100,
          canAfford: this.activePromptCanAfford,
        },
      });
    }
    // Reset for next frame
    this.activePromptVisible = false;
  }

  // ─── Doors (purchasable barriers) ───

  private getDoorLayer(name: string): Phaser.Tilemaps.TilemapLayer | undefined {
    switch (name) {
      case "walls_base": return this.wallsBaseLayer;
      case "walls_top": return this.wallsTopLayer;
      case "props_low": return this.propsLowLayer;
      case "props_mid": return this.propsMidLayer;
      case "props_indoor": return this.propsIndoorLayer;
      default: return undefined;
    }
  }

  /** Helper: true during cutscene_1 or cutscene_2 (physics paused, player frozen) */
  private get masonCutsceneActive(): boolean {
    return this.masonRavePhase === "cutscene_1" || this.masonRavePhase === "cutscene_2";
  }

  /** Helper: true during any phase of the Kyle intro cutscene */
  private get kyleIntroActive(): boolean {
    return this.kyleIntroPhase !== "" && this.kyleIntroPhase !== "done";
  }

  /** Phase 0: Spawn Mason + dancing zombies, seal estate, player walks freely */
  private triggerMasonRave() {
    if (!this.masonTriggered) this.masonTriggered = true;
    this.masonRavePhase = "rave_setup";
    this.completeObjective("investigate_music");

    // Seal estate entrance
    const estateDoor = this.doors.find(d => d.label === "gate2");
    if (estateDoor && estateDoor.opened) {
      (estateDoor.zone.body as Phaser.Physics.Arcade.StaticBody).enable = true;
      for (const t of estateDoor.savedTiles) {
        this.getDoorLayer(t.layer)?.putTileAt(t.gid, t.col, t.row);
        this.pathfinder.setWalkable(t.col, t.row, false);
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

    // Toxic green aura — follows Mason everywhere
    this.masonAuraLight = this.lights.addLight(mason.x, mason.y, 180, 0x44ff44, 0.6);

    // Spawn dancing zombies within the rave_crowd rect from Tiled (zones_navigation)
    this.masonRaveZombies = [];
    const directions: Array<"south" | "south-east" | "south-west" | "east" | "west" | "north"> = ["south", "south-east", "south-west", "east", "west", "north"];
    const speedTiers: Array<"shamble" | "jog" | "run"> = ["jog", "jog", "run"];

    // Use rave_crowd rect from Tiled (zones_navigation), read during create()
    const { x: crowdX, y: crowdY, w: crowdW, h: crowdH } = this.raveCrowdRect;

    for (let i = 0; i < 35; i++) {
      const zx = crowdX + Math.random() * crowdW;
      const zy = crowdY + Math.random() * crowdH;
      const tier = speedTiers[i % speedTiers.length];
      const zombie = new Enemy(this, zx, zy, "basic", 1.5, 2, tier);
      this.enemies.add(zombie);
      zombie.raveZombie = true;
      zombie.setScale(0.34);
      zombie.body.setImmovable(true);
      // Front-row faces north (watching Mason), back rows face random
      const frontThreshold = crowdY + crowdH * 0.4;
      const facing = zy < frontThreshold ? "north" as const : directions[i % directions.length];
      zombie.startDancing(facing);
      this.masonRaveZombies.push(zombie);
    }

    // Set up nightclub visuals
    this.setupClubAtmosphere();

    // Rave music: stop any muffled version and start fresh at full volume
    this.audio.startRaveMusic();
  }

  // (Mason rave music methods moved to AudioManager)

  /** Nightclub lighting: dark overlay, wall fixtures, sweeping PointLights, DJ glow, fog */
  // ─── Room Visibility System ───

  private pointInPolygon(px: number, py: number, poly: { x: number; y: number }[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }

  private getPlayerZone(): string | null {
    const px = this.player.x;
    const py = this.player.y;
    for (const zone of this.visibilityZones) {
      if (this.pointInPolygon(px, py, zone.points)) return zone.name;
    }
    return null;
  }

  /** Fade enemy alpha based on distance to nearest light source.
   *  Flashlight ON: larger reveal radius. OFF: smaller. Landmark lights also reveal. */
  private updateEnemyVisibility() {
    const enemies = this.enemies.getChildren() as Enemy[];
    if (enemies.length === 0) return;

    const px = this.player.x;
    const py = this.player.y;

    // Reveal radii (pixels) — inner = fully visible, outer = faded to minAlpha
    const innerRadius = this.flashlightActive ? 120 : 80;
    const outerRadius = this.flashlightActive ? 280 : 180;
    const minAlpha = 0.35; // enemies in full darkness are 35% visible

    for (const enemy of enemies) {
      if (!enemy.active) continue;
      // Skip enemies with active tweens on alpha (smoke appear/vanish, boss cinematics)
      if (enemy.dying || enemy.bossCutscene || enemy.fleeing) continue;

      const edx = enemy.x - px;
      const edy = enemy.y - py;
      const distToPlayer = Math.sqrt(edx * edx + edy * edy);

      // Best (highest) alpha from any light source — start with player
      let best = this.visAlpha(distToPlayer, innerRadius, outerRadius, minAlpha);
      if (best >= 1) { enemy.setAlpha(1); continue; } // early-out: fully lit

      // Check landmark lights (streetlamps, neon, etc.)
      for (const lm of this.landmarkLights) {
        if (lm.light.intensity <= 0) continue;
        const ldx = enemy.x - lm.light.x;
        const ldy = enemy.y - lm.light.y;
        const dist = Math.sqrt(ldx * ldx + ldy * ldy);
        const r = lm.light.radius;
        const a = this.visAlpha(dist, r * 0.4, r * 0.85, minAlpha);
        if (a > best) best = a;
        if (best >= 1) break;
      }

      // Check triggered lights (generator-powered, etc.)
      if (best < 1) {
        for (const [, lights] of this.triggeredLights) {
          for (const light of lights) {
            if (light.intensity <= 0) continue;
            const ldx = enemy.x - light.x;
            const ldy = enemy.y - light.y;
            const dist = Math.sqrt(ldx * ldx + ldy * ldy);
            const r = light.radius;
            const a = this.visAlpha(dist, r * 0.4, r * 0.85, minAlpha);
            if (a > best) best = a;
            if (best >= 1) break;
          }
          if (best >= 1) break;
        }
      }

      enemy.setAlpha(best);
    }
  }

  /** Linear alpha falloff: 1.0 inside inner, minAlpha beyond outer, lerp between */
  private visAlpha(dist: number, inner: number, outer: number, min: number): number {
    if (dist <= inner) return 1;
    if (dist >= outer) return min;
    return 1 - (dist - inner) / (outer - inner) * (1 - min);
  }

  /** Detection pass — check if unaware enemies can see/hear the player */
  private updateEnemyDetection(delta: number) {
    const det = BALANCE.detection;

    // Get flashlight direction vector from player's 8-direction facing
    let flashDir: { x: number; y: number } | null = null;
    if (this.flashlightActive) {
      const dir = this.player.currentDir;
      const d = 1 / Math.SQRT2; // diagonal component
      switch (dir) {
        case "north":      flashDir = { x: 0, y: -1 }; break;
        case "south":      flashDir = { x: 0, y: 1 }; break;
        case "east":       flashDir = { x: 1, y: 0 }; break;
        case "west":       flashDir = { x: -1, y: 0 }; break;
        case "north-east": flashDir = { x: d, y: -d }; break;
        case "north-west": flashDir = { x: -d, y: -d }; break;
        case "south-east": flashDir = { x: d, y: d }; break;
        case "south-west": flashDir = { x: -d, y: d }; break;
      }
    }

    // Vision detection pass — every frame
    this.enemies.getChildren().forEach((obj) => {
      const enemy = obj as Enemy;
      if (!enemy.active || enemy.dying) return;
      enemy.checkDetection(this.player, this.flashlightActive, flashDir);
    });

    // Sprint sound emission — throttled
    if (this.player.isSprinting) {
      this.sprintSoundTimer -= delta;
      if (this.sprintSoundTimer <= 0) {
        this.sprintSoundTimer = det.sprintSoundInterval;
        const crouchMod = this.player.isCrouching ? det.crouchModifier : 1.0;
        this.emitSoundEvent(this.player.x, this.player.y, det.sprintSoundRadius * crouchMod);
        this.zoneSpawnManager.triggerSprintSurge(this.player.x, this.player.y);
      }
    } else {
      this.sprintSoundTimer = 0; // reset so first sprint step triggers immediately
    }

    // Stealth barometer — proximity-to-detection gauge
    // Green = safe distance, high green = one wrong move away, orange = loud action, red = actively chased
    const crouchMod = this.player.isCrouching ? det.crouchModifier : 1.0;
    const flashMod = this.flashlightActive ? 1.0 : det.flashlightOffModifier;
    const effectiveVisionRange = det.zombieVisionRange * crouchMod * flashMod;
    const effectiveSoundRange = det.gunfireSoundRadius; // gunfire range doesn't change with crouch

    let maxProximityThreat = 0; // 0-1: how close is the nearest unaware enemy to detecting you
    let chaserCount = 0;

    this.enemies.getChildren().forEach((obj) => {
      const e = obj as Enemy;
      if (!e.active || e.dying || e.raveZombie) return;
      if (e.enemyType === "boss" || e.enemyType === "mason") return;
      const dist = Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y);

      if (e.detectionState === "chasing" && dist < 600) {
        chaserCount++;
      } else if (e.detectionState === "unaware") {
        // How close is this enemy relative to their detection range?
        // Use a wider check radius (2x vision range) so the meter rises before you're actually in range
        const dangerRadius = effectiveVisionRange * 2.5;
        if (dist < dangerRadius) {
          const threat = 1 - (dist / dangerRadius);
          if (threat > maxProximityThreat) maxProximityThreat = threat;
        }
      }
    });

    // Noise threat — recent gunfire means anyone in sound range could come investigating
    let noiseThreat = 0;
    if (this._lastGunfireTime && this.time.now - this._lastGunfireTime < 3000) {
      const decay = 1 - (this.time.now - this._lastGunfireTime) / 3000;
      noiseThreat = 0.55 * decay; // orange zone
    }

    let targetStealth: number;
    if (chaserCount > 0) {
      // Red zone — fully exposed when any enemy is chasing
      targetStealth = 1.0;
    } else {
      // Blend proximity + noise. Proximity is green zone (0-0.5), noise is orange (0.4-0.65)
      targetStealth = Math.max(maxProximityThreat * 0.5, noiseThreat);
    }

    targetStealth = Phaser.Math.Clamp(targetStealth, 0, 1);

    // Smooth transitions — rises fast, drains at readable pace
    const prev = this._displayedStealth;
    if (targetStealth > prev) {
      this._displayedStealth = Phaser.Math.Linear(prev, targetStealth, 0.3); // snap up quickly
    } else {
      this._displayedStealth = Phaser.Math.Linear(prev, targetStealth, 0.12); // drain over ~1-2s
    }
    // Snap to zero if very close (avoid lingering at near-zero)
    if (this._displayedStealth < 0.02) this._displayedStealth = 0;

    // Status label
    const stealthLabel = this._displayedStealth >= 0.7 ? "EXPOSED"
      : this._displayedStealth >= 0.35 ? "DETECTED"
      : "HIDDEN";
    hudState.update({ stealthLevel: this._displayedStealth, stealthLabel });

  }

  /** Emit a sound event at position — alerts unaware enemies within radius */
  private emitSoundEvent(x: number, y: number, radius: number) {
    this.enemies.getChildren().forEach((obj) => {
      const enemy = obj as Enemy;
      if (!enemy.active || enemy.dying) return;
      enemy.checkSoundEvent(x, y, radius);
    });
  }

  private updateRoomVisibility() {
    if (!this.roomOccluder) return;
    const newZone = this.getPlayerZone();
    if (newZone === this.currentZoneName) return;
    console.log(`[RoomVisibility] Zone: ${this.currentZoneName} -> ${newZone}, zones=${this.visibilityZones.length}`);

    // Generator hum — only audible inside north_building
    if (this.genHumSound && (this.genHumSound as any).isPlaying) {
      const targetVol = newZone === "north_building" ? 0.08 : 0;
      this.tweens.killTweensOf(this.genHumSound);
      this.tweens.add({ targets: this.genHumSound, volume: targetVol, duration: 400 });
    }

    this.currentZoneName = newZone;
    if (newZone === null) {
      // Player is outdoors — no room occluder needed
      this.roomOccluder.setVisible(false);
      return;
    }

    // Redraw: fill with black, erase current zone polygon
    const zone = this.visibilityZones.find(z => z.name === newZone)!;
    this.roomOccluder.clear();

    const black = this.add.graphics();
    black.fillStyle(0x000000, 1);
    black.fillRect(0, 0, this.roomOccluder.width, this.roomOccluder.height);
    this.roomOccluder.draw(black);
    black.destroy();

    const cutout = this.add.graphics();
    cutout.fillStyle(0xffffff, 1);
    cutout.beginPath();
    cutout.moveTo(zone.points[0].x, zone.points[0].y);
    for (let i = 1; i < zone.points.length; i++) {
      cutout.lineTo(zone.points[i].x, zone.points[i].y);
    }
    cutout.closePath();
    cutout.fillPath();
    this.roomOccluder.erase(cutout);
    cutout.destroy();

    this.roomOccluder.setVisible(true);
  }

  private setupClubAtmosphere() {
    // Get club zone polygon from Tiled
    const clubZone = this.visibilityZones.find(z => z.name === "club");
    if (!clubZone) { console.warn("[GameScene] No club zone found for atmosphere"); return; }
    const pts = clubZone.points;
    const xs = pts.map(p => p.x);
    const ys = pts.map(p => p.y);
    const zoneMinX = Math.min(...xs);
    const zoneMaxX = Math.max(...xs);
    const zoneMinY = Math.min(...ys);
    const zoneMaxY = Math.max(...ys);
    const zoneCenterX = (zoneMinX + zoneMaxX) / 2;
    const zoneCenterY = (zoneMinY + zoneMaxY) / 2;
    const sweepDist = 144; // ~4.5 tiles of sweep range

    // A. Dark overlay — polygon matching the club zone
    const darkOverlay = this.add.graphics();
    darkOverlay.fillStyle(0x050010, 0.6);
    darkOverlay.beginPath();
    darkOverlay.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) darkOverlay.lineTo(pts[i].x, pts[i].y);
    darkOverlay.closePath();
    darkOverlay.fillPath();
    darkOverlay.setDepth(52);
    this.masonClubEffects.push(darkOverlay);

    // B. Spotlights — north, west, east walls with sweeping pointlights
    const fixtures: {
      fixtureX: number; fixtureY: number; texture: string;
      sweepStartX: number; sweepStartY: number; sweepEndX: number; sweepEndY: number;
      color: number; radius: number; duration: number; delay: number;
    }[] = [
      // North wall
      {
        fixtureX: 40 * 32 + 16, fixtureY: zoneMinY + 16, texture: "prop-spotlight-purple",
        sweepStartX: 40 * 32, sweepStartY: zoneMinY + 64,
        sweepEndX: 40 * 32 + sweepDist, sweepEndY: zoneCenterY,
        color: 0x9b30ff, radius: 50, duration: 2800, delay: 0,
      },
      {
        fixtureX: 45 * 32 + 16, fixtureY: zoneMinY + 16, texture: "prop-spotlight-cyan",
        sweepStartX: 45 * 32 + sweepDist * 0.3, sweepStartY: zoneMinY + 64,
        sweepEndX: 45 * 32 - sweepDist * 0.5, sweepEndY: zoneCenterY + 64,
        color: 0x00bfff, radius: 50, duration: 3200, delay: 600,
      },
      {
        fixtureX: 49 * 32 + 16, fixtureY: zoneMinY + 16, texture: "prop-spotlight-red",
        sweepStartX: 49 * 32 - sweepDist * 0.3, sweepStartY: zoneMinY + 96,
        sweepEndX: 49 * 32 + sweepDist * 0.6, sweepEndY: zoneCenterY,
        color: 0xff2200, radius: 50, duration: 3000, delay: 300,
      },
      {
        fixtureX: 55 * 32 + 16, fixtureY: zoneMinY + 16, texture: "prop-spotlight-purple",
        sweepStartX: 55 * 32, sweepStartY: zoneMinY + 64,
        sweepEndX: 55 * 32 - sweepDist, sweepEndY: zoneCenterY,
        color: 0x8b00ff, radius: 50, duration: 2600, delay: 900,
      },
      // West wall
      {
        fixtureX: zoneMinX + 16, fixtureY: zoneMinY + (zoneMaxY - zoneMinY) * 0.3, texture: "prop-spotlight-purple",
        sweepStartX: zoneMinX + 96, sweepStartY: zoneMinY + (zoneMaxY - zoneMinY) * 0.2,
        sweepEndX: zoneCenterX, sweepEndY: zoneMinY + (zoneMaxY - zoneMinY) * 0.5,
        color: 0xff1493, radius: 45, duration: 3600, delay: 400,
      },
      // East wall
      {
        fixtureX: zoneMaxX - 16, fixtureY: zoneMinY + (zoneMaxY - zoneMinY) * 0.35, texture: "prop-spotlight-cyan",
        sweepStartX: zoneMaxX - 96, sweepStartY: zoneMinY + (zoneMaxY - zoneMinY) * 0.25,
        sweepEndX: zoneCenterX, sweepEndY: zoneMinY + (zoneMaxY - zoneMinY) * 0.55,
        color: 0x00bfff, radius: 45, duration: 3400, delay: 700,
      },
      // South wall — fixtures right on the bottom edge
      {
        fixtureX: zoneMinX + (zoneMaxX - zoneMinX) * 0.3, fixtureY: zoneMaxY, texture: "prop-spotlight-red",
        sweepStartX: zoneMinX + (zoneMaxX - zoneMinX) * 0.2, sweepStartY: zoneMaxY - 64,
        sweepEndX: zoneCenterX - 32, sweepEndY: zoneCenterY + 32,
        color: 0xff1493, radius: 45, duration: 3700, delay: 500,
      },
      {
        fixtureX: zoneMinX + (zoneMaxX - zoneMinX) * 0.7, fixtureY: zoneMaxY, texture: "prop-spotlight-purple",
        sweepStartX: zoneMinX + (zoneMaxX - zoneMinX) * 0.8, sweepStartY: zoneMaxY - 64,
        sweepEndX: zoneCenterX + 32, sweepEndY: zoneCenterY + 48,
        color: 0x9b30ff, radius: 45, duration: 4100, delay: 800,
      },
    ];

    for (const f of fixtures) {
      // Static wall fixture sprite
      const sprite = this.add.image(f.fixtureX, f.fixtureY, f.texture);
      sprite.setDepth(8);
      this.masonClubEffects.push(sprite);

      // Sweeping PointLight on the floor — soft and transparent
      const pl = this.add.pointlight(f.sweepStartX, f.sweepStartY, f.color, f.radius, 0.12);
      pl.setDepth(53);

      // Sweep position (yoyo back and forth)
      this.tweens.add({
        targets: pl,
        x: f.sweepEndX,
        y: f.sweepEndY,
        duration: f.duration,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
        delay: f.delay,
      });
      // Gentle intensity pulse on top of the sweep
      this.tweens.add({
        targets: pl,
        intensity: { from: 0.08, to: 0.18 },
        radius: { from: f.radius * 0.9, to: f.radius * 1.1 },
        duration: 1000 + Math.random() * 600,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
        delay: f.delay + 200,
      });
      this.masonClubEffects.push(pl);
    }

    // D. Light beams — triangular cones from north + side walls, sweeping the dancefloor
    const beamLen = Math.max(zoneMaxY - zoneMinY, zoneMaxX - zoneMinX) + 64; // long enough to span zone
    const beams: { x: number; y: number; color: number; angleFrom: number; angleTo: number; duration: number; baseAngle: number }[] = [
      // North wall (pointing down)
      { x: 40 * 32 + 16, y: zoneMinY + 16, color: 0x9b30ff, baseAngle: 0, angleFrom: -20, angleTo: 35, duration: 3500 },
      { x: 45 * 32 + 16, y: zoneMinY + 16, color: 0x00bfff, baseAngle: 0, angleFrom: 25, angleTo: -30, duration: 4200 },
      { x: 49 * 32 + 16, y: zoneMinY + 16, color: 0xff2200, baseAngle: 0, angleFrom: -10, angleTo: 40, duration: 3800 },
      { x: 55 * 32 + 16, y: zoneMinY + 16, color: 0x8b00ff, baseAngle: 0, angleFrom: 30, angleTo: -20, duration: 3000 },
      // West wall (pointing right)
      { x: zoneMinX + 16, y: zoneMinY + (zoneMaxY - zoneMinY) * 0.3, color: 0xff1493, baseAngle: 90, angleFrom: -25, angleTo: 30, duration: 3600 },
      { x: zoneMinX + 16, y: zoneMinY + (zoneMaxY - zoneMinY) * 0.7, color: 0x9b30ff, baseAngle: 90, angleFrom: 20, angleTo: -25, duration: 4000 },
      // East wall (pointing left)
      { x: zoneMaxX - 16, y: zoneMinY + (zoneMaxY - zoneMinY) * 0.25, color: 0x00bfff, baseAngle: -90, angleFrom: -30, angleTo: 20, duration: 3400 },
      { x: zoneMaxX - 16, y: zoneMinY + (zoneMaxY - zoneMinY) * 0.6, color: 0xff2200, baseAngle: -90, angleFrom: 15, angleTo: -30, duration: 3900 },
      // South wall (pointing up into the room) — right on the bottom edge
      { x: zoneMinX + (zoneMaxX - zoneMinX) * 0.3, y: zoneMaxY, color: 0xff1493, baseAngle: 180, angleFrom: -25, angleTo: 30, duration: 3700 },
      { x: zoneMinX + (zoneMaxX - zoneMinX) * 0.7, y: zoneMaxY, color: 0x9b30ff, baseAngle: 180, angleFrom: 20, angleTo: -25, duration: 4100 },
    ];

    for (const beam of beams) {
      const g = this.add.graphics();
      g.setPosition(beam.x, beam.y);
      g.setDepth(53);
      g.setBlendMode(Phaser.BlendModes.ADD);

      // Outer soft cone — wide, very faint
      g.fillStyle(beam.color, 0.025);
      g.fillTriangle(0, 0, -100, beamLen, 100, beamLen);

      // Inner brighter cone — narrower, slightly more visible
      g.fillStyle(beam.color, 0.05);
      g.fillTriangle(0, 0, -45, beamLen, 45, beamLen);

      // Core hot spot — tight center line
      g.fillStyle(beam.color, 0.04);
      g.fillTriangle(0, 0, -15, beamLen, 15, beamLen);

      g.setAngle(beam.baseAngle + beam.angleFrom);

      // Sweep the beam back and forth
      this.tweens.add({
        targets: g,
        angle: beam.baseAngle + beam.angleTo,
        duration: beam.duration,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });

      this.masonClubEffects.push(g);
    }

    // C. DJ table glow — warm purple centered on the booth
    const djX = 48 * 32 + 16;
    const djY = 6 * 32 + 16;
    const djGlow = this.add.pointlight(djX, djY, 0x7c3aed, 100, 0.25);
    djGlow.setDepth(53);
    this.tweens.add({
      targets: djGlow,
      intensity: { from: 0.18, to: 0.35 },
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    this.masonClubEffects.push(djGlow);

    // DJ booth Light2D — actually illuminates sprites near Mason's booth
    const djLight2d = this.lights.addLight(djX, djY, 200, 0x7c3aed, 0.3);
    this.tweens.add({
      targets: djLight2d,
      intensity: { from: 0.2, to: 0.4 },
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // E. Dance floor Light2D wash — pulsing colored lights that illuminate sprites/tiles
    const floorLights: { x: number; y: number; color: number; radius: number; dur: number }[] = [
      // Left dance floor — magenta pulse
      { x: zoneMinX + (zoneMaxX - zoneMinX) * 0.25, y: zoneCenterY, color: 0xff1493, radius: 160, dur: 3200 },
      // Right dance floor — cyan pulse
      { x: zoneMinX + (zoneMaxX - zoneMinX) * 0.75, y: zoneCenterY, color: 0x00bfff, radius: 160, dur: 3800 },
      // Center dance floor — purple wash
      { x: zoneCenterX, y: zoneCenterY + 48, color: 0x9b30ff, radius: 200, dur: 4000 },
      // South area — right on the bottom edge
      { x: zoneCenterX - 64, y: zoneMaxY - 32, color: 0xff2200, radius: 140, dur: 3500 },
      { x: zoneCenterX + 80, y: zoneMaxY - 32, color: 0x8b00ff, radius: 140, dur: 2900 },
    ];
    for (const fl of floorLights) {
      const light = this.lights.addLight(fl.x, fl.y, fl.radius, fl.color, 0.15);
      this.tweens.add({
        targets: light,
        intensity: { from: 0.1, to: 0.25 },
        duration: fl.dur,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
        delay: Math.random() * 1000,
      });
    }

    // F. Fog/haze particles — subtle atmospheric smoke, contained to ballroom
    if (!this.textures.exists("club-fog-particle")) {
      const gfx = this.make.graphics({ x: 0, y: 0 });
      gfx.fillStyle(0xffffff, 1);
      gfx.fillCircle(16, 16, 16);
      gfx.generateTexture("club-fog-particle", 32, 32);
      gfx.destroy();
    }
    // Fog centered on the club zone
    const fogHalfW = (zoneMaxX - zoneMinX) / 2;
    const fogHalfH = (zoneMaxY - zoneMinY) / 2;
    const fogEmitter = this.add.particles(zoneCenterX, zoneCenterY, "club-fog-particle", {
      x: { min: -fogHalfW, max: fogHalfW },
      y: { min: -fogHalfH, max: fogHalfH },
      scale: { start: 1.5, end: 3.0 },
      alpha: { start: 0.03, end: 0 },
      tint: [0x9b30ff, 0xff1493, 0x4400ff, 0x8800aa],
      lifespan: { min: 3000, max: 6000 },
      speed: { min: 2, max: 8 },
      frequency: 350,
      quantity: 1,
      blendMode: Phaser.BlendModes.ADD,
    });
    fogEmitter.setDepth(54);
    this.masonClubEffects.push(fogEmitter);

    // Occlusion mask — clip all club effects to the club zone polygon
    const maskGfx = this.make.graphics({});
    maskGfx.fillStyle(0xffffff);
    maskGfx.beginPath();
    maskGfx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) maskGfx.lineTo(pts[i].x, pts[i].y);
    maskGfx.closePath();
    maskGfx.fillPath();
    const clubMask = maskGfx.createGeometryMask();

    for (const obj of this.masonClubEffects) {
      if (obj && typeof (obj as any).setMask === "function") {
        (obj as any).setMask(clubMask);
      }
    }
    this.masonClubEffects.push(maskGfx);

  }

  /** Remove all club atmosphere effects (on Mason death) */
  private cleanupClubAtmosphere() {
    for (const obj of this.masonClubEffects) {
      if (obj instanceof Phaser.GameObjects.Particles.ParticleEmitter) {
        obj.stop();
        this.time.delayedCall(3000, () => { if (obj.active) obj.destroy(); });
      } else {
        // Fade out then destroy
        this.tweens.add({
          targets: obj,
          alpha: 0,
          duration: 2000,
          ease: "Sine.easeOut",
          onComplete: () => { if (obj.active) obj.destroy(); },
        });
      }
    }
    this.masonClubEffects = [];
  }

  /** Phase 1: Camera pan to Mason, show first dialogue card */
  private triggerMasonCutscene1() {
    this.masonRavePhase = "cutscene_1";
    this.physics.pause();
    this.game.canvas.style.pointerEvents = "none";

    // Keep rave music playing through cutscenes — it stops on Mason death

    // Switch player to breathing-idle
    const idleKey = getAnimKey(this.characterDef.id, "breathing-idle", this.player.currentDir);
    if (this.anims.exists(idleKey)) this.player.play(idleKey, true);

    // Letterbox bars (React)
    hudState.update({ letterboxActive: true });

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
          this.postCutsceneImmunity = 1500; // 1.5s immunity — player is in the middle of the horde
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

  /** Retract letterbox bars (React CSS transition), then call onComplete */
  private retractMasonLetterbox(onComplete: () => void) {
    hudState.update({ letterboxActive: false });
    this.time.delayedCall(500, onComplete);
  }

  /** Skip Mason cutscene immediately (ESC key) — works for both cutscene_1 and cutscene_2 */
  private skipMasonCutscene() {
    if (!this.masonCutsceneActive) return;
    const wasPhase = this.masonRavePhase;

    // Clear React UI
    hudState.update({ masonDialogueActive: false, letterboxActive: false });
    this.game.canvas.style.pointerEvents = "auto";

    // Resume physics and camera
    this.cameras.main.stopFollow();
    this.cameras.main.resetFX();
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.physics.resume();

    this.masonDismissing = false;
    this.masonBannerReady = false;

    if (wasPhase === "cutscene_1") {
      // Activate zombies — they stop dancing and attack
      this.masonRavePhase = "zombie_fight";
      this.postCutsceneImmunity = 1500;
      for (const z of this.masonRaveZombies) {
        if (z.active && !z.dying) {
          z.stopDancing();
          z.body.setImmovable(false);
        }
      }
      this.showWeaponMessage("KILL THE ZOMBIES!", "#ff4444");
    } else if (wasPhase === "cutscene_2") {
      // Mason jumps in to fight
      this.masonRavePhase = "boss_fight";
      if (this.masonEnemy?.active) {
        this.playMasonJumpEntry(this.masonEnemy);
      }
    }
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

    // Letterbox bars (React)
    hudState.update({ letterboxActive: true });

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
      },
    });
  }

  // ─── Kyle Intro Cutscene ───

  // "Look out!" plays as a flash card during action (auto-dismisses, no pause)
  private readonly KYLE_EXTERIOR_DIALOGUE: { text: string; vo?: string }[] = [
    { text: "Fucking thing almost got you there, huh guy?", vo: "vo-kyle-almost-got-ya" },
  ];

  // Exposition first, pistol handoff last
  private readonly KYLE_INTERIOR_DIALOGUE: { text: string; vo?: string; givePistol?: boolean }[] = [
    { text: "Dude, I don't know what the fuck is going on around here.", vo: "vo-kyle-mason-exposition-1" },
    { text: "I just know Mason's back in town, and he hasn't stopped blasting his shitty mix since he got here.", vo: "vo-kyle-mason-exposition-2" },
    { text: "Then all of a sudden, I wake up and everyone's a fucking zombie?", vo: "vo-kyle-mason-exposition-3" },
    { text: "I don't know, dude.", vo: "vo-kyle-mason-exposition-4" },
    { text: "You ever use one of these before?", vo: "vo-kyle-ever-use-one", givePistol: true }, // last card
  ];

  // Ambient VO — Kyle says these randomly while pacing in Rudy's
  private readonly KYLE_AMBIENT_VO: string[] = [
    "vo-kyle-good-luck",
    "vo-kyle-supplies",
    "vo-kyle-zyns",
  ];
  private kyleAmbientVOTimer?: Phaser.Time.TimerEvent;
  private kyleAutoAdvanceTimer?: Phaser.Time.TimerEvent;

  private triggerKyleIntroCutscene() {
    if (this.kyleIntroTriggered) return;
    if (this.kyleCSPlayerPath.length === 0 || this.kyleCSZombiePath.length === 0 || this.kyleCSKylePath.length === 0) return;
    this.kyleIntroTriggered = true;
    this.kyleIntroPhase = "run_to_door";
    hudState.update({ kyleCutsceneActive: true });

    // Silent wave end — force-destroy all existing enemies, reset wave manager
    const toDestroy = this.enemies.getChildren().slice();
    for (const obj of toDestroy) {
      const e = obj as Enemy;
      e.setActive(false);
      e.setVisible(false);
      e.body?.setVelocity(0, 0);
      e.destroy();
    }
    // Letterbox
    hudState.update({ letterboxActive: true });

    // Disable player input — we control movement
    this.player.cutsceneControlled = true;

    // Shift camera south — Rudy's sign near top edge, more viewport for zombie chase
    this.cameras.main.setFollowOffset(0, -40);

    // Reset waypoint state
    this.kyleCSZombieWaypoint = 0;
    this.kyleCSKyleWaypoint = 0;
    this.kyleCSKyleStarted = false;
    this.kyleCSPlayerAtDoor = false;
    this.kyleCSPlayerDoorTimer = 0;

    // Freeze spawning during cutscene
    this.zoneSpawnManager.setFrozen(true);

    // Creepy bass underneath the cutscene SFX — hits on the first bass pump, loops until interior fade
    this.audio.stopTheme("themeMain", 1000);
    this.audio.stopTheme("themeIntense", 1000);
    this.audio.startTheme("theme-creepybass", "themeCreepybass", 0.3, true, 300);

    // Player runs straight from current position to the door (last player waypoint)
    const doorPt = this.kyleCSPlayerPath[this.kyleCSPlayerPath.length - 1];
    // Force running animation regardless of current movement state
    this.player.currentDir = "south";  // reset so moveActorToWaypoint detects a "change"
    this.moveActorToWaypoint(this.player, doorPt, 130);

    // Running footsteps while player sprints to door
    if (this.cache.audio.exists("sfx-running-grass")) {
      this.kyleCSRunningSound = this.sound.add("sfx-running-grass", { volume: 0.25, loop: true });
      this.kyleCSRunningSound.play();
    }

    // Zombie spawns later — after player has been banging for 1s
    this.kyleScriptedZombie = null;
  }

  private updateKyleIntroCutscene(delta: number) {
    if (this.kyleIntroPhase === "") return;

    if (this.kyleIntroPhase === "run_to_door") {
      const doorPt = this.kyleCSPlayerPath[this.kyleCSPlayerPath.length - 1];

      // Player runs straight to door
      if (!this.kyleCSPlayerAtDoor) {
        const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, doorPt.x, doorPt.y);
        if (dist < 8) {
          // Arrived at door — bang on it
          this.kyleCSPlayerAtDoor = true;
          this.kyleCSPlayerDoorTimer = 0;
          // Stop running footsteps, start door bashing
          if (this.kyleCSRunningSound?.isPlaying) this.kyleCSRunningSound.stop();
          this.kyleCSRunningSound = null;
          this.audio.playSound("sfx-door-bash", 0.5);
          this.time.delayedCall(700, () => {
            this.sound.stopByKey("sfx-door-bash");
            this.audio.playSound("sfx-door-bash", 0.5);
          });
          this.player.setPosition(doorPt.x, doorPt.y);
          this.player.body.setVelocity(0, 0);
          this.player.currentDir = "north";
          const bangKey = getAnimKey(this.characterDef.id, "banging-door", "north");
          const idleKey = getAnimKey(this.characterDef.id, "breathing-idle", "north");
          if (this.anims.exists(bangKey)) {
            this.player.play({ key: bangKey, repeat: -1 });
          } else if (this.anims.exists(idleKey)) {
            this.player.play(idleKey, true);
          }
        } else {
          this.moveActorToWaypoint(this.player, doorPt, 130);
        }
      }

      // Player at door — count banging time
      if (this.kyleCSPlayerAtDoor) {
        this.kyleCSPlayerDoorTimer += delta;
        this.player.body.setVelocity(0, 0);

        // After 1s of banging alone — spawn zombie
        if (!this.kyleScriptedZombie && this.kyleCSPlayerDoorTimer >= 1000) {
          const zSpawn = this.kyleCSZombiePath[0];
          const zombie = new Enemy(this, zSpawn.x, zSpawn.y, "basic", 1, 1, "run");
          this.enemies.add(zombie);
          zombie.fleeing = false;
          zombie.bossCutscene = true;
          this.kyleScriptedZombie = zombie;
          // Zombie groan on spawn
          this.audio.playSound("sfx-groan9", 0.4);
          this.kyleCSZombieWaypoint = 1;
          this.moveZombieToWaypoint(this.kyleCSZombiePath[1]);
        }
      }

      // Advance zombie along waypoints (if spawned)
      if (this.kyleScriptedZombie?.active) {
        this.advanceZombieWaypoint(delta);
      }

      // Kyle spawns late — zombie visible on screen, Kyle rushes out just in time
      if (!this.kyleCSKyleStarted && this.kyleScriptedZombie && this.kyleCSPlayerDoorTimer >= 2800) {
        this.kyleCSKyleStarted = true;
        // "Look out!" — flash card + VO before Kyle shoots (auto-dismisses, no pause)
        this.audio.playSound("vo-kyle-look-out", 0.7);
        hudState.update({
          kyleDialogueActive: true,
          kyleDialogueSpeaker: "KYLE",
          kyleDialogueQuote: "Look out!",
          kyleDialogueManual: false,
          kyleDialogueCanAdvance: false,
        });
        this.time.delayedCall(2000, () => {
          // Auto-dismiss if still showing "Look out!"
          if (hudState.getField("kyleDialogueQuote") === "Look out!") {
            hudState.update({ kyleDialogueActive: false });
          }
        });
        this.spawnKyleNpcCutscene();
      }

      // Zombie reaches final waypoint → Kyle shoots (only if Kyle is spawned)
      const zombieFinal = this.kyleCSZombiePath[this.kyleCSZombiePath.length - 1];
      if (this.kyleScriptedZombie?.active && this.kyleNpc && zombieFinal) {
        const distToFinal = Phaser.Math.Distance.Between(
          this.kyleScriptedZombie.x, this.kyleScriptedZombie.y,
          zombieFinal.x, zombieFinal.y
        );
        if (distToFinal < 12) {
          this.kyleIntroPhase = "kyle_shoots";
          this.kyleScriptedZombie.body.setVelocity(0, 0);
          this.kyleShootZombie();
        }
      }
      return;
    }

    // Other phases (dialogue) are event-driven, not per-frame
  }

  /** Move an actor toward a waypoint, updating running animation */
  private moveActorToWaypoint(actor: Phaser.GameObjects.Sprite & { body: any; currentDir?: string }, target: { x: number; y: number }, speed: number) {
    const angle = Phaser.Math.Angle.Between(actor.x, actor.y, target.x, target.y);
    actor.body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    const dir = angleToDirection(angle) as any;
    if (dir !== (actor as any).currentDir) {
      (actor as any).currentDir = dir;
      // Determine sprite id — player or zombie
      const isPlayer = actor === this.player;
      const spriteId = isPlayer ? this.characterDef.id : "creepyzombie";
      const runAnim = isPlayer ? "running-6-frames" : "scary-sprint";
      const runKey = getAnimKey(spriteId, runAnim, dir);
      if (this.anims.exists(runKey)) actor.play(runKey, true);
    }
  }

  /** Advance zombie along its waypoint path, holding at final point until player banged 2s */
  private advanceZombieWaypoint(_delta: number) {
    const z = this.kyleScriptedZombie;
    if (!z?.active) return;
    const target = this.kyleCSZombiePath[this.kyleCSZombieWaypoint];
    if (!target) return;
    const dist = Phaser.Math.Distance.Between(z.x, z.y, target.x, target.y);
    if (dist < 8) {
      z.setPosition(target.x, target.y);
      const isFinalPoint = this.kyleCSZombieWaypoint === this.kyleCSZombiePath.length - 1;
      // Hold at final waypoint (kill zone) until player has been banging for 2s
      if (isFinalPoint && (!this.kyleCSPlayerAtDoor || this.kyleCSPlayerDoorTimer < 2000)) {
        z.body.setVelocity(0, 0);
        return; // don't advance yet — Kyle will shoot when timer is up
      }
      this.kyleCSZombieWaypoint++;
      const next = this.kyleCSZombiePath[this.kyleCSZombieWaypoint];
      if (next) {
        this.moveZombieToWaypoint(next);
      } else {
        z.body.setVelocity(0, 0);
      }
    }
  }

  /** Set zombie velocity toward a waypoint */
  private moveZombieToWaypoint(target: { x: number; y: number }) {
    const z = this.kyleScriptedZombie;
    if (!z?.active) return;
    const angle = Phaser.Math.Angle.Between(z.x, z.y, target.x, target.y);
    const speed = 90;
    z.body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    const dir = angleToDirection(angle) as any;
    const sprintKey = getAnimKey("creepyzombie", "scary-sprint", dir);
    const runKey = getAnimKey("creepyzombie", "running-8-frames", dir);
    const animKey = this.anims.exists(sprintKey) ? sprintKey : runKey;
    if (this.anims.exists(animKey) && z.anims.currentAnim?.key !== animKey) {
      z.play(animKey, true);
    }
  }

  private spawnKyleNpcCutscene() {
    const spawn = this.kyleCSKylePath[0];
    if (!spawn) return;
    // Create Kyle NPC sprite
    const frameKey = "kyle-breathing-idle-east-0";
    const texKey = this.textures.exists(frameKey) ? frameKey : "kyle-breathing-idle-south-east-0";
    const kyle = this.add.sprite(spawn.x, spawn.y, texKey).setDepth(15).setScale(0.34);
    kyle.setPipeline("Light2D");
    this.physics.add.existing(kyle, false);
    const kyleBody = kyle.body as Phaser.Physics.Arcade.Body;
    kyleBody.setImmovable(true);
    kyleBody.setSize(32, 40);
    kyleBody.setOffset((kyle.width - 32) / 2, kyle.height - 40);
    this.physics.add.collider(this.player, kyle);
    this.kyleNpc = kyle;

    // Kyle walks along his waypoints via chained tweens
    this.kyleCSKyleWaypoint = 1;
    this.chainKyleWalk();
  }

  /** Chain Kyle's walk tweens along his waypoint path */
  private chainKyleWalk() {
    const kyle = this.kyleNpc;
    if (!kyle) return;
    const target = this.kyleCSKylePath[this.kyleCSKyleWaypoint];
    if (!target) {
      // Reached final waypoint — face east (toward zombie)
      const idleKey = getAnimKey("kyle", "breathing-idle", "east");
      if (this.anims.exists(idleKey)) kyle.play(idleKey, true);
      return;
    }

    const angle = Phaser.Math.Angle.Between(kyle.x, kyle.y, target.x, target.y);
    const dir = angleToDirection(angle) as any;
    const walkKey = getAnimKey("kyle", "walk", dir);
    if (this.anims.exists(walkKey)) kyle.play(walkKey, true);

    const dist = Phaser.Math.Distance.Between(kyle.x, kyle.y, target.x, target.y);
    const duration = (dist / 150) * 1000; // ~150px/sec — fast, urgent rush

    this.tweens.add({
      targets: kyle,
      x: target.x,
      y: target.y,
      duration,
      ease: "Linear",
      onComplete: () => {
        this.kyleCSKyleWaypoint++;
        this.chainKyleWalk();
      },
    });
  }

  private kyleShootZombie() {
    // Stop zombie
    if (this.kyleScriptedZombie?.active) {
      this.kyleScriptedZombie.body.setVelocity(0, 0);
    }

    // Kyle faces east toward zombie and shoots
    if (this.kyleNpc) {
      const shootKey = getAnimKey("kyle", "shooting-shotgun", "east");
      if (this.anims.exists(shootKey)) {
        this.kyleNpc.play({ key: shootKey, frameRate: 4 });
      }
    }

    // Delay SFX + flash slightly so it syncs with the mid-frame of the shoot animation
    this.time.delayedCall(200, () => {
      this.audio.playSound("sfx-shotgun", 0.6);

      if (this.kyleNpc) {
        const muzzleX = this.kyleNpc.x + 22;
        const muzzleY = this.kyleNpc.y - 2;

        // Light2D muzzle flash — bright white-yellow burst
        const muzzleLight = this.lights.addLight(muzzleX, muzzleY, 180, 0xffdd66, 2.5);
        this.tweens.add({
          targets: muzzleLight,
          intensity: 0,
          radius: 60,
          duration: 120,
          ease: "Cubic.easeOut",
          onComplete: () => this.lights.removeLight(muzzleLight),
        });

        // Small bright core graphic for visual punch
        const coreFlash = this.add.circle(muzzleX, muzzleY, 5, 0xffffff, 1).setDepth(16);
        const outerFlash = this.add.circle(muzzleX + 4, muzzleY, 3, 0xffcc33, 0.8).setDepth(16);
        this.tweens.add({
          targets: [coreFlash, outerFlash],
          alpha: 0,
          scaleX: 0.2,
          scaleY: 0.2,
          duration: 100,
          onComplete: () => { coreFlash.destroy(); outerFlash.destroy(); },
        });
      }
    });

    // Camera shake for impact
    this.cameras.main.shake(150, 0.008);

    // Play zombie death animation + blood splatter east + death SFX
    this.time.delayedCall(150, () => {
      if (this.kyleScriptedZombie?.active) {
        this.kyleScriptedZombie.body.setVelocity(0, 0);
        (this.kyleScriptedZombie.body as Phaser.Physics.Arcade.Body).enable = false;
        this.audio.playRandomEnemyDeath();

        // Blood splatter to the east (away from Kyle's shot)
        this.spawnBloodSplat(this.kyleScriptedZombie.x + 10, this.kyleScriptedZombie.y, "kill", "basic");

        // Play gunshot death animation — facing west (toward Kyle)
        const deathKey = getAnimKey("creepyzombie", "gunshot-death", "west");
        const fallbackKey = getAnimKey("creepyzombie", "falling-back-death", "west");
        if (this.anims.exists(deathKey)) {
          this.kyleScriptedZombie.play(deathKey, false);
        } else if (this.anims.exists(fallbackKey)) {
          this.kyleScriptedZombie.play(fallbackKey, false);
        }
        // Remove from enemies group and destroy after death animation
        const zombieRef = this.kyleScriptedZombie;
        this.kyleScriptedZombie = null;
        this.enemies.remove(zombieRef, false, false);
        this.time.delayedCall(1200, () => {
          if (zombieRef?.active) zombieRef.destroy();
        });
      }

      // Brief pause, then start exterior dialogue
      this.time.delayedCall(800, () => {
        this.kyleIntroPhase = "exterior_dialogue";
        this.kyleDialogueIndex = 0;
        this.physics.pause();

        // Kyle faces south-east (toward player area)
        if (this.kyleNpc) {
          const idleKey = getAnimKey("kyle", "breathing-idle", "east");
          if (this.anims.exists(idleKey)) this.kyleNpc.play(idleKey, true);
        }

        // Player stops banging, faces south-east toward Kyle
        this.player.currentDir = "south-west";
        const pIdleKey = getAnimKey(this.characterDef.id, "breathing-idle", "south-west");
        if (this.anims.exists(pIdleKey)) this.player.play(pIdleKey, true);

        const firstLine = this.KYLE_EXTERIOR_DIALOGUE[0];
        hudState.update({
          kyleDialogueActive: true,
          kyleDialogueSpeaker: "KYLE",
          kyleDialogueQuote: firstLine.text,
          kyleDialogueManual: true,
          kyleDialogueCanAdvance: false,
        });
        const extSound = this.playKyleLineVO(firstLine);
        this.scheduleKyleCanAdvance(extSound);
      });
    });
  }

  private playKyleLineVO(line: { vo?: string }): Phaser.Sound.BaseSound | null {
    if (line.vo) return this.audio.playSound(line.vo, 0.7);
    return null;
  }

  /** Enable "Continue" button after VO finishes. If no VO, enable after short delay. */
  private scheduleKyleCanAdvance(sound: Phaser.Sound.BaseSound | null) {
    if (this.kyleAutoAdvanceTimer) {
      this.kyleAutoAdvanceTimer.destroy();
      this.kyleAutoAdvanceTimer = undefined;
    }
    if (sound) {
      sound.once("complete", () => {
        hudState.update({ kyleDialogueCanAdvance: true });
      });
    } else {
      this.kyleAutoAdvanceTimer = this.time.delayedCall(1500, () => {
        hudState.update({ kyleDialogueCanAdvance: true });
      });
    }
  }

  private advanceKyleDialogue() {
    // Cancel any pending timer
    if (this.kyleAutoAdvanceTimer) {
      this.kyleAutoAdvanceTimer.destroy();
      this.kyleAutoAdvanceTimer = undefined;
    }

    if (this.kyleIntroPhase === "exterior_dialogue") {
      this.kyleDialogueIndex++;
      if (this.kyleDialogueIndex < this.KYLE_EXTERIOR_DIALOGUE.length) {
        const line = this.KYLE_EXTERIOR_DIALOGUE[this.kyleDialogueIndex];
        hudState.update({ kyleDialogueQuote: line.text, kyleDialogueManual: true, kyleDialogueCanAdvance: false });
        const sound = this.playKyleLineVO(line);
        this.scheduleKyleCanAdvance(sound);
      } else {
        // Exterior dialogue done — fade to interior
        hudState.update({ kyleDialogueActive: false, kyleDialogueCanAdvance: false });
        this.kyleIntroPhase = "fade_to_interior";
        this.fadeToKyleInterior();
      }
      return;
    }

    if (this.kyleIntroPhase === "interior_dialogue") {
      this.kyleDialogueIndex++;
      if (this.kyleDialogueIndex < this.KYLE_INTERIOR_DIALOGUE.length) {
        const line = this.KYLE_INTERIOR_DIALOGUE[this.kyleDialogueIndex];
        hudState.update({ kyleDialogueQuote: line.text, kyleDialogueManual: true, kyleDialogueCanAdvance: false });
        const sound = this.playKyleLineVO(line);
        this.scheduleKyleCanAdvance(sound);

        if (line.givePistol) {
          this.givePlayerPistol();
        }
      } else {
        // Interior dialogue done — cutscene complete
        this.endKyleIntroCutscene();
      }
      return;
    }
  }

  private fadeToKyleInterior() {
    if (!this.cameras?.main) return;
    // Creepy bass fades out with the screen, room tone fades in
    this.audio.stopTheme("themeCreepybass", 400);
    this.audio.startRoomTone();
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      // Position player and Kyle in center of Rudy's, facing each other
      const playerX = 80 * 32 + 16;
      const playerY = 55 * 32 + 16;
      const kyleX = 80 * 32 + 16;
      const kyleY = 53 * 32 + 16;

      this.player.setPosition(playerX, playerY);
      this.cameras.main.setFollowOffset(0, 0);
      this.cameras.main.startFollow(this.player, true, 0.08, 0.08);

      // Kyle faces south (toward player)
      if (this.kyleNpc) {
        this.kyleNpc.setPosition(kyleX, kyleY);
        const idleKey = getAnimKey("kyle", "breathing-idle", "south");
        if (this.anims.exists(idleKey)) this.kyleNpc.play(idleKey, true);
      }

      // Handle interior visibility
      this.playerInsideBuilding = true;
      this.setOutdoorLayersVisible(false);

      // Force-hide roof layer — updateRoofVisibility doesn't run during cutscene
      if (this.roofLayer) {
        this.roofLayer.setAlpha(0);
        this.roofVisible = false;
      }

      // Force room occluder to redraw for Rudy's interior zone
      this.currentZoneName = null; // reset so updateRoomVisibility detects the change

      // Player faces north (toward Kyle)
      this.player.currentDir = "north";
      const pIdleKey = getAnimKey(this.characterDef.id, "breathing-idle", "north");
      if (this.anims.exists(pIdleKey)) this.player.play(pIdleKey, true);

      // Fade in
      this.cameras.main.fadeIn(400, 0, 0, 0);
      this.cameras.main.once("camerafadeincomplete", () => {
        // Start interior dialogue
        this.kyleIntroPhase = "interior_dialogue";
        this.kyleDialogueIndex = 0;
        const firstIntLine = this.KYLE_INTERIOR_DIALOGUE[0];
        hudState.update({
          kyleDialogueActive: true,
          kyleDialogueSpeaker: "KYLE",
          kyleDialogueQuote: firstIntLine.text,
          kyleDialogueManual: true,
          kyleDialogueCanAdvance: false,
        });
        const intSound = this.playKyleLineVO(firstIntLine);
        this.scheduleKyleCanAdvance(intSound);
      });
    });
  }

  private givePlayerPistol() {
    this.hasWeapon = true;
    const pistolDef = BALANCE.weapons.pistol;
    this.weaponAmmo = {
      pistol: { mag: pistolDef.magazineSize, reserve: pistolDef.magazineSize * 2 },
    };
    this.activeWeapon = "pistol";
    this.activeSlot = 1;
    this.showWeaponMessage("PISTOL ACQUIRED", "#44dd44");
    this.audio.playSound("sfx-reload-complete", 0.5);
  }

  private endKyleIntroCutscene() {
    hudState.update({ kyleDialogueActive: false, kyleCutsceneActive: false, kyleDialogueCanAdvance: false });

    // Force-open starting door so zombies can path (cutscene bypasses normal door interaction)
    if (!this.startingDoorOpened) {
      this.startingDoorOpened = true;
      this.reachableDirty = true;
      if (this.startingDoorBody) {
        this.obstacles.remove(this.startingDoorBody);
        this.startingDoorBody.destroy();
        this.startingDoorBody = undefined;
      }
      // Clear door tiles + pathfinding
      const doorLeftCol = Math.floor((this.startDoorX - this.startDoorW / 2) / 32);
      const doorTopRow = Math.floor((this.startDoorY - this.startDoorH / 2) / 32);
      const doorRightCol = Math.ceil((this.startDoorX + this.startDoorW / 2) / 32);
      const doorBottomRow = Math.ceil((this.startDoorY + this.startDoorH / 2) / 32);
      for (let row = doorTopRow; row < doorBottomRow; row++) {
        for (let col = doorLeftCol; col < doorRightCol; col++) {
          this.wallsBaseLayer?.removeTileAt(col, row);
          this.pathfinder.setWalkable(col, row, true);
        }
      }
      if (this.startingDoorPrompt) {
        this.startingDoorPrompt.destroy();
        this.startingDoorPrompt = undefined;
      }
    }

    // Complete the investigate objective, set search tables objective
    this.completeObjective("investigate_rudys");
    this.showDeskGlows();

    // Retract letterbox — camera already follows player from fadeToKyleInterior
    hudState.update({ letterboxActive: false });
    this.time.delayedCall(500, () => {
      this.kyleIntroPhase = "done";
      this.player.cutsceneControlled = false;
      this.physics.resume();
      this.startKylePacing();
      this.startKyleAmbientVO();
    });
  }

  private skipKyleIntroCutscene() {
    if (this.kyleIntroPhase === "" || this.kyleIntroPhase === "done") return;

    // Cancel any pending timers
    if (this.kyleAutoAdvanceTimer) {
      this.kyleAutoAdvanceTimer.destroy();
      this.kyleAutoAdvanceTimer = undefined;
    }

    // Stop any playing Kyle VO
    this.sound.stopByKey("vo-kyle-look-out");
    this.sound.stopByKey("vo-kyle-almost-got-ya");
    this.sound.stopByKey("vo-kyle-ever-use-one");
    this.sound.stopByKey("vo-kyle-mason-exposition-1");
    this.sound.stopByKey("vo-kyle-mason-exposition-2");
    this.sound.stopByKey("vo-kyle-mason-exposition-3");
    this.sound.stopByKey("vo-kyle-mason-exposition-4");
    this.sound.stopByKey("vo-kyle-good-luck");
    this.sound.stopByKey("vo-kyle-supplies");
    this.sound.stopByKey("vo-kyle-zyns");

    // Stop running footsteps
    if (this.kyleCSRunningSound?.isPlaying) this.kyleCSRunningSound.stop();
    this.kyleCSRunningSound = null;

    // Destroy scripted zombie if still alive
    if (this.kyleScriptedZombie) {
      this.enemies.remove(this.kyleScriptedZombie, false, false);
      if (this.kyleScriptedZombie.active) this.kyleScriptedZombie.destroy();
      this.kyleScriptedZombie = null;
    }

    // Position player and Kyle inside Rudy's
    const playerX = 80 * 32 + 16;
    const playerY = 55 * 32 + 16;
    const kyleX = 80 * 32 + 16;
    const kyleY = 53 * 32 + 16;
    this.player.setPosition(playerX, playerY);
    this.player.body.setVelocity(0, 0);
    this.player.currentDir = "north";
    const pIdleKey = getAnimKey(this.characterDef.id, "breathing-idle", "north");
    if (this.anims.exists(pIdleKey)) this.player.play(pIdleKey, true);

    // Ensure Kyle NPC exists and position inside
    if (!this.kyleNpc) this.spawnKyleNpcCutscene();
    if (this.kyleNpc) {
      // Kill any active cutscene walk tweens on Kyle before repositioning
      try { this.tweens.killTweensOf(this.kyleNpc); } catch {}
      this.kyleNpc.setPosition(kyleX, kyleY);
      (this.kyleNpc.body as Phaser.Physics.Arcade.Body)?.setVelocity(0, 0);
      const kIdleKey = getAnimKey("kyle", "breathing-idle", "south");
      if (this.anims.exists(kIdleKey)) this.kyleNpc.play(kIdleKey, true);
    }

    // Force camera to player — clear any mid-cutscene fade
    this.cameras.main.stopFollow();
    this.cameras.main.resetFX();
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    // Handle room visibility
    this.audio.stopTheme("themeCreepybass", 200);
    this.audio.startRoomTone();
    this.playerInsideBuilding = true;
    this.setOutdoorLayersVisible(false);
    if (this.roofLayer) {
      this.roofLayer.setAlpha(0);
      this.roofVisible = false;
    }
    this.currentZoneName = null;

    // Give pistol
    this.givePlayerPistol();

    // End cutscene
    this.endKyleIntroCutscene();
  }

  // ─── Kyle NPC Pacing ───

  // Points of interest inside Rudy's (tile coords → px) for Kyle to wander between
  private readonly KYLE_PACE_POINTS = [
    { x: 78 * 32 + 16, y: 53 * 32 + 16 },  // near cabinets (north-west)
    { x: 82 * 32 + 16, y: 53 * 32 + 16 },  // near cabinets (north-east)
    { x: 78 * 32 + 16, y: 56 * 32 + 16 },  // near desks (south-west)
    { x: 82 * 32 + 16, y: 56 * 32 + 16 },  // near desks (south-east)
    { x: 80 * 32 + 16, y: 54 * 32 + 16 },  // center of room
  ];

  private startKylePacing() {
    this.kylePacing = true;
    this.pickKylePaceTarget();
  }

  /** Kyle randomly says ambient lines while pacing — every 20-45s */
  private startKyleAmbientVO() {
    const canPlayVO = () =>
      this.currentZoneName === "rudys" && this.kyleNpc?.active
      && !this.scaryboiIntroActive && !this.masonCutsceneActive && !this.kyleIntroActive
      && !this.gameOver;

    const scheduleNext = () => {
      const delay = 20000 + Math.random() * 25000;
      this.kyleAmbientVOTimer = this.time.delayedCall(delay, () => {
        if (canPlayVO()) {
          const vo = this.KYLE_AMBIENT_VO[Math.floor(Math.random() * this.KYLE_AMBIENT_VO.length)];
          this.audio.playSound(vo, 0.5);
        }
        scheduleNext();
      });
    };
    // First line comes sooner (5-10s after cutscene ends)
    this.kyleAmbientVOTimer = this.time.delayedCall(5000 + Math.random() * 5000, () => {
      if (canPlayVO()) {
        this.audio.playSound("vo-kyle-good-luck", 0.5);
      }
      scheduleNext();
    });
  }

  private pickKylePaceTarget() {
    if (!this.kyleNpc || !this.kylePacing) return;
    // Pick a random point that isn't too close to current position
    const points = this.KYLE_PACE_POINTS.filter(p => {
      const dist = Phaser.Math.Distance.Between(this.kyleNpc!.x, this.kyleNpc!.y, p.x, p.y);
      return dist > 48;
    });
    if (points.length === 0) return;
    this.kylePaceTarget = points[Math.floor(Math.random() * points.length)];
  }

  private updateKylePacing() {
    if (!this.kylePacing || !this.kyleNpc || !this.kylePaceTarget) return;
    if (this.kyleIntroActive) return; // don't pace during cutscene

    const kyle = this.kyleNpc;
    const target = this.kylePaceTarget;
    const dist = Phaser.Math.Distance.Between(kyle.x, kyle.y, target.x, target.y);

    if (dist < 8) {
      // Arrived — idle for a few seconds, then pick new target
      const body = kyle.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(0, 0);
      this.kylePaceTarget = null;

      // Play idle animation facing current direction
      const dir: Direction = (kyle.getData("lastDir") as Direction) || "south";
      const idleKey = getAnimKey("kyle", "breathing-idle", dir);
      if (this.anims.exists(idleKey)) kyle.play(idleKey, true);

      // Wait 3-6 seconds before next move
      const waitMs = 3000 + Math.random() * 3000;
      this.time.delayedCall(waitMs, () => this.pickKylePaceTarget());
      return;
    }

    // Walk toward target
    const angle = Phaser.Math.Angle.Between(kyle.x, kyle.y, target.x, target.y);
    const speed = 30;
    const body = kyle.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);

    // Determine direction and play walk animation
    const deg = Phaser.Math.RadToDeg(angle);
    const dir = this.angleToDir8(deg);
    const prevDir = kyle.getData("lastDir") as string;
    if (dir !== prevDir) {
      kyle.setData("lastDir", dir);
      const walkKey = getAnimKey("kyle", "walk", dir);
      if (this.anims.exists(walkKey)) kyle.play(walkKey, true);
    }
  }

  private angleToDir8(deg: number): Direction {
    // Normalize to 0-360
    const a = ((deg % 360) + 360) % 360;
    if (a >= 337.5 || a < 22.5) return "east";
    if (a >= 22.5 && a < 67.5) return "south-east";
    if (a >= 67.5 && a < 112.5) return "south";
    if (a >= 112.5 && a < 157.5) return "south-west";
    if (a >= 157.5 && a < 202.5) return "west";
    if (a >= 202.5 && a < 247.5) return "north-west";
    if (a >= 247.5 && a < 292.5) return "north";
    return "north-east";
  }

  // Fixed spawn positions per encounter (tile coords × 32, centered in tile)
  private readonly SCARYBOI_SPAWN: Record<"gate" | "library" | "estate", { x: number; y: number }> = {
    gate:    { x: 20 * 32 + 16, y: 35 * 32 + 16 },
    library: { x: 12 * 32 + 16, y: 45 * 32 + 16 },
    estate:        { x: 33 * 32 + 16, y: 22 * 32 + 16 },
  };

  // Per-encounter cutscene data — quote and VO are easy to swap later
  private readonly SCARYBOI_CUTSCENE_DATA: Record<"gate" | "library" | "estate", { quotes: { text: string; startMs: number; durationMs: number }[]; voSrc: string }> = {
    gate: {
      quotes: [
        { text: "You know, there's a big party going on inside...", startMs: 400, durationMs: 4500 },
        { text: "But your name isn't on the guest list.", startMs: 5300, durationMs: 3000 },
      ],
      voSrc: "/assets/audio/voice/scaryboi-vo-zone2.mp3",
    },
    library: {
      quotes: [
        { text: "The righteous BigBaby will bless us all with his tasty beats tonight...", startMs: 400, durationMs: 6500 },
        { text: "Unfortunately, you will not live to hear them..", startMs: 7300, durationMs: 2700 },
      ],
      voSrc: "/assets/audio/voice/scaryboi-vo-south.mp3",
    },
    estate: {
      quotes: [
        { text: "BigBaby's dancefloor has no tolerance for Jabronis and Sussybakas...", startMs: 2800, durationMs: 6500 },
        { text: "And neither do I.", startMs: 9800, durationMs: 2300 },
      ],
      voSrc: "/assets/audio/voice/scaryboi-vo-estate.mp3",
    },
  };

  /** Spawn SCARYBOI for a specific encounter */
  private spawnScaryboiEncounter(enc: "gate" | "library" | "estate") {
    const encConfig = this.zoneSpawnManager.getCurrentEncounterConfig();

    // Mark location triggers so they don't re-fire
    if (enc === "gate") this.scaryboiGateTriggered = true;
    if (enc === "library") this.scaryboiLibraryTriggered = true;
    if (enc === "estate") this.scaryboiEstateTriggered = true;

    const { x: spawnX, y: spawnY } = this.SCARYBOI_SPAWN[enc];

    // Proximity fade already started creepybass — just clear the flag
    this.scaryboiProximityFade = false;
    this.audio.startTheme("theme-creepybass", "themeCreepybass", 0.2, false, 1500);

    // Every encounter gets a cutscene — first has backflip, subsequent are shorter
    const isFirst = !this.zoneSpawnManager.hasSeenScaryboi();
    if (isFirst) this.zoneSpawnManager.markScaryboiSeen();
    this.playScaryboiCutscene(spawnX, spawnY, encConfig, enc as "gate" | "library" | "estate", isFirst);

    // Estate: seal door behind player
    if (enc === "estate") {
      const estateDoor = this.doors.find(d => d.label === "gate2");
      if (estateDoor && estateDoor.opened) {
        (estateDoor.zone.body as Phaser.Physics.Arcade.StaticBody).enable = true;
        for (const t of estateDoor.savedTiles) {
          this.getDoorLayer(t.layer)?.putTileAt(t.gid, t.col, t.row);
          this.pathfinder.setWalkable(t.col, t.row, false);
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
    const isIndoor = enc === "library";
    boss.initBossEncounter(gracePeriodMs, isIndoor);
    this.zoneSpawnManager.registerBossEnemy(boss);

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
    enc: "gate" | "library" | "estate",
    isFirst: boolean
  ) {
    this.scaryboiIntroActive = true;
    this.scaryboiCutsceneGracePeriodMs = encConfig.gracePeriodMs;
    this.scaryboiCutsceneIsIndoor = enc === "library";
    this.pendingScaryboiSpawn = { x: spawnX, y: spawnY, hpPercent: encConfig.hpPercent, gracePeriodMs: encConfig.gracePeriodMs, enc, isFirst };
    this.physics.pause();
    this.game.canvas.style.pointerEvents = "none";

    // Switch player to breathing-idle immediately
    const idleKey = getAnimKey(this.characterDef.id, "breathing-idle", this.player.currentDir);
    if (this.anims.exists(idleKey)) this.player.play(idleKey, true);

    // Show Skip Cutscene button immediately (quotes/VO load later in onBannerReady)
    hudState.update({ scaryboiIntroActive: true, letterboxActive: true });

    // After bars settle (500ms CSS transition), spawn boss in cutscene mode
    this.time.delayedCall(500, () => {
      // Bail if cutscene was already skipped during the delay
      if (!this.scaryboiIntroActive) return;

      const maxHp = (BALANCE.enemies.boss as any).hp as number;
      const boss = new Enemy(this, spawnX, spawnY, "boss", 1, 1);
      boss.health = Math.round(maxHp * encConfig.hpPercent);
      boss.maxHealth = maxHp;
      boss.body.setCollideWorldBounds(true);
      boss.bossCutscene = true;
      boss.setFacing("south");
      this.enemies.add(boss);
      this.zoneSpawnManager.registerBossEnemy(boss);
      this.scaryboiCutsceneBoss = boss;

      // Encounter 1: full sequence (smoke → backflip → idle)
      // Encounters 2+: short sequence (smoke → idle, no backflip)
      const cutsceneData = this.SCARYBOI_CUTSCENE_DATA[enc];
      const onBannerReady = () => {
        // Bail if cutscene was skipped during the spawn animation
        if (!this.scaryboiIntroActive) return;
        this.scaryboiBannerReady = true;
        hudState.update({
          scaryboiIntroActive: true,
          scaryboiEncounterIndex: isFirst ? 0 : enc === "library" ? 1 : 2,
          scaryboiQuotes: cutsceneData.quotes.map(q => q.text),
          scaryboiQuoteTimings: cutsceneData.quotes.map(q => ({ startMs: q.startMs, durationMs: q.durationMs })),
          scaryboiVoSrc: cutsceneData.voSrc,
        });
      };
      if (isFirst) {
        boss.playCutsceneSequence(onBannerReady);
      } else {
        boss.playCutsceneSequenceShort(onBannerReady);
      }
    });
  }

  /** Dismiss the SCARYBOI cutscene (Space key or "Bring it" button) */
  private dismissScaryboiIntro() {
    if (!this.scaryboiIntroActive || this.scaryboiDismissing) return;
    this.scaryboiDismissing = true;
    this.scaryboiBannerReady = false;

    // Fade out creepy bass, switch to intense theme for the fight
    this.audio.stopTheme("themeCreepybass", 1000);
    this.audio.stopTheme("themeMain", 500);
    this.audio.startTheme("theme-intense", "themeIntense", 0.25, true, 1500);

    // Hide React banner immediately
    hudState.update({ scaryboiIntroActive: false });
    this.game.canvas.style.pointerEvents = "auto";

    // Retract letterbox bars (React CSS transition)
    hudState.update({ letterboxActive: false });

    // Resume gameplay after bars slide out, then hand off to boss
    this.time.delayedCall(500, () => {
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
      this.pendingScaryboiSpawn = null;
    });
  }

  /** Skip SCARYBOI cutscene immediately (ESC key or Skip button) */
  private skipScaryboiCutscene() {
    if (!this.scaryboiIntroActive) return;

    // Clear React UI
    hudState.update({ scaryboiIntroActive: false, letterboxActive: false });
    this.game.canvas.style.pointerEvents = "auto";

    // Resume physics and end cutscene state
    this.scaryboiIntroActive = false;
    this.scaryboiDismissing = false;
    this.scaryboiBannerReady = false;
    this.physics.resume();

    // Theme transition
    this.audio.stopTheme("themeCreepybass", 500);
    this.audio.stopTheme("themeMain", 500);
    this.audio.startTheme("theme-intense", "themeIntense", 0.25, true, 1000);

    // If boss was already spawned during cutscene, start encounter
    if (this.scaryboiCutsceneBoss?.active) {
      this.scaryboiCutsceneBoss.bossCutscene = false;
      this.scaryboiCutsceneBoss.startEncounterAfterCutscene(
        this.scaryboiCutsceneGracePeriodMs,
        this.scaryboiCutsceneIsIndoor
      );
      this.scaryboiCutsceneBoss = null;
    } else if (this.pendingScaryboiSpawn) {
      // Boss hasn't spawned yet (skipped during letterbox delay) — spawn now
      const p = this.pendingScaryboiSpawn;
      this.doScaryboiSpawn(p.x, p.y, p.hpPercent, p.gracePeriodMs, p.enc);
    }
    this.pendingScaryboiSpawn = null;
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
        this.showWeaponMessage("RPG", "#ffdd44");
        this.audio.playSound("sfx-reload-complete", 0.5);
        pickup.destroy();
        this.events.off("update", checkPickup);
      }
    };
    this.events.on("update", checkPickup);
  }

  private readonly doorPromptDist = 60; // px from door center to show prompt

  private updateDoorPrompts() {
    for (const door of this.doors) {
      if (door.broken || door.opened) continue;

      const dist = Phaser.Math.Distance.Between(
        this.player.x, this.player.y,
        door.zone.x, door.zone.y
      );

      if (dist < this.doorPromptDist) {
        const displayName = door.label.toLowerCase().includes("gate") ? "Gate" : "Door";
        if (door.locked) {
          const label = isPublicBuild() ? "LOCKED" : `${displayName} — Locked`;
          this.setActivePrompt(label, door.zone.x, door.zone.y - 14, false);
        } else {
          const effectiveCost = door.paid ? 0 : door.cost;
          const canAfford = this.currency >= effectiveCost;
          const costText = effectiveCost > 0 ? ` — $${effectiveCost}` : "";
          const label = `E  ${displayName}${costText}`;
          this.setActivePrompt(label, door.zone.x, door.zone.y - 14, canAfford);
        }
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
          // Can't afford — prompt is already red via React canAfford:false
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
          this.pathfinder.setWalkable(t.col, t.row, true);
        }
        const displayName = door.label.toLowerCase().includes("gate") ? "Gate" : "Door";
        this.showWeaponMessage(`${displayName} Opened`, "#44dd44");
        this.audio.playSound("sfx-door-open", 0.5);
        this.audio.playSound("sfx-buy", 0.4);
        // Notify WaveManager when gate1 opens (triggers gate SCARYBOI encounter)
        if (door.label === "gate1") {
          // gate opened — zone spawning checks door state dynamically
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
    this.audio.playSound("sfx-hit-classic", 0.4);

    if (door.health > 0) {
      // Silent — no percentage display
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
      this.pathfinder.setWalkable(t.col, t.row, true);
    }

    // Legacy Phaser prompt cleanup
    if (door.promptText) {
      door.promptText.destroy();
      door.promptText = undefined;
    }

    const displayName = door.label.toLowerCase().includes("gate") ? "Gate" : "Door";
    this.showWeaponMessage(`${displayName} Destroyed`, "#ff4444");
    if (door.label === "gate1") {
      // gate opened — zone spawning checks door state dynamically
    }
    this.audio.playSound("sfx-fence-break", 0.5);
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
        this.setActivePrompt("E  Turn on Generator", this.generator.x, this.generator.y - 14);
      }
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
          label = `E  ${machine.label} — $${machine.cost}`;
        }
        this.setActivePrompt(label, machine.x, machine.y - 14, canAfford);
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
    // Generator power-on sequence: switch click → spark → electrical buzz
    this.audio.playSound("sfx-gen-switch", 0.6);
    this.time.delayedCall(200, () => this.audio.playSound("sfx-gen-spark", 0.5));
    this.time.delayedCall(500, () => {
      this.audio.playSound("sfx-gen-buzz", 0.4);
      // Persistent low hum — only audible inside north_building (managed in update)
      this.genHumSound = this.sound.add("sfx-gen-hum", { loop: true, volume: 0 });
      this.genHumSound.play();
      // Fade in if player is already in the room
      if (this.currentZoneName === "north_building") {
        this.tweens.add({ targets: this.genHumSound, volume: 0.08, duration: 500 });
      }
    });
    this.completeObjective("power_on");

    // Brighten Rudy's interior lights — power restored, cold white fluorescent
    // Keep intensity low to avoid Light2D color overflow (two overlapping lights)
    for (const light of this.rudysInteriorLights) {
      this.tweens.killTweensOf(light);
      light.color.set(0xc8d0e0); // cold blue-white — convenience store at 2am
      this.tweens.add({
        targets: light,
        intensity: 0.35,
        duration: 1000,
        ease: "Sine.easeOut",
      });
    }

    // Generator glow — warm light around the generator
    if (this.generator) {
      const genGlow = this.lights.addLight(this.generator.x, this.generator.y, 120, 0xffaa44, 0);
      this.tweens.add({ targets: genGlow, intensity: 0.6, duration: 1000, ease: "Sine.easeOut" });
    }

    // Zyn machine glow — cool blue/purple vending machine light
    for (const machine of this.machines) {
      if (machine.machineType === "zyn") {
        const zynGlow = this.lights.addLight(machine.x, machine.y, 100, 0x66ccff, 0);
        this.tweens.add({ targets: zynGlow, intensity: 0.5, duration: 1000, ease: "Sine.easeOut" });
      }
    }

    // Streetlamps — stop flickering, fade to steady
    for (const sl of this.streetlampLights) {
      this.tweens.killTweensOf(sl.light);
      this.tweens.add({
        targets: sl.light,
        intensity: sl.intensity,
        duration: 1500,
        ease: "Sine.easeOut",
      });
    }

    // Rudy's exterior window glow — icy blue light spilling out through windows
    const rudysExtX = 80 * 32 + 16; // center of Rudy's
    const rudysExtY = 57 * 32;      // near the front/south side of the building
    const windowGlow = this.lights.addLight(rudysExtX, rudysExtY, 200, 0x8ec8e8, 0);
    this.tweens.add({ targets: windowGlow, intensity: 0.5, duration: 2000, ease: "Sine.easeOut" });

    // Activate all power_on triggered lights (candles in rooms)
    this.fireLandmarkTrigger("power_on");

    // Room lighting — north building, library, estate lower hall get dim ambient light on power-on
    // (Not the club — that has its own rave atmosphere)
    const roomLights: { x: number; y: number; radius: number }[] = [
      { x: 192, y: 304, radius: 300 },   // north_building
      { x: 272, y: 1392, radius: 320 },   // library
      { x: 1524, y: 704, radius: 350 },   // estate_lower_hall
    ];
    for (const rl of roomLights) {
      const light = this.lights.addLight(rl.x, rl.y, rl.radius, 0xddc89a, 0);
      this.tweens.add({ targets: light, intensity: 0.4, duration: 2000, ease: "Sine.easeOut" });
    }

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
      this.audio.playSound("sfx-buy", 0.5);

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
    if (this.intermissionLocked) return; // shop locked after 30s expired
    this.shopOpen = true;
    this.shopNavCol = 0;
    this.shopNavRow = 0;
    this.shopSelectedIndex = this.shopGrid[0]?.[0] ?? 0;
    this.player.body?.setVelocity(0, 0);
    this.pushShopData();
    this.updateHUD();
  }

  private closeShop() {
    this.shopOpen = false;
    this.updateHUD();
  }

  private setShopSignClosed() {
    if (this.shopSign) {
      this.shopSign.setTexture("sign-closed");
      this.shopSign.setTint(0x888888);
    }
    if (this.shopSignGlow) {
      this.lights.removeLight(this.shopSignGlow);
      this.shopSignGlow = null;
    }
  }

  private startWaveCountdown() {
    this.waveStartTimer = 3000;
    hudState.update({ waveStartCountdown: 3 });
  }

  private updateWaveStartTimer(delta: number) {
    if (this.waveStartTimer < 0) return;
    this.waveStartTimer -= delta;
    const secs = Math.ceil(this.waveStartTimer / 1000);
    if (this.waveStartTimer <= 0) {
      this.waveStartTimer = -1;
      hudState.update({ waveStartCountdown: -1 });
      // No wave advance — zone spawning is continuous
    } else {
      hudState.update({ waveStartCountdown: secs });
    }
  }

  private updateIntermissionTimer(delta: number) {
    if (this.intermissionTimer <= 0) return;

    this.intermissionTimer -= delta;
    const secs = Math.max(0, Math.ceil(this.intermissionTimer / 1000));
    hudState.update({ intermissionTimer: secs });

    if (this.intermissionTimer <= 0) {
      this.intermissionTimer = 0;
      hudState.update({ intermissionTimer: 0 });

      if (this.audio.roomTone?.isPlaying) {
        // Player is inside Rudy's — lock shop and desks
        this.intermissionLocked = true;
        if (this.shopOpen) this.closeShop();
        this.setShopSignClosed();
        this.showWeaponMessage("TIME'S UP — GET OUTSIDE", "#ff4444");
      } else {
        // Player is outside — start wave countdown
        this.intermissionTimer = -1;
        this.intermissionLocked = false;
        hudState.update({ intermissionTimer: -1 });
        this.setShopSignClosed();
        this.startWaveCountdown();
      }
    }
  }

  private skipIntermission() {
    if (this.intermissionTimer <= 0) return;

    this.intermissionTimer = -1;
    this.intermissionLocked = false;
    hudState.update({ intermissionTimer: -1 });
    this.setShopSignClosed();
    this.startWaveCountdown();
  }

  // ─── Kyle NPC Shop Interaction ───

  private updateKyleShopPrompt() {
    if (!this.kyleNpc || !this.kylePacing) return;
    // Don't show shop prompt until all supply desks are looted
    if (this.rudysDesks.length > 0 && !this.rudysDesks.every(d => !d.stocked)) return;

    const dist = Phaser.Math.Distance.Between(
      this.player.x, this.player.y, this.kyleNpc.x, this.kyleNpc.y
    );
    if (dist < this.interactDist) {
      this.setActivePrompt("E  Shop", this.kyleNpc.x, this.kyleNpc.y - 14);
    }
  }

  private tryInteractKyle(): boolean {
    if (!this.kyleNpc || !this.kylePacing) return false;
    // Can't shop until all supply desks are looted
    if (this.rudysDesks.length > 0 && !this.rudysDesks.every(d => !d.stocked)) return false;

    const dist = Phaser.Math.Distance.Between(
      this.player.x, this.player.y, this.kyleNpc.x, this.kyleNpc.y
    );
    if (dist >= this.interactDist) return false;

    this.openShop();
    return true;
  }

  private buyItem(index: number) {
    const item = BALANCE.shop.items[index];
    const price = this.getItemPrice(index);
    if (this.currency < price) {
      this.audio.playSound("sfx-error", 0.3);
      return;
    }

    const itemId = item.id;

    switch (itemId) {
      case "first_aid": {
        if (this.bandageCount >= BALANCE.bandage.maxStack) {
          this.showWeaponMessage("BANDAGES FULL", "#ff4444");
          return;
        }
        this.currency -= price;
        this.bandageCount++;
        this.assignConsumableSlot("bandage");
        this.showWeaponMessage("+1 BANDAGE", "#44dd44");
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
      case "landmine": {
        const trapType = itemId as TrapType;
        const current = this.trapInventory.get(trapType) ?? 0;
        if (current >= BALANCE.traps.maxPerType) {
          return;
        }
        this.currency -= price;
        this.trapInventory.set(trapType, current + 1);
        this.assignConsumableSlot("mine");
        break;
      }
      case "grenade": {
        if (this.grenadeCount >= BALANCE.grenade.maxCount) return;
        this.currency -= price;
        this.grenadeCount++;
        this.player.grenadeCount = this.grenadeCount;
        this.assignConsumableSlot("grenade");
        break;
      }
    }

    this.audio.playSound("sfx-buy", 0.4);
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

    // Time survived for HUD
    const survivalSecs = Math.floor(this.timeSurvived / 1000);

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
      activeItemType: this.isWeaponSlot(this.activeSlot) ? "weapon" : null,
      ammo: this.currentAmmo?.mag ?? 0,
      maxAmmo: this.currentWeaponDef?.magazineSize ?? 0,
      reserveAmmo: this.currentAmmo?.reserve ?? 0,
      reloading: this.reloading,
      barricadeCount: this.trapInventory.get("barricade" as TrapType) ?? 0,
      mineCount: this.trapInventory.get("landmine" as TrapType) ?? 0,
      grenadeCount: this.grenadeCount,
      bandageCount: this.bandageCount,
      abilityName: this.characterDef.ability.name,
      abilityCooldown: this.abilityCooldownTimer > 0 ? this.abilityCooldownTimer / 1000 : 0,
      abilityMaxCooldown: this.characterDef.ability.cooldown,
      abilityKey: "Q",
      kills: this.kills,
      currency: this.currency,
      wave: survivalSecs, // repurposed: time survived in seconds
      waveState: "active" as const, // always active in zone mode
      waveEnemiesLeft: 0,
      waveCountdown: -1,
      characterName: this.characterDef.name,
      characterId: this.characterDef.id,
      hudVisible: true,
      cutsceneActive: this.scaryboiIntroActive || this.masonCutsceneActive || this.axePickupActive || this.masonRavePhase === "rave_setup" || this.kyleIntroActive,
      currentObjective: this.getCurrentObjective(),
      shopOpen: this.shopOpen,
      paused: this.paused,
      gameOver: this.gameOver,
      settingsOpen: this.settingsOpen,
      sfxVolume: this.audio.sfxVolume,
      zoomEnabled: this.zoomEnabled,
      flashlightOn: this.flashlightUserOn,
      crouching: this.player.crouching,
      statsOpen: this.statsOpen,
      // Stats data (computed when inventory or stats is open)
      ...((this.statsOpen || this.inventoryOpen) ? {
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
      consumableSlots: this.buildConsumableSlots(),
      consumableActiveSlot: this.consumableActiveFlash,
    });
  }

  // ------- Level-Up (React-rendered) -------

  private showLevelUpUI(level: number, options: BuffOption[]) {
    // Close shop first so it does not bleed through the inventory backdrop
    if (this.shopOpen) this.closeShop();
    this.levelUpActive = true;
    this.zoneSpawnManager.setFrozen(true);
    this.player.body?.setVelocity(0, 0);
    this.audio.playSound("sfx-level-up", 0.5);
    hudState.update({ levelUpActive: true, levelUpLevel: level, levelUpOptions: options });
    // Open inventory screen to show buff choices alongside stats
    if (!this.inventoryOpen) {
      this.inventoryOpen = true;
      this.pushInventoryData();
      hudState.update({ inventoryOpen: true });
    }
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
    this.zoneSpawnManager.setFrozen(false);
    this.audio.playSound("sfx-buff-confirm", 0.4);
    hudState.update({ levelUpActive: false });
    // Close inventory screen after buff selection
    this.dismissInventory();
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
    }
    // No auto shop — player visits Kyle in Rudy's during intermission
  }
}
