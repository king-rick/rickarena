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

  // SCARYBOI recurring villain tracking
  private bossActive = false;
  private bossEnemy: Enemy | null = null;
  private bossDamageTaken = 0;
  private bossLastWave = 0;
  private bossTotalHp = 1200;
  private bossAppearances: number[] = [];

  // Persistent dog pack system
  private dogs: Enemy[] = [];
  private dogRespawnQueue: number[] = []; // timestamps when each dead dog can respawn

  // Callbacks
  onWaveStart?: (wave: number) => void;
  onIntermissionStart?: (wave: number) => void;
  onStateChange?: (state: WaveState) => void;
  onBossFlee?: () => void;

  constructor(config: WaveManagerConfig) {
    this.scene = config.scene;
    this.enemies = config.enemies;
    this.playerCount = config.playerCount;
    this.getPlayerPos = config.getPlayerPos;
  }

  update(delta: number) {
    // Maintain persistent dog pack (always running, even during intermission)
    this.updateDogs(delta);

    switch (this.state) {
      case "pre_game":
        this.stateTimer += delta;
        if (this.stateTimer >= this.preGameDuration) {
          this.startWave();
        }
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
        // Count all alive enemies for the HUD
        this.enemiesAlive = this.enemies
          .getChildren()
          .filter((e) => e.active && !(e as Enemy).dying).length;

        // Check SCARYBOI flee condition
        if (this.bossActive && this.bossEnemy) {
          this.checkBossFlee();
        }

        // Round-blocking enemies: zombies and bosses only
        // Dogs NEVER block round progression
        const blocking = this.enemies
          .getChildren()
          .filter((e) => {
            if (!e.active || (e as Enemy).dying) return false;
            const enemy = e as Enemy;
            if (enemy.enemyType === "fast") return false; // dogs never block
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

  /** Track damage dealt to SCARYBOI for flee threshold */
  onBossDamaged(amount: number) {
    if (this.bossActive) {
      this.bossDamageTaken += amount;
    }
  }

  /** Check if SCARYBOI should flee this encounter */
  private checkBossFlee() {
    if (!this.bossEnemy || !this.bossActive) return;

    const threshold = BALANCE.waves.bossSpawn.fleeThreshold;

    // Flee if took enough damage this encounter
    if (this.bossDamageTaken >= threshold) {
      this.makeBossFlee();
      return;
    }

    // Also flee if boss actually died (health <= 0 handled by Enemy.die)
    if (this.bossEnemy.dying || !this.bossEnemy.active) {
      this.bossActive = false;
      this.bossEnemy = null;
      // Boss died for real — reset for next encounter with full HP
      this.bossTotalHp = (BALANCE.enemies.boss as any).hp;
    }
  }

  private makeBossFlee() {
    if (!this.bossEnemy || !this.bossEnemy.active) return;

    // Persist remaining HP for next encounter
    this.bossTotalHp = Math.max(1, this.bossEnemy.health);

    // Visual flee — boss runs off screen then despawns
    const angle = Math.random() * Math.PI * 2;
    this.bossEnemy.body.setVelocity(
      Math.cos(angle) * 250,
      Math.sin(angle) * 250
    );

    const boss = this.bossEnemy;
    this.bossActive = false;
    this.bossEnemy = null;

    // Show flee message
    this.onBossFlee?.();

    // Destroy after running off
    this.scene.time.delayedCall(1500, () => {
      if (boss.active) {
        boss.destroy();
      }
    });
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

  /** Count of round-blocking enemies (zombies + boss only, dogs never block) */
  getBlockingEnemies(): number {
    const alive = this.enemies.getChildren().filter((e) => {
      if (!e.active || (e as Enemy).dying) return false;
      const enemy = e as Enemy;
      if (enemy.enemyType === "fast") return false; // dogs never block
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

    // SCARYBOI recurring villain
    if (this.shouldSpawnBoss() && !this.spawningDisabled) {
      this.spawnBoss();
    }

    this.onWaveStart?.(this.wave);
  }

  /**
   * SCARYBOI appears randomly after wave 5.
   * Rules:
   * - Cannot appear back-to-back
   * - Must appear at least 2x in waves 5-13, 2x in waves 14-20
   * - Uses weighted random with forced appearances when behind schedule
   */
  private shouldSpawnBoss(): boolean {
    const w = this.wave;
    if (w < BALANCE.waves.bossSpawn.firstEligibleWave) return false;

    // Cannot appear back-to-back
    if (this.bossLastWave === w - 1) return false;

    const earlyAppearances = this.bossAppearances.filter(v => v >= 5 && v <= 13).length;
    const lateAppearances = this.bossAppearances.filter(v => v >= 14 && v <= 20).length;

    // Force spawn if running out of waves to meet quota
    if (w >= 5 && w <= 13) {
      const wavesLeft = 13 - w + 1;
      const needed = 2 - earlyAppearances;
      // Account for back-to-back rule: need at least needed*2-1 waves
      if (needed > 0 && wavesLeft <= needed * 2) return true;
    }
    if (w >= 14 && w <= 20) {
      const wavesLeft = 20 - w + 1;
      const needed = 2 - lateAppearances;
      if (needed > 0 && wavesLeft <= needed * 2) return true;
    }

    // Random chance — higher if behind schedule
    let chance = 0.3; // base 30% chance per eligible wave
    if (w <= 13 && earlyAppearances < 2) chance = 0.45;
    if (w >= 14 && lateAppearances < 2) chance = 0.45;

    return Math.random() < chance;
  }

  private spawnBoss() {
    // Spawn from a dog spawn point far from the player
    const pos = this.getPlayerPos();
    const farPoints = DOG_SPAWN_POINTS.filter(s => {
      const d = Phaser.Math.Distance.Between(pos.x, pos.y, s.x, s.y);
      return d > 400 && !isExcluded(s.x, s.y);
    });
    const spawn = farPoints.length > 0
      ? farPoints[Math.floor(Math.random() * farPoints.length)]
      : DOG_SPAWN_POINTS[0];

    const hpMult = this.getWaveHpMultiplier();
    const dmgMult = this.getWaveDamageMultiplier();
    const boss = new Enemy(this.scene, spawn.x, spawn.y, "boss", hpMult, dmgMult);

    // Override HP with persistent total (SCARYBOI keeps damage between encounters)
    boss.health = this.bossTotalHp;
    boss.maxHealth = (BALANCE.enemies.boss as any).hp;

    boss.body.setCollideWorldBounds(true);
    this.enemies.add(boss);
    this.enemiesAlive++;

    this.bossActive = true;
    this.bossEnemy = boss;
    this.bossDamageTaken = 0;
    this.bossLastWave = this.wave;
    this.bossAppearances.push(this.wave);
  }

  private beginIntermission() {
    // If SCARYBOI is still active at wave end, make him flee
    if (this.bossActive && this.bossEnemy && this.bossEnemy.active) {
      this.makeBossFlee();
    }

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

      if (!isExcluded(sx, sy)) {
        valid = true;
        break;
      }
    }

    // If all attempts landed in exclusion zones, spawn at map edge near player
    if (!valid) {
      const edges = [
        { x: Phaser.Math.Clamp(pos.x, 60, SURFACE_WIDTH - 60), y: 60 },
        { x: Phaser.Math.Clamp(pos.x, 60, SURFACE_WIDTH - 60), y: MAP_HEIGHT - 60 },
        { x: 60, y: Phaser.Math.Clamp(pos.y, 60, MAP_HEIGHT - 60) },
        { x: SURFACE_WIDTH - 60, y: Phaser.Math.Clamp(pos.y, 60, MAP_HEIGHT - 60) },
      ];
      const edge = edges[Math.floor(Math.random() * edges.length)];
      sx = edge.x;
      sy = edge.y;
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

  // ─── Persistent Dog Pack System ───

  /** Maintain the dog population — respawn dead dogs after delay, up to max */
  private updateDogs(delta: number) {
    if (this.spawningDisabled) return;
    if (this.state === "pre_game") return;

    const dogStats = BALANCE.enemies.fast as any;
    const maxDogs = dogStats.maxOnMap ?? 5;
    const respawnMs = dogStats.respawnMs ?? 15000;
    const now = this.scene.time.now;

    // Prune dead dogs and queue respawns
    const aliveBefore = this.dogs.length;
    this.dogs = this.dogs.filter(d => d.active && !d.dying);
    const died = aliveBefore - this.dogs.length;
    for (let i = 0; i < died; i++) {
      this.dogRespawnQueue.push(now + respawnMs);
    }

    // Initial population: if no dogs exist and no respawns queued, seed up to max
    if (this.dogs.length === 0 && this.dogRespawnQueue.length === 0) {
      for (let i = 0; i < maxDogs; i++) {
        this.dogRespawnQueue.push(now + i * 2000); // stagger initial spawns
      }
    }

    // Process respawn queue
    if (this.dogs.length < maxDogs && this.dogRespawnQueue.length > 0) {
      // Sort so earliest respawns come first
      this.dogRespawnQueue.sort((a, b) => a - b);
      while (this.dogs.length < maxDogs && this.dogRespawnQueue.length > 0 && this.dogRespawnQueue[0] <= now) {
        this.dogRespawnQueue.shift();
        this.spawnDog();
      }
    }
  }

  private spawnDog() {
    const dogStats = BALANCE.enemies.fast;

    // Pick a spawn point far from the player
    const pos = this.getPlayerPos();
    const farSpawns = DOG_SPAWN_POINTS.filter(s => {
      const d = Phaser.Math.Distance.Between(pos.x, pos.y, s.x, s.y);
      return d > 400 && !isExcluded(s.x, s.y);
    });

    if (farSpawns.length === 0) return;

    const point = farSpawns[Math.floor(Math.random() * farSpawns.length)];
    let sx = point.x + (Math.random() - 0.5) * 120;
    let sy = point.y + (Math.random() - 0.5) * 120;
    sx = Phaser.Math.Clamp(sx, 60, SURFACE_WIDTH - 60);
    sy = Phaser.Math.Clamp(sy, 60, MAP_HEIGHT - 60);

    if (isExcluded(sx, sy)) return; // skip this tick

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

  /** Dev: spawn a specific enemy type at a random edge position */
  devSpawnEnemy(type: EnemyType, count: number = 1) {
    for (let i = 0; i < count; i++) {
      const pos = this.getPlayerPos();
      const cam = this.scene.cameras.main;
      const halfW = (cam.width / cam.zoom) / 2;
      const halfH = (cam.height / cam.zoom) / 2;
      const margin = 40 + Math.random() * 40;
      const side = Math.floor(Math.random() * 4);

      let sx: number, sy: number;
      switch (side) {
        case 0: sx = pos.x + (Math.random() - 0.5) * halfW * 2; sy = pos.y - halfH - margin; break;
        case 1: sx = pos.x + (Math.random() - 0.5) * halfW * 2; sy = pos.y + halfH + margin; break;
        case 2: sx = pos.x - halfW - margin; sy = pos.y + (Math.random() - 0.5) * halfH * 2; break;
        default: sx = pos.x + halfW + margin; sy = pos.y + (Math.random() - 0.5) * halfH * 2; break;
      }
      sx = Phaser.Math.Clamp(sx, 60, SURFACE_WIDTH - 60);
      sy = Phaser.Math.Clamp(sy, 60, MAP_HEIGHT - 60);

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
