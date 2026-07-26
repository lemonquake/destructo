# Game Mode: CRATE BLITZ

Grid demolition in the Destructo world — a faithful Bomberman clone wearing the
game's own crate-materializing. Reached from the main menu (`CRATE BLITZ`). Like
Destruct-Auto it is a standalone mode: own scene, own arenas, own rules, own
setup screen, own HUD and — unlike any other mode — **its own mixer**, running
the recorded set in `public/sounds/crate_blitz`.

## Rules of the mode
- **One character.** Everybody is a **Destructo**, exactly as in the base game.
  There is no roster and no loadout: what separates two players is the colour
  they wear and what they dig out of the rubble.
- **Grid-locked movement.** A Destructo is either parked dead-centre on a tile
  or walking in a straight line into one specific neighbouring tile. There is no
  free position and no partial overlap, so lanes are readable and you always end
  a step exactly where you meant to.
- The only weapon is a **Charge Crate** dropped under your own feet. It detonates
  on a fuse and throws a four-lane blast stopped by the first thing it breaks.
- **The blast kills everything it touches** — the other crew, your own crew-mate
  and you. There is no friendly fire toggle, because the bomb you are standing
  next to is the threat the game is about. Spawn protection and a Bubble Plate
  are the only two things that stop it, and both are visible on the board.
- The maze is **destructible**, in three different materials, and about a third
  of what you break hides an upgrade.
- **Elimination, not a frag race.** Everybody gets 1, 3 or 5 lives. Run out and
  you are done — but you keep watching as a **spectator** (`◀`/`▶` to change
  view) until the match resolves.
- Wrecked Destructos respawn at a fresh pad after 3 seconds with 2 seconds of
  spawn protection. **Upgrades are kept through death**; only Bubble Plates go.
- Win condition: **last one standing** (free-for-all) or **last crew standing**
  (co-op). Mutual destruction is a draw.
- **Sudden death**: 150 seconds in, indestructible blocks rain along an inward
  spiral, crushing anything under them and squeezing the survivors together.

## Setting up a match
The setup screen is a lobby, not a character picker:

| Dial | Range |
|---|---|
| Arena | one of three |
| Destructos | 2 – 10 |
| Colour per seat | ten paint jobs, exclusive — picking a taken colour swaps the two seats |
| Battle type | FREE FOR ALL, or CO-OP CREWS |
| Crews | 2 – 4, with `BALANCE CREWS` for an even split |
| Lives | 1 / 3 / 5 |
| CPU skill | ROOKIE / REGULAR / VETERAN / NIGHTMARE |

A live 2D preview paints a real generated lattice with the chosen seat colours
sitting on their actual spawn pads, so density, material mix and starting
distance are all visible before you commit.

## The three obstacle materials
| Obstacle | Blasts to break | Drop odds | Sound |
|---|---|---|---|
| CRATE STOCK (wood) | 1 | best | `wood_explosion.wav` |
| BRICK BLOCK | **2** — cracks first, then goes | good | `brick_explode.wav` |
| SCRAP PILE (debris) | 1 | poor | `debris_explode.wav` |

Each arena mixes them differently, which is most of what makes the three boards
feel unlike each other.

## The three arenas
- **CRATE FOUNDRY FLOOR** — 15×15 classic every-other-tile pillar lattice,
  packed wall to wall with fresh wooden stock.
- **NEON BLOCK PARTY** — 19×15 plazas and block pillars walled in brick, with
  four live conveyor lanes that carry you whether you asked or not.
- **VOLCANIC LATTICE** — 17×17 diagonal pillar bands over an open magma seam;
  mostly salvaged scrap, and the central tiles burn.

Pillars, conveyors and lava are authored; the destructible fill is generated per
match from a seed, so the maze is new every time while the skeleton and the
spawn pockets stay fixed.

## Power-ups
Six upgrades, each with its own hand-drawn SVG badge (used by the lobby, the HUD
kit strip and the pickup banner) and a matching 3D solid that **bounces, pulses
and shines** on the floor:

`BLAST BLOOM` +1 tile of reach · `CRATE STACK` +1 live charge ·
`BLITZ BOOTS` permanently faster · `BUBBLE PLATE` soaks one blast (×3) ·
`PUNT GLOVE` boot a live charge down the lane · `PATCH KIT` back to full.

Drops already lying in a blast are destroyed, so a crossfire cannot be farmed.

## Sound
The mode's mixer (`BlitzAudio`) is created and torn down with the match and uses
only the recorded set:

- **Blast** — `bomb_explode*` layered under `bomb_boom*`, detuned per charge so
  a chain reaction is not one sample on repeat.
- **Obstacles** — voiced by material (see the table above).
- **Death** — one of four `death*` cries.
- **Kill** — one of four `laugh*`, **one second after** the kill, so it reads as
  "boom, silence, cackle" instead of fighting the explosion for headroom.
- **Music** — all five `bgm/*.mp3` in a shuffled order, one after another; when
  the playlist wraps it is re-shuffled so the next lap is a different sequence.

## Feel
- The camera **follows** whoever you are watching, framed **20% tighter** than
  the framing that fits the whole board, and is clamped so it never shows past
  the perimeter wall.
- Every blast jolts the camera; **three or more obstacles going up at once** is a
  proper tremor you feel through the floor.
- A death throws an expanding plume and ring where the Destructo stood.
- A down-arrow drops in over your Destructo at match start and again at a random
  **60–120 second** interval, so a ten-way scrap never loses you.

## Victory celebration
When the match resolves the debrief opens with confetti and a medal placement,
then your own run and the match totals: **charges dropped, obstacles wrecked,
kills, deaths, self-destructs, power-ups taken and how long each Destructo
survived**.

## Controls
`WASD` / arrows move · `Space` or `F` / `LMB` drop a Charge Crate ·
walk into a live charge to punt it (with `PUNT GLOVE`) · `Tab` standings ·
`◀` `▶` change spectate view · `Esc` pause.

## Code layout
| File | Responsibility |
|---|---|
| `src/data/blitzDestructo.js` | The Destructo, the ten paint jobs, the four crews |
| `src/data/blitzPowerups.js` | Six upgrades: SVG badges, weights, caps, 3D recipe |
| `src/data/blitzArenas.js` | Tile vocabulary, obstacle materials, three arenas, maze generation |
| `src/game/blitz/BlitzUnit.js` | Grid-locked movement, charge placement, respawn |
| `src/game/blitz/BlitzGrid.js` | Lattice state, blasts, chains, obstacle damage, drops, sudden death |
| `src/game/blitz/BlitzAI.js` | Danger maps, BFS pathing, escape checks, crew-mate veto |
| `src/game/blitz/BlitzRules.js` | Lobby seats, crews, scoring, elimination, spawn pads |
| `src/game/blitz/BlitzAudio.js` | The mode's own mixer and shuffled BGM playlist |
| `src/game/blitz/BlitzModels.js` | Destructo, obstacles, charges, power-up solids, effects |
| `src/game/blitz/BlitzWorld.js` | Lattice → meshes, kept in step as obstacles break |
| `src/game/blitz/BlitzSelect.js` | Match setup lobby + 2D board preview |
| `src/game/blitz/BlitzHUD.js` | Lives, kit, roster rail, spectator panel, standings |
| `src/game/blitz/BlitzMode.js` | Orchestrator: match lifecycle, camera, sound, victory |
| `tests/crateBlitz.test.js` | Character, arenas, power-ups, movement, blasts, lobby, AI, audio |
| `tests/crateBlitzMatch.test.js` | Full headless matches driven to a winner |

## How the AI plays
It builds a danger map every think: each live charge projects its real blast plan
forward in time. From there it will not stand on a tile that is about to be
lethal, and it **will not place a charge unless a BFS proves an escape tile is
reachable before the fuse ends**. Because the blast is now lethal to everyone, a
crew-mate inside the plan **vetoes the bomb** — co-op CPUs will not blow up their
own team. On top of that it hunts power-ups, breaches obstacles to open lanes,
and prefers wounded targets and anyone down to their last life.
