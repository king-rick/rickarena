# RickArena Changelog

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
