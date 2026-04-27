# RickArena Changelog

## 2026-04-27 — Leaderboard Menu, Stability Fixes, Deployment Safety

**Leaderboard main menu button, enemy AI cutscene fix, shop UX polish, and selective revert of broken zone changes.**

### Leaderboard (Main Menu)
- LEADERBOARD button now opens an in-menu view (previously non-functional)
- Shows top 5 scores fetched from `/api/leaderboard` (Neon Postgres)
- Grid layout: rank, name, wave, kills — styled to match ControlsView
- Loading/error/empty states handled gracefully
- ESC dismisses back to main menu

### Enemy AI Fix
- Enemies now check `scene.physics.world.isPaused` before updating — prevents AI from running during cutscenes and paused states

### Shop UX
- Added EXIT [ESC] button at bottom of shop overlay
- Keyboard ESC already worked but lacked visual affordance

### Animation Framerate Bump
- Walk animations: 6fps → 8fps
- Run animations: 8fps → 10fps
- Applies to all characters and enemies

### Reverted: Zone Merge & Tiled Changes
- Attempted to merge "foyer" into "Scaryboi's Lair" zone (code + Tiled) — caused PLAY button failure and black screen crash
- Root cause: Tiled tileset trim (9→6 columns) left orphaned GIDs in map data; PreloadScene async errors swallowed silently
- Lesson: never use `json.dump` on TMJ files (destroys Tiled formatting); only Tiled should write TMJ
- Selectively reverted zone/Tiled commits while keeping enemy AI fix and shop/framerate changes
- Zone visibility fix for Scaryboi's Lair still pending (code-only approach planned)

### Deployment Safety
- New rule: no push to Vercel without explicit user confirmation after localhost testing

---

## 2026-04-25 — Cinematic Intro, UI Polish, SCARYBOI Audio/Cutscene Rework

**Cinematic intro screen, character select redesign, SCARYBOI cutscene overhaul, and text banner cleanup.**

### Cinematic Intro Screen (NEW)
- Black screen with tagline text fading in from darkness, letterbox bars, red accent line
- Plays during asset loading — serves as both intro and loading screen (no dead black screen)
- Holds for ~9 seconds, skippable with Space/Enter/Click
- Only plays once per session; returning to menu after death skips it
- HUDState `assetsReady` flag gates transition to menu until Phaser assets are loaded

### Main Menu Updates
- Removed tagline text from main menu (moved to intro screen)
- All menu text uses white + red stroke style (matching in-game objective tracker)
- Removed Phaser PreloadScene splash art — replaced with black background

### Character Select (REDESIGNED)
- Removed pixel sprite overlay — concept art is now the sole character showcase
- Concept art opacity raised to 0.75 for stronger presence
- Bottom info panel: character name (left) + ability card (right)
- Ability card shows "ABILITY · Q" label, ability name, description, and cooldown
- Cleaner nav arrows at screen edges, minimal dot indicators
- "PLAY" button replaces "ENTER TO PLAY"
- Updated ability descriptions:
  - Rick: "Devastating kick with heavy knockback. Ideal for precision kicks on bosses"
  - Muff: "Ground slam that heavily damages all nearby enemies"

### Loading Screen
- Now shows selected character's concept art (seamless transition from character select)
- Subtle loading bar and "LOADING" text at bottom

### SCARYBOI Cutscene Rework
- South building VO replaced with ElevenLabs V2 clip
- Second quote updated: "Unfortunately, you will not live to hear them.."
- ScaryboiIntro.tsx rewritten for continuous playback:
  - Audio plays start-to-finish with no pausing between quotes
  - Quotes auto-advance on timing (no Space between quotes)
  - Dismiss blocked until audio finishes (unless dev mode)
  - Dev mode: Space skips entire cutscene instantly
- Smoke-appear cutscene animation slightly faster (3fps → 4fps, fade 800ms → 700ms)

### Text Banner Cleanup
- Removed "SCARYBOI RETREATS..." weapon message
- Removed "BIGBOSSBABY WANTS TO FIGHT!" weapon message
- Kept "SCARYBOI DEFEATED!" and "BIGBOSSBABY DEFEATED!" victory messages

---

## 2026-04-25 — Full UI Overhaul: Menus, Inventory, Shop, Character Select

**Complete UI redesign across all menus and overlays. New main menu, character select, inventory system, shop simplification, and font/style consistency pass.**

### Main Menu (NEW)
- Group concept art background (4 heroes + Mason silhouette), full-bleed, no blur
- RICKARENA title in chainsaw font with red glow
- PLAY / CONTROLS / LEADERBOARD buttons with hover effects
- Controls sub-view in bordered panel matching inventory style
- Version number (v0.9.0) bottom-right

### Character Select (REWRITTEN)
- Per-character concept art as full-bleed background (switches with character)
- Action-pose animated sprites: Rick shoots pistol, Dan electric fist, PJ katana slash, Muff smokes joint
- Slowed animation speeds for cinematic feel (PJ 400ms, Muff 350ms)
- Clean vertical layout: name → sprite → ability name → ability description
- Removed class subtitles (Brawler, Engineer, etc.)
- Removed [R] key badge from ability display
- ESC goes back to main menu
- Dot indicators + bordered ENTER TO PLAY button

### Character Loading Screen (NEW)
- Character-specific concept art (full bleed) with dark gradient overlay
- 2-second loading bar animation at bottom
- Auto-advances to game scene

### Inventory Screen (NEW — I key)
- 8-slot inventory grid (4x2) for items like landmines, ammo
- Equipped weapon display with ammo count
- Stats panel: Health, Damage, Speed, Stamina, Regen (no percentages)
- Active buffs list with tier-colored dots (green/red/gold)
- Level/XP progress bar
- Special items section (Axe, Grenades) shown separately
- Level-up buff selection banner integrates into inventory when triggered

### Level-Up System Changes
- Level-up capped at 1 per wave (XP caps at needed-1 if already leveled this wave)
- Level-up now opens inventory screen with buff choices at top
- Removed standalone LevelUpOverlay component

### Shop Overhaul (REWRITTEN)
- Single-column layout (was 3-column grid)
- Removed items: Adrenaline, Barricade, Assault Rifle, RPG, separate Medkit/Bandage
- Added: First Aid Kit (heals 50 HP, $60), Heavy Ammo
- Unhid Landmine
- Order: First Aid Kit, ammo types, landmine, grenade, then guns at bottom
- Final items: First Aid Kit, Light Ammo, Shotgun Shells, Heavy Ammo, Landmine, Grenade, Shotgun, SMG

### Pause Menu (REWRITTEN)
- Removed inline controls grid from main pause view
- Buttons: Inventory / Controls / Settings / Restart / Quit
- Controls opens dedicated panel with ESC to go back
- Volume display shows number without % sign

### Input Changes
- TAB disabled (was stats screen, now does nothing)
- I key opens inventory screen
- E cycles weapon slots (was Q/E, Q is now ability only)

### Character & Ability Updates
- Jason display name changed to "Muff" (sprite id stays "jason")
- Jason ability renamed: "Sledgehammer Slam" → "Sledgehammer Drop"
- All ability descriptions rewritten for accuracy:
  - Rick Superkick: "High-damage kick to one or two enemies in a tight cone with heavy knockback"
  - Dan Electric Fist: "Punch that stuns the target and chains lightning to nearby enemies"
  - PJ Katana Slash: "Wide 140-degree slash that cuts through all enemies in range"
  - Muff Sledgehammer Drop: "360-degree slam that damages and stuns all nearby enemies"

### HUD & Style
- Objective tracker text enlarged (13px → 18px) for readability
- Font consistency: Special Elite for body text, ChainsawCarnage for headers only
- White text with red outline (`WebkitTextStroke`) throughout all menus
- Controls lists updated: "Shoot/Use Item" for right-click, E for Cycle Slots

### Fade-to-Black Rave Entrance
- 500ms camera fade to black when player reaches mason stair trigger
- All wave zombies killed during blackout
- Rave zombies spawned during blackout
- 500ms fade back in

### Bug Fixes
- Fixed TypeError crash in `showWeaponMessage` — text destroyed before tween completes, added `if (!txt.active) return` guard

---

## 2026-04-24 — Mason Rave Cutscene, DJ Booth, Dancing Zombies

**Mason boss fight gets a multi-phase rave cutscene in the estate ballroom. Player discovers a zombie dance party, triggers a cinematic confrontation, then fights Mason personally.**

### Mason Rave Cutscene — Full Phase System
- Replaced single `masonIntroActive` boolean with `masonRavePhase` state machine (6 phases: `rave_setup`, `cutscene_1`, `zombie_fight`, `dramatic_pause`, `cutscene_2`, `boss_fight`)
- **rave_setup**: Player enters estate → Mason spawns behind DJ booth in breathing-idle, 35 zombies spawn dancing. Player walks freely and explores the rave. Estate entrance sealed behind player.
- **cutscene_1**: Triggered when player kills first dancing zombie. Letterbox bars slide in, camera pans to Mason, dialogue card appears: "You dare interrupt my rave? This is MY dancefloor."
- **zombie_fight**: Player dismisses card (SPACE/click) → camera pans back, letterbox retracts, all 35 zombies stop dancing and attack aggressively (2/3 joggers, 1/3 runners, 1.5x HP, 2x damage)
- **dramatic_pause**: All rave zombies dead → brief "..." message
- **cutscene_2**: Player walks north (y<=400) → second letterbox + camera pan to Mason, second dialogue: "Fine. You want a fight? I'll show you how a DJ drops the beat."
- **boss_fight**: Mason tweens from DJ booth to near player with camera shake on landing, combat AI activates

### Dancing Zombie System (Enemy.ts)
- New `dancing` and `raveZombie` public properties on Enemy
- `startDancing(dir)` / `stopDancing()` methods
- Zombies use `zombie-dancing` animation (16 frames, all 8 directions) — was incorrectly falling back to walk anim, fixed
- **Wander-dance behavior**: zombies alternate between dancing in place (2-5s) and short walks (0.4-1s) in random directions at slow speed (25). Leashed within ~1.5 tiles of spawn point to prevent drift.
- `raveZombie` flag excludes rave zombies from wave progression blocking count (WaveManager)

### DJ Booth & Stage Setup
- DJ table scaled from 1.2x to 1.5x (now 3 tiles wide, proportional height)
- DJ table depth raised from 2 to 6 — renders above Mason (depth 5) so he appears behind it
- Mason spawn position centered on tile 48 to align with widened booth
- Camera pan targets updated to match new Mason position

### HUD Dialogue System Refactor
- Replaced 3 mason HUD booleans (`masonAnnouncementActive`, `masonFightIntroActive`, `masonFinalIntroActive`) with 2 fields: `masonDialogueActive` + `masonDialogueQuote`
- Action handler renamed: `masonAnnouncementAction` → `masonDialogueAction`
- `MasonAnnouncement.tsx` redesigned from full-screen portrait to bottom slide-up card (matches ScaryboiIntro pattern)
- Purple theme (#7c3aed), title "B I G B O S S B A B Y", reads quote dynamically from HUDState
- Dismiss button: "Bring it · [ SPACE ]"

### Bug Fixes
- **Mason drift**: Mason would slide off-map when player bumped into him during rave_setup. Fixed by zeroing velocity every frame in the `fleeing` early-return path (Enemy.ts update)
- **Mason breathing-idle**: Mason was playing walk anim on spawn instead of breathing-idle. Fixed by explicitly playing `getAnimKey("mason", "breathing-idle", "south")` on spawn.
- **Mason death**: Now re-opens estate entrance door (same pattern as SCARYBOI defeat) and shows "BIGBOSSBABY DEFEATED!" message

### Code Cleanup
- Exported `angleToDirection()` from Enemy.ts for use in GameScene (Mason jump facing)
- `masonCutsceneActive` getter replaces scattered boolean checks — returns true only during cutscene_1/cutscene_2
- All input guards (SPACE, B, V keys) and update() loop updated to use new phase system

---

## 2026-04-23 — SCARYBOI Overhaul, Physics Fix, Balance Caps

**SCARYBOI boss fight completely reworked — all 3 encounters now cinematic, aggressive AI, physics bugs fixed.**

### SCARYBOI Cinematic Cutscenes (All Encounters)
- All 3 encounters (zone2, southBuilding, estate) now trigger a cinematic cutscene
- Encounter 1 (zone2): full sequence — letterbox bars → smoke → backflip → idle → banner + VO
- Encounters 2+ (southBuilding, estate): short sequence — smoke → idle → banner (no backflip)
- Per-encounter quotes and VO paths in `SCARYBOI_CUTSCENE_DATA` (easy to swap later)
- `ScaryboiIntro.tsx` reads quote/VO dynamically from hudState — no more hardcoded text
- VO skipped automatically if voSrc is empty string

### SCARYBOI Aggressive AI Rework
- Always sprints at player (chasing state) — no more passive approaching
- Direct charge within 150px — skips A* pathfinding to prevent orbiting behavior
- Punch lunge: 220px/s for 200ms closes the collision separation gap
- Body-center distance checks (fixes sprite-origin vs body-center mismatch)
- Punch range 95px (matches ~84px collision floor between bodies)
- Always backflips away after punching (no cooldown gate on disengage)
- Faster cooldowns: punch 900ms, fireball 2000ms, backflip 2000ms
- Run speed 120, walk speed 55
- Indoor mode (southBuilding): rush/melee priority, 20% fireball chance
- Outdoor mode (zone2, estate): balanced, 60% fireball, backflips
- SCARYBOI faces south in all encounters (toward player)
- Encounters trigger anytime — works during intermission, not just active rounds

### Physics Fix — Rubber-Band Knockback
- **Root cause:** `setMass(50)` on player body created 50:1 mass ratio, amplifying collision impulses when sprinting
- **Fix:** Removed `setMass(50)`, added `setMaxVelocity(260, 260)` as velocity safety cap
- Player can never exceed sprint speed even during knockback
- Boss knockbackResist reverted to 0.8 (was mistakenly set to 0.1)

### Balance Caps
- **Rick superkick:** 400 dmg, max 2 hits, 60° tight cone, sorted by distance (boss killer move)
- **Crit chance:** Hard capped at 5% regardless of buff stacking
- **Speed multiplier:** Capped at 1.5x (was 2.5x) — max 240 base, 384 sprinting

### Balance Tuning
- Boss walk speed 40→55, run speed 90→120
- Punch range 70→95, punch cooldown 1500→900ms
- Fireball cooldown 3000→2000ms, backflip cooldown 3000→2000ms
- Grace periods: 3000→500ms (encounter 1), 3000→0ms (encounters 2+)
- Assault rifle speed penalty 30%→10%

---

## NEXT UP — Grenade System: Aim Line Sprite Wiring

**Status: IN PROGRESS — core grenade system built, aim line sprites generated but not wired in yet.**

### What's done
- **Full grenade system implemented** across balance.ts, GameScene.ts, Player.ts, HUDState.ts, Hotbar.tsx, PreloadScene.ts
- **Input**: G key rebound from reload → grenade. Tap G = quick throw on release. Hold G >150ms = aim line appears, release to throw. Both use identical throw logic (no accuracy difference).
- **Throw animation**: Uses `throw-grenade` (Dan) or `cross-punch` fallback (Rick/PJ/Jason). Player locked from shooting ~400ms, can still move.
- **Projectile flight**: grenade-spin sprites loop during 500ms flight with fake parabolic arc (25px peak). Scale 0.18 (was 0.8 — way too big before).
- **Detonation**: 200ms fuse, 150 damage AoE in 100px radius with distance falloff, 150 knockback (reduced by boss knockbackResist), explosion sprite at 1.5x scale, camera shake + orange flash.
- **Shop**: Grenade added as $60 item in traps category, max carry 3.
- **HUD**: Grenade count displayed in Hotbar (icon + "G x{count}") when grenades > 0.
- **Balance**: Landmine damage 80→200, radius 100→80. Grenade damage 150, radius 100px.
- **Manual reload removed from G key** — auto-reload on empty mag still works.

### What needs to be done next
- **Wire in PixelLab aim line sprites** — Generated via PixelLab API, sitting at `public/assets/sprites/projectiles/grenade-aim/aim-line.png` (64x16) and `aim-circle.png` (32x32). Both have black backgrounds — use Phaser `BlendModes.ADD` (black = invisible, red/white glows). Currently using Phaser Graphics placeholder (razor-thin 1px red line + ring).
- **Replace Graphics with sprite-based aim rendering**: Tile aim-line sprite segments along arc path (each rotated to follow curve tangent), place aim-circle at landing point.
- **Load sprites in PreloadScene**: `fx-grenade-aim-line` and `fx-grenade-aim-circle`.
- **Consider**: Landing circle could use 2-3 frame pulse animation for better readability.
- **Test in-game**: Verify throw distance feels right (250px max range), grenade scale looks correct, explosion isn't too big/small.

### Grenade system spec (unchanged)

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

## 2026-04-22 — Concept Art V3/V4/V5 Generation (Animated Cel-Shaded)

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

**V4 Jason redo (2 variants):** Shaggy-from-Scooby-Doo surprise scene. Joint raised, wide eyes, massive horde behind.

**V5 scene batch (6 images):**
- Loading screen: 4 heroes + Mason boss looming in shadow (only glowing purple glasses visible)
- SCARYBOI intro: emerging from supernatural smoke, lower half engulfed
- Mason DJ variant: dungeon nightclub, zombie crowd
- Endicott Estate: aerial wide shot of the grounds, red sky, fog, zombie silhouettes
- Title screen: 4 silhouetted survivors on ridge overlooking zombie-filled burning city (no text)
- Zombie dog pack: 5 mutant dogs with teal-green crystal spikes charging at viewer

**Generation scripts:** `concept-art/generate-v*.py`
**Output:** ComfyUI output folder, `rickarena_v3_*`, `rickarena_v4_*`, `rickarena_v5_*` prefixes.

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
