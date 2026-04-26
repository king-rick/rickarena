# RickArena — Claude Code Project Context

## What is this
Top-down wave survival game (Call of Duty Zombies inspired). Phaser 3 game engine, Next.js shell, TypeScript, deployed on Vercel. Single-player currently, co-op planned.

## Commands
- `npm run dev` — local dev server at localhost:3000
- `npm run build` — production build (also used by Vercel)
- `npx tsc --noEmit` — type check without emitting (run after code changes)
- No test suite — validation is manual playtesting

## Architecture

### Key files by size/importance
- `src/game/scenes/GameScene.ts` (~5,700 lines) — God Class. Main gameplay loop, input, spawning, combat, economy, HUD. Too large for single context window — use Cursor+Codex for edits here.
- `src/game/entities/Enemy.ts` (~2,100 lines) — All enemy AI: basic zombies, dogs, SCARYBOI boss, Mason boss. Each enemy type has its own update method.
- `src/game/systems/WaveManager.ts` (~880 lines) — Wave progression, enemy composition, spawn timing, intermission phases.
- `src/game/entities/Player.ts` (~640 lines) — Movement, weapons, abilities, stamina.
- `src/game/scenes/PreloadScene.ts` (~414 lines) — Asset loading. All sprites loaded here via CHARACTER_ANIMATIONS loop.
- `src/game/data/balance.ts` (~270 lines) — ALL tunable numbers. Change balance here, never in game logic.
- `src/game/data/animations.ts` — Frame counts per character/animation. Must match sprite files on disk.
- `src/game/data/characters.ts` — Character definitions + abilities.
- `src/game/HUDState.ts` — Bridge singleton between Phaser and React. Phaser writes, React reads via `useSyncExternalStore`.
- `src/game/systems/LevelingSystem.ts` — XP, level-up, buff selection. Level-up capped at 1 per wave.

### React HUD components
- `src/components/MainMenu.tsx` — Cinematic intro screen (fade-in tagline, gates on `assetsReady`) + main menu (PLAY/CONTROLS/LEADERBOARD). Intro plays once per session.
- `src/components/CharacterSelect.tsx` — Full-bleed concept art per character, bottom info panel with name + ability card, nav dots + arrows
- `src/components/LoadingScreen.tsx` — Character concept art + subtle 2px loading bar (2s)
- `src/components/hud/InventoryScreen.tsx` — 8-slot grid, equipped weapon, stats, buffs, XP bar, level-up integration
- `src/components/hud/ShopOverlay.tsx` — Single-column shop, items defined in balance.ts
- `src/components/hud/PauseMenu.tsx` — Inventory/Controls/Settings/Restart/Quit
- `src/components/hud/ScaryboiIntro.tsx` — SCARYBOI encounter cutscene: continuous audio playback, timing-based auto-advancing quotes, dev mode skip
- `src/components/HUDOverlay.tsx` — Orchestrates all HUD layers
- `src/game/scenes/MainMenuScene.ts` — Phaser scene that manages title→charSelect→loading→game flow

### Sprite pipeline
- Sprites live in `public/assets/sprites/{character}/{animation}/{direction}/frame_XXX.png`
- 8 directions: north, north-east, east, south-east, south, south-west, west, north-west
- Generated via PixelLab MCP server, cleaned up in Aseprite
- `animations.ts` defines frame counts, `PreloadScene.ts` loads them, `Enemy.ts`/`Player.ts` plays them
- To add a new animation: add frames to disk → add entry in animations.ts → PreloadScene loads automatically → reference in game code

### Enemy types
- `basic` — zombies with speed tiers (shamble/jog/run), A* pathfinding
- `fast` — dogs, pack AI, stealth aggro mechanics
- `boss` — SCARYBOI, recurring villain, 4-attack moveset, flee/reappear encounter system
- `mason` — BigBossBaby, 2-phase AI (phase 2 at 50% HP unlocks fire breath), 4 attacks: lead-jab, boom-box soundwave, jump-slam, fire-breath. Rave cutscene: 6-phase state machine (`masonRavePhase`) with dancing zombies, letterbox cinematics, dialogue cards

### Systems
- Economy: kill rewards, wave bonuses, interest, price inflation — all in balance.ts
- Leveling: XP → level-up → pick from 3 random buffs (6 categories x 3 tiers)
- Pathfinding: EasyStarJS A* with collision grid from Tiled map
- Blood VFX: `spawnBloodSplat()` in GameScene, uses fx-blood sprite variants

## Patterns to follow
- All balance numbers go in `balance.ts`, never hardcode in game logic
- Use `getAnimKey(spriteId, animType, direction)` for animation keys
- Use `getFrameKey(spriteId, animType, direction, frameIndex)` for individual frame textures
- Mason attacks set `masonBusy = true` and zero velocity every frame while busy (prevents knockback skating)
- `angleToDirection(angle)` is an exported function in Enemy.ts — import and call directly, cast result `as Direction`
- Mason rave cutscene uses `masonRavePhase` state machine — never set phase directly, use the trigger methods (`triggerMasonRave`, `triggerMasonCutscene1`, etc.)
- `masonCutsceneActive` getter returns true during cutscene_1/cutscene_2 — use this for input/update guards
- Blood splatters are triggered from GameScene, not Enemy — call `(this.scene as any).spawnBloodSplat()`

## Things to avoid
- Don't add features to GameScene.ts if they can live elsewhere — it's already ~5,700 lines
- Don't use `this.angleToDirection()` — it's an exported function, import from Enemy.ts
- Don't set velocity directly on Mason during attacks — the masonBusy velocity lock in updateMason will fight it
- Don't use `setImmovable()` alone to prevent knockback — GameScene applies knockback via direct `setVelocity()` calls which bypass immovable
- Don't assume sprite directories exist — always check `this.scene.anims.exists(key)` or `this.scene.textures.exists(key)` before playing

## Deployment
- Vercel auto-deploys from git push to main
- Live at rickarena-self.vercel.app
- Leaderboard requires DATABASE_URL env var (Neon Postgres)
- Game runs fully client-side without the database

### Menu flow
- BootScene → sets `mainMenuVisible` immediately → React IntroScreen (cinematic tagline, gates on `assetsReady`) → MainMenu → CharacterSelect → LoadingScreen → GameScene
- PreloadScene loads assets in parallel while intro plays; sets `assetsReady: true` when done
- HUDState actions: `dispatchMainMenuAction("play")`, `dispatchMenuAction("prev"/"next"/"start"/"back")`, `dispatchInventoryAction("close")`
- I key opens inventory (pauses physics), ESC closes inventory or opens pause menu
- Level-up opens inventory with buff selection banner at top

## Current state (updated 2026-04-25)
- Full UI overhaul complete — cinematic intro, main menu, character select, loading screen, inventory, shop, pause menu
- Cinematic intro: fade-in tagline on black, plays during asset loading, once per session
- Character select: full-bleed concept art, no pixel sprites, ability info panel
- SCARYBOI south encounter: new V2 audio, continuous playback with timing-based auto-advancing quotes
- Mason rave cutscene implemented — 6-phase state machine with dancing zombies, letterbox cinematics, dialogue cards
- Mason boss fight AI complete — 4 attacks, 2-phase system
- SCARYBOI cinematic overhaul done — all 3 encounters
- Jason renamed to Muff (display only, sprite id stays "jason")
- Shop simplified: 8 items (First Aid Kit, 3 ammo types, landmine, grenade, shotgun, SMG)
- Level-up capped at 1 per wave
- Removed redundant text banners ("SCARYBOI RETREATS", "BIGBOSSBABY WANTS TO FIGHT!")
