/**
 * HUDState — Bridge between Phaser game world and React HUD overlay.
 *
 * Phaser writes to this singleton every frame via update().
 * React reads via useSyncExternalStore for zero-lag reactivity.
 */

import type { BuffOption } from "./systems/LevelingSystem";

export type { BuffOption };

export interface ShopItemData {
  id: string;
  name: string;
  desc: string;
  price: number;
  icon: string;
  locked: boolean;
  unlockWave?: number;
  equipped: boolean;
  canAfford: boolean;
  category: "supplies" | "weapons" | "traps";
}

export interface LeaderboardEntry {
  id: number;
  name: string;
  kills: number;
  wave: number;
  character_id: string;
}

export interface HUDData {
  // Player
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  burnedOut: boolean;
  level: number;

  // Hotbar
  activeSlot: number;
  equippedWeapon: string | null;
  ammo: number;
  maxAmmo: number;
  reserveAmmo: number;
  reloading: boolean;
  barricadeCount: number;
  mineCount: number;

  // Ability
  abilityName: string;
  abilityCooldown: number;
  abilityMaxCooldown: number;
  abilityKey: string;

  // Economy
  kills: number;
  currency: number;

  // Wave
  wave: number;
  waveState: "pre_game" | "active" | "intermission";
  waveEnemiesLeft: number;
  waveCountdown: number;

  // Character
  characterName: string;
  characterId: string;

  // Shop
  shopItems: ShopItemData[];
  shopSelectedIndex: number;
  shopMessage: string;
  shopMessageColor: string;

  // Menu state
  menuVisible: boolean;
  menuCharIndex: number;

  // UI state
  hudVisible: boolean;
  shopOpen: boolean;
  paused: boolean;
  gameOver: boolean;

  // Wave announcements
  waveAnnouncement: string;
  waveAnnouncementKey: number;

  // Countdown
  countdownKey: number;

  // Minimap position (static, set once)
  minimapX: number;
  minimapY: number;
  minimapSize: number;

  // Zoom
  zoomPercent: number;
  zoomVisible: boolean;

  // Settings
  settingsOpen: boolean;
  sfxVolume: number;
  zoomEnabled: boolean;

  // Level-up
  levelUpActive: boolean;
  levelUpLevel: number;
  levelUpOptions: BuffOption[];

  // Game over
  gameOverPhase: "" | "death" | "entry" | "leaderboard";
  gameOverWave: number;
  gameOverKills: number;
  gameOverCharName: string;
  leaderboard: LeaderboardEntry[];
  leaderboardHighlightId: number | null;

  // Stats screen
  statsOpen: boolean;
  statsEffective: {
    damage: number;
    maxHealth: number;
    maxStamina: number;
    speed: number;
    regen: number;
    critChance: number;
    killBonusPct: number;
  };
  statsBase: {
    damage: number;
    hp: number;
    stamina: number;
    speed: number;
    regen: number;
    critChance: number;
  };
  statsBuffs: { category: string; tier: string; name: string }[];
  statsXp: number;
  statsXpNeeded: number;
  statsClassName: string;

  // Dev panel
  devPanelOpen: boolean;
  devMode: boolean;
  devSpawningDisabled: boolean;

  // SCARYBOI intro cinematic
  scaryboiIntroActive: boolean;
}

const DEFAULT_STATE: HUDData = {
  health: 100,
  maxHealth: 100,
  stamina: 100,
  maxStamina: 100,
  burnedOut: false,
  level: 1,
  activeSlot: 0,
  equippedWeapon: null,
  ammo: 0,
  maxAmmo: 0,
  reserveAmmo: 0,
  reloading: false,
  barricadeCount: 0,
  mineCount: 0,
  abilityName: "",
  abilityCooldown: 0,
  abilityMaxCooldown: 0,
  abilityKey: "R",
  kills: 0,
  currency: 0,
  wave: 1,
  waveState: "pre_game",
  waveEnemiesLeft: 0,
  waveCountdown: -1,
  characterName: "",
  characterId: "",
  shopItems: [],
  shopSelectedIndex: 0,
  shopMessage: "",
  shopMessageColor: "",
  menuVisible: false,
  menuCharIndex: 0,
  hudVisible: false,
  shopOpen: false,
  paused: false,
  gameOver: false,
  waveAnnouncement: "",
  waveAnnouncementKey: 0,
  countdownKey: 0,
  minimapX: 0,
  minimapY: 0,
  minimapSize: 0,
  zoomPercent: 100,
  zoomVisible: false,
  settingsOpen: false,
  sfxVolume: 0.5,
  zoomEnabled: false,
  levelUpActive: false,
  levelUpLevel: 1,
  levelUpOptions: [],
  gameOverPhase: "",
  gameOverWave: 0,
  gameOverKills: 0,
  gameOverCharName: "",
  leaderboard: [],
  leaderboardHighlightId: null,
  statsOpen: false,
  statsEffective: { damage: 0, maxHealth: 0, maxStamina: 0, speed: 0, regen: 0, critChance: 0, killBonusPct: 0 },
  statsBase: { damage: 0, hp: 0, stamina: 0, speed: 0, regen: 0, critChance: 0 },
  statsBuffs: [],
  statsXp: 0,
  statsXpNeeded: 0,
  statsClassName: "",
  devPanelOpen: false,
  devMode: false,
  devSpawningDisabled: false,
  scaryboiIntroActive: false,
};

type Listener = () => void;
type ActionHandler = (action: string, payload?: any) => void;

class HUDStateStore {
  private state: HUDData = { ...DEFAULT_STATE };
  private listeners: Set<Listener> = new Set();

  // Action dispatchers — React calls dispatch, Phaser registers handler
  private shopAction: ActionHandler | null = null;
  private menuAction: ActionHandler | null = null;
  private pauseAction: ActionHandler | null = null;
  private levelUpAction: ActionHandler | null = null;
  private gameOverAction: ActionHandler | null = null;

  registerShopAction(handler: ActionHandler) { this.shopAction = handler; }
  dispatchShopAction(action: string, payload?: any) { this.shopAction?.(action, payload); }

  registerMenuAction(handler: ActionHandler) { this.menuAction = handler; }
  dispatchMenuAction(action: string, payload?: any) { this.menuAction?.(action, payload); }

  registerPauseAction(handler: ActionHandler) { this.pauseAction = handler; }
  dispatchPauseAction(action: string, payload?: any) { this.pauseAction?.(action, payload); }

  registerLevelUpAction(handler: ActionHandler) { this.levelUpAction = handler; }
  dispatchLevelUpAction(action: string, payload?: any) { this.levelUpAction?.(action, payload); }

  registerGameOverAction(handler: ActionHandler) { this.gameOverAction = handler; }
  dispatchGameOverAction(action: string, payload?: any) { this.gameOverAction?.(action, payload); }

  private devAction: ActionHandler | null = null;
  registerDevAction(handler: ActionHandler) { this.devAction = handler; }
  dispatchDevAction(action: string, payload?: any) { this.devAction?.(action, payload); }

  private scaryboiIntroAction: ActionHandler | null = null;
  registerScaryboiIntroAction(handler: ActionHandler) { this.scaryboiIntroAction = handler; }
  dispatchScaryboiIntroAction(action: string, payload?: any) { this.scaryboiIntroAction?.(action, payload); }

  /** Called by Phaser every frame (or on change) to push new state */
  update(partial: Partial<HUDData>) {
    let changed = false;
    for (const key of Object.keys(partial) as (keyof HUDData)[]) {
      if (this.state[key] !== partial[key]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;

    this.state = { ...this.state, ...partial };
    this.listeners.forEach((fn) => fn());
  }

  /** Reset to defaults (e.g. on scene restart) */
  reset() {
    this.state = { ...DEFAULT_STATE };
    this.listeners.forEach((fn) => fn());
  }

  // --- useSyncExternalStore API ---

  getSnapshot = (): HUDData => this.state;

  /** Get a single field value (for leaf-level selectors) */
  getField = <K extends keyof HUDData>(key: K): HUDData[K] => this.state[key];

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

/** Singleton — import this in both Phaser and React */
export const hudState = new HUDStateStore();
