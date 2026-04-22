import Phaser from "phaser";
import { Direction, DIRECTIONS } from "../data/characters";
import { BALANCE } from "../data/balance";
import { hasAnimation, getAnimKey } from "../data/animations";

export type Facing = "down" | "up" | "left" | "right";
type PlayerAnim = "walk" | "running-6-frames" | "breathing-idle" | "idle" | "cross-punch" | "taking-punch" | "falling-back-death" | "shooting-pistol" | "shooting-shotgun" | "shooting-smg" | "high-kick" | "swinging-katana" | "throw-grenade" | "walking-shooting-pistol" | "reloading-pistol" | "reloading-shotgun" | "reloading-smg" | "light-cigarette";

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
  invincible = false;
  grenadeCount = 0;
  throwingGrenade = false;

  currentDir: Direction = "south";
  private currentAnim: PlayerAnim = "idle";
  private lastStaminaUse = 0;
  private burnoutTimer = 0;
  private hasWalkAnim: boolean;
  private hasRunAnim: boolean;
  private hasIdleAnim: boolean;
  private hasPunchAnim: boolean;
  private hasHurtAnim: boolean;
  private hasDeathAnim: boolean;
  private hasWalkShootPistolAnim: boolean;
  private punching = false;
  private shooting = false; // true during shoot animation — doesn't block movement
  private holdingShoot = false; // true for auto weapons holding last frame
  private locked = false; // true during hurt/death — blocks all input
  private sprinting = false;
  private shiftKey!: Phaser.Input.Keyboard.Key;

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
    this.hasRunAnim = hasAnimation(characterId, "running-6-frames");
    this.hasIdleAnim = hasAnimation(characterId, "breathing-idle");
    this.hasPunchAnim = hasAnimation(characterId, "cross-punch");
    this.hasHurtAnim = hasAnimation(characterId, "taking-punch");
    this.hasDeathAnim = hasAnimation(characterId, "falling-back-death");
    this.hasWalkShootPistolAnim = hasAnimation(characterId, "walking-shooting-pistol");

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
      this.shiftKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
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
    const left = this.cursors?.left.isDown || this.wasd?.A.isDown;
    const right = this.cursors?.right.isDown || this.wasd?.D.isDown;
    const up = this.cursors?.up.isDown || this.wasd?.W.isDown;
    const down = this.cursors?.down.isDown || this.wasd?.S.isDown;

    let vx = 0;
    let vy = 0;
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

    const isMoving = vx !== 0 || vy !== 0;

    // Sprint: hold shift while moving, drains stamina
    const wantsSprint = this.shiftKey?.isDown && isMoving && !this.burnedOut;
    this.sprinting = wantsSprint && this.stats.stamina > 0;

    if (this.sprinting) {
      this.stats.stamina = Math.max(0, this.stats.stamina - BALANCE.stamina.sprintCostPerSecond * (delta / 1000));
      this.lastStaminaUse = this.scene.time.now;
      if (this.stats.stamina <= 0) {
        this.burnedOut = true;
        this.burnoutTimer = BALANCE.burnout.duration;
        this.setTint(0x888888);
        this.sprinting = false;
      }
    }

    const speedMult = this.burnedOut ? BALANCE.burnout.speedMultiplier : this.sprinting ? 1.6 : 1;
    const speed = this.stats.speed * speedMult;

    this.body.setVelocity(vx * speed, vy * speed);

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

      // Don't interrupt punch or shooting animation with walk/idle/run
      if (!this.punching && !this.shooting) {
        const dirChanged = dir !== this.currentDir;
        const wantedAnim = this.sprinting && this.hasRunAnim ? "running-6-frames" : "walk";
        const animChanged = this.currentAnim !== wantedAnim;

        if (dirChanged || animChanged) {
          this.currentDir = dir;
          this.currentAnim = wantedAnim;

          if (wantedAnim === "running-6-frames" && this.hasRunAnim) {
            this.play(getAnimKey(this.characterId, "running-6-frames", dir), true);
          } else if (this.hasWalkAnim) {
            this.play(getAnimKey(this.characterId, "walk", dir), true);
          } else {
            this.setTexture(`${this.characterId}-${dir}`);
          }
        }
      } else if (this.shooting) {
        // Still update facing direction during shooting
        this.currentDir = dir;
      }

      this.currentDir = dir;
    } else if ((this.currentAnim === "walk" || this.currentAnim === "running-6-frames") && !this.punching && !this.shooting) {
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

  /** Play throw grenade animation. Uses throw-grenade if available, cross-punch as fallback. */
  playThrowGrenade(onComplete?: () => void) {
    if (this.locked) {
      onComplete?.();
      return;
    }

    this.throwingGrenade = true;
    this.shooting = true;

    // Try throw-grenade first (Dan has it), fall back to cross-punch
    const throwAnimType = hasAnimation(this.characterId, "throw-grenade") ? "throw-grenade" : "cross-punch";
    const throwKey = getAnimKey(this.characterId, throwAnimType, this.currentDir);

    if (!this.scene.anims.exists(throwKey)) {
      this.throwingGrenade = false;
      this.shooting = false;
      onComplete?.();
      return;
    }

    this.currentAnim = throwAnimType as PlayerAnim;
    this.off("animationcomplete", this.handleAnimComplete, this);
    this.off("animationcomplete", this.handleShootComplete, this);

    try {
      this.play(throwKey);
    } catch {
      this.throwingGrenade = false;
      this.shooting = false;
      onComplete?.();
      return;
    }

    this.once("animationcomplete", () => {
      this.throwingGrenade = false;
      this.shooting = false;
      this.currentAnim = "idle";
      if (this.hasIdleAnim) {
        this.play(getAnimKey(this.characterId, "breathing-idle", this.currentDir), true);
      }
      onComplete?.();
    });
  }

  /** Play hurt flinch animation. Brief lock, then returns to normal. */
  playHurt() {
    if (!this.hasHurtAnim || this.locked) return;

    // Cancel ability animation if active (e.g. smokescreen cigarette interrupted by damage)
    this.cancelAbilityAnimation();

    const hurtKey = getAnimKey(this.characterId, "taking-punch", this.currentDir);

    this.locked = true;
    this.punching = false;
    this.shooting = false;
    this.holdingShoot = false;
    this.currentAnim = "taking-punch";

    if (!this.playOneShot(hurtKey)) {
      this.locked = false;
      this.currentAnim = "idle";
      return;
    }

    // Safety timeout: always unlock after 600ms even if animation doesn't complete
    this.scene.time.delayedCall(600, () => {
      if (this.active && this.locked && this.currentAnim === "taking-punch") {
        this.locked = false;
        this.currentAnim = "idle";
      }
    });
  }

  /** Play death animation. Permanently locks the player. */
  playDeath(onComplete?: () => void) {
    if (!this.hasDeathAnim) {
      onComplete?.();
      return;
    }

    // Cancel ability animation if active
    this.cancelAbilityAnimation();

    const deathKey = getAnimKey(this.characterId, "falling-back-death", this.currentDir);

    this.locked = true;
    this.punching = false;
    this.shooting = false;
    this.holdingShoot = false;
    this.currentAnim = "falling-back-death";
    this.body.setVelocity(0, 0);
    this.onDeathComplete = onComplete || null;

    if (!this.playOneShot(deathKey)) {
      onComplete?.();
    }
  }

  /** Play shooting animation based on weapon type. Doesn't lock movement. */
  playShoot(weaponType: string) {
    if (this.locked || this.punching) return;

    // Cancel ability animation if active (shooting should override ability anim)
    this.cancelAbilityAnimation();

    // Map weapon type to animation name
    const animMap: Record<string, string> = {
      pistol: "shooting-pistol",
      shotgun: "shooting-shotgun",
      smg: "shooting-smg",
      rpg: "shooting-rpg",
      assault_rifle: "shooting-assault-rifle",
    };

    const isAuto = weaponType === "smg" || weaponType === "assault_rifle";
    let animType = animMap[weaponType];
    if (!animType || !hasAnimation(this.characterId, animType)) return;

    // If moving and shooting pistol, use walk-shoot animation if available
    const vx = this.body?.velocity?.x ?? 0;
    const vy = this.body?.velocity?.y ?? 0;
    const isMoving = Math.abs(vx) > 1 || Math.abs(vy) > 1;
    if (isMoving && weaponType === "pistol" && this.hasWalkShootPistolAnim) {
      animType = "walking-shooting-pistol";
    }

    const shootKey = getAnimKey(this.characterId, animType, this.currentDir);
    if (!this.scene.anims.exists(shootKey)) return;

    this.shooting = true;
    this.holdingShoot = isAuto;
    this.currentAnim = animType as PlayerAnim;

    // For auto weapons, don't restart if already in shoot pose
    if (isAuto && this.anims.currentAnim?.key === shootKey) {
      return;
    }

    this.off("animationcomplete", this.handleShootComplete, this);
    try {
      this.play(shootKey);
    } catch {
      this.shooting = false;
      this.holdingShoot = false;
      return;
    }

    if (isAuto) {
      // For auto weapons, let animation play to ~60% (gun peak), then hold
      const anim = this.anims.currentAnim;
      if (anim) {
        const peakIdx = Math.floor(anim.frames.length * 0.6);
        const peakFrame = anim.frames[peakIdx];
        // Wait a bit for the animation to reach the peak, then freeze
        const msToReachPeak = (peakIdx / (anim.frameRate || 16)) * 1000;
        this.scene.time.delayedCall(msToReachPeak, () => {
          if (this.holdingShoot && this.anims.currentAnim?.key === shootKey) {
            this.anims.pause(peakFrame);
          }
        });
      }
    } else {
      this.once("animationcomplete", this.handleShootComplete, this);
    }
  }

  /** Release the held shoot pose (called on trigger release) */
  stopHoldShoot() {
    if (!this.holdingShoot) return;
    this.holdingShoot = false;
    this.shooting = false;
    this.currentAnim = "idle";

    const vx = this.body?.velocity?.x ?? 0;
    const vy = this.body?.velocity?.y ?? 0;
    const isMoving = Math.abs(vx) > 1 || Math.abs(vy) > 1;

    if (isMoving && this.hasWalkAnim) {
      this.currentAnim = "walk";
      this.play(getAnimKey(this.characterId, "walk", this.currentDir), true);
    } else if (this.hasIdleAnim) {
      this.play(getAnimKey(this.characterId, "breathing-idle", this.currentDir), true);
    } else {
      this.setTexture(`${this.characterId}-${this.currentDir}`);
    }
  }

  /** Play reload animation for the given weapon. Non-blocking (player can still move). */
  playReload(weaponType: string) {
    if (this.locked || this.punching) return;

    // Cancel ability animation if active (e.g. smokescreen ending during reload)
    this.cancelAbilityAnimation();

    const animMap: Record<string, string> = {
      pistol: "reloading-pistol",
      shotgun: "reloading-shotgun",
      smg: "reloading-smg",
      rpg: "reloading-shotgun",          // placeholder — reuse shotgun reload
      assault_rifle: "reloading-smg",     // placeholder — reuse SMG reload
    };
    const animType = animMap[weaponType];
    if (!animType || !hasAnimation(this.characterId, animType)) return;

    const reloadKey = getAnimKey(this.characterId, animType, this.currentDir);
    if (!this.scene.anims.exists(reloadKey)) return;

    this.shooting = true;
    this.holdingShoot = false;
    this.currentAnim = animType as PlayerAnim;

    this.off("animationcomplete", this.handleShootComplete, this);
    try {
      this.play(reloadKey);
    } catch {
      this.shooting = false;
      return;
    }
    this.once("animationcomplete", this.handleShootComplete, this);
  }

  /** Stop reload animation early (e.g. weapon switch cancels reload) */
  stopReload() {
    if (this.currentAnim === "reloading-pistol" || this.currentAnim === "reloading-shotgun" || this.currentAnim === "reloading-smg") {
      this.shooting = false;
      this.currentAnim = "idle";
      if (this.hasIdleAnim) {
        this.play(getAnimKey(this.characterId, "breathing-idle", this.currentDir), true);
      }
    }
  }

  /** Play an ability animation (e.g. light-cigarette). Holds on last frame for holdMs,
   *  then cleanly restores to idle. Saves/restores direction so facing isn't corrupted. */
  private abilityAnimTimer: Phaser.Time.TimerEvent | null = null;
  private abilityAnimSafetyTimer: Phaser.Time.TimerEvent | null = null;

  playAbilityAnimation(animType: string, holdMs: number, onComplete?: () => void) {
    if (this.locked || this.punching) {
      onComplete?.();
      return;
    }

    if (!hasAnimation(this.characterId, animType)) {
      onComplete?.();
      return;
    }

    const dir = this.currentDir; // capture direction at start
    const abilityKey = getAnimKey(this.characterId, animType, dir);
    if (!this.scene.anims.exists(abilityKey)) {
      onComplete?.();
      return;
    }

    // Cancel any pending ability animation cleanup
    this.cancelAbilityAnimation();

    this.shooting = true;
    this.holdingShoot = false;
    this.currentAnim = animType as PlayerAnim;

    // Remove any stale listeners
    this.off("animationcomplete", this.handleShootComplete, this);
    this.off("animationcomplete", this.handleAnimComplete, this);

    try {
      this.play(abilityKey);
    } catch {
      this.shooting = false;
      this.currentAnim = "idle";
      onComplete?.();
      return;
    }

    const onAbilityAnimDone = () => {
      // Hold on last frame for holdMs, then restore
      this.anims.pause();
      this.abilityAnimTimer = this.scene.time.delayedCall(holdMs, () => {
        this.abilityAnimTimer = null;
        this.restoreFromAbilityAnimation(dir);
        onComplete?.();
      });
    };

    this.off("animationcomplete", onAbilityAnimDone);
    this.once("animationcomplete", onAbilityAnimDone);

    // Safety timeout: force-reset after animation + hold + 2s buffer
    const safetyMs = 4000 + holdMs;
    this.abilityAnimSafetyTimer = this.scene.time.delayedCall(safetyMs, () => {
      this.abilityAnimSafetyTimer = null;
      if (this.active && this.currentAnim === (animType as PlayerAnim)) {
        this.restoreFromAbilityAnimation(dir);
        onComplete?.();
      }
    });
  }

  /** Restore player state after ability animation. Uses the saved direction so facing
   *  isn't corrupted by movement during the animation. */
  private restoreFromAbilityAnimation(savedDir: Direction) {
    if (!this.active) return;
    this.shooting = false;
    this.holdingShoot = false;
    this.punching = false;
    this.currentAnim = "idle";

    // Restore the direction to what it was when the ability started,
    // unless the player is currently moving (in which case currentDir is already correct)
    const vx = this.body?.velocity?.x ?? 0;
    const vy = this.body?.velocity?.y ?? 0;
    const isMoving = Math.abs(vx) > 1 || Math.abs(vy) > 1;

    if (!isMoving) {
      this.currentDir = savedDir;
    }

    if (this.hasIdleAnim) {
      this.play(getAnimKey(this.characterId, "breathing-idle", this.currentDir), true);
    } else {
      this.setTexture(`${this.characterId}-${this.currentDir}`);
    }
  }

  /** Cancel any in-progress ability animation (for cleanup) */
  cancelAbilityAnimation() {
    if (this.abilityAnimTimer) {
      this.abilityAnimTimer.destroy();
      this.abilityAnimTimer = null;
    }
    if (this.abilityAnimSafetyTimer) {
      this.abilityAnimSafetyTimer.destroy();
      this.abilityAnimSafetyTimer = null;
    }
  }

  private handleShootComplete = () => {
    // Auto weapons: hold on last frame while trigger is held
    if (this.holdingShoot) {
      this.anims.pause();
      return;
    }

    this.shooting = false;
    this.currentAnim = "idle";

    // Resume walk or idle based on current movement
    const vx = this.body?.velocity?.x ?? 0;
    const vy = this.body?.velocity?.y ?? 0;
    const isMoving = Math.abs(vx) > 1 || Math.abs(vy) > 1;

    if (isMoving && this.hasWalkAnim) {
      this.currentAnim = "walk";
      this.play(getAnimKey(this.characterId, "walk", this.currentDir), true);
    } else if (this.hasIdleAnim) {
      this.play(getAnimKey(this.characterId, "breathing-idle", this.currentDir), true);
    } else {
      this.setTexture(`${this.characterId}-${this.currentDir}`);
    }
  };

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
