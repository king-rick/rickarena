import { BALANCE } from "../data/balance";

export type BuffCategory = "strength" | "health" | "stamina" | "speed" | "luck";
export type BuffTier = "basic" | "advanced" | "elite";

export interface AppliedBuff {
  category: BuffCategory;
  tier: BuffTier;
  name: string;
  multiplier: number; // or flatCrit for luck
}

export interface BuffOption {
  category: BuffCategory;
  tier: BuffTier;
  name: string;
  desc: string;
  mult?: number;
  regenMult?: number;
  flatCrit?: number;
}

export interface EffectiveStats {
  damage: number;
  maxHealth: number;
  maxStamina: number;
  speed: number;
  regen: number;
  critChance: number;
}

export class LevelingSystem {
  level = 1;
  xp = 0;
  appliedBuffs: AppliedBuff[] = [];

  private pendingLevelUp = false;
  private buffOptions: BuffOption[] = [];

  /** Callback when level-up triggers — GameScene should pause and show UI */
  onLevelUp?: (level: number, options: BuffOption[]) => void;

  /** Add XP from a kill. Returns true if a level-up was triggered. */
  addXP(amount: number): boolean {
    this.xp += amount;
    const needed = this.xpToNextLevel();
    if (this.xp >= needed) {
      this.xp -= needed;
      this.level++;
      this.pendingLevelUp = true;
      this.buffOptions = this.rollBuffOptions();
      this.onLevelUp?.(this.level, this.buffOptions);
      return true;
    }
    return false;
  }

  /** XP required to reach the next level */
  xpToNextLevel(): number {
    const f = BALANCE.leveling.xpFormula;
    return f.base + this.level * f.perLevel;
  }

  /** XP progress as 0-1 fraction */
  xpProgress(): number {
    return this.xp / this.xpToNextLevel();
  }

  /** Whether the game is waiting for a buff selection */
  isPendingLevelUp(): boolean {
    return this.pendingLevelUp;
  }

  /** Re-arm the pending state for queued level-ups (called by GameScene when dequeuing) */
  setPending(options: BuffOption[]) {
    this.pendingLevelUp = true;
    this.buffOptions = options;
  }

  /** Get the current buff options (only valid during pending level-up) */
  getBuffOptions(): BuffOption[] {
    return this.buffOptions;
  }

  /** Player selects a buff (index 0 or 1) */
  selectBuff(index: number): AppliedBuff | null {
    if (!this.pendingLevelUp || index < 0 || index >= this.buffOptions.length) return null;

    const option = this.buffOptions[index];
    const buff: AppliedBuff = {
      category: option.category,
      tier: option.tier,
      name: option.name,
      multiplier: option.mult ?? option.flatCrit ?? 1,
    };
    this.appliedBuffs.push(buff);
    this.pendingLevelUp = false;
    this.buffOptions = [];
    return buff;
  }

  /** Calculate effective stats from base stats with all buffs applied */
  getEffectiveStats(base: {
    damage: number;
    hp: number;
    stamina: number;
    speed: number;
    regen: number;
    critChance: number;
  }): EffectiveStats {
    let damage = base.damage;
    let maxHealth = base.hp;
    let maxStamina = base.stamina;
    let speed = base.speed;
    let regen = base.regen;
    let critChance = base.critChance;

    for (const buff of this.appliedBuffs) {
      switch (buff.category) {
        case "strength":
          damage *= buff.multiplier;
          break;
        case "health":
          maxHealth *= buff.multiplier;
          break;
        case "stamina": {
          maxStamina *= buff.multiplier;
          // Find the regen multiplier from the balance data
          const tierData = (BALANCE.leveling.buffs.stamina as any)[buff.tier];
          if (tierData?.regenMult) {
            regen *= tierData.regenMult;
          }
          break;
        }
        case "speed":
          speed *= buff.multiplier;
          break;
        case "luck":
          critChance += buff.multiplier; // flatCrit stored as multiplier
          break;
      }
    }

    // Enforce speed cap
    const maxSpeed = base.speed * BALANCE.maxSpeedMultiplier;
    if (speed > maxSpeed) speed = maxSpeed;

    return {
      damage: Math.floor(damage),
      maxHealth: Math.floor(maxHealth),
      maxStamina: Math.floor(maxStamina),
      speed: Math.floor(speed),
      regen: Math.floor(regen * 10) / 10, // one decimal
      critChance,
    };
  }

  /** Count how many buffs the player has in a given category */
  buffCountByCategory(category: BuffCategory): number {
    return this.appliedBuffs.filter(b => b.category === category).length;
  }

  // ------- Private -------

  private rollBuffOptions(): BuffOption[] {
    const categories = Object.keys(BALANCE.leveling.categoryWeights) as BuffCategory[];
    const weights = BALANCE.leveling.categoryWeights;

    // Weighted random pick for first category
    const cat1 = this.weightedPick(categories, weights);

    // Second must be different
    const remaining = categories.filter(c => c !== cat1);
    const cat2 = this.weightedPick(remaining, weights);

    const opt1 = this.getBestTierForCategory(cat1);
    const opt2 = this.getBestTierForCategory(cat2);

    const options: BuffOption[] = [];
    if (opt1) options.push(opt1);
    if (opt2) options.push(opt2);

    return options;
  }

  private getBestTierForCategory(category: BuffCategory): BuffOption | null {
    const catData = BALANCE.leveling.buffs[category] as Record<string, any>;
    const tiers: BuffTier[] = ["elite", "advanced", "basic"];

    for (const tier of tiers) {
      const data = catData[tier];
      if (data && this.level >= data.minLevel) {
        return {
          category,
          tier,
          name: data.name,
          desc: data.desc,
          mult: data.mult,
          regenMult: data.regenMult,
          flatCrit: data.flatCrit,
        };
      }
    }
    return null;
  }

  private weightedPick(categories: BuffCategory[], weights: Record<string, number>): BuffCategory {
    let total = 0;
    for (const c of categories) total += weights[c] ?? 0;
    let roll = Math.random() * total;
    for (const c of categories) {
      roll -= weights[c] ?? 0;
      if (roll <= 0) return c;
    }
    return categories[categories.length - 1];
  }
}
