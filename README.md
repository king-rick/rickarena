# RickArena

Top-down wave-based zombie survival game. Built in six weeks by one person using AI tools for nearly all of the code, art, and audio.

**Play it:** [rickarena-self.vercel.app](https://rickarena-self.vercel.app)

## Problem Statement

I'm an IT specialist with no software engineering background. The idea for this game came from some laughs in a Discord channel with my friends, and it gave me a chance to immerse myself in game development, which is something I always wanted to try but wasn't sure I'd ever have a real opportunity to do. What started as a joke and a short-lived project quickly evolved into a real game with combat, pathfinding, economy systems, wave-based difficulty scaling, and thousands of frames of animation. I became super driven when I realized I was developing something by myself that would normally require a team of developers, artists, and designers. Once the barrier to entry was removed, everything became possible, and I've been diving deep into learning every week since I started.

The four playable characters are based on my real friends, and those same friends helped playtest the game throughout development. A lot of late nights on Discord, screensharing their matches while I watched and took notes. I used audio transcription on those calls to track bugs we ran into in real time. They had no involvement in building the game besides being the inspiration and the playtesters. But it was incredibly motivating to build something that my friends and I could share laughs and have fun with together.

## Solution Overview

RickArena is a browser-based wave survival game inspired by Call of Duty Zombies, built with Phaser 3 and deployed on Vercel. Players fight escalating waves of enemies on a map based on a real location (Endicott Estate, Dedham MA), using weapons, traps, grenades, abilities, and an in-game economy to survive.

**Core features:**
- 4 playable characters, each with a unique ability: Rick (Superkick, boss-killer cone attack), Dan (Electric Fist, chain lightning that arcs through up to 9 enemies), PJ (Katana Slash, wide 140-degree sweep), Muff (Sledgehammer Drop, heavy AoE ground slam)
- 5 weapons: Pistol, Shotgun, SMG, Assault Rifle, and RPG. Each has its own damage, fire rate, spread, knockback, reload speed, and ammo pool. SMG and Assault Rifle support auto-fire on hold.
- 4 enemy types: zombies (3 speed tiers that shift across waves), zombie dogs (stealth pack hunters), SCARYBOI (mid-game boss with a 3-encounter system, scaling HP and flee thresholds per encounter), and Mason (late-game final boss with multi-phase attacks including fire breath, jump-stun, and boom box)
- Wave-based enemy scaling modeled after World at War's zombie system. Linear count increase waves 1-9, exponential HP scaling wave 10+. Zombies transition from shamble to jog to run as waves progress.
- Economy system: flat kill rewards ($15 basic, $100 boss, $500 Mason), wave completion bonuses, 5% interest on banked cash (capped at $50), melee kill bonus
- Shop with weapons, ammo types, healing, grenades, and traps
- Generator power-on mechanic that enables two perk machines: Zyn (50% faster reloads) and Keg (100 armor)
- Level-up buff system with 6 categories (Strength, Health, Stamina, Speed, Luck, Scavenger), 3 tiers each, diminishing returns after 3 buffs in a category
- Throwable grenades with aim trajectory, parabolic arc, and AoE explosion
- Sprint with stamina drain and a burnout state (reduced speed and damage when stamina is depleted)
- Placeable traps: spike traps (damage + slow, 6 uses), barricades (blocks movement, rotatable), landmines (200 damage AoE)
- Door-locked map progression across multiple zones
- Room visibility system that blacks out areas the player isn't in
- Anti-camping room pressure that spawns flanking enemies if you stay in one room too long
- Mason boss encounter with a rave intro sequence, dancing zombies, cutscenes, and phase-based combat
- 6,000+ sprite frames across characters, enemies, and animation sets
- 139 audio files (combat, ambient, UI, boss dialogue, generator, door/fence destruction)
- Neon Postgres leaderboard with top 5 scores

AI wrote roughly 95% of the code, generated all the sprite art, and produced most of the sound effects. I don't have the background to write a game engine integration, implement A* pathfinding, or build a wave scaling system from scratch. AI made that accessible through conversation.

## AI Integration

### Tools Used

| Tool | Role | Why |
|------|------|-----|
| **Claude Code (Opus 4)** | Primary development | Terminal-based coding agent with full file access. Read my project, wrote code, ran the dev server, debugged. ~90% of all game logic. |
| **Cursor + GPT-5.3 Codex** | Code review + surgical edits | Used as a third-party reviewer agent and for targeted corrections in specific files. |
| **PixelLab (MCP Server)** | Pixel art generation | Runs inside Claude Code via MCP. Generated characters, enemies, and animation sets as tool calls in the same session where code was being written. |
| **Gemini CLI / Nano Banana** | Art direction + architecture review | Used with GCP API keys for concept art direction, visual reference, and second opinions on refactoring. |
| **ElevenLabs** | Sound effects + voice | Generated combat audio, ambient sounds, boss dialogue, and UI feedback from text descriptions. |
| **ComfyUI (Flux Dev)** | Concept art | Local image generation on my MacBook. Character reference sheets and art direction before sprite generation. |

### How the Tools Work Together

**PixelLab as an MCP server.** PixelLab runs as both a web app with a GUI and a tool inside Claude Code's terminal. I describe a character or animation, it generates the sprite sheet. Over 6,000 frames were generated this way without opening a separate art application.

**Multi-tool features.** Some features required chaining across tools. Example: Dan's Electric Fist ability. Claude Code wrote the chain lightning game logic. PixelLab generated the electric-fist animation, lightning bolt sprites, and electrified-stun enemy animation. ElevenLabs generated the electrical zap sound. Then Claude Code wired it all together: ability trigger, sequential bolt travel between chained enemies, stun state, deferred death timers, VFX cleanup.

**Agentic workflow.** AI CLI tools have terminal access. They read existing files, write code, run the dev server, and see the errors. When something broke, the tool traced the error, found the source, and fixed it in the same session without me having to copy-paste error messages or explain what happened.

### Tradeoffs

**Cost vs. capability.** Claude Code with Opus is expensive per token, but fast per feature. A single session could produce a complete game system (the entire leveling/buff system: XP formula, tier gates, diminishing returns, buff selection UI).
**Context window vs. codebase size.** Development worked well until files grew past context limits. GameScene.ts is now 6,100+ lines. When files get that large, Claude Code loses track of variables defined thousands of lines earlier, suggests duplicates, or makes edits that conflict with code it can't see. I used Cursor with Codex as a second set of eyes to review and make surgical corrections in those situations.

**Generation quality vs. cleanup.** PixelLab sprites are good enough to ship, but not pixel-perfect. Frame alignment, timing, and visual consistency across animation sets required manual Aseprite cleanup.

### Where AI Worked Well

- Describing the World at War zombie scaling model in plain English and getting a working implementation with linear/exponential phases, speed tier transitions, and staggered spawning. First try.
- Cross-file debugging. Claude Code traced a bug from GameScene.ts through Enemy.ts, WaveManager.ts, and balance.ts to find a scaling coefficient applied twice. Thousands of lines across four files.
- Learning development. I used AI throughout the process to understand what exactly we were doing, break concepts down in easier to understand methods, ask questions, etc. I had zero experience with any of the tools used in the creation of the game prior to January 2026, and I was able to learn enough about them all to develop a live stable working game.

### Where AI Fell Short

- **Architecture entropy.** AI adds code wherever you're working. It doesn't push back and say "this file is too big." GameScene.ts became a 6,100-line God Class because AI never once suggested extracting systems into separate files. I had not considered things like this when in the early stages of development. It would have been helpful to have had things liket his flagged to me, especially because I had stated at the beginning of the project that I was a beginner in all of the tools we used. 
- **Game feel.** AI can implement any damage formula or speed curve you describe. It can't tell you if the game is fun. Balancing required dozens of playtesting sessions and judgment calls that no model can make.
- **Sprite cleanup.** AI-generated pixel art is a starting point. Frame alignment, hitbox accuracy, and animation timing all required manual work in Aseprite, and taste.

## Architecture / Design Decisions

### Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Game Engine | Phaser 3 | Mature 2D engine with built-in physics, sprite management, and input handling. Large community means AI tools have strong training data. |
| Framework | Next.js 16 | Handles non-game UI (character select, HUD overlay, menus) in React. API routes serve the leaderboard. Deploys to Vercel with zero config. |
| Language | TypeScript 5 | Type safety catches integration errors between game systems. AI produces better TypeScript than JavaScript because types constrain output. |
| Database | Neon Postgres | Serverless Postgres for the leaderboard. Scales to zero when nobody's playing. |
| Pathfinding | EasyStarJS | A* pathfinding library. Lightweight, well-documented. |
| Styling | Tailwind 4 | Utility CSS for the React UI layer. |
| Deployment | Vercel | Git push to deploy. Free tier handles the traffic. |
| Map Rendering | Phaser Graphics + Sprite Renderer | Main map (Endicott Estate) drawn procedurally in code. Separate sprite-based renderer supports tile-placed maps from a 200+ tile catalog. |

### Project Structure

```
src/
├── app/                    # Next.js pages + API routes (leaderboard)
├── components/             # React UI layer
│   ├── Game.tsx            # Phaser game mount point
│   ├── HUDOverlay.tsx      # HUD composition + z-index layering
│   ├── CharacterSelect.tsx # Pre-game character picker with concept art
│   ├── MainMenu.tsx        # Intro sequence, play/controls/leaderboard
│   ├── LoadingScreen.tsx
│   └── hud/                # 23 subcomponents (health, stamina, hotbar,
│                           #   shop, inventory, level-up, pause, game over,
│                           #   wave announcements, boss intros, minimap,
│                           #   objective tracker, dev panel, etc.)
├── game/
│   ├── scenes/
│   │   ├── BootScene.ts
│   │   ├── PreloadScene.ts # Asset loading (475 lines)
│   │   ├── MainMenuScene.ts
│   │   └── GameScene.ts    # Main gameplay loop (6,149 lines)
│   ├── entities/
│   │   ├── Player.ts       # Movement, weapons, abilities, stamina (694 lines)
│   │   ├── Enemy.ts        # AI, attacks, scaling, pathfinding (2,653 lines)
│   │   ├── Projectile.ts
│   │   ├── Door.ts
│   │   └── Trap.ts
│   ├── systems/
│   │   ├── WaveManager.ts  # Wave progression, enemy composition (803 lines)
│   │   ├── LevelingSystem.ts # XP, buffs, tier gates (237 lines)
│   │   └── Pathfinder.ts   # A* integration (155 lines)
│   ├── data/
│   │   ├── characters.ts   # Character definitions + abilities (100 lines)
│   │   ├── animations.ts   # Frame counts per character/animation (158 lines)
│   │   └── balance.ts      # All tunable numbers (324 lines)
│   └── map/
│       ├── EndicottEstate.ts    # Procedural map drawing (814 lines)
│       ├── SpriteMapRenderer.ts # Sprite-based tile rendering
│       ├── TileCatalog.ts       # 200+ tile definitions across 9 tilesets
│       └── MapSaveFormat.ts     # Map persistence format
public/assets/
├── sprites/                # 6,234 PNGs
├── audio/                  # 139 sound files
├── maps/                   # Map data
└── concept-art/            # Reference sheets
```

**Total: ~18,700 lines of TypeScript across 54 files. 259 MB of assets.**

### Key Design Decisions

**Single-scene architecture.** GameScene.ts handles the core gameplay loop, input, spawning, HUD updates, and state management in one file. This is the God Class problem. The tradeoff was development speed over modularity. Adding features to one large file is faster than managing imports and interfaces across many small files when you're working with AI. The cost is maintainability. Starting over, I'd enforce a 500-line file limit and extract systems earlier.

**Data-driven balance.** All tunable numbers (weapon damage, enemy HP scaling, economy rates, buff values, cooldown timers) live in `balance.ts`. I can iterate on game feel by changing numbers in one file rather than hunting through game logic. AI suggested this pattern early and it saved a lot of time.

**Sprite-based VFX.** Every visual effect (blood splatters, ability VFX, muzzle flashes, dust bursts) uses sprite animations instead of Phaser's built-in particle system. More artistic control and consistent visual style, at the cost of more asset management.

**WaW-style scaling.** Enemy difficulty scales through speed and volume, not damage sponges. Zombies transition from shamble to jog to run across waves, and count increases. Keeps combat feeling dangerous without making individual enemies tedious. Exponential HP scaling only kicks in at wave 10+ as a late-game pressure valve.

**Room visibility.** A RenderTexture occlusion layer blacks out rooms the player isn't currently in. Prevents peeking into adjacent areas and forces the player to move through the map to see what's ahead.

## What Did AI Help You Do Faster, and Where Did It Get in Your Way?

### What AI Accelerated

**System implementation from description.** I described how CoD Zombies waves feel and got a working wave management system in one session. Spawn timing, enemy composition per wave, speed tier transitions, boss encounter scheduling, intermission phases. Without AI, I'd need to learn Phaser's scene lifecycle, understand game loop timing, and debug spawn race conditions myself.

**No context switching.** In a single terminal session: write game logic, generate sprite sheets through PixelLab MCP calls, wire the sprites into the animation system, playtest, find a bug, fix it, move on. The normal workflow would have me bouncing between a code editor, art tool, file explorer, and browser. AI kept everything in one place.

**Cross-file debugging.** When chain lightning was killing enemies out of order and leaving ghost sprites, Claude Code traced the issue across GameScene.ts, Enemy.ts, and the animation callback system. Found that deferred death timers conflicted with the chain's sequential execution. That kind of cross-file reasoning would have taken me a long time to work through on my own.

### Where AI Got in My Way

**It never says no.** When I asked for feature after feature in GameScene.ts, AI added them. It never suggested extracting systems into separate files. By the time I noticed the problem, the file was deeply coupled and thousands of lines long.

**Context window limits.** As files grew past context limits, Claude Code would lose track of things, suggest duplicates, or make edits that conflicted with code it couldn't see. I brought in Cursor with Codex as a reviewer agent to catch those issues and make targeted fixes.

**False confidence on edge cases.** AI-generated code works well on the happy path. Game development is mostly edge cases: two enemies dying on the same frame, a player activating an ability during a reload animation, a door opening while an enemy is pathfinding through it. AI produced clean code that failed on these interactions, and the failures were subtle enough that only playtesting caught them.

**How it changed my approach.** I stopped trying to learn to code and started thinking of myself as a systems designer who validates AI output. Define what each system should do, let AI implement it, then playtest to find where it breaks. The skill is specifying precisely enough and catching what the AI gets wrong.

## Getting Started / Setup Instructions

```bash
git clone https://github.com/king-rick/rickarena.git
cd rickarena
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Requirements:** Node.js 18+, npm

**Environment variables (optional):** The game runs fully client-side. The leaderboard requires a `DATABASE_URL` environment variable pointing to a Neon Postgres instance. Without it, the game is fully playable but scores won't persist.

## Demo

**Live:** [rickarena-self.vercel.app](https://rickarena-self.vercel.app)

**How to play:**

1. Select a character (each has a unique ability)
2. Survive waves of enemies by shooting, punching, and using your ability
3. Sprint with Shift to move faster (watch your stamina, burnout slows you down)
4. Earn cash from kills and wave completions
5. Spend cash at the shop during intermissions (B to open) on weapons, ammo, healing, grenades, and traps
6. Open locked doors ($300) to access new areas of the map
7. Activate the generator to power perk machines (Zyn for reload speed, Keg for armor)
8. Level up from XP to choose buffs (Strength, Health, Stamina, Speed, Luck, Scavenger)
9. Watch for SCARYBOI across 3 escalating encounters and Mason as the final boss at the estate

**Controls:**

| Input | Action |
|-------|--------|
| WASD / Arrow Keys | Move |
| Shift (hold) | Sprint |
| Left Click / Space | Punch (melee) |
| Right Click / F | Shoot / Use item (hold for auto-fire) |
| R | Reload |
| Q | Ability (character-specific) |
| G | Grenade (hold to aim, release to throw) |
| 1, 2, 3, 4 | Select hotbar slot |
| E | Interact / Cycle hotbar |
| I | Inventory |
| B | Shop |
| V | Rotate barricade |
| ESC | Pause |

## Testing / Error Handling

### Testing Approach

Testing was manual playtesting. Each system was validated through repeated play sessions focused on specific mechanics.

**Balance testing.** Weapon damage, enemy scaling, and economy rates tuned through dozens of play sessions. Each session focused on a specific wave range (early game, mid-game progression, late-game pressure). Balance values are centralized in `balance.ts` so adjustments don't touch game logic.

**Edge cases found through playtesting:**
- Enemies dying on the same frame as a chain lightning hop, causing null reference on the next target
- Player activating an ability during reload, causing animation state conflicts
- Dogs spawning inside collision geometry, fixed with `isCollisionFree()` pre-spawn check
- Health bars rendering on enemies with 0 HP during death animations
- SCARYBOI pathfinding into walls during backflip retreat, fixed with smoke-vanish escape animation
- Burnout state not clearing properly when stamina partially recovered mid-sprint
- Mason's fire breath cone hitting through walls before room visibility checks were added

**Spawn system validation.** Wave composition, enemy counts, and spawn timing validated across 15+ wave ranges to make sure difficulty curves match the intended WaW-style progression.

### Error Handling

- **Asset loading:** PreloadScene validates all sprite sheets and audio files load before transitioning to gameplay. Missing assets log warnings rather than crashing.
- **Pathfinding failures:** If A* can't find a path, enemies fall back to direct movement toward the player rather than freezing.
- **Economy overflow:** Interest caps prevent economy values from going nonsensical at high wave counts.
- **State cleanup:** Enemy death sequences clean up all associated sprites, timers, and status effects to prevent memory leaks during long sessions.
- **Boss encounter state:** SCARYBOI encounter progression is tracked by order (not location), so HP and flee thresholds scale correctly even if the player reaches zones out of the expected sequence.

## Future Improvements / Stretch Goals

**Multiplayer (1-4 player co-op).** The game is designed for it. Character select supports 4 slots. Economy, wave scaling, and revive mechanics are built with co-op in mind. Needs WebSocket integration and state synchronization.

**Break up GameScene.ts.** Extract into dedicated systems: CombatManager, SpawnManager, EconomyManager, InputHandler. Highest-priority technical debt. Would make the codebase AI-editable again (each file fits in context) and enable unit testing.

**Automated testing.** A test harness that simulates combat encounters, economy flows, and wave progression without manual play. Would catch regressions that playtesting misses.

**Additional maps.** The sprite-based map renderer and 200+ tile catalog already support building new maps. Different layouts, door configurations, and spawn patterns would add replayability.

**Mobile support.** Phaser 3 supports touch input. Virtual joystick controls and responsive canvas sizing would make it playable on phones.

## Acknowledgments

### Third-Party Libraries
- **[Phaser 3](https://phaser.io/)** (MIT) - 2D game engine
- **[EasyStarJS](https://github.com/prettymuchbryce/EasyStarJS)** (MIT) - A* pathfinding
- **[Next.js](https://nextjs.org/)** (MIT) - React framework
- **[React](https://react.dev/)** (MIT) - UI library
- **[Tailwind CSS](https://tailwindcss.com/)** (MIT) - Utility CSS
- **[@neondatabase/serverless](https://neon.tech/)** - Serverless Postgres driver

### AI Tools Used in Development
- **Claude Code (Anthropic)** - AI coding agent (primary development tool)
- **Cursor + GPT-5.3 Codex (OpenAI)** - Code review and surgical corrections
- **PixelLab** - AI pixel art generation (MCP server)
- **ElevenLabs** - AI sound effect and voice generation
- **ComfyUI + Flux** - Local AI image generation (concept art)
- **Gemini CLI / Nano Banana (Google)** - Art direction and architecture review

### Assets
- All character sprites, enemy sprites, and animations generated via PixelLab AI
- Sound effects and voice lines generated via ElevenLabs and sourced from royalty-free libraries
- Map based on Endicott Estate, Dedham MA (public venue, used as creative inspiration)

## License

Private repository. Source code shared for application review purposes.
