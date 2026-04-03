import Phaser from "phaser";
import { CHARACTERS, DIRECTIONS } from "../data/characters";
import {
  CHARACTER_ANIMATIONS,
  getFrameKey,
  getAnimKey,
} from "../data/animations";

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: "Preload" });
  }

  preload() {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Add the loading background image
    this.add.image(width / 2, height / 2, "loading-bg").setDisplaySize(width, height);

    // Add the Loading text at the bottom
    this.add
      .text(width / 2, height - 50, "LOADING...", {
        fontSize: "32px",
        fontFamily: "HorrorPixel, monospace",
        color: "#ffffff",
        fontStyle: "bold",
        align: "center",
      })
      .setOrigin(0.5);

    // --- Original BootScene Preload Logic Below ---

    // Load character rotation sprites (static, used as fallback)
    for (const char of CHARACTERS) {
      for (const dir of DIRECTIONS) {
        this.load.image(
          `${char.id}-${dir}`,
          `/assets/sprites/${char.id}/rotations/${dir}.png`
        );
      }
    }

    // Load animation frames for characters that have them
    for (const [charId, anims] of Object.entries(CHARACTER_ANIMATIONS)) {
      for (const anim of anims) {
        for (const dir of DIRECTIONS) {
          for (let f = 0; f < anim.frames; f++) {
            const key = getFrameKey(charId, anim.type, dir, f);
            const path = `/assets/sprites/${charId}/${anim.type}/${dir}/frame_${String(f).padStart(3, "0")}.png`;
            this.load.image(key, path);
          }
        }
      }
    }

    // Load enemy rotation sprites
    for (const dir of DIRECTIONS) {
      this.load.image(
        `creepyzombie-${dir}`,
        `/assets/sprites/creepyzombie/rotations/${dir}.png`
      );
      this.load.image(
        `scaryboi-${dir}`,
        `/assets/sprites/scaryboi/rotations/${dir}.png`
      );
      this.load.image(
        `zombiedog-${dir}`,
        `/assets/sprites/zombiedog/rotations/${dir}.png`
      );
    }

    // Tiles
    this.load.image("grass-tile", "/assets/sprites/tiles/grass-patch.png");

    // Tilemap — village map (16x16 tiles, 80x65)
    this.load.tilemapTiledJSON("village-map", "/assets/maps/village.tmj");
    this.load.image("ts-ground", "/assets/tilesets/fantasy/Tileset_Ground.png");
    this.load.image("ts-road", "/assets/tilesets/fantasy/Tileset_Road.png");
    this.load.image("ts-water", "/assets/tilesets/fantasy/Tileset_Water.png");
    this.load.image("ts-rockslope", "/assets/tilesets/fantasy/Tileset_RockSlope_Simple.png");

    // Tilemap — Endicott Estate (32x32 tiles, 60x60)
    this.load.tilemapTiledJSON("endicott-map", "/assets/maps/endicott.tmj");
    this.load.image("ts-cainos-grass", "/assets/tilesets/basic-grass.png");
    this.load.image("ts-basic-struct", "/assets/tilesets/basic-struct.png");
    this.load.image("ts-basic-wall", "/assets/tilesets/basic-wall.png");
    this.load.image("ts-bp-ground-32", "/assets/tilesets/bloompixel/bp-ground-32.png");
    this.load.image("ts-td-basic-grass", "/assets/tilesets/td-basic-grass.png");
    // Tree spritesheets (64x64 per frame, used as individual sprites for overlap)
    this.load.spritesheet("trees-64", "/assets/tilesets/bloompixel/bp-trees-64.png", { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet("dark-trees-64", "/assets/tilesets/bloompixel/bp-dark-trees-64.png", { frameWidth: 64, frameHeight: 64 });

    // Buildings
    this.load.image("endicott-v1", "/assets/sprites/endicott-v1.png");
    this.load.image("fountain", "/assets/sprites/fountain.png");
    this.load.image("greenhouse", "/assets/sprites/greenhouse.png");
    this.load.image("gazebo", "/assets/sprites/gazebo.png");

    // Item sprites
    this.load.image("item-pistol", "/assets/sprites/items/pistol.png");
    this.load.image("item-shotgun", "/assets/sprites/items/shotgun.png");
    this.load.image("item-smg", "/assets/sprites/items/smg.png");
    this.load.image("item-grenade", "/assets/sprites/items/grenade.png");
    this.load.image("bullet", "/assets/sprites/items/bullet.png");
    this.load.image("bullet-fire", "/assets/sprites/items/bullet-fire.png");
    this.load.image("item-ammo", "/assets/sprites/items/ammo.png");
    this.load.image("item-ammo-box", "/assets/sprites/items/ammo-box.png");
    this.load.image("item-landmine", "/assets/sprites/items/landmine.png");
    this.load.image("item-bandage", "/assets/sprites/items/bandage.png");
    this.load.image("item-syringe", "/assets/sprites/items/syringe.png");
    this.load.image("trap-spikes", "/assets/sprites/items/trap-spikes.png");
    this.load.image("trap-barricade", "/assets/sprites/items/trap-barricade.png");
    this.load.image("trap-landmine", "/assets/sprites/items/trap-landmine.png");

    // Health/stamina bars (Pulsing Heart pack, split into halves)
    this.load.image("ui-bar-hp-full", "/assets/sprites/ui/bar-full-red.png");
    this.load.image("ui-bar-hp-empty", "/assets/sprites/ui/bar-empty-top.png");
    this.load.image("ui-bar-st-full", "/assets/sprites/ui/bar-full-blue.png");
    this.load.image("ui-bar-st-empty", "/assets/sprites/ui/bar-empty-bot.png");

    // HUD UI sprites
    this.load.image("ui-icon-heart", "/assets/sprites/ui/horror/icon-heart.png");
    this.load.image("ui-icon-lightning", "/assets/sprites/ui/horror/icon-stamina.png");
    this.load.image("ui-icon-skull", "/assets/sprites/ui/horror/icon-skull.png");
    this.load.image("ui-icon-coin", "/assets/sprites/ui/horror/icon-currency.png");
    this.load.image("ui-icon-star", "/assets/sprites/ui/icon-star.png");
    this.load.image("ui-icon-sword", "/assets/sprites/ui/icon-sword.png");
    this.load.image("ui-panel-main", "/assets/sprites/ui/panel-main.png");
    this.load.image("ui-panel-sm", "/assets/sprites/ui/panel-sm.png");
    this.load.image("ui-panel-dark", "/assets/sprites/ui/panel-dark.png");
    this.load.image("ui-panel-button", "/assets/sprites/ui/panel-button.png");
    this.load.image("ui-bar-frame", "/assets/sprites/ui/bar-frame.png");

    // Horror UI Kit sprites
    this.load.image("ui-horror-panel", "/assets/sprites/ui/horror/panel-frame.png");
    this.load.image("ui-horror-slot", "/assets/sprites/ui/horror/slot-inactive.png");
    this.load.image("ui-horror-slot-active", "/assets/sprites/ui/horror/slot-active.png");
    this.load.image("ui-horror-bar-frame", "/assets/sprites/ui/horror/bar-frame.png");
    this.load.image("ui-horror-button", "/assets/sprites/ui/horror/button-normal.png");
    this.load.image("ui-horror-button-hover", "/assets/sprites/ui/horror/button-hover.png");
    this.load.image("ui-horror-divider", "/assets/sprites/ui/horror/divider.png");

    // UI tile backgrounds (horror-themed panel surfaces)
    this.load.image("ui-tile-wood", "/assets/sprites/ui/tiles/wood-plank.png");
    this.load.image("ui-tile-stone", "/assets/sprites/ui/tiles/stone-brick.png");
    this.load.image("ui-frame-tl", "/assets/sprites/ui/tiles/frame-tl.png");
    this.load.image("ui-frame-tr", "/assets/sprites/ui/tiles/frame-tr.png");
    this.load.image("ui-frame-bl", "/assets/sprites/ui/tiles/frame-bl.png");
    this.load.image("ui-frame-br", "/assets/sprites/ui/tiles/frame-br.png");
    this.load.image("ui-splash-graveyard", "/assets/sprites/ui/tiles/splash-graveyard.png");

    // Effect sprites
    this.load.image("fx-muzzle-flash", "/assets/sprites/items/muzzle-flash.png");
    this.load.image("fx-explosion", "/assets/sprites/items/explosion.png");
    this.load.image("fx-smoke", "/assets/sprites/items/smoke-puff.png");
    this.load.image("fx-spark", "/assets/sprites/items/spark.png");

    // Audio
    // Weapons (2 variants per weapon for variety)
    this.load.audio("sfx-pistol", "/assets/audio/weapons/weapon-sfx-misc.wav");
    this.load.audio("sfx-pistol2", "/assets/audio/weapons/pistol-fire-2.wav");
    this.load.audio("sfx-shotgun", "/assets/audio/weapons/pistol-fire-1.wav");
    this.load.audio("sfx-shotgun2", "/assets/audio/weapons/shotgun-blast-el.wav");
    this.load.audio("sfx-shotgun-pump", "/assets/audio/weapons/shotgun-pump.wav");
    this.load.audio("sfx-smg", "/assets/audio/weapons/smg-fire-1.wav");
    this.load.audio("sfx-smg2", "/assets/audio/weapons/smg-fire-2.wav");
    this.load.audio("sfx-dryfire", "/assets/audio/weapons/dry-fire-click.wav");
    this.load.audio("sfx-reload-shotgun", "/assets/audio/weapons/shotguncock.wav");
    this.load.audio("sfx-reload-rifle", "/assets/audio/weapons/assaultriflereload1.wav");
    // Melee (expanded pool)
    this.load.audio("sfx-punch1", "/assets/audio/melee/punch-hit-1.wav");
    this.load.audio("sfx-punch2", "/assets/audio/melee/punch-hit-2.wav");
    this.load.audio("sfx-punch3", "/assets/audio/melee/punch-hit-3.wav");
    this.load.audio("sfx-punch-body1", "/assets/audio/melee/punch-body-1.wav");
    this.load.audio("sfx-punch-body2", "/assets/audio/melee/punch-body-2.wav");
    this.load.audio("sfx-hit-classic", "/assets/audio/melee/hit-classic.wav");
    this.load.audio("sfx-punch-foley", "/assets/audio/melee/punch-foley.wav");
    this.load.audio("sfx-slap", "/assets/audio/melee/slap.wav");
    this.load.audio("sfx-whoosh", "/assets/audio/melee/punch-whoosh.wav");
    this.load.audio("sfx-grunt", "/assets/audio/melee/grunt-effort.wav");
    // Player
    this.load.audio("sfx-player-grunt", "/assets/audio/player/player-grunt.wav");
    this.load.audio("sfx-player-panting", "/assets/audio/player/player-panting.wav");
    // Enemies — zombie groans as death sounds
    this.load.audio("sfx-enemy-death1", "/assets/audio/enemies/zombie-death-1.wav");
    this.load.audio("sfx-enemy-death2", "/assets/audio/enemies/zombie-death-2.wav");
    this.load.audio("sfx-enemy-death3", "/assets/audio/enemies/zombie-death-3.wav");
    this.load.audio("sfx-enemy-death4", "/assets/audio/enemies/zombie-death-4.wav");
    this.load.audio("sfx-enemy-death5", "/assets/audio/enemies/zombie-death-5.wav");
    this.load.audio("sfx-enemy-death6", "/assets/audio/enemies/zombie-death-6.wav");
    this.load.audio("sfx-enemy-death7", "/assets/audio/enemies/zombie-death-7.wav");
    this.load.audio("sfx-enemy-death8", "/assets/audio/enemies/zombie-death-8.wav");
    this.load.audio("sfx-gore-splat", "/assets/audio/enemies/gore-splat.wav");
    // Enemy bites (expanded)
    this.load.audio("sfx-bite", "/assets/audio/enemies/bite-chomp.wav");
    this.load.audio("sfx-zombie-bite", "/assets/audio/enemies/zombie-bite-1.wav");
    this.load.audio("sfx-zombie-bite2", "/assets/audio/enemies/zombie-bite-2.wav");
    this.load.audio("sfx-zombie-bite3", "/assets/audio/enemies/zombie-bite-3.wav");
    this.load.audio("sfx-zombie-bite-f", "/assets/audio/enemies/zombie-bite-female.wav");
    // Zombie groans (ambient idle sounds)
    for (let i = 1; i <= 12; i++) {
      this.load.audio(`sfx-groan${i}`, `/assets/audio/enemies/groans/zombie-groan-${i}.wav`);
    }
    // Horror stingers (wave transitions)
    this.load.audio("sfx-horror1", "/assets/audio/enemies/horror-fx-1.wav");
    this.load.audio("sfx-horror2", "/assets/audio/enemies/horror-fx-2.wav");
    // Traps
    this.load.audio("sfx-explosion", "/assets/audio/traps/explosion.wav");
    this.load.audio("sfx-trap-place", "/assets/audio/traps/trap-place.wav");
    // UI
    this.load.audio("sfx-buy", "/assets/audio/ui/shop-buy.wav");
    this.load.audio("sfx-click", "/assets/audio/ui/ui-click.wav");
    this.load.audio("sfx-confirm", "/assets/audio/ui/confirmation_002.ogg");
    this.load.audio("sfx-church-bell", "/assets/audio/ui/church-bell.wav");
    this.load.audio("sfx-error", "/assets/audio/ui/error_004.ogg");
    // Footsteps
    for (let i = 1; i <= 6; i++) {
      this.load.audio(`sfx-step-grass${i}`, `/assets/audio/footsteps/footstep-grass-${i}.ogg`);
    }
    for (let i = 1; i <= 6; i++) {
      this.load.audio(`sfx-step-gravel${i}`, `/assets/audio/footsteps/footstep-gravel-${i}.ogg`);
    }
    for (let i = 1; i <= 5; i++) {
      this.load.audio(`sfx-step-wood${i}`, `/assets/audio/footsteps/footstep-wood-${i}.ogg`);
    }
    // Ambient
    this.load.audio("sfx-ambient-birds", "/assets/audio/ambient/forest-birds.wav");
    this.load.audio("sfx-ambient-rain", "/assets/audio/ambient/forest-rain.wav");
    this.load.audio("sfx-creepy-whisper", "/assets/audio/ambient/creepy-whisper.wav");
    // Voice lines
    this.load.audio("sfx-voice1", "/assets/audio/voice/voice-line-liam-1.mp3");
    this.load.audio("sfx-voice2", "/assets/audio/voice/voice-line-liam-2.mp3");
    this.load.audio("sfx-voice3", "/assets/audio/voice/voice-line-liam-3.mp3");
  }

  async create() {
    // Register animations (skip directions with missing frame textures)
    for (const [charId, anims] of Object.entries(CHARACTER_ANIMATIONS)) {
      for (const anim of anims) {
        for (const dir of DIRECTIONS) {
          const animKey = getAnimKey(charId, anim.type, dir);
          const frames: Phaser.Types.Animations.AnimationFrame[] = [];

          let allFramesExist = true;
          for (let f = 0; f < anim.frames; f++) {
            const fk = getFrameKey(charId, anim.type, dir, f);
            if (!this.textures.exists(fk)) {
              allFramesExist = false;
              break;
            }
            frames.push({ key: fk });
          }
          if (!allFramesExist) continue; // skip

          const isLooping =
            anim.type === "walk" || anim.type === "breathing-idle"
            || anim.type === "running-6-frames" || anim.type === "running-8-frames"
            || anim.type === "fight-stance-idle-8-frames";

          let frameRate = 8;
          if (anim.type === "walk") frameRate = 10;
          else if (anim.type === "running-6-frames") frameRate = 14;
          else if (anim.type === "running-8-frames") frameRate = 12;
          else if (anim.type === "fight-stance-idle-8-frames") frameRate = 8;
          else if (anim.type === "cross-punch") frameRate = 18;
          else if (anim.type === "lead-jab") frameRate = 16;
          else if (anim.type === "taking-punch") frameRate = 14;
          else if (anim.type === "falling-back-death") frameRate = 10;
          else if (anim.type === "shooting-pistol") frameRate = 12;
          else if (anim.type === "shooting-shotgun") frameRate = 10;
          else if (anim.type === "shooting-smg") frameRate = 16;
          else if (anim.type === "fireball") frameRate = 12;
          else if (anim.type === "throw-object") frameRate = 10;
          else if (anim.type === "running-jump") frameRate = 14;
          else if (anim.type === "backflip") frameRate = 14;
          else if (anim.type === "high-kick") frameRate = 16;
          else if (anim.type === "swinging-katana") frameRate = 14;
          else if (anim.type === "throw-grenade") frameRate = 10;
          else if (anim.type === "walking-shooting-pistol") frameRate = 10;
          else if (anim.type === "light-cigarette") frameRate = 6;
          else if (anim.type === "bite") frameRate = 12;
          else if (anim.type === "lunge-bite") frameRate = 12;
          else if (anim.type === "death") frameRate = 20;
          else if (anim.type === "gunshot-death") frameRate = 16;
          else if (anim.type === "leap") frameRate = 12;

          this.anims.create({
            key: animKey,
            frames,
            frameRate,
            repeat: isLooping ? -1 : 0,
          });
        }
      }
    }

    // Generate pre-rotated vertical barricade texture
    const bSrc = this.textures.get("trap-barricade").getSourceImage() as HTMLImageElement;
    const canvas = document.createElement("canvas");
    canvas.width = bSrc.height;
    canvas.height = bSrc.width;
    const ctx = canvas.getContext("2d")!;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(bSrc, -bSrc.width / 2, -bSrc.height / 2);
    this.textures.addCanvas("trap-barricade-v", canvas);

    this.scene.start("MainMenu");
  }
}
