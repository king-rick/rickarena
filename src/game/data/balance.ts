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

  // Wave system
  waves: {
    intermissionDuration: 30000, // 30 seconds
    baseEnemyCount: 3,
    enemiesPerWave: 2,
    playerCountModifiers: [1.0, 1.5, 2.0, 2.5], // 1-4 players
    statScalePerWave: 0.1, // 10% increase per wave
    fastVariantWave: 4,
    tankVariantWave: 6,
  },

  // Economy
  economy: {
    killReward: { basic: 25, fast: 35, tank: 75 },
    priceInflationPerWave: 0.05,
  },

  // Enemy base stats
  enemies: {
    basic: { hp: 30, damage: 10, speed: 60 },
    fast: { hp: 15, damage: 8, speed: 120 },
    tank: { hp: 90, damage: 18, speed: 40 },
  },
} as const;
