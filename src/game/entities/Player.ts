import Phaser from "phaser";
import { Direction, DIRECTIONS } from "../data/characters";
import { BALANCE } from "../data/balance";
import { hasAnimation, getAnimKey } from "../data/animations";

export type Facing = "down" | "up" | "left" | "right";
type PlayerAnim = "walk" | "breathing-idle" | "idle" | "cross-punch" | "taking-punch" | "falling-back-death";

export interface PlayerStats {
  speed: number;
  maxHealth: number;
  maxStamina: number;
  health: number;
  stamina: number;
  regen: number;
  damage: number;
}

function getDirectionFromVelocity(vx: number, vy: number): Direction {
  if (vx === 0 && vy === 0) return "south";
  const right = vx > 0;
  const left = vx < 0;
  const up = vy < 0;
  const down = vy > 0;

  if (down && right) return "south-east";
  if (down && left) return "south-west";
  if (up && right) return "north-east";
  if (up && left) return "north-west";
  if (down) return "south";
  if (up) return "north";
  if (right) return "east";
  return "west";
}

export class Player extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;

  stats: PlayerStats;
  characterId: string;
  facing: Facing = "down";
  burnedOut = false;

  private currentDir: Direction = "south";
  private currentAnim: PlayerAnim = "idle";
  private lastStaminaUse = 0;
  private burnoutTimer = 0;
  private hasWalkAnim: boolean;
  private hasIdleAnim: boolean;
  private hasPunchAnim: boolean;
  private hasHurtAnim: boolean;
  private hasDeathAnim: boolean;
  private punching = false;
  private locked = false; // true during hurt/death — blocks all input

  /** True while punch animation is active — grants i-frames */
  get isPunching(): boolean { return this.punching; }

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    characterId: string,
    stats: PlayerStats
  ) {
    super(scene, x, y, `${characterId}-south`);

    this.characterId = characterId;
    this.stats = { ...stats };
    this.hasWalkAnim = hasAnimation(characterId, "walk");
    this.hasIdleAnim = hasAnimation(characterId, "breathing-idle");
    this.hasPunchAnim = hasAnimation(characterId, "cross-punch");
    this.hasHurtAnim = hasAnimation(characterId, "taking-punch");
    this.hasDeathAnim = hasAnimation(characterId, "falling-back-death");

    scene.add.existing(this);
    scene.physics.add.existing(this);

    // Collision body: covers torso area for solid enemy separation
    this.body.setSize(36, 40);
    this.body.setOffset(46, 76);
    this.setScale(0.25);
    this.setDepth(5);

    // Start with idle animation if available
    if (this.hasIdleAnim) {
      this.play(getAnimKey(characterId, "breathing-idle", "south"));
    }

    if (scene.input.keyboard) {
      this.cursors = scene.input.keyboard.createCursorKeys();
      this.wasd = {
        W: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        A: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        S: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        D: scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      };
    }
  }

  update() {
    const delta = this.scene.game.loop.delta;

    // Burnout timer
    if (this.burnedOut) {
      this.burnoutTimer -= delta;
      if (this.burnoutTimer <= 0) {
        this.burnedOut = false;
        this.burnoutTimer = 0;
        this.clearTint();
        this.stats.stamina = this.stats.maxStamina * 0.3;
        this.lastStaminaUse = this.scene.time.now;
      }
    }

    // Stamina regen
    if (
      !this.burnedOut &&
      this.stats.stamina < this.stats.maxStamina
    ) {
      const timeSinceUse = this.scene.time.now - this.lastStaminaUse;
      if (timeSinceUse >= BALANCE.stamina.regenDelay) {
        this.stats.stamina = Math.min(
          this.stats.maxStamina,
          this.stats.stamina + this.stats.regen * (delta / 1000)
        );
      }
    }

    // Skip movement when locked (hurt/death)
    if (this.locked) return;

    // Movement
    const speedMult = this.burnedOut ? BALANCE.burnout.speedMultiplier : 1;
    const speed = this.stats.speed * speedMult;
    let vx = 0;
    let vy = 0;

    const left = this.cursors?.left.isDown || this.wasd?.A.isDown;
    const right = this.cursors?.right.isDown || this.wasd?.D.isDown;
    const up = this.cursors?.up.isDown || this.wasd?.W.isDown;
    const down = this.cursors?.down.isDown || this.wasd?.S.isDown;

    if (left) vx -= 1;
    if (right) vx += 1;
    if (up) vy -= 1;
    if (down) vy += 1;

    // Normalize diagonal
    if (vx !== 0 && vy !== 0) {
      const norm = 1 / Math.sqrt(2);
      vx *= norm;
      vy *= norm;
    }

    this.body.setVelocity(vx * speed, vy * speed);

    const isMoving = vx !== 0 || vy !== 0;

    if (isMoving) {
      const dir = getDirectionFromVelocity(
        vx > 0 ? 1 : vx < 0 ? -1 : 0,
        vy > 0 ? 1 : vy < 0 ? -1 : 0
      );

      // Update facing for combat even during punch
      if (dir.includes("south")) this.facing = "down";
      else if (dir.includes("north")) this.facing = "up";
      else if (dir === "east") this.facing = "right";
      else if (dir === "west") this.facing = "left";

      // Don't interrupt punch animation with walk/idle
      if (!this.punching) {
        const dirChanged = dir !== this.currentDir;
        const animChanged = this.currentAnim !== "walk";

        if (dirChanged || animChanged) {
          this.currentDir = dir;
          this.currentAnim = "walk";

          if (this.hasWalkAnim) {
            this.play(getAnimKey(this.characterId, "walk", dir), true);
          } else {
            this.setTexture(`${this.characterId}-${dir}`);
          }
        }
      }

      this.currentDir = dir;
    } else if (this.currentAnim === "walk" && !this.punching) {
      // Stopped moving — switch to idle
      this.currentAnim = "idle";

      if (this.hasIdleAnim) {
        this.play(
          getAnimKey(this.characterId, "breathing-idle", this.currentDir),
          true
        );
      } else {
        this.setTexture(`${this.characterId}-${this.currentDir}`);
      }
    }
  }

  // Callback for when a one-shot animation finishes (death needs its own)
  private onActionAnimComplete: (() => void) | null = null;
  private onDeathComplete: (() => void) | null = null;

  /** Safely play a one-shot animation. Clears stale listeners first. */
  private playOneShot(animKey: string): boolean {
    if (!this.scene.anims.exists(animKey)) return false;

    // Remove any stale listener before adding a new one
    this.off("animationcomplete", this.handleAnimComplete, this);

    try {
      this.play(animKey);
    } catch {
      return false;
    }

    this.once("animationcomplete", this.handleAnimComplete, this);
    return true;
  }

  private handleAnimComplete = () => {
    if (this.onDeathComplete) {
      this.onDeathComplete();
      this.onDeathComplete = null;
      return;
    }

    if (this.onActionAnimComplete) {
      this.onActionAnimComplete();
      this.onActionAnimComplete = null;
    }

    // Reset to idle and play idle animation immediately
    this.punching = false;
    this.locked = false;
    this.currentAnim = "idle";

    if (this.hasIdleAnim) {
      this.play(getAnimKey(this.characterId, "breathing-idle", this.currentDir), true);
    } else {
      this.setTexture(`${this.characterId}-${this.currentDir}`);
    }
  };

  playPunch(onImpact?: () => void) {
    if (!this.hasPunchAnim || this.locked || this.punching) {
      onImpact?.();
      return;
    }

    const punchKey = getAnimKey(this.characterId, "cross-punch", this.currentDir);

    this.punching = true;
    this.currentAnim = "cross-punch";
    this.onActionAnimComplete = onImpact || null;

    if (!this.playOneShot(punchKey)) {
      this.punching = false;
      this.currentAnim = "idle";
      onImpact?.();
    }
  }

  /** Play hurt flinch animation. Brief lock, then returns to normal. */
  playHurt() {
    if (!this.hasHurtAnim || this.locked) return;

    const hurtKey = getAnimKey(this.characterId, "taking-punch", this.currentDir);

    this.locked = true;
    this.punching = false;
    this.currentAnim = "taking-punch";

    if (!this.playOneShot(hurtKey)) {
      this.locked = false;
      this.currentAnim = "idle";
    }
  }

  /** Play death animation. Permanently locks the player. */
  playDeath(onComplete?: () => void) {
    if (!this.hasDeathAnim) {
      onComplete?.();
      return;
    }

    const deathKey = getAnimKey(this.characterId, "falling-back-death", this.currentDir);

    this.locked = true;
    this.punching = false;
    this.currentAnim = "falling-back-death";
    this.body.setVelocity(0, 0);
    this.onDeathComplete = onComplete || null;

    if (!this.playOneShot(deathKey)) {
      onComplete?.();
    }
  }

  useStamina(amount: number): boolean {
    if (this.burnedOut) return false;
    if (this.stats.stamina < amount) return false;

    this.stats.stamina -= amount;
    this.lastStaminaUse = this.scene.time.now;

    if (this.stats.stamina <= 0) {
      this.stats.stamina = 0;
      this.burnedOut = true;
      this.burnoutTimer = BALANCE.burnout.duration;
      this.setTint(0x888888);
    }

    return true;
  }
}
