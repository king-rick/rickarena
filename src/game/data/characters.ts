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
  ultimate: AbilityDef; // R — powerful, long cooldown
  pixelLabId: string;
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: "rick",
    name: "Rick",
    fullName: "Rick Bruneau",
    className: "Brawler",
    weaponSpecialty: "Fists",
    specialtyDesc: "Fists — Half stamina cost on punches, highest melee damage",
    stats: { hp: 100, damage: 25, speed: 160, stamina: 80, regen: 8, punchRange: 50, punchArc: 100, critChance: 0.07 },
    ability: { name: "Superkick", desc: "Devastating superkick with massive damage", cooldown: 15 },
    ultimate: { name: "Fist of Rick", desc: "Charged haymaker with huge forward range and devastating damage", cooldown: 90 },
    pixelLabId: "d24fa173-9c58-4df6-bdba-40b883b1e59a",
  },
  {
    id: "dan",
    name: "Dan",
    fullName: "Dan Kundy",
    className: "Engineer",
    weaponSpecialty: "Generalist", // decent with everything, best at nothing
    specialtyDesc: "Balanced — +10% damage and +2% crit with all weapons",
    stats: { hp: 120, damage: 20, speed: 155, stamina: 130, regen: 14, punchRange: 60, punchArc: 110, critChance: 0.05 },
    ability: { name: "Turret", desc: "Deploy an auto-targeting turret", cooldown: 20 },
    ultimate: { name: "Overcharge", desc: "All turrets and traps get boosted", cooldown: 120 },
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
    stats: { hp: 70, damage: 14, speed: 220, stamina: 100, regen: 10, punchRange: 45, punchArc: 80, critChance: 0.05 },
    ability: { name: "Shadow Step", desc: "Short dash with invincibility frames", cooldown: 8 },
    ultimate: { name: "Dead Eye", desc: "Guaranteed crits for a duration", cooldown: 80 },
    pixelLabId: "4a24fc8a-3427-4fd5-88ad-90bdcb6bb051",
  },
  {
    id: "jason",
    name: "Jason",
    fullName: "Jason Maloof",
    className: "Demolitionist",
    weaponSpecialty: "Explosives",
    specialtyDesc: "Explosives — Landmines and traps deal +30% damage and radius",
    stats: { hp: 85, damage: 10, speed: 150, stamina: 100, regen: 11, punchRange: 45, punchArc: 90, critChance: 0.06 },
    ability: { name: "Frag Grenade", desc: "Throwable explosive with AoE damage", cooldown: 12 },
    ultimate: { name: "Carpet Bomb", desc: "Cluster bomb barrage over a wide area", cooldown: 110 },
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
