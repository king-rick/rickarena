import Phaser from "phaser";
import { Enemy, EnemyType } from "../entities/Enemy";
import { BALANCE } from "../data/balance";

// Endicott Estate map — 100x60 tiles at 32px
const MAP_WIDTH = 100 * 32;
const MAP_HEIGHT = 60 * 32;
const SURFACE_WIDTH = 60 * 32;

// ─── Types ───

interface ZoneSpawnConfig {
  scene: Phaser.Scene;
  enemies: Phaser.Physics.Arcade.Group;
  getPlayerPos: () => { x: number; y: number };
  isCollisionFree: (wx: number, wy: number) => boolean;
  isFieldTile: (tileX: number, tileY: number) => boolean;
  isDoorOpen: (label: string) => boolean;
}

export interface GatedZone {
  label: string;
  x: number; y: number; w: number; h: number;
}

// Keep SpawnZone export for any external references
export interface SpawnZone {
  name: string;
  tier: number;
  bounds: { x: number; y: number; w: number; h: number };
  population: Enemy[];
  respawnQueue: number[];
}

// ─── Surge queue entry ───
interface SurgeEntry {
  targetX: number;
  targetY: number;
  remaining: number;
  intervalMs: number;
  timer: number;
  alerted: boolean; // spawn in chasing state?
}

export class ZoneSpawnManager {
  private scene: Phaser.Scene;
  private enemies: Phaser.Physics.Arcade.Group;
  private getPlayerPos: () => { x: number; y: number };
  private isCollisionFree: (wx: number, wy: number) => boolean;
  private isFieldTile: (tileX: number, tileY: number) => boolean;
  private isDoorOpen: (label: string) => boolean;

  // Spatial data from Tiled
  private exclusionZones: { x: number; y: number; w: number; h: number }[] = [];
  private gatedZones: GatedZone[] = [];

  // Spawn timing
  private spawnTimer = 0;
  private frozen = false;
  private _frozenLoggedOnce = false;
  spawningDisabled = false;

  // Despawn sweep timer
  private despawnTimer = 0;

  // Noise surge system
  private surgeQueue: SurgeEntry[] = [];
  private sprintSurgeCooldown = 0;

  // SCARYBOI encounter tracking
  bossActive = false;
  bossEnemy: Enemy | null = null;
  private scaryboiEncounters = { gate: false, library: false, estate: false };
  private scaryboiDefeated = false;
  private scaryboiFirstSeen = false;
  scaryboiEncounterCount = 0;
  private activeEncounter: "gate" | "library" | "estate" = "gate";

  // Dog tracking
  private dogs: Enemy[] = [];
  private globalDogCap = 5;

  // Room pressure
  playerInRoom = false;

  // Callbacks
  onBossFlee?: () => void;
  onEncounterTrigger?: (enc: "gate" | "library" | "estate") => void;
  onBossKilled?: () => void;

  constructor(config: ZoneSpawnConfig) {
    this.scene = config.scene;
    this.enemies = config.enemies;
    this.getPlayerPos = config.getPlayerPos;
    this.isCollisionFree = config.isCollisionFree;
    this.isFieldTile = config.isFieldTile;
    this.isDoorOpen = config.isDoorOpen;
  }

  /** Load zone data from Tiled — must be called before first update */
  setZoneData(data: {
    exclusionZones: { x: number; y: number; w: number; h: number }[];
    gatedZones: GatedZone[];
    spawnZones: { name: string; tier: number; x: number; y: number; w: number; h: number }[];
  }) {
    this.exclusionZones = data.exclusionZones;
    this.gatedZones = data.gatedZones;
    // spawnZones no longer used — proximity spawning replaces zone populations
  }

  /** No-op kept for API compatibility — proximity spawning doesn't need zones */
  generateDefaultZones() {}

  // ─── Core Update Loop ───

  update(delta: number) {
    if (this.frozen || this.spawningDisabled) {
      if (this.frozen && !this._frozenLoggedOnce) {
        console.log("[ZoneSpawn] update skipped — frozen");
        this._frozenLoggedOnce = true;
      }
      return;
    }
    if (this._frozenLoggedOnce) {
      console.log("[ZoneSpawn] UNFROZEN — spawning active");
      this._frozenLoggedOnce = false;
    }

    // Prune dead dogs
    this.dogs = this.dogs.filter(d => d.active && !d.dying);

    // Check boss flee
    if (this.bossActive && this.bossEnemy) {
      this.checkBossFlee();
    }

    const now = this.scene.time.now;
    const playerPos = this.getPlayerPos();
    const cfg = (BALANCE as any).spawning;

    // ─── Despawn sweep — remove unaware zombies too far from player ───
    this.despawnTimer -= delta;
    if (this.despawnTimer <= 0) {
      this.despawnTimer = cfg.despawnCheckMs;
      this.despawnFarEnemies(playerPos, cfg.despawnDistance);
    }

    // ─── Surge queue processing ───
    this.processSurges(delta, playerPos);

    // ─── Cooldown ticks ───
    if (this.sprintSurgeCooldown > 0) this.sprintSurgeCooldown -= delta;

    // ─── Ambient spawning — maintain population near player ───
    this.spawnTimer -= delta;
    if (this.spawnTimer > 0) return;

    // Don't spawn while player is inside Rudy's
    if (this.playerInRoom) return;

    // Count enemies near the player
    const nearbyCount = this.countNearby(playerPos, cfg.ambientRadius);
    const totalAlive = this.enemies.getChildren().filter(
      e => e.active && !(e as Enemy).dying && !(e as Enemy).raveZombie
    ).length;

    if (nearbyCount < cfg.ambientCount && totalAlive < cfg.globalCap) {
      const spawned = this.spawnNearPlayer(playerPos, cfg.spawnRingMin, cfg.spawnRingMax, false);
      if (spawned) {
        this.spawnTimer = cfg.spawnStaggerMs;
      } else {
        this.spawnTimer = 1000; // backoff on failure
      }
    }
  }

  // ─── Proximity Spawning ───

  /** Spawn one enemy in a ring around the player. Returns true on success. */
  private spawnNearPlayer(
    playerPos: { x: number; y: number },
    minDist: number,
    maxDist: number,
    alerted: boolean,
    targetPos?: { x: number; y: number }
  ): boolean {
    const spawnMargin = 4 * 32;

    for (let attempt = 0; attempt < 30; attempt++) {
      // Random angle, random distance within ring
      const angle = Math.random() * Math.PI * 2;
      const dist = minDist + Math.random() * (maxDist - minDist);
      // Spawn relative to target position (for surges) or player position
      const origin = targetPos ?? playerPos;
      let sx = origin.x + Math.cos(angle) * dist;
      let sy = origin.y + Math.sin(angle) * dist;

      // Clamp to surface play area
      sx = Phaser.Math.Clamp(sx, spawnMargin, SURFACE_WIDTH - spawnMargin);
      sy = Phaser.Math.Clamp(sy, spawnMargin, MAP_HEIGHT - spawnMargin);

      // Validate position
      if (this.isExcluded(sx, sy)) continue;
      if (this.isGated(sx, sy)) continue;
      if (!this.isCollisionFree(sx, sy)) continue;

      // Don't spawn on screen (too close to player)
      const distToPlayer = Phaser.Math.Distance.Between(sx, sy, playerPos.x, playerPos.y);
      if (distToPlayer < 250) continue;

      // Pick enemy type — 10% dog chance if under dog cap
      const isDog = Math.random() < 0.1 && this.dogs.length < this.globalDogCap;
      const type: EnemyType = isDog ? "fast" : "basic";

      // Speed tier for zombies — mix of shamble/jog/run
      let speedTier: "shamble" | "jog" | "run" | undefined;
      if (type === "basic") {
        const roll = Math.random();
        if (roll < 0.3) speedTier = "shamble";
        else if (roll < 0.7) speedTier = "jog";
        else speedTier = "run";
      }

      const enemy = new Enemy(this.scene, sx, sy, type, 1, 1, speedTier);
      enemy.body.setCollideWorldBounds(true);
      this.enemies.add(enemy);

      if (isDog) this.dogs.push(enemy);

      // If this is a noise-surge spawn, start them alerted and converging
      if (alerted) {
        enemy.detectionState = "chasing";
      }

      // 40% ground-spawn for ambient zombies, never for surge spawns
      if (!alerted && type === "basic" && Math.random() < 0.4) {
        enemy.playGroundSpawn();
      }

      return true;
    }

    return false;
  }

  /** Count enemies within radius of a position */
  private countNearby(pos: { x: number; y: number }, radius: number): number {
    let count = 0;
    this.enemies.getChildren().forEach(obj => {
      const e = obj as Enemy;
      if (!e.active || e.dying || e.raveZombie) return;
      if (Phaser.Math.Distance.Between(e.x, e.y, pos.x, pos.y) <= radius) {
        count++;
      }
    });
    return count;
  }

  /** Despawn unaware enemies that are too far from the player */
  private despawnFarEnemies(playerPos: { x: number; y: number }, maxDist: number) {
    this.enemies.getChildren().forEach(obj => {
      const e = obj as Enemy;
      if (!e.active || e.dying || e.raveZombie) return;
      // Never despawn bosses, mason, dogs in aggro, or chasing enemies
      if (e.enemyType === "boss" || e.enemyType === "mason") return;
      if (e.detectionState === "chasing") return;

      const dist = Phaser.Math.Distance.Between(e.x, e.y, playerPos.x, playerPos.y);
      if (dist > maxDist) {
        e.destroy();
      }
    });
  }

  // ─── Noise Surge System ───

  /** Called by GameScene when a loud event happens — queues extra spawns converging on the noise */
  triggerNoiseSurge(x: number, y: number, extraSpawns: number, durationMs: number) {
    if (this.frozen || this.spawningDisabled) return;
    const intervalMs = durationMs / Math.max(extraSpawns, 1);
    this.surgeQueue.push({
      targetX: x,
      targetY: y,
      remaining: extraSpawns,
      intervalMs,
      timer: 0, // spawn first one immediately
      alerted: (BALANCE as any).spawning.surgeSpawnAlerted,
    });
  }

  /** Convenience: trigger sprint surge (with cooldown) */
  triggerSprintSurge(x: number, y: number) {
    if (this.sprintSurgeCooldown > 0) return;
    const cfg = (BALANCE as any).spawning;
    this.sprintSurgeCooldown = cfg.sprintSurgeCooldownMs;
    this.triggerNoiseSurge(x, y, cfg.sprintSurge, 1000);
  }

  /** Convenience: trigger car alarm surge */
  triggerCarAlarmSurge(x: number, y: number) {
    const cfg = (BALANCE as any).spawning;
    this.triggerNoiseSurge(x, y, cfg.carAlarmSurge, cfg.carAlarmSurgeMs);
  }

  /** Process active surge queues — spawn enemies over time */
  private processSurges(delta: number, playerPos: { x: number; y: number }) {
    const cfg = (BALANCE as any).spawning;
    const totalAlive = this.enemies.getChildren().filter(
      e => e.active && !(e as Enemy).dying && !(e as Enemy).raveZombie
    ).length;

    for (let i = this.surgeQueue.length - 1; i >= 0; i--) {
      const surge = this.surgeQueue[i];
      surge.timer -= delta;

      if (surge.timer <= 0 && surge.remaining > 0 && totalAlive < cfg.globalCap) {
        const target = { x: surge.targetX, y: surge.targetY };
        const spawned = this.spawnNearPlayer(playerPos, 300, 500, surge.alerted, target);
        if (spawned) {
          surge.remaining--;
        }
        surge.timer = surge.intervalMs;
      }

      if (surge.remaining <= 0) {
        this.surgeQueue.splice(i, 1);
      }
    }
  }

  // ─── Spatial Validation ───

  private isExcluded(x: number, y: number): boolean {
    for (const z of this.exclusionZones) {
      if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) return true;
    }
    return false;
  }

  isGated(x: number, y: number): boolean {
    for (const zone of this.gatedZones) {
      if (x >= zone.x && x <= zone.x + zone.w && y >= zone.y && y <= zone.y + zone.h) {
        if (!this.isDoorOpen(zone.label)) return true;
      }
    }
    return false;
  }

  isValidPosition(x: number, y: number): boolean {
    return !this.isExcluded(x, y) && !this.isGated(x, y) && this.isCollisionFree(x, y);
  }

  // ─── SCARYBOI Encounter System ───

  triggerEncounter(enc: "gate" | "library" | "estate") {
    if (this.bossActive || this.scaryboiDefeated) return;
    if (this.scaryboiEncounters[enc]) return;

    this.activeEncounter = enc;
    this.scaryboiEncounters[enc] = true;
    this.bossActive = true;

    this.onEncounterTrigger?.(enc);
  }

  registerBossEnemy(boss: Enemy) {
    this.bossEnemy = boss;
  }

  private checkBossFlee() {
    if (!this.bossEnemy || !this.bossActive) return;

    const encConfigs = (BALANCE.waves as any).bossEncountersByOrder;
    const encIndex = this.scaryboiEncounterCount;
    const encConfig = encConfigs[encIndex] ?? encConfigs[encConfigs.length - 1];
    const fleeThreshold = encConfig.fleeThreshold ?? 0;

    const maxHp = (BALANCE.enemies.boss as any).hp as number;
    const spawnHp = Math.round(maxHp * encConfig.hpPercent);
    const hpPct = this.bossEnemy.health / spawnHp;

    if (fleeThreshold > 0 && hpPct <= fleeThreshold) {
      this.scaryboiEncounterCount++;
      this.makeBossFlee();
      return;
    }

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
    boss.fleeing = true;
    this.bossActive = false;
    this.bossEnemy = null;
    this.onBossFlee?.();

    if (!boss.playSmokeVanish()) {
      boss.destroy();
    } else {
      this.scene.time.delayedCall(3000, () => {
        if (boss.active) boss.destroy();
      });
    }
  }

  // ─── Public API ───

  setFrozen(frozen: boolean) { this.frozen = frozen; }

  getActiveEncounter() { return this.activeEncounter; }
  isScaryboiDefeated(): boolean { return this.scaryboiDefeated; }
  hasSeenScaryboi(): boolean { return this.scaryboiFirstSeen; }
  markScaryboiSeen() { this.scaryboiFirstSeen = true; }
  isEstateLocked(): boolean {
    return !this.scaryboiEncounters.gate || !this.scaryboiEncounters.library;
  }
  getCurrentEncounterConfig(): { hpPercent: number; fleeThreshold: number; gracePeriodMs: number } {
    const configs = (BALANCE.waves as any).bossEncountersByOrder;
    return configs[this.scaryboiEncounterCount] ?? configs[configs.length - 1];
  }

  /** Get tier at position — no longer used for spawning but kept for external callers */
  getTierAt(_x: number, _y: number): number {
    return 1;
  }

  /** Dev: spawn a specific enemy type near the player */
  devSpawnEnemy(type: EnemyType, count: number = 1) {
    for (let i = 0; i < count; i++) {
      const pos = this.getPlayerPos();
      const cam = this.scene.cameras.main;
      const halfW = (cam.width / cam.zoom) / 2;
      const halfH = (cam.height / cam.zoom) / 2;
      let sx = 0, sy = 0;
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
        sx = Phaser.Math.Clamp(sx, 4 * 32, SURFACE_WIDTH - 4 * 32);
        sy = Phaser.Math.Clamp(sy, 4 * 32, MAP_HEIGHT - 4 * 32);
        if (!this.isExcluded(sx, sy) && !this.isGated(sx, sy) && this.isCollisionFree(sx, sy)) {
          ok = true;
          break;
        }
      }
      if (!ok) continue;

      const enemy = new Enemy(this.scene, sx, sy, type, 1, 1, type === "basic" ? "jog" : undefined);
      enemy.body.setCollideWorldBounds(true);
      this.enemies.add(enemy);
    }
  }
}
