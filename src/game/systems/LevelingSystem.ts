import { BALANCE } from "../data/balance";

export type BuffCategory = "strength" | "health" | "stamina" | "speed" | "luck" | "scavenger";
export type BuffTier = "basic" | "advanced" | "elite";

export interface AppliedBuff {
  category: BuffCategory;
  tier: BuffTier;
  name: string;
  flat: number; // flat bonus value (damage, hp, stamina, speed, crit, or kill bonus)
  regenFlat?: number; // stamina regen bonus
}

export interface BuffOption {
  category: BuffCategory;
  tier: BuffTier;
  name: string;
  desc: string;
  flat?: number;
  regenFlat?: number;
  flatCrit?: number;
  killBonus?: number;
}

export interface EffectiveStats {
  damage: number;
  maxHealth: number;
  maxStamina: number;
  speed: number;
  regen: number;
  critChance: number;
  killBonusFlat: number; // flat $ bonus on kill rewards
}

export class LevelingSystem {
  level = 1;
  xp = 0;
  appliedBuffs: AppliedBuff[] = [];

  private pendingLevelUp = false;
  private buffOptions: BuffOption[] = [];
  private leveledUpThisWave = false;

  /** Callback when level-up triggers — GameScene should pause and show UI */
  onLevelUp?: (level: number, options: BuffOption[]) => void;

  /** Add XP from a kill. Returns true if a level-up was triggered. */
  addXP(amount: number): boolean {
    this.xp += amount;
    const needed = this.xpToNextLevel();
    if (this.xp >= needed && !this.leveledUpThisWave) {
      this.xp -= needed;
      this.level++;
      this.pendingLevelUp = true;
      this.leveledUpThisWave = true;
      this.buffOptions = this.rollBuffOptions();
      this.onLevelUp?.(this.level, this.buffOptions);
      return true;
    }
    // Cap XP at threshold if already leveled this wave
    if (this.leveledUpThisWave && this.xp >= needed) {
      this.xp = needed - 1;
    }
    return false;
  }

  /** Call at the start of each new wave to allow leveling again */
  resetWaveLevelCap() {
    this.leveledUpThisWave = false;
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

  isPendingLevelUp(): boolean {
    return this.pendingLevelUp;
  }

  setPending(options: BuffOption[]) {
    this.pendingLevelUp = true;
    this.buffOptions = options;
  }

  getBuffOptions(): BuffOption[] {
    return this.buffOptions;
  }

  /** Player selects a buff */
  selectBuff(index: number): AppliedBuff | null {
    if (!this.pendingLevelUp || index < 0 || index >= this.buffOptions.length) return null;

    const option = this.buffOptions[index];
    const buff: AppliedBuff = {
      category: option.category,
      tier: option.tier,
      name: option.name,
      flat: option.flat ?? option.flatCrit ?? option.killBonus ?? 0,
      regenFlat: option.regenFlat,
    };
    this.appliedBuffs.push(buff);
    this.pendingLevelUp = false;
    this.buffOptions = [];
    return buff;
  }

  /** Calculate effective stats from base stats with all flat buffs applied */
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
    let killBonusFlat = 0;

    // Track buff count per category for soft cap diminishing returns
    const catCount: Record<string, number> = {};
    const softCap = BALANCE.buffSoftCap;

    for (const buff of this.appliedBuffs) {
      const count = (catCount[buff.category] ?? 0) + 1;
      catCount[buff.category] = count;
      // Buffs beyond the soft cap give 50% value
      const mult = count > softCap ? 0.5 : 1.0;

      switch (buff.category) {
        case "strength":
          damage += buff.flat * mult;
          break;
        case "health":
          maxHealth += buff.flat * mult;
          break;
        case "stamina":
          maxStamina += buff.flat * mult;
          if (buff.regenFlat) regen += buff.regenFlat * mult;
          break;
        case "speed":
          speed += buff.flat * mult;
          break;
        case "luck":
          critChance += buff.flat * mult;
          break;
        case "scavenger":
          killBonusFlat += buff.flat * mult;
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
      regen: Math.floor(regen * 10) / 10,
      critChance,
      killBonusFlat,
    };
  }

  buffCountByCategory(category: BuffCategory): number {
    return this.appliedBuffs.filter(b => b.category === category).length;
  }

  // ------- Private -------

  private rollBuffOptions(): BuffOption[] {
    const categories = Object.keys(BALANCE.leveling.categoryWeights) as BuffCategory[];
    const weights = BALANCE.leveling.categoryWeights;
    const numChoices = BALANCE.leveling.buffChoices;

    const picked: BuffCategory[] = [];
    const options: BuffOption[] = [];

    for (let i = 0; i < numChoices; i++) {
      const remaining = categories.filter(c => !picked.includes(c));
      if (remaining.length === 0) break;
      const cat = this.weightedPick(remaining, weights);
      picked.push(cat);
      const opt = this.getBestTierForCategory(cat);
      if (opt) options.push(opt);
    }

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
          flat: data.flat,
          regenFlat: data.regenFlat,
          flatCrit: data.flatCrit,
          killBonus: data.killBonus,
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
