// All tunable game numbers live here. Change balance without touching game logic.

export const BALANCE = {
  // Player
  burnout: {
    duration: 2000, // ms
    speedMultiplier: 0.5,
    damageMultiplier: 0.5,
  },
  stamina: {
    regenDelay: 1000, // ms before stamina starts regenerating
    punchCost: 15,
    sprintCostPerSecond: 20,
  },

  // Combat
  punch: {
    arc: 120, // degrees
    range: 80, // px
    knockback: 100,
  },

  // Wave system — fewer enemies, each one matters
  waves: {
    intermissionEarlyMs: 10000,
    intermissionLateMs: 20000,
    intermissionLateWave: 5,
    // New formula: base + floor(wave * perWave)
    baseEnemyCount: 4,
    enemiesPerWave: 1.2,
    playerCountModifiers: [1.0, 1.5, 2.0, 2.5],
    // Slower stat scaling — fewer enemies but tougher
    hpScalePerWave: 0.08,
    damageScalePerWave: 0.05,
    dogVariantWave: 4,
    tankVariantWave: 6,
    spawnStaggerMs: 1000,
    // Wave composition (ratios by phase)
    composition: {
      // Waves 1-3: all basic
      // Waves 4-5: basic + dogs
      dogsEarly: { basic: 0.60, fast: 0.40, tank: 0 },
      // Waves 6+: basic + dogs + tanks
      full: { basic: 0.35, fast: 0.45, tank: 0.20 },
    },
  },

  // Economy — tight early, loosens slightly mid-game
  economy: {
    killReward: { basic: 10, fast: 8, tank: 50 },
    xpPerKill: { basic: 10, fast: 8, tank: 50 },
    waveCompletionBonus: { base: 30, perWave: 10 }, // $30 + wave * $10
    priceInflationPerWave: 0.10, // 10% per wave
    interestRate: 0.05, // 5% interest on banked cash per intermission
    interestCap: 50, // max $50 interest per wave
  },

  // Shop
  shop: {
    items: [
      { id: "heal", name: "Bandages", desc: "Heal 30 HP", basePrice: 40 },
      { id: "medkit", name: "Medkit", desc: "Heal 80 HP", basePrice: 120 },
      { id: "dmgBoost", name: "Adrenaline", desc: "+5 damage next wave", basePrice: 100 },
      { id: "pistol", name: "Pistol", desc: "12 rounds, accurate", basePrice: 150, unlockWave: 1 },
      { id: "shotgun", name: "Shotgun", desc: "8 shells, spread", basePrice: 350, unlockWave: 4 },
      { id: "smg", name: "SMG", desc: "50 rounds, rapid fire", basePrice: 500, unlockWave: 7 },
      { id: "ammo", name: "Ammo Refill", desc: "Refill current weapon", basePrice: 100 },
      { id: "barricade", name: "Barricade", desc: "Blocks enemies, 120 HP", basePrice: 60 },
      { id: "landmine", name: "Landmine", desc: "AoE explosion on contact", basePrice: 80 },
    ],
  },

  // Weapons
  weapons: {
    pistol: {
      name: "Pistol",
      damage: 10,
      fireRate: 350,
      speed: 600,
      range: 350,
      spread: 0,
      pellets: 1,
      ammo: 12,
      price: 150,
      proficiency: "Pistols",
      dropoff: 0.4,
      auto: false,
    },
    shotgun: {
      name: "Shotgun",
      damage: 12,
      fireRate: 700,
      speed: 400,
      range: 180,
      spread: 18,
      pellets: 5,
      ammo: 8,
      price: 350,
      proficiency: "Shotguns",
      dropoff: 0,
      auto: false,
      knockback: 80,
    },
    smg: {
      name: "SMG",
      damage: 12,
      fireRate: 100,
      speed: 500,
      range: 280,
      spread: 5,
      pellets: 1,
      ammo: 50,
      price: 500,
      proficiency: "Pistols",
      dropoff: 0.6,
      auto: true,
    },
  },
  proficiencyBonus: {
    damageMultiplier: 1.3,
    reloadSpeedMultiplier: 0.7,
    ammoBonus: 1.25,
    critBonus: 0.03,
    generalistMultiplier: 1.1,
    generalistCritBonus: 0.02,
  },

  // Critical hits
  crit: {
    damageMultiplier: 2.0,
    weaponCrit: {
      pistol: 0.05,
      shotgun: 0.02,
      smg: 0.03,
      fists: 0.04,
    },
    closeCritBonus: 0.05,
  },

  // Traps
  traps: {
    spikes: {
      name: "Spike Trap",
      damage: 50,
      uses: 6,
      slowDuration: 800,
      price: 40,
    },
    barricade: {
      name: "Barricade",
      hp: 120,
      price: 60,
    },
    landmine: {
      name: "Landmine",
      damage: 80,
      radius: 100,
      price: 80,
    },
    maxPerType: 5,
    placementRange: 60,
  },

  // Speed cap
  maxSpeedMultiplier: 2.5,

  // RPG Leveling — flat bonuses, not percentages
  leveling: {
    xpFormula: { base: 80, perLevel: 50 }, // First level-up at 80 XP (wave 1)
    buffChoices: 3, // 3 options per level-up
    buffs: {
      strength: {
        basic:    { name: "Strong Arm",        desc: "+3 damage",          flat: 3,  minLevel: 1 },
        advanced: { name: "Heavy Hitter",      desc: "+5 damage",          flat: 5,  minLevel: 5 },
        elite:    { name: "Devastating Force",  desc: "+8 damage",         flat: 8,  minLevel: 9 },
      },
      health: {
        basic:    { name: "Tough Skin",         desc: "+20 max HP",        flat: 20, minLevel: 1 },
        advanced: { name: "Iron Constitution",  desc: "+35 max HP",        flat: 35, minLevel: 5 },
        elite:    { name: "Unkillable",         desc: "+50 max HP",        flat: 50, minLevel: 9 },
      },
      stamina: {
        basic:    { name: "Second Wind",   desc: "+15 stamina, +1 regen",  flat: 15, regenFlat: 1,  minLevel: 1 },
        advanced: { name: "Endurance",     desc: "+25 stamina, +2 regen",  flat: 25, regenFlat: 2,  minLevel: 5 },
        elite:    { name: "Perpetual Motion", desc: "+40 stamina, +3 regen", flat: 40, regenFlat: 3, minLevel: 9 },
      },
      speed: {
        basic:    { name: "Quick Feet", desc: "+8 speed",   flat: 8,  minLevel: 1 },
        advanced: { name: "Fleet",      desc: "+15 speed",  flat: 15, minLevel: 5 },
        elite:    { name: "Blur",       desc: "+22 speed",  flat: 22, minLevel: 9 },
      },
      luck: {
        basic:    { name: "Lucky Strike",    desc: "+3% crit",   flatCrit: 0.03, minLevel: 1 },
        advanced: { name: "Sharp Eye",       desc: "+6% crit",   flatCrit: 0.06, minLevel: 5 },
        elite:    { name: "Death's Touch",   desc: "+10% crit",  flatCrit: 0.10, minLevel: 9 },
      },
      scavenger: {
        basic:    { name: "Scavenger",      desc: "+15% kill $",  killBonus: 0.15, minLevel: 1 },
        advanced: { name: "Looter",         desc: "+25% kill $",  killBonus: 0.25, minLevel: 5 },
        elite:    { name: "War Profiteer",  desc: "+40% kill $",  killBonus: 0.40, minLevel: 9 },
      },
    },
    categoryWeights: { strength: 22, health: 22, stamina: 18, speed: 14, luck: 12, scavenger: 12 } as Record<string, number>,
  },

  // Enemy base stats — fewer but stronger
  enemies: {
    basic: { hp: 45, damage: 20, speed: 50 },
    fast:  { hp: 12, damage: 4,  speed: 120, attackCooldown: 400 },  // dog: glass cannon, fast bites
    tank:  { hp: 200, damage: 25, speed: 30, knockbackResist: 0.7 }, // brute: slow, tanky, hits hard
  },
} as const;
