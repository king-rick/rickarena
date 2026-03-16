import Phaser from "phaser";
import { BALANCE } from "../data/balance";
import { Enemy } from "./Enemy";

export type TrapType = "spikes" | "barricade" | "landmine";

const TRAP_COLORS: Record<TrapType, number> = {
  spikes: 0xcc4444,
  barricade: 0x886644,
  landmine: 0xcccc44,
};

/** Generate trap textures once per scene */
export function ensureTrapTextures(scene: Phaser.Scene) {
  if (!scene.textures.exists("trap-spikes")) {
    const g = scene.add.graphics();
    // Spikes: red X pattern
    g.fillStyle(0xcc4444, 0.8);
    g.fillRect(4, 4, 4, 24);
    g.fillRect(12, 4, 4, 24);
    g.fillRect(20, 4, 4, 24);
    g.fillStyle(0x882222, 0.6);
    g.fillRect(0, 12, 28, 4);
    g.generateTexture("trap-spikes", 28, 28);
    g.destroy();
  }
  if (!scene.textures.exists("trap-barricade")) {
    const g = scene.add.graphics();
    // Barricade: brown rectangle with planks
    g.fillStyle(0x886644, 0.9);
    g.fillRect(0, 4, 40, 20);
    g.fillStyle(0x664422, 0.8);
    g.fillRect(0, 8, 40, 3);
    g.fillRect(0, 16, 40, 3);
    g.fillStyle(0x554433, 1);
    g.fillRect(8, 4, 3, 20);
    g.fillRect(28, 4, 3, 20);
    g.generateTexture("trap-barricade", 40, 28);
    g.destroy();
  }
  if (!scene.textures.exists("trap-landmine")) {
    const g = scene.add.graphics();
    // Landmine: dark circle with center dot
    g.fillStyle(0x555544, 0.8);
    g.fillCircle(10, 10, 10);
    g.fillStyle(0xcccc44, 0.9);
    g.fillCircle(10, 10, 4);
    g.generateTexture("trap-landmine", 20, 20);
    g.destroy();
  }
}

export class Trap extends Phaser.Physics.Arcade.Image {
  declare body: Phaser.Physics.Arcade.Body;

  trapType: TrapType;
  hp: number;
  private usesLeft: number;

  constructor(scene: Phaser.Scene, x: number, y: number, type: TrapType) {
    super(scene, x, y, `trap-${type}`);

    this.trapType = type;
    this.usesLeft = type === "spikes" ? BALANCE.traps.spikes.uses : 1;
    this.hp = type === "barricade" ? BALANCE.traps.barricade.hp : 0;

    this.setDepth(2); // just above ground, below characters
  }

  /** Call after adding to physics group */
  init() {
    if (this.trapType === "barricade") {
      // Barricade is a solid static body
      this.body.setImmovable(true);
      this.body.setSize(40, 20);
    } else if (this.trapType === "spikes") {
      this.body.setSize(24, 24);
    } else {
      // Landmine
      this.body.setSize(16, 16);
    }
    this.body.setAllowGravity(false);
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
        // Explosion visual
        const boom = scene.add.circle(this.x, this.y, radius, 0xffaa00, 0.3);
        boom.setDepth(3);
        scene.tweens.add({
          targets: boom,
          alpha: 0,
          scaleX: 1.5,
          scaleY: 1.5,
          duration: 300,
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
