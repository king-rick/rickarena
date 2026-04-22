# RickArena Changelog

## 2026-04-22 — Concept Art V3/V4 Generation (Animated Cel-Shaded)

**Full concept art regeneration session using ComfyUI (Flux Dev + RealESRGAN 4x upscale).**

Unified all character concept art into a single animated cel-shaded style matching the Mason DJ reference image. Bold black outlines, cel-shaded coloring, Castlevania Netflix animation aesthetic. Dark moody palette with crimson red skies, volumetric fog, stylized blood.

**V2 (scrapped):** Dead Space photorealistic style. Too realistic for the game's art direction.

**V3 action shots:**
- Rick: SMG firefight, shredding zombies. Medium-length black wavy hair, beard, aviator sunglasses, green flannel rolled up showing sleeve tattoos.
- Dan: Shotgun point-blank into zombie face, head exploding. Short dirty blonde hair, slight receding hairline, grey t-shirt.
- Jason: Sledgehammer smashing zombie ribcage, joint in mouth. Messy dark brown hair, 5 o'clock shadow, hungover/dazed, dark green jacket.
- PJ: Katana multi-kill combo, blood arcs. Short blonde hair, blonde mustache, sleeve tattoos, black t-shirt.

**V4 variant batch (13 images for final selection):**
- Rick x3: Hip-fire shotgun, dual pistols from car roof, alley close-quarters SMG
- Dan x3: Mid-reload blast, sliding knee shot, pistol + flashlight tactical
- Jason x4: Overhead skull-crush, casual stoned pistol shooting, hammer through two zombies, post-battle breather
- PJ x3: Aerial leaping slash, spinning slash in zombie circle, alley sprint katana + pistol

**Generation scripts:** `concept-art/generate-v3*.py`, `concept-art/generate-v4-variants.py`
**Output:** ComfyUI output folder, `rickarena_v3_*` and `rickarena_v4_*` prefixes.

## 2026-04-12 — SCARYBOI Intro Cinematic + Animated Fireballs

**SCARYBOI intro cinematic:**
- Full-screen cinematic overlay triggers the first time SCARYBOI spawns in a run (wave 6+, once per run only).
- Fades in over 900ms with Ken Burns slow zoom on SCARYBOI concept art.
- Displays name "S C A R Y B O I" in red with glow effect and quote: *"You've lasted longer than the others. Admirable, but mistaken..."*
- "Bring it" dismiss button appears after 600ms delay with red hover glow. Player input locked until dismissed.
- Fades out 700ms after click, then gameplay resumes.

**Animated fireballs:**
- Replaced drawn orange circle with a 5-frame pixel art animation (32×32px) from the fire bullet spritesheet.
- Fireball sprite rotates to match travel direction.
- Fireballs now collide with and destroy on contact with map walls and player barricades.

**Bug fixes:**
- AudioContext HMR fix: Phaser's internal `suspend()`/`resume()` calls now wrapped in try/catch, eliminating `InvalidStateError` on hot reload.
- Added `inside walls` tile layer to GameScene render pipeline (was in TMJ but never created in code).

**Balance:**
- Punch stamina cost 10 → 9 (slight relief).

## 2026-03-31 — WaW Zombie Scaling + Combat Overhaul

**WaW-style difficulty scaling:**
- Zombie HP now scales linearly waves 1-9 (+25%/wave), then exponentially wave 10+ (1.1x/wave). Base zombie HP raised from 45 to 75.
- Speed tiers: waves 1-3 all shamblers (35 speed), waves 4-6 mixed (40% shamble, 50% jog, 10% run), waves 7-9 mostly runners, wave 10+ swarm mode (85% runners at 95 speed).
- Damage stays flat across all waves. Pressure comes from speed and volume, not per-hit damage.

**Combat fixes:**
- Point-blank melee: enemies overlapping the player (< 20px) now always get hit, bypassing the arc check. Knockback uses facing direction.
- Point-blank guns: enemies within 30px take direct damage from all pellets instead of projectiles spawning behind them.
- Punch range increased 50 → 70px, arc widened 100° → 120°.
- Punch stamina cost reduced 15 → 8.
- Shotgun buffed: 12dmg x 5 pellets → 22dmg x 6 pellets (132 max vs 60). Knockback 80 → 120.

**Weapon specialties removed:**
- All characters now have identical base stats. No proficiency damage/crit/ammo bonuses.
- Character abilities are the only differentiator (Superkick, EMP, Katana, Smokescreen).

**Map border:**
- Fence border around map perimeter using barricade sprites with collision.
- Road gaps at north, west, and south exits.
- Tree wall road exclusion zones prevent trees from encroaching on roads.

**UI/UX fixes:**
- DevPanel wrapper no longer eats mouse clicks (was blocking left-click punch).
- Settings volume slider and zoom toggle now update in real-time.
- Enemy health bars shrunk (40x4 → 24x2 basic, 60x6 → 40x4 boss).

## 2026-03-29 (v2) — Session 1 Balance + Creepy Zombie

**Balance fixes (from 3/28 Discord playtest):**
- Speed buff cap at 2.5x base speed (prevents runaway stacking)
- Barricade snap grid (24px) for clean structural placement
- Barricade ghost preview (semi-transparent green overlay shows placement before committing)
- Pre-rotated vertical barricade texture (fixes physics body mismatch with setAngle)
- Removed HP/stamina numeric values from health bars (graphical bars only)
- Removed ControlsHint from HUD, moved controls reference into PauseMenu
- Cleaned ShopOverlay: removed hotkey numbers, footer hints, number key handler
- Minimap zoomed 3x and now follows player position

**New enemy: Creepy Zombie (replaces green "pussy" zombie):**
- PixelLab-generated character with 4 animation sets (walk 8f, bite 4f, death 17f, taking-punch 6f)
- All animations in 8 directions (288 total sprite frames)
- Gunshot death animation with blood splatter (17 frames at 20fps)
- Scaled up to 0.28 (larger than player at 0.25) for more threatening presence

**Dev mode enhancements (localhost only, backtick toggle):**
- Unlimited cash (auto-refills to $99,999)
- All shop items unlocked regardless of wave
- Shop accessible anytime (not just intermission)
- F2 wave skip now kills all enemies and clears spawn queue

**UI fixes:**
- Character select title padding fix (ChainsawCarnage font no longer clips)

## 2026-03-29

- Hotbar system: fists(1), weapon(2), barricade(3), mine(4). Q/E cycle backward/forward. Click/Space/F uses active slot.
- Ability key changed from Q to R.
- Leaderboard entry prompt only appears if your score qualifies for top 5.
- Player freezes while shop is open. Shop navigable with WASD/arrows + Enter to buy.
- Shrunk equipment slot icons from scale 2.5 to 0.6.
- Leaderboard capped at 5 entries.

## 2026-03-28

- Removed map editor (MapEditorScene deleted, E key removed from menu). Tiled is now the only map editor.
- Nerfed Jason's Smokescreen: heal reduced from 15 HP/s to 4 HP/s. Enemies no longer get confused/pushed — instead they are slowed to 50% speed and take 3 HP/s drain damage while inside the cloud.
- Fixed EMP grenade direction: now aims toward mouse cursor instead of 4-way facing direction.
- Fixed bullet visuals: replaced oversized 32x32 "chicken wing" bullet sprite with a tiny 6x3 procedurally generated projectile. Hitbox reduced from 12px to 8px radius for tighter hit registration.
- Fixed diagonal movement stutter: removed manual camera scroll rounding that conflicted with the camera lerp smoothing. `setRoundPixels(true)` handles pixel snapping at render time.
- Disabled dog leap animation (was visually broken — doubled sprite). Dogs still lunge mechanically at 2.5x speed, just using walk animation until new leap sprites are created.
- Renamed "First Aid" to "Bandages" in shop, added bandage and syringe item icons.
- Redesigned HUD: minimap moved to bottom-right with visible blue border, equipment slot strip in bottom-left, ability text above weapons.
- Redesigned shop: 3-column grid layout (Supplies/Weapons/Traps) replacing old carousel.
- Fixed barricade collision: enemies and projectiles now properly collide with barricades (StaticBody fix).
- Fixed bullet hit registration: hitbox centered dynamically on sprite instead of hardcoded offset.
- Changed leaderboard name entry from 3-letter arcade picker to typed input (up to 8 characters).
- Fixed stray "SHOP" text floating on map.
- Fixed level-up UI bug where second level-up in a round was unclickable (Phaser key binding issue).
- Added zombie dog animations (walk, bite, death, leap sprite sheets).
- Added leaderboard with Neon Postgres persistence.
