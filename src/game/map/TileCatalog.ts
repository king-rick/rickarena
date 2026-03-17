import Phaser from "phaser";
import type { LayerType } from "./MapSaveFormat";

// ─── Tile Definition ───

export interface CollisionDef {
  shape: "rect" | "circle";
  offsetX: number;
  offsetY: number;
  width?: number;
  height?: number;
  radius?: number;
}

export type TileCategory =
  | "ground-grass"
  | "ground-stone"
  | "ground-path"
  | "walls"
  | "buildings"
  | "fences"
  | "trees"
  | "bushes"
  | "flowers"
  | "rocks"
  | "props"
  | "water";

export interface TileDef {
  id: string;
  name: string;
  sheet: string;            // Phaser texture key
  region: { x: number; y: number; w: number; h: number };
  displayScale: number;
  category: TileCategory;
  layer: LayerType;
  collision?: CollisionDef;
  tags?: string[];
}

// ─── Texture keys ───
export const SHEET_KEYS = {
  FF_TILES: "ts-ff-tiles",
  FF_DECO: "ts-ff-deco",
  PORT_TOWN: "ts-port-town",
  BASIC_GRASS: "ts-basic-grass",
  BASIC_STONE: "ts-basic-stone",
  BASIC_PROPS: "ts-basic-props",
  BASIC_PLANT: "ts-basic-plant",
  BASIC_STRUCT: "ts-basic-struct",
  BASIC_WALL: "ts-basic-wall",
  PIXEL_WOODS: "ts-pixel-woods",
} as const;

// ─── Helper: generate grid tiles ───
function gridTiles(
  prefix: string,
  sheet: string,
  tileSize: number,
  cols: number,
  rows: number,
  scale: number,
  category: TileCategory,
  layer: LayerType,
  namePrefix: string,
  startRow = 0,
  startCol = 0,
  count?: number,
): TileDef[] {
  const tiles: TileDef[] = [];
  let n = 0;
  for (let r = startRow; r < rows; r++) {
    for (let c = startCol; c < cols; c++) {
      if (count !== undefined && n >= count) break;
      tiles.push({
        id: `${prefix}-${r}-${c}`,
        name: `${namePrefix} ${n + 1}`,
        sheet,
        region: { x: c * tileSize, y: r * tileSize, w: tileSize, h: tileSize },
        displayScale: scale,
        category,
        layer,
      });
      n++;
    }
    if (count !== undefined && n >= count) break;
  }
  return tiles;
}

// ─── CATALOG ───

export const TILE_CATALOG: TileDef[] = [

  // ════════════════════════════════════════
  // FANTASY FOREST — Tiles (128x240, 16px grid = 8 cols x 15 rows)
  // Top rows are grass variants, then dirt/cliff edges
  // ════════════════════════════════════════
  // Grass ground tiles (rows 0-2)
  ...gridTiles("ff-grass", SHEET_KEYS.FF_TILES, 16, 8, 3, 12, "ground-grass", "ground", "Forest Grass", 0, 0),
  // Dirt/path tiles (rows 3-5)
  ...gridTiles("ff-dirt", SHEET_KEYS.FF_TILES, 16, 8, 3, 12, "ground-path", "ground", "Forest Dirt", 3, 0),
  // Cliff/edge tiles (rows 6-9)
  ...gridTiles("ff-cliff", SHEET_KEYS.FF_TILES, 16, 8, 4, 10, "rocks", "structures", "Forest Cliff", 6, 0),

  // ════════════════════════════════════════
  // FANTASY FOREST — Decorations (256x256, irregular objects)
  // Bushes, mushrooms, flowers, logs, rocks, trees
  // ════════════════════════════════════════
  // Bushes (top-left area)
  { id: "ff-bush-1", name: "Bush Small", sheet: SHEET_KEYS.FF_DECO, region: { x: 0, y: 0, w: 32, h: 32 }, displayScale: 6, category: "bushes", layer: "decorations", tags: ["bush", "nature"] },
  { id: "ff-bush-2", name: "Bush Medium", sheet: SHEET_KEYS.FF_DECO, region: { x: 32, y: 0, w: 32, h: 32 }, displayScale: 6, category: "bushes", layer: "decorations", tags: ["bush", "nature"] },
  { id: "ff-bush-3", name: "Bush Large", sheet: SHEET_KEYS.FF_DECO, region: { x: 0, y: 32, w: 48, h: 48 }, displayScale: 6, category: "bushes", layer: "decorations", tags: ["bush", "nature"] },

  // Log
  { id: "ff-log", name: "Fallen Log", sheet: SHEET_KEYS.FF_DECO, region: { x: 64, y: 0, w: 64, h: 32 }, displayScale: 6, category: "props", layer: "decorations", collision: { shape: "rect", offsetX: 0, offsetY: 0, width: 128, height: 32 }, tags: ["log", "wood"] },

  // Mushrooms
  { id: "ff-shroom-1", name: "Mushroom Red", sheet: SHEET_KEYS.FF_DECO, region: { x: 128, y: 0, w: 16, h: 16 }, displayScale: 9, category: "flowers", layer: "decorations", tags: ["mushroom"] },
  { id: "ff-shroom-2", name: "Mushroom Cluster", sheet: SHEET_KEYS.FF_DECO, region: { x: 144, y: 0, w: 32, h: 16 }, displayScale: 9, category: "flowers", layer: "decorations", tags: ["mushroom"] },
  { id: "ff-shroom-3", name: "Mushroom Spotted", sheet: SHEET_KEYS.FF_DECO, region: { x: 176, y: 0, w: 16, h: 16 }, displayScale: 9, category: "flowers", layer: "decorations", tags: ["mushroom"] },

  // Flowers
  { id: "ff-flower-1", name: "Red Flowers", sheet: SHEET_KEYS.FF_DECO, region: { x: 128, y: 16, w: 16, h: 16 }, displayScale: 9, category: "flowers", layer: "decorations", tags: ["flower"] },
  { id: "ff-flower-2", name: "Orange Flowers", sheet: SHEET_KEYS.FF_DECO, region: { x: 144, y: 16, w: 16, h: 16 }, displayScale: 9, category: "flowers", layer: "decorations", tags: ["flower"] },
  { id: "ff-flower-3", name: "White Flowers", sheet: SHEET_KEYS.FF_DECO, region: { x: 160, y: 16, w: 16, h: 16 }, displayScale: 9, category: "flowers", layer: "decorations", tags: ["flower"] },

  // Grass tufts
  { id: "ff-grass-tuft-1", name: "Grass Tuft 1", sheet: SHEET_KEYS.FF_DECO, region: { x: 0, y: 80, w: 16, h: 32 }, displayScale: 6, category: "ground-grass", layer: "decorations", tags: ["grass"] },
  { id: "ff-grass-tuft-2", name: "Grass Tuft 2", sheet: SHEET_KEYS.FF_DECO, region: { x: 16, y: 80, w: 16, h: 32 }, displayScale: 6, category: "ground-grass", layer: "decorations", tags: ["grass"] },
  { id: "ff-grass-tuft-3", name: "Grass Tuft 3", sheet: SHEET_KEYS.FF_DECO, region: { x: 32, y: 80, w: 16, h: 32 }, displayScale: 6, category: "ground-grass", layer: "decorations", tags: ["grass"] },

  // Rocks
  { id: "ff-rock-1", name: "Rock Small", sheet: SHEET_KEYS.FF_DECO, region: { x: 160, y: 32, w: 16, h: 16 }, displayScale: 9, category: "rocks", layer: "decorations", collision: { shape: "circle", offsetX: 0, offsetY: 0, radius: 16 }, tags: ["rock"] },
  { id: "ff-rock-2", name: "Rock Medium", sheet: SHEET_KEYS.FF_DECO, region: { x: 176, y: 32, w: 32, h: 32 }, displayScale: 6, category: "rocks", layer: "decorations", collision: { shape: "circle", offsetX: 0, offsetY: 0, radius: 24 }, tags: ["rock"] },
  { id: "ff-rock-3", name: "Rock Pile", sheet: SHEET_KEYS.FF_DECO, region: { x: 208, y: 32, w: 32, h: 32 }, displayScale: 6, category: "rocks", layer: "decorations", collision: { shape: "circle", offsetX: 0, offsetY: 0, radius: 24 }, tags: ["rock"] },

  // Trees (bottom area of decorations sheet)
  { id: "ff-tree-1", name: "Oak Tree", sheet: SHEET_KEYS.FF_DECO, region: { x: 0, y: 144, w: 80, h: 112 }, displayScale: 7.5, category: "trees", layer: "structures", collision: { shape: "circle", offsetX: 0, offsetY: 40, radius: 30 }, tags: ["tree", "oak", "cover"] },
  { id: "ff-tree-2", name: "Pine Tree", sheet: SHEET_KEYS.FF_DECO, region: { x: 80, y: 144, w: 80, h: 112 }, displayScale: 7.5, category: "trees", layer: "structures", collision: { shape: "circle", offsetX: 0, offsetY: 40, radius: 30 }, tags: ["tree", "pine", "cover"] },
  { id: "ff-tree-3", name: "Birch Tree", sheet: SHEET_KEYS.FF_DECO, region: { x: 160, y: 144, w: 80, h: 112 }, displayScale: 7.5, category: "trees", layer: "structures", collision: { shape: "circle", offsetX: 0, offsetY: 40, radius: 30 }, tags: ["tree", "birch", "cover"] },

  // ════════════════════════════════════════
  // PORT TOWN (240x288, 16px grid = 15 cols x 18 rows)
  // Paths, fences, bridge, structures, environment
  // ════════════════════════════════════════
  // Stone floor tiles (top rows)
  ...gridTiles("pt-stone", SHEET_KEYS.PORT_TOWN, 16, 5, 3, 12, "ground-stone", "ground", "Stone Path", 0, 0, 15),
  // Wood floor tiles
  ...gridTiles("pt-wood", SHEET_KEYS.PORT_TOWN, 16, 5, 2, 12, "ground-path", "ground", "Wood Floor", 3, 0, 10),
  // Crossroads / intersections (larger composite)
  { id: "pt-cross-stone", name: "Stone Crossroads", sheet: SHEET_KEYS.PORT_TOWN, region: { x: 0, y: 0, w: 48, h: 48 }, displayScale: 9, category: "ground-stone", layer: "ground", tags: ["path", "cross"] },
  { id: "pt-cross-wood", name: "Wood Crossroads", sheet: SHEET_KEYS.PORT_TOWN, region: { x: 48, y: 0, w: 48, h: 48 }, displayScale: 9, category: "ground-path", layer: "ground", tags: ["path", "cross"] },
  { id: "pt-cross-cobble", name: "Cobble Crossroads", sheet: SHEET_KEYS.PORT_TOWN, region: { x: 96, y: 0, w: 48, h: 48 }, displayScale: 9, category: "ground-stone", layer: "ground", tags: ["path", "cross"] },

  // Fence pieces (mid section of port town)
  { id: "pt-fence-h", name: "Fence Horizontal", sheet: SHEET_KEYS.PORT_TOWN, region: { x: 80, y: 48, w: 48, h: 16 }, displayScale: 9, category: "fences", layer: "structures", collision: { shape: "rect", offsetX: 0, offsetY: 0, width: 144, height: 20 }, tags: ["fence", "barrier"] },
  { id: "pt-fence-v", name: "Fence Vertical", sheet: SHEET_KEYS.PORT_TOWN, region: { x: 80, y: 64, w: 16, h: 48 }, displayScale: 9, category: "fences", layer: "structures", collision: { shape: "rect", offsetX: 0, offsetY: 0, width: 20, height: 144 }, tags: ["fence", "barrier"] },
  { id: "pt-fence-corner", name: "Fence Corner", sheet: SHEET_KEYS.PORT_TOWN, region: { x: 80, y: 48, w: 16, h: 16 }, displayScale: 9, category: "fences", layer: "structures", collision: { shape: "rect", offsetX: 0, offsetY: 0, width: 48, height: 48 }, tags: ["fence"] },

  // Environment props (bottom rows of port town)
  { id: "pt-tree", name: "Port Town Tree", sheet: SHEET_KEYS.PORT_TOWN, region: { x: 160, y: 128, w: 32, h: 32 }, displayScale: 9, category: "trees", layer: "structures", collision: { shape: "circle", offsetX: 0, offsetY: 16, radius: 30 }, tags: ["tree"] },
  { id: "pt-bush", name: "Port Town Bush", sheet: SHEET_KEYS.PORT_TOWN, region: { x: 192, y: 128, w: 16, h: 16 }, displayScale: 9, category: "bushes", layer: "decorations", tags: ["bush"] },
  { id: "pt-bench", name: "Bench", sheet: SHEET_KEYS.PORT_TOWN, region: { x: 192, y: 144, w: 32, h: 16 }, displayScale: 9, category: "props", layer: "structures", collision: { shape: "rect", offsetX: 0, offsetY: 0, width: 96, height: 24 }, tags: ["bench", "seat"] },
  { id: "pt-lamp", name: "Street Lamp", sheet: SHEET_KEYS.PORT_TOWN, region: { x: 160, y: 144, w: 16, h: 32 }, displayScale: 9, category: "props", layer: "structures", tags: ["lamp", "light"] },
  { id: "pt-planter", name: "Planter Box", sheet: SHEET_KEYS.PORT_TOWN, region: { x: 208, y: 128, w: 32, h: 32 }, displayScale: 9, category: "props", layer: "structures", collision: { shape: "rect", offsetX: 0, offsetY: 0, width: 60, height: 60 }, tags: ["planter", "garden"] },
  { id: "pt-rock", name: "Port Rock", sheet: SHEET_KEYS.PORT_TOWN, region: { x: 176, y: 176, w: 16, h: 16 }, displayScale: 9, category: "rocks", layer: "decorations", tags: ["rock"] },
  { id: "pt-barrel", name: "Barrel", sheet: SHEET_KEYS.PORT_TOWN, region: { x: 192, y: 176, w: 16, h: 16 }, displayScale: 9, category: "props", layer: "structures", collision: { shape: "circle", offsetX: 0, offsetY: 0, radius: 20 }, tags: ["barrel"] },

  // Bridge
  { id: "pt-bridge", name: "Wood Bridge", sheet: SHEET_KEYS.PORT_TOWN, region: { x: 0, y: 208, w: 48, h: 80 }, displayScale: 9, category: "ground-path", layer: "ground", tags: ["bridge", "wood"] },

  // Walls (brick sections)
  { id: "pt-wall-h", name: "Brick Wall H", sheet: SHEET_KEYS.PORT_TOWN, region: { x: 0, y: 160, w: 80, h: 32 }, displayScale: 9, category: "walls", layer: "structures", collision: { shape: "rect", offsetX: 0, offsetY: 0, width: 240, height: 48 }, tags: ["wall", "brick"] },
  { id: "pt-wall-v", name: "Brick Wall V", sheet: SHEET_KEYS.PORT_TOWN, region: { x: 0, y: 192, w: 32, h: 64 }, displayScale: 9, category: "walls", layer: "structures", collision: { shape: "rect", offsetX: 0, offsetY: 0, width: 48, height: 192 }, tags: ["wall", "brick"] },

  // ════════════════════════════════════════
  // BASIC — Grass Tiles (256x256, 32px grid)
  // ════════════════════════════════════════
  ...gridTiles("bg-grass", SHEET_KEYS.BASIC_GRASS, 32, 8, 8, 6, "ground-grass", "ground", "Grass Tile", 0, 0, 20),

  // ════════════════════════════════════════
  // BASIC — Stone Ground (256x256, irregular ~64px chunks)
  // ════════════════════════════════════════
  { id: "bs-stone-1", name: "Stone Slab 1", sheet: SHEET_KEYS.BASIC_STONE, region: { x: 0, y: 0, w: 96, h: 96 }, displayScale: 6, category: "ground-stone", layer: "ground", tags: ["stone", "slab"] },
  { id: "bs-stone-2", name: "Stone Slab 2", sheet: SHEET_KEYS.BASIC_STONE, region: { x: 96, y: 0, w: 64, h: 96 }, displayScale: 6, category: "ground-stone", layer: "ground", tags: ["stone", "slab"] },
  { id: "bs-stone-3", name: "Stone Large", sheet: SHEET_KEYS.BASIC_STONE, region: { x: 160, y: 0, w: 96, h: 96 }, displayScale: 6, category: "ground-stone", layer: "ground", tags: ["stone"] },
  { id: "bs-stone-cross", name: "Stone Cross Path", sheet: SHEET_KEYS.BASIC_STONE, region: { x: 160, y: 96, w: 96, h: 96 }, displayScale: 6, category: "ground-stone", layer: "ground", tags: ["stone", "cross"] },
  { id: "bs-stone-window", name: "Stone With Window", sheet: SHEET_KEYS.BASIC_STONE, region: { x: 0, y: 96, w: 96, h: 96 }, displayScale: 6, category: "ground-stone", layer: "ground", tags: ["stone"] },
  { id: "bs-stone-small", name: "Stone Small", sheet: SHEET_KEYS.BASIC_STONE, region: { x: 96, y: 96, w: 64, h: 64 }, displayScale: 6, category: "ground-stone", layer: "ground", tags: ["stone"] },

  // ════════════════════════════════════════
  // BASIC — Plants (512x512, irregular)
  // Trees at top, bushes middle, grass tufts bottom
  // ════════════════════════════════════════
  { id: "bp-tree-1", name: "Deciduous Tree 1", sheet: SHEET_KEYS.BASIC_PLANT, region: { x: 0, y: 0, w: 128, h: 128 }, displayScale: 6, category: "trees", layer: "structures", collision: { shape: "circle", offsetX: 0, offsetY: 40, radius: 40 }, tags: ["tree", "cover"] },
  { id: "bp-tree-2", name: "Deciduous Tree 2", sheet: SHEET_KEYS.BASIC_PLANT, region: { x: 160, y: 0, w: 128, h: 128 }, displayScale: 6, category: "trees", layer: "structures", collision: { shape: "circle", offsetX: 0, offsetY: 40, radius: 40 }, tags: ["tree", "cover"] },
  { id: "bp-tree-3", name: "Deciduous Tree 3", sheet: SHEET_KEYS.BASIC_PLANT, region: { x: 320, y: 0, w: 128, h: 128 }, displayScale: 6, category: "trees", layer: "structures", collision: { shape: "circle", offsetX: 0, offsetY: 40, radius: 40 }, tags: ["tree", "cover"] },
  { id: "bp-bush-1", name: "Small Bush", sheet: SHEET_KEYS.BASIC_PLANT, region: { x: 0, y: 160, w: 48, h: 32 }, displayScale: 7.5, category: "bushes", layer: "decorations", tags: ["bush"] },
  { id: "bp-bush-2", name: "Medium Bush", sheet: SHEET_KEYS.BASIC_PLANT, region: { x: 64, y: 160, w: 64, h: 48 }, displayScale: 6, category: "bushes", layer: "decorations", tags: ["bush"] },
  { id: "bp-bush-3", name: "Wide Bush", sheet: SHEET_KEYS.BASIC_PLANT, region: { x: 144, y: 160, w: 80, h: 48 }, displayScale: 6, category: "bushes", layer: "decorations", tags: ["bush"] },
  { id: "bp-bush-4", name: "Round Bush", sheet: SHEET_KEYS.BASIC_PLANT, region: { x: 240, y: 160, w: 48, h: 48 }, displayScale: 6, category: "bushes", layer: "decorations", tags: ["bush"] },
  // Grass tufts (bottom rows)
  { id: "bp-grass-1", name: "Grass Patch 1", sheet: SHEET_KEYS.BASIC_PLANT, region: { x: 0, y: 384, w: 32, h: 32 }, displayScale: 6, category: "ground-grass", layer: "decorations", tags: ["grass"] },
  { id: "bp-grass-2", name: "Grass Patch 2", sheet: SHEET_KEYS.BASIC_PLANT, region: { x: 32, y: 384, w: 32, h: 32 }, displayScale: 6, category: "ground-grass", layer: "decorations", tags: ["grass"] },
  { id: "bp-grass-3", name: "Grass Patch 3", sheet: SHEET_KEYS.BASIC_PLANT, region: { x: 64, y: 384, w: 32, h: 32 }, displayScale: 6, category: "ground-grass", layer: "decorations", tags: ["grass"] },

  // ════════════════════════════════════════
  // BASIC — Props (512x512, irregular)
  // Doors, barrels, crates, signs, gravestones, fountain
  // ════════════════════════════════════════
  { id: "bpr-door-1", name: "Wooden Door", sheet: SHEET_KEYS.BASIC_PROPS, region: { x: 0, y: 96, w: 48, h: 64 }, displayScale: 6, category: "props", layer: "structures", collision: { shape: "rect", offsetX: 0, offsetY: 0, width: 96, height: 128 }, tags: ["door"] },
  { id: "bpr-barrel", name: "Barrel", sheet: SHEET_KEYS.BASIC_PROPS, region: { x: 128, y: 128, w: 32, h: 32 }, displayScale: 7.5, category: "props", layer: "structures", collision: { shape: "circle", offsetX: 0, offsetY: 0, radius: 28 }, tags: ["barrel"] },
  { id: "bpr-crate-1", name: "Crate Small", sheet: SHEET_KEYS.BASIC_PROPS, region: { x: 64, y: 64, w: 32, h: 32 }, displayScale: 7.5, category: "props", layer: "structures", collision: { shape: "rect", offsetX: 0, offsetY: 0, width: 72, height: 72 }, tags: ["crate"] },
  { id: "bpr-crate-2", name: "Crate Large", sheet: SHEET_KEYS.BASIC_PROPS, region: { x: 64, y: 32, w: 48, h: 48 }, displayScale: 6, category: "props", layer: "structures", collision: { shape: "rect", offsetX: 0, offsetY: 0, width: 96, height: 96 }, tags: ["crate"] },
  { id: "bpr-sign", name: "Sign Post", sheet: SHEET_KEYS.BASIC_PROPS, region: { x: 0, y: 192, w: 32, h: 48 }, displayScale: 6, category: "props", layer: "structures", tags: ["sign"] },
  { id: "bpr-grave-1", name: "Gravestone", sheet: SHEET_KEYS.BASIC_PROPS, region: { x: 192, y: 64, w: 32, h: 48 }, displayScale: 6, category: "props", layer: "structures", collision: { shape: "rect", offsetX: 0, offsetY: 0, width: 48, height: 48 }, tags: ["grave", "stone"] },
  { id: "bpr-grave-2", name: "Cross Grave", sheet: SHEET_KEYS.BASIC_PROPS, region: { x: 256, y: 192, w: 32, h: 48 }, displayScale: 6, category: "props", layer: "structures", collision: { shape: "rect", offsetX: 0, offsetY: 0, width: 48, height: 48 }, tags: ["grave", "cross"] },
  { id: "bpr-fountain", name: "Fountain", sheet: SHEET_KEYS.BASIC_PROPS, region: { x: 320, y: 160, w: 96, h: 96 }, displayScale: 6, category: "props", layer: "structures", collision: { shape: "circle", offsetX: 0, offsetY: 0, radius: 80 }, tags: ["fountain", "water"] },
  { id: "bpr-bench", name: "Stone Bench", sheet: SHEET_KEYS.BASIC_PROPS, region: { x: 128, y: 32, w: 48, h: 32 }, displayScale: 6, category: "props", layer: "structures", collision: { shape: "rect", offsetX: 0, offsetY: 0, width: 96, height: 32 }, tags: ["bench"] },
  { id: "bpr-cart", name: "Cart", sheet: SHEET_KEYS.BASIC_PROPS, region: { x: 0, y: 448, w: 64, h: 48 }, displayScale: 6, category: "props", layer: "structures", collision: { shape: "rect", offsetX: 0, offsetY: 0, width: 128, height: 64 }, tags: ["cart", "vehicle"] },
  { id: "bpr-vase", name: "Vase", sheet: SHEET_KEYS.BASIC_PROPS, region: { x: 128, y: 224, w: 32, h: 48 }, displayScale: 6, category: "props", layer: "structures", tags: ["vase", "pottery"] },
  { id: "bpr-statue-1", name: "Statue Tiki", sheet: SHEET_KEYS.BASIC_PROPS, region: { x: 192, y: 0, w: 48, h: 64 }, displayScale: 6, category: "props", layer: "structures", collision: { shape: "rect", offsetX: 0, offsetY: 0, width: 64, height: 64 }, tags: ["statue"] },
  { id: "bpr-ruins-1", name: "Ruins Arc", sheet: SHEET_KEYS.BASIC_PROPS, region: { x: 416, y: 448, w: 64, h: 48 }, displayScale: 6, category: "rocks", layer: "structures", collision: { shape: "rect", offsetX: 0, offsetY: 0, width: 128, height: 40 }, tags: ["ruins", "stone"] },

  // ════════════════════════════════════════
  // BASIC — Struct / Walls (512x512, irregular)
  // Building walls with windows, arches, roofs
  // ════════════════════════════════════════
  { id: "bst-wall-1", name: "Brick Wall 1", sheet: SHEET_KEYS.BASIC_STRUCT, region: { x: 0, y: 0, w: 128, h: 128 }, displayScale: 6, category: "walls", layer: "structures", collision: { shape: "rect", offsetX: 0, offsetY: 0, width: 256, height: 256 }, tags: ["wall", "brick", "building"] },
  { id: "bst-wall-2", name: "Brick Wall 2", sheet: SHEET_KEYS.BASIC_STRUCT, region: { x: 128, y: 0, w: 128, h: 128 }, displayScale: 6, category: "walls", layer: "structures", collision: { shape: "rect", offsetX: 0, offsetY: 0, width: 256, height: 256 }, tags: ["wall", "brick", "building"] },
  { id: "bst-wall-3", name: "Brick Wall Old", sheet: SHEET_KEYS.BASIC_STRUCT, region: { x: 0, y: 128, w: 128, h: 128 }, displayScale: 6, category: "walls", layer: "structures", collision: { shape: "rect", offsetX: 0, offsetY: 0, width: 256, height: 256 }, tags: ["wall", "brick", "ruined"] },
  { id: "bst-arch-1", name: "Stone Arch", sheet: SHEET_KEYS.BASIC_STRUCT, region: { x: 384, y: 0, w: 80, h: 96 }, displayScale: 6, category: "buildings", layer: "structures", collision: { shape: "rect", offsetX: -30, offsetY: 0, width: 40, height: 192 }, tags: ["arch", "gate", "stone"] },
  { id: "bst-wall-diag-1", name: "Wall Diagonal L", sheet: SHEET_KEYS.BASIC_STRUCT, region: { x: 0, y: 288, w: 128, h: 128 }, displayScale: 6, category: "walls", layer: "structures", tags: ["wall", "diagonal"] },
  { id: "bst-wall-diag-2", name: "Wall Diagonal R", sheet: SHEET_KEYS.BASIC_STRUCT, region: { x: 128, y: 288, w: 128, h: 128 }, displayScale: 6, category: "walls", layer: "structures", tags: ["wall", "diagonal"] },

  // ════════════════════════════════════════
  // BASIC — Wall Tiles (512x512)
  // Detailed wall sections with windows, doors
  // ════════════════════════════════════════
  { id: "bw-wall-window", name: "Wall With Window", sheet: SHEET_KEYS.BASIC_WALL, region: { x: 0, y: 0, w: 128, h: 96 }, displayScale: 6, category: "walls", layer: "structures", collision: { shape: "rect", offsetX: 0, offsetY: 0, width: 256, height: 192 }, tags: ["wall", "window"] },
  { id: "bw-wall-large", name: "Wall Large", sheet: SHEET_KEYS.BASIC_WALL, region: { x: 128, y: 0, w: 160, h: 96 }, displayScale: 6, category: "walls", layer: "structures", collision: { shape: "rect", offsetX: 0, offsetY: 0, width: 320, height: 192 }, tags: ["wall", "large"] },
  { id: "bw-wall-small-win", name: "Wall Small Window", sheet: SHEET_KEYS.BASIC_WALL, region: { x: 384, y: 0, w: 80, h: 96 }, displayScale: 6, category: "walls", layer: "structures", collision: { shape: "rect", offsetX: 0, offsetY: 0, width: 160, height: 192 }, tags: ["wall", "window"] },
  { id: "bw-wall-long", name: "Wall Long", sheet: SHEET_KEYS.BASIC_WALL, region: { x: 0, y: 128, w: 256, h: 80 }, displayScale: 6, category: "walls", layer: "structures", collision: { shape: "rect", offsetX: 0, offsetY: 0, width: 512, height: 160 }, tags: ["wall", "long"] },
  { id: "bw-wall-door", name: "Wall With Door", sheet: SHEET_KEYS.BASIC_WALL, region: { x: 256, y: 128, w: 48, h: 48 }, displayScale: 9, category: "walls", layer: "structures", collision: { shape: "rect", offsetX: 0, offsetY: 0, width: 144, height: 144 }, tags: ["wall", "door"] },
  { id: "bw-wall-block-1", name: "Wall Block 1", sheet: SHEET_KEYS.BASIC_WALL, region: { x: 0, y: 256, w: 128, h: 96 }, displayScale: 6, category: "walls", layer: "structures", collision: { shape: "rect", offsetX: 0, offsetY: 0, width: 256, height: 192 }, tags: ["wall"] },
  { id: "bw-wall-block-2", name: "Wall Block 2", sheet: SHEET_KEYS.BASIC_WALL, region: { x: 128, y: 256, w: 128, h: 96 }, displayScale: 6, category: "walls", layer: "structures", collision: { shape: "rect", offsetX: 0, offsetY: 0, width: 256, height: 192 }, tags: ["wall"] },

  // ════════════════════════════════════════
  // PIXEL WOODS (352x192, 16px grid)
  // Trees, bushes, water, rocks — Stardew-ish style
  // ════════════════════════════════════════
  { id: "pw-tree-big-1", name: "Big Tree 1", sheet: SHEET_KEYS.PIXEL_WOODS, region: { x: 0, y: 0, w: 80, h: 80 }, displayScale: 9, category: "trees", layer: "structures", collision: { shape: "circle", offsetX: 0, offsetY: 40, radius: 50 }, tags: ["tree", "large", "cover"] },
  { id: "pw-tree-big-2", name: "Big Tree 2", sheet: SHEET_KEYS.PIXEL_WOODS, region: { x: 128, y: 0, w: 64, h: 80 }, displayScale: 9, category: "trees", layer: "structures", collision: { shape: "circle", offsetX: 0, offsetY: 40, radius: 40 }, tags: ["tree", "cover"] },
  { id: "pw-tree-round", name: "Round Tree", sheet: SHEET_KEYS.PIXEL_WOODS, region: { x: 288, y: 0, w: 64, h: 80 }, displayScale: 9, category: "trees", layer: "structures", collision: { shape: "circle", offsetX: 0, offsetY: 40, radius: 40 }, tags: ["tree", "round", "cover"] },
  { id: "pw-tree-small", name: "Small Tree", sheet: SHEET_KEYS.PIXEL_WOODS, region: { x: 256, y: 48, w: 32, h: 48 }, displayScale: 9, category: "trees", layer: "structures", collision: { shape: "circle", offsetX: 0, offsetY: 20, radius: 24 }, tags: ["tree", "small"] },
  { id: "pw-bush-1", name: "Woods Bush 1", sheet: SHEET_KEYS.PIXEL_WOODS, region: { x: 96, y: 16, w: 32, h: 16 }, displayScale: 9, category: "bushes", layer: "decorations", tags: ["bush"] },
  { id: "pw-bush-2", name: "Woods Bush 2", sheet: SHEET_KEYS.PIXEL_WOODS, region: { x: 96, y: 32, w: 16, h: 16 }, displayScale: 9, category: "bushes", layer: "decorations", tags: ["bush"] },
  { id: "pw-rock-1", name: "Woods Rock", sheet: SHEET_KEYS.PIXEL_WOODS, region: { x: 208, y: 48, w: 32, h: 32 }, displayScale: 9, category: "rocks", layer: "decorations", collision: { shape: "circle", offsetX: 0, offsetY: 0, radius: 30 }, tags: ["rock"] },
  { id: "pw-stump", name: "Tree Stump", sheet: SHEET_KEYS.PIXEL_WOODS, region: { x: 0, y: 96, w: 48, h: 48 }, displayScale: 9, category: "props", layer: "structures", collision: { shape: "circle", offsetX: 0, offsetY: 0, radius: 40 }, tags: ["stump", "wood"] },
  { id: "pw-pond", name: "Pond", sheet: SHEET_KEYS.PIXEL_WOODS, region: { x: 128, y: 96, w: 96, h: 80 }, displayScale: 9, category: "water", layer: "ground", tags: ["water", "pond"] },
  { id: "pw-grass-1", name: "Woods Grass 1", sheet: SHEET_KEYS.PIXEL_WOODS, region: { x: 96, y: 0, w: 16, h: 16 }, displayScale: 9, category: "ground-grass", layer: "decorations", tags: ["grass"] },
  { id: "pw-leaf-1", name: "Leaf Pile", sheet: SHEET_KEYS.PIXEL_WOODS, region: { x: 112, y: 48, w: 16, h: 16 }, displayScale: 9, category: "ground-grass", layer: "decorations", tags: ["leaves"] },
];

// ─── Lookup helpers ───

const _catalogMap = new Map<string, TileDef>();
for (const t of TILE_CATALOG) {
  _catalogMap.set(t.id, t);
}

export function getTileDef(id: string): TileDef | undefined {
  return _catalogMap.get(id);
}

export function getTilesByCategory(category: TileCategory): TileDef[] {
  return TILE_CATALOG.filter((t) => t.category === category);
}

export function getTilesByLayer(layer: LayerType): TileDef[] {
  return TILE_CATALOG.filter((t) => t.layer === layer);
}

// ─── Frame registration — call in BootScene.create() ───

export function registerTileFrames(textures: Phaser.Textures.TextureManager): void {
  for (const tile of TILE_CATALOG) {
    const tex = textures.get(tile.sheet);
    if (tex && tex.key !== "__MISSING") {
      try {
        tex.add(tile.id, 0, tile.region.x, tile.region.y, tile.region.w, tile.region.h);
      } catch {
        // Frame may already exist
      }
    }
  }
}

// ─── Categories grouped by layer for palette UI ───

export const LAYER_CATEGORIES: Record<LayerType, TileCategory[]> = {
  ground: ["ground-grass", "ground-stone", "ground-path", "water"],
  structures: ["walls", "buildings", "fences", "trees", "rocks", "props"],
  decorations: ["bushes", "flowers", "ground-grass", "rocks", "props"],
};
