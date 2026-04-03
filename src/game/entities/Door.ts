import Phaser from "phaser";

export interface DoorConfig {
  id: string;
  name: string;
  cost: number;
  unlocksZone: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export class Door extends Phaser.GameObjects.Rectangle {
  public id: string;
  public cost: number;
  public unlocksZone: string;
  private isUnlocked: boolean = false;
  private interactionZone: Phaser.GameObjects.Zone;
  private promptText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, config: DoorConfig) {
    super(scene, config.x, config.y, config.width, config.height, 0x552222, 0.8);
    
    this.id = config.id;
    this.cost = config.cost;
    this.unlocksZone = config.unlocksZone;

    scene.add.existing(this);
    scene.physics.add.existing(this, true); // Static body

    // Interaction zone (larger than the door itself)
    this.interactionZone = scene.add.zone(config.x, config.y, config.width + 40, config.height + 40);
    scene.physics.add.existing(this.interactionZone, true);

    // Prompt text
    this.promptText = scene.add.text(config.x, config.y - 40, `[E] Open Door (${this.cost})`, {
      fontSize: '16px',
      fontFamily: 'HorrorPixel, monospace',
      color: '#ffffff',
      backgroundColor: '#000000aa',
      padding: { x: 4, y: 2 }
    }).setOrigin(0.5).setVisible(false);
  }

  showPrompt(visible: boolean) {
    if (this.isUnlocked) return;
    this.promptText.setVisible(visible);
  }

  unlock() {
    this.isUnlocked = true;
    this.promptText.destroy();
    this.destroy(); // Remove the barrier
  }

  getInteractionZone() {
    return this.interactionZone;
  }
}
