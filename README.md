# APEX Kart 3D — Open-World Town, Coastal City & Stadium Grand Prix

A zero-asset, procedurally sculpted 3D open-world driving, karting, and third/first-person exploration game built with **React 19**, **Three.js**, **TypeScript**, and **Vite 8**.

Spawn on foot in a sunlit European market town, inspect and enter any of **8 drivable vehicles** across **5 distinct chassis classes** (from the twin-engine **Apex Mega Kart** to the **Monza Arrow** open-wheel racer), cruise through town streets and botanical parks, then drive north past the Market Town into the **Coastal City** — a second city of spline-curved roads, a palm plaza, shopfronts, vending machines, traffic signals, and a sandy beach with pier and animated ocean, populated by **60 NPCs each following their own daily routine** (errands, jog loops, signal waits) that thins out at night. Back at the stadium, the **South Stadium Gate** triggers a **3-lap clockwise Grand Prix** with live sector checkpoints, progressive throttle and grip-limited driving physics, FIA corner kerbs, tire skid marks, procedural Web Audio synthesis, and multi-angle broadcast cameras. Hardware rendering runs an HDR post-processing chain (subtle bloom + ACES tone mapping, 4× MSAA, player-following soft shadows); software WebGL automatically falls back to direct rendering.

---

## Quick Start

```bash
# Install dependencies
npm install

# Start local development server (http://localhost:3000)
npm run dev

# Run strict TypeScript typechecking
npm run lint

# Run the Node test suite (physics, cameras, race rules, input, audio, layout)
npm test

# Build optimized production bundle (split vendor chunks)
npm run build
```

---

## Controls

### Walking & Driving

| Action | Desktop Keyboard | Mobile / Touch |
| --- | --- | --- |
| Walk / Accelerate | `W` or `ArrowUp` | **Walk / Gas** pad |
| Walk Back / Brake & Reverse | `S` or `ArrowDown` | **Back / Brake** pad |
| Turn / Steer Left & Right | `A` / `D` or `ArrowLeft` / `ArrowRight` | **Left / Right** pads |
| Sprint *(on foot)* | `Shift` | **Run** pad |
| Handbrake Powerslide *(driving)* | `Space` *(hold while cornering; release to recover grip)* | **Drift** pad |
| Enter / Exit Nearby Vehicle | `E` | **Drive / Exit** prompt button |
| Mute / Unmute Audio | `M` | **Sound / Muted** top-bar button |

### Camera Modes & Perspectives

| Action | Desktop Keyboard / Mouse | Mobile / Touch |
| --- | --- | --- |
| Select Follow Perspective (`Chase`, `1st Person`, `Hood`, `Wide`) | `1`, `2`, `3`, `4` | Top-bar **POV** button |
| Cycle Follow Perspective | `P` | Top-bar **POV** button |
| Toggle Follow vs. Aerial Spectator Camera | `C` *(drag canvas in Aerial mode to orbit)* | **Aerial / Follow** button |
| Toggle 6-DOF Free Roam Camera | `V` | **Free Cam** button |
| Free Camera Move / Altitude / Look / Pan / Zoom | `WASD` + `R`/`F` height + Right-Drag look + Mid-Drag pan + Wheel dolly (`Shift` fast, `Ctrl` slow) | On-screen XZ + Up/Down pads, 1-finger look, 2-finger pan/pinch |
| Reset Aerial Spectator View | `Home` | **Reset** button |

---

## World Coordinate System & Architecture

- **Coordinate Convention**: `+X` East, `-X` West, `+Y` Up, `-Z` North (toward the Stadium), `+Z` South (into the Town District). Heading `yaw = 0` faces `+Z` (South); `yaw = Math.PI` faces `-Z` (North).
- **Stadium Grand Prix Circuit (`z ∈ [-120, +120]`)**:
  - `240 × 240` turf infield surrounded by grandstands, VIP pavilion, floodlight towers, scoreboard, timing pylon, FIA red-and-white corner kerbs, painted directional chevrons, 6 sector checkpoint gates, and separated `START` / `FINISH` gantries.
  - Entering the South Gate (`z < 156`) in any vehicle triggers the `3, 2, 1, GO!` Grand Prix countdown. Laps run **clockwise** (turn **left / West** upon entering the South Gate).
- **European Market Town (`z ∈ [212, 424]`)**:
  - Uniform `24`-block grid (`44m × 40m` blocks) featuring merged vertex-shaded European townhouses, market promenade stalls, Central Botanical Fountain Park, South Timber Gazebo, West Clock Obelisk, and multi-lane avenues connected to the stadium via a sloped ramp (`z ∈ [120, 212]`).
- **Coastal City (`z ∈ [536, 1160]`)**:
  - Curved second city reached via the North Arterial from Main Avenue: 10 Catmull-Rom roads (arterials, avenues, mid ring, plaza ring, shore connector, beachfront promenade) with junction-aware lane markings, varied building plots (shops, cafés, bakeries, surf rentals, residences with pitched/mansard/terrace roofs), a central palm plaza with tiered fountain, 12 traffic signals cycling NS/EW phases, curbside vending machines, Victorian lamps, palm/pine landscaping, and a **sandy beach** (`z ∈ [1000, 1078]`) with dune slope, pier, umbrellas, towels, boats, lifeguard tower, and a GPU-animated ocean.
  - **60 NPCs** walk closed spline routes on both cities' sidewalks: personal speeds, errand stops outside shops, jaywalk-free signal waits, walk-cycle limb animation, and per-person night cutoffs (roughly a fifth stay out late) so the streets empty after dark.

### Source Layout

```text
src/
├── audio/          # Procedural Web Audio engine & gear/RPM synthesis
├── camera/         # Follow (4 POVs), Spectator aerial skyline, and 6-DOF Free Camera controllers
├── components/     # RaceHUD (minimap + digital tachometer and district navigation) & TouchControls
├── game/           # Oriented gate-crossing race state machine, lap timers & wrong-way detection
├── input/          # Modifier-safe, paired-key KeyboardInputTracker
├── kart/           # Semi-realistic slip/drift/suspension vehicle physics, 5-style mesh rigs & catalog
├── player/         # Walk/sprint character physics, safe multi-side vehicle exit & articulated rig
├── scene/          # Stadium, Market District, Coastal City (curved roads/beach), NPC routines,
│                   # HDR post-processing (bloom/ACES), Track + FIA kerbs, Checkpoints, Skid/Smoke FX
└── track/          # Closed Catmull-Rom track spline, arc-length frames & banner placement solver
```

## Driving calibration & visual detail

One world unit is one metre; HUD km/h is physics speed × 3.6 (not a cosmetic speed reduction).
Throttle builds progressively, acceleration tapers toward the top speed, lifting off coasts,
and braking is substantially stronger than engine drag. Steering authority is limited by surface
traction as speed increases. The handbrake scrubs speed; releasing it no longer creates a turbo boost.

Straight, dry-asphalt reference values (60 Hz, from rest):

| Vehicle | Speed after 2 seconds | 0–60 km/h |
| --- | --- | --- |
| Apex Mega Kart | ~23 km/h | ~5.2 s |
| Velocity GT | ~31 km/h | ~3.8 s |
| Monza Arrow | ~38 km/h | ~3.1 s |
| Town Cruiser | ~20 km/h | ~6.0 s |

These remain simplified game dynamics, not a full tire/drivetrain simulator. Automated tests cover
launch speed across every catalog vehicle, frame-rate stability, tapering acceleration, stopping
distance, coasting, cornering grip, collisions, and the removal of drift turbo.

The district uses subdued stucco/stone, consistent shutters, roof tile courses, gutters/downpipes,
segmented pavement, drainage grates, manholes, speed signs and crisp measured shop typography.
Road textures use metre-scaled UVs instead of stretching one texture over an entire avenue.
The navigation map shares the world road/building/park data and race checkpoint generator; gold dots
show vehicle **starting** positions, while the player marker follows the current vehicle or pedestrian.

Vehicle meshes include hollow rounded tires, five-spoke rims, lug bolts, brake rotors and stationary
calipers. Road cars have wheel arches, sloped glazed cabins, pillars, seats, steering wheels,
mirrors, handles, grille slats, exhaust tips and diffuser fins. The kart has engine cooling fins,
harness straps and twin exhaust details. Static street details are merged to limit draw calls.
