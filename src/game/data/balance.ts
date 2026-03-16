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
      { id: "pistol", name: "Pistol", desc: "30 rounds, accurate", basePrice: 75 },
      { id: "shotgun", name: "Shotgun", desc: "16 shells, spread", basePrice: 200 },
      { id: "smg", name: "SMG", desc: "60 rounds, rapid fire", basePrice: 175 },
      { id: "ammo", name: "Ammo Refill", desc: "Refill current weapon", basePrice: 75 },
      { id: "spikes", name: "Spike Trap", desc: "Damages enemies (3 uses)", basePrice: 40 },
      { id: "barricade", name: "Barricade", desc: "Blocks enemies, 80 HP", basePrice: 60 },
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
      price: 75,
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
      price: 200,
      proficiency: "Shotguns",
      dropoff: 0, // no dropoff, already short range
      auto: false, // pump action: one blast per click
    },
    smg: {
      name: "SMG",
      damage: 6,
      fireRate: 120,
      speed: 450,
      range: 250,
      spread: 8,
      pellets: 1,
      ammo: 60,
      price: 175,
      proficiency: "Pistols", // PJ gets bonus here too
      dropoff: 0.5, // 50% damage at max range
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
      damage: 15,
      uses: 3, // breaks after 3 triggers
      slowDuration: 500, // ms enemies are slowed after hitting
      price: 40,
    },
    barricade: {
      name: "Barricade",
      hp: 80,
      price: 60,
    },
    landmine: {
      name: "Landmine",
      damage: 50,
      radius: 80, // AoE explosion radius
      price: 75,
    },
    maxPerType: 5, // max of each trap type on the field
    placementRange: 60, // must be this far from player to prevent stacking on self
  },

  // Enemy base stats
  enemies: {
    basic: { hp: 20, damage: 10, speed: 45 },
    fast: { hp: 15, damage: 8, speed: 120 },
    tank: { hp: 90, damage: 18, speed: 40 },
  },
} as const;
