# Endicott Estate Map Design

## Overview
Medium-sized top-down (slightly angled) map. Loosely inspired by the real Endicott Estate in Dedham, MA. Designed for wave-defense gameplay, not historical accuracy.

## Map Layout

```
+=============================================================+
|            +-----+                                     %%%%%|
|============|ROAD |=====================================%%%%%|
|            | N   |                                     %%%%%|
|  CARS       --+--                                      %%%%%|
|  (vintage)    |                                        %%%%%|
|               |                                        %%%%%|
|               |                    +--------+          %%%%%|
|               |                    |GREEN   |          %%%%%|
|               |                    |HOUSE   |          %%%%%|
|               |                    +--------+          %%%%%|
|        +------+                                        %%%%%|
|        |   WILLOW                                      %%%%%|
|========|          +==============+                     %%%%%|
| ROAD   |          |              |                     %%%%%|
|  W     |          |   MANSION    |--+                  %%%%%|
|========|          |              |  |DECK              %%%%%|
|        |          +==============+--+                  %%%%%|
|        +------+                                        %%%%%|
|               |                                        %%%%%|
|               |     +----------+                       %%%%%|
|               |     | ESTATE   |    +--------+         %%%%%|
|               |     | PARKING  |    |GAZEBO  |         %%%%%|
|               |     +----------+    +--------+         %%%%%|
|+--------+    |                                         %%%%%|
||LIBRARY |    |                                         %%%%%|
||PARKING |+--+|    BUSH         +-----+                 %%%%%|
||        || L ||    HIDEOUT     |ROAD |                      |
||        || I ||                | S   |                      |
||        || B ||                |     |                      |
|+--------+| R |+---------------+GATE +=======================|
|          | A |                | *   |                       |
|          | R |                +-----+                       |
|          | Y |               SPAWN                          |
|==========+---+==================================================+

% = Dense tree wall (east side, impassable)
* = Player spawn point
= = Destructible picket fence (perimeter)
```

## Landmarks

| Landmark | Position | Purpose |
|---|---|---|
| Mansion | Center | Main obstacle. Solid, no interior. Largest structure on the map. |
| Deck | East side of mansion | Walkable platform facing the tree wall. Exposed position. |
| Greenhouse | Northeast, standalone | Landmark. Creates pathing around it. |
| Library | Bottom-left, vertical building | Landmark. Adjacent to library parking lot. |
| Library Parking Lot | Far bottom-left, borders west fence | Open area. Borders perimeter fence (vulnerable when fence breaks). |
| Estate Parking Lot | South-center, between mansion and south gate | Open area near mansion. |
| Gazebo | South-center-east, near estate parking | Landmark. Open structure. |
| Willow Tree | West side, between N and W roads | Large tree. Visual landmark, potential cover. |
| Vintage Cars | Top-left field | Scattered classic cars. Obstacles and cover. |
| Bush Hideout | Between library area and south road | Safe zone. Player can duck in for cover. Zombies linger nearby suspiciously but don't enter. |

## Roads and Entry Points

Three roads exit the map through gaps in the perimeter fence:

| Road | Location | Notes |
|---|---|---|
| North Road | Top-center | Straight path south into the estate. |
| West Road | Mid-left | Leads into the area near the willow tree. |
| South Road | Bottom-center | Slightly windy. Player spawn (gate) is here. |

East side has NO road. Blocked by dense, impassable tree wall.

## Player Spawn
South gate, against the south wall. Player enters through the south road and is guided north toward the estate.

## Zombie Spawning
- Early waves: zombies enter from the three road openings (north, west, south).
- Later waves: fence sections break randomly around the perimeter, opening new entry points. Escalates pressure and unpredictability.

## Fence Mechanics
- Wooden picket fence circles the entire perimeter except road gaps and the east tree wall.
- Fence is destructible. Breaks randomly in later waves.
- Once broken, that section stays open for the rest of the game.

## Bush Hideout Mechanics
- Located left of the south road, near the library area.
- Player can enter to become hidden (safe zone).
- Zombies cannot enter but remain in the area, suspicious of the player's location.
- Intended as an emergency escape, not a permanent camping spot.

## Shop
- UI overlay, not a physical location.
- Opens during 20-second intermission between rounds.
- Clear button to open and close.

## Camera
- Slightly angled top-down (Stardew Valley / Zelda style).

## Gameplay Flow
- **Spawn:** Player starts at south gate, naturally guided north up the road.
- **Early game:** Freedom to explore. Three road entry points funnel zombies predictably.
- **Mid game:** Fence starts breaking. Player must stay mobile and aware.
- **Late game:** Multiple fence breaches. Zombies come from all directions. Map becomes chaotic.
- **Key decision points:** Hold near mansion (central, exposed) vs. edges (near fence, risky). Use bush hideout for emergency resets. Library corner offers a defensible position but is far from center.

## Tileset Requirements
Already have most of what's needed:
- Ground/grass/paths: basic-grass.png, fantasy ground/road tilesets
- Mansion/buildings: pixellab estate set (mansion walls, roof, entrance, floor)
- Greenhouse, gazebo, library: pixellab set (greenhouse, gazebo, library-wall, library-roof)
- Fence: pixellab fence.png
- Trees: fantasy Trees_Bushes.png, pixel-woods.png
- Cars: pixellab car.png
- Roads: fantasy Tileset_Road.png
- Deck: pixellab deck.png
- Props/decorations: basic-props.png, basic-plant.png, fantasy Props.png

### Gaps to Fill
- Bush/hedge tiles for the hideout area
- Willow tree sprite (distinct from regular trees)
- Parking lot surface tiles
- Broken fence variants (for destructible mechanic)
