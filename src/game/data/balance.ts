// All tunable game numbers live here. Change balance without touching game logic.

export const BALANCE = {
  // Player
  burnout: {
    duration: 2000, // ms
    speedMultiplier: 0.5,
    damageMultiplier: 0.5,
  },
  stamina: {
    regenDelay: 600, // ms before stamina starts regenerating
    punchCost: 9,
    sprintCostPerSecond: 7,
    baseRegen: 8, // per second while walking (overrides character regen when used)
    idleRegenMultiplier: 1.8, // regen is 80% faster when standing still
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
      early:  { shamble: 0.5, jog: 0.4, run: 0.1 },   // waves 1-3: mixed, feels threatening early
      mid:    { shamble: 0.15, jog: 0.5, run: 0.35 },  // waves 4-6
      late:   { shamble: 0.05, jog: 0.3, run: 0.65 },  // waves 7-9
      swarm:  { shamble: 0.0, jog: 0.15, run: 0.85 },  // waves 10+
    },
    bossVariantWave: 7,
    spawnStaggerMs: 600,
    // SCARYBOI — 3 encounters, HP/flee tied to encounter ORDER (not location)
    bossEncountersByOrder: [
      { hpPercent: 1.0,  fleeThreshold: 0.5,  gracePeriodMs: 500 },   // 1st encounter: brief pause then aggro
      { hpPercent: 0.75, fleeThreshold: 0.25, gracePeriodMs: 0 },     // 2nd encounter: immediate aggro
      { hpPercent: 1.0,  fleeThreshold: 0,    gracePeriodMs: 0 },     // 3rd encounter (estate): immediate, fight to death
    ],
  },

  // Economy — flat numbers, no percentages
  economy: {
    killReward: { basic: 15, fast: 15, boss: 100, mason: 500 },
    meleeBonus: 5, // flat $5 extra for melee kills (so $20 melee vs $15 ranged)
    xpPerKill: { basic: 10, fast: 10, boss: 100, mason: 500 },
    waveCompletionBonus: { earlyBonus: 50, lateBonus: 100, lateWave: 6 }, // $50 waves 1-5, $100 waves 6+
    priceInflationPerWave: 0, // no inflation — prices stay clean
    interestRate: 0.05, // 5% interest on banked cash per intermission
    interestCap: 50, // max $50 interest per wave
    doorCost: 300, // all doors cost $300
    machineCost: 250, // zyn & keg cost $250
  },

  // Shop
  shop: {
    items: [
      { id: "first_aid", name: "Bandage", desc: "Heal 25 HP", basePrice: 50 },
      { id: "ammo_light", name: "Light Ammo", desc: "+2 clips (pistol & SMG)", basePrice: 75 },
      { id: "ammo_shotgun", name: "Shotgun Shells", desc: "+2 shotgun clips", basePrice: 80 },
      { id: "ammo_heavy", name: "Heavy Ammo", desc: "+2 assault rifle mags", basePrice: 100 },
      { id: "landmine", name: "Landmine", desc: "AoE explosion on contact", basePrice: 40 },
      { id: "grenade", name: "Grenade", desc: "Throwable explosive (max 3)", basePrice: 60 },
      // Weapons — shotgun (car trunk) + SMG (wired elsewhere) not in shop
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
      magazineSize: 2,
      totalClips: 8, // 8 clips of 2 = 16 total shells (double barrel)
      reloadMs: 2200,
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
    rpg: {
      name: "RPG",
      damage: 500,
      fireRate: 1500,
      speed: 200,       // slow projectile
      range: 500,
      spread: 0,
      pellets: 1,
      magazineSize: 1,
      totalClips: 2,     // 2 rockets total
      reloadMs: 2200,
      price: 800,
      proficiency: "Shotguns",
      dropoff: 0,
      auto: false,
      knockback: 200,
      aoeRadius: 100,    // explosion AoE radius
      selfDamage: 20,    // damage to player if too close
    },
    assault_rifle: {
      name: "Assault Rifle",
      damage: 22,
      fireRate: 140,     // slower than SMG (100ms)
      speed: 550,
      range: 320,
      spread: 4,
      pellets: 1,
      magazineSize: 50,
      totalClips: 2,     // 2x50rd mags = 100 total rounds
      reloadMs: 2000,
      price: 650,
      proficiency: "Pistols",
      dropoff: 0.3,
      auto: true,
      knockback: 30,
      speedPenalty: 0.9,  // 10% movement slow while equipped
    },
  },
  proficiencyBonus: {
    damageMultiplier: 1.3,
    reloadSpeedMultiplier: 0.7,
    ammoBonus: 1.25,
    critBonus: 0,
    generalistMultiplier: 1.1,
    generalistCritBonus: 0,
  },

  // Critical hits
  crit: {
    damageMultiplier: 4.0,
    critPerLevel: 0, // disabled — headshots from buffs only
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
    maxRange: 80,          // px max throw distance (~2.5 tiles)
    flightMs: 500,         // travel time
    fuseMs: 200,           // delay after landing before detonation
    arcPeakPx: 25,         // fake parabolic height offset
    throwLockMs: 400,      // player locked from shooting during throw animation
    startCount: 0,         // grenades at game start
    maxCount: 3,           // max carry
    shopPrice: 60,
    aimThresholdMs: 150,   // hold time before aiming line appears
  },

  // Bandages
  bandage: {
    healAmount: 25,
    maxStack: 5,
    deskGiveCount: 3,    // how many the med desk gives
  },

  // Rudy's desks
  desks: {
    interactRange: 60,   // px
    restockInterval: 5,  // restock every N waves (wave 6, 11, 16, ...)
    ammoDesk: {
      pistolRounds: 8,   // 1 mag
      shotgunShells: 6,  // 3 clips of 2
    },
    equipmentDesk: {
      grenades: 1,
      landmines: 1,
    },
  },

  // Detection — sight + sound system (Phase 4A)
  detection: {
    zombieVisionRange: 150,          // px — max distance enemies can see the player
    zombieVisionCone: 120,           // degrees — total cone (60 each side of facing)
    gunfireSoundRadius: 300,         // px — enemies within this hear gunshots
    sprintSoundRadius: 150,          // px — enemies within this hear sprinting
    sprintSoundInterval: 500,        // ms between sprint noise emissions
    crouchModifier: 0.15,            // multiply all detection ranges when player crouches (nearly invisible)
    flashlightOffModifier: 0.35,     // multiply vision range when flashlight is off (very hard to see)
    flashlightBeamAlertRange: 120,   // px — enemies in flashlight beam cone get alerted
    wanderSpeed: 0.3,                // fraction of base speed for unaware wandering
    wanderDirChangeMin: 1000,        // ms min before picking new wander direction
    wanderDirChangeMax: 4000,        // ms max
    wanderPauseChance: 0.2,          // probability of pausing when changing direction
    wanderPauseMin: 2000,            // ms min pause duration
    wanderPauseMax: 5000,            // ms max pause duration
    aggroTimeoutMs: 4000,            // ms without seeing player before giving up chase
  },

  // Proximity spawning — player-centric zombie population
  spawning: {
    ambientCount: 10,                // target zombies alive near the player
    ambientRadius: 600,              // px — zombies within this count toward ambient
    spawnRingMin: 350,               // px — min distance from player for new spawns (off-screen)
    spawnRingMax: 550,               // px — max distance from player for new spawns
    spawnStaggerMs: 600,             // ms between individual spawns
    despawnDistance: 900,             // px — unaware zombies further than this despawn
    despawnCheckMs: 2000,            // ms between despawn sweeps
    globalCap: 40,                   // hard cap on total alive enemies
    // Noise surge spawning — only car alarm spawns extras
    sprintSurge: 1,                  // extra zombies spawned from sustained sprinting
    sprintSurgeCooldownMs: 5000,     // min ms between sprint surges
    carAlarmSurge: 5,                // extra zombies from car alarm
    carAlarmSurgeMs: 4000,           // spawn them over this duration
    surgeSpawnAlerted: true,         // surge spawns start in "chasing" state
  },

  // Speed cap
  maxSpeedMultiplier: 1.5,

  // RPG Leveling — flat bonuses, not percentages
  leveling: {
    xpFormula: { base: 80, perLevel: 50, quadratic: 15 }, // 80 + 50*L + 15*L^2 — steep late-game
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
        basic:    { name: "Luck",             desc: "+2% headshot",   flatCrit: 0.02, minLevel: 1 },
        advanced: { name: "Luck II",          desc: "+4% headshot",   flatCrit: 0.04, minLevel: 5 },
        elite:    { name: "Luck III",         desc: "+6% headshot",  flatCrit: 0.06, minLevel: 9 },
      },
      scavenger: {
        basic:    { name: "Scavenger",       desc: "+$5 per kill",   killBonus: 5, minLevel: 1 },
        advanced: { name: "Scavenger II",   desc: "+$8 per kill",   killBonus: 8, minLevel: 5 },
        elite:    { name: "Scavenger III",  desc: "+$12 per kill",  killBonus: 12, minLevel: 9 },
      },
    },
    categoryWeights: { strength: 22, health: 22, stamina: 18, speed: 14, luck: 12, scavenger: 12 } as Record<string, number>,
  },

  // Enemy base stats — WaW-style scaling (exponential HP, speed tiers, flat damage)
  enemies: {
    biteCooldownMs: 1200, // per-enemy cooldown — same zombie can't bite again for 1.2s
    basic: { hp: 33, damage: 20, speed: 60, jogSpeed: 80, runSpeed: 105 },
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
      speed: 55,           // stalking walk (faster close)
      runSpeed: 120,       // sprint at player aggressively
      knockbackResist: 0.8,
      attacks: {
        punchCombo: { damage: 30, range: 70,  cooldown: 1100,  knockback: 120 },
        fireball:   { damage: 8, range: 400, cooldown: 2200, projectileSpeed: 280 },
      },
      backflipCooldown: 2000, // faster disengage-reengage loop
    },
    mason: {
      hp: 2000,
      speed: 35,           // slow menacing walk (only moves when player is off-screen)
      knockbackResist: 0.98,
      attacks: {
        leadJab:     { damage: 20,  range: 65,  cooldown: 500  },
        fireBreath:  { damage: 55,  range: 120, cooldown: 3500, coneAngle: 60 },  // phase 2 only
        jumpAndLand: { range: 300, cooldown: 3500, landRadius: 100, stunDuration: 800 },  // stuns, no damage
        boomBox:     { damage: 30,  range: 250, cooldown: 5000 },  // phase 1+
      },
    },
  },
} as const;
