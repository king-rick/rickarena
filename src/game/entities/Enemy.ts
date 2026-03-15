import Phaser from "phaser";
import { BALANCE } from "../data/balance";

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
  fast: 0xcccc66,
  tank: 0x6666cc,
};

const VARIANT_SCALES: Record<EnemyType, number> = {
  basic: 0.4,
  fast: 0.35,
  tank: 0.5,
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
  private currentDir = "south";
  private baseTint: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    type: EnemyType,
    waveMultiplier: number = 1
  ) {
    super(scene, x, y, "pussy-south");

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

    // Collision body at feet
    this.body.setSize(40, 30);
    this.body.setOffset(44, 90);

    if (this.baseTint !== 0xffffff) {
      this.setTint(this.baseTint);
    }

    this.healthBarGfx = scene.add.graphics();
  }

  takeDamage(amount: number): boolean {
    this.health -= amount;
    this.hitFlashTimer = 100;
    this.setTint(0xffffff);

    if (this.health <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  private die() {
    // Blood splat — stays on the ground
    const blood = this.scene.add.graphics();
    blood.setDepth(1);
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 8 + Math.random() * 30;
      const px = this.x + Math.cos(angle) * dist;
      const py = this.y + Math.sin(angle) * dist;
      const size = 3 + Math.random() * 7;
      blood.fillStyle(0x880000, 0.6 + Math.random() * 0.3);
      blood.fillCircle(px, py, size / 2);
    }
    // Large center pool
    blood.fillStyle(0x660000, 0.5);
    blood.fillCircle(this.x, this.y, 8 + Math.random() * 4);

    this.healthBarGfx.destroy();
    this.destroy();
  }

  update(_time: number, delta: number) {
    if (!this.active || !this.body) return;

    // Get player reference from scene
    const player = (this.scene as any).player as
      | Phaser.Physics.Arcade.Sprite
      | undefined;
    if (!player || !player.active) return;

    // Chase player
    const angle = Phaser.Math.Angle.Between(
      this.x,
      this.y,
      player.x,
      player.y
    );
    this.body.setVelocity(
      Math.cos(angle) * this.speed,
      Math.sin(angle) * this.speed
    );

    // Update sprite direction
    const newDir = angleToDirection(angle);
    if (newDir !== this.currentDir) {
      this.currentDir = newDir;
      this.setTexture(`pussy-${newDir}`);
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
