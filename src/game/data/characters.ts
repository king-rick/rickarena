export interface AbilityDef {
  name: string;
  desc: string;
  cooldown: number; // seconds (placeholder — tuning comes later)
}

export interface CharacterDef {
  id: string;
  name: string;
  fullName: string;
  className: string;
  weaponSpecialty: string;
  specialtyDesc: string;
  stats: {
    hp: number;
    damage: number;
    speed: number;
    stamina: number;
    regen: number;
    punchRange: number; // px — how far the melee arc reaches
    punchArc: number; // degrees — width of the swing
    critChance: number; // base crit chance (0-1), stacks with weapon + proficiency + distance
  };
  ability: AbilityDef; // Q — unique character ability
  pixelLabId: string;
}

/** Uniform base stats — all characters start identical. Differentiation comes from abilities and weapon specialties. */
export const BASE_STATS = {
  hp: 100,
  damage: 18,
  speed: 160,
  stamina: 100,
  regen: 10,
  punchRange: 50,
  punchArc: 100,
  critChance: 0.05,
};

export const CHARACTERS: CharacterDef[] = [
  {
    id: "rick",
    name: "Rick",
    fullName: "Rick Bruneau",
    className: "Brawler",
    weaponSpecialty: "Fists",
    specialtyDesc: "Fists — Half stamina cost on punches, highest melee damage",
    stats: { ...BASE_STATS },
    ability: { name: "Superkick", desc: "Devastating superkick with massive knockback and damage", cooldown: 15 },
    pixelLabId: "d24fa173-9c58-4df6-bdba-40b883b1e59a",
  },
  {
    id: "dan",
    name: "Dan",
    fullName: "Dan Kundy",
    className: "Engineer",
    weaponSpecialty: "Generalist",
    specialtyDesc: "Balanced — +10% damage and +2% crit with all weapons",
    stats: { ...BASE_STATS },
    ability: { name: "EMP Grenade", desc: "Throws a grenade that stuns all enemies in the blast radius", cooldown: 18 },
    pixelLabId: "26a5c8a9-c68d-4a4b-9466-8fa705300d06",
  },
  // Mason Costa — removed from playable roster temporarily (sprite rework in progress)
  // pixelLabId: "9b86d8ed-7725-43c3-9d6c-409501b5f70d" (v3)
  {
    id: "pj",
    name: "PJ",
    fullName: "PJ Fulmore",
    className: "Sharpshooter",
    weaponSpecialty: "Pistols",
    specialtyDesc: "Pistols — +30% damage, +3% crit, fastest draw in the group",
    stats: { ...BASE_STATS },
    ability: { name: "Katana Slash", desc: "Wide devastating katana swing that cleaves everything in front", cooldown: 12 },
    pixelLabId: "4a24fc8a-3427-4fd5-88ad-90bdcb6bb051",
  },
  {
    id: "jason",
    name: "Jason",
    fullName: "Jason Maloof",
    className: "Demolitionist",
    weaponSpecialty: "Explosives",
    specialtyDesc: "Explosives — Landmines and traps deal +30% damage and radius",
    stats: { ...BASE_STATS },
    ability: { name: "Smokescreen", desc: "Smoke cloud that slows and drains enemies, light heal for 5s", cooldown: 20 },
    pixelLabId: "5cc951c4-ef30-49a1-8136-8b2fdb3baec0",
  },
];

export const DIRECTIONS = [
  "north",
  "north-east",
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
] as const;

export type Direction = (typeof DIRECTIONS)[number];
