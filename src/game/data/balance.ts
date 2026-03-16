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
    intermissionEarlyMs: 10000, // 10s for waves 1-4
    intermissionLateMs: 20000, // 20s from wave 5+
    intermissionLateWave: 5, // wave where longer intermission kicks in
    baseEnemyCount: 6,
    enemiesPerWave: 3,
    playerCountModifiers: [1.0, 1.5, 2.0, 2.5], // 1-4 players
    statScalePerWave: 0.1, // 10% increase per wave
    fastVariantWave: 4,
    tankVariantWave: 6,
    spawnStaggerMs: 800, // ms between each enemy spawn within a wave
  },

  // Economy
  economy: {
    killReward: { basic: 25, fast: 35, tank: 75 },
    priceInflationPerWave: 0.05,
  },

  // Shop
  shop: {
    items: [
      { id: "heal", name: "First Aid", desc: "Restore 50% HP", basePrice: 50 },
      { id: "fullHeal", name: "Full Heal", desc: "Restore 100% HP", basePrice: 150 },
      { id: "dmgBoost", name: "Adrenaline", desc: "+25% damage next wave", basePrice: 100 },
    ],
  },

  // Enemy base stats
  enemies: {
    basic: { hp: 20, damage: 10, speed: 45 },
    fast: { hp: 15, damage: 8, speed: 120 },
    tank: { hp: 90, damage: 18, speed: 40 },
  },
} as const;
