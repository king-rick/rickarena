import Phaser from "phaser";
import { BALANCE } from "../data/balance";
import { Enemy } from "./Enemy";

export type TrapType = "spikes" | "barricade" | "landmine";

/** No-op — trap textures are now loaded as real sprites in BootScene */
export function ensureTrapTextures(_scene: Phaser.Scene) {}

export class Trap extends Phaser.Physics.Arcade.Image {
  declare body: Phaser.Physics.Arcade.Body;

  trapType: TrapType;
  hp: number;
  private usesLeft: number;
  private vertical: boolean;

  constructor(scene: Phaser.Scene, x: number, y: number, type: TrapType, vertical = false) {
    // Vertical barricades use pre-rotated texture — no setAngle needed
    const textureKey = type === "barricade" && vertical ? "trap-barricade-v" : `trap-${type}`;
    super(scene, x, y, textureKey);

    this.trapType = type;
    this.vertical = vertical;
    this.usesLeft = type === "spikes" ? BALANCE.traps.spikes.uses : 1;
    this.hp = type === "barricade" ? BALANCE.traps.barricade.hp : 0;

    this.setDepth(2); // just above ground, below characters

    // Scale landmine sprite down — hitbox stays independent via body.setSize
    if (type === "landmine") {
      this.setScale(0.3);
    }
  }

  /** Call after adding to physics group */
  init() {
    if (this.trapType === "barricade") {
      // Collision matches the full sprite so nothing passes through
      // Sprite is 64x32; rotation swaps dimensions
      // Pre-rotated texture means body dimensions match the texture naturally
      const sb = this.body as unknown as Phaser.Physics.Arcade.StaticBody;
      if (this.vertical) {
        sb.setSize(32, 64);
      } else {
        sb.setSize(64, 32);
      }
      sb.updateFromGameObject();
    } else if (this.trapType === "spikes") {
      this.body.setSize(40, 40);
      this.body.setAllowGravity(false);
    } else {
      // Landmine
      this.body.setSize(16, 16);
      this.body.setAllowGravity(false);
    }
  }

  /** Called when an enemy touches this trap. Returns true if trap should be removed. */
  trigger(enemy: Enemy, scene: Phaser.Scene): boolean {
    switch (this.trapType) {
      case "spikes": {
        enemy.takeDamage(BALANCE.traps.spikes.damage);
        // Brief slow via stun
        this.usesLeft--;
        // Visual feedback
        this.setAlpha(0.4 + 0.6 * (this.usesLeft / BALANCE.traps.spikes.uses));
        return this.usesLeft <= 0;
      }
      case "landmine": {
        // AoE explosion
        const radius = BALANCE.traps.landmine.radius;
        const enemies = (scene as any).enemies as Phaser.Physics.Arcade.Group;
        enemies.getChildren().forEach((obj) => {
          const e = obj as Enemy;
          if (!e.active) return;
          const dist = Phaser.Math.Distance.Between(this.x, this.y, e.x, e.y);
          if (dist <= radius) {
            // Damage falls off with distance
            const dmgMult = 1 - (dist / radius) * 0.5;
            e.takeDamage(Math.floor(BALANCE.traps.landmine.damage * dmgMult));
            // Knockback from explosion
            const angle = Phaser.Math.Angle.Between(this.x, this.y, e.x, e.y);
            e.body?.setVelocity(
              Math.cos(angle) * 200,
              Math.sin(angle) * 200
            );
          }
        });
        // Explosion sprite
        const boom = scene.add.image(this.x, this.y, "fx-explosion");
        boom.setDepth(3);
        boom.setScale(radius / 8); // scale 16px sprite to match blast radius
        boom.setAlpha(0.85);
        scene.tweens.add({
          targets: boom,
          alpha: 0,
          scaleX: boom.scaleX * 1.5,
          scaleY: boom.scaleY * 1.5,
          duration: 350,
          onComplete: () => boom.destroy(),
        });
        return true; // one-time use
      }
      case "barricade":
        // Barricades don't trigger — they block via collision
        return false;
    }
  }

  /** Called when a barricade takes damage from enemies pushing into it */
  takeDamage(amount: number): boolean {
    this.hp -= amount;
    this.setTint(0xffffff);
    this.scene.time.delayedCall(80, () => {
      if (this.active) this.clearTint();
    });
    if (this.hp <= 0) {
      // Break apart visual
      const pieces = this.scene.add.graphics();
      pieces.setDepth(2);
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = 5 + Math.random() * 15;
        pieces.fillStyle(0x664422, 0.6);
        pieces.fillRect(
          this.x + Math.cos(a) * d - 3,
          this.y + Math.sin(a) * d - 2,
          6, 4
        );
      }
      this.scene.time.delayedCall(2000, () => pieces.destroy());
      this.destroy();
      return true;
    }
    return false;
  }
}
