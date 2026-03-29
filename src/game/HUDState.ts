/**
 * HUDState — Bridge between Phaser game world and React HUD overlay.
 *
 * Phaser writes to this singleton every frame via update().
 * React reads via useSyncExternalStore for zero-lag reactivity.
 *
 * Each React component subscribes to only the fields it needs via
 * useHUDField() or useHUDFields(), preventing unnecessary re-renders.
 */

export interface HUDData {
  // Player
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  burnedOut: boolean;
  level: number;

  // Hotbar
  activeSlot: number; // 0=fists, 1=weapon, 2=barricade, 3=mine
  equippedWeapon: string | null; // "pistol" | "shotgun" | "smg" | null
  ammo: number;
  maxAmmo: number;
  barricadeCount: number;
  mineCount: number;

  // Ability
  abilityName: string;
  abilityCooldown: number; // seconds remaining, 0 = ready
  abilityKey: string; // "R"

  // Economy
  kills: number;
  currency: number;

  // Wave
  wave: number;
  waveState: "pre_game" | "active" | "intermission";
  waveEnemiesLeft: number;
  waveCountdown: number; // seconds, -1 if not counting

  // Character
  characterName: string;
  characterId: string;

  // UI state
  hudVisible: boolean;
  shopOpen: boolean;
  paused: boolean;
  gameOver: boolean;
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
  barricadeCount: 0,
  mineCount: 0,
  abilityName: "",
  abilityCooldown: 0,
  abilityKey: "R",
  kills: 0,
  currency: 0,
  wave: 1,
  waveState: "pre_game",
  waveEnemiesLeft: 0,
  waveCountdown: -1,
  characterName: "",
  characterId: "",
  hudVisible: false,
  shopOpen: false,
  paused: false,
  gameOver: false,
};

type Listener = () => void;

class HUDStateStore {
  private state: HUDData = { ...DEFAULT_STATE };
  private listeners: Set<Listener> = new Set();

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
