[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/ALENSALIM/best-flight-game-20261126/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/ALENSALIM/best-flight-game-20261126/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

An entry for the [make.fun "Make the best flight game" bounty](https://make.fun/bounty/best-flight-game-20261126-0057) — $500 in USDC.

# Ridge Runner — Alpine Ring Run

A complete original 3D flight game for the make.fun bounty
`best-flight-game-20261126-0057`. It runs in a desktop browser from static
files with no network request, played with keyboard and mouse.

**The game:** fly the Skyfox, a little teal-and-cream propeller plane,
through 8 glowing rings over Lake Mira and around Mount Halden, then land
back on the grass strip at Halden Field before the 6-minute clock runs out.
A clean landing after all eight rings is worth 500 points, plus a second for
every second left on the clock.

**Controls:** W/S or ↑/↓ pitch, A/D or ←/→ roll, Q/E rudder, Shift throttle
up, Ctrl throttle down, Space airbrake, drag with the mouse to steer,
C camera (chase / cockpit), P pause, M sound, R restart, Enter to fly.

**Tech:** raw WebGL (no library) over a seeded procedural valley — heightmap
terrain with a lake, a river gap, a snow-capped peak, a pine forest and the
hamlet of Mira Falls; a low-poly plane built from triangles in code; a DOM
HUD (altitude, airspeed, heading, vertical speed, throttle, score, rings,
timer) with an artificial-horizon ball; synthesised WebAudio engine, wind
and chime sounds. Everything is generated or drawn in code — no external
assets, no network.

**Play it:** `node serve.ts`, then open http://localhost:8080 in desktop
Chrome. Screenshots are real frames of the running game:
`?shot=start`, `?shot=play`, `?shot=ring`, `?shot=land`.

**Hand in:** `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts` copies
`game/` and `screenshots/` to `out/` and writes `out/dossier.json`.

MIT licensed. All art, sounds and names are original.
