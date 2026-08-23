# Organica — Reaction-Diffusion Engine

**Status: Complete.** Gray-Scott reaction-diffusion simulation running entirely on a CPU core (double-buffered `Float32Array` + Canvas2D), with live parameters, 8 presets, 10 colour palettes, per-seed coloured territories, reproducible seeds, and print-quality PNG export. Pure vanilla HTML/CSS/JS — no framework, no build step, no external assets (only the JetBrains Mono webfont).

Organica is a browser-based **Gray-Scott reaction-diffusion pattern engine**: it simulates two virtual chemicals that react and diffuse across a grid, spontaneously organising themselves into the spots, stripes, labyrinths, and coral-like branching patterns seen on animal skins, seashells, and corals. Every parameter — feed rate, kill rate, diffusion, seed pattern, colour palette — can be tuned live while the simulation runs, and any run can be exported as a print-quality PNG up to 4096×4096.

> **Rendering note.** The simulation runs on the **CPU core** with Canvas2D rendering by default. There is also an optional **WebGL/GPU** path: tick *Use GPU (WebGL)* in the Simulation panel to run the reaction-diffusion step on the GPU. When the device exposes `EXT_color_buffer_integer`, the GPU path uses **integer fixed-point** state (WebGL2 RGBA32I) so the output is **bit-exact and reproducible across different GPUs**. If that extension is missing but `EXT_color_buffer_float` is available, it falls back to a **floating-point** GPU path and shows a notice explaining that this is fast but only reproducible on the same device/driver (not bit-exact across GPUs). If neither is available, Organica shows a notice and continues on the CPU. The GPU path keeps the colour pipeline fully on-chip (colouring is computed from `V` in the display shader) so no CPU readback is needed.

## Running Locally

- Double-click `index.html`, or
- Run `serve.bat` (starts a local server on http://localhost:8080; tries `npx serve` first and falls back to `python -m http.server`).

Any modern browser works (Chrome, Firefox, Edge, Safari).

> **Performance note.** For the best experience, open the page through a local
> server (e.g. `serve.bat`) rather than `file://`. Served over HTTP the
> simulation runs in a **Web Worker** (`sim-worker.js`), keeping the UI fully
> responsive; opened directly from disk the browser blocks Workers for security,
> so it automatically falls back to running the simulation inline on the main
> thread. Both paths are functionally identical.

## Parameters

Every parameter is live — moving a slider affects the running simulation on the very next tick, no reset needed (except Seed / Grid Size / Seed Pattern, which repaint the grid).

| Parameter | Range | Default | What it does |
|---|---|---|---|
| Feed Rate `f` | 0.010 – 0.100 | 0.055 | How fast chemical U is replenished. Together with k it decides what pattern emerges. |
| Kill Rate `k` | 0.045 – 0.075 | 0.062 | How fast chemical V is removed. Tiny changes (±0.001) produce wildly different patterns. |
| Diffusion U `Du` | 0.05 – 0.40 | 0.210 | Spread speed of U across the grid. |
| Diffusion V `Dv` | 0.01 – 0.25 | 0.105 | Spread speed of V (naturally lower than U in interesting regimes). |
| Steps / Frame | 1 – 40 | 6 | Simulation ticks per animation frame — higher = faster evolution. |
| Use GPU (WebGL) | on / off | off | Runs the simulation on the GPU. Prefers an integer fixed-point path (reproducible bit-exact across GPUs, needs `EXT_color_buffer_integer`); otherwise uses a floating-point path (fast, but only reproducible on the same device, needs `EXT_color_buffer_float`). Falls back to the CPU with a notice if neither is available. |
| Colour Bias | 0.0 – 1.0 | 0.5 | Gamma-like midpoint shift; brightens or darkens midtones without touching black/white points. |
| Vibrance | 0.0 – 2.0 | 1.0 | Boosts saturation of the colour output (0 = desaturated, 1 = natural, 2 = vivid). |
| Invert Colours | on / off | off | Swaps low and high ends of the palette. |
| Palette | 10 options | Viridis* | Maps concentration V to colour (see below). |
| Seed Pattern | 7 modes | Spots | Initial paint layout: spots, stripe, noise, center blob, corners, cross, random scatter. |
| Seed Value | any text | random | Hashed into the PRNG seed — same text + mode always reproduces the identical starting grid. |
| Grid Size | 256 / 512 / 768 / 1024 | 512 | Simulation resolution (repaints the grid). |

*Default palette at startup follows the active preset.

### Reproducibility

The seed string is hashed (`hashStr`, FNV-style) into a 32-bit integer that seeds a **mulberry32** PRNG which makes every random decision — initial paint placement included. Type `"hello world"` today or next year, on any machine, and you get pixel-identical starting conditions and identical pattern evolution.

## Palettes

The V channel is mapped through a 256-entry colour LUT interpolated in **linear RGB** for smooth, non-muddy gradients:

- **Viridis** — purple → teal → yellow (perceptually uniform)
- **Plasma** — purple → pink → yellow
- **Inferno** — black → red → yellow → white-hot
- **Magma** — black → purple → orange → white
- **Thermal** — black → blue → cyan → green → yellow → red → white (thermal-camera look)
- **Ice** — black → deep blue → cyan → white
- **Fire** — black → dark red → orange → yellow → white
- **Grayscale** — classic black → white
- **Alien** — black → dark green → bright green → lime → white
- **Neon** — black → purple → magenta → cyan → white

## Colored Seeds

A master **Colored Seeds** toggle paints each seed's growth with its own colour instead of the monochrome V→palette map.

Each cell is assigned a **static per-cell territory colour** — a Voronoi field computed from the seed geometry (blended between the two nearest seeds at contacts). The colour belongs to the whole territory and is **never diffused**, so it stays at full brightness as a seed grows and only blends where two territories meet. The final pixel is a blend between the plain V-palette colour and the territory colour, gated by **pattern presence** (how much of the reaction-diffusion structure actually exists at that cell), so the empty background stays the background and only the grown structure is coloured.

| Control | What it does |
|---|---|
| **Colored Seeds** | Master on/off for per-seed colouring. |
| **Randomize Seed Colors** | Each seed gets a deterministic-random hue from the seed string. Same seed + settings always reproduces identical colours (1:1). Off = hues follow a smooth spatial gradient. |
| **Seed Color Diff** | Spread of hues across seeds (gradient mode). |
| **Seed Color Offset** | Rotates the gradient (gradient mode). |
| **Seed Color Diffusion** | Blend softness at the borders where two seed territories meet — 0 = hard Voronoi borders, higher = softer feathering. |
| **Color Brightness** | 0 = full colour everywhere the pattern exists (no dimming as it grows); higher = the colour dims with V as the pattern grows. |
| **Seed Palette** | 10 palettes mapping the per-seed colour coordinate to RGB. |

**Reproducibility:** random colours derive from `mulberry32(hashStr(seed + '\x00color'))`, so the coloured result is recreated 1:1 by the same seed + settings. Colouring never resets or disturbs a running simulation — recolouring only repaints the colour field.

## Presets

| Preset | f | k | Pattern character |
|---|---|---|---|
| Coral | 0.0545 | 0.0620 | Dense worm-like branching |
| Spots | 0.0367 | 0.0649 | Classic Turing spots |
| Labyrinth | 0.0390 | 0.0580 | Endless maze corridors |
| Mitosis | 0.0272 | 0.0513 | Cells that divide and drift |
| Solitons | 0.0140 | 0.0540 | Stable moving blobs |
| Zebra | 0.0620 | 0.0609 | Parallel stripe bands |
| U-Skate World | 0.0620 | 0.0610 | Self-propelled gliders |
| Extinction | 0.0200 | 0.0650 | Pattern slowly dies (edge case) |

Each preset also sets a matching seed pattern and colour palette; clicking one reseeds the grid with a fresh random seed.

## Transport

- **Start / Pause** — freezes the simulation but keeps rendering, so palette and bias edits stay visible while paused.
- **Step** (enabled while paused) — advances exactly one iteration.
- **Reset / Reseed** — reinitialises the grid from the current seed and settings. The engine auto-stops with a **Done** status once the pattern has converged: a frame counts as "still changing" only if at least one LUT colour bin's worth of V shifts in a cell, so it stops within ~15 frames of the image looking visually static (no more long tails of sub-perceptible drift).
- **Reset All Settings** — restores every parameter (including backend choice) to its factory default and reseeds.
- **Fullscreen** — hides the control panel and fills the viewport; click again or press `Esc` to exit.
- **ⓘ info icons** — every parameter shows a small `ⓘ` next to its label; hover it for a plain-language explanation of what that parameter does.

## Export

- **Export PNG** — saves exactly what the canvas shows right now, named `organica_<seed>_f<f>_k<k>.png` (or your custom filename).
- **High-Res Render…** — re-runs the *exact finished simulation* off-screen at up to 4096×4096 using the CPU path (re-simulation is deterministic, not upscaling), for the same number of ticks the live run took, then saves the final frame as a PNG. A progress modal and Cancel button are shown, and the live session is suspended and fully restored afterwards.
- **Export Video…** — records a 60 fps WebM of the finished formation by replaying the simulation on the CPU and capturing each displayed frame. A dialog lets you choose resolution (256–1024), filename, and speed (0.5×–4×). Output is a `.webm` video.
- **Export gating** — both High-Res Render and Export Video require the simulation to have finished (status **Done**). Clicking either before completion shows a notice instead of exporting.
- **Copy Parameters JSON** — puts a full JSON object (seed, seed mode, grid size, steps/frame, f/k/Du/Dv, palette, invert, bias, vibrance, coloured-seed settings, GPU flag) on the clipboard for reproducing a look elsewhere. Paste it back via **Import Parameters JSON**.
- **Import Parameters JSON** — opens a dialog where you can paste a parameters JSON (e.g. from *Copy Parameters JSON*); recognised fields are applied, the UI and backend sync, and the simulation reseeds. Unknown or invalid fields are ignored with an inline error.

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Space` | Start / Pause / Resume |
| `R` | Reseed with current settings |
| `E` | Export PNG (current size) |
| `P` | Cycle colour palette |
| `F` | Fullscreen |
| `Esc` | Exit fullscreen / close modals |

Shortcuts are ignored while typing in text fields.

## Sharing a Look

Every parameter change updates the URL hash with a compact base64-encoded parameter blob (within ~0.4s). Copy the address bar and send it to someone — their browser restores the exact feed/kill rates, seed, palette, and grid size on load.

## Architecture Notes

Single `index.html` (~2360 lines): layout, styles, and clearly-sectioned script modules (PRNG → CPU sim → rendering → presets/seeding → GPU → export → transport → main loop).

- **Simulation core**: two `Float32Array` grids for U and V, double-buffered and swapped each tick (never updated in place), with a 9-tap weighted Laplacian (0.20 cardinal / 0.05 diagonal weights) and toroidal wrapping via modulo indexing. By default the simulation runs on a **Web Worker** (off the main thread) and posts snapshots back for rendering, so the UI stays responsive even on low-end hardware; if Workers are unavailable it falls back to running inline. The default configuration is 512² × 6 steps ≈ 1.6M cell-updates per frame.
- **Renderer**: the V field is mapped through a rebuilt-on-change 256-entry LUT (linear-RGB interpolation, optional invert/bias/vibrance); coloured-seed territory colours are blended in per cell, gated by pattern presence. Output goes to a Canvas2D `ImageData`.
- **Colored Seeds**: a static Voronoi territory colour field `C` is computed when seeding (and re-derived live on colour changes); it lives entirely on the CPU and is never part of the simulation state, so recolouring can never disturb a running pattern.
- **GPU path**: an opt-in **WebGL2** pipeline. The preferred path runs the entire Gray-Scott step in **integer fixed-point** (RGBA32I state, `GPU_SCALE = 16384`) so identical seeds/sliders produce bit-identical images on any WebGL2 GPU/driver — ideal for 1:1 contest entries on another machine. When `EXT_color_buffer_integer` is unavailable it transparently falls back to a **floating-point** path (`EXT_color_buffer_float`), which is fast but only reproducible on the same device. Both modes keep the colour pipeline fully on-chip (colouring computed from `V` in the display shader); CPU readback is avoided. If neither extension exists, the app reverts to the CPU/Worker core.

## Known Trade-offs

- High-res re-render is pure-CPU by design (deterministic, loss-free). At 4096² each iteration is expensive, so long sessions exceed a minute to re-simulate; the progress modal and Cancel button keep this manageable, and smaller sizes are fast.
- The simulation runs on the CPU (optionally in a Web Worker). On lower-end hardware, large grids (1024²) or high steps/frame may run well below 60fps; lowering Steps / Frame or Grid Size restores smoothness. The Web Worker keeps the UI responsive even while the simulation is CPU-bound. The GPU path is intended to close the remaining gap.

## Licence

MIT — see [LICENCE](LICENCE).
