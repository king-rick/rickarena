import Phaser from "phaser";

/** No-op — bullet texture is now loaded as a real sprite in BootScene */
export function ensureBulletTexture(_scene: Phaser.Scene) {}

export class Projectile extends Phaser.Physics.Arcade.Image {
  declare body: Phaser.Physics.Arcade.Body;

  damage: number;
  private baseDamage: number;
  private dropoff: number; // 0 = no dropoff, 0.5 = 50% damage at max range
  maxRange: number;
  distanceRatio = 0; // 0 at start, 1 at max range — used for crit calc
  weaponType: string; // which weapon fired this projectile
  private startX: number;
  private startY: number;
  private speedX: number;
  private speedY: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    angle: number,
    speed: number,
    damage: number,
    range: number,
    dropoff: number = 0,
    weaponType: string = "pistol"
  ) {
    super(scene, x, y, "bullet");

    this.baseDamage = damage;
    this.damage = damage;
    this.dropoff = dropoff;
    this.maxRange = range;
    this.weaponType = weaponType;
    this.startX = x;
    this.startY = y;
    this.speedX = Math.cos(angle) * speed;
    this.speedY = Math.sin(angle) * speed;

    this.setDepth(50);
    this.setRotation(angle);
  }

  /** Call after adding to physics group to apply velocity */
  launch() {
    // Large circular hitbox centered on the bullet sprite
    // Sprite is small (32x32 at scale 1), so offset to center the circle
    const r = 12;
    const sprW = this.width;
    const sprH = this.height;
    this.body.setCircle(r, sprW / 2 - r, sprH / 2 - r);
    this.body.setAllowGravity(false);
    this.body.setVelocity(this.speedX, this.speedY);
  }

  preUpdate() {
    if (!this.active) return;

    const dist = Phaser.Math.Distance.Between(
      this.startX,
      this.startY,
      this.x,
      this.y
    );
    if (dist >= this.maxRange) {
      this.destroy();
      return;
    }

    // Track distance ratio for crit calculations
    this.distanceRatio = dist / this.maxRange;

    // Damage dropoff: linearly reduce from baseDamage to baseDamage * dropoff
    if (this.dropoff > 0) {
      const t = dist / this.maxRange; // 0 at start, 1 at max range
      this.damage = Math.max(1, Math.floor(
        this.baseDamage * (1 - t * (1 - this.dropoff))
      ));
    }
  }
}
