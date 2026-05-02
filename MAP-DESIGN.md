# Endicott Estate — Map Design Reference

## Overview
Top-down survival map (60×60 tiles, 1920×1920px surface). Loosely inspired by the real Endicott Estate in Dedham, MA. Gated progression — player unlocks areas by purchasing doors and finding items.

## Map Regions

### Starting Area (southeast)
Fenced-in spawn area. Player opens chest (pistol), exits room, reads sign, finds log (axe), chops fence to access the main map.

### Main Field (center-south)
Open area between the fences and Gate 1. First combat zone after escaping the starting pen. Zyn Machine located here.

### Gate 1 Area (west of center)
Gate 1 (purchasable door) blocks access to the western half of the map. Opens the NW building, fountain area, and corridor north toward Gate 2.

### Library / South Building (southwest)
Accessible via South Building door (no cost, locked until interaction). SCARYBOI library encounter triggers inside. Anti-camp flanking active.

### NW Building (northwest)
Behind Gate 1. Contains generator (power-on objective), North Chest, North Door. Anti-camp flanking active.

### Gate 2 / Estate (north-center)
Gate 2 (purchasable, locked until power + library objectives done). Gates the estate interior, club, and upper areas.

### Estate Interior (north)
Two sections — left wing and right wing. SCARYBOI final encounter triggers here. Contains the club with atmosphere effects (spotlights, fog, DJ glow).

### Underground (cols 60+, east of surface)
Off-limits area east of the playable surface. Excluded from all spawn logic.

## Tiled Layer Reference

### Tile Layers
| Layer | Purpose |
|-------|---------|
| ground | Base grass/terrain |
| ground_detail | Terrain variation |
| paths | Stone paths, roads |
| floor_interior | Building floor tiles |
| inside walls | Interior wall details |
| walls_base | Main wall layer (doors clear tiles from here) |
| walls_top | Upper wall details |
| props_indoor | Indoor furniture, items |
| props_low | Ground-level props |
| props_mid | Mid-height props |
| roof | Building rooftops (faded when player is inside) |
| foliage_painted | Tree canopy, bushes |
| overhangs | Overhanging elements |
| vfx_marks | Visual effect marks |

### Object Layers

#### `collision` (424 objects)
Rectangle and polygon collision bodies. Read at runtime for physics and A* pathfinding grid.

#### `interactables` (14 objects)
All interactive game objects. Read at runtime.

| Name | Type/Class | Properties | Notes |
|------|-----------|------------|-------|
| starting_chest | — | — | Pistol chest in starting room |
| starting_door | — | cost, label, locked | Exit from starting room |
| sign_directions | — | label | Directional signpost |
| log | — | label | Search to find axe |
| fence_1 | — | — | Chopable fence (requires axe) |
| fence_2 | — | — | Chopable fence (requires axe) |
| fence_3 | — | — | Chopable fence (requires axe) |
| gate1 | door | cost, label, locked, health, clearCols, clearRows | Gate 1 — purchasable |
| gate2 | door | cost, label, locked, health, clearCols, clearRows | Gate 2 — purchasable, initially locked |
| library_door | door | cost, label, locked, clearCols, clearRows | South Building door |
| north_door | door | cost, label, locked, clearCols, clearRows | North Building door |
| north_chest | — | cost, label | Loot chest in NW building |
| zyn_machine | — | cost, label | Vending machine |
| generator | — | cost, label | Power generator |

#### `zones` (11 objects)
Room polygons and entrance points for anti-camp detection and room visibility occluder.

**Room polygons** (6):
| Name | Purpose |
|------|---------|
| club | Club interior visibility |
| start | Starting room |
| north_building | NW building interior |
| estate_lower_hall | Estate lower hallway |
| library | Library/SW building interior |
| scaryboi | Scaryboi corridor visibility |

**Entrance points** (5):
| Name | Position |
|------|----------|
| entrance_library | (400, 1668) |
| entrance_north_building | (192, 582) |
| entrance_scaryboi | (901, 1023) |
| entrance_estate_lower_hall | (1146, 639) |
| entrance_club | (1144, 418) |

#### `zones_navigation` (15 objects)
Spawn control — gated zones, exclusion zones, dog spawn points.

**Gated zones** (class: `gated_zone`):
| Name | gate property | Coverage |
|------|--------------|----------|
| gate1_zone_north | Gate | West strip above library (0,0 → 928×1371) |
| gate1_zone_south | Gate | West strip below library (0,1696 → 834×224) |
| gate2_zone | Estate Entrance | Estate/north area (640,0 → 1280×893) |

**Exclusion zones** (class: `exclusion_zone`):
| Name | Coverage |
|------|----------|
| exclusion_nw_building | NW building interior |
| exclusion_library | Library interior |
| exclusion_estate_left | Estate left wing |
| exclusion_estate_right | Estate right wing |
| exclusion_underground | Everything past col 60 |

**Dog spawn points** (class: `dog_spawn`):
7 point objects (`dog_spawn_1` through `dog_spawn_7`) spread around map edges.

#### `zones_triggers` (3 objects)
SCARYBOI encounter triggers. Player walking into these rectangles starts the boss encounter.

| Name | encounter | requires | Notes |
|------|-----------|----------|-------|
| scaryboi_gate | gate | gate | Near Gate 1, corridor encounter |
| scaryboi_library | library | South Building | Inside library |
| scaryboi_estate | estate | — | Final encounter (requires both previous done) |

#### `landmarks` (8 objects)
Visual reference points for future animated landmarks. Pillar positions and stone markers.

## Gameplay Progression

1. **Starting room** — Open chest → get pistol → exit door
2. **Starting area** — Read sign → find log → get axe → chop fence
3. **Main field** — Fight zombies, earn money, buy Gate 1
4. **West side** — Explore NW building, turn on generator (power objective)
5. **Library** — Enter via South Building door, SCARYBOI encounter #2
6. **Gate 1 corridor** — SCARYBOI encounter #1 (can happen before or after library)
7. **Gate 2** — Unlocks after power + library objectives, purchase to enter estate
8. **Estate** — SCARYBOI final encounter #3, then rave cutscene + Mason boss fight

## Spawn Logic

- **Exclusion zones**: Never spawn inside buildings or underground
- **Gated zones**: Don't spawn in locked areas until corresponding gate is opened
- **Reachability**: Flood-fill from player position — only spawn where player can walk
- **Collision check**: Verify spawn point isn't inside a wall
- **Anti-camp flanking**: If player camps in a room, zombies spawn at entrance points after 8s delay
- **Dogs**: Spawn at nearest dog_spawn point not in player's line of sight
