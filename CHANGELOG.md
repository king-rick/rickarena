# RickArena Changelog

## NEXT UP — Grenade System Implementation Plan

**Status: PLANNED — not yet implemented. Build after context compact.**

### Overview
Universal grenade system. All characters start with 1, buy more at shop (max 3). Separate from abilities — uses G key. Two throw modes: tap for quick toss, hold for aimed throw with arc line.

### Input
- **Tap G**: Throw animation plays immediately, grenade launches toward mouse cursor position at time of press. No aiming line.
- **Hold G**: Aiming mode — thin red parabolic arc line appears from player to landing point (capped at 250px range). Player can move (WASD) and aim (mouse) while holding. Cannot shoot. On release: throw animation plays, grenade launches toward final mouse position.
- G does nothing if grenade count is 0.

### Throw Animation
- Always plays regardless of tap/hold.
- Dan: use `throw-grenade` anim (4 frames, 10fps, all 8 dirs — already exists).
- Rick, PJ, Jason: use `cross-punch` as placeholder until proper throw sprites are generated.
- Player locked from shooting during ~400ms animation, can still move.

### Aiming Line (hold G only)
- Thin red line, 1-2px width, ~0.3-0.4 opacity.
- Parabolic curve from player to landing point — peaks 15-20px above midpoint.
- Small translucent red circle at landing point (~16px diameter, ~0.2 opacity).
- If mouse beyond max range (250px), line and circle cap at max distance.
- Line and circle disappear instantly on G release.

### Grenade Projectile (in flight)
- `grenade-spin` sprites loop (4 frames, already exist in `public/assets/sprites/projectiles/grenade-spin/`).
- Travels from player to target over ~500ms.
- Fake parabolic arc: sprite y-position offsets upward first half, back down second half (20-30px peak).
- Sprite scales slightly during arc (0.8 → 1.0 → 0.8) to sell depth.

### Detonation
- 200ms fuse delay after landing (grenade sits on ground).
- `grenade-explosion` sprites play (5 frames, already exist in `public/assets/sprites/projectiles/grenade-explosion/`).
- AoE damage: **150** to all enemies within **100px** radius.
- Knockback: 150 force, radiates outward from blast center.
- Bosses (Mason, SCARYBOI) take full damage. Knockback reduced by their `knockbackResist` values.
- Camera shake: 100ms, 0.005 intensity. Brief orange screen flash (80ms).

### Inventory & Shop
- Start with 1 grenade per game.
- Shop item: "Grenade" — $60, buy up to max carry of 3.
- Grenade count visible in HUD (near hotbar area).

### Balance changes alongside grenade
- Landmine radius: 100px → **80px** (ground charge = tighter blast zone).
- Landmine damage: 80 → **200** (stronger than grenade since enemies have to walk into it).
- Grenade damage: **150** (weaker than mine but player-aimed).

### Files to modify
1. `balance.ts` — add `grenade` config section, update `landmine.radius` 100→80, `landmine.damage` 80→200, add grenade to shop items.
2. `GameScene.ts` — G key input binding, hold/tap detection, aiming line rendering (graphics object), throw logic, projectile arc tween, explosion + AoE damage, grenade count HUD event emission.
3. `Player.ts` — `grenadeCount` property, `throwingGrenade` state flag, throw animation trigger method.
4. `HUDOverlay.tsx` — grenade count display (icon + number near hotbar).
5. `PreloadScene.ts` — verify `grenade-spin` frames 1-4 and `grenade-explosion` frames 1-5 are loaded (may need to add loading calls).

### NOT doing
- Wall collision for grenade in flight (flies over everything).
- Friendly fire / self-damage.
- Grenade cooking (hold to shorten fuse).
- Unique throw sprites for Rick/PJ/Jason (placeholder with cross-punch for now).

---

## 2026-04-22 — Mason Boss Polish, Fire Breath Tracking, Session Tooling

**Mason boss fight overhaul — all new sprites wired, AI improvements, balance tuning.**

**New animations wired:**
- `angry` (8 dirs x 4 frames) — plays on first discovery (player sees Mason) and phase 2 transition (50% HP)
- `death` (7 dirs x 9 frames) — dramatic slow death at ~4fps with 4 staggered blood splatter bursts, 800ms hold on final frame, 1.5s fade-out
- `jump` (8 dirs x 4 frames) — launch-off-screen animation for leap attack
- `landing` (8 dirs x 4 frames) — slam-down-from-above with dust/shockwave
- `soundwave` projectile (4 frames) — already wired from previous session

**Jump attack rework:**
- Mason now fades out during jump (launching off-screen), hangs in the air for 700ms, then teleports to player's position and plays landing slam
- Subtle ground shadow (28x14 translucent black ellipse at 12% opacity) fades in at landing zone during hang time as a dodge telegraph
- Replaced old tween-slide-across-ground behavior that didn't match the sprites

**Fire breath tracking:**
- Fire breath now sweeps to follow the player during the 2s breath phase at 2.5 rad/s (~143 deg/s)
- Mason's sprite swaps between 8-direction fire-breath textures as he rotates
- Fire cone sprite repositions and re-rotates each frame
- Wind-up (360ms) and cool-down phases remain direction-locked — player gets a brief read window before tracking kicks in

**Skating fix:**
- Mason no longer slides backward during fire breath or other attacks
- Root cause: punch/bullet knockback applied velocity via direct `setVelocity()` calls, bypassing `setImmovable()`
- Fix: `updateMason()` now zeros velocity every frame while `masonBusy` is true

**Soundwave aiming fix:**
- Each of the 3 boom-box pulses now aims at the player's actual position at fire time instead of using the 8-direction facing angle
- Pulses recalculate per-fire, so they fan slightly if the player moves between beats

**Balance:**
- Mason HP 2400 → 2000
- Mason death animation slowed to ~4fps (250ms per frame) for dramatic effect

**Project tooling:**
- Added `CLAUDE.md` with full project context (architecture, patterns, things to avoid)
- Set up persistent memory system (`memory/MEMORY.md` + user, project, feedback memories)
- Created `/closeout` skill for end-of-session changelog + commit workflow

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
