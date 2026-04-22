# RickArena

Top-down co-op horde survival built almost entirely with AI tools.

## Problem Statement

Most people with software ideas can't build them. The gap between "I know exactly what I want" and "I can ship it" has historically required years of engineering training. AI coding tools are closing that gap, but the conversation is dominated by simple demos: chatbots, API wrappers, CRUD apps. Nobody is stress-testing these tools against genuinely complex, system-heavy projects.

I wanted to answer a specific question: can a non-engineer use AI to build something with real technical depth? Not a prototype. Not a toy. A full game with combat systems, pathfinding, economy balancing, sprite animation pipelines, and wave-based difficulty scaling. Something my friends and I would actually play.

The audience for this problem is every builder who has domain knowledge and taste but lacks traditional engineering skills. If AI tools actually work as force multipliers, the proof should be something ambitious enough that "I used AI" isn't a caveat. It should be the point.

Success looks like a playable, deployable game that holds up to scrutiny from both players and engineers. RickArena is that game.

## Solution Overview

RickArena is a browser-native wave survival game inspired by Call of Duty Zombies, built with Phaser 3 and deployed on Vercel. Players fight escalating waves of enemies on a map based on a real location (Endicott Estate, Dedham MA), using weapons, traps, abilities, and an in-game economy to survive.

**Core features:**
- 4 playable characters with unique abilities (Superkick, Electric Fist chain lightning, Katana Slash, Sledgehammer Slam)
- 3 weapon classes (Pistol, Shotgun, SMG) with distinct handling, reloading, and knockback
- Wave-based enemy scaling modeled after World at War's zombie system (linear waves 1-9, exponential 10+)
- 3 enemy types: shambling zombies with speed tiers, fast dogs with stealth mechanics, and a recurring boss (SCARYBOI) with a full 4-attack moveset
- Economy system: kill rewards, wave bonuses, interest on banked cash, price inflation, shop tiers
- Perk machines and a level-up buff tree (6 categories, 3 tiers each, diminishing returns)
- Placeable traps (spike traps, barricades, landmines) for area control
- Door-locked map progression with generator activation
- 6,000+ sprite frames across 7 characters and 18+ animation sets
- 99 audio files (combat, ambient, UI)
- Neon Postgres leaderboard backend

**AI is core to this project, not supplementary.** AI wrote the code, generated the art, produced the sound effects, and reviewed the architecture. Without AI, this project doesn't exist. I don't have the engineering background to write a game engine integration, implement A* pathfinding, or build a wave scaling system from scratch. AI made all of that accessible through natural language conversation.

**Play it live:** [rickarena-self.vercel.app](https://rickarena-self.vercel.app)

## AI Integration

### Tools Used

| Tool | Role | Why This Tool |
|------|------|---------------|
| **Claude Code (Opus 4)** | Primary development partner | Conversational coding with full terminal access. Could read files, run commands, and iterate in-context. Used for ~90% of all game logic, systems design, and debugging. |
| **Cursor + GPT-5.3 Codex** | Large file editing | 200K context window. GameScene.ts grew past 3,900 lines and exceeded Claude Code's context. Codex could hold the entire file and make targeted edits without losing surrounding context. |
| **PixelLab (MCP Server)** | AI pixel art generation | Integrated directly into Claude Code via MCP protocol. Generated characters, enemies, and full animation sets (walk, run, attack, death, abilities) through tool calls in the same terminal session where code was being written. No context switching. |
| **Gemini CLI** | Architecture review | Free-tier model used for second opinions on refactoring strategy and codebase-level analysis. Useful as a parallel review channel. |
| **ElevenLabs** | Sound effect generation | Generated combat audio, ambient sounds, and UI feedback from text descriptions. |
| **ComfyUI (Flux Dev)** | Concept art and reference sheets | Local AI image generation on MacBook. Used for character concept art and visual reference before PixelLab sprite generation. |

### Patterns and Integration Depth

**MCP Tool Use (PixelLab).** PixelLab runs as an MCP server inside Claude Code. Character creation, animation generation, and sprite management happen through structured tool calls in the same conversation where game logic is being written. This means I can say "generate a 9-frame electric-fist animation for Dan facing all 8 directions" and get sprite sheets returned directly, then immediately write the code to load and play them. The art pipeline and code pipeline are unified in one interface. Over 6,000 frames were generated this way.

**Multi-tool orchestration.** Complex features required chaining across tools. Example: Dan's Electric Fist ability. Claude Code designed the chain lightning mechanic and wrote the game logic. PixelLab generated the electric-fist character animation, the lightning bolt sprites, and the electrified-stun enemy animation. ElevenLabs generated the electrical zap sound effects. Then Claude Code wired everything together: the ability trigger, the sequential bolt travel between chained enemies, the stun state, the deferred death timer, and the VFX cleanup. One feature, four AI tools, zero manual code.

**Agentic development workflow.** Claude Code operates as an agent with terminal access. It reads existing code, proposes changes, writes files, runs the dev server, and observes errors. When a feature broke something, Claude could read the error output, trace it back to the source, and fix it in the same session. This is not autocomplete. It's a development loop where the AI has context about the full project and can reason about cascading effects.

### Tradeoffs

**Cost vs. capability.** Claude Code with Opus is expensive per token but dramatically faster per feature. A single session could produce a complete game system (e.g., the entire leveling/buff system: XP formula, tier gates, diminishing returns, buff selection UI) in under an hour. The cost-per-feature calculation favors high-capability models over cheap ones.

**Context window vs. codebase size.** Claude Code's context window couldn't hold GameScene.ts (3,900+ lines) alongside the files it needed to reference. Switching to Cursor with GPT-5.3 Codex (200K context) solved this but broke the conversational flow. The tradeoff is: smaller context = better conversation but file size limits; larger context = can hold everything but less interactive.

**Generation quality vs. manual cleanup.** PixelLab sprites are good enough to ship but not pixel-perfect. Frame alignment, timing consistency, and visual coherence across animation sets required manual Aseprite cleanup. The tradeoff is accepted: AI generates 90% of the value in 10% of the time, and the remaining polish is human work.

### Where AI Exceeded Expectations

- **System design from description.** Describing the World at War zombie scaling model in plain English and getting a working implementation with linear/exponential phases, speed tier transitions, and staggered spawning. First try.
- **Cross-file reasoning.** Claude Code could trace a bug from a symptom in GameScene.ts back through Enemy.ts, WaveManager.ts, and balance.ts to find a scaling coefficient that was applied twice. That's 5,000+ lines of reasoning across four files.
- **PixelLab consistency.** Characters generated weeks apart maintain visual consistency in style, palette, and proportions. The art direction holds together without a human artist enforcing it.

### Where AI Fell Short

- **Architecture entropy.** AI happily adds code to wherever you're currently working. It doesn't push back and say "this file is too large, let's extract a system." GameScene.ts became a 3,900-line God Class because AI is a compliant collaborator, not an opinionated architect.
- **Game feel is not computable.** AI can implement any damage formula or speed curve you describe. It cannot tell you if the game is fun. Balancing required dozens of human playtesting sessions and gut-level judgment calls that no model can replicate.
- **Sprite cleanup.** AI-generated pixel art is a starting point. Frame alignment, hitbox accuracy, and animation timing all required manual human work in Aseprite.

## Architecture / Design Decisions

### Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Game Engine | Phaser 3 | Mature 2D engine with built-in physics, sprite management, and input handling. Large community means AI tools have strong training data for it. |
| Framework | Next.js 16 | Handles the non-game UI (character select, HUD overlay) in React. API routes serve the leaderboard. Deploys to Vercel with zero config. |
| Language | TypeScript 5 | Type safety catches integration errors between game systems. AI tools produce better TypeScript than JavaScript because types constrain output. |
| Database | Neon Postgres | Serverless Postgres for the leaderboard. Scales to zero when nobody's playing. |
| Pathfinding | EasyStarJS | A* pathfinding library. Lightweight, well-documented, easy for AI to integrate. |
| Styling | Tailwind 4 | Utility CSS for the React UI layer. No custom CSS files. |
| Deployment | Vercel | Git push to deploy. Free tier handles the traffic. |
| Maps | Tiled (TMJ) | Industry-standard 2D map editor. Exports JSON that Phaser can consume. |

### Project Structure

```
src/
├── app/                    # Next.js pages + API routes (leaderboard)
├── components/             # React UI layer
│   ├── Game.tsx            # Phaser game mount point
│   ├── HUDOverlay.tsx      # Health, stamina, equipment, wave info
│   ├── CharacterSelect.tsx # Pre-game character picker
│   └── hud/                # HUD subcomponents (StaminaBar, StatsScreen, etc.)
├── game/
│   ├── scenes/             # Phaser scene lifecycle
│   │   ├── BootScene.ts    # Init
│   │   ├── PreloadScene.ts # Asset loading (414 lines)
│   │   ├── MainMenuScene.ts
│   │   └── GameScene.ts    # Main gameplay loop (3,900+ lines)
│   ├── entities/           # Game objects
│   │   ├── Player.ts       # Movement, weapons, abilities, stamina (639 lines)
│   │   ├── Enemy.ts        # AI, attacks, scaling, pathfinding (2,119 lines)
│   │   ├── Projectile.ts
│   │   ├── Door.ts
│   │   └── Trap.ts
│   ├── systems/            # Extracted game systems
│   │   ├── WaveManager.ts  # Wave progression, enemy composition (881 lines)
│   │   ├── LevelingSystem.ts # XP, buffs, tier gates (226 lines)
│   │   └── Pathfinder.ts   # A* integration (135 lines)
│   ├── data/               # Configuration
│   │   ├── characters.ts   # Character definitions + abilities
│   │   ├── animations.ts   # Frame counts per character/animation
│   │   └── balance.ts      # All tunable numbers (272 lines)
│   └── map/                # Tiled map loading + rendering
public/assets/
├── sprites/                # 6,000+ PNGs (character/animation/direction)
├── audio/                  # 99 sound files
├── maps/                   # Endicott Estate (Tiled TMJ format)
└── concept-art/            # Reference sheets
```

**Total: ~9,000 lines of TypeScript across 49 files. 1.3 GB of assets.**

### Key Design Decisions

**Single-scene architecture.** GameScene.ts handles the core gameplay loop, input, spawning, HUD updates, and state management in one file. This is the God Class problem mentioned above. The tradeoff was development speed over modularity. With AI tools, adding features to one large file is faster than managing imports and interfaces across many small files. The cost is maintainability. If I were starting over, I'd enforce a 500-line file limit and extract systems earlier.

**Data-driven balance.** All tunable numbers (weapon damage, enemy HP scaling, economy rates, buff values, cooldown timers) live in `balance.ts`. This lets me iterate on game feel by changing numbers in one file rather than hunting through game logic. AI suggested this pattern early and it paid off enormously.

**Sprite-based VFX over Phaser particles.** Every visual effect (blood splatters, ability VFX, muzzle flashes, dust bursts) uses sprite animations instead of Phaser's built-in particle system. This gives more artistic control and consistent visual style, at the cost of more asset management.

**WaW-style scaling.** Enemy difficulty scales primarily through speed and volume, not damage sponges. Zombies transition from shamble to jog to run across waves, and count increases. This keeps combat feeling dangerous without making individual enemies tedious to kill. The exponential HP scaling only kicks in at wave 10+ as a late-game pressure valve.

## What Did AI Help You Do Faster, and Where Did It Get in Your Way?

### What AI Accelerated

**System implementation from description.** I could describe a game system in plain English and get a working implementation in minutes. The entire wave management system (spawn timing, enemy composition per wave, speed tier transitions, boss encounter scheduling, intermission phases) went from a verbal description to working code in a single Claude Code session. Without AI, building that system would have required learning Phaser's scene lifecycle, understanding game loop timing, and debugging spawn race conditions. AI handled all of that from my description of how CoD Zombies waves feel.

**Cross-domain work without context switching.** In a single terminal session, I could: write game logic in TypeScript, generate sprite sheets through PixelLab MCP calls, wire the sprites into the animation system, playtest, find a bug, fix it, and move on. The traditional workflow (write code in IDE, open art tool, export sprites, switch back to IDE, import assets, test) fragments attention. AI unified the pipeline.

**Debugging complex interactions.** When Dan's Electric Fist chain lightning was killing enemies out of order and leaving ghost sprites, Claude Code traced the issue across GameScene.ts, Enemy.ts, and the animation callback system. It identified that deferred death timers were conflicting with the chain's sequential execution. That kind of cross-file debugging would have taken me hours. AI found it in one conversation turn.

### Where AI Got in My Way

**The compliant collaborator problem.** AI never says "no" or "this is getting unwieldy." When I asked for feature after feature in GameScene.ts, AI added them. It never suggested extracting a combat system, a spawn system, or an economy system into separate files. By the time I recognized the God Class problem, the file was 3,900 lines and deeply coupled. AI's eagerness to help created a maintenance problem that AI then struggled to fix (because the file exceeded context windows).

**Context window cliff.** Development went smoothly until files grew past context limits. Then it fell off a cliff. Claude Code would lose track of variables defined 2,000 lines earlier in the same file, suggest duplicate implementations, or make edits that conflicted with code it couldn't see. The fix (switching to Cursor with a larger context model) worked but broke the conversational flow that made Claude Code productive.

**False confidence on edge cases.** AI-generated code works great on the happy path. But game development is almost entirely edge cases: what happens when two enemies die on the same frame? When a player activates an ability during a reload animation? When a door opens while an enemy is pathfinding through it? AI would produce clean-looking code that failed on these interactions, and the failures were subtle enough that only playtesting caught them.

**How it changed my approach.** I stopped thinking of myself as someone learning to code and started thinking of myself as a systems designer who validates AI output. My job became: define what each system should do, let AI implement it, then playtest aggressively to find where the implementation breaks. The skill shifted from "can I write this?" to "can I specify this precisely enough and catch what the AI gets wrong?"

## Getting Started / Setup Instructions

```bash
git clone https://github.com/king-rick/rickarena.git
cd rickarena
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Requirements:** Node.js 18+, npm

**Environment variables (optional):** The game runs fully client-side. The leaderboard requires a `DATABASE_URL` pointing to a Neon Postgres instance. Without it, the game is fully playable but scores won't persist.

```bash
# Optional: for leaderboard functionality
cp .env.example .env
# Add your Neon Postgres connection string
```

## Demo

**Live:** [rickarena-self.vercel.app](https://rickarena-self.vercel.app)

**How to play:**

1. Select a character (each has a unique ability)
2. Survive waves of enemies by shooting, punching, and using your ability
3. Earn cash from kills and wave completions
4. Spend cash at the shop (weapons, ammo, healing, traps)
5. Open locked doors to access new areas of the map
6. Activate the generator to power perk machines
7. Level up from XP to choose buffs (Strength, Health, Stamina, Speed, Luck, Scavenger)
8. Survive as long as you can. SCARYBOI shows up after wave 5.

**Controls:**

| Input | Action |
|-------|--------|
| WASD / Arrows | Move |
| Mouse | Aim / Interact |
| Click / Space / F | Punch / Shoot / Place trap |
| 1-4 / Q / E | Hotbar cycle |
| R | Ability (character-specific) |
| ESC | Pause |

## Testing / Error Handling

### Testing Approach

Testing was primarily manual playtesting, which is standard for indie game development. Each system was validated through repeated play sessions focused on specific mechanics:

**Balance testing.** Weapon damage, enemy scaling, and economy rates were tuned through dozens of play sessions. Each session focused on a specific wave range (early game feel, mid-game progression, late-game pressure). Balance values are centralized in `balance.ts` so adjustments don't require touching game logic.

**Edge case discovery.** Most bugs surfaced during playtesting rather than code review. Examples of edge cases caught and fixed:
- Enemies dying on the same frame as a chain lightning hop, causing null reference on the next target
- Player activating an ability during reload, causing animation state conflicts
- Dogs spawning inside collision geometry (trees, bushes), fixed with `isCollisionFree()` pre-spawn check
- Health bars rendering on enemies with 0 HP during death animations
- SCARYBOI pathfinding into walls during backflip retreat, fixed with smoke-vanish escape animation

**Spawn system validation.** Wave composition, enemy counts, and spawn timing were validated across 15+ wave ranges to ensure difficulty curves match the intended WaW-style progression.

### Error Handling

- **Asset loading:** PreloadScene validates all sprite sheets and audio files load before transitioning to gameplay. Missing assets log warnings rather than crashing.
- **Pathfinding failures:** If A* can't find a path, enemies fall back to direct movement toward the player rather than freezing in place.
- **Economy overflow:** Price inflation caps and interest caps prevent economy values from becoming nonsensical at high wave counts.
- **State cleanup:** Enemy death sequences clean up all associated sprites, timers, and status effects to prevent memory leaks during long sessions.

## Future Improvements / Stretch Goals

**Multiplayer (1-4 player co-op).** The game is designed for it. Character select supports 4 slots. The systems (economy, wave scaling, revive mechanics) are built with co-op in mind. Implementation requires WebSocket integration and state synchronization. This is the single biggest feature that would transform the game from a solo experience into what it was always meant to be.

**Extract the God Class.** Break GameScene.ts into dedicated systems: CombatManager, SpawnManager, EconomyManager, InputHandler. This is the highest-priority technical debt. It would make the codebase AI-editable again (each file fits in context) and enable proper unit testing.

**Automated testing.** A test harness that can simulate combat encounters, economy flows, and wave progression without manual play. Would catch regressions that playtesting misses and enable faster iteration on balance changes.

**Additional maps.** The map system supports multiple Tiled TMJ files. New maps with different layouts, door configurations, and spawn patterns would add replayability.

**Mobile support.** Phaser 3 supports touch input. Adding virtual joystick controls and responsive canvas sizing would make the game playable on phones.

## Acknowledgments

### Third-Party Libraries
- **[Phaser 3](https://phaser.io/)** (MIT) — 2D game engine
- **[EasyStarJS](https://github.com/prettymuchbryce/EasyStarJS)** (MIT) — A* pathfinding
- **[Next.js](https://nextjs.org/)** (MIT) — React framework
- **[React](https://react.dev/)** (MIT) — UI library
- **[Tailwind CSS](https://tailwindcss.com/)** (MIT) — Utility CSS
- **[@neondatabase/serverless](https://neon.tech/)** — Serverless Postgres driver

### AI Tools Used in Development
- **Claude Code (Anthropic)** — AI coding assistant (primary development tool)
- **Cursor** — AI-powered code editor
- **GPT-5.3 Codex (OpenAI)** — Large context model used via Cursor
- **PixelLab** — AI pixel art generation (MCP server)
- **ElevenLabs** — AI sound effect generation
- **ComfyUI + Flux** — Local AI image generation (concept art)
- **Gemini CLI (Google)** — Architecture review

### Assets
- All character sprites, enemy sprites, and animations generated via PixelLab AI
- Sound effects generated via ElevenLabs and sourced from royalty-free libraries
- Map based on Endicott Estate, Dedham MA (public venue, used as creative inspiration)

## License

Private repository. Source code shared for application review purposes.
