// Save format for sprite-based maps

export type LayerType = "ground" | "structures" | "decorations";

export interface PlacedTile {
  id: string;          // UUID for this placement
  tileId: string;      // References TileDef.id from catalog
  x: number;           // World position (center)
  y: number;
  scale?: number;      // Override display scale
  rotation?: number;   // Radians
  flipX?: boolean;
  flipY?: boolean;
  tint?: number;
  alpha?: number;
  depth?: number;      // Z-order within layer
}

export interface CollisionZone {
  id: string;
  linkedTileId?: string;
  shape: "rect" | "circle";
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
}

export interface SpawnPoint {
  id: string;
  type: "player" | "enemy" | "gate" | "light";
  x: number;
  y: number;
  label?: string;
}

export interface SavedMap {
  version: 1;
  name: string;
  width: number;
  height: number;
  layers: {
    ground: PlacedTile[];
    structures: PlacedTile[];
    decorations: PlacedTile[];
  };
  collisionZones: CollisionZone[];
  spawnPoints: SpawnPoint[];
}

const MAP_STORAGE_KEY = "rickarena-map";

export function saveMapToStorage(map: SavedMap): void {
  localStorage.setItem(MAP_STORAGE_KEY, JSON.stringify(map));
}

export function loadMapFromStorage(): SavedMap | null {
  const raw = localStorage.getItem(MAP_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SavedMap;
  } catch {
    return null;
  }
}

export function downloadMapJSON(map: SavedMap): void {
  const blob = new Blob([JSON.stringify(map, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${map.name || "map"}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
