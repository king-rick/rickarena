import Phaser from "phaser";
import { Enemy, EnemyType } from "../entities/Enemy";
import { BALANCE } from "../data/balance";

// Endicott Estate map — 100x60 tiles at 32px (surface is first 60 cols)
const MAP_WIDTH = 100 * 32;  // 3200 (full), surface play area is ~60*32 = 1920
const MAP_HEIGHT = 60 * 32;  // 1920
const SURFACE_WIDTH = 60 * 32; // 1920 — only spawn in surface area

// ─── Exclusion zones — never spawn enemies inside these ───
const EXCLUSION_ZONES = [
  { x: 50, y: 50, w: 280, h: 500 },       // NW building interior
  { x: 10, y: 1170, w: 520, h: 480 },     // SW building interior
  { x: 920, y: 220, w: 300, h: 850 },     // Estate interior (left section)
  { x: 1200, y: 60, w: 610, h: 940 },     // Estate interior (right section)
  { x: 1920, y: 0, w: 1280, h: 1920 },     // Underground area (cols 60+, entire right side)
];

function isExcluded(x: number, y: number): boolean {
  for (const z of EXCLUSION_ZONES) {
    if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) return true;
  }
  return false;
}

// ─── Gated spawn zones — locked until the associated door opens ───
// Each zone defines an area that enemies CANNOT spawn in until isUnlocked() returns true.
// Everything outside these zones is the default "starting area" and always active.
export interface GatedZone {
  label: string; // matches door label
  x: number;
  y: number;
  w: number;
  h: number;
}

const GATED_ZONES: GatedZone[] = [
  // Left side of map — gated by the Gate ($300)
  { label: "Gate", x: 0, y: 0, w: 672, h: 1920 },
  // Upper/estate area — gated by Estate Entrance ($500)
  { label: "Estate Entrance", x: 620, y: 0, w: 1300, h: 1100 },
];

// ─── Room zones — detect player camping in enclosed areas ───
// When the player stays in a room, flanking zombies spawn at entrance points
const ROOM_ZONES = [
  { label: "NW Building", x: 50, y: 50, w: 280, h: 500,
    entrances: [{ x: 190, y: 570 }] },
  { label: "SW Building", x: 10, y: 1170, w: 520, h: 480,
    entrances: [{ x: 383, y: 1155 }] },
  { label: "Estate", x: 920, y: 60, w: 890, h: 980,
    entrances: [{ x: 1058, y: 1060 }] },
];

// Dog spawn points — spread across the map edges (used by dog manager)
const DOG_SPAWN_POINTS = [
  { x: 880, y: 1880 }, { x: 864, y: 50 }, { x: 40, y: 750 },
  { x: 1800, y: 400 }, { x: 1850, y: 900 }, { x: 100, y: 1800 },
  { x: 50, y: 200 }, { x: 1700, y: 1300 },
];

// Spawn radius around the player (25 tiles = 800px)
const SPAWN_RADIUS = 800;
// Minimum distance from player (don't spawn right on top of them)
const SPAWN_MIN_DIST = 250;

export type WaveState =
  | "pre_game" // Brief countdown before wave 1
  | "active" // Enemies spawning and being fought
  | "clearing" // All spawned, waiting for last kills
  | "intermission"; // 30s rest / shop window

interface WaveManagerConfig {
  scene: Phaser.Scene;
  enemies: Phaser.Physics.Arcade.Group;
  playerCount: number;
  getPlayerPos: () => { x: number; y: number };
  isFieldTile?: (tileX: number, tileY: number) => boolean; // true if tile is open field (ground only, no buildings/props)
  isDoorOpen?: (label: string) => boolean; // true if the named door has been opened or broken
  isCollisionFree?: (wx: number, wy: number) => boolean; // true if world position doesn't overlap a collision object
}

export class WaveManager {
  private scene: Phaser.Scene;
  private enemies: Phaser.Physics.Arcade.Group;
  private playerCount: number;
  private getPlayerPos: () => { x: number; y: number };

  // Wave tracking
  state: WaveState = "pre_game";
  wave = 0;

  // Spawn tracking for current wave
  private enemiesToSpawn = 0;
  private enemiesAlive = 0;
  private totalWaveEnemies = 0;
  private spawnTimer = 0;

  // State timers
  private stateTimer = 0;
  private frozen = false;
  spawningDisabled = false;
  private preGameDuration = 3000;
  private countdownDuration = 3000;
  private intermissionDuration = 30000;
  private readyUp = false;
  private readyCountdown = 0;

  // SCARYBOI encounter system — HP/flee tied to encounter ORDER, not location
  private bossActive = false;
  bossEnemy: Enemy | null = null;
  private scaryboiEncounters = { zone2: false, southBuilding: false, estate: false };
  private scaryboiDefeated = false;
  private scaryboiFirstSeen = false;
  private gateOpenedWave: number | null = null;
  private activeEncounter: "zone2" | "southBuilding" | "estate" = "zone2";
  private scaryboiEncounterCount = 0; // how many encounters have been completed (0, 1, 2)


  // Persistent dog pack system
  private dogs: Enemy[] = [];
  private dogRespawnQueue: number[] = []; // timestamps when each dead dog can respawn
  private isFieldTile: (tileX: number, tileY: number) => boolean;
  private isDoorOpen: (label: string) => boolean;
  private isCollisionFree: (wx: number, wy: number) => boolean;

  // Room pressure — flanking spawns when player camps in a room
  playerInRoom = false;
  private roomTimer = 0; // ms player has been in a room
  private roomFlankTimer = 0; // ms until next flanking spawn burst
  private currentRoom: typeof ROOM_ZONES[number] | null = null;
  private readonly ROOM_FLANK_DELAY = 8000; // 8s before first flank spawns
  private readonly ROOM_FLANK_INTERVAL = 12000; // 12s between flank bursts
  private readonly ROOM_FLANK_COUNT = 2; // zombies per flank burst

  // Callbacks
  onWaveStart?: (wave: number) => void;
  onIntermissionStart?: (wave: number) => void;
  onStateChange?: (state: WaveState) => void;
  onBossFlee?: () => void;
  onEncounterTrigger?: (enc: "zone2" | "southBuilding" | "estate") => void;
  onBossKilled?: () => void;


  constructor(config: WaveManagerConfig) {
    this.scene = config.scene;
    this.enemies = config.enemies;
    this.playerCount = config.playerCount;
    this.getPlayerPos = config.getPlayerPos;
    this.isFieldTile = config.isFieldTile ?? (() => true);
    this.isDoorOpen = config.isDoorOpen ?? (() => true);
    this.isCollisionFree = config.isCollisionFree ?? (() => true);
  }

  update(delta: number) {
    // Maintain persistent dog pack (always running, even during intermission)
    this.updateDogs(delta);

    // Room pressure — detect player camping and spawn flanking zombies
    this.updateRoomPressure(delta);

    switch (this.state) {
      case "pre_game":
        // Pre-game waits indefinitely — wave 1 starts when player opens starting door
        break;

      case "active":
        this.spawnTimer += delta;
        if (
          this.enemiesToSpawn > 0 &&
          !this.spawningDisabled &&
          this.spawnTimer >= BALANCE.waves.spawnStaggerMs
        ) {
          this.spawnTimer = 0;
          this.spawnNextEnemy();
        }

        // Check SCARYBOI flee condition
        if (this.bossActive && this.bossEnemy) {
          this.checkBossFlee();
        }

        // All spawned? Transition to clearing
        if (this.enemiesToSpawn <= 0) {
          this.setState("clearing");
        }
        break;

      case "clearing": {
        // Count all alive enemies for the HUD (exclude fleeing boss — treated as "gone")
        this.enemiesAlive = this.enemies
          .getChildren()
          .filter((e) => e.active && !(e as Enemy).dying && !(e as Enemy).fleeing).length;

        // Check SCARYBOI flee condition
        if (this.bossActive && this.bossEnemy) {
          this.checkBossFlee();
        }

        // Round-blocking enemies: zombies and bosses only
        // Dogs NEVER block round progression
        // Fleeing bosses NEVER block round progression (retreating offscreen)
        const blocking = this.enemies
          .getChildren()
          .filter((e) => {
            if (!e.active || (e as Enemy).dying) return false;
            const enemy = e as Enemy;
            if (enemy.enemyType === "fast") return false; // dogs never block
            if (enemy.fleeing) return false; // fleeing boss never blocks
            return true;
          }).length;

        if ((blocking + this.enemiesToSpawn) <= 0) {
          this.beginIntermission();
        }
        break;
      }

      case "intermission":
        if (!this.frozen) {
          this.stateTimer += delta;
        }
        if (this.readyUp) {
          this.readyCountdown -= delta;
          if (this.readyCountdown <= 0) {
            this.readyUp = false;
            this.startWave();
          }
        } else if (this.stateTimer >= this.intermissionDuration) {
          this.triggerReady();
        }
        break;
    }
  }

  /** Check if SCARYBOI should flee this encounter (HP-percentage based by encounter order) */
  private checkBossFlee() {
    if (!this.bossEnemy || !this.bossActive) return;

    const encConfigs = (BALANCE.waves as any).bossEncountersByOrder;
    const encIndex = this.scaryboiEncounterCount; // current encounter (0-based)
    const encConfig = encConfigs[encIndex] ?? encConfigs[encConfigs.length - 1];
    const fleeThreshold = encConfig.fleeThreshold ?? 0;

    const maxHp = (BALANCE.enemies.boss as any).hp as number;
    const spawnHp = Math.round(maxHp * encConfig.hpPercent);
    const hpPct = this.bossEnemy.health / spawnHp;

    // Flee if HP drops below encounter threshold (encounter 3 = 0, no flee)
    if (fleeThreshold > 0 && hpPct <= fleeThreshold) {
      this.scaryboiEncounterCount++;
      this.makeBossFlee();
      return;
    }

    // Boss actually died (encounter 3 final stand or overkill)
    if (this.bossEnemy.dying || !this.bossEnemy.active) {
      this.bossActive = false;
      const isFinalEncounter = this.activeEncounter === "estate";
      this.bossEnemy = null;
      if (isFinalEncounter) {
        this.scaryboiEncounterCount++;
        this.scaryboiDefeated = true;
        this.onBossKilled?.();
      }
    }
  }

  private makeBossFlee() {
    if (!this.bossEnemy || !this.bossEnemy.active) return;

    const boss = this.bossEnemy;

    // Mark as fleeing so it doesn't block wave progression
    boss.fleeing = true;

    this.bossActive = false;
    this.bossEnemy = null;

    // Show flee message
    this.onBossFlee?.();

    // Smoke vanish animation — poof and disappear
    if (!boss.playSmokeVanish()) {
      // Fallback: no smoke-vanish anim, just destroy immediately
      boss.destroy();
    } else {
      // Safety net: destroy after 3 seconds if animation hangs
      this.scene.time.delayedCall(3000, () => {
        if (boss.active) boss.destroy();
      });
    }
  }


  onEnemyKilled() {
    this.enemiesAlive = Math.max(0, this.enemiesAlive - 1);
  }

  triggerReady() {
    if (this.state !== "intermission" || this.readyUp) return;
    this.readyUp = true;
    this.readyCountdown = 3000;
  }

  setFrozen(frozen: boolean) { this.frozen = frozen; }

  skipPreGame() {
    if (this.state !== "pre_game") return;
    this.startWave();
  }

  devJumpToWave(targetWave: number) {
    this.enemies.getChildren().forEach((e) => {
      if (e.active) {
        (e as Enemy).takeDamage(999999);
        if (e.active) e.destroy();
      }
    });
    this.wave = Math.max(0, targetWave - 1);
    this.enemiesToSpawn = 0;
    this.enemiesAlive = 0;
    this.bossActive = false;
    this.bossEnemy = null;
    this.scaryboiEncounters = { zone2: false, southBuilding: false, estate: false };
    this.scaryboiDefeated = false;
    this.scaryboiFirstSeen = false;
    this.gateOpenedWave = null;
    this.startWave();
  }

  isReadyUp(): boolean { return this.readyUp; }

  getReadyCountdown(): number {
    if (!this.readyUp) return 0;
    return Math.max(0, Math.ceil(this.readyCountdown / 1000));
  }

  getIntermissionTimeLeft(): number {
    if (this.state !== "intermission" || this.readyUp) return 0;
    const remaining = this.intermissionDuration - this.stateTimer;
    return Math.max(0, Math.ceil(remaining / 1000));
  }

  getPreGameTimeLeft(): number {
    if (this.state !== "pre_game") return 0;
    const remaining = this.preGameDuration - this.stateTimer;
    return Math.max(0, Math.ceil(remaining / 1000));
  }

  getWaveHpMultiplier(): number {
    if (this.wave <= 9) {
      return 1 + (this.wave - 1) * BALANCE.waves.hpLinearPerWave;
    }
    const linearPart = 1 + 8 * BALANCE.waves.hpLinearPerWave;
    return linearPart * Math.pow(BALANCE.waves.hpExponentialBase, this.wave - 9);
  }

  getWaveDamageMultiplier(): number {
    return 1 + (this.wave - 1) * BALANCE.waves.damageScalePerWave;
  }

  getZombieSpeedTier(): "shamble" | "jog" | "run" {
    const w = this.wave;
    const tiers = BALANCE.waves.speedTierWaves;
    let mix: { shamble: number; jog: number; run: number };
    if (w < tiers.jogStart) {
      mix = BALANCE.waves.speedMix.early;
    } else if (w < tiers.runStart) {
      mix = BALANCE.waves.speedMix.mid;
    } else if (w <= 9) {
      mix = BALANCE.waves.speedMix.late;
    } else {
      mix = BALANCE.waves.speedMix.swarm;
    }
    const roll = Math.random();
    if (roll < mix.shamble) return "shamble";
    if (roll < mix.shamble + mix.jog) return "jog";
    return "run";
  }

  getWaveMultiplier(): number {
    return this.getWaveHpMultiplier();
  }

  getEnemiesRemaining(): number {
    return this.enemiesToSpawn + this.enemiesAlive;
  }

  /** Count of round-blocking enemies (zombies + boss only, dogs and fleeing bosses never block) */
  getBlockingEnemies(): number {
    const alive = this.enemies.getChildren().filter((e) => {
      if (!e.active || (e as Enemy).dying) return false;
      const enemy = e as Enemy;
      if (enemy.enemyType === "fast") return false; // dogs never block
      if (enemy.fleeing) return false; // fleeing boss never blocks
      return true;
    }).length;
    return this.enemiesToSpawn + alive;
  }

  /** Whether SCARYBOI is currently active this wave */
  isBossActive(): boolean {
    return this.bossActive;
  }

  // ------- Private -------

  private setState(newState: WaveState) {
    this.state = newState;
    this.stateTimer = 0;
    this.onStateChange?.(newState);
  }

  private startWave() {
    this.wave++;
    this.setState("active");

    const base = BALANCE.waves.baseEnemyCount;
    const perWave = BALANCE.waves.enemiesPerWave;
    const playerMod =
      BALANCE.waves.playerCountModifiers[this.playerCount - 1] || 1.0;
    this.totalWaveEnemies = Math.floor(
      (base + Math.floor(this.wave * perWave)) * playerMod
    );
    this.enemiesToSpawn = this.spawningDisabled ? 0 : this.totalWaveEnemies;
    this.enemiesAlive = 0;
    this.spawnTimer = 0;

    // Zone2 encounter now triggered by tile zone in GameScene (same round gate opens)

    // Spawn fresh dog pack at wave start
    if (!this.spawningDisabled) {
      this.spawnDogPack();
    }

    this.onWaveStart?.(this.wave);
  }

  /** Trigger a SCARYBOI encounter — GameScene handles actual spawning */
  triggerEncounter(enc: "zone2" | "southBuilding" | "estate") {
    if (this.bossActive || this.scaryboiDefeated) return;
    if (this.scaryboiEncounters[enc]) return;

    this.activeEncounter = enc;
    this.scaryboiEncounters[enc] = true;
    this.bossActive = true;

    this.onEncounterTrigger?.(enc);
  }

  /** Called by GameScene after spawning the boss entity */
  registerBossEnemy(boss: Enemy) {
    this.bossEnemy = boss;
    this.enemiesAlive++;
  }

  /** Called when Gate is opened — enables zone2 encounter on next wave */
  notifyGateOpened() {
    if (this.gateOpenedWave === null) {
      this.gateOpenedWave = this.wave;
    }
  }

  isScaryboiDefeated(): boolean { return this.scaryboiDefeated; }
  hasSeenScaryboi(): boolean { return this.scaryboiFirstSeen; }
  markScaryboiSeen() { this.scaryboiFirstSeen = true; }
  /** Estate is locked until both other encounters (zone2 + southBuilding) are completed */
  isEstateLocked(): boolean {
    return !this.scaryboiEncounters.zone2 || !this.scaryboiEncounters.southBuilding;
  }
  /** Get the encounter config for the current encounter order (0-based index) */
  getCurrentEncounterConfig(): { hpPercent: number; fleeThreshold: number; gracePeriodMs: number } {
    const configs = (BALANCE.waves as any).bossEncountersByOrder;
    return configs[this.scaryboiEncounterCount] ?? configs[configs.length - 1];
  }

  private beginIntermission() {
    // If SCARYBOI is still active at wave end, make him flee
    if (this.bossActive && this.bossEnemy && this.bossEnemy.active) {
      this.makeBossFlee();
    }

    // Clear all dogs at round end — they'll be freshly spawned at next wave start
    this.clearDogs();

    this.readyUp = false;
    this.readyCountdown = 0;
    this.setState("intermission");
    this.onIntermissionStart?.(this.wave);
  }

  private spawnNextEnemy() {
    if (this.enemiesToSpawn <= 0) return;

    const pos = this.getPlayerPos();

    // Spawn within 25-tile radius of player, but not too close
    let sx = 0, sy = 0;
    let valid = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = SPAWN_MIN_DIST + Math.random() * (SPAWN_RADIUS - SPAWN_MIN_DIST);
      sx = pos.x + Math.cos(angle) * dist;
      sy = pos.y + Math.sin(angle) * dist;

      // Clamp to surface play area
      sx = Phaser.Math.Clamp(sx, 60, SURFACE_WIDTH - 60);
      sy = Phaser.Math.Clamp(sy, 60, MAP_HEIGHT - 60);

      if (!isExcluded(sx, sy) && !this.isGated(sx, sy)) {
        valid = true;
        break;
      }
    }

    // If all attempts failed, try map edges in unlocked areas
    if (!valid) {
      const edges = [
        { x: Phaser.Math.Clamp(pos.x, 60, SURFACE_WIDTH - 60), y: 60 },
        { x: Phaser.Math.Clamp(pos.x, 60, SURFACE_WIDTH - 60), y: MAP_HEIGHT - 60 },
        { x: 60, y: Phaser.Math.Clamp(pos.y, 60, MAP_HEIGHT - 60) },
        { x: SURFACE_WIDTH - 60, y: Phaser.Math.Clamp(pos.y, 60, MAP_HEIGHT - 60) },
      ].filter(e => !isExcluded(e.x, e.y) && !this.isGated(e.x, e.y));
      if (edges.length > 0) {
        const edge = edges[Math.floor(Math.random() * edges.length)];
        sx = edge.x;
        sy = edge.y;
        valid = true;
      }
    }

    // Last resort: random offsets from player — must still respect exclusion + gates (never bypass)
    if (!valid) {
      for (let attempt = 0; attempt < 50; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = SPAWN_MIN_DIST + 40 + Math.random() * 250;
        sx = pos.x + Math.cos(angle) * dist;
        sy = pos.y + Math.sin(angle) * dist;
        sx = Phaser.Math.Clamp(sx, 60, SURFACE_WIDTH - 60);
        sy = Phaser.Math.Clamp(sy, 60, MAP_HEIGHT - 60);
        if (!isExcluded(sx, sy) && !this.isGated(sx, sy)) {
          valid = true;
          break;
        }
      }
    }
    // Ring search from player — covers edge case where random samples all hit bad tiles
    if (!valid) {
      for (let ring = 1; ring <= 25 && !valid; ring++) {
        const dist = SPAWN_MIN_DIST + ring * 35;
        for (let k = 0; k < 16; k++) {
          const angle = (k / 16) * Math.PI * 2;
          sx = pos.x + Math.cos(angle) * dist;
          sy = pos.y + Math.sin(angle) * dist;
          sx = Phaser.Math.Clamp(sx, 60, SURFACE_WIDTH - 60);
          sy = Phaser.Math.Clamp(sy, 60, MAP_HEIGHT - 60);
          if (!isExcluded(sx, sy) && !this.isGated(sx, sy)) {
            valid = true;
            break;
          }
        }
      }
    }

    const type = this.pickEnemyType();
    const hpMultiplier = this.getWaveHpMultiplier();
    const dmgMultiplier = this.getWaveDamageMultiplier();
    const speedTier = type === "basic" ? this.getZombieSpeedTier() : undefined;

    const enemy = new Enemy(this.scene, sx, sy, type, hpMultiplier, dmgMultiplier, speedTier);
    enemy.body.setCollideWorldBounds(true);
    this.enemies.add(enemy);

    this.enemiesToSpawn--;
    this.enemiesAlive++;
  }

  /** Wave spawns are always basic zombies now — dogs are persistent map creatures */
  private pickEnemyType(): EnemyType {
    return "basic";
  }

  // ─── Dog Pack System (spawn at wave start, clear at wave end) ───

  /** Effective dog cap: 4 before Gate opens, full maxOnMap after */
  private getEffectiveDogCap(): number {
    const dogStats = BALANCE.enemies.fast as any;
    const maxDogs = dogStats.maxOnMap ?? 5;
    if (!this.isDoorOpen("Gate")) return Math.min(maxDogs, 4);
    return maxDogs;
  }

  /** During active waves, respawn dead dogs after delay up to max */
  private updateDogs(delta: number) {
    if (this.spawningDisabled) return;
    if (this.state !== "active" && this.state !== "clearing") return;

    const dogStats = BALANCE.enemies.fast as any;
    const maxDogs = this.getEffectiveDogCap();
    const respawnMs = dogStats.respawnMs ?? 15000;
    const now = this.scene.time.now;

    // Prune dead dogs and queue respawns
    const aliveBefore = this.dogs.length;
    this.dogs = this.dogs.filter(d => d.active && !d.dying);
    const died = aliveBefore - this.dogs.length;
    for (let i = 0; i < died; i++) {
      this.dogRespawnQueue.push(now + respawnMs);
    }

    // Process respawn queue
    if (this.dogs.length < maxDogs && this.dogRespawnQueue.length > 0) {
      this.dogRespawnQueue.sort((a, b) => a - b);
      while (this.dogs.length < maxDogs && this.dogRespawnQueue.length > 0 && this.dogRespawnQueue[0] <= now) {
        this.dogRespawnQueue.shift();
        this.spawnDog();
      }
    }
  }

  /** Remove all dogs from the map */
  private clearDogs() {
    for (const dog of this.dogs) {
      if (dog.active) {
        dog.destroy();
      }
    }
    this.dogs = [];
    this.dogRespawnQueue = [];
  }

  /** Spawn a full pack of dogs at random field positions */
  private spawnDogPack() {
    const maxDogs = this.getEffectiveDogCap();
    for (let i = 0; i < maxDogs; i++) {
      this.spawnDog();
    }
  }

  private spawnDog() {
    const dogStats = BALANCE.enemies.fast;
    const pos = this.getPlayerPos();

    // Try random field positions (ground-only, no buildings, not on perimeter)
    const margin = 5 * 32; // 5 tiles from edge
    let sx = 0, sy = 0;
    let valid = false;

    for (let attempt = 0; attempt < 30; attempt++) {
      const tx = Math.floor(margin / 32 + Math.random() * ((SURFACE_WIDTH - 2 * margin) / 32));
      const ty = Math.floor(margin / 32 + Math.random() * ((MAP_HEIGHT - 2 * margin) / 32));
      sx = tx * 32 + 16;
      sy = ty * 32 + 16;

      // Must be on open field (ground-only tile)
      if (!this.isFieldTile(tx, ty)) continue;
      // Must not overlap a collision object (bushes, trees, etc.)
      if (!this.isCollisionFree(sx, sy)) continue;
      // Must not be in exclusion zone or gated area
      if (isExcluded(sx, sy)) continue;
      if (this.isGated(sx, sy)) continue;
      // Must be at least 300px from player
      if (Phaser.Math.Distance.Between(pos.x, pos.y, sx, sy) < 300) continue;

      valid = true;
      break;
    }

    if (!valid) return;

    // Scale stats by wave
    const w = Math.max(1, this.wave);
    const hpScale = 1 + (w - 1) * ((dogStats as any).hpScalePerWave ?? 0.08);
    const dmgScale = 1 + (w - 1) * ((dogStats as any).dmgScalePerWave ?? 0.05);

    const dog = new Enemy(this.scene, sx, sy, "fast", hpScale, dmgScale);
    dog.body.setCollideWorldBounds(true);
    this.enemies.add(dog);
    this.dogs.push(dog);
    this.enemiesAlive++;
  }

  /** Check if a position is in a gated zone whose door is still closed */
  isGated(x: number, y: number): boolean {
    for (const zone of GATED_ZONES) {
      if (x >= zone.x && x <= zone.x + zone.w && y >= zone.y && y <= zone.y + zone.h) {
        if (!this.isDoorOpen(zone.label)) return true;
      }
    }
    return false;
  }

  /** Room pressure — when player camps in a room, spawn flanking zombies at entrances */
  private updateRoomPressure(delta: number) {
    // Only during active combat
    if (this.state !== "active" && this.state !== "clearing") {
      this.playerInRoom = false;
      this.roomTimer = 0;
      this.currentRoom = null;
      return;
    }

    const pos = this.getPlayerPos();

    // Check if player is inside any room zone
    let inRoom: typeof ROOM_ZONES[number] | null = null;
    for (const room of ROOM_ZONES) {
      if (pos.x >= room.x && pos.x <= room.x + room.w &&
          pos.y >= room.y && pos.y <= room.y + room.h) {
        inRoom = room;
        break;
      }
    }

    if (inRoom) {
      this.playerInRoom = true;
      if (this.currentRoom !== inRoom) {
        // Entered a new room — reset timers
        this.currentRoom = inRoom;
        this.roomTimer = 0;
        this.roomFlankTimer = this.ROOM_FLANK_DELAY;
      }
      this.roomTimer += delta;
      this.roomFlankTimer -= delta;

      // After delay, spawn flanking zombies at the room entrance(s)
      if (this.roomFlankTimer <= 0 && !this.spawningDisabled) {
        this.roomFlankTimer = this.ROOM_FLANK_INTERVAL;
        this.spawnFlankingZombies(inRoom);
      }
    } else {
      this.playerInRoom = false;
      this.roomTimer = 0;
      this.currentRoom = null;
    }
  }

  /** Spawn a burst of zombies at a room's entrance points */
  private spawnFlankingZombies(room: typeof ROOM_ZONES[number]) {
    const hpMult = this.getWaveHpMultiplier();
    const dmgMult = this.getWaveDamageMultiplier();

    for (const entrance of room.entrances) {
      for (let i = 0; i < this.ROOM_FLANK_COUNT; i++) {
        // Spread around the entrance point
        const sx = entrance.x + (Math.random() - 0.5) * 60;
        const sy = entrance.y + (Math.random() - 0.5) * 40;
        const speedTier = this.getZombieSpeedTier();
        const enemy = new Enemy(this.scene, sx, sy, "basic", hpMult, dmgMult, speedTier);
        enemy.body.setCollideWorldBounds(true);
        this.enemies.add(enemy);
        this.enemiesAlive++;
      }
    }
  }

  /** Dev: spawn a specific enemy type at a random edge position */
  devSpawnEnemy(type: EnemyType, count: number = 1) {
    for (let i = 0; i < count; i++) {
      const pos = this.getPlayerPos();
      const cam = this.scene.cameras.main;
      const halfW = (cam.width / cam.zoom) / 2;
      const halfH = (cam.height / cam.zoom) / 2;
      let sx = 0;
      let sy = 0;
      let ok = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        const margin = 40 + Math.random() * 40;
        const side = Math.floor(Math.random() * 4);
        switch (side) {
          case 0: sx = pos.x + (Math.random() - 0.5) * halfW * 2; sy = pos.y - halfH - margin; break;
          case 1: sx = pos.x + (Math.random() - 0.5) * halfW * 2; sy = pos.y + halfH + margin; break;
          case 2: sx = pos.x - halfW - margin; sy = pos.y + (Math.random() - 0.5) * halfH * 2; break;
          default: sx = pos.x + halfW + margin; sy = pos.y + (Math.random() - 0.5) * halfH * 2; break;
        }
        sx = Phaser.Math.Clamp(sx, 60, SURFACE_WIDTH - 60);
        sy = Phaser.Math.Clamp(sy, 60, MAP_HEIGHT - 60);
        if (!isExcluded(sx, sy) && !this.isGated(sx, sy)) {
          ok = true;
          break;
        }
      }
      if (!ok) continue;

      const hpMult = this.getWaveHpMultiplier();
      const dmgMult = this.getWaveDamageMultiplier();
      const speedTier = type === "basic" ? this.getZombieSpeedTier() : undefined;
      const enemy = new Enemy(this.scene, sx, sy, type, hpMult, dmgMult, speedTier);
      enemy.body.setCollideWorldBounds(true);
      this.enemies.add(enemy);
      this.enemiesAlive++;
    }
  }
}
