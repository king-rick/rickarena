import Phaser from "phaser";
import { Enemy, EnemyType } from "../entities/Enemy";
import { BALANCE } from "../data/balance";
import {
  MANSION,
  LIBRARY,
  GIANT_WILLOW,
  HIDING_GROVE,
  MAP_WIDTH,
  MAP_HEIGHT,
} from "../map/EndicottEstate";

export type WaveState =
  | "pre_game" // Brief countdown before wave 1
  | "active" // Enemies spawning and being fought
  | "clearing" // All spawned, waiting for last kills
  | "intermission"; // 30s rest / shop window

// Landmark spawn anchors — enemies crawl out from estate structures
const LANDMARK_SPAWNS = [
  // Mansion corners
  { x: MANSION.x, y: MANSION.y },
  { x: MANSION.x + MANSION.width, y: MANSION.y },
  { x: MANSION.x, y: MANSION.y + MANSION.height },
  { x: MANSION.x + MANSION.width, y: MANSION.y + MANSION.height },
  // Library
  { x: LIBRARY.x, y: LIBRARY.y + LIBRARY.height / 2 },
  { x: LIBRARY.x + LIBRARY.width, y: LIBRARY.y + LIBRARY.height / 2 },
  // Giant willow
  { x: GIANT_WILLOW.x, y: GIANT_WILLOW.y },
  // Hiding grove trees
  ...HIDING_GROVE.map((t) => ({ x: t.x, y: t.y })),
];

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
  private enemiesToSpawn = 0; // How many left to spawn this wave
  private enemiesAlive = 0; // How many currently alive
  private totalWaveEnemies = 0; // Total for this wave
  private spawnTimer = 0;

  // State timers
  private stateTimer = 0;
  private preGameDuration = 3000; // 3s before wave 1
  private countdownDuration = 3000; // 3s countdown before each wave after intermission

  // Announcement callback — GameScene handles the visual
  onWaveStart?: (wave: number) => void;
  onIntermissionStart?: (wave: number) => void;
  onStateChange?: (state: WaveState) => void;

  constructor(config: WaveManagerConfig) {
    this.scene = config.scene;
    this.enemies = config.enemies;
    this.playerCount = config.playerCount;
    this.getPlayerPos = config.getPlayerPos;
  }

  update(delta: number) {
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
          this.spawnTimer >= BALANCE.waves.spawnStaggerMs
        ) {
          this.spawnTimer = 0;
          this.spawnNextEnemy();
        }

        // All spawned? Transition to clearing
        if (this.enemiesToSpawn <= 0) {
          this.setState("clearing");
        }
        break;

      case "clearing":
        // Count alive enemies in the group
        this.enemiesAlive = this.enemies
          .getChildren()
          .filter((e) => e.active).length;

        if (this.enemiesAlive <= 0) {
          this.beginIntermission();
        }
        break;

      case "intermission":
        this.stateTimer += delta;
        if (this.stateTimer >= this.getIntermissionDuration()) {
          this.startWave();
        }
        break;
    }
  }

  /** Called by GameScene when an enemy is killed */
  onEnemyKilled() {
    this.enemiesAlive = Math.max(0, this.enemiesAlive - 1);
  }

  /** Intermission duration for the current wave (ms) */
  getIntermissionDuration(): number {
    // Next wave is wave + 1 since we're between waves
    const nextWave = this.wave + 1;
    return nextWave >= BALANCE.waves.intermissionLateWave
      ? BALANCE.waves.intermissionLateMs
      : BALANCE.waves.intermissionEarlyMs;
  }

  /** How much time is left in intermission (seconds) */
  getIntermissionTimeLeft(): number {
    if (this.state !== "intermission") return 0;
    const remaining = this.getIntermissionDuration() - this.stateTimer;
    return Math.max(0, Math.ceil(remaining / 1000));
  }

  /** Pre-game countdown remaining (seconds) */
  getPreGameTimeLeft(): number {
    if (this.state !== "pre_game") return 0;
    const remaining = this.preGameDuration - this.stateTimer;
    return Math.max(0, Math.ceil(remaining / 1000));
  }

  /** Wave multiplier for enemy stat scaling: 1.0 at wave 1, +10% per wave */
  getWaveMultiplier(): number {
    return 1 + (this.wave - 1) * BALANCE.waves.statScalePerWave;
  }

  /** Enemies still alive or waiting to spawn */
  getEnemiesRemaining(): number {
    return this.enemiesToSpawn + this.enemiesAlive;
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

    // Calculate enemy count for this wave
    const base = BALANCE.waves.baseEnemyCount;
    const perWave = BALANCE.waves.enemiesPerWave;
    const playerMod =
      BALANCE.waves.playerCountModifiers[this.playerCount - 1] || 1.0;
    this.totalWaveEnemies = Math.floor(
      (base + this.wave * perWave) * playerMod
    );
    this.enemiesToSpawn = this.totalWaveEnemies;
    this.enemiesAlive = 0;
    this.spawnTimer = 0;

    this.onWaveStart?.(this.wave);
  }

  private beginIntermission() {
    this.setState("intermission");
    this.onIntermissionStart?.(this.wave);
  }

  private spawnNextEnemy() {
    if (this.enemiesToSpawn <= 0) return;

    const pos = this.getPlayerPos();
    const cam = this.scene.cameras.main;
    const halfW = (cam.width / cam.zoom) / 2;
    const halfH = (cam.height / cam.zoom) / 2;

    let sx: number;
    let sy: number;

    // 40% chance: spawn from a nearby landmark (mansion, library, trees)
    // 60% chance: spawn just outside camera edge
    const nearbyLandmarks = LANDMARK_SPAWNS.filter((lm) => {
      const dx = Math.abs(lm.x - pos.x);
      const dy = Math.abs(lm.y - pos.y);
      return dx < halfW * 2.5 && dy < halfH * 2.5;
    });

    if (nearbyLandmarks.length > 0 && Math.random() < 0.4) {
      // Spawn from a landmark
      const lm = nearbyLandmarks[Math.floor(Math.random() * nearbyLandmarks.length)];
      sx = lm.x + (Math.random() - 0.5) * 40;
      sy = lm.y + (Math.random() - 0.5) * 40;
    } else {
      // Spawn just outside camera view (50-150px beyond edge)
      const margin = 50 + Math.random() * 100;
      const side = Math.floor(Math.random() * 4);

      switch (side) {
        case 0: // top
          sx = pos.x + (Math.random() - 0.5) * halfW * 2;
          sy = pos.y - halfH - margin;
          break;
        case 1: // bottom
          sx = pos.x + (Math.random() - 0.5) * halfW * 2;
          sy = pos.y + halfH + margin;
          break;
        case 2: // left
          sx = pos.x - halfW - margin;
          sy = pos.y + (Math.random() - 0.5) * halfH * 2;
          break;
        default: // right
          sx = pos.x + halfW + margin;
          sy = pos.y + (Math.random() - 0.5) * halfH * 2;
          break;
      }
    }

    // Clamp to world bounds
    sx = Phaser.Math.Clamp(sx, 20, MAP_WIDTH - 20);
    sy = Phaser.Math.Clamp(sy, 20, MAP_HEIGHT - 20);

    const type = this.pickEnemyType();
    const waveMultiplier = this.getWaveMultiplier();

    const enemy = new Enemy(this.scene, sx, sy, type, waveMultiplier);
    enemy.body.setCollideWorldBounds(true);
    this.enemies.add(enemy);

    this.enemiesToSpawn--;
    this.enemiesAlive++;
  }

  private pickEnemyType(): EnemyType {
    const w = this.wave;
    const roll = Math.random();

    // Wave 6+: 50% basic, 25% fast, 25% tank
    if (w >= BALANCE.waves.tankVariantWave) {
      if (roll < 0.50) return "basic";
      if (roll < 0.75) return "fast";
      return "tank";
    }

    // Wave 4-5: 70% basic, 30% fast
    if (w >= BALANCE.waves.fastVariantWave) {
      if (roll < 0.70) return "basic";
      return "fast";
    }

    // Wave 1-3: all basic
    return "basic";
  }
}
