import Phaser from "phaser";
import { BALANCE } from "../data/balance";
import { hasAnimation, getAnimKey } from "../data/animations";
import { Direction } from "../data/characters";
import type { Pathfinder } from "../systems/Pathfinder";

export type EnemyType = "basic" | "fast" | "boss";

// Exclusion zones — dogs should not roam into buildings or estate interior
const EXCLUSION_ZONES = [
  { x: 50, y: 50, w: 280, h: 500 },       // NW building
  { x: 10, y: 1170, w: 520, h: 480 },     // SW building
  { x: 920, y: 220, w: 300, h: 850 },     // Estate interior (left)
  { x: 1200, y: 60, w: 610, h: 940 },     // Estate interior (right)
  { x: 1920, y: 0, w: 1280, h: 1920 },     // Underground area (cols 60+)
];
function isExcludedZone(px: number, py: number): boolean {
  for (const z of EXCLUSION_ZONES) {
    if (px >= z.x && px <= z.x + z.w && py >= z.y && py <= z.y + z.h) return true;
  }
  return false;
}

function angleToDirection(angle: number): string {
  const deg = Phaser.Math.RadToDeg(angle);
  const norm = ((deg % 360) + 360) % 360;

  if (norm >= 337.5 || norm < 22.5) return "east";
  if (norm >= 22.5 && norm < 67.5) return "south-east";
  if (norm >= 67.5 && norm < 112.5) return "south";
  if (norm >= 112.5 && norm < 157.5) return "south-west";
  if (norm >= 157.5 && norm < 202.5) return "west";
  if (norm >= 202.5 && norm < 247.5) return "north-west";
  if (norm >= 247.5 && norm < 292.5) return "north";
  return "north-east";
}

const VARIANT_TINTS: Record<EnemyType, number> = {
  basic: 0xffffff,
  fast: 0xffffff,
  boss: 0xffffff,
};

const VARIANT_SCALES: Record<EnemyType, number> = {
  basic: 0.28,
  fast: 0.4,
  boss: 0.45,
};

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;

  health: number;
  maxHealth: number;
  speed: number;
  damage: number;
  enemyType: EnemyType;

  private healthBarGfx: Phaser.GameObjects.Graphics;
  private hitFlashTimer = 0;
  private currentDir: Direction = "south";
  private hasWalkAnim: boolean;
  private hasBiteAnim: boolean;
  private hasLungeBiteAnim: boolean;
  private hasDeathAnim: boolean;
  private hasLeapAnim: boolean;
  private hasTakingPunchAnim: boolean;
  private hasFallingBackDeath: boolean;
  private hasGunshotDeath: boolean;
  private biting = false;
  private leaping = false;
  dying = false;
  private takingPunch = false;
  private leapBiteCombo = false; // true when leap chains into bite for 1.5x damage
  private leapCooldown = 0; // ms until next leap allowed
  private baseTint: number;
  private stunTimer = 0; // ms remaining where enemy is slowed/stopped
  private lastX = 0;
  private lastY = 0;
  private pathWaypoints: { x: number; y: number }[] = []; // A* path to follow
  private pathIndex = 0; // current waypoint index
  private pathRefreshTimer = 0; // ms until next path recalculation
  private pathRefreshInterval = 500; // recalc every 500ms (staggered per enemy)
  private spriteId: string; // "creepyzombie", "zombiedog", or "scaryboi"
  private walkAnimType: string;
  private idleAnimType: string;

  // Dog-specific state (persistent roaming pack creatures)
  dogState: "roaming" | "aggro" = "roaming";
  private roamTarget: { x: number; y: number } | null = null;
  private roamTimer = 0; // time until picking a new roam target

  // Boss-specific state
  private bossPhase: "stalk" | "chase" | "retreat" = "stalk";
  private bossAttackCooldowns: Record<string, number> = {};
  private backflipping = false;
  private castingFireball = false;
  private bossRunning = false; // true when in chase speed

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    type: EnemyType,
    waveMultiplier: number = 1,
    waveDamageMultiplier: number = 1,
    speedTier?: "shamble" | "jog" | "run"
  ) {
    const isBoss = type === "boss";
    const isFast = type === "fast";
    const spriteId = isBoss ? "scaryboi" : isFast ? "zombiedog" : "creepyzombie";
    super(scene, x, y, `${spriteId}-south`);

    this.spriteId = spriteId;
    const baseStats = BALANCE.enemies[type];
    this.enemyType = type;
    this.maxHealth = Math.floor(baseStats.hp * waveMultiplier);
    this.health = this.maxHealth;
    if (isBoss) {
      this.speed = (baseStats as any).speed;
      this.damage = Math.floor((baseStats as any).attacks.crossPunch.damage * waveDamageMultiplier);
    } else if (type === "basic") {
      // WaW-style speed tiers for walkers
      const bs = baseStats as typeof BALANCE.enemies.basic;
      const tier = speedTier ?? "shamble";
      this.speed = tier === "run" ? bs.runSpeed : tier === "jog" ? bs.jogSpeed : bs.speed;
      this.damage = Math.floor(bs.damage * waveDamageMultiplier);
    } else {
      this.speed = baseStats.speed;
      this.damage = Math.floor((baseStats as any).damage * waveDamageMultiplier);
    }
    this.baseTint = VARIANT_TINTS[type];

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setScale(VARIANT_SCALES[type]);
    this.setDepth(5);

    // Collision body covering torso + feet for reliable hit detection
    if (isBoss) {
      this.body.setSize(60, 70);
      this.body.setOffset(50, 50);
    } else if (isFast) {
      // Dog — lower, wider hitbox
      this.body.setSize(50, 40);
      this.body.setOffset(55, 80);
    } else {
      this.body.setSize(40, 55);
      this.body.setOffset(44, 55);
    }

    if (this.baseTint !== 0xffffff) {
      this.setTint(this.baseTint);
    }

    // Boss uses different anim names
    const walkAnim = isBoss ? "running-8-frames" : "walk";
    const idleAnim = isBoss ? "fight-stance-idle-8-frames" : "walk";
    this.walkAnimType = walkAnim;
    this.idleAnimType = idleAnim;

    this.hasWalkAnim = hasAnimation(spriteId, walkAnim);
    this.hasBiteAnim = hasAnimation(spriteId, "bite") || hasAnimation(spriteId, "cross-punch");
    this.hasLungeBiteAnim = hasAnimation(spriteId, "lunge-bite") || hasAnimation(spriteId, "lead-jab");
    this.hasDeathAnim = hasAnimation(spriteId, "death");
    this.hasLeapAnim = hasAnimation(spriteId, "leap") || hasAnimation(spriteId, "running-jump");
    this.hasTakingPunchAnim = hasAnimation(spriteId, "taking-punch");
    this.hasFallingBackDeath = hasAnimation(spriteId, "falling-back-death");
    this.hasGunshotDeath = hasAnimation(spriteId, "gunshot-death");
    this.leapCooldown = 2000 + Math.random() * 2000; // stagger initial leap timing
    this.lastX = x;
    this.lastY = y;
    // Dogs recalc paths faster; stagger initial timer so they don't all fire on the same frame
    if (isFast) this.pathRefreshInterval = 300;
    this.pathRefreshTimer = Math.random() * this.pathRefreshInterval;

    // Start walk animation if available
    if (this.hasWalkAnim) {
      this.play(getAnimKey(spriteId, walkAnim, "south"));
    }

    this.healthBarGfx = scene.add.graphics();
    this.healthBarGfx.setDepth(20);
  }

  /** Apply extra stun time for heavy knockback (e.g. shotgun blasts) */
  applyKnockbackStun(ms: number) {
    this.stunTimer = Math.max(this.stunTimer, ms);
  }

  /** Stop walk animation and show static idle texture (used for EMP stun) */
  stopAndIdle() {
    this.stop();
    this.setTexture(`${this.spriteId}-${this.currentDir}`);
  }

  /**
   * @param amount damage to deal
   * @param source "melee" for punches, "ranged" for bullets/projectiles
   */
  takeDamage(amount: number, source: "melee" | "ranged" = "melee"): boolean {
    if (this.dying) return false; // already dead — don't award duplicate kills
    this.health -= amount;
    this.hitFlashTimer = 100;
    this.setTint(0xffffff);

    // Notify WaveManager of boss damage for flee threshold tracking
    if (this.enemyType === "boss") {
      const wm = (this.scene as any).waveManager;
      wm?.onBossDamaged?.(amount);
    }

    // Stun on hit — fast enemies stun longer (fragile), boss resists stun
    this.stunTimer = this.enemyType === "fast" ? 400 : this.enemyType === "boss" ? 80 : 200;

    if (this.health <= 0) {
      this.die(source);
      return true;
    }

    // Play taking-punch reaction (creepyzombie only, non-lethal hits)
    if (this.hasTakingPunchAnim && !this.takingPunch && !this.biting && !this.leaping) {
      this.playTakingPunch();
    }

    return false;
  }

  /** Play taking-punch flinch, then resume walk */
  private playTakingPunch() {
    this.takingPunch = true;
    const key = getAnimKey(this.spriteId, "taking-punch", this.currentDir);
    if (this.scene.anims.exists(key)) {
      this.play(key);
      this.once("animationcomplete", () => {
        this.takingPunch = false;
        if (this.hasWalkAnim && !this.biting && !this.dying) {
          this.play(getAnimKey(this.spriteId, this.walkAnimType, this.currentDir), true);
        }
      });
    } else {
      this.takingPunch = false;
    }
  }

  private die(source: "melee" | "ranged" = "melee") {
    if (this.dying) return;
    this.dying = true;

    // Stop moving
    this.body.setVelocity(0, 0);
    this.body.enable = false;

    // Blood splat — stays on the ground
    const blood = this.scene.add.graphics();
    blood.setDepth(0.5);
    for (let i = 0; i < 4; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 4 + Math.random() * 12;
      const px = this.x + Math.cos(angle) * dist;
      const py = this.y + Math.sin(angle) * dist;
      const size = 1.5 + Math.random() * 2;
      blood.fillStyle(0x880000, 0.35 + Math.random() * 0.15);
      blood.fillCircle(px, py, size);
    }
    blood.fillStyle(0x660000, 0.3);
    blood.fillCircle(this.x, this.y, 3 + Math.random() * 2);

    const gameScene = this.scene as any;
    if (gameScene.bloodSplats) {
      gameScene.bloodSplats.push({ gfx: blood, spawnWave: gameScene.waveManager?.wave ?? 1 });
    }

    this.healthBarGfx.destroy();

    // Pick death animation based on damage source
    const deathAnim = this.pickDeathAnim(source);
    if (deathAnim) {
      this.play(deathAnim);
      this.once("animationcomplete", () => {
        this.scene.tweens.add({
          targets: this,
          alpha: 0,
          duration: 300,
          onComplete: () => this.destroy(),
        });
      });
      return;
    }

    this.destroy();
  }

  /** Choose the best death animation for the damage source */
  private pickDeathAnim(source: "melee" | "ranged"): string | null {
    const dir = this.currentDir;

    if (source === "melee") {
      // Punch kill: falling-back-death only
      if (this.hasFallingBackDeath) {
        const key = getAnimKey(this.spriteId, "falling-back-death", dir);
        if (this.scene.anims.exists(key)) return key;
      }
    } else {
      // Gun kill: 2/3 gunshot-death, 1/3 falling-back-death
      const useGunshot = Math.random() < 0.67;
      if (useGunshot && this.hasGunshotDeath) {
        const key = getAnimKey(this.spriteId, "gunshot-death", dir);
        if (this.scene.anims.exists(key)) return key;
      }
      if (this.hasFallingBackDeath) {
        const key = getAnimKey(this.spriteId, "falling-back-death", dir);
        if (this.scene.anims.exists(key)) return key;
      }
      if (this.hasGunshotDeath) {
        const key = getAnimKey(this.spriteId, "gunshot-death", dir);
        if (this.scene.anims.exists(key)) return key;
      }
    }

    // Fallback: generic death animation
    if (this.hasDeathAnim) {
      const key = getAnimKey(this.spriteId, "death", dir);
      if (this.scene.anims.exists(key)) return key;
    }

    return null;
  }

  /** Get effective damage (1.5x during leap+bite combo) */
  getEffectiveDamage(): number {
    if (this.leapBiteCombo) {
      return Math.floor(this.damage * 1.5);
    }
    return this.damage;
  }

  /** Play bite animation when attacking the player (randomly picks lunge-bite variant) */
  playBite() {
    if (!this.hasBiteAnim || this.biting) return;

    this.biting = true;

    // Boss uses cross-punch/lead-jab, others use bite/lunge-bite
    const isBossEnemy = this.enemyType === "boss";
    const useLunge = this.hasLungeBiteAnim && Math.random() < 0.5;
    const animType = isBossEnemy
      ? (useLunge ? "lead-jab" : "cross-punch")
      : (useLunge ? "lunge-bite" : "bite");
    const biteKey = getAnimKey(this.spriteId, animType, this.currentDir);

    if (this.scene.anims.exists(biteKey)) {
      this.off("animationcomplete", this.handleBiteComplete, this);
      this.play(biteKey);
      this.once("animationcomplete", this.handleBiteComplete, this);
    } else {
      // Fallback to regular bite/cross-punch
      const fallbackType = isBossEnemy ? "cross-punch" : "bite";
      const fallbackKey = getAnimKey(this.spriteId, fallbackType, this.currentDir);
      if (this.scene.anims.exists(fallbackKey)) {
        this.off("animationcomplete", this.handleBiteComplete, this);
        this.play(fallbackKey);
        this.once("animationcomplete", this.handleBiteComplete, this);
      } else {
        this.biting = false;
        this.leapBiteCombo = false;
      }
    }
  }

  private handleBiteComplete = () => {
    this.biting = false;
    this.leapBiteCombo = false;
    // Resume walk animation
    if (this.hasWalkAnim) {
      this.play(getAnimKey(this.spriteId, this.walkAnimType, this.currentDir), true);
    }
  };

  /** Start a leap attack toward the player. May combo into bite for extra damage. */
  private startLeap(angle: number, dist: number) {
    if (this.leaping || this.biting || this.dying) return;

    this.leaping = true;
    this.leapCooldown = 3000 + Math.random() * 2000; // 3-5s cooldown

    // Decide if this leap combos into a bite (closer = more likely)
    // Under 80px: 60% combo, 80-120px: 30% combo
    const comboChance = dist < 80 ? 0.6 : 0.3;
    const willCombo = Math.random() < comboChance;

    // Play leap animation (boss uses running-jump)
    const leapAnimType = this.enemyType === "boss" ? "running-jump" : "leap";
    const leapKey = getAnimKey(this.spriteId, leapAnimType, this.currentDir);
    if (this.scene.anims.exists(leapKey)) {
      this.play(leapKey);
    }

    // Lunge forward at 2.5x speed
    const leapSpeed = this.speed * 2.5;
    this.body.setVelocity(
      Math.cos(angle) * leapSpeed,
      Math.sin(angle) * leapSpeed
    );

    // End leap after 300ms
    this.scene.time.delayedCall(300, () => {
      if (!this.active) return;
      this.leaping = false;

      if (willCombo && !this.dying) {
        // Leap+bite combo: play bite with 1.5x damage flag
        this.leapBiteCombo = true;
        this.playBite();
      } else if (this.hasWalkAnim && !this.biting && !this.dying) {
        this.play(getAnimKey(this.spriteId, this.walkAnimType, this.currentDir), true);
      }
    });
  }

  // ---- Boss-specific AI ----

  /** Boss phase-based combat AI */
  private updateBoss(delta: number, player: Phaser.Physics.Arcade.Sprite) {
    const angle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
    const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
    const hpPct = this.health / this.maxHealth;
    const bossStats = BALANCE.enemies.boss;

    // Tick all attack cooldowns
    for (const key of Object.keys(this.bossAttackCooldowns)) {
      if (this.bossAttackCooldowns[key] > 0) {
        this.bossAttackCooldowns[key] -= delta;
      }
    }

    // Don't act while mid-animation
    if (this.backflipping || this.castingFireball || this.biting || this.leaping) return;

    // Phase selection based on HP — low HP = cautious, not fleeing
    if (hpPct <= bossStats.backflipThreshold) {
      this.bossPhase = "retreat"; // cautious / kiting
    } else if (dist > 200) {
      this.bossPhase = "stalk";
    } else {
      this.bossPhase = "chase";
    }

    // Clamp boss to map bounds so he can't run off the map
    const mapW = (this.scene as any).mapWidth ?? 1920;
    const mapH = (this.scene as any).mapHeight ?? 1920;
    const pad = 48;
    if (this.x < pad || this.x > mapW - pad || this.y < pad || this.y > mapH - pad) {
      // Push back toward center of map
      const cx = mapW / 2;
      const cy = mapH / 2;
      const toCenter = Phaser.Math.Angle.Between(this.x, this.y, cx, cy);
      this.body.setVelocity(
        Math.cos(toCenter) * bossStats.runSpeed,
        Math.sin(toCenter) * bossStats.runSpeed
      );
      this.bossRunning = true;
      return;
    }

    switch (this.bossPhase) {
      case "retreat":
        // Low HP: play cautiously — kite at medium range, mix fireballs + melee
        // Only backflip if player is very close and cooldown is up (not every time)
        if (dist < 100 && this.canBossAttack("backflip")) {
          this.bossBackflip(angle);
          return;
        }
        // Maintain medium distance — circle/kite, don't just run away
        if (dist < 120) {
          // Strafe sideways instead of running straight back
          const strafeAngle = angle + Math.PI * 0.7; // angled retreat, not straight back
          this.body.setVelocity(
            Math.cos(strafeAngle) * bossStats.speed,
            Math.sin(strafeAngle) * bossStats.speed
          );
          this.bossRunning = false;
        } else if (dist > 250) {
          // Too far — cautiously approach
          this.body.setVelocity(
            Math.cos(angle) * bossStats.speed * 0.7,
            Math.sin(angle) * bossStats.speed * 0.7
          );
          this.bossRunning = false;
        } else {
          // Sweet spot — stop and use ranged attacks
          this.body.setVelocity(0, 0);
          this.bossRunning = false;
        }
        // Fireball when at range
        if (dist > 100 && this.canBossAttack("fireball")) {
          this.bossFireball(angle, player);
          return;
        }
        // Still melee if player closes in
        if (dist < bossStats.attacks.leadJab.range && this.canBossAttack("leadJab")) {
          this.bossMeleeAttack("leadJab", "lead-jab", bossStats.attacks.leadJab.damage);
          return;
        }
        break;

      case "stalk":
        // Far away: walk toward player slowly, throw fireballs
        this.bossRunning = false;
        this.body.setVelocity(
          Math.cos(angle) * bossStats.speed,
          Math.sin(angle) * bossStats.speed
        );
        // Fireball at range
        if (dist > 150 && dist < bossStats.attacks.fireball.range && this.canBossAttack("fireball")) {
          this.bossFireball(angle, player);
          return;
        }
        // Leap to close distance
        if (dist > 120 && dist < bossStats.attacks.leapAttack.range && this.canBossAttack("leapAttack")) {
          this.bossLeapAttack(angle);
          return;
        }
        break;

      case "chase":
        // Close: run at player, use melee attacks
        this.bossRunning = true;
        this.body.setVelocity(
          Math.cos(angle) * bossStats.runSpeed,
          Math.sin(angle) * bossStats.runSpeed
        );
        // Close range melee
        if (dist < bossStats.attacks.crossPunch.range) {
          // Alternate between jab and cross punch
          if (this.canBossAttack("leadJab")) {
            this.bossMeleeAttack("leadJab", "lead-jab", bossStats.attacks.leadJab.damage);
            return;
          }
          if (this.canBossAttack("crossPunch")) {
            this.bossMeleeAttack("crossPunch", "cross-punch", bossStats.attacks.crossPunch.damage);
            return;
          }
        }
        // Leap if slightly out of melee range
        if (dist > 100 && dist < bossStats.attacks.leapAttack.range && this.canBossAttack("leapAttack")) {
          this.bossLeapAttack(angle);
          return;
        }
        break;
    }
  }

  private canBossAttack(attackId: string): boolean {
    return (this.bossAttackCooldowns[attackId] ?? 0) <= 0;
  }

  /** Boss melee: play anim, deal damage on hit frame, set cooldown */
  private bossMeleeAttack(attackId: string, animType: string, dmg: number) {
    this.biting = true;
    const bossStats = BALANCE.enemies.boss;
    const cd = (bossStats.attacks as any)[attackId]?.cooldown ?? 2000;
    this.bossAttackCooldowns[attackId] = cd;

    // Set damage for this specific attack (GameScene reads getEffectiveDamage on contact)
    this.damage = dmg;

    this.body.setVelocity(0, 0);
    const key = getAnimKey(this.spriteId, animType, this.currentDir);
    if (this.scene.anims.exists(key)) {
      this.play(key);
      this.once("animationcomplete", () => {
        this.biting = false;
        if (this.hasWalkAnim && !this.dying) {
          this.play(getAnimKey(this.spriteId, this.walkAnimType, this.currentDir), true);
        }
      });
    } else {
      this.biting = false;
    }
  }

  /** Boss leap attack: lunge forward at burst speed */
  private bossLeapAttack(angle: number) {
    if (this.leaping || this.dying) return;
    this.leaping = true;
    const bossStats = BALANCE.enemies.boss;
    this.bossAttackCooldowns["leapAttack"] = bossStats.attacks.leapAttack.cooldown;
    this.damage = bossStats.attacks.leapAttack.damage;

    const leapKey = getAnimKey(this.spriteId, "running-jump", this.currentDir);
    if (this.scene.anims.exists(leapKey)) {
      this.play(leapKey);
    }

    this.body.setVelocity(
      Math.cos(angle) * bossStats.leapSpeed,
      Math.sin(angle) * bossStats.leapSpeed
    );

    this.scene.time.delayedCall(400, () => {
      if (!this.active) return;
      this.leaping = false;
      // Chain into cross punch if close enough
      const player = (this.scene as any).player;
      if (player?.active) {
        const d = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
        if (d < 100 && !this.dying) {
          this.bossMeleeAttack("crossPunch", "cross-punch", bossStats.attacks.crossPunch.damage);
          return;
        }
      }
      if (this.hasWalkAnim && !this.dying) {
        this.play(getAnimKey(this.spriteId, this.walkAnimType, this.currentDir), true);
      }
    });
  }

  /** Boss backflip: leap backward, invulnerable during flip */
  private bossBackflip(angle: number) {
    this.backflipping = true;
    this.bossAttackCooldowns["backflip"] = 5000;

    const retreatAngle = angle + Math.PI;
    // Backflip has limited directions — pick closest available
    const flipDir = this.pickBackflipDir();
    const flipKey = getAnimKey(this.spriteId, "backflip", flipDir);

    if (this.scene.anims.exists(flipKey)) {
      this.play(flipKey);
    }

    // Launch backward
    this.body.setVelocity(
      Math.cos(retreatAngle) * 200,
      Math.sin(retreatAngle) * 200
    );

    this.scene.time.delayedCall(500, () => {
      if (!this.active) return;
      this.backflipping = false;
      this.body.setVelocity(0, 0);
      if (this.hasWalkAnim && !this.dying) {
        this.play(getAnimKey(this.spriteId, this.walkAnimType, this.currentDir), true);
      }
    });
  }

  /** Backflip only has east, SE, SW sprites. Pick the closest. */
  private pickBackflipDir(): Direction {
    const dirMap: Record<string, Direction> = {
      "east": "east",
      "south-east": "south-east",
      "south": "south-east",
      "south-west": "south-west",
      "west": "south-west",
      "north-west": "south-west",
      "north": "east",
      "north-east": "east",
    };
    return dirMap[this.currentDir] || "east";
  }

  /** Check if this enemy is fully visible on the main camera */
  private isFullyOnScreen(): boolean {
    const cam = this.scene.cameras.main;
    const margin = 32; // half a tile buffer
    const left = cam.scrollX + margin;
    const right = cam.scrollX + cam.width / cam.zoom - margin;
    const top = cam.scrollY + margin;
    const bottom = cam.scrollY + cam.height / cam.zoom - margin;
    return this.x > left && this.x < right && this.y > top && this.y < bottom;
  }

  /** Boss fireball: play cast anim, spawn projectile toward player */
  private bossFireball(angle: number, player: Phaser.Physics.Arcade.Sprite) {
    // Allow fireball slightly off-screen but not from across the map
    const distToPlayer = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
    if (distToPlayer > 500) return;
    this.castingFireball = true;
    const bossStats = BALANCE.enemies.boss;
    this.bossAttackCooldowns["fireball"] = bossStats.attacks.fireball.cooldown;

    this.body.setVelocity(0, 0);
    const castKey = getAnimKey(this.spriteId, "fireball", this.currentDir);
    if (this.scene.anims.exists(castKey)) {
      this.play(castKey);
    }

    // Spawn projectile mid-animation
    this.scene.time.delayedCall(250, () => {
      if (!this.active || this.dying) return;
      this.spawnFireball(angle, bossStats.attacks.fireball);
    });

    this.once("animationcomplete", () => {
      this.castingFireball = false;
      if (this.hasWalkAnim && !this.dying) {
        this.play(getAnimKey(this.spriteId, this.walkAnimType, this.currentDir), true);
      }
    });
  }

  /** Create a fireball projectile that damages the player on overlap */
  private spawnFireball(
    angle: number,
    stats: { damage: number; projectileSpeed: number; range: number }
  ) {
    const scene = this.scene;
    // Simple circle graphic as fireball
    const fb = scene.add.graphics();
    fb.fillStyle(0xff4400, 1);
    fb.fillCircle(0, 0, 8);
    fb.fillStyle(0xffaa00, 0.7);
    fb.fillCircle(0, 0, 5);
    fb.setPosition(this.x, this.y);
    fb.setDepth(10);

    // Enable physics on the graphics via a zone
    const zone = scene.add.zone(this.x, this.y, 16, 16);
    scene.physics.add.existing(zone, false);
    const zBody = zone.body as Phaser.Physics.Arcade.Body;
    zBody.setVelocity(
      Math.cos(angle) * stats.projectileSpeed,
      Math.sin(angle) * stats.projectileSpeed
    );

    const startX = this.x;
    const startY = this.y;
    const dmg = stats.damage;

    // Check for player overlap every frame
    const updateHandler = () => {
      if (!zone.active) return;
      fb.setPosition(zone.x, zone.y);

      // Range limit
      const traveled = Phaser.Math.Distance.Between(startX, startY, zone.x, zone.y);
      if (traveled > stats.range) {
        destroyFireball();
        return;
      }

      // Out of world bounds
      if (zone.x < 0 || zone.x > 1920 || zone.y < 0 || zone.y > 1920) {
        destroyFireball();
        return;
      }

      // Player overlap check
      const player = (scene as any).player;
      if ((scene as any).gameOver) {
        destroyFireball();
        return;
      }
      if (player?.active && !player.invincible) {
        const d = Phaser.Math.Distance.Between(zone.x, zone.y, player.x, player.y);
        if (d < 30) {
          player.stats.health -= dmg;
          scene.cameras.main.flash(100, 255, 100, 0, false);
          scene.cameras.main.shake(80, 0.004);
          (scene as any).playPlayerHurt?.();
          if (player.stats.health <= 0) {
            player.stats.health = 0;
            (scene as any).gameOver = true;
            player.body.setVelocity(0, 0);
            player.playDeath?.(() => (scene as any).triggerGameOver?.());
          }
          destroyFireball();
        }
      }
    };

    const destroyFireball = () => {
      scene.events.off("update", updateHandler);
      fb.destroy();
      zone.destroy();
    };

    scene.events.on("update", updateHandler);

    // Safety: destroy after 5 seconds regardless
    scene.time.delayedCall(5000, destroyFireball);
  }

  // ---- End boss AI ----

  // ---- Dog pack AI ----

  /** Dog AI: roam freely, aggro when player is spotted, pack with nearby dogs */
  private updateDog(delta: number, player: Phaser.Physics.Arcade.Sprite) {
    if (this.stunTimer > 0 || this.leaping || this.biting) {
      this.updateDirection(player);
      return;
    }

    // Safety: if somehow inside a building, teleport out
    if (isExcludedZone(this.x, this.y)) {
      this.setPosition(500, 960); // open area west of estate
      this.roamTarget = null;
      this.dogState = "roaming";
    }

    const dogStats = BALANCE.enemies.fast as any;
    const aggroRange = dogStats.aggroRange ?? 220;
    const packRange = dogStats.packRange ?? 180;
    const roamSpeed = dogStats.roamSpeed ?? 45;
    const distToPlayer = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);

    // Dogs go passive during intermission — force roaming, no aggro
    const waveState = (this.scene as any).waveManager?.state;
    if (waveState === "intermission" || waveState === "pre_game") {
      if (this.dogState === "aggro") {
        this.dogState = "roaming";
        this.roamTarget = null;
        this.pathWaypoints = [];
      }
      // Just roam, skip aggro checks below
    } else {
      // Check if player is in detection range (only during active waves)
      if (distToPlayer < aggroRange) {
        this.dogState = "aggro";
      }
    }

    // Pack behavior: if a nearby dog is aggro, this dog aggros too
    if (this.dogState === "roaming") {
      const enemies = (this.scene as any).enemies as Phaser.Physics.Arcade.Group | undefined;
      if (enemies) {
        for (const child of enemies.getChildren()) {
          const other = child as Enemy;
          if (!other.active || other.dying || other === this || other.enemyType !== "fast") continue;
          const d = Phaser.Math.Distance.Between(this.x, this.y, other.x, other.y);
          if (d < packRange && other.dogState === "aggro") {
            this.dogState = "aggro";
            break;
          }
        }
      }
    }

    if (this.dogState === "aggro") {
      // Aggressive chase — use A* pathfinding
      const angle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);

      // Leap attack when close
      if (this.hasLeapAnim && !this.leaping && !this.biting
          && this.leapCooldown <= 0 && distToPlayer > 30 && distToPlayer < 80) {
        this.startLeap(angle, distToPlayer);
        return;
      }

      // A* path toward player
      this.pathRefreshTimer -= delta;
      if (this.pathRefreshTimer <= 0) {
        this.pathRefreshTimer = this.pathRefreshInterval;
        const pathfinder = (this.scene as any).pathfinder as Pathfinder | undefined;
        if (pathfinder) {
          pathfinder.findPath(this.x, this.y, player.x, player.y, (path) => {
            if (!this.active || this.dying) return;
            if (path && path.length > 1) {
              this.pathWaypoints = path;
              this.pathIndex = 1;
            } else {
              this.pathWaypoints = [];
              this.pathIndex = 0;
            }
          });
        }
      }

      // Follow A* path only — dogs never direct-chase (they get stuck on walls)
      if (this.pathWaypoints.length > 0 && this.pathIndex < this.pathWaypoints.length) {
        const wp = this.pathWaypoints[this.pathIndex];
        const wpDist = Phaser.Math.Distance.Between(this.x, this.y, wp.x, wp.y);
        if (wpDist < 12) {
          this.pathIndex++;
          if (this.pathIndex >= this.pathWaypoints.length) this.pathWaypoints = [];
        } else {
          const wpAngle = Phaser.Math.Angle.Between(this.x, this.y, wp.x, wp.y);
          this.body.setVelocity(Math.cos(wpAngle) * this.speed, Math.sin(wpAngle) * this.speed);
        }
      } else if (distToPlayer < 40) {
        // Only direct chase when extremely close (already past any walls)
        this.body.setVelocity(Math.cos(angle) * this.speed, Math.sin(angle) * this.speed);
      } else {
        // Waiting for pathfinder — slow down, don't ram into walls
        this.body.setVelocity(0, 0);
      }

      // De-aggro if player gets very far away (2x aggro range)
      if (distToPlayer > aggroRange * 2.5) {
        this.dogState = "roaming";
        this.roamTarget = null;
        this.pathWaypoints = [];
      }

      this.updateDirection(player);
    } else {
      // Roaming state — wander the map, drift toward nearby dogs
      this.roamTimer -= delta;

      // Check for nearby dogs to pack with (move toward the closest roaming dog)
      let packTarget: { x: number; y: number } | null = null;
      const enemies = (this.scene as any).enemies as Phaser.Physics.Arcade.Group | undefined;
      if (enemies) {
        let closestDogDist = packRange;
        for (const child of enemies.getChildren()) {
          const other = child as Enemy;
          if (!other.active || other.dying || other === this || other.enemyType !== "fast") continue;
          const d = Phaser.Math.Distance.Between(this.x, this.y, other.x, other.y);
          if (d < closestDogDist && d > 30) { // don't stack on top of each other
            closestDogDist = d;
            packTarget = { x: other.x, y: other.y };
          }
        }
      }

      // Pick new roam target periodically
      if (this.roamTimer <= 0 || !this.roamTarget) {
        this.roamTimer = 3000 + Math.random() * 4000; // 3-7s between roam targets

        if (packTarget && !isExcludedZone(packTarget.x, packTarget.y)) {
          // Drift toward nearby dog with some randomness
          this.roamTarget = {
            x: packTarget.x + (Math.random() - 0.5) * 80,
            y: packTarget.y + (Math.random() - 0.5) * 80,
          };
        } else {
          // Random wander point within surface play area (avoid buildings)
          let rx: number, ry: number;
          let attempts = 0;
          do {
            rx = 100 + Math.random() * 1720;
            ry = 100 + Math.random() * 1720;
            attempts++;
          } while (isExcludedZone(rx, ry) && attempts < 10);
          this.roamTarget = { x: rx, y: ry };
        }
      }

      // Move toward roam target at slow speed
      if (this.roamTarget) {
        const rtDist = Phaser.Math.Distance.Between(this.x, this.y, this.roamTarget.x, this.roamTarget.y);
        if (rtDist < 20) {
          // Reached target — idle briefly then pick new one
          this.body.setVelocity(0, 0);
          this.roamTarget = null;
        } else {
          const rtAngle = Phaser.Math.Angle.Between(this.x, this.y, this.roamTarget.x, this.roamTarget.y);
          this.body.setVelocity(Math.cos(rtAngle) * roamSpeed, Math.sin(rtAngle) * roamSpeed);
        }
      }

      // Face movement direction (not player) when roaming
      if (this.body.velocity.x !== 0 || this.body.velocity.y !== 0) {
        const moveAngle = Math.atan2(this.body.velocity.y, this.body.velocity.x);
        const newDir = angleToDirection(moveAngle) as Direction;
        if (newDir !== this.currentDir) {
          this.currentDir = newDir;
          if (this.hasWalkAnim) {
            this.play(getAnimKey(this.spriteId, this.walkAnimType, newDir), true);
          }
        }
      }
    }
  }

  // ---- End dog AI ----

  update(_time: number, delta: number) {
    if (!this.active || !this.body || this.dying) return;

    // Get player reference from scene
    const player = (this.scene as any).player as
      | Phaser.Physics.Arcade.Sprite
      | undefined;
    if (!player || !player.active) return;

    // Stun countdown — don't chase while stunned (let knockback carry them)
    if (this.stunTimer > 0) {
      this.stunTimer -= delta;
    }

    // Leap cooldown (non-boss enemies)
    if (this.leapCooldown > 0) {
      this.leapCooldown -= delta;
    }

    // Boss uses its own AI system
    if (this.enemyType === "boss" && this.stunTimer <= 0) {
      this.updateBoss(delta, player);
      this.updateDirection(player);
      this.updateVisuals(delta);
      return;
    }

    // Dogs use pack roaming AI
    if (this.enemyType === "fast") {
      this.updateDog(delta, player);
      this.updateVisuals(delta);
      return;
    }

    // ---- Basic zombie AI (A* pathfinding) ----
    const angle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
    const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);

    // Last 3 round-blocking enemies get aggressive — faster speed + faster path recalc
    const wm = (this.scene as any).waveManager;
    const remaining = wm?.getBlockingEnemies?.() ?? 99;
    const isLastStand = remaining <= 3 && (wm?.state === "active" || wm?.state === "clearing");
    const moveSpeed = isLastStand ? this.speed * 1.15 : this.speed;
    const refreshRate = isLastStand ? 250 : this.pathRefreshInterval;

    // A* pathfinding — request a new path periodically
    this.pathRefreshTimer -= delta;
    if (this.pathRefreshTimer <= 0 && this.stunTimer <= 0 && !this.leaping) {
      this.pathRefreshTimer = refreshRate;
      const pathfinder = (this.scene as any).pathfinder as Pathfinder | undefined;
      if (pathfinder) {
        pathfinder.findPath(this.x, this.y, player.x, player.y, (path) => {
          if (!this.active || this.dying) return;
          if (path && path.length > 1) {
            this.pathWaypoints = path;
            this.pathIndex = 1;
          } else {
            this.pathWaypoints = [];
            this.pathIndex = 0;
          }
        });
      }
    }

    if (this.stunTimer <= 0 && !this.leaping) {
      if (this.pathWaypoints.length > 0 && this.pathIndex < this.pathWaypoints.length) {
        const wp = this.pathWaypoints[this.pathIndex];
        const wpDist = Phaser.Math.Distance.Between(this.x, this.y, wp.x, wp.y);

        if (wpDist < 12) {
          this.pathIndex++;
          if (this.pathIndex >= this.pathWaypoints.length) {
            this.pathWaypoints = [];
          }
        } else {
          const wpAngle = Phaser.Math.Angle.Between(this.x, this.y, wp.x, wp.y);
          this.body.setVelocity(
            Math.cos(wpAngle) * moveSpeed,
            Math.sin(wpAngle) * moveSpeed
          );
        }
      } else {
        this.body.setVelocity(
          Math.cos(angle) * moveSpeed,
          Math.sin(angle) * moveSpeed
        );
      }
    }

    this.updateDirection(player);
    this.updateVisuals(delta);
  }

  /** Update sprite facing direction */
  private updateDirection(player: Phaser.Physics.Arcade.Sprite) {
    const angle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
    const newDir = angleToDirection(angle) as Direction;
    if (newDir !== this.currentDir) {
      this.currentDir = newDir;
      if (!this.biting && !this.leaping && !this.takingPunch && !this.backflipping && !this.castingFireball) {
        if (this.hasWalkAnim) {
          this.play(getAnimKey(this.spriteId, this.walkAnimType, newDir), true);
        } else {
          this.setTexture(`${this.spriteId}-${newDir}`);
        }
      }
      if (this.hitFlashTimer <= 0 && this.baseTint !== 0xffffff) {
        this.setTint(this.baseTint);
      }
    }
  }

  /** Update hit flash and health bar */
  private updateVisuals(delta: number) {
    // Hit flash recovery
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= delta;
      if (this.hitFlashTimer <= 0) {
        if (this.baseTint !== 0xffffff) {
          this.setTint(this.baseTint);
        } else {
          this.clearTint();
        }
      }
    }

    // Health bar (only when damaged)
    this.healthBarGfx.clear();
    if (this.health < this.maxHealth) {
      const isBoss = this.enemyType === "boss";
      const barW = isBoss ? 40 : 24;
      const barH = isBoss ? 4 : 2;
      const barX = this.x - barW / 2;
      const barY = this.y - (isBoss ? 45 : 30);

      this.healthBarGfx.fillStyle(0x000000, 0.6);
      this.healthBarGfx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

      const pct = this.health / this.maxHealth;
      const color = isBoss
        ? (pct > 0.5 ? 0xcc3333 : pct > 0.25 ? 0xff6600 : 0xff0000)
        : (pct > 0.5 ? 0x33cc33 : pct > 0.25 ? 0xcccc33 : 0xcc3333);
      this.healthBarGfx.fillStyle(color, 1);
      this.healthBarGfx.fillRect(barX, barY, barW * pct, barH);
    }
  }
}
