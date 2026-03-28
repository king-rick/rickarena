import Phaser from "phaser";
import { MAP_WIDTH, MAP_HEIGHT } from "../map/EndicottEstate";
import {
  TILE_CATALOG,
  TileDef,
  getTileDef,
  getTilesByLayer,
} from "../map/TileCatalog";
import {
  PlacedTile,
  SavedMap,
  CollisionZone,
  LayerType,
  saveMapToStorage,
  loadMapFromStorage,
  downloadMapJSON,
  generateId,
} from "../map/MapSaveFormat";

// ─── Constants ───
const PALETTE_W = 220;
const TOOLBAR_H = 40;
const TILE_THUMB = 60;
const TILE_PAD = 6;
const COLS = 3;
const GRID_SIZE = 32;

// Depth layers: UI elements sit at 1000+
const UI_DEPTH = 1000;

type ToolMode = "place" | "select" | "delete";

interface PlacedSpriteEntry {
  data: PlacedTile;
  sprite: Phaser.GameObjects.Image;
}

type MapAction =
  | { type: "place"; tile: PlacedTile }
  | { type: "delete"; tile: PlacedTile }
  | { type: "move"; tileId: string; fromX: number; fromY: number; toX: number; toY: number };

export class MapEditorScene extends Phaser.Scene {
  private placed = new Map<string, PlacedSpriteEntry>();

  private activeLayer: LayerType = "structures";
  private toolMode: ToolMode = "place";
  private brushTileId: string | null = null;
  private selectedId: string | null = null;
  private gridSnap = true;

  // Cameras
  private mapCam!: Phaser.Cameras.Scene2D.Camera;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;

  // UI game objects (rendered by uiCam only)
  private uiObjects: Phaser.GameObjects.GameObject[] = [];

  // Ghost sprite for placement preview
  private ghostSprite: Phaser.GameObjects.Image | null = null;
  private selectionGfx!: Phaser.GameObjects.Graphics;

  // Palette tiles data for scroll
  private paletteTileEntries: { def: TileDef; thumbs: Phaser.GameObjects.GameObject[] }[] = [];
  private paletteScrollY = 0;
  private paletteMaxScroll = 0;
  private paletteTilesGroup: Phaser.GameObjects.GameObject[] = [];

  // Drag state
  private dragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragTileStartX = 0;
  private dragTileStartY = 0;

  // Undo/redo
  private undoStack: MapAction[] = [];
  private redoStack: MapAction[] = [];

  // UI text
  private layerText!: Phaser.GameObjects.Text;
  private toolText!: Phaser.GameObjects.Text;
  private infoText!: Phaser.GameObjects.Text;

  // Canvas dimensions (set in create)
  private W = 1920;
  private H = 1080;

  // Keys
  private keys!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };

  constructor() {
    super({ key: "MapEditor" });
  }

  create() {
    this.placed.clear();
    this.undoStack = [];
    this.redoStack = [];
    this.selectedId = null;
    this.brushTileId = null;
    this.paletteScrollY = 0;
    this.toolMode = "place";
    this.activeLayer = "structures";
    this.gridSnap = true;
    this.dragging = false;
    this.uiObjects = [];
    this.paletteTileEntries = [];
    this.paletteTilesGroup = [];

    // Use the actual game canvas size
    this.W = this.scale.width;
    this.H = this.scale.height;
    const W = this.W;
    const H = this.H;

    // ─── Map camera (full canvas, map renders everywhere) ───
    this.mapCam = this.cameras.main;
    this.mapCam.setViewport(0, 0, W, H);
    this.mapCam.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
    this.mapCam.setZoom(0.2);
    this.mapCam.centerOn(MAP_WIDTH / 2, MAP_HEIGHT / 2);

    // ─── UI camera (full canvas, renders palette/toolbar on top) ───
    this.uiCam = this.cameras.add(0, 0, W, H, false, "ui");
    this.uiCam.setScroll(0, 0);

    // Ground
    const grass = this.add.tileSprite(0, 0, MAP_WIDTH, MAP_HEIGHT, "grass-tile");
    grass.setOrigin(0, 0).setDepth(-1).setTint(0x556655);
    this.uiCam.ignore(grass);

    // Grid
    const grid = this.drawGrid();
    this.uiCam.ignore(grid);

    // Selection graphics (world space, map cam)
    this.selectionGfx = this.add.graphics().setDepth(90);
    this.uiCam.ignore(this.selectionGfx);

    // Build UI
    this.buildPalette();
    this.buildToolbar();

    // Setup input
    this.setupInput();

    // Load existing
    this.loadExistingMap();

    // WASD
    if (this.input.keyboard) {
      this.keys = {
        W: this.input.keyboard.addKey("W"),
        A: this.input.keyboard.addKey("A"),
        S: this.input.keyboard.addKey("S"),
        D: this.input.keyboard.addKey("D"),
      };
    }
  }

  update() {
    const speed = 20 / this.mapCam.zoom;
    if (this.keys?.W.isDown) this.mapCam.scrollY -= speed;
    if (this.keys?.S.isDown) this.mapCam.scrollY += speed;
    if (this.keys?.A.isDown) this.mapCam.scrollX -= speed;
    if (this.keys?.D.isDown) this.mapCam.scrollX += speed;

    // Ghost follows pointer
    if (this.ghostSprite && this.toolMode === "place") {
      const pointer = this.input.activePointer;
      const wp = this.mapCam.getWorldPoint(pointer.x, pointer.y);
      let gx = wp.x;
      let gy = wp.y;
      if (this.gridSnap) {
        gx = Math.round(gx / GRID_SIZE) * GRID_SIZE;
        gy = Math.round(gy / GRID_SIZE) * GRID_SIZE;
      }
      this.ghostSprite.setPosition(gx, gy);
    }

    // Selection highlight
    this.selectionGfx.clear();
    if (this.selectedId) {
      const entry = this.placed.get(this.selectedId);
      if (entry) {
        const bounds = entry.sprite.getBounds();
        this.selectionGfx.lineStyle(2 / this.mapCam.zoom, 0x00ff88, 1);
        this.selectionGfx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
      }
    }
  }

  // ═══════════════════════════════════════
  // UI HELPERS
  // ═══════════════════════════════════════

  /** Add a game object to the UI layer (visible on uiCam, hidden from mapCam) */
  private addUI<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.mapCam.ignore(obj);
    this.uiObjects.push(obj);
    return obj;
  }

  // ═══════════════════════════════════════
  // PALETTE (right panel)
  // ═══════════════════════════════════════

  private buildPalette() {
    const W = this.W;
    const H = this.H;
    const px = W - PALETTE_W;
    const paletteH = H - TOOLBAR_H;

    // Background
    const bg = this.addUI(this.add.graphics().setDepth(UI_DEPTH));
    bg.fillStyle(0x111120, 0.97);
    bg.fillRect(px, 0, PALETTE_W, paletteH);
    bg.lineStyle(2, 0x2a2a44, 1);
    bg.moveTo(px, 0);
    bg.lineTo(px, paletteH);
    bg.strokePath();

    // Layer tabs
    const layers: LayerType[] = ["ground", "structures", "decorations"];
    const tabW = Math.floor(PALETTE_W / 3);
    layers.forEach((layer, i) => {
      const isActive = layer === this.activeLayer;
      const tabBg = this.addUI(this.add.graphics().setDepth(UI_DEPTH + 1));
      tabBg.fillStyle(isActive ? 0x2a2a55 : 0x181830, 1);
      tabBg.fillRect(px + i * tabW, 0, tabW, 28);
      if (isActive) {
        tabBg.fillStyle(0x5aabff, 1);
        tabBg.fillRect(px + i * tabW, 26, tabW, 2);
      }

      const label = layer === "ground" ? "GROUND" : layer === "structures" ? "BUILD" : "DECO";
      const tabText = this.addUI(
        this.add.text(px + i * tabW + tabW / 2, 14, label, {
          fontSize: "10px", fontFamily: "Rajdhani, sans-serif",
          color: isActive ? "#5aabff" : "#555577", fontStyle: "bold",
        }).setOrigin(0.5).setDepth(UI_DEPTH + 2)
      );

      // Click zone for tab
      const zone = this.addUI(
        this.add.zone(px + i * tabW + tabW / 2, 14, tabW, 28)
          .setInteractive({ useHandCursor: true }).setDepth(UI_DEPTH + 3)
      );
      zone.on("pointerdown", () => {
        this.activeLayer = layer;
        this.brushTileId = null;
        this.clearGhost();
        this.destroyPaletteTiles();
        this.destroyUI();
        this.buildPalette();
        this.buildToolbar();
      });
    });

    // Populate tiles
    this.populatePaletteTiles(px, 32, paletteH - 32);
  }

  private populatePaletteTiles(px: number, tilesTop: number, tilesHeight: number) {
    const tiles = getTilesByLayer(this.activeLayer);
    const startX = px + TILE_PAD + 4;
    let row = 0;
    let col = 0;

    for (const tile of tiles) {
      const tx = startX + col * (TILE_THUMB + TILE_PAD);
      const ty = tilesTop + TILE_PAD + row * (TILE_THUMB + TILE_PAD + 14);

      // Background box
      const thumbBg = this.addUI(this.add.graphics().setDepth(UI_DEPTH + 1));
      thumbBg.fillStyle(0x1a1a33, 1);
      thumbBg.fillRoundedRect(tx, ty, TILE_THUMB, TILE_THUMB, 4);
      thumbBg.lineStyle(1, 0x333366, 0.8);
      thumbBg.strokeRoundedRect(tx, ty, TILE_THUMB, TILE_THUMB, 4);
      this.paletteTilesGroup.push(thumbBg);

      // Tile sprite preview
      try {
        const img = this.addUI(
          this.add.image(tx + TILE_THUMB / 2, ty + TILE_THUMB / 2, tile.sheet, tile.id).setDepth(UI_DEPTH + 2)
        );
        const maxDim = Math.max(tile.region.w, tile.region.h);
        img.setScale((TILE_THUMB - 10) / maxDim);
        this.paletteTilesGroup.push(img);
      } catch {
        // Missing frame — draw placeholder
        const ph = this.addUI(this.add.graphics().setDepth(UI_DEPTH + 2));
        ph.fillStyle(0x333366, 0.5);
        ph.fillRect(tx + 6, ty + 6, TILE_THUMB - 12, TILE_THUMB - 12);
        this.paletteTilesGroup.push(ph);
      }

      // Name
      const name = this.addUI(
        this.add.text(tx + TILE_THUMB / 2, ty + TILE_THUMB + 2, tile.name, {
          fontSize: "7px", fontFamily: "Rajdhani, sans-serif", color: "#777799",
        }).setOrigin(0.5, 0).setDepth(UI_DEPTH + 2)
      );
      this.paletteTilesGroup.push(name);

      // Click zone
      const zone = this.addUI(
        this.add.zone(tx + TILE_THUMB / 2, ty + TILE_THUMB / 2, TILE_THUMB, TILE_THUMB)
          .setInteractive({ useHandCursor: true }).setDepth(UI_DEPTH + 4)
      );
      zone.on("pointerdown", () => this.selectBrush(tile.id));
      this.paletteTilesGroup.push(zone);

      col++;
      if (col >= COLS) { col = 0; row++; }
    }

    const totalRows = Math.ceil(tiles.length / COLS);
    this.paletteMaxScroll = Math.max(0, totalRows * (TILE_THUMB + TILE_PAD + 14) - tilesHeight);
  }

  private destroyPaletteTiles() {
    for (const obj of this.paletteTilesGroup) {
      obj.destroy();
    }
    this.paletteTilesGroup = [];
  }

  private destroyUI() {
    for (const obj of this.uiObjects) {
      obj.destroy();
    }
    this.uiObjects = [];
  }

  private selectBrush(tileId: string) {
    this.brushTileId = tileId;
    this.toolMode = "place";
    this.selectedId = null;
    this.clearGhost();

    const def = getTileDef(tileId);
    if (def) {
      this.ghostSprite = this.add.image(0, 0, def.sheet, def.id)
        .setScale(def.displayScale)
        .setAlpha(0.5)
        .setDepth(90);
      this.uiCam.ignore(this.ghostSprite);
    }
    this.updateToolbarText();
  }

  private clearGhost() {
    if (this.ghostSprite) {
      this.ghostSprite.destroy();
      this.ghostSprite = null;
    }
  }

  // ═══════════════════════════════════════
  // TOOLBAR (bottom bar)
  // ═══════════════════════════════════════

  private buildToolbar() {
    const W = this.W;
    const H = this.H;
    const ty = H - TOOLBAR_H;

    const bg = this.addUI(this.add.graphics().setDepth(UI_DEPTH));
    bg.fillStyle(0x111120, 0.97);
    bg.fillRect(0, ty, W, TOOLBAR_H);
    bg.lineStyle(2, 0x2a2a44, 1);
    bg.moveTo(0, ty);
    bg.lineTo(W, ty);
    bg.strokePath();

    this.layerText = this.addUI(
      this.add.text(10, ty + 10, "", {
        fontSize: "12px", fontFamily: "Rajdhani, sans-serif", color: "#5aabff", fontStyle: "bold",
      }).setDepth(UI_DEPTH + 1)
    );

    this.toolText = this.addUI(
      this.add.text(160, ty + 10, "", {
        fontSize: "12px", fontFamily: "Rajdhani, sans-serif", color: "#aaaacc",
      }).setDepth(UI_DEPTH + 1)
    );

    this.infoText = this.addUI(
      this.add.text(360, ty + 10, "", {
        fontSize: "12px", fontFamily: "Rajdhani, sans-serif", color: "#666688",
      }).setDepth(UI_DEPTH + 1)
    );

    // Help
    this.addUI(
      this.add.text(10, ty + 26, "SPACE=tool  G=grid  1/2/3=layer  Ctrl+Z=undo  Ctrl+S=save  R=rotate  +/-=scale  Del=delete  ESC=menu", {
        fontSize: "8px", fontFamily: "Rajdhani, sans-serif", color: "#444466",
      }).setDepth(UI_DEPTH + 1)
    );

    // Save button
    const saveBtn = this.addUI(
      this.add.text(W - PALETTE_W - 10, ty + 8, "[ SAVE ]", {
        fontSize: "13px", fontFamily: "Rajdhani, sans-serif", color: "#44cc44", fontStyle: "bold",
      }).setOrigin(1, 0).setDepth(UI_DEPTH + 2).setInteractive({ useHandCursor: true })
    );
    saveBtn.on("pointerdown", () => this.saveMap());

    // Load button
    const loadBtn = this.addUI(
      this.add.text(W - PALETTE_W - 80, ty + 8, "[ LOAD ]", {
        fontSize: "13px", fontFamily: "Rajdhani, sans-serif", color: "#ddaa44", fontStyle: "bold",
      }).setOrigin(1, 0).setDepth(UI_DEPTH + 2).setInteractive({ useHandCursor: true })
    );
    loadBtn.on("pointerdown", () => this.loadMap());

    this.updateToolbarText();
  }

  private updateToolbarText() {
    if (this.layerText) this.layerText.setText(`Layer: ${this.activeLayer.toUpperCase()}`);
    if (this.toolText) {
      const brush = this.brushTileId ? ` [${this.brushTileId.slice(0, 15)}]` : "";
      this.toolText.setText(`${this.toolMode.toUpperCase()}${brush}  Grid:${this.gridSnap ? "ON" : "OFF"}`);
    }
    if (this.infoText) this.infoText.setText(`Tiles: ${this.placed.size}`);
  }

  // ═══════════════════════════════════════
  // INPUT
  // ═══════════════════════════════════════

  private setupInput() {
    const paletteLeft = this.W - PALETTE_W;
    const toolbarTop = this.H - TOOLBAR_H;

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      // Don't interact with map when clicking on palette or toolbar
      if (pointer.x >= paletteLeft || pointer.y >= toolbarTop) return;

      const wp = this.mapCam.getWorldPoint(pointer.x, pointer.y);

      if (pointer.rightButtonDown()) {
        this.deleteTileAt(wp.x, wp.y);
        return;
      }

      switch (this.toolMode) {
        case "place":
          this.placeTileAt(wp.x, wp.y);
          break;
        case "select":
          this.selectTileAt(wp.x, wp.y);
          if (this.selectedId) {
            this.dragging = true;
            this.dragStartX = wp.x;
            this.dragStartY = wp.y;
            const entry = this.placed.get(this.selectedId);
            if (entry) {
              this.dragTileStartX = entry.data.x;
              this.dragTileStartY = entry.data.y;
            }
          }
          break;
        case "delete":
          this.deleteTileAt(wp.x, wp.y);
          break;
      }
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.dragging && this.selectedId && pointer.isDown) {
        const wp = this.mapCam.getWorldPoint(pointer.x, pointer.y);
        const dx = wp.x - this.dragStartX;
        const dy = wp.y - this.dragStartY;
        let newX = this.dragTileStartX + dx;
        let newY = this.dragTileStartY + dy;
        if (this.gridSnap) {
          newX = Math.round(newX / GRID_SIZE) * GRID_SIZE;
          newY = Math.round(newY / GRID_SIZE) * GRID_SIZE;
        }
        const entry = this.placed.get(this.selectedId);
        if (entry) {
          entry.data.x = newX;
          entry.data.y = newY;
          entry.sprite.setPosition(newX, newY);
        }
      }
    });

    this.input.on("pointerup", () => {
      if (this.dragging && this.selectedId) {
        const entry = this.placed.get(this.selectedId);
        if (entry && (entry.data.x !== this.dragTileStartX || entry.data.y !== this.dragTileStartY)) {
          this.undoStack.push({
            type: "move", tileId: this.selectedId,
            fromX: this.dragTileStartX, fromY: this.dragTileStartY,
            toX: entry.data.x, toY: entry.data.y,
          });
          this.redoStack = [];
        }
      }
      this.dragging = false;
    });

    // Zoom / palette scroll
    this.input.on("wheel", (_pointer: Phaser.Input.Pointer, _gos: unknown[], _dx: number, dy: number) => {
      const pointer = this.input.activePointer;
      if (pointer.x >= this.W - PALETTE_W) {
        // Scroll palette — move the tile objects
        this.paletteScrollY = Phaser.Math.Clamp(this.paletteScrollY + dy * 0.5, 0, this.paletteMaxScroll);
        // We'd need to rebuild to scroll... for now, zoom only on map
        return;
      }
      const factor = dy > 0 ? 0.9 : 1.1;
      this.mapCam.setZoom(Phaser.Math.Clamp(this.mapCam.zoom * factor, 0.05, 4));
    });

    // Keyboard
    if (this.input.keyboard) {
      this.input.keyboard.on("keydown", (event: KeyboardEvent) => {
        if (event.ctrlKey || event.metaKey) {
          if (event.key === "z") { event.preventDefault(); event.shiftKey ? this.redo() : this.undo(); }
          else if (event.key === "s") { event.preventDefault(); this.saveMap(); }
          return;
        }
        switch (event.key) {
          case "Escape": this.scene.start("MainMenu"); break;
          case " ": event.preventDefault(); this.cycleToolMode(); break;
          case "g": case "G": this.gridSnap = !this.gridSnap; this.updateToolbarText(); break;
          case "1": this.switchLayer("ground"); break;
          case "2": this.switchLayer("structures"); break;
          case "3": this.switchLayer("decorations"); break;
          case "Delete": case "Backspace": case "x": case "X":
            if (this.selectedId) this.deleteSelected(); break;
          case "r": case "R":
            if (this.selectedId) this.rotateSelected(); break;
          case "f":
            if (this.selectedId) this.flipSelected();
            else this.fitView();
            break;
          case "F": this.fitView(); break;
          case "+": case "=": if (this.selectedId) this.scaleSelected(1.15); break;
          case "-": case "_": if (this.selectedId) this.scaleSelected(0.87); break;
        }
      });
    }
  }

  private switchLayer(layer: LayerType) {
    this.activeLayer = layer;
    this.brushTileId = null;
    this.clearGhost();
    this.destroyPaletteTiles();
    this.destroyUI();
    this.buildPalette();
    this.buildToolbar();
  }

  private cycleToolMode() {
    const modes: ToolMode[] = ["place", "select", "delete"];
    const idx = modes.indexOf(this.toolMode);
    this.toolMode = modes[(idx + 1) % modes.length];
    if (this.toolMode !== "place") this.clearGhost();
    if (this.toolMode !== "select") this.selectedId = null;
    this.updateToolbarText();
  }

  // ═══════════════════════════════════════
  // TILE OPERATIONS
  // ═══════════════════════════════════════

  private placeTileAt(wx: number, wy: number) {
    if (!this.brushTileId) return;
    const def = getTileDef(this.brushTileId);
    if (!def) return;

    let x = wx, y = wy;
    if (this.gridSnap) {
      x = Math.round(x / GRID_SIZE) * GRID_SIZE;
      y = Math.round(y / GRID_SIZE) * GRID_SIZE;
    }

    const tileData: PlacedTile = { id: generateId(), tileId: this.brushTileId, x, y, scale: def.displayScale };
    this.addPlacedTile(tileData);
    this.undoStack.push({ type: "place", tile: { ...tileData } });
    this.redoStack = [];
    this.updateToolbarText();
  }

  private addPlacedTile(data: PlacedTile): PlacedSpriteEntry | null {
    const def = getTileDef(data.tileId);
    if (!def) return null;

    const depthBase = def.layer === "ground" ? 0 : def.layer === "structures" ? 10 : 20;
    const sprite = this.add.image(data.x, data.y, def.sheet, data.tileId)
      .setScale(data.scale ?? def.displayScale)
      .setRotation(data.rotation ?? 0)
      .setDepth(depthBase + (data.depth ?? 0));

    if (data.flipX) sprite.setFlipX(true);
    if (data.flipY) sprite.setFlipY(true);
    if (data.tint !== undefined) sprite.setTint(data.tint);
    if (data.alpha !== undefined) sprite.setAlpha(data.alpha);

    // Make sure uiCam doesn't render world sprites
    this.uiCam.ignore(sprite);

    const entry: PlacedSpriteEntry = { data, sprite };
    this.placed.set(data.id, entry);
    return entry;
  }

  private selectTileAt(wx: number, wy: number) {
    this.selectedId = null;
    let best: string | null = null;
    let bestDepth = -Infinity;
    for (const [id, entry] of this.placed) {
      const bounds = entry.sprite.getBounds();
      if (bounds.contains(wx, wy) && entry.sprite.depth > bestDepth) {
        best = id;
        bestDepth = entry.sprite.depth;
      }
    }
    this.selectedId = best;
  }

  private deleteTileAt(wx: number, wy: number) {
    let best: string | null = null;
    let bestDepth = -Infinity;
    for (const [id, entry] of this.placed) {
      const bounds = entry.sprite.getBounds();
      if (bounds.contains(wx, wy) && entry.sprite.depth > bestDepth) {
        best = id;
        bestDepth = entry.sprite.depth;
      }
    }
    if (best) {
      const entry = this.placed.get(best)!;
      this.undoStack.push({ type: "delete", tile: { ...entry.data } });
      this.redoStack = [];
      entry.sprite.destroy();
      this.placed.delete(best);
      if (this.selectedId === best) this.selectedId = null;
      this.updateToolbarText();
    }
  }

  private deleteSelected() {
    if (!this.selectedId) return;
    const entry = this.placed.get(this.selectedId);
    if (entry) {
      this.undoStack.push({ type: "delete", tile: { ...entry.data } });
      this.redoStack = [];
      entry.sprite.destroy();
      this.placed.delete(this.selectedId);
      this.selectedId = null;
      this.updateToolbarText();
    }
  }

  private rotateSelected() {
    if (!this.selectedId) return;
    const entry = this.placed.get(this.selectedId);
    if (entry) {
      entry.data.rotation = (entry.data.rotation ?? 0) + Math.PI / 2;
      entry.sprite.setRotation(entry.data.rotation);
    }
  }

  private flipSelected() {
    if (!this.selectedId) return;
    const entry = this.placed.get(this.selectedId);
    if (entry) {
      entry.data.flipX = !entry.data.flipX;
      entry.sprite.setFlipX(entry.data.flipX ?? false);
    }
  }

  private scaleSelected(factor: number) {
    if (!this.selectedId) return;
    const entry = this.placed.get(this.selectedId);
    if (entry) {
      const def = getTileDef(entry.data.tileId);
      const cur = entry.data.scale ?? def?.displayScale ?? 1;
      entry.data.scale = cur * factor;
      entry.sprite.setScale(entry.data.scale);
    }
  }

  // ═══════════════════════════════════════
  // UNDO / REDO
  // ═══════════════════════════════════════

  private undo() {
    const action = this.undoStack.pop();
    if (!action) return;
    switch (action.type) {
      case "place": {
        const entry = this.placed.get(action.tile.id);
        if (entry) { entry.sprite.destroy(); this.placed.delete(action.tile.id); }
        break;
      }
      case "delete": this.addPlacedTile(action.tile); break;
      case "move": {
        const entry = this.placed.get(action.tileId);
        if (entry) { entry.data.x = action.fromX; entry.data.y = action.fromY; entry.sprite.setPosition(action.fromX, action.fromY); }
        break;
      }
    }
    this.redoStack.push(action);
    this.updateToolbarText();
  }

  private redo() {
    const action = this.redoStack.pop();
    if (!action) return;
    switch (action.type) {
      case "place": this.addPlacedTile(action.tile); break;
      case "delete": {
        const entry = this.placed.get(action.tile.id);
        if (entry) { entry.sprite.destroy(); this.placed.delete(action.tile.id); }
        break;
      }
      case "move": {
        const entry = this.placed.get(action.tileId);
        if (entry) { entry.data.x = action.toX; entry.data.y = action.toY; entry.sprite.setPosition(action.toX, action.toY); }
        break;
      }
    }
    this.undoStack.push(action);
    this.updateToolbarText();
  }

  // ═══════════════════════════════════════
  // SAVE / LOAD
  // ═══════════════════════════════════════

  private saveMap() {
    const map: SavedMap = {
      version: 1, name: "endicott-estate", width: MAP_WIDTH, height: MAP_HEIGHT,
      layers: { ground: [], structures: [], decorations: [] },
      collisionZones: [], spawnPoints: [],
    };

    for (const [, entry] of this.placed) {
      const def = getTileDef(entry.data.tileId);
      if (!def) continue;
      map.layers[def.layer].push({ ...entry.data });

      if (def.collision) {
        const scale = entry.data.scale ?? def.displayScale;
        const cz: CollisionZone = {
          id: generateId(), linkedTileId: entry.data.id, shape: def.collision.shape,
          x: entry.data.x + def.collision.offsetX * scale,
          y: entry.data.y + def.collision.offsetY * scale,
        };
        if (def.collision.shape === "rect") { cz.width = (def.collision.width ?? 0) * scale; cz.height = (def.collision.height ?? 0) * scale; }
        else { cz.radius = (def.collision.radius ?? 0) * scale; }
        map.collisionZones.push(cz);
      }
    }

    saveMapToStorage(map);
    downloadMapJSON(map);

    const flash = this.addUI(
      this.add.text((this.W - PALETTE_W) / 2, this.H / 2, `SAVED! (${this.placed.size} tiles)`, {
        fontSize: "28px", fontFamily: "Rajdhani, sans-serif", color: "#44cc44", fontStyle: "bold",
      }).setOrigin(0.5).setDepth(UI_DEPTH + 10)
    );
    this.tweens.add({ targets: flash, alpha: 0, y: 220, duration: 1500, onComplete: () => flash.destroy() });
  }

  private loadMap() {
    const map = loadMapFromStorage();
    if (map) { this.applyLoadedMap(map); return; }

    const input = document.createElement("input");
    input.type = "file"; input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try { this.applyLoadedMap(JSON.parse(reader.result as string) as SavedMap); }
        catch { console.error("Failed to parse map JSON"); }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  private applyLoadedMap(map: SavedMap) {
    for (const [, entry] of this.placed) entry.sprite.destroy();
    this.placed.clear();
    this.selectedId = null;
    this.undoStack = [];
    this.redoStack = [];

    for (const layer of ["ground", "structures", "decorations"] as LayerType[]) {
      for (const td of map.layers[layer]) this.addPlacedTile(td);
    }
    this.updateToolbarText();
  }

  private loadExistingMap() {
    const map = loadMapFromStorage();
    if (map) this.applyLoadedMap(map);
  }

  // ═══════════════════════════════════════
  // GRID
  // ═══════════════════════════════════════

  private drawGrid(): Phaser.GameObjects.Graphics {
    const g = this.add.graphics().setDepth(-0.5);
    g.lineStyle(1, 0x333333, 0.12);
    for (let x = 0; x <= MAP_WIDTH; x += GRID_SIZE * 4) { g.moveTo(x, 0); g.lineTo(x, MAP_HEIGHT); }
    for (let y = 0; y <= MAP_HEIGHT; y += GRID_SIZE * 4) { g.moveTo(0, y); g.lineTo(MAP_WIDTH, y); }
    g.strokePath();
    g.lineStyle(3, 0xff4444, 0.5);
    g.strokeRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    return g;
  }

  private fitView() {
    this.mapCam.setZoom(0.2);
    this.mapCam.centerOn(MAP_WIDTH / 2, MAP_HEIGHT / 2);
  }
}
