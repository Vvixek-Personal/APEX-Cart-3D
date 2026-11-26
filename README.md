# APEX Kart 3D — Open-World Town & Stadium Grand Prix

A zero-asset, procedurally sculpted 3D open-world driving, karting, and third/first-person exploration game built with **React 19**, **Three.js**, **TypeScript**, and **Vite 8**.

Spawn on foot in a sunlit European market town, inspect and enter any of **8 drivable vehicles** across **5 distinct chassis classes** (from the twin-engine **Apex Mega Kart** to the **Apex Formula X** open-wheel racer), cruise through town streets and botanical parks, and drive north through the **South Stadium Gate** to trigger a **3-lap clockwise Grand Prix** with live sector checkpoints, drift-boost physics, FIA corner kerbs, tire skid marks, procedural Web Audio synthesis, and multi-angle broadcast cameras.

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
| Handbrake Powerslide & Drift Boost *(driving)* | `Space` *(hold while cornering, release for boost)* | **Drift** pad |
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
- **European Market Town (`z ∈ [208, 366]`)**:
  - Uniform `24`-block grid (`24m × 36m` blocks) featuring merged vertex-shaded European townhouses, market promenade stalls, Central Botanical Fountain Park, South Timber Gazebo, West Clock Obelisk, and multi-lane avenues connected to the stadium via a sloped ramp (`z ∈ [120, 212]`).

### Source Layout

```text
src/
├── audio/          # Procedural Web Audio engine & gear/RPM synthesis
├── camera/         # Follow (4 POVs), Spectator aerial skyline, and 6-DOF Free Camera controllers
├── components/     # RaceHUD (minimap + digital tachometer/drift HUD) & TouchControls
├── game/           # Oriented gate-crossing race state machine, lap timers & wrong-way detection
├── input/          # Modifier-safe, paired-key KeyboardInputTracker
├── kart/           # Semi-realistic slip/drift/suspension vehicle physics, 5-style mesh rigs & catalog
├── player/         # Walk/sprint character physics, safe multi-side vehicle exit & articulated rig
├── scene/          # Stadium, Market District, Track + FIA kerbs, Checkpoints, Skid/Smoke FX & Canvas
└── track/          # Closed Catmull-Rom track spline, arc-length frames & banner placement solver
```
