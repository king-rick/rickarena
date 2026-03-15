import Phaser from "phaser";
import { Direction, DIRECTIONS } from "../data/characters";
import { BALANCE } from "../data/balance";
import { hasAnimation, getAnimKey } from "../data/animations";

export type Facing = "down" | "up" | "left" | "right";
type PlayerAnim = "walk" | "breathing-idle" | "idle";

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

    scene.add.existing(this);
    scene.physics.add.existing(this);

    // Collision body: small box at feet of 128px sprite
    this.body.setSize(32, 24);
    this.body.setOffset(48, 96);
    this.setScale(0.5);

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

      // Update facing for combat
      if (dir.includes("south")) this.facing = "down";
      else if (dir.includes("north")) this.facing = "up";
      else if (dir === "east") this.facing = "right";
      else if (dir === "west") this.facing = "left";
    } else if (this.currentAnim === "walk") {
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
