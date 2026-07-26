# Game Mode: DESTRUCT-AUTO

A Twisted-Metal-style vehicle battle arena set in the Destructo world. Reached
from the main menu (`DESTRUCT-AUTO`), it is a self-contained mode: its own
scene, arenas, rules, selection screen and HUD. It shares only the base
engine services — renderer, input, audio, particles, save settings.

## Rules of the mode
- The Destructo is welded into the driver's seat and **never** gets out.
- **No crates, no D-Builder, no infantry.** Weapons are fixed to the chassis.
- Every vehicle has an **unlimited sub-machine gun** (rate-of-fire limited only)
  and one **Ultimate weapon on a cooldown**, unique to that chassis.
- Wrecked vehicles respawn at their own crew's respawn pad after 4 seconds with
  1.6 seconds of spawn protection.
- **No two drivers may share a Destruct-Auto.** The player picks first; the CPU
  field is drafted from what is left, so a 10-driver match uses all ten.
- **Team vs Team** (2 drivers minimum, up to 5v5) or **Free-for-all** (up to 10).
- Win conditions: 3 / 5 / 10 minutes (most crew kills), or Race to 10 / 20 / 30 / 50.
  A timed match that expires level rolls into sudden-death overtime.
- Kills score for the killer's crew. Lava, walls and long falls subtract one from
  the victim's crew instead, and never credit a team-mate.

## The ten Destruct-Autos
| Vehicle | Role | Chassis | HP | Top speed | Ultimate |
|---|---|---|---|---|---|
| CRATE CRUSHER | BRAWLER | monster truck | 210 | 24 | QUAKE SLAM — leap and ground-pound shockwave |
| BOX ROCKET | SPEEDSTER | dragster | 105 | 46 | NITRO LANCE — impaling charge |
| SPLINTER | SKIRMISHER | buggy | 130 | 36 | SHRAPNEL SWARM — six homing rockets |
| HAULER | JUGGERNAUT | rig | 265 | 22 | CARGO DUMP — five proximity crate mines |
| VOLTWAGEN | CONTROLLER | hatchback | 150 | 33 | TESLA ARC — chain lightning + stun |
| SCRAPYARD DOG | BRAWLER | muscle car | 185 | 31 | JUNK STORM — 360° scrap flak |
| FROSTBITE | CONTROLLER | half-track | 200 | 26 | CRYO FIELD — slow + armour break dome |
| MAGMA MITE | SKIRMISHER | kart | 120 | 39 | LAVA TRAIL — burning path |
| SKY HOOK | SUPPORT | hovercraft | 135 | 34 | ORBITAL PING — delayed airstrike |
| IRON MAIDEN | JUGGERNAUT | armoured van | 195 | 27 | SIEGE MORTAR — three arcing shells |

Weight, grip, turn rate, acceleration, armour multiplier and SMG ballistics all
differ per chassis; see `src/data/destructAutos.js` for the authoritative table.

## The three arenas
- **BREAKPOINT CITY** — a marked downtown road grid with alleys, destructible
  buildings, raised parking decks, a four-ramp civic plaza and rooftop jump lines.
- **NEON OVERPASS** — three-level highway interchange: ground blocks, an
  expressway at 20, a flyover at 34, gap jumps on every deck, live-wire pools.
- **MAGMA BOWL** — caldera with a rim track, four spiral descents, a central
  mesa, floating obsidian slabs and a lava moat.

## Controls
`WASD` drive · mouse aim (independent of the chassis heading) · `LMB` SMG ·
`Q` Ultimate · `Shift` nitro · `Space` handbrake · `Tab` standings · `Esc` pit stop.

## Code layout
| File | Responsibility |
|---|---|
| `src/data/destructAutos.js` | The ten vehicles: stats, SMG, Ultimate, paint |
| `src/data/arenaMaps.js` | Three arenas, spawn pads, win conditions, difficulties |
| `src/game/arena/ArenaTerrain.js` | Surface/collision/LOS queries over arena geometry |
| `src/game/arena/ArenaPhysics.js` | Arcade driving model, ram collisions |
| `src/game/arena/ArenaCombat.js` | Projectiles, all ten Ultimates, damage |
| `src/game/arena/ArenaAI.js` | CPU drivers: targeting, driving, aiming, Ultimates |
| `src/game/arena/ArenaRules.js` | Vehicle draft, crews, scoring, win conditions, respawns |
| `src/game/modes/MatchRules.js` | Draft/scoring/win-condition logic for the timed/frag arena modes |
| `src/game/arena/ArenaVehicleModels.js` | Ten hand-built low-poly chassis models |
| `src/game/arena/ArenaWorld.js` | Turns arena geometry records into scene meshes |
| `src/game/arena/ArenaSelect.js` | Garage selection screen + 3D chassis preview |
| `src/game/arena/ArenaHUD.js` | In-match HUD, killfeed, standings, scoreboard |
| `src/game/arena/ArenaMode.js` | Orchestrator: match lifecycle, camera, visuals |
| `tests/destructAutoArena.test.js` | Roster, arenas, driving, combat, rules, AI |

The terrain, physics, combat, AI and rules layers are free of THREE and of the
DOM, so the whole simulation is unit-testable without a canvas.
