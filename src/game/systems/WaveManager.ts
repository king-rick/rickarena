import Phaser from "phaser";
import { Enemy, EnemyType } from "../entities/Enemy";
import { BALANCE } from "../data/balance";

// Endicott Estate map dimensions (60x60 tiles at 32px)
const MAP_WIDTH = 60 * 32;   // 1920
const MAP_HEIGHT = 60 * 32;  // 1920

export type WaveState =
  | "pre_game" // Brief countdown before wave 1
  | "active" // Enemies spawning and being fought
  | "clearing" // All spawned, waiting for last kills
  | "intermission"; // 30s rest / shop window

// TODO: Add landmark spawns and obstacle rects once village layout is designed

function isInsideObstacle(_x: number, _y: number): boolean {
  // TODO: check against village collision objects once layout is designed
  return false;
}

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
  private frozen = false; // pause intermission timer (shop/level-up open)
  private preGameDuration = 3000; // 3s before wave 1
  private countdownDuration = 3000; // 3s countdown before each wave after intermission
  private intermissionDuration = 30000; // 30s max intermission before auto-start
  private readyUp = false; // player has pressed ready
  private readyCountdown = 0; // 3s countdown after ready

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
        // Pause auto-timer while shop or level-up is open
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
          // Auto-start after 30s if player hasn't pressed skip
          this.triggerReady();
        }
        break;
    }
  }

  /** Called by GameScene when an enemy is killed */
  onEnemyKilled() {
    this.enemiesAlive = Math.max(0, this.enemiesAlive - 1);
  }

  /** Player presses ready — starts 3s countdown to next wave */
  triggerReady() {
    if (this.state !== "intermission" || this.readyUp) return;
    this.readyUp = true;
    this.readyCountdown = 3000;
  }

  /** Freeze/unfreeze intermission timer (e.g. while shop or level-up is open) */
  setFrozen(frozen: boolean) { this.frozen = frozen; }

  /** Skip the pre-game countdown and start wave 1 immediately */
  skipPreGame() {
    if (this.state !== "pre_game") return;
    this.startWave();
  }

  /** Whether the player has readied up */
  isReadyUp(): boolean {
    return this.readyUp;
  }

  /** Countdown seconds remaining after ready-up (0 if not ready) */
  getReadyCountdown(): number {
    if (!this.readyUp) return 0;
    return Math.max(0, Math.ceil(this.readyCountdown / 1000));
  }

  /** Intermission time remaining before auto-start (seconds) */
  getIntermissionTimeLeft(): number {
    if (this.state !== "intermission" || this.readyUp) return 0;
    const remaining = this.intermissionDuration - this.stateTimer;
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
    this.readyUp = false;
    this.readyCountdown = 0;
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

    // Spawn just outside camera view (20-60px beyond edge)
    const margin = 20 + Math.random() * 40;
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

    // Clamp to world bounds
    sx = Phaser.Math.Clamp(sx, 60, MAP_WIDTH - 60);
    sy = Phaser.Math.Clamp(sy, 60, MAP_HEIGHT - 60);

    // Re-roll if spawn point is inside an obstacle (up to 5 attempts)
    for (let attempt = 0; attempt < 5 && isInsideObstacle(sx, sy); attempt++) {
      // Push outward from player position
      const pushAngle = Math.random() * Math.PI * 2;
      sx += Math.cos(pushAngle) * 80;
      sy += Math.sin(pushAngle) * 80;
      sx = Phaser.Math.Clamp(sx, 60, MAP_WIDTH - 60);
      sy = Phaser.Math.Clamp(sy, 60, MAP_HEIGHT - 60);
    }

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
