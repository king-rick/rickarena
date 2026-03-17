import Phaser from "phaser";
import { SavedMap, CollisionZone, loadMapFromStorage, LayerType } from "./MapSaveFormat";
import { getTileDef } from "./TileCatalog";

/**
 * Renders a saved sprite map into a scene, replacing Graphics-based drawing.
 * Returns collision zones for physics setup.
 */
export class SpriteMapRenderer {
  /** Check if a saved sprite map exists */
  static hasSavedMap(): boolean {
    return loadMapFromStorage() !== null;
  }

  /** Load and render the saved map into the scene */
  static render(scene: Phaser.Scene): CollisionZone[] {
    const map = loadMapFromStorage();
    if (!map) return [];

    const allCollisions: CollisionZone[] = [];

    // Render each layer with appropriate depth ranges
    const depthBases: Record<LayerType, number> = {
      ground: 0,
      structures: 5,
      decorations: 15,
    };

    for (const layerName of ["ground", "structures", "decorations"] as LayerType[]) {
      const tiles = map.layers[layerName];
      const depthBase = depthBases[layerName];

      for (const tile of tiles) {
        const def = getTileDef(tile.tileId);
        if (!def) continue;

        const img = scene.add.image(tile.x, tile.y, def.sheet, tile.tileId);
        img.setScale(tile.scale ?? def.displayScale);
        img.setRotation(tile.rotation ?? 0);
        img.setDepth(depthBase + (tile.depth ?? 0));

        if (tile.flipX) img.setFlipX(true);
        if (tile.flipY) img.setFlipY(true);
        if (tile.tint !== undefined) img.setTint(tile.tint);
        if (tile.alpha !== undefined) img.setAlpha(tile.alpha);
      }
    }

    // Collect collision zones (auto-generated from tiles + manually placed)
    allCollisions.push(...map.collisionZones);

    return allCollisions;
  }

  /** Create physics bodies from collision zones */
  static createCollisionBodies(
    scene: Phaser.Scene,
    obstacles: Phaser.Physics.Arcade.StaticGroup,
    zones: CollisionZone[],
  ): void {
    for (const zone of zones) {
      if (zone.shape === "rect" && zone.width && zone.height) {
        const body = scene.add.zone(zone.x, zone.y, zone.width, zone.height);
        scene.physics.add.existing(body, true);
        obstacles.add(body);
      } else if (zone.shape === "circle" && zone.radius) {
        const body = scene.add.zone(zone.x, zone.y, zone.radius * 2, zone.radius * 2);
        scene.physics.add.existing(body, true);
        const physBody = body.body as Phaser.Physics.Arcade.Body;
        if (physBody) {
          physBody.setCircle(zone.radius);
        }
        obstacles.add(body);
      }
    }
  }
}
