import Phaser from "phaser";
import { BALANCE } from "../data/balance";
import { hasAnimation, getAnimKey } from "../data/animations";
import { Direction } from "../data/characters";

export type EnemyType = "basic" | "fast" | "tank";

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
  fast: 0xffffff, // zombiedog sprite, no tint needed
  tank: 0xffffff, // bigzombie sprite, no tint needed
};

const VARIANT_SCALES: Record<EnemyType, number> = {
  basic: 0.2,
  fast: 0.2,
  tank: 0.25,
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
  private hasDeathAnim: boolean;
  private hasLeapAnim: boolean;
  private biting = false;
  private leaping = false;
  private dying = false;
  private leapCooldown = 0; // ms until next leap allowed
  private baseTint: number;
  private stunTimer = 0; // ms remaining where enemy is slowed/stopped
  private stuckTimer = 0; // ms since last significant movement
  private lastX = 0;
  private lastY = 0;
  private spriteId: string; // "pussy", "zombiedog", or "bigzombie"

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    type: EnemyType,
    waveMultiplier: number = 1
  ) {
    const isTank = type === "tank";
    const isFast = type === "fast";
    const spriteId = isTank ? "bigzombie" : isFast ? "zombiedog" : "pussy";
    super(scene, x, y, `${spriteId}-south`);

    this.spriteId = spriteId;
    const baseStats = BALANCE.enemies[type];
    this.enemyType = type;
    this.maxHealth = Math.floor(baseStats.hp * waveMultiplier);
    this.health = this.maxHealth;
    this.speed = baseStats.speed * (1 + (waveMultiplier - 1) * 0.5);
    this.damage = Math.floor(baseStats.damage * waveMultiplier);
    this.baseTint = VARIANT_TINTS[type];

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setScale(VARIANT_SCALES[type]);
    this.setDepth(5);

    // Collision body covering torso + feet for reliable hit detection
    if (isTank) {
      this.body.setSize(50, 60);
      this.body.setOffset(55, 65);
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

    this.hasWalkAnim = hasAnimation(spriteId, "walk");
    this.hasBiteAnim = hasAnimation(spriteId, "bite");
    this.hasDeathAnim = hasAnimation(spriteId, "death");
    this.hasLeapAnim = hasAnimation(spriteId, "leap");
    this.leapCooldown = 2000 + Math.random() * 2000; // stagger initial leap timing
    this.lastX = x;
    this.lastY = y;

    // Start walk animation if available
    if (this.hasWalkAnim) {
      this.play(getAnimKey(spriteId, "walk", "south"));
    }

    this.healthBarGfx = scene.add.graphics();
    this.healthBarGfx.setDepth(20);
  }

  /** Apply extra stun time for heavy knockback (e.g. shotgun blasts) */
  applyKnockbackStun(ms: number) {
    this.stunTimer = Math.max(this.stunTimer, ms);
  }

  takeDamage(amount: number): boolean {
    this.health -= amount;
    this.hitFlashTimer = 100;
    this.setTint(0xffffff);

    // Stun on hit — fast enemies stun longer (they're fragile)
    this.stunTimer = this.enemyType === "fast" ? 400 : 200;

    if (this.health <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  private die() {
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

    // Play death animation if available, then destroy
    if (this.hasDeathAnim) {
      const deathKey = getAnimKey(this.spriteId, "death", this.currentDir);
      if (this.scene.anims.exists(deathKey)) {
        this.play(deathKey);
        this.once("animationcomplete", () => {
          // Fade out then destroy
          this.scene.tweens.add({
            targets: this,
            alpha: 0,
            duration: 300,
            onComplete: () => this.destroy(),
          });
        });
        return;
      }
    }
    this.destroy();
  }

  /** Play bite animation when attacking the player */
  playBite() {
    if (!this.hasBiteAnim || this.biting) return;

    this.biting = true;
    const biteKey = getAnimKey(this.spriteId, "bite", this.currentDir);

    if (this.scene.anims.exists(biteKey)) {
      this.off("animationcomplete", this.handleBiteComplete, this);
      this.play(biteKey);
      this.once("animationcomplete", this.handleBiteComplete, this);
    } else {
      this.biting = false;
    }
  }

  private handleBiteComplete = () => {
    this.biting = false;
    // Resume walk animation
    if (this.hasWalkAnim) {
      this.play(getAnimKey(this.spriteId, "walk", this.currentDir), true);
    }
  };

  /** Start a lunge attack toward the player */
  private startLeap(angle: number) {
    if (this.leaping || this.biting || this.dying) return;

    this.leaping = true;
    this.leapCooldown = 3000 + Math.random() * 2000; // 3-5s cooldown

    const leapKey = getAnimKey(this.spriteId, "leap", this.currentDir);
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
      if (this.hasWalkAnim && !this.biting && !this.dying) {
        this.play(getAnimKey(this.spriteId, "walk", this.currentDir), true);
      }
    });
  }

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

    // Leap cooldown
    if (this.leapCooldown > 0) {
      this.leapCooldown -= delta;
    }

    // Stuck detection — if barely moved in 3 seconds, teleport near the player
    this.stuckTimer += delta;
    if (this.stuckTimer >= 3000) {
      const dx = Math.abs(this.x - this.lastX);
      const dy = Math.abs(this.y - this.lastY);
      if (dx < 10 && dy < 10) {
        const teleportAngle = Math.random() * Math.PI * 2;
        const teleportDist = 200 + Math.random() * 100;
        this.setPosition(
          player.x + Math.cos(teleportAngle) * teleportDist,
          player.y + Math.sin(teleportAngle) * teleportDist
        );
        this.body.setVelocity(0, 0);
      }
      this.lastX = this.x;
      this.lastY = this.y;
      this.stuckTimer = 0;
    }

    const angle = Phaser.Math.Angle.Between(
      this.x,
      this.y,
      player.x,
      player.y
    );
    const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);

    // Leap attack — dogs lunge when within range and off cooldown
    if (this.hasLeapAnim && !this.leaping && !this.biting && this.stunTimer <= 0
        && this.leapCooldown <= 0 && dist > 40 && dist < 120) {
      this.startLeap(angle);
    }

    if (this.stunTimer <= 0 && !this.leaping) {
      // Chase player
      this.body.setVelocity(
        Math.cos(angle) * this.speed,
        Math.sin(angle) * this.speed
      );
    }

    // Update sprite direction (don't interrupt bite or leap)
    const newDir = angleToDirection(angle) as Direction;
    if (newDir !== this.currentDir) {
      this.currentDir = newDir;
      if (!this.biting && !this.leaping) {
        if (this.hasWalkAnim) {
          this.play(getAnimKey(this.spriteId, "walk", newDir), true);
        } else {
          this.setTexture(`${this.spriteId}-${newDir}`);
        }
      }
      if (this.hitFlashTimer <= 0 && this.baseTint !== 0xffffff) {
        this.setTint(this.baseTint);
      }
    }

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
      const barW = 40;
      const barH = 4;
      const barX = this.x - barW / 2;
      const barY = this.y - 35;

      this.healthBarGfx.fillStyle(0x000000, 0.6);
      this.healthBarGfx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

      const pct = this.health / this.maxHealth;
      const color =
        pct > 0.5 ? 0x33cc33 : pct > 0.25 ? 0xcccc33 : 0xcc3333;
      this.healthBarGfx.fillStyle(color, 1);
      this.healthBarGfx.fillRect(barX, barY, barW * pct, barH);
    }
  }
}
