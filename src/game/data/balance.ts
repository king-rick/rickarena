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

  // Economy — money should always be moderately tight
  economy: {
    killReward: { basic: 10, fast: 20, tank: 40 },
    priceInflationPerWave: 0.05,
  },

  // Shop
  shop: {
    items: [
      { id: "heal", name: "Bandages", desc: "Restore 50% HP", basePrice: 50 },
      { id: "dmgBoost", name: "Adrenaline", desc: "+25% damage next wave", basePrice: 100 },
      { id: "pistol", name: "Pistol", desc: "30 rounds, accurate", basePrice: 100, unlockWave: 1 },
      { id: "shotgun", name: "Shotgun", desc: "16 shells, spread", basePrice: 300, unlockWave: 4 },
      // SMG disabled pending balance pass — weapon data kept in BALANCE.weapons.smg
      // { id: "smg", name: "SMG", desc: "60 rounds, rapid fire", basePrice: 450, unlockWave: 6 },
      { id: "ammo", name: "Ammo Refill", desc: "Refill current weapon", basePrice: 75 },
      { id: "extraClip", name: "Extra Clip", desc: "Double ammo capacity", basePrice: 150 },
      { id: "barricade", name: "Barricade", desc: "Blocks enemies, 120 HP", basePrice: 60 },
      { id: "landmine", name: "Landmine", desc: "AoE explosion on contact", basePrice: 75 },
    ],
  },

  // Weapons
  weapons: {
    pistol: {
      name: "Pistol",
      damage: 8,
      fireRate: 350, // ms between shots
      speed: 600, // projectile px/s
      range: 350, // max travel distance
      spread: 0, // degrees of random spread
      pellets: 1,
      ammo: 30,
      price: 100,
      proficiency: "Pistols", // matches character weaponSpecialty
      dropoff: 0.4, // 40% damage at max range
      auto: false, // semi-auto: one shot per click
    },
    shotgun: {
      name: "Shotgun",
      damage: 8, // per pellet
      fireRate: 700,
      speed: 400,
      range: 180,
      spread: 18, // tight cone
      pellets: 5,
      ammo: 16,
      price: 300,
      proficiency: "Shotguns",
      dropoff: 0, // no dropoff, already short range
      auto: false, // pump action: one blast per click
      knockback: 80, // per pellet, stacks — shotgun creates space
    },
    smg: {
      name: "SMG",
      damage: 12, // shreds at close range
      fireRate: 100, // faster fire rate
      speed: 500,
      range: 280,
      spread: 5, // tight spray
      pellets: 1,
      ammo: 60,
      price: 450,
      proficiency: "Pistols", // PJ gets bonus here too
      dropoff: 0.6, // heavy dropoff rewards close range
      auto: true, // full auto: hold to spray
    },
  },
  proficiencyBonus: {
    damageMultiplier: 1.3, // +30% damage with specialty weapon
    reloadSpeedMultiplier: 0.7, // 30% faster reload
    ammoBonus: 1.25, // 25% more starting ammo
    critBonus: 0.03, // +3% crit chance with specialty weapon
    generalistMultiplier: 1.1, // Dan: +10% damage with everything
    generalistCritBonus: 0.02, // Dan: +2% crit with everything
  },

  // Critical hits
  crit: {
    damageMultiplier: 2.0, // crits do 2x damage
    // Per-weapon base crit chance
    weaponCrit: {
      pistol: 0.05, // 5% — precise weapon
      shotgun: 0.02, // 2% per pellet — low individually but 5 rolls
      smg: 0.03, // 3% — lots of rolls
      fists: 0.04, // 4% — base melee
    },
    // Distance bonus: closer = higher crit (max bonus at point blank)
    closeCritBonus: 0.05, // +5% at point blank, scales to 0% at max range
  },

  // Traps (placeable during intermission)
  traps: {
    spikes: {
      name: "Spike Trap",
      damage: 50, // heavy damage
      uses: 6, // more uses
      slowDuration: 800, // ms enemies are slowed after hitting
      price: 40,
    },
    barricade: {
      name: "Barricade",
      hp: 120, // buffed from 80
      price: 60,
    },
    landmine: {
      name: "Landmine",
      damage: 80, // buffed from 50
      radius: 100, // buffed from 80
      price: 75,
    },
    maxPerType: 5, // max of each trap type on the field
    placementRange: 60, // must be this far from player to prevent stacking on self
  },

  // RPG Leveling
  leveling: {
    xpPerKill: { basic: 10, fast: 18, tank: 35 },
    xpFormula: { base: 150, perLevel: 75 }, // XP_needed = base + (level * perLevel) — slow grind
    buffs: {
      strength: {
        basic:    { name: "Strong Arm",        desc: "+15% damage",         mult: 1.15, minLevel: 1 },
        advanced: { name: "Heavy Hitter",      desc: "+25% damage",         mult: 1.25, minLevel: 5 },
        elite:    { name: "Devastating Force",  desc: "+35% damage",        mult: 1.35, minLevel: 9 },
      },
      health: {
        basic:    { name: "Tough Skin",         desc: "+20% max HP",        mult: 1.20, minLevel: 1 },
        advanced: { name: "Iron Constitution",  desc: "+30% max HP",        mult: 1.30, minLevel: 5 },
        elite:    { name: "Unkillable",         desc: "+40% max HP",        mult: 1.40, minLevel: 9 },
      },
      stamina: {
        basic:    { name: "Second Wind",   desc: "+20% stamina, +15% regen", mult: 1.20, regenMult: 1.15, minLevel: 1 },
        advanced: { name: "Endurance",     desc: "+30% stamina, +25% regen", mult: 1.30, regenMult: 1.25, minLevel: 5 },
        elite:    { name: "Perpetual Motion", desc: "+40% stamina, +35% regen", mult: 1.40, regenMult: 1.35, minLevel: 9 },
      },
      speed: {
        basic:    { name: "Quick Feet", desc: "+12% speed",  mult: 1.12, minLevel: 1 },
        advanced: { name: "Fleet",      desc: "+20% speed", mult: 1.20, minLevel: 5 },
        elite:    { name: "Blur",       desc: "+30% speed", mult: 1.30, minLevel: 9 },
      },
      luck: {
        basic:    { name: "Lucky Strike", desc: "+5% crit chance", flatCrit: 0.05, minLevel: 1 },
      },
    },
    categoryWeights: { strength: 25, health: 25, stamina: 20, speed: 15, luck: 15 } as Record<string, number>,
  },

  // Enemy base stats
  enemies: {
    basic: { hp: 20, damage: 10, speed: 45 },
    fast: { hp: 15, damage: 8, speed: 100 },
    tank: { hp: 90, damage: 18, speed: 40 },
  },
} as const;
