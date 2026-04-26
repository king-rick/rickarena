import Phaser from "phaser";
import { BALANCE } from "../data/balance";
import { hasAnimation, getAnimKey, getFrameKey } from "../data/animations";
import { Direction } from "../data/characters";
import type { Pathfinder } from "../systems/Pathfinder";

export type EnemyType = "basic" | "fast" | "boss" | "mason";

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

export function angleToDirection(angle: number): string {
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
  mason: 0xffffff,
};

const VARIANT_SCALES: Record<EnemyType, number> = {
  basic: 0.28,
  fast: 0.33,
  boss: 0.45,
  mason: 0.624,
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
  private hasChoppedInHalf: boolean = false;
  private hasBeingShotDeath: boolean = false;
  private biting = false;
  private leaping = false;
  dying = false;
  fleeing = false;
  dancing = false;
  raveZombie = false;
  private danceSpawnX = 0;
  private danceSpawnY = 0;
  private danceTimer = 0;       // ms until next state change (dance↔walk)
  private danceWalking = false;  // true when taking a few steps between dances
  private danceWalkDir: Direction = "south";
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
  private pathRefreshInterval = 400; // recalc every 400ms (staggered per enemy)
  private spriteId: string; // "creepyzombie", "zombiedog", or "scaryboi"
  private walkAnimType: string;
  private idleAnimType: string;

  // Ground-spawn state — zombie is climbing out of the ground
  spawning = false;
  private hasGroundSpawnAnim: boolean = false;

  // Stuck detection (basic zombies only — prevents round-blocking)
  private stuckTimer = 0; // ms spent barely moving
  private stuckCheckX = 0;
  private stuckCheckY = 0;
  private stuckSampleTimer = 0; // ms until next position sample
  private stuckTeleported = false; // true after first teleport attempt

  // Dog-specific state (persistent roaming pack creatures)
  dogState: "roaming" | "aggro" = "roaming";
  private roamTarget: { x: number; y: number } | null = null;
  private roamTimer = 0; // time until picking a new roam target
  private hasRunningAnim: boolean = false; // dog "running" (aggro sprint)
  private hasHowlAnim: boolean = false;    // dog howl
  private howling = false;                  // true during howl animation
  private hasBeingShotAnim: boolean = false; // boss "being-shot" stagger
  private beingShot = false;                // true during being-shot animation
  private electrocuting = false;             // true during electric fist deferred death

  // Boss-specific state
  private bossAttackCooldowns: Record<string, number> = {};
  private backflipping = false;
  private castingFireball = false;
  private bossRunning = false; // true when in chase speed
  private bossBusy = false;    // true during boss attacks — zeroes velocity every frame to prevent knockback skating
  private bossLunging = false; // true during punch lunge — exempts from bossBusy velocity zero
  private bossMovementState: "idle" | "approaching" | "chasing" | "circling" | "retreating" = "idle";
  private bossGracePeriod = 0;   // ms remaining before first attack after spawn
  private bossIsIndoor = false;  // true for south building — prefer rush/melee over fireballs
  bossCutscene = false;          // true during first-encounter cutscene — blocks all AI
  private bossCircleDir = 1;     // 1 or -1, randomized for circling direction
  private bossCircleTimer = 0;   // ms remaining in circling state

  // Mason-specific state
  private masonAttackCooldowns: Record<string, number> = {};
  private masonBusy = false;
  private masonIntroPlayed = false;
  private masonPhase2Triggered = false;

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
    const isMason = type === "mason";
    const isFast = type === "fast";
    const spriteId = isMason ? "mason" : isBoss ? "scaryboi" : isFast ? "zombiedog" : "creepyzombie";
    super(scene, x, y, `${spriteId}-south`);

    this.spriteId = spriteId;
    const baseStats = BALANCE.enemies[type];
    this.enemyType = type;
    this.maxHealth = Math.floor((baseStats as any).hp * waveMultiplier);
    this.health = this.maxHealth;
    if (isMason || isBoss) {
      this.speed = (baseStats as any).speed;
      const firstAttack = (baseStats as any).attacks.punchCombo ?? (baseStats as any).attacks.leadJab;
      this.damage = Math.floor(firstAttack.damage * waveDamageMultiplier);
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
    if (isMason) {
      this.body.setSize(65, 75);
      this.body.setOffset(50, 50);
    } else if (isBoss) {
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

    // Boss and mason use different anim names
    const walkAnim = isMason ? "walk" : isBoss ? "running" : "walk";
    const idleAnim = isMason ? "breathing-idle" : isBoss ? "fight-stance-idle" : "walk";
    this.walkAnimType = walkAnim;
    this.idleAnimType = idleAnim;

    this.hasWalkAnim = hasAnimation(spriteId, walkAnim);
    this.hasBiteAnim = hasAnimation(spriteId, "bite") || hasAnimation(spriteId, "cross-punch") || hasAnimation(spriteId, "punch-combo");
    this.hasLungeBiteAnim = hasAnimation(spriteId, "lunge-bite") || hasAnimation(spriteId, "lead-jab");
    this.hasDeathAnim = hasAnimation(spriteId, "death");
    this.hasLeapAnim = hasAnimation(spriteId, "leap");
    this.hasTakingPunchAnim = hasAnimation(spriteId, "taking-punch");
    this.hasFallingBackDeath = hasAnimation(spriteId, "falling-back-death");
    this.hasGunshotDeath = hasAnimation(spriteId, "gunshot-death");
    this.hasRunningAnim = hasAnimation(spriteId, "running");
    this.hasHowlAnim = hasAnimation(spriteId, "howl");
    this.hasBeingShotAnim = hasAnimation(spriteId, "being-shot");
    this.hasChoppedInHalf = hasAnimation(spriteId, "chopped-in-half");
    this.hasBeingShotDeath = hasAnimation(spriteId, "being-shot-death");
    this.hasGroundSpawnAnim = hasAnimation(spriteId, "ground-spawn");
    this.leapCooldown = 2000 + Math.random() * 2000; // stagger initial leap timing
    this.lastX = x;
    this.lastY = y;
    this.stuckCheckX = x;
    this.stuckCheckY = y;
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

  /** Clean up orphaned graphics when sprite is destroyed (e.g. boss flee) */
  preDestroy() {
    if (this.healthBarGfx) {
      this.healthBarGfx.destroy();
    }
  }

  /** Play ground-spawn animation — zombie is invulnerable and immobile until complete */
  playGroundSpawn() {
    if (!this.hasGroundSpawnAnim) return;
    this.spawning = true;
    this.body?.setEnable(false);
    const dir = this.currentDir || "south";
    const animKey = getAnimKey(this.spriteId, "ground-spawn", dir);
    if (this.scene.anims.exists(animKey)) {
      this.play(animKey);
      this.once("animationcomplete", () => {
        this.spawning = false;
        this.body?.setEnable(true);
      });
    } else {
      this.spawning = false;
      this.body?.setEnable(true);
    }
  }

  /** Whether this enemy is stunned and unable to attack */
  isStunned(): boolean {
    return this.electrocuting || this.stunTimer > 0;
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
  takeDamage(amount: number, source: "melee" | "ranged" | "katana" = "melee"): boolean {
    if (this.dying || this.fleeing || this.bossCutscene) return false; // dead, fleeing, or in cutscene
    // Mason is invulnerable until boss_fight phase
    if (this.enemyType === "mason") {
      const gs = this.scene as any;
      if (gs.masonRavePhase && gs.masonRavePhase !== "boss_fight") return false;
    }
    this.health -= amount;
    this.hitFlashTimer = 100;
    this.setTint(0xffffff);

    // Stun on hit — fast enemies stun longer (fragile), boss/mason resist stun
    this.stunTimer = this.enemyType === "fast" ? 400 : (this.enemyType === "boss" || this.enemyType === "mason") ? 80 : 200;

    if (this.health <= 0) {
      this.die(source);
      return true;
    }

    // Being-shot stagger (boss + dog, ranged hits only, not during other actions)
    if ((this.enemyType === "boss" || this.enemyType === "fast") && source === "ranged" && this.hasBeingShotAnim
        && !this.beingShot && !this.biting && !this.leaping && !this.backflipping && !this.castingFireball && !this.howling) {
      this.playBeingShot();
    }

    // Mason taking-punch stagger (any hit, not during special actions)
    if (this.enemyType === "mason" && this.hasTakingPunchAnim
        && !this.takingPunch && !this.biting && !this.masonBusy) {
      this.playTakingPunch();
    }

    // Play taking-punch reaction (creepyzombie only, non-lethal hits)
    if (this.hasTakingPunchAnim && !this.takingPunch && !this.biting && !this.leaping) {
      this.playTakingPunch();
    }

    return false;
  }

  /** Play being-shot stagger animation (boss + dog), then resume walk */
  private playBeingShot() {
    this.beingShot = true;
    const key = getAnimKey(this.spriteId, "being-shot", this.currentDir);
    if (this.scene.anims.exists(key)) {
      this.play(key);
      this.once("animationcomplete", () => {
        this.beingShot = false;
        if (this.hasWalkAnim && !this.dying) {
          this.play(getAnimKey(this.spriteId, this.walkAnimType, this.currentDir), true);
        }
      });
    } else {
      this.beingShot = false;
    }
  }

  /** Apply electric fist damage with deferred death: stun + electrified animation for duration, then die if lethal */
  /** Apply electric fist damage with deferred death.
   *  Dogs bypass this and die normally (no electrified-stun anim).
   *  Returns true if handled here (caller should skip normal damage). */
  applyElectricDamage(amount: number, stunMs: number, onKill: () => void): boolean {
    if (this.dying || this.fleeing) return false;

    // Dogs without electrified-stun anim fall back to normal damage
    if (this.enemyType === "fast" && !hasAnimation(this.spriteId, "electrified-stun")) {
      const killed = this.takeDamage(amount);
      if (killed) onKill();
      return true;
    }

    this.health -= amount;
    this.hitFlashTimer = 100;
    this.setTint(0xffffff);
    this.body.setVelocity(0, 0);

    // Lock the zombie in place — prevent all AI movement during electrocution
    this.electrocuting = true;
    this.stunTimer = stunMs;

    // Play electrified-stun animation
    const key = getAnimKey(this.spriteId, "electrified-stun", this.currentDir);
    if (this.scene.anims.exists(key)) {
      this.play(key);
    }

    // After stun duration, die if lethal, otherwise release
    this.scene.time.delayedCall(stunMs, () => {
      if (!this.active || this.dying) return;
      if (this.health <= 0) {
        // Go straight from stun into death — no frame gap
        onKill();
        this.die("melee");
      } else {
        this.electrocuting = false;
      }
    });

    return true;
  }

  /** Set the facing direction (used to orient boss on spawn before grace period idle) */
  setFacing(dir: Direction) {
    this.currentDir = dir;
  }

  /** Start dancing in place (rave zombies) — will wander slightly between dances */
  startDancing(dir: Direction) {
    this.dancing = true;
    this.currentDir = dir;
    this.danceSpawnX = this.x;
    this.danceSpawnY = this.y;
    this.danceWalking = false;
    this.danceTimer = 2000 + Math.random() * 3000; // dance 2-5s before first wander
    this.body.setVelocity(0, 0);
    this.playDanceAnim(dir);
  }

  private playDanceAnim(dir: Direction) {
    const key = getAnimKey(this.spriteId, "zombie-dancing", dir);
    if (this.scene.anims.exists(key)) {
      this.play(key, true);
    } else {
      const fallback = getAnimKey(this.spriteId, this.walkAnimType, dir);
      if (this.scene.anims.exists(fallback)) this.play(fallback, true);
    }
  }

  /** Stop dancing and return to normal AI */
  stopDancing() {
    this.dancing = false;
    this.pathWaypoints = [];
    this.pathIndex = 0;
    this.pathRefreshTimer = 0; // force immediate path recalculation
  }

  /** Initialize boss encounter — called by GameScene after spawn */
  initBossEncounter(gracePeriodMs: number, isIndoor = false) {
    this.bossGracePeriod = gracePeriodMs;
    this.bossIsIndoor = isIndoor;
    this.bossMovementState = "idle";
    this.body.setVelocity(0, 0);
    // Play idle anim during grace period
    const idleKey = getAnimKey(this.spriteId, this.idleAnimType, this.currentDir);
    if (this.scene.anims.exists(idleKey)) {
      this.play(idleKey, true);
    }
  }

  /** Play smoke-vanish animation, then destroy. Returns true if anim exists. */
  playSmokeVanish(): boolean {
    const key = getAnimKey(this.spriteId, "smoke-vanish", this.currentDir);
    if (this.scene.anims.exists(key)) {
      this.body.setVelocity(0, 0);
      this.play(key);
      this.once("animationcomplete", () => {
        this.destroy();
      });
      return true;
    }
    return false;
  }

  /** Play smoke-appear animation (reverse of vanish) — materializes from smoke */
  playSmokeAppear(): boolean {
    const key = getAnimKey(this.spriteId, "smoke-appear", this.currentDir);
    if (this.scene.anims.exists(key)) {
      this.body.setVelocity(0, 0);
      this.setAlpha(0);
      // Quick fade in while smoke plays
      this.scene.tweens.add({ targets: this, alpha: 1, duration: 200 });
      this.play(key);
      this.once("animationcomplete", () => {
        // Resume normal AI after appearing
        if (this.hasWalkAnim && !this.dying) {
          this.play(getAnimKey(this.spriteId, this.walkAnimType, this.currentDir), true);
        }
      });
      return true;
    }
    return false;
  }

  /** Cinematic smoke-appear for the first-encounter cutscene — slightly faster, smoother fade */
  playSmokeAppearCutscene(onComplete: () => void) {
    const key = getAnimKey(this.spriteId, "smoke-appear", this.currentDir);
    this.setAlpha(0);
    if (this.scene.anims.exists(key)) {
      // Fade-in over the smoke duration for a cinematic feel
      this.scene.tweens.add({ targets: this, alpha: 1, duration: 700, ease: "Sine.easeIn" });
      this.play({ key, frameRate: 4 }); // slightly faster than default 3fps
      this.once("animationcomplete", () => {
        if (this.active) onComplete();
      });
    } else {
      // Fallback: just fade in
      this.scene.tweens.add({
        targets: this, alpha: 1, duration: 800, ease: "Sine.easeIn",
        onComplete: () => { if (this.active) onComplete(); },
      });
    }
  }

  /** Cinematic backflip for the intro cutscene — no velocity, no fireball chain */
  playCutsceneBackflip(onComplete: () => void) {
    this.backflipping = true;
    const flipKey = getAnimKey(this.spriteId, "backflip", this.currentDir);
    if (this.scene.anims.exists(flipKey)) {
      this.play(flipKey);
    }
    // Duration matches normal backflip (500ms) + small buffer
    this.scene.time.delayedCall(600, () => {
      if (!this.active) return;
      this.backflipping = false;
      onComplete();
    });
  }

  /**
   * Full cinematic sequence for first encounter:
   * smoke appear → backflip → fight-stance-idle → calls onBannerReady
   */
  playCutsceneSequence(onBannerReady: () => void) {
    this.playSmokeAppearCutscene(() => {
      this.playCutsceneBackflip(() => {
        // Settle into menacing idle
        const idleKey = getAnimKey(this.spriteId, this.idleAnimType, this.currentDir);
        if (this.scene.anims.exists(idleKey)) {
          this.play(idleKey, true);
        }
        // Brief pause while idle plays, then show banner
        this.scene.time.delayedCall(500, () => {
          if (this.active) onBannerReady();
        });
      });
    });
  }

  /**
   * Short cutscene for encounters 2+: smoke appear → fight-stance-idle → banner
   * No backflip — he's done showing off, just materializes menacingly.
   */
  playCutsceneSequenceShort(onBannerReady: () => void) {
    this.playSmokeAppearCutscene(() => {
      const idleKey = getAnimKey(this.spriteId, this.idleAnimType, this.currentDir);
      if (this.scene.anims.exists(idleKey)) {
        this.play(idleKey, true);
      }
      this.scene.time.delayedCall(400, () => {
        if (this.active) onBannerReady();
      });
    });
  }

  /** End cutscene mode and start the actual encounter (called on banner dismiss) */
  startEncounterAfterCutscene(gracePeriodMs: number, isIndoor: boolean) {
    this.bossCutscene = false;
    // Immediate evasive backflip to avoid getting burst down on cutscene dismiss
    this.backflipping = true;
    // Face the player, then flip sideways (left or right of player)
    const player = (this.scene as any).player;
    if (player) {
      const angle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
      // Pick a perpendicular direction (left or right, random)
      const perpAngle = angle + (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
      const flipSpeed = 180;
      this.body.setVelocity(Math.cos(perpAngle) * flipSpeed, Math.sin(perpAngle) * flipSpeed);
    }
    const flipKey = getAnimKey(this.spriteId, "backflip", this.currentDir);
    if (this.scene.anims.exists(flipKey)) this.play(flipKey);
    this.scene.time.delayedCall(600, () => {
      if (!this.active) return;
      this.backflipping = false;
      this.body.setVelocity(0, 0);
      this.initBossEncounter(gracePeriodMs, isIndoor);
    });
  }

  /** Play taking-punch flinch, then resume walk */
  playTakingPunch() {
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

  private die(source: "melee" | "ranged" | "katana" = "melee") {
    if (this.dying) return;

    this.dying = true;

    // Stop moving
    this.body.setVelocity(0, 0);
    this.body.enable = false;

    this.healthBarGfx.destroy();

    // SCARYBOI encounters 1 & 2: smoke vanish instead of death animation
    if (this.enemyType === "boss") {
      const wm = (this.scene as any).waveManager;
      const encCount = wm?.scaryboiEncounterCount ?? 0;
      // Encounters 0 and 1 (first two): vanish in smoke, trigger flee logic
      if (encCount < 2) {
        this.fleeing = true;
        this.dying = false; // not truly dying — fleeing via smoke
        if (!this.playSmokeVanish()) {
          this.destroy(); // fallback if no smoke anim
        }
        // Let WaveManager know the boss fled
        wm?.onBossFlee?.();
        if (wm) {
          wm.scaryboiEncounterCount++;
          wm.bossActive = false;
          wm.bossEnemy = null;
        }
        return;
      }
      // Encounter 3 (estate): fall through to normal death animation below
    }

    // Mason: dramatic slow death with staggered blood splatters
    if (this.enemyType === "mason") {
      const deathKey = getAnimKey(this.spriteId, "death", this.currentDir);
      if (deathKey && this.scene.anims.exists(deathKey)) {
        // Slow down the death animation for dramatic effect
        this.play(deathKey);
        this.anims.msPerFrame = 250; // ~4fps — slow dramatic death

        // Staggered blood splatters during the death animation
        const scene = this.scene as any;
        const spawnBlood = () => {
          if (!this.active || !scene.spawnBloodSplat) return;
          const ox = (Math.random() - 0.5) * 30;
          const oy = (Math.random() - 0.5) * 20;
          scene.spawnBloodSplat(this.x + ox, this.y + oy, "kill", this.enemyType);
        };
        // Blood bursts at key frames during the fall
        this.scene.time.delayedCall(200, spawnBlood);
        this.scene.time.delayedCall(500, spawnBlood);
        this.scene.time.delayedCall(900, spawnBlood);
        this.scene.time.delayedCall(1200, spawnBlood);

        this.once("animationcomplete", () => {
          // Final large blood pool
          spawnBlood();
          // Hold on last frame, then slow fade
          this.scene.tweens.add({
            targets: this,
            alpha: 0,
            duration: 1500,
            delay: 800,
            onComplete: () => this.destroy(),
          });
        });
      } else {
        this.scene.tweens.add({
          targets: this, alpha: 0, duration: 1000,
          onComplete: () => this.destroy(),
        });
      }
      return;
    }

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
  private pickDeathAnim(source: "melee" | "ranged" | "katana"): string | null {
    const dir = this.currentDir;

    // Boss (SCARYBOI): always uses being-shot-death for final kill
    if (this.enemyType === "boss" && this.hasBeingShotDeath) {
      const key = getAnimKey(this.spriteId, "being-shot-death", dir);
      if (this.scene.anims.exists(key)) return key;
    }

    // Katana kill: chopped-in-half animation
    if (source === "katana" && this.hasChoppedInHalf) {
      const key = getAnimKey(this.spriteId, "chopped-in-half", dir);
      if (this.scene.anims.exists(key)) return key;
    }

    if (source === "melee" || source === "katana") {
      // Melee kill: falling-back-death
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

    // Boss uses punch-combo, mason uses lead-jab, others use bite/lunge-bite
    const isBossEnemy = this.enemyType === "boss" || this.enemyType === "mason";
    const useLunge = this.hasLungeBiteAnim && Math.random() < 0.5;
    const animType = this.enemyType === "boss"
      ? "punch-combo"
      : this.enemyType === "mason"
        ? "lead-jab"
        : (useLunge ? "lunge-bite" : "bite");
    const biteKey = getAnimKey(this.spriteId, animType, this.currentDir);

    if (this.scene.anims.exists(biteKey)) {
      this.off("animationcomplete", this.handleBiteComplete, this);
      this.play(biteKey);
      this.once("animationcomplete", this.handleBiteComplete, this);
    } else {
      // Fallback to regular bite/punch-combo
      const fallbackType = isBossEnemy ? "punch-combo" : "bite";
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

  /** Play howl animation (dog aggro alert). Briefly stops the dog, then resumes. */
  private playHowl() {
    this.howling = true;
    this.body.setVelocity(0, 0);
    const howlKey = getAnimKey(this.spriteId, "howl", this.currentDir);
    if (this.scene.anims.exists(howlKey)) {
      this.play(howlKey);
      this.once("animationcomplete", () => {
        this.howling = false;
        if (this.hasWalkAnim && !this.dying) {
          this.play(getAnimKey(this.spriteId, this.walkAnimType, this.currentDir), true);
        }
      });
    } else {
      this.howling = false;
    }
  }

  /** Start a leap attack toward the player. May combo into bite for extra damage. */
  private startLeap(angle: number, dist: number) {
    if (this.leaping || this.biting || this.dying) return;

    this.leaping = true;
    this.leapCooldown = 3000 + Math.random() * 2000; // 3-5s cooldown

    // Decide if this leap combos into a bite (closer = more likely)
    // Under 80px: 60% combo, 80-120px: 30% combo
    const comboChance = dist < 80 ? 0.6 : 0.3;
    const willCombo = Math.random() < comboChance;

    // Play leap animation (dogs use leap)
    const leapAnimType = "leap";
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
    if (this.bossCutscene) return; // frozen during intro cutscene

    // Use body centers for distance/angle — sprite origins are offset from collision bodies
    const bx = this.body.center.x, by = this.body.center.y;
    const px = player.body!.center.x, py = player.body!.center.y;
    const angle = Phaser.Math.Angle.Between(bx, by, px, py);
    const dist = Phaser.Math.Distance.Between(bx, by, px, py);
    const hpPct = this.health / this.maxHealth;
    const bossStats = BALANCE.enemies.boss;

    // Tick all attack cooldowns
    for (const key of Object.keys(this.bossAttackCooldowns)) {
      if (this.bossAttackCooldowns[key] > 0) {
        this.bossAttackCooldowns[key] -= delta;
      }
    }

    // Don't act while mid-animation — zero velocity every frame to prevent knockback skating
    if (this.bossBusy || this.backflipping || this.castingFireball || this.biting || this.leaping || this.beingShot) {
      if (this.bossBusy && !this.bossLunging) this.body.setVelocity(0, 0);
      return;
    }

    // Grace period — stand idle after spawn, no attacks
    if (this.bossGracePeriod > 0) {
      this.bossGracePeriod -= delta;
      this.body.setVelocity(0, 0);
      const idleKey = getAnimKey(this.spriteId, this.idleAnimType, this.currentDir);
      if (this.scene.anims.exists(idleKey) && this.anims.currentAnim?.key !== idleKey) {
        this.play(idleKey, true);
      }
      return;
    }

    // Clamp boss to map bounds so he can't run off the map
    const mapW = (this.scene as any).mapWidth ?? 1920;
    const mapH = (this.scene as any).mapHeight ?? 1920;
    const pad = 48;
    if (this.x < pad || this.x > mapW - pad || this.y < pad || this.y > mapH - pad) {
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

    // ─── Movement state transitions ───
    if (this.bossCircleTimer > 0) {
      this.bossCircleTimer -= delta;
      if (this.bossCircleTimer <= 0) {
        this.bossMovementState = dist > 200 ? "approaching" : "chasing";
      }
    }

    // Low HP: prefer retreating/circling with ranged attacks
    if (hpPct <= 0.25) {
      if (this.bossMovementState !== "circling" && this.bossMovementState !== "retreating") {
        this.bossMovementState = dist < 120 ? "retreating" : "circling";
        if (this.bossMovementState === "circling") {
          this.bossCircleDir = Math.random() < 0.5 ? 1 : -1;
          this.bossCircleTimer = 1500 + Math.random() * 1000;
        }
      }
    } else if (this.bossMovementState !== "circling") {
      // Normal HP: always sprint at player — SCARYBOI is aggressive
      this.bossMovementState = "chasing";
    }

    // ─── A* pathfinding refresh ───
    this.pathRefreshTimer -= delta;
    if (this.pathRefreshTimer <= 0) {
      this.pathRefreshTimer = 500; // refresh every 500ms
      const pathfinder = (this.scene as any).pathfinder as import("../systems/Pathfinder").Pathfinder | undefined;
      if (pathfinder) {
        // Path target depends on movement state
        let targetX = player.x;
        let targetY = player.y;

        if (this.bossMovementState === "circling") {
          // Circle around player at ~175px radius
          const circleAngle = angle + Math.PI / 2 * this.bossCircleDir;
          targetX = player.x + Math.cos(circleAngle) * 175;
          targetY = player.y + Math.sin(circleAngle) * 175;
        } else if (this.bossMovementState === "retreating") {
          // Move away from player
          const retreatAngle = angle + Math.PI;
          targetX = this.x + Math.cos(retreatAngle) * 200;
          targetY = this.y + Math.sin(retreatAngle) * 200;
          targetX = Phaser.Math.Clamp(targetX, pad, mapW - pad);
          targetY = Phaser.Math.Clamp(targetY, pad, mapH - pad);
        }

        pathfinder.findPath(this.x, this.y, targetX, targetY, (path) => {
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

    // ��── Movement execution ───
    let moveSpeed: number;
    switch (this.bossMovementState as string) {
      case "idle":
        this.body.setVelocity(0, 0);
        this.bossRunning = false;
        break;
      case "approaching":
        moveSpeed = bossStats.speed;
        this.bossRunning = false;
        this.followPathOrDirect(angle, moveSpeed);
        break;
      case "chasing":
        moveSpeed = bossStats.runSpeed;
        this.bossRunning = true;
        // Close range: skip A* and charge directly — pathfinding orbits instead of closing in
        if (dist < 150) {
          this.body.setVelocity(Math.cos(angle) * moveSpeed, Math.sin(angle) * moveSpeed);
        } else {
          this.followPathOrDirect(angle, moveSpeed);
        }
        break;
      case "circling":
        moveSpeed = bossStats.speed;
        this.bossRunning = false;
        this.followPathOrDirect(angle + Math.PI / 2 * this.bossCircleDir, moveSpeed);
        break;
      case "retreating":
        moveSpeed = bossStats.speed;
        this.bossRunning = false;
        this.followPathOrDirect(angle + Math.PI, moveSpeed);
        break;
    }

    // Play idle anim when stopped
    const vel = this.body.velocity;
    if (Math.abs(vel.x) < 5 && Math.abs(vel.y) < 5) {
      const idleKey = getAnimKey(this.spriteId, this.idleAnimType, this.currentDir);
      if (this.scene.anims.exists(idleKey) && this.anims.currentAnim?.key !== idleKey) {
        this.play(idleKey, true);
      }
    }

    // ─── Attack pattern: sprint in → punch → backflip out → fireball → repeat ───
    if (dist < bossStats.attacks.punchCombo.range && this.canBossAttack("punchCombo")) {
      // In melee range: punch (backflip auto-chains after punch completes in bossMeleeAttack)
      this.bossMeleeAttack("punchCombo", "punch-combo", bossStats.attacks.punchCombo.damage);
      return;
    }
    // Not in melee range: fireball if available, otherwise keep sprinting at player
    if (dist > bossStats.attacks.punchCombo.range && this.canBossAttack("fireball")) {
      // Indoor: rarely fireball (20%), outdoor: frequently (60%)
      const fireballChance = this.bossIsIndoor ? 0.2 : 0.6;
      // Only fireball at range — don't waste it point-blank
      if (dist > 120 && Math.random() < fireballChance) {
        this.bossFireball(angle, player);
        return;
      }
    }
  }

  /** Follow A* waypoints if available, otherwise move directly */
  private followPathOrDirect(directAngle: number, speed: number) {
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
          Math.cos(wpAngle) * speed,
          Math.sin(wpAngle) * speed
        );
      }
    } else {
      // Direct movement as fallback
      this.body.setVelocity(
        Math.cos(directAngle) * speed,
        Math.sin(directAngle) * speed
      );
    }
  }

  private canBossAttack(attackId: string): boolean {
    return (this.bossAttackCooldowns[attackId] ?? 0) <= 0;
  }

  /** Boss melee: play anim, deal damage on hit frame, set cooldown */
  private bossMeleeAttack(attackId: string, animType: string, dmg: number) {
    this.biting = true;
    this.bossBusy = true;
    const bossStats = BALANCE.enemies.boss;
    const cd = (bossStats.attacks as any)[attackId]?.cooldown ?? 2000;
    this.bossAttackCooldowns[attackId] = cd;

    // Set damage for this specific attack (GameScene reads getEffectiveDamage on contact)
    this.damage = dmg;

    // Lunge toward player during punch — closes the collision gap
    const player = (this.scene as any).player;
    if (player?.active) {
      const lungeAngle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
      this.bossLunging = true;
      this.body.setVelocity(Math.cos(lungeAngle) * 220, Math.sin(lungeAngle) * 220);
      // Stop the lunge after 200ms — aggressive close into player's space
      this.scene.time.delayedCall(200, () => {
        this.bossLunging = false;
        if (this.active && this.bossBusy) this.body.setVelocity(0, 0);
      });
    } else {
      this.body.setVelocity(0, 0);
    }
    const key = getAnimKey(this.spriteId, animType, this.currentDir);
    if (this.scene.anims.exists(key)) {
      this.play(key);
      this.once("animationcomplete", () => {
        this.biting = false;
        this.bossBusy = false;

        // After punch-combo, always backflip away — don't let him box the player in
        if (attackId === "punchCombo" && !this.dying) {
          const player = (this.scene as any).player;
          if (player?.active) {
            const a = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
            this.bossBackflip(a);
            return;
          }
        }

        // After melee, enter brief circling state for tactical spacing
        if (!this.dying) {
          this.bossMovementState = "circling";
          this.bossCircleDir = Math.random() < 0.5 ? 1 : -1;
          this.bossCircleTimer = 800 + Math.random() * 600;
        }

        if (this.hasWalkAnim && !this.dying) {
          this.play(getAnimKey(this.spriteId, this.walkAnimType, this.currentDir), true);
        }
      });
    } else {
      this.biting = false;
      this.bossBusy = false;
    }
  }

  /** Boss backflip: leap backward to disengage, chains into fireball */
  private bossBackflip(angle: number) {
    this.backflipping = true;
    const bossStats = BALANCE.enemies.boss;
    this.bossAttackCooldowns["backflip"] = bossStats.backflipCooldown;

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

      // Combo: backflip → fireball (if cooldown ready)
      if (!this.dying && this.canBossAttack("fireball")) {
        const player = (this.scene as any).player;
        if (player?.active) {
          const a = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
          this.bossFireball(a, player);
          return;
        }
      }

      if (this.hasWalkAnim && !this.dying) {
        this.play(getAnimKey(this.spriteId, this.walkAnimType, this.currentDir), true);
      }
    });
  }

  /** Pick backflip direction — now has all 8 dirs, use current facing */
  private pickBackflipDir(): Direction {
    return this.currentDir;
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
    this.bossBusy = true;
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
      this.bossBusy = false;
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
    // SCARYBOI fireball — animated crackling electricity orb, rotate to match travel angle
    const hasAnimated = scene.anims.exists("scaryboi-fireball-anim");
    const fb = scene.add.sprite(this.x, this.y, hasAnimated ? "scaryboi-fireball-0" : "fireball-sheet")
      .setDepth(10)
      .setScale(hasAnimated ? 0.5 : 2)
      .setRotation(angle);
    if (hasAnimated) {
      fb.play("scaryboi-fireball-anim");
    } else if (scene.anims.exists("boss-fireball")) {
      fb.play("boss-fireball");
    }

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

    // Define destroy first so colliders can reference it
    const destroyFireball = () => {
      scene.events.off("update", updateHandler);
      fb.destroy();
      if (zone.active) zone.destroy();
    };

    // Collide with map obstacles and player barricades
    const obstacles = (scene as any).obstacles;
    const barricades = (scene as any).barricades;
    if (obstacles) scene.physics.add.collider(zone, obstacles, destroyFireball as any);
    if (barricades) scene.physics.add.collider(zone, barricades, destroyFireball as any);

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
      if (player?.active && !player.invincible && !(scene as any).shopOpen && !(scene as any).levelUpActive) {
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

    scene.events.on("update", updateHandler);

    // Safety: destroy after 5 seconds regardless
    scene.time.delayedCall(5000, destroyFireball);
  }

  // ---- End boss AI ----

  // ---- Mason AI ----

  private canMasonAttack(attackId: string): boolean {
    return (this.masonAttackCooldowns[attackId] ?? 0) <= 0;
  }

  /** Mason 2-phase combat AI — stops when both on-screen, walks when off-screen */
  private updateMason(delta: number, player: any) {
    if (this.masonBusy || this.biting || this.dying || this.fleeing) {
      // Lock position during attacks — prevents knockback skating
      if (this.masonBusy) this.body.setVelocity(0, 0);
      return;
    }

    const angle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
    const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
    const masonStats = (BALANCE.enemies as any).mason;
    const hpPct = this.health / this.maxHealth;
    const phase2 = hpPct <= 0.5;

    // Tick all attack cooldowns
    for (const key of Object.keys(this.masonAttackCooldowns)) {
      if (this.masonAttackCooldowns[key] > 0) {
        this.masonAttackCooldowns[key] -= delta;
      }
    }

    // Movement: only walk if player is off-screen
    const cam = this.scene.cameras.main;
    const halfW = (cam.width / cam.zoom) / 2;
    const halfH = (cam.height / cam.zoom) / 2;
    const camCX = cam.midPoint.x;
    const camCY = cam.midPoint.y;
    const margin = 40;
    const playerOnScreen =
      player.x > camCX - halfW + margin && player.x < camCX + halfW - margin &&
      player.y > camCY - halfH + margin && player.y < camCY + halfH - margin;
    const masonOnScreen =
      this.x > camCX - halfW + margin && this.x < camCX + halfW - margin &&
      this.y > camCY - halfH + margin && this.y < camCY + halfH - margin;
    const bothOnScreen = playerOnScreen && masonOnScreen;

    // Intro angry: plays once when the player first discovers Mason
    if (bothOnScreen && !this.masonIntroPlayed) {
      this.masonIntroPlayed = true;
      this.masonBusy = true;
      this.body.setVelocity(0, 0);
      this.currentDir = angleToDirection(angle) as Direction;
      const angryKey = getAnimKey(this.spriteId, "angry", this.currentDir);
      if (this.scene.anims.exists(angryKey)) {
        this.play(angryKey);
        this.once("animationcomplete", () => {
          this.masonBusy = false;
          const idleKey = getAnimKey(this.spriteId, this.idleAnimType, this.currentDir);
          if (this.scene.anims.exists(idleKey) && !this.dying) this.play(idleKey, true);
        });
      } else {
        this.masonBusy = false;
      }
      return;
    }

    // Phase 2 angry: plays once when Mason drops below 50% HP
    if (phase2 && !this.masonPhase2Triggered) {
      this.masonPhase2Triggered = true;
      this.masonBusy = true;
      this.body.setVelocity(0, 0);
      this.currentDir = angleToDirection(angle) as Direction;
      const angryKey = getAnimKey(this.spriteId, "angry", this.currentDir);
      if (this.scene.anims.exists(angryKey)) {
        this.play(angryKey);
        this.once("animationcomplete", () => {
          this.masonBusy = false;
          const idleKey = getAnimKey(this.spriteId, this.idleAnimType, this.currentDir);
          if (this.scene.anims.exists(idleKey) && !this.dying) this.play(idleKey, true);
        });
      } else {
        this.masonBusy = false;
      }
      return;
    }

    // Refresh A* path toward player
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

    // Movement: always advance toward player. Slower when close, full speed when far.
    const closeRange = 120;
    const moveSpeed = dist < closeRange ? masonStats.speed * 0.6 : masonStats.speed;

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
      // Direct walk if no path available
      this.body.setVelocity(
        Math.cos(angle) * moveSpeed,
        Math.sin(angle) * moveSpeed
      );
    }

    // Play walk or idle animation based on actual movement
    const vel = this.body.velocity;
    const isMoving = Math.abs(vel.x) > 5 || Math.abs(vel.y) > 5;
    const targetAnim = isMoving ? this.walkAnimType : this.idleAnimType;
    const animKey = getAnimKey(this.spriteId, targetAnim, this.currentDir);
    if (this.anims.currentAnim?.key !== animKey) {
      if (this.scene.anims.exists(animKey)) this.play(animKey, true);
    }

    // --- Attacks — priority order, phase-gated ---

    // Phase 1+: Boom box soundwave (medium range pressure)
    if (dist < masonStats.attacks.boomBox.range && dist > 80 && this.canMasonAttack("boomBox")) {
      this.masonBoomBox(masonStats.attacks.boomBox);
      return;
    }

    // Phase 1+: Jump & stun (gap closer)
    if (dist < masonStats.attacks.jumpAndLand.range && dist > 100 && this.canMasonAttack("jumpAndLand")) {
      this.masonJumpAndLand(player, masonStats.attacks.jumpAndLand);
      return;
    }

    // Phase 2: Fire breath (escalation when hurt)
    if (phase2 && dist < masonStats.attacks.fireBreath.range && this.canMasonAttack("fireBreath")) {
      this.masonFireBreath(angle, player, masonStats.attacks.fireBreath);
      return;
    }

    // Both phases: Lead jab (melee)
    if (dist < masonStats.attacks.leadJab.range && this.canMasonAttack("leadJab")) {
      this.masonMeleeAttack("leadJab", "lead-jab", masonStats.attacks.leadJab.damage);
      return;
    }

  }

  /** Mason melee: play anim, set damage, resume on complete */
  private masonMeleeAttack(attackId: string, animType: string, dmg: number) {
    this.biting = true;
    const masonStats = (BALANCE.enemies as any).mason;
    const cd = masonStats.attacks[attackId]?.cooldown ?? 2000;
    this.masonAttackCooldowns[attackId] = cd;
    this.damage = dmg;

    this.body.setVelocity(0, 0);
    const key = getAnimKey(this.spriteId, animType, this.currentDir);
    if (this.scene.anims.exists(key)) {
      this.play(key);
      this.once("animationcomplete", () => {
        this.biting = false;
        // Play idle briefly — updateMason will swap to walk on next frame if moving
        const idleKey = getAnimKey(this.spriteId, this.idleAnimType, this.currentDir);
        if (this.scene.anims.exists(idleKey) && !this.dying) {
          this.play(idleKey, true);
        }
      });
    } else {
      this.biting = false;
    }
  }

  /** Check line-of-sight: returns true if no wall tiles block the line from (ax,ay) to (bx,by) */
  private hasLineOfSight(ax: number, ay: number, bx: number, by: number): boolean {
    const scene = this.scene as any;
    const wallsBase = scene.wallsBaseLayer as Phaser.Tilemaps.TilemapLayer | undefined;
    const wallsTop = scene.wallsTopLayer as Phaser.Tilemaps.TilemapLayer | undefined;
    if (!wallsBase && !wallsTop) return true;

    // Step along the line in 16px increments checking for wall tiles
    const dist = Phaser.Math.Distance.Between(ax, ay, bx, by);
    const steps = Math.ceil(dist / 16);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const px = ax + (bx - ax) * t;
      const py = ay + (by - ay) * t;
      const tx = Math.floor(px / 32);
      const ty = Math.floor(py / 32);
      if (wallsBase?.getTileAt(tx, ty)) return false;
      if (wallsTop?.getTileAt(tx, ty)) return false;
    }

    // Also check closed doors
    const doors = scene.doors as { zone: Phaser.GameObjects.Zone; opened: boolean }[] | undefined;
    if (doors) {
      for (const door of doors) {
        if (door.opened) continue;
        const dz = door.zone;
        const body = dz.body as Phaser.Physics.Arcade.StaticBody;
        if (!body || !body.enable) continue;
        // Check if line segment intersects door body rect
        const rect = new Phaser.Geom.Rectangle(body.x, body.y, body.width, body.height);
        const line = new Phaser.Geom.Line(ax, ay, bx, by);
        if (Phaser.Geom.Intersects.LineToRectangle(line, rect)) return false;
      }
    }

    return true;
  }

  /** Mason fire-breath: wind-up anim (frames 0-2), freeze, sprite cone for 2s, cool-down (frames 6-8) */
  private masonFireBreath(
    angle: number,
    player: any,
    stats: { damage: number; range: number; cooldown: number; coneAngle: number }
  ) {
    this.masonBusy = true;
    this.masonAttackCooldowns["fireBreath"] = stats.cooldown;
    this.body.setVelocity(0, 0);
    this.body.setImmovable(true); // Lock position during fire breath

    const breathDuration = 2000; // 2 seconds of fire
    const facingAngle = angle; // lock direction at start
    const halfCone = Phaser.Math.DegToRad(stats.coneAngle / 2);
    const dir = this.currentDir;

    // --- Wind-up animation: play frames 0, 1, 2 then freeze on frame 2 ---
    const windUpFrames = [0, 1, 2];
    const windUpDelay = 120; // ms per frame
    const windUpTotal = windUpFrames.length * windUpDelay; // 360ms wind-up

    // Start wind-up: manually step through frames 0-2
    let windUpIdx = 0;
    const frameKey0 = getFrameKey(this.spriteId, "fire-breath", dir, windUpFrames[0]);
    if (this.scene.textures.exists(frameKey0)) {
      this.stop();
      this.setTexture(frameKey0);
    }
    const windUpTimer = this.scene.time.addEvent({
      delay: windUpDelay,
      repeat: windUpFrames.length - 1,
      callback: () => {
        windUpIdx++;
        if (windUpIdx < windUpFrames.length) {
          const fk = getFrameKey(this.spriteId, "fire-breath", dir, windUpFrames[windUpIdx]);
          if (this.scene.textures.exists(fk)) this.setTexture(fk);
        }
      },
    });

    // --- After wind-up, start the fire cone sprite ---
    this.scene.time.delayedCall(windUpTotal, () => {
      if (!this.active || this.dying) {
        this.masonBusy = false;
        this.body?.setImmovable(false);
        return;
      }

      // Freeze Mason on frame 2 (mouth open, no baked fire)
      const freezeKey = getFrameKey(this.spriteId, "fire-breath", dir, 2);
      if (this.scene.textures.exists(freezeKey)) {
        this.stop();
        this.setTexture(freezeKey);
      }

      // Tracking state — fire sweeps to follow the player
      let currentAngle = facingAngle;
      let currentDir = dir;
      const turnSpeed = 2.5; // radians per second — smooth sweep, not instant snap

      // Offset fire sprite to Mason's mouth position
      const mouthForward = 18;
      const mouthUp = -14;
      let mouthOffX = Math.cos(currentAngle) * mouthForward;
      let mouthOffY = Math.sin(currentAngle) * mouthForward + mouthUp;

      // Determine if facing left-ish (cone needs to flip)
      let facingLeft = Math.abs(currentAngle) > Math.PI / 2;

      const hasFireSprites = this.scene.textures.exists("fx-fire-breath-1");
      const fireSprite = hasFireSprites
        ? this.scene.add.sprite(this.x + mouthOffX, this.y + mouthOffY, "fx-fire-breath-1")
        : null;

      // Fallback particle emitter if sprites aren't loaded
      let emitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
      if (!hasFireSprites) {
        const fireTexKey = "mason-fire-particle";
        if (!this.scene.textures.exists(fireTexKey)) {
          const gfx = this.scene.make.graphics({ x: 0, y: 0 } as any);
          gfx.fillStyle(0xffffff, 1);
          gfx.fillCircle(8, 8, 8);
          gfx.generateTexture(fireTexKey, 16, 16);
          gfx.destroy();
        }
        const facingDeg = Phaser.Math.RadToDeg(facingAngle);
        emitter = this.scene.add.particles(this.x + mouthOffX, this.y + mouthOffY, fireTexKey, {
          speed: { min: 100, max: 220 },
          angle: { min: facingDeg - stats.coneAngle / 2, max: facingDeg + stats.coneAngle / 2 },
          scale: { start: 0.5, end: 0.1 },
          alpha: { start: 0.75, end: 0 },
          lifespan: { min: 300, max: 500 },
          tint: [0xff4400, 0xff8800, 0xffcc00, 0xff2200, 0xff6600],
          frequency: 18,
          quantity: 2,
          blendMode: Phaser.BlendModes.ADD,
        });
        emitter.setDepth(this.depth + 1);
      }

      if (fireSprite) {
        fireSprite.setDepth(this.depth + 1);
        if (facingLeft) {
          // Facing left: anchor at right edge, flip horizontally, adjust rotation
          fireSprite.setOrigin(1, 0.5);
          fireSprite.setFlipX(true);
          fireSprite.setRotation(facingAngle + Math.PI);
        } else {
          // Facing right: anchor at left edge (mouth), extends outward
          fireSprite.setOrigin(0, 0.5);
          fireSprite.setRotation(facingAngle);
        }
        fireSprite.setScale(0.6);
        fireSprite.setAlpha(0.9);
        fireSprite.setBlendMode(Phaser.BlendModes.ADD);
      }

      // Tick damage every 300ms during the breath
      const tickInterval = 300;
      const dmgPerTick = Math.round(stats.damage / (breathDuration / tickInterval));
      let elapsed = 0;
      let tickAccum = 0;
      let fireFrame = 0;

      const updateEvent = this.scene.time.addEvent({
        delay: 16,
        loop: true,
        callback: () => {
          if (!this.active || this.dying) {
            updateEvent.remove();
            if (fireSprite?.active) {
              this.scene.tweens.add({ targets: fireSprite, alpha: 0, duration: 200, onComplete: () => fireSprite.destroy() });
            }
            if (emitter) { emitter.stop(); this.scene.time.delayedCall(700, () => emitter!.destroy()); }
            return;
          }

          elapsed += 16;
          tickAccum += 16;

          // --- Track player: sweep fire toward their position ---
          const targetAngle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
          let angleDelta = Phaser.Math.Angle.Wrap(targetAngle - currentAngle);
          const maxStep = turnSpeed * 0.016; // per-frame turn limit
          if (Math.abs(angleDelta) > maxStep) {
            angleDelta = Math.sign(angleDelta) * maxStep;
          }
          currentAngle = Phaser.Math.Angle.Wrap(currentAngle + angleDelta);

          // Update direction + Mason texture if direction changed
          const newDir = angleToDirection(currentAngle) as Direction;
          if (newDir !== currentDir) {
            currentDir = newDir;
            this.currentDir = newDir;
            const newFrameKey = getFrameKey(this.spriteId, "fire-breath", newDir, 2);
            if (this.scene.textures.exists(newFrameKey)) {
              this.setTexture(newFrameKey);
            }
          }

          // Recalculate mouth offset + facing for fire sprite
          mouthOffX = Math.cos(currentAngle) * mouthForward;
          mouthOffY = Math.sin(currentAngle) * mouthForward + mouthUp;
          facingLeft = Math.abs(currentAngle) > Math.PI / 2;

          // Animate fire sprite: flicker + reposition + re-aim
          if (fireSprite?.active) {
            if (elapsed % 80 < 16) {
              fireSprite.setAlpha(0.75 + Math.random() * 0.15);
              fireSprite.setScale(0.58 + Math.random() * 0.06);
            }
            fireSprite.setPosition(this.x + mouthOffX, this.y + mouthOffY);
            if (facingLeft) {
              fireSprite.setOrigin(1, 0.5);
              fireSprite.setFlipX(true);
              fireSprite.setRotation(currentAngle + Math.PI);
            } else {
              fireSprite.setOrigin(0, 0.5);
              fireSprite.setFlipX(false);
              fireSprite.setRotation(currentAngle);
            }
          }

          if (emitter) {
            emitter.setPosition(this.x + mouthOffX, this.y + mouthOffY);
            const facingDeg = Phaser.Math.RadToDeg(currentAngle);
            (emitter as any).particleAngle = { min: facingDeg - stats.coneAngle / 2, max: facingDeg + stats.coneAngle / 2 };
          }

          // Damage tick
          if (tickAccum >= tickInterval) {
            tickAccum -= tickInterval;
            if ((this.scene as any).gameOver) return;

            const pDist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
            if (pDist <= stats.range && !player.invincible && !(this.scene as any).shopOpen && !(this.scene as any).levelUpActive) {
              const toPlayer = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
              let angleDiff = Math.abs(Phaser.Math.Angle.Wrap(toPlayer - currentAngle));
              if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;

              if (angleDiff <= halfCone) {
                if (this.hasLineOfSight(this.x, this.y, player.x, player.y)) {
                  player.stats.health -= dmgPerTick;
                  this.scene.cameras.main.flash(80, 255, 120, 0, false);
                  (this.scene as any).playPlayerHurt?.();
                  if (player.stats.health <= 0) {
                    player.stats.health = 0;
                    (this.scene as any).gameOver = true;
                    player.body.setVelocity(0, 0);
                    player.playDeath?.(() => (this.scene as any).triggerGameOver?.());
                  }
                }
              }
            }
          }

          // End breath after duration — play cool-down frames 6, 7, 8
          if (elapsed >= breathDuration) {
            updateEvent.remove();
            if (fireSprite?.active) {
              this.scene.tweens.add({ targets: fireSprite, alpha: 0, duration: 300, onComplete: () => fireSprite.destroy() });
            }
            if (emitter) { emitter.stop(); this.scene.time.delayedCall(700, () => emitter!.destroy()); }

            // Cool-down animation: frames 6, 7, 8 (smoke dissipation)
            const coolDownFrames = [6, 7, 8];
            let cdIdx = 0;
            const cdTimer = this.scene.time.addEvent({
              delay: 150,
              repeat: coolDownFrames.length - 1,
              callback: () => {
                const cfk = getFrameKey(this.spriteId, "fire-breath", currentDir, coolDownFrames[cdIdx]);
                if (this.scene.textures.exists(cfk) && this.active) this.setTexture(cfk);
                cdIdx++;
              },
            });
            this.scene.time.delayedCall(coolDownFrames.length * 150, () => {
              cdTimer.destroy();
              this.masonBusy = false;
              this.body?.setImmovable(false);
              this.stop();
              const idleKey = getAnimKey(this.spriteId, this.idleAnimType, this.currentDir);
              if (this.scene.anims.exists(idleKey) && !this.dying) {
                this.play(idleKey, true);
              }
            });
          }
        },
      });
    });
  }

  /** Mason jump-and-land: gap closer that stuns the player on landing */
  private masonJumpAndLand(
    player: any,
    stats: { range: number; landRadius: number; cooldown: number; stunDuration: number }
  ) {
    this.masonBusy = true;
    this.masonAttackCooldowns["jumpAndLand"] = stats.cooldown;
    this.body.setVelocity(0, 0);

    // Snapshot target near player's current position
    const targetX = player.x + (Math.random() - 0.5) * 40;
    const targetY = player.y + (Math.random() - 0.5) * 40;

    // Phase 1: Jump animation (crouch → launch → off-screen)
    const jumpKey = getAnimKey(this.spriteId, "jump", this.currentDir);
    if (this.scene.anims.exists(jumpKey)) {
      this.play(jumpKey);
    }

    // Fade out as he launches (4 frames at 10fps = 400ms)
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      duration: 350,
      ease: "Quad.easeIn",
    });

    // Shadow indicator at landing zone — light dynamic shadow
    const shadow = this.scene.add.graphics();
    shadow.setDepth(1);
    shadow.fillStyle(0x000000, 0.12);
    shadow.fillEllipse(targetX, targetY, 28, 14);
    shadow.setAlpha(0);

    // Fade shadow in gently over the airborne period
    this.scene.tweens.add({
      targets: shadow,
      alpha: 1,
      duration: 800,
      ease: "Sine.easeIn",
    });

    // Phase 2: Airborne pause — invisible, then teleport + land
    const airborneDelay = 1100; // 400ms jump anim + 700ms hang time
    this.scene.time.delayedCall(airborneDelay, () => {
      if (!this.active || this.dying) {
        shadow.destroy();
        return;
      }
      if ((this.scene as any).gameOver) {
        shadow.destroy();
        return;
      }

      // Remove shadow
      shadow.destroy();

      // Teleport to target position
      this.setPosition(targetX, targetY);
      this.setAlpha(1);

      // Face toward the player on landing
      const angle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
      this.currentDir = angleToDirection(angle) as Direction;

      // Phase 3: Landing animation (slam down from above)
      const landKey = getAnimKey(this.spriteId, "landing", this.currentDir);
      if (this.scene.anims.exists(landKey)) {
        this.play(landKey);
      }

      // Camera shake on impact
      this.scene.cameras.main.shake(80, 0.004);

      // AoE stun check (no damage — sets up follow-up jab)
      const pDist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
      if (pDist <= stats.landRadius && !player.invincible) {
        const prevSpeed = player.stats.speed;
        player.stats.speed = 0;
        player.body.setVelocity(0, 0);
        (player as any).stunned = true;
        player.setTint(0xffff88);

        this.scene.time.delayedCall(stats.stunDuration, () => {
          player.stats.speed = prevSpeed;
          (player as any).stunned = false;
          player.clearTint();
        });
      }

      // Return to idle after landing anim completes (4 frames at 10fps = 400ms)
      this.scene.time.delayedCall(400, () => {
        this.masonBusy = false;
        if (!this.active || this.dying) return;
        const idleKey = getAnimKey(this.spriteId, this.idleAnimType, this.currentDir);
        if (this.scene.anims.exists(idleKey)) {
          this.play(idleKey, true);
        }
      });
    });
  }

  /** Mason boom-box: directional beat pulses */
  private masonBoomBox(stats: { damage: number; range: number; cooldown: number }) {
    this.masonBusy = true;
    this.masonAttackCooldowns["boomBox"] = stats.cooldown;
    this.body.setVelocity(0, 0);

    const key = getAnimKey(this.spriteId, "boom-box", this.currentDir);
    if (this.scene.anims.exists(key)) {
      this.play(key);
    }

    // Fire 3 directional beat pulses at BPM intervals
    // Each pulse aims at the player's position at fire time (leads the target slightly)
    const pulseCount = 3;
    const pulseInterval = 400; // ms between pulses

    for (let i = 0; i < pulseCount; i++) {
      this.scene.time.delayedCall(600 + i * pulseInterval, () => {
        if (!this.active || this.dying) return;
        const player = (this.scene as any).player;
        if (!player) return;
        // Aim directly at the player's current position each pulse
        const aimAngle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
        this.spawnBeatPulse(aimAngle, stats.damage, stats.range);
      });
    }

    // Resume after animation completes
    this.once("animationcomplete", () => {
      this.masonBusy = false;
      const idleKey = getAnimKey(this.spriteId, this.idleAnimType, this.currentDir);
      if (this.scene.anims.exists(idleKey) && !this.dying) {
        this.play(idleKey, true);
      }
    });

    // Safety timeout
    this.scene.time.delayedCall(3000, () => {
      this.masonBusy = false;
    });
  }

  /** Spawn a bass shockwave that expands outward in a cone — visible sound pressure */
  private spawnBeatPulse(facingAngle: number, damage: number, maxRange: number) {
    const scene = this.scene;
    const startX = this.x;
    const startY = this.y;
    const speed = 200; // px/s expansion speed
    let elapsed = 0;
    let hasDamaged = false;

    const hasSoundwaveSprites = scene.textures.exists("fx-soundwave-1");
    const totalFrames = 4;

    // Sprite-based: soundwave arc expanding outward
    const pulse = hasSoundwaveSprites
      ? scene.add.sprite(startX, startY, "fx-soundwave-1")
      : null;
    const gfx = !hasSoundwaveSprites ? scene.add.graphics() : null;

    if (pulse) {
      pulse.setDepth(5);
      pulse.setScale(0.5);
      pulse.setAlpha(0.8);
      pulse.setRotation(facingAngle);
      pulse.setBlendMode(Phaser.BlendModes.ADD);
    }
    if (gfx) gfx.setDepth(5);

    const arcWidth = Phaser.Math.DegToRad(60);
    const halfArc = arcWidth / 2;

    // Spawn dust particles along the wave's path
    const spawnDust = (dx: number, dy: number) => {
      const hasDustSprites = scene.textures.exists("fx-dust-burst-1");
      if (!hasDustSprites) return;
      const dust = scene.add.sprite(dx + (Math.random() - 0.5) * 16, dy + (Math.random() - 0.5) * 16, "fx-dust-burst-1");
      dust.setDepth(1);
      dust.setScale(0.15 + Math.random() * 0.1);
      dust.setAlpha(0.4);
      let df = 0;
      const dt = scene.time.addEvent({
        delay: 100, repeat: 3,
        callback: () => {
          df++;
          if (!dust.active) return;
          dust.setTexture(`fx-dust-burst-${Math.min(df + 1, 4)}`);
          dust.setAlpha(0.4 - df * 0.1);
        },
      });
      scene.time.delayedCall(450, () => { dt.destroy(); if (dust.active) dust.destroy(); });
    };

    let lastDustDist = 0;

    const updateEvent = scene.time.addEvent({
      delay: 16,
      loop: true,
      callback: () => {
        if (!this.active) {
          pulse?.destroy();
          gfx?.destroy();
          updateEvent.destroy();
          return;
        }

        elapsed += 16;
        const travelDist = speed * elapsed / 1000;

        if (travelDist > maxRange) {
          pulse?.destroy();
          gfx?.destroy();
          updateEvent.destroy();
          return;
        }

        const px = startX + Math.cos(facingAngle) * travelDist;
        const py = startY + Math.sin(facingAngle) * travelDist;
        const progress = travelDist / maxRange;
        const alpha = 0.8 - progress * 0.45;

        // Pick frame based on travel progress (1→2→3→4 as it expands)
        const frameIdx = Math.min(Math.floor(progress * totalFrames) + 1, totalFrames);

        if (pulse) {
          pulse.setPosition(px, py);
          pulse.setAlpha(alpha);
          pulse.setScale(0.5 + progress * 0.8); // grows wider as it expands
          pulse.setTexture(`fx-soundwave-${frameIdx}`);
        }

        if (gfx) {
          const currentRadius = 30 + travelDist;
          gfx.clear();
          gfx.lineStyle(4, 0xcc44ff, alpha);
          gfx.beginPath();
          const segments = 12;
          for (let i = 0; i <= segments; i++) {
            const a = facingAngle - halfArc + (arcWidth * i / segments);
            const lx = startX + Math.cos(a) * currentRadius;
            const ly = startY + Math.sin(a) * currentRadius;
            if (i === 0) gfx.moveTo(lx, ly);
            else gfx.lineTo(lx, ly);
          }
          gfx.strokePath();
        }

        // Ground dust every ~40px of travel
        if (travelDist - lastDustDist > 40) {
          lastDustDist = travelDist;
          spawnDust(px, py);
          // Spawn offset dust for width
          const perpAngle = facingAngle + Math.PI / 2;
          const spread = 10 + progress * 20;
          spawnDust(px + Math.cos(perpAngle) * spread, py + Math.sin(perpAngle) * spread);
          spawnDust(px - Math.cos(perpAngle) * spread, py - Math.sin(perpAngle) * spread);
        }

        // Damage check: hit if player is near the wave front
        if (!hasDamaged) {
          const player = (scene as any).player;
          if (player) {
            const playerDist = Phaser.Math.Distance.Between(px, py, player.x, player.y);
            if (playerDist < 35 && !player.invincible && !(scene as any).gameOver && !(scene as any).shopOpen && !(scene as any).levelUpActive && this.hasLineOfSight(startX, startY, player.x, player.y)) {
              player.stats.health -= damage;
              // Brief purple flash — subtle, not seizure-inducing
              scene.cameras.main.flash(80, 120, 0, 200, false);
              scene.cameras.main.shake(100, 0.004);
              (scene as any).playPlayerHurt?.();
              hasDamaged = true;

              // Knockback away from Mason
              const kb = 80;
              const kbAngle = Phaser.Math.Angle.Between(startX, startY, player.x, player.y);
              player.body?.setVelocity(
                Math.cos(kbAngle) * kb,
                Math.sin(kbAngle) * kb
              );

              if (player.stats.health <= 0) {
                player.stats.health = 0;
                (scene as any).gameOver = true;
                player.body.setVelocity(0, 0);
                player.playDeath?.(() => (scene as any).triggerGameOver?.());
              }
            }
          }
        }
      },
    });
  }

  /** Convert Direction string to angle in radians */
  private directionToAngle(dir: Direction): number {
    switch (dir) {
      case "south": return Math.PI / 2;
      case "north": return -Math.PI / 2;
      case "east": return 0;
      case "west": return Math.PI;
      case "south-east": return Math.PI / 4;
      case "south-west": return Math.PI * 3 / 4;
      case "north-east": return -Math.PI / 4;
      case "north-west": return -Math.PI * 3 / 4;
      default: return Math.PI / 2;
    }
  }

  // ---- End mason AI ----

  // ---- Dog pack AI ----

  /** Dog AI: roam freely, aggro when player is spotted, pack with nearby dogs */
  private updateDog(delta: number, player: Phaser.Physics.Arcade.Sprite) {
    if (this.stunTimer > 0 || this.leaping || this.biting || this.howling || this.beingShot) {
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
    const aggroRange = dogStats.aggroRange ?? 130;
    const deaggroRange = dogStats.deaggroRange ?? 350;
    const packRange = dogStats.packRange ?? 150;
    const roamSpeed = dogStats.roamSpeed ?? 30;
    const distToPlayer = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);

    // Dogs go passive during intermission — force roaming, no aggro
    const waveState = (this.scene as any).waveManager?.state;
    if (waveState === "intermission" || waveState === "pre_game") {
      if (this.dogState === "aggro") {
        this.dogState = "roaming";
        this.roamTarget = null;
        this.pathWaypoints = [];
        this.walkAnimType = "walk";
      }
      // Just roam, skip aggro checks below
    } else {
      // Check if player is in detection range (only during active waves)
      if (distToPlayer < aggroRange && this.dogState !== "aggro") {
        this.dogState = "aggro";
        // Howl on first aggro
        if (this.hasHowlAnim && !this.howling) {
          this.playHowl();
        }
      }
    }

    // Pack behavior: if a nearby dog is aggro, this dog aggros too (max 3 aggro dogs)
    if (this.dogState === "roaming") {
      const enemies = (this.scene as any).enemies as Phaser.Physics.Arcade.Group | undefined;
      if (enemies) {
        let aggroCount = 0;
        for (const child of enemies.getChildren()) {
          const other = child as Enemy;
          if (!other.active || other.dying || other === this || other.enemyType !== "fast") continue;
          if (other.dogState === "aggro") aggroCount++;
        }
        // Only join pack aggro if fewer than 3 dogs are already aggressive
        if (aggroCount < 3) {
          for (const child of enemies.getChildren()) {
            const other = child as Enemy;
            if (!other.active || other.dying || other === this || other.enemyType !== "fast") continue;
            const d = Phaser.Math.Distance.Between(this.x, this.y, other.x, other.y);
            if (d < packRange && other.dogState === "aggro") {
              this.dogState = "aggro";
              if (this.hasHowlAnim && !this.howling) {
                this.playHowl();
              }
              break;
            }
          }
        }
      }
    }

    if (this.dogState === "aggro") {
      // Use running animation when aggro (faster, more aggressive look)
      if (this.hasRunningAnim && this.walkAnimType !== "running") {
        this.walkAnimType = "running";
      }

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

      // De-aggro if player gets far enough away
      if (distToPlayer > deaggroRange) {
        this.dogState = "roaming";
        this.roamTarget = null;
        this.pathWaypoints = [];
        // Switch back to walk animation
        this.walkAnimType = "walk";
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

        // Use isFieldTile from scene to ensure dogs roam only on grass
        const fieldCheck = (this.scene as any).isFieldTile as ((tx: number, ty: number) => boolean) | undefined;

        const wmGate = (this.scene as any).waveManager;
        if (packTarget && !isExcludedZone(packTarget.x, packTarget.y) && !(wmGate?.isGated?.(packTarget.x, packTarget.y))) {
          // Drift toward nearby dog with some randomness
          const cx = packTarget.x + (Math.random() - 0.5) * 80;
          const cy = packTarget.y + (Math.random() - 0.5) * 80;
          const tx = Math.floor(cx / 32);
          const ty = Math.floor(cy / 32);
          if (!fieldCheck || fieldCheck(tx, ty)) {
            this.roamTarget = { x: cx, y: cy };
          }
        } else {
          // Random wander point — only on grass tiles, not in buildings or locked areas
          let rx: number, ry: number;
          let found = false;
          const wmRef = (this.scene as any).waveManager;
          for (let attempts = 0; attempts < 20; attempts++) {
            const tx = 5 + Math.floor(Math.random() * 50); // tiles 5-54 (surface area with margin)
            const ty = 5 + Math.floor(Math.random() * 50);
            if (fieldCheck && !fieldCheck(tx, ty)) continue;
            rx = tx * 32 + 16;
            ry = ty * 32 + 16;
            if (isExcludedZone(rx!, ry!)) continue;
            if (wmRef?.isGated?.(rx!, ry!)) continue;
            this.roamTarget = { x: rx, y: ry };
            found = true;
            break;
          }
          if (!found) {
            // Fallback: stay near current position
            this.roamTarget = { x: this.x + (Math.random() - 0.5) * 100, y: this.y + (Math.random() - 0.5) * 100 };
          }
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
    // Separation force — push dogs apart so they don't stack on the same tile
    const sepDist = 28; // min pixels apart
    const sepForce = 60;
    const allEnemies = (this.scene as any).enemies as Phaser.Physics.Arcade.Group | undefined;
    if (allEnemies) {
      let pushX = 0;
      let pushY = 0;
      for (const child of allEnemies.getChildren()) {
        const other = child as Enemy;
        if (!other.active || other.dying || other === this || other.enemyType !== "fast") continue;
        const dx = this.x - other.x;
        const dy = this.y - other.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < sepDist && d > 0) {
          pushX += (dx / d) * sepForce;
          pushY += (dy / d) * sepForce;
        }
      }
      if (pushX !== 0 || pushY !== 0) {
        this.body.setVelocity(
          this.body.velocity.x + pushX,
          this.body.velocity.y + pushY
        );
      }
    }
  }

  // ---- End dog AI ----

  update(_time: number, delta: number) {
    if (!this.active || !this.body || this.dying) return;
    if (this.spawning) return; // climbing out of ground — no movement/AI
    if (this.fleeing) {
      // Zero velocity every frame to prevent drift from player collisions
      this.body.setVelocity(0, 0);
      return;
    }

    // Dancing — alternate between dancing in place and short wanders
    if (this.dancing) {
      this.danceTimer -= delta;
      if (this.danceTimer <= 0) {
        if (this.danceWalking) {
          // Done walking — stop and dance again
          this.danceWalking = false;
          this.body.setVelocity(0, 0);
          this.playDanceAnim(this.currentDir);
          this.danceTimer = 2000 + Math.random() * 3000; // dance 2-5s
        } else {
          // Done dancing — pick a random direction and walk briefly
          const dirs: Direction[] = ["north", "south", "east", "west", "north-east", "north-west", "south-east", "south-west"];
          this.danceWalkDir = dirs[Math.floor(Math.random() * dirs.length)];
          this.currentDir = this.danceWalkDir;
          this.danceWalking = true;
          this.danceTimer = 400 + Math.random() * 600; // walk 0.4-1s (~1-2 steps)
          const walkKey = getAnimKey(this.spriteId, this.walkAnimType, this.danceWalkDir);
          if (this.scene.anims.exists(walkKey)) this.play(walkKey, true);
        }
      }
      if (this.danceWalking) {
        // Move slowly in the walk direction
        const walkSpeed = 25;
        const rad = Phaser.Math.Angle.Between(0, 0,
          this.danceWalkDir.includes("east") ? 1 : this.danceWalkDir.includes("west") ? -1 : 0,
          this.danceWalkDir.includes("south") ? 1 : this.danceWalkDir.includes("north") ? -1 : 0,
        );
        this.body.setVelocity(Math.cos(rad) * walkSpeed, Math.sin(rad) * walkSpeed);
        // Leash — if too far from spawn, snap back to dancing
        const dist = Phaser.Math.Distance.Between(this.x, this.y, this.danceSpawnX, this.danceSpawnY);
        if (dist > 48) { // ~1.5 tiles max
          this.danceWalking = false;
          this.body.setVelocity(0, 0);
          this.playDanceAnim(this.currentDir);
          this.danceTimer = 2000 + Math.random() * 3000;
        }
      } else {
        this.body.setVelocity(0, 0);
      }
      this.updateVisuals(delta);
      return;
    }

    // Electrocuting — frozen in place, no AI, just visuals
    if (this.electrocuting) {
      this.body.setVelocity(0, 0);
      this.updateVisuals(delta);
      return;
    }

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
      if (!this.bossCutscene) {
        this.updateDirection(player);
        this.updateVisuals(delta);
      }
      return;
    }

    // Mason uses its own AI system
    if (this.enemyType === "mason" && this.stunTimer <= 0) {
      this.updateMason(delta, player);
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
    // Room pressure: zombies move 40% faster when player is camping in a room
    const roomBoost = wm?.playerInRoom ? 1.2 : 1.0;
    const moveSpeed = (isLastStand ? this.speed * 1.15 : this.speed) * roomBoost;
    const refreshRate = isLastStand || wm?.playerInRoom ? 250 : this.pathRefreshInterval;

    // Last-stand zombies switch to running animation (more aggressive)
    const hasRunning8 = hasAnimation(this.spriteId, "running-8-frames");
    if (isLastStand && hasRunning8 && this.walkAnimType !== "running-8-frames") {
      this.walkAnimType = "running-8-frames";
      if (!this.biting && !this.leaping && !this.takingPunch) {
        this.play(getAnimKey(this.spriteId, "running-8-frames", this.currentDir), true);
      }
    } else if (!isLastStand && this.walkAnimType === "running-8-frames" && this.enemyType === "basic") {
      this.walkAnimType = "walk";
    }

    // Stuck detection — progressive: 1s repath, 5s teleport, 8s auto-kill
    // Skip when stunned, leaping, biting, or near the player (attacking is not stuck)
    const nearPlayer = dist < 60;
    if (this.stunTimer > 0 || this.leaping || this.biting || nearPlayer) {
      // Reset stuck tracking when zombie is legitimately not moving (attacking, stunned, etc.)
      this.stuckTimer = 0;
      this.stuckCheckX = this.x;
      this.stuckCheckY = this.y;
    } else {
      // Sample position every 500ms for faster stuck detection
      this.stuckSampleTimer += delta;
      if (this.stuckSampleTimer >= 500) {
        this.stuckSampleTimer = 0;
        const movedDist = Phaser.Math.Distance.Between(this.x, this.y, this.stuckCheckX, this.stuckCheckY);
        if (movedDist < 6) {
          this.stuckTimer += 500;
        } else {
          this.stuckTimer = 0;
          this.stuckTeleported = false;
        }
        this.stuckCheckX = this.x;
        this.stuckCheckY = this.y;
      }

      const STUCK_REPATH_MS = 1000;
      const STUCK_TELEPORT_MS = 5000;
      const STUCK_KILL_MS = 8000;

      if (this.stuckTimer >= STUCK_KILL_MS) {
        // Stuck too long even after teleport — silently remove (no cash reward)
        const wm = (this.scene as any).waveManager;
        wm?.onEnemyKilled?.();
        this.die("ranged");
        return;
      } else if (this.stuckTimer >= STUCK_TELEPORT_MS && !this.stuckTeleported) {
        // Second attempt: teleport near the player (with full spawn validation)
        this.stuckTeleported = true;
        const wm = (this.scene as any).waveManager;
        let teleported = false;
        // Determine player's facing angle to avoid teleporting into their view
        const p = player as any;
        const facingAngle = p.facing === "up" ? -Math.PI / 2
          : p.facing === "down" ? Math.PI / 2
          : p.facing === "left" ? Math.PI
          : 0; // right
        // Try up to 12 random positions to find a valid one
        for (let i = 0; i < 12; i++) {
          const tpAngle = Math.random() * Math.PI * 2;
          // Skip if teleport would land in the 90° arc the player is facing
          const angleDiff = Math.abs(Phaser.Math.Angle.Wrap(tpAngle - facingAngle));
          if (angleDiff < Math.PI / 4) continue;
          const tpDist = 250 + Math.random() * 150;
          const tx = player.x + Math.cos(tpAngle) * tpDist;
          const ty = player.y + Math.sin(tpAngle) * tpDist;
          if (
            !isExcludedZone(tx, ty) &&
            !(wm?.isGated?.(tx, ty)) &&
            (wm?.isCollisionFree ? wm.isCollisionFree(tx, ty) : true) &&
            (wm?.isSpawnReachable ? wm.isSpawnReachable(tx, ty) : true)
          ) {
            this.setPosition(tx, ty);
            this.pathWaypoints = [];
            this.pathRefreshTimer = 0; // recalc path immediately
            teleported = true;
            break;
          }
        }
        // If no valid position found, skip — auto-kill at 8s will handle it
        if (!teleported) {
          this.stuckTimer = STUCK_KILL_MS; // fast-forward to auto-kill
        }
      } else if (this.stuckTimer >= STUCK_REPATH_MS && this.pathRefreshTimer > 0) {
        // First attempt: force immediate path recalc to unstick
        this.pathWaypoints = [];
        this.pathRefreshTimer = 0;
      }
    }

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
      } else if (dist < 80) {
        // Close range with no path — charge directly (within melee range, no obstacles expected)
        this.body.setVelocity(
          Math.cos(angle) * moveSpeed,
          Math.sin(angle) * moveSpeed
        );
      } else {
        // No path and not close — slow-move toward player while waiting for next pathfind
        // Use reduced speed to avoid ramming into walls at full speed
        this.body.setVelocity(
          Math.cos(angle) * moveSpeed * 0.3,
          Math.sin(angle) * moveSpeed * 0.3
        );
      }
    }

    this.updateDirection(player);
    this.updateVisuals(delta);
  }

  /** Update sprite facing direction */
  private updateDirection(player: Phaser.Physics.Arcade.Sprite) {
    const vx = this.body.velocity.x;
    const vy = this.body.velocity.y;
    // Face movement direction when moving (pathfinding around obstacles);
    // fall back to facing player when stationary (biting, stunned, idle)
    const angle = (Math.abs(vx) > 5 || Math.abs(vy) > 5)
      ? Math.atan2(vy, vx)
      : Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
    const newDir = angleToDirection(angle) as Direction;
    if (newDir !== this.currentDir) {
      this.currentDir = newDir;
      if (!this.biting && !this.leaping && !this.takingPunch && !this.backflipping && !this.castingFireball && !this.beingShot && !this.howling && !this.masonBusy && !this.bossBusy) {
        // Boss/mason: play idle anim when stationary, walk anim when moving
        const isStationary = Math.abs(vx) < 5 && Math.abs(vy) < 5;
        const isBossOrMason = this.enemyType === "boss" || this.enemyType === "mason";
        if (this.hasWalkAnim) {
          const animType = (isBossOrMason && isStationary) ? this.idleAnimType : this.walkAnimType;
          this.play(getAnimKey(this.spriteId, animType, newDir), true);
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

    // Health bar (bosses only)
    this.healthBarGfx.clear();
    const isBoss = this.enemyType === "boss" || this.enemyType === "mason";
    if (isBoss && this.health > 0 && this.health < this.maxHealth) {
      const barW = 40;
      const barH = 4;
      const barX = this.x - barW / 2;
      const barY = this.y - 45;

      this.healthBarGfx.fillStyle(0x000000, 0.6);
      this.healthBarGfx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

      const pct = this.health / this.maxHealth;
      const color = pct > 0.5 ? 0xcc3333 : pct > 0.25 ? 0xff6600 : 0xff0000;
      this.healthBarGfx.fillStyle(color, 1);
      this.healthBarGfx.fillRect(barX, barY, barW * pct, barH);
    }
  }
}
