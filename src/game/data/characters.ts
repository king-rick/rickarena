export interface CharacterDef {
  id: string;
  name: string;
  fullName: string;
  className: string;
  weaponSpecialty: string;
  stats: {
    hp: number;
    damage: number;
    speed: number;
    stamina: number;
    regen: number;
  };
  pixelLabId: string;
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: "rick",
    name: "Rick",
    fullName: "Rick Bruneau",
    className: "Brawler",
    weaponSpecialty: "Fists",
    stats: { hp: 100, damage: 25, speed: 160, stamina: 80, regen: 8 },
    pixelLabId: "d24fa173-9c58-4df6-bdba-40b883b1e59a",
  },
  {
    id: "dan",
    name: "Dan",
    fullName: "Dan Kundy",
    className: "Technician",
    weaponSpecialty: "Shotguns",
    stats: { hp: 100, damage: 15, speed: 150, stamina: 120, regen: 12 },
    pixelLabId: "26a5c8a9-c68d-4a4b-9466-8fa705300d06",
  },
  {
    id: "mason",
    name: "Mason",
    fullName: "Mason Costa",
    className: "Tank",
    weaponSpecialty: "Melee Weapons",
    stats: { hp: 150, damage: 18, speed: 120, stamina: 110, regen: 9 },
    pixelLabId: "dee453bd-8231-42c9-984d-5c3fbf756789",
  },
  {
    id: "pj",
    name: "PJ",
    fullName: "PJ Fulmore",
    className: "Rogue",
    weaponSpecialty: "Pistols",
    stats: { hp: 70, damage: 14, speed: 220, stamina: 100, regen: 10 },
    pixelLabId: "4a24fc8a-3427-4fd5-88ad-90bdcb6bb051",
  },
  {
    id: "jason",
    name: "Jason",
    fullName: "Jason Maloof",
    className: "Demolitionist",
    weaponSpecialty: "Explosives",
    stats: { hp: 85, damage: 10, speed: 150, stamina: 100, regen: 11 },
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
