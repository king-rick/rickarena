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
- `src/game/scenes/GameScene.ts` (~6,800 lines) — Main gameplay loop, input, spawning, combat, economy, HUD. Audio delegated to AudioManager via `this.audio`.
- `src/game/entities/Enemy.ts` (~2,100 lines) — All enemy AI: basic zombies, dogs, SCARYBOI boss, Mason boss. Each enemy type has its own update method.
- `src/game/systems/WaveManager.ts` (~880 lines) — Wave progression, enemy composition, spawn timing, intermission phases.
- `src/game/entities/Player.ts` (~640 lines) — Movement, weapons, abilities, stamina.
- `src/game/scenes/PreloadScene.ts` (~414 lines) — Asset loading. All sprites loaded here via CHARACTER_ANIMATIONS loop.
- `src/game/data/balance.ts` (~270 lines) — ALL tunable numbers. Change balance here, never in game logic.
- `src/game/data/animations.ts` — Frame counts per character/animation. Must match sprite files on disk.
- `src/game/data/characters.ts` — Character definitions + abilities.
- `src/game/HUDState.ts` — Bridge singleton between Phaser and React. Phaser writes, React reads via `useSyncExternalStore`.
- `src/game/systems/AudioManager.ts` (~365 lines) — All audio: SFX playback, theme music, ambient/room tone, heartbeat, mason rave music + filter, footstep surface detection, volume control. Constructed with scene ref, accessed via `this.audio` in GameScene.
- `src/game/systems/LevelingSystem.ts` — XP, level-up, buff selection. Level-up capped at 1 per wave.

### React HUD components
- `src/components/MainMenu.tsx` — Cinematic intro screen (fade-in tagline, gates on `assetsReady`) + main menu (PLAY/CONTROLS/LEADERBOARD). Intro plays once per session. Leaderboard fetches top 5 from `/api/leaderboard`.
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
- All audio calls go through `this.audio` (AudioManager) — e.g. `this.audio.playSound(key, vol)`, `this.audio.startTheme(...)`, `this.audio.startRoomTone()`. Don't use `this.sound` directly in GameScene for SFX.

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

## Current state (updated 2026-05-05)
- Full UI overhaul complete — cinematic intro, main menu, character select, loading screen, inventory, shop, pause menu
- Cinematic intro: fade-in tagline on black, plays during asset loading, once per session
- Character select: full-bleed concept art, no pixel sprites, ability info panel
- **Leaderboard**: Main menu button shows top 5 scores (rank/name/wave/kills) fetched from `/api/leaderboard`
- SCARYBOI south encounter: new V2 audio, continuous playback with timing-based auto-advancing quotes
- Mason rave cutscene implemented — 6-phase state machine with dancing zombies, letterbox cinematics, dialogue cards
- Mason boss fight AI complete — 4 attacks, 2-phase system
- SCARYBOI cinematic overhaul done — all 3 encounters
- Jason renamed to Muff (display only, sprite id stays "jason")
- Shop simplified: 8 items (First Aid Kit, 3 ammo types, landmine, grenade, shotgun, SMG). EXIT [ESC] button visible.
- Level-up capped at 1 per wave
- Removed redundant text banners ("SCARYBOI RETREATS", "BIGBOSSBABY WANTS TO FIGHT!")
- **Enemy AI**: Enemies check `physics.world.isPaused` before update — fixes AI running during cutscenes
- **Animation framerates**: Walk 8fps, Run 10fps (bumped from 6/8)
- **Font stack**: All in-game text migrated to Special Elite. ChakraPetch fully removed.
- **Club atmosphere**: Dark overlay + spotlights + beams + fog + DJ glow, all driven by club zone polygon from Tiled. Beams from north + east + west walls. GeometryMask-clipped to zone polygon.
- **Room visibility**: RenderTexture occluder (depth 60) with polygon zones from Tiled. Point-in-polygon detection. Only redraws on zone transition. `inside_walls` layer always visible (rugs/interior detail). Outdoor layers hidden on indoor transition (ground, paths, foliage, overhangs, props_low, props_mid).
- **VO normalization**: All 15 voice files at EBU R128 (-18 LUFS)
- **Pathfinder door fix**: Door purchase/break now updates A* grid via `setWalkable()`
- **Dev mode**: Automatically grants axe (and future inventory items)
- **Tiled "zones" Object Layer**: 7 named polygon zones for room boundaries. Edit vertices with E key. Snap to grid for tile-aligned edges.
- **24 SFX wired**: Heartbeat (HP<25% loop), burnout grunt, level-up, buff confirm, countdown tick, weapon switch, chest open (3 variants), bullet impact (25%), bullet whiz (15% on miss), reload complete, all Mason attacks (punch/bass-drop/jump-slam/fire-breath trio/phase2), SCARYBOI fireball, generator sequence (switch+spark+buzz+hum), door bash, door/fence break
- **Ability balance**: Rick Superkick 450 dmg, Dan Electric Fist capped 9 kills, Muff Sledgehammer capped 9 kills
- **Deployment**: No push to Vercel without explicit user confirmation after localhost testing
- **Tiled migration**: All 7 phases complete — zones, triggers, spawn points, interactables all read from Tiled. Code is behavior, Tiled is spatial data source of truth.
- **New Tiled layers**: zones_navigation (gated/exclusion/dog spawns), zones_triggers (SCARYBOI encounters)
- **Asset staging**: 15 packs in `public/assets/tilesets/_new-assets/`. zombie-pack-32x32 active in map. PixelLab-generated tiles in pixellab-shop/. 3 interior tilesets loaded from _new-assets (Interiors_tilesets, fancy_mansion_furnitureset, fancy_mansion_room_door_tiles).
- **Kyle's Shop (Rudy's)**: Concept facade placed on map (192x256px). Interior rebuilt with 3 new tilesets (Interiors_tilesets, fancy_mansion_furnitureset, fancy_mansion_room_door_tiles). Teleport system wired (E to enter/exit). Zones: `rudys` (interior), `rudys_exterior`. Interactables placed: med_desk, ammo_desk, equipment_desk, locker_1, locker_2. Design doc in memory.
- **Door/gate UX**: Display names ("Gate"/"Door") instead of internal labels. Silent zombie bashing (no percentage). Doors cost $300 (balance.ts).
- **Teleport system**: Point objects on `zones_triggers` layer with `type=teleport` and `target=<name>`. E key prompt, 200ms fade transition. Bidirectional pairs.
- **HUD bottom-left stack**: WaveInfo (fades after 10s) → TopStats (kills + cash) → Hotbar (unified bar). All ChainsawCarnage font.
- **Interaction prompts**: Fully React-rendered via HUDState `interactionPrompt` field. Percentage-based positioning from camera worldView.
- **Intermission pacing**: 3s delay after last kill before shop opens. `intermissionShopOpened` flag prevents double-open.
- **Canopy**: No red glow on characters. 30% opacity at center, gradient to 100% at 4-tile radius edge.
- **PixelLab MCP**: Used for custom tile generation — tiles_pro for individual tiles, topdown_tileset for Wang/terrain transitions, map_object for concept art
- **Kyle intro cutscene**: Waypoint-driven cinematic — player runs to Rudy's door, bangs (1s alone), zombie chases from south, Kyle rushes out and shoots zombie just in time. 6-phase state machine (run_to_door → kyle_shoots → exterior_dialogue → fade_to_interior → interior_dialogue → done). Tiled waypoints: `kyle_cs_player`, `kyle_cs_zombie`, `kyle_cs_kyle`. Exterior phase polished. Interior phase: roof force-hidden, occluder reset, wave freeze. Player forced to running anim at cutscene start. Waves frozen until player exits Rudy's.
- **Wave freeze system**: `WaveManager.setFrozen(true/false)` — checked at top of `update()`. Used during Kyle cutscene + Rudy's interior. Unfrozen on exit teleport.
- **Banging-door animations**: Rick (done), PJ (done), Jason (done), Dan v2 (done, no door in sprite) — north only, 4 frames each.
- **Zombie scary-sprint**: Removed from animation registry (no frames on disk). Game code falls back to `running-8-frames`.
- **Kyle NPC sprites**: breathing-idle (8 dirs), walk (8 dirs), running-6-frames (3 dirs), shooting-shotgun (3 dirs). PixelLab character `a7b77ede-ea34-44b5-aee0-b510849beeb0`.
- **Supply desks**: 3 free desks in Rudy's (`med_desk`, `ammo_desk`, `equipment_desk`) parsed from Tiled `interactables` layer. E key to loot, restock every 5 waves. Objective "Search the Supply Tables" completes when all 3 looted.
- **Bandage system**: Stackable consumable (max 5), instant 25 HP heal, hotbar-cyclable via E key. Config in `BALANCE.bandage`. HUDState `bandageCount` field. Replaces First Aid Kit from shop.
- **Starting loadout nerf**: Pistol 16 rounds (1 reserve mag), zero grenades. First Aid Kit removed from shop.
- **Kyle NPC collision + pacing**: Immovable physics body (32x40), 5-waypoint pacing AI inside Rudy's (speed 30, 3-6s idle pauses, 8-dir walk/idle anims).
- **Wave 1 timing**: Deferred until player exits Rudy's after Kyle cutscene. `skipNextShop` skips post-wave-1 shop and starts countdown to wave 2.
- **Ammo banking**: `addWeapon()` merges reserve ammo — buying ammo for unowned weapons banks it for later.
- **Theme music system**: 5 tracks (full/main/intense/creepybass/outro). `theme_full` plays via React HTML Audio on intro (no loop). In-game themes via Phaser Web Audio with fade-in/out. No two themes overlap. SCARYBOI proximity crossfade at 200px. Kyle cutscene gets looping creepybass. Theme volumes scale by `musicVolume` (separate from `sfxVolume`).
- **2-slider audio**: SFX slider controls gunshots, footsteps, ambient sounds. Music slider controls theme tracks + mason rave music independently. Both in Settings panel via HUDState `sfxVolume`/`musicVolume` fields.
- **Footstep surfaces**: 3 surface types — gravel (pathsLayer tile check), wood (roomTone playing), grass (default). Keys: `sfx-step-gravel1..6`, `sfx-step-wood1..5`, `sfx-step-grass1..6`.
- **Rudy's interior audio**: Room tone ambient loop, wood footsteps replace grass, outdoor ambience (birds/rain) muted inside. Desk loot sounds removed.
- **Kyle cutscene SFX**: Running footsteps loop, door bash, zombie groan on spawn. All ElevenLabs-generated.
- **ElevenLabs SFX generation**: API key in Bitwarden ("ElevenLabs - RickArena API"). Used for door-bash, running-grass, room-tone, walking-wood-indoor.
