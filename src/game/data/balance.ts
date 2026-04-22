// All tunable game numbers live here. Change balance without touching game logic.

export const BALANCE = {
  // Player
  burnout: {
    duration: 2000, // ms
    speedMultiplier: 0.5,
    damageMultiplier: 0.5,
  },
  stamina: {
    regenDelay: 1200, // ms before stamina starts regenerating
    punchCost: 9,
    sprintCostPerSecond: 10,
    baseRegen: 8, // per second (overrides character regen when used)
  },

  // Combat
  punch: {
    arc: 120, // degrees
    range: 80, // px
    knockback: 100,
    cooldownMs: 350, // minimum ms between punches regardless of animation speed
    burnoutCooldownMs: 600, // slower punching when burned out
  },

  // Buff soft caps — buffs beyond this count per category give 50% value
  buffSoftCap: 3,

  // Wave system — fewer enemies, each one matters
  waves: {
    intermissionEarlyMs: 10000,
    intermissionLateMs: 20000,
    intermissionLateWave: 5,
    // New formula: base + floor(wave * perWave)
    baseEnemyCount: 3,
    enemiesPerWave: 1.4,
    playerCountModifiers: [1.0, 1.5, 2.0, 2.5],
    // WaW-style scaling — exponential HP, flat damage, speed tiers
    // Waves 1-9: linear HP growth. Wave 10+: exponential (1.1x per wave)
    hpLinearPerWave: 0.0,        // no HP scaling — pressure comes from speed + volume, not sponges
    hpExponentialBase: 1.1,      // 1.1^(wave-9) multiplier (wave 10+)
    damageScalePerWave: 0.0,     // flat damage — pressure comes from speed + volume
    // Speed tiers: waves 1-3 all shamblers, 4-6 mixed, 7+ mostly runners
    speedTierWaves: { jogStart: 4, runStart: 7 },
    // % of zombies at each speed tier per wave phase
    speedMix: {
      early:  { shamble: 0.9, jog: 0.1, run: 0.0 },   // waves 1-3: mostly shamblers, gentle ramp
      mid:    { shamble: 0.2, jog: 0.5, run: 0.3 },    // waves 4-6
      late:   { shamble: 0.1, jog: 0.3, run: 0.6 },    // waves 7-9
      swarm:  { shamble: 0.0, jog: 0.15, run: 0.85 },  // waves 10+
    },
    bossVariantWave: 7,
    spawnStaggerMs: 600,
    // SCARYBOI — recurring villain, appears randomly after wave 5
    // Must appear 2x in waves 5-13, 2x in waves 14-20. Cannot appear back-to-back.
    bossSpawn: {
      firstEligibleWave: 5,
      // Encounter system: flee at 50% → reappear at 75% → flee at 25% → reappear at 50% → fight to death
    },
  },

  // Economy — tight early, loosens slightly mid-game
  economy: {
    killReward: { basic: 12, fast: 10, boss: 100, mason: 500 },
    xpPerKill: { basic: 10, fast: 8, boss: 100, mason: 500 },
    waveCompletionBonus: { base: 30, perWave: 10 }, // $30 + wave * $10
    priceInflationPerWave: 0.05, // 5% per wave
    interestRate: 0.05, // 5% interest on banked cash per intermission
    interestCap: 50, // max $50 interest per wave
  },

  // Shop
  shop: {
    items: [
      { id: "heal", name: "Bandages", desc: "Heal 30 HP", basePrice: 40 },
      { id: "medkit", name: "Medkit", desc: "Heal 80 HP", basePrice: 120 },
      { id: "dmgBoost", name: "Adrenaline", desc: "+5 damage next wave", basePrice: 100 },
      // Pistol is a starting weapon — not sold in shop
      { id: "shotgun", name: "Shotgun", desc: "8 shells, spread", basePrice: 350, unlockWave: 4 },
      { id: "smg", name: "SMG", desc: "50 rounds, rapid fire", basePrice: 500, unlockWave: 7 },
      { id: "ammo_light", name: "Light Ammo", desc: "+2 clips (pistol & SMG)", basePrice: 75 },
      { id: "ammo_shotgun", name: "Shotgun Shells", desc: "+2 shotgun clips", basePrice: 80, unlockWave: 4 },
      { id: "barricade", name: "Barricade", desc: "Blocks enemies, 300 HP", basePrice: 30 },
      { id: "landmine", name: "Landmine", desc: "AoE explosion on contact", basePrice: 40 },
      { id: "grenade", name: "Grenade", desc: "Throwable explosive (max 3)", basePrice: 60 },
    ],
  },

  // Weapons — magazine + reserve clip system
  weapons: {
    pistol: {
      name: "Pistol",
      damage: 17,
      fireRate: 350,
      speed: 600,
      range: 350,
      spread: 0,
      pellets: 1,
      magazineSize: 8,
      totalClips: 6, // 6 clips of 8 = 48 max rounds (start with 4 clips, buy more)
      reloadMs: 1200,
      price: 150,
      proficiency: "Pistols",
      dropoff: 0,
      auto: false,
      knockback: 0,
    },
    shotgun: {
      name: "Shotgun",
      damage: 28,
      fireRate: 900,
      speed: 400,
      range: 200,
      spread: 18,
      pellets: 7,
      magazineSize: 6,
      totalClips: 2, // 2 clips of 6 = 12 total shells
      reloadMs: 1800,
      price: 350,
      proficiency: "Shotguns",
      dropoff: 0,
      auto: false,
      knockback: 140,
    },
    smg: {
      name: "SMG",
      damage: 14,
      fireRate: 100,
      speed: 500,
      range: 280,
      spread: 5,
      pellets: 1,
      magazineSize: 30,
      totalClips: 2, // 2 clips of 30 = 60 total rounds
      reloadMs: 1500,
      price: 500,
      proficiency: "Pistols",
      dropoff: 0.7, // more dropoff at range
      closeRangeBonus: 1.4, // 40% more damage at point blank, scales down to 1.0 at mid-range
      auto: true,
      knockback: 20,
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
    damageMultiplier: 4.0,
    critPerLevel: 0.005, // +0.5% crit per level
    weaponCrit: {
      pistol: 0,
      shotgun: 0,
      smg: 0,
      fists: 0,
    },
    closeCritBonus: 0,
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
      hp: 300,
      price: 30,
    },
    landmine: {
      name: "Landmine",
      damage: 200,
      radius: 80,
      price: 40,
    },
    maxPerType: 5,
    placementRange: 60,
  },

  // Grenades
  grenade: {
    damage: 150,
    radius: 100,           // px AoE
    knockback: 150,
    maxRange: 250,         // px max throw distance
    flightMs: 500,         // travel time
    fuseMs: 200,           // delay after landing before detonation
    arcPeakPx: 25,         // fake parabolic height offset
    throwLockMs: 400,      // player locked from shooting during throw animation
    startCount: 1,         // grenades at game start
    maxCount: 3,           // max carry
    shopPrice: 60,
    aimThresholdMs: 150,   // hold time before aiming line appears
  },

  // Speed cap
  maxSpeedMultiplier: 2.5,

  // RPG Leveling — flat bonuses, not percentages
  leveling: {
    xpFormula: { base: 80, perLevel: 50 }, // First level-up at 80 XP (wave 1)
    buffChoices: 3, // 3 options per level-up
    buffs: {
      strength: {
        basic:    { name: "Strength",           desc: "+3 damage",          flat: 3,  minLevel: 1 },
        advanced: { name: "Strength II",        desc: "+5 damage",          flat: 5,  minLevel: 5 },
        elite:    { name: "Strength III",       desc: "+8 damage",         flat: 8,  minLevel: 9 },
      },
      health: {
        basic:    { name: "Health",              desc: "+20 max HP",        flat: 20, minLevel: 1 },
        advanced: { name: "Health II",           desc: "+35 max HP",        flat: 35, minLevel: 5 },
        elite:    { name: "Health III",          desc: "+50 max HP",        flat: 50, minLevel: 9 },
      },
      stamina: {
        basic:    { name: "Stamina",        desc: "+15 stamina, +1 regen",  flat: 15, regenFlat: 1,  minLevel: 1 },
        advanced: { name: "Stamina II",    desc: "+25 stamina, +2 regen",  flat: 25, regenFlat: 2,  minLevel: 5 },
        elite:    { name: "Stamina III",   desc: "+40 stamina, +3 regen", flat: 40, regenFlat: 3, minLevel: 9 },
      },
      speed: {
        basic:    { name: "Speed",       desc: "+8 speed",   flat: 8,  minLevel: 1 },
        advanced: { name: "Speed II",   desc: "+15 speed",  flat: 15, minLevel: 5 },
        elite:    { name: "Speed III",  desc: "+22 speed",  flat: 22, minLevel: 9 },
      },
      luck: {
        basic:    { name: "Luck",             desc: "+3% crit",   flatCrit: 0.03, minLevel: 1 },
        advanced: { name: "Luck II",          desc: "+6% crit",   flatCrit: 0.06, minLevel: 5 },
        elite:    { name: "Luck III",         desc: "+10% crit",  flatCrit: 0.10, minLevel: 9 },
      },
      scavenger: {
        basic:    { name: "Scavenger",       desc: "+15% kill $",  killBonus: 0.15, minLevel: 1 },
        advanced: { name: "Scavenger II",   desc: "+25% kill $",  killBonus: 0.25, minLevel: 5 },
        elite:    { name: "Scavenger III",  desc: "+40% kill $",  killBonus: 0.40, minLevel: 9 },
      },
    },
    categoryWeights: { strength: 22, health: 22, stamina: 18, speed: 14, luck: 12, scavenger: 12 } as Record<string, number>,
  },

  // Enemy base stats — WaW-style scaling (exponential HP, speed tiers, flat damage)
  enemies: {
    basic: { hp: 50, damage: 20, speed: 50, jogSpeed: 75, runSpeed: 100 },
    fast:  {
      hp: 30, damage: 12, speed: 115, attackCooldown: 400,  // dog: fragile but fast when aggro
      roamSpeed: 30,           // slow idle wander on grass
      aggroRange: 130,         // px — must be close to spot player (sneakable)
      deaggroRange: 350,       // px — lose interest quickly
      packRange: 150,          // px — dogs within this range of each other pack up
      maxOnMap: 5,             // never more than 5 dogs alive
      respawnMs: 15000,        // 15s respawn after death
      hpScalePerWave: 0.08,    // +8% HP per wave (was 10%)
      dmgScalePerWave: 0.05,   // +5% damage per wave (was 6%)
    },
    boss:  {
      hp: 1300,
      speed: 40,           // stalking walk
      runSpeed: 90,        // chasing
      leapSpeed: 150,      // burst leap
      knockbackResist: 0.8,
      attacks: {
        leadJab:    { damage: 15, range: 60,  cooldown: 800  },  // quick hit
        crossPunch: { damage: 35, range: 70,  cooldown: 2000, knockback: 120 }, // heavy hit
        fireball:   { damage: 15, range: 400, cooldown: 3000, projectileSpeed: 300 }, // ranged
        leapAttack: { damage: 30, range: 250, cooldown: 4000 }, // gap closer
      },
      backflipThreshold: 0.25, // backflips away below 25% HP
    },
    mason: {
      hp: 2000,
      speed: 35,           // slow menacing walk (only moves when player is off-screen)
      knockbackResist: 0.98,
      attacks: {
        leadJab:     { damage: 20,  range: 65,  cooldown: 500  },
        fireBreath:  { damage: 55,  range: 120, cooldown: 3500, coneAngle: 60 },  // phase 2 only
        jumpAndLand: { range: 300, cooldown: 3500, landRadius: 80, stunDuration: 800 },  // stuns, no damage
        boomBox:     { damage: 30,  range: 250, cooldown: 5000 },  // phase 1+
      },
    },
  },
} as const;
