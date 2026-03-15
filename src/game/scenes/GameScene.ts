import Phaser from "phaser";
import { Player, PlayerStats } from "../entities/Player";
import { CHARACTERS, CharacterDef } from "../data/characters";
import {
  drawMap,
  drawLighting,
  drawHidingGroveCanopy,
  MAP_WIDTH,
  MAP_HEIGHT,
  MANSION,
  LIBRARY,
  GIANT_WILLOW,
  HIDING_GROVE,
} from "../map/EndicottEstate";

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private characterDef!: CharacterDef;
  private mansionBody!: Phaser.Physics.Arcade.StaticGroup;

  constructor() {
    super({ key: "Game" });
  }

  init(data: { characterId?: string }) {
    const id = data?.characterId || "rick";
    this.characterDef = CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
  }

  create() {
    // Draw the estate map
    drawMap(this);

    // Hiding grove canopy (renders above player)
    drawHidingGroveCanopy(this);

    // Lighting overlay
    drawLighting(this);

    // Solid obstacle collisions
    this.mansionBody = this.physics.add.staticGroup();

    // Mansion
    const mansionZone = this.add
      .zone(
        MANSION.x + MANSION.width / 2,
        MANSION.y + MANSION.height / 2,
        MANSION.width,
        MANSION.height
      )
      .setOrigin(0.5);
    this.physics.add.existing(mansionZone, true);
    this.mansionBody.add(mansionZone);

    // Library
    const libraryZone = this.add
      .zone(
        LIBRARY.x + LIBRARY.width / 2,
        LIBRARY.y + LIBRARY.height / 2,
        LIBRARY.width,
        LIBRARY.height
      )
      .setOrigin(0.5);
    this.physics.add.existing(libraryZone, true);
    this.mansionBody.add(libraryZone);

    // Giant willow (circular collision approximated with a square)
    const willowSize = GIANT_WILLOW.radius * 1.2;
    const willowZone = this.add
      .zone(GIANT_WILLOW.x, GIANT_WILLOW.y, willowSize, willowSize)
      .setOrigin(0.5);
    this.physics.add.existing(willowZone, true);
    (willowZone.body as Phaser.Physics.Arcade.StaticBody).setCircle(GIANT_WILLOW.radius * 0.6);
    this.mansionBody.add(willowZone);

    // Hiding grove trees (each tree is impassable, pocket between them is walkable)
    for (const tree of HIDING_GROVE) {
      const treeZone = this.add
        .zone(tree.x, tree.y, tree.collisionRadius * 2, tree.collisionRadius * 2)
        .setOrigin(0.5);
      this.physics.add.existing(treeZone, true);
      (treeZone.body as Phaser.Physics.Arcade.StaticBody).setCircle(tree.collisionRadius);
      this.mansionBody.add(treeZone);
    }

    // Spawn player south of mansion
    const spawnX = MAP_WIDTH / 2;
    const spawnY = MAP_HEIGHT / 2 + 300;
    const stats = this.characterDef.stats;

    this.player = new Player(this, spawnX, spawnY, this.characterDef.id, {
      speed: stats.speed,
      maxHealth: stats.hp,
      maxStamina: stats.stamina,
      health: stats.hp,
      stamina: stats.stamina,
      regen: stats.regen,
      damage: stats.damage,
    });

    // Camera
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setZoom(1);
    this.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);

    // World bounds
    this.physics.world.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
    this.player.body.setCollideWorldBounds(true);

    // Player collides with mansion
    this.physics.add.collider(this.player, this.mansionBody);

    // Controls hint
    const { width, height } = this.cameras.main;
    this.add
      .text(width / 2, height - 16, "WASD / Arrow Keys to move", {
        fontSize: "12px",
        fontFamily: "monospace",
        color: "#555566",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(100);

    // Character name
    this.add
      .text(16, 16, `${this.characterDef.fullName} — ${this.characterDef.className}`, {
        fontSize: "14px",
        fontFamily: "monospace",
        color: "#888899",
      })
      .setScrollFactor(0)
      .setDepth(100);
  }

  update() {
    this.player.update();
  }
}
