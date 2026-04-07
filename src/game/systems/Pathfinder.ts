import EasyStar from "easystarjs";

const TILE_SIZE = 32;

/** Point-in-polygon test (ray casting algorithm) */
function pointInPolygon(px: number, py: number, polygon: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * A* pathfinding system built on easystarjs.
 * Converts collision rects + polygons from Tiled into a walkable/blocked grid,
 * then provides async path queries for enemies.
 */
export class Pathfinder {
  private easystar: EasyStar.js;
  private gridW: number; // columns
  private gridH: number; // rows

  constructor(
    mapWidthPx: number,
    mapHeightPx: number,
    collisionRects: { x: number; y: number; w: number; h: number }[],
    collisionPolygons: { x: number; y: number; points: { x: number; y: number }[] }[] = []
  ) {
    this.gridW = Math.ceil(mapWidthPx / TILE_SIZE);
    this.gridH = Math.ceil(mapHeightPx / TILE_SIZE);

    // Build grid: 0 = walkable, 1 = blocked
    const grid: number[][] = [];
    for (let row = 0; row < this.gridH; row++) {
      grid[row] = new Array(this.gridW).fill(0);
    }

    // Stamp collision rects onto grid
    for (const rect of collisionRects) {
      const startCol = Math.floor(rect.x / TILE_SIZE);
      const endCol = Math.ceil((rect.x + rect.w) / TILE_SIZE);
      const startRow = Math.floor(rect.y / TILE_SIZE);
      const endRow = Math.ceil((rect.y + rect.h) / TILE_SIZE);
      for (let row = startRow; row < endRow; row++) {
        for (let col = startCol; col < endCol; col++) {
          if (row >= 0 && row < this.gridH && col >= 0 && col < this.gridW) {
            grid[row][col] = 1;
          }
        }
      }
    }

    // Rasterize collision polygons onto grid
    for (const poly of collisionPolygons) {
      const pts = poly.points;
      // Find bounding box of polygon to limit iteration
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const minCol = Math.max(0, Math.floor(Math.min(...xs) / TILE_SIZE));
      const maxCol = Math.min(this.gridW - 1, Math.ceil(Math.max(...xs) / TILE_SIZE));
      const minRow = Math.max(0, Math.floor(Math.min(...ys) / TILE_SIZE));
      const maxRow = Math.min(this.gridH - 1, Math.ceil(Math.max(...ys) / TILE_SIZE));

      for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
          // Test center of tile cell against polygon
          const cx = col * TILE_SIZE + TILE_SIZE / 2;
          const cy = row * TILE_SIZE + TILE_SIZE / 2;
          if (pointInPolygon(cx, cy, pts)) {
            grid[row][col] = 1;
          }
        }
      }
    }

    this.easystar = new EasyStar.js();
    this.easystar.setGrid(grid);
    this.easystar.setAcceptableTiles([0]);
    this.easystar.enableDiagonals();
    this.easystar.disableCornerCutting(); // don't squeeze between diagonal walls
    // Process up to 200 iterations per calculate() call — keeps it fast
    this.easystar.setIterationsPerCalculation(200);
  }

  /**
   * Request a path from (startX, startY) to (endX, endY) in world pixels.
   * Returns the path as world-pixel waypoints, or null if no path exists.
   * The callback fires after the next calculate() call.
   */
  findPath(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    callback: (path: { x: number; y: number }[] | null) => void
  ): void {
    const sc = Math.floor(startX / TILE_SIZE);
    const sr = Math.floor(startY / TILE_SIZE);
    const ec = Math.floor(endX / TILE_SIZE);
    const er = Math.floor(endY / TILE_SIZE);

    // Clamp to grid bounds
    const clampCol = (c: number) => Math.max(0, Math.min(c, this.gridW - 1));
    const clampRow = (r: number) => Math.max(0, Math.min(r, this.gridH - 1));

    this.easystar.findPath(
      clampCol(sc),
      clampRow(sr),
      clampCol(ec),
      clampRow(er),
      (gridPath) => {
        if (!gridPath || gridPath.length === 0) {
          callback(null);
          return;
        }
        // Convert grid coords back to world-pixel centers
        const worldPath = gridPath.map((p) => ({
          x: p.x * TILE_SIZE + TILE_SIZE / 2,
          y: p.y * TILE_SIZE + TILE_SIZE / 2,
        }));
        callback(worldPath);
      }
    );
  }

  /** Must be called each frame (or on a timer) to process queued path requests. */
  calculate(): void {
    this.easystar.calculate();
  }
}
