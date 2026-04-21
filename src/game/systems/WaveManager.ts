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
  { label: "Gate", x: 0, y: 0, w: 620, h: 1920 },
  // Upper/estate area — gated by Estate Entrance ($500)
  { label: "Estate Entrance", x: 620, y: 0, w: 1300, h: 1100 },
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

  // MASON — scripted villain tracking
  private masonActive = false;
  private masonEnemy: Enemy | null = null;
  private masonDamageTaken = 0;
  private masonFinalFightStarted = false;

  // Persistent dog pack system
  private dogs: Enemy[] = [];
  private dogRespawnQueue: number[] = []; // timestamps when each dead dog can respawn
  private isFieldTile: (tileX: number, tileY: number) => boolean;
  private isDoorOpen: (label: string) => boolean;

  // Callbacks
  onWaveStart?: (wave: number) => void;
  onIntermissionStart?: (wave: number) => void;
  onStateChange?: (state: WaveState) => void;
  onBossFlee?: () => void;
  onBossFirstSpawn?: () => void;

  // MASON callbacks
  onMasonAnnouncement?: () => void;
  onMasonFirstSpawn?: () => void;
  onMasonFinalFight?: () => void;
  onMasonFlee?: () => void;
  onMasonDefeated?: () => void;

  constructor(config: WaveManagerConfig) {
    this.scene = config.scene;
    this.enemies = config.enemies;
    this.playerCount = config.playerCount;
    this.getPlayerPos = config.getPlayerPos;
    this.isFieldTile = config.isFieldTile ?? (() => true);
    this.isDoorOpen = config.isDoorOpen ?? (() => true);
  }

  update(delta: number) {
    // Maintain persistent dog pack (always running, even during intermission)
    this.updateDogs(delta);

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

        // Check MASON flee condition (brief encounter only)
        if (this.masonActive && this.masonEnemy) {
          this.checkMasonFlee();
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

        // Check MASON flee condition (brief encounter only)
        if (this.masonActive && this.masonEnemy) {
          this.checkMasonFlee();
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

  /** Track damage dealt to SCARYBOI for flee threshold */
  onBossDamaged(amount: number) {
    if (this.bossActive) {
      this.bossDamageTaken += amount;
    }
  }

  /** Track damage dealt to MASON — only matters for brief encounter flee */
  onMasonDamaged(amount: number) {
    if (this.masonActive) {
      this.masonDamageTaken += amount;
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

    const boss = this.bossEnemy;
    const playerPos = this.getPlayerPos();

    // Mark as fleeing so it doesn't block wave progression
    boss.fleeing = true;

    // Let the boss run off the map edge
    boss.body.setCollideWorldBounds(false);

    // Flee straight to the nearest map edge
    const distToLeft = boss.x;
    const distToRight = SURFACE_WIDTH - boss.x;
    const distToTop = boss.y;
    const distToBottom = MAP_HEIGHT - boss.y;
    const minEdgeDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
    let fleeAngle: number;
    if (minEdgeDist === distToLeft) fleeAngle = Math.PI;           // left
    else if (minEdgeDist === distToRight) fleeAngle = 0;           // right
    else if (minEdgeDist === distToTop) fleeAngle = -Math.PI / 2;  // up
    else fleeAngle = Math.PI / 2;                                   // down

    const fleeSpeed = 400;
    boss.body.setVelocity(
      Math.cos(fleeAngle) * fleeSpeed,
      Math.sin(fleeAngle) * fleeSpeed
    );

    this.bossActive = false;
    this.bossEnemy = null;

    // Show flee message
    this.onBossFlee?.();

    // Poll every 100ms: destroy the boss once it's off the player's visible screen
    const checkOffscreen = this.scene.time.addEvent({
      delay: 100,
      loop: true,
      callback: () => {
        if (!boss.active) {
          checkOffscreen.destroy();
          return;
        }
        const cam = this.scene.cameras.main;
        const halfW = (cam.width / cam.zoom) / 2;
        const halfH = (cam.height / cam.zoom) / 2;
        // Camera midpoint follows the player
        const mx = cam.midPoint.x;
        const my = cam.midPoint.y;
        const margin = 60; // extra buffer so the boss fully exits the screen
        const offscreen =
          boss.x < mx - halfW - margin ||
          boss.x > mx + halfW + margin ||
          boss.y < my - halfH - margin ||
          boss.y > my + halfH + margin;
        if (offscreen) {
          checkOffscreen.destroy();
          boss.destroy();
        }
      },
    });

    // Safety net: destroy after 8 seconds regardless (e.g. if stuck on geometry)
    this.scene.time.delayedCall(8000, () => {
      if (boss.active) {
        checkOffscreen.destroy();
        boss.destroy();
      }
    });
  }

  /** Check if MASON should flee (brief encounter wave 10 only) */
  private checkMasonFlee() {
    if (!this.masonEnemy || !this.masonActive) return;

    // If mason actually died, handle defeat
    if (this.masonEnemy.dying || !this.masonEnemy.active) {
      this.masonActive = false;
      this.masonEnemy = null;
      this.onMasonDefeated?.();
      return;
    }

    // Brief encounter: flee after threshold damage
    const isBrief = this.masonEnemy.masonBriefEncounter;
    if (isBrief) {
      const threshold = (BALANCE.enemies as any).mason.briefEncounterFleeThreshold;
      if (this.masonDamageTaken >= threshold) {
        this.makeMasonFlee();
      }
    }
  }

  private makeMasonFlee() {
    if (!this.masonEnemy || !this.masonEnemy.active) return;

    const mason = this.masonEnemy;
    mason.fleeing = true;
    mason.body.setCollideWorldBounds(false);

    // Flee to nearest map edge
    const distToLeft = mason.x;
    const distToRight = SURFACE_WIDTH - mason.x;
    const distToTop = mason.y;
    const distToBottom = MAP_HEIGHT - mason.y;
    const minEdgeDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
    let fleeAngle: number;
    if (minEdgeDist === distToLeft) fleeAngle = Math.PI;
    else if (minEdgeDist === distToRight) fleeAngle = 0;
    else if (minEdgeDist === distToTop) fleeAngle = -Math.PI / 2;
    else fleeAngle = Math.PI / 2;

    const fleeSpeed = 350;
    mason.body.setVelocity(
      Math.cos(fleeAngle) * fleeSpeed,
      Math.sin(fleeAngle) * fleeSpeed
    );

    this.masonActive = false;
    this.masonEnemy = null;
    this.onMasonFlee?.();

    // Poll every 100ms: destroy mason once off screen
    const checkOffscreen = this.scene.time.addEvent({
      delay: 100,
      loop: true,
      callback: () => {
        if (!mason.active) { checkOffscreen.destroy(); return; }
        const cam = this.scene.cameras.main;
        const halfW = (cam.width / cam.zoom) / 2;
        const halfH = (cam.height / cam.zoom) / 2;
        const mx = cam.midPoint.x;
        const my = cam.midPoint.y;
        const margin = 60;
        const offscreen =
          mason.x < mx - halfW - margin ||
          mason.x > mx + halfW + margin ||
          mason.y < my - halfH - margin ||
          mason.y > my + halfH + margin;
        if (offscreen) {
          checkOffscreen.destroy();
          mason.destroy();
        }
      },
    });

    this.scene.time.delayedCall(8000, () => {
      if (mason.active) {
        checkOffscreen.destroy();
        mason.destroy();
      }
    });
  }

  /** Spawn MASON — briefEncounter=true for wave 10 (flees after threshold) */
  private spawnMason(briefEncounter: boolean) {
    const pos = this.getPlayerPos();
    const farPoints = DOG_SPAWN_POINTS.filter(s => {
      const d = Phaser.Math.Distance.Between(pos.x, pos.y, s.x, s.y);
      return d > 400 && !isExcluded(s.x, s.y) && !this.isGated(s.x, s.y);
    });
    let spawn: { x: number; y: number };
    if (farPoints.length > 0) {
      spawn = farPoints[Math.floor(Math.random() * farPoints.length)];
    } else {
      const anyValid = DOG_SPAWN_POINTS.filter(
        (s) => !isExcluded(s.x, s.y) && !this.isGated(s.x, s.y)
      );
      if (anyValid.length > 0) {
        spawn = anyValid[Math.floor(Math.random() * anyValid.length)];
      } else {
        spawn = this.findAnyValidSurfaceSpawn(pos);
      }
    }

    const mason = new Enemy(this.scene, spawn.x, spawn.y, "mason", 1, 1);
    mason.setMasonBriefEncounter(briefEncounter);
    mason.body.setCollideWorldBounds(true);
    this.enemies.add(mason);
    this.enemiesAlive++;

    this.masonActive = true;
    this.masonEnemy = mason;
    this.masonDamageTaken = 0;
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
    this.masonActive = false;
    this.masonEnemy = null;
    this.masonDamageTaken = 0;
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

    // SCARYBOI recurring villain
    if (this.shouldSpawnBoss() && !this.spawningDisabled) {
      this.spawnBoss();
    }

    // MASON — scripted appearances on fixed waves
    const masonWaves = (BALANCE.waves as any).masonSpawn;
    if (this.wave === masonWaves.announcementWave) {
      this.onMasonAnnouncement?.();
    }
    if (this.wave === masonWaves.briefEncounterWave && !this.spawningDisabled) {
      this.spawnMason(true);
      this.onMasonFirstSpawn?.();
    }
    if (this.wave === masonWaves.finalFightWave && !this.spawningDisabled) {
      this.masonFinalFightStarted = true;
      this.spawnMason(false);
      this.onMasonFinalFight?.();
    }

    // Spawn fresh dog pack at wave start
    if (!this.spawningDisabled) {
      this.spawnDogPack();
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
      return d > 400 && !isExcluded(s.x, s.y) && !this.isGated(s.x, s.y);
    });
    let spawn: { x: number; y: number };
    if (farPoints.length > 0) {
      spawn = farPoints[Math.floor(Math.random() * farPoints.length)];
    } else {
      const anyValid = DOG_SPAWN_POINTS.filter(
        (s) => !isExcluded(s.x, s.y) && !this.isGated(s.x, s.y)
      );
      if (anyValid.length > 0) {
        spawn = anyValid[Math.floor(Math.random() * anyValid.length)];
      } else {
        spawn = this.findAnyValidSurfaceSpawn(pos);
      }
    }

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

    const isFirst = this.bossAppearances.length === 0;
    this.bossAppearances.push(this.wave);

    if (isFirst) {
      this.onBossFirstSpawn?.();
    }
  }

  private beginIntermission() {
    // If SCARYBOI is still active at wave end, make him flee
    if (this.bossActive && this.bossEnemy && this.bossEnemy.active) {
      this.makeBossFlee();
    }

    // If MASON brief encounter is still active at wave end, make him flee
    if (this.masonActive && this.masonEnemy && this.masonEnemy.active) {
      const isBrief = this.masonEnemy.masonBriefEncounter;
      if (isBrief) {
        this.makeMasonFlee();
      }
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

  /** During active waves, respawn dead dogs after delay up to max */
  private updateDogs(delta: number) {
    if (this.spawningDisabled) return;
    if (this.state !== "active" && this.state !== "clearing") return;

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
    const dogStats = BALANCE.enemies.fast as any;
    const maxDogs = dogStats.maxOnMap ?? 5;
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
  private isGated(x: number, y: number): boolean {
    for (const zone of GATED_ZONES) {
      if (x >= zone.x && x <= zone.x + zone.w && y >= zone.y && y <= zone.y + zone.h) {
        if (!this.isDoorOpen(zone.label)) return true;
      }
    }
    return false;
  }

  /**
   * Boss fallback when no preset dog point is valid — must respect exclusion + gates
   * (same rules as zombie spawns; avoids spawning SCARYBOI behind locked doors).
   */
  private findAnyValidSurfaceSpawn(near: { x: number; y: number }): { x: number; y: number } {
    for (let attempt = 0; attempt < 160; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 80 + Math.random() * 880;
      const sx = Phaser.Math.Clamp(near.x + Math.cos(angle) * dist, 60, SURFACE_WIDTH - 60);
      const sy = Phaser.Math.Clamp(near.y + Math.sin(angle) * dist, 60, MAP_HEIGHT - 60);
      if (!isExcluded(sx, sy) && !this.isGated(sx, sy)) {
        return { x: sx, y: sy };
      }
    }
    for (let tx = 2; tx < 58; tx++) {
      for (let ty = 2; ty < 58; ty++) {
        const sx = tx * 32 + 16;
        const sy = ty * 32 + 16;
        if (!isExcluded(sx, sy) && !this.isGated(sx, sy)) {
          return { x: sx, y: sy };
        }
      }
    }
    return { x: near.x, y: near.y };
  }

  /** Dev: spawn a specific enemy type at a random edge position */
  devSpawnEnemy(type: EnemyType, count: number = 1) {
    if (type === "mason") {
      this.spawnMason(false);
      return;
    }
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
