# SPEC: Reaction-Diffusion (Gray-Scott) Pattern Engine
### Hack Club Greeble — Procedural Pattern Generator

---

## 0. Project Summary

A browser-based, fully interactive **Reaction-Diffusion simulator** implementing the **Gray-Scott model** — the mathematical system that explains how chemical gradients self-organise into the spots, stripes, labyrinths, and wormlike patterns found on animal skins, seashells, and coral.

The app runs the simulation on a 2D grid updated each frame, renders it to a `<canvas>`, lets users tune every meaningful parameter in real-time, and exports the result as a lossless PNG at arbitrary resolution (including sizes far larger than the screen). All generation is purely algorithmic — no assets, no external images.

**Stack:** Vanilla HTML + CSS + JavaScript (no framework required). One single `.html` file is acceptable. WebGL is optional but preferred for performance; a pure CPU/canvas-2d fallback must also exist.

---

## 1. Background — The Gray-Scott Model

The Gray-Scott model describes two abstract chemical species **U** (activator precursor) and **V** (activator):

```
∂U/∂t = Du·∇²U  −  U·V²  +  f·(1 − U)
∂V/∂t = Dv·∇²V  +  U·V²  −  (f + k)·V
```

Where:
- `Du` — diffusion rate of chemical U (typically ~0.2)
- `Dv` — diffusion rate of chemical V (typically ~0.1)
- `f`  — feed rate: how fast U is replenished from outside the system
- `k`  — kill rate: how fast V is removed from the system
- `∇²` — 2D discrete Laplacian (the "diffusion" step via convolution)
- `U·V²` — the autocatalytic reaction term (U consumed, V self-amplifies)

The discrete update per cell per timestep (dt = 1.0):

```
lapU = U[x-1][y] + U[x+1][y] + U[x][y-1] + U[x][y+1] − 4·U[x][y]
lapV = V[x-1][y] + V[x+1][y] + V[x][y-1] + V[x][y+1] − 4·V[x][y]
reaction = U[x][y] · V[x][y]²

U_new = U[x][y] + (Du·lapU − reaction + f·(1 − U[x][y])) · dt
V_new = V[x][y] + (Dv·lapV + reaction − (f + k)·V[x][y]) · dt

clamp both to [0, 1]
```

The Laplacian uses **a weighted 3×3 stencil** (more accurate than the 5-point cross):

```
Kernel:
  0.05  0.20  0.05
  0.20 −1.00  0.20
  0.05  0.20  0.05
```

This gives isotropic diffusion (no axis preference), which produces rounder, more organic structures.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    index.html                        │
│                                                     │
│  ┌──────────────┐   ┌──────────────────────────┐   │
│  │  Control     │   │   Renderer               │   │
│  │  Panel (DOM) │   │   (WebGL preferred,       │   │
│  │              │   │    Canvas2D fallback)     │   │
│  │  - Sliders   │   │                          │   │
│  │  - Presets   │   │   <canvas id="sim">      │   │
│  │  - Seed UI   │   │                          │   │
│  │  - Export    │   └──────────────────────────┘   │
│  └──────┬───────┘              ▲                    │
│         │                      │                    │
│         ▼                      │ pixel data         │
│  ┌──────────────────────────────────────────────┐  │
│  │            Simulation Core (JS)              │  │
│  │                                              │  │
│  │  Float32Array U[W×H]   Float32Array V[W×H]  │  │
│  │  Float32Array U_next   Float32Array V_next   │  │
│  │                                              │  │
│  │  tick() → runs N iterations per frame        │  │
│  │  seed()  → initialises grid                  │  │
│  │  toImageData() → maps V→colour               │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## 3. File Structure

```
reaction-diffusion/
├── index.html          ← entire app (single file acceptable)
├── README.md           ← usage instructions + parameter explanation
└── exports/            ← created at runtime by browser download
```

Single-file delivery is explicitly allowed. All JS and CSS may be inline.

---

## 4. User-Facing Parameters (≥ 4 required by Greeble)

The following 10 parameters must all be exposed in the UI with labelled sliders (and a numeric readout). All parameters must be live — changing a slider immediately affects the running simulation without requiring a reset, **except** Seed which requires a grid reinitialise.

### 4.1 Core Simulation Parameters

| Parameter | Internal name | UI Range | Default | Step | Notes |
|---|---|---|---|---|---|
| Feed Rate | `f` | 0.010 – 0.100 | 0.055 | 0.001 | Primary pattern determinant |
| Kill Rate | `k` | 0.045 – 0.075 | 0.062 | 0.001 | Primary pattern determinant |
| Diffusion U | `Du` | 0.05 – 0.40 | 0.210 | 0.005 | U spread speed |
| Diffusion V | `Dv` | 0.01 – 0.25 | 0.105 | 0.005 | V spread speed (always < Du) |
| Iterations/Frame | `stepsPerFrame` | 1 – 40 | 10 | 1 | Speed vs CPU cost |

### 4.2 Initialisation Parameters

| Parameter | Internal name | UI type | Default | Notes |
|---|---|---|---|---|
| Seed Value | `seed` | Text input + "Randomise" button | random | Deterministic init using mulberry32 PRNG |
| Seed Pattern | `seedMode` | Select dropdown | `spots` | See §6 for all modes |
| Grid Size | `gridSize` | Select: 256/512/768/1024 | 512 | Resets simulation on change |

### 4.3 Visual Parameters

| Parameter | Internal name | UI type | Default | Notes |
|---|---|---|---|---|
| Colour Palette | `palette` | Select dropdown | `viridis` | See §7 for full list |
| Invert Colours | `invert` | Checkbox | false | Swaps low/high colour |
| Colour Bias | `colorBias` | Slider 0.0–1.0 | 0.5 | Gamma-like midpoint shift |

---

## 5. Preset System

Ship **at least 8 named presets** with known-beautiful (f, k) pairs. Clicking a preset loads its parameters and reseeds the grid.

| Preset Name | f | k | Description |
|---|---|---|---|
| **Coral** | 0.0545 | 0.0620 | Dense worm-like branching |
| **Spots** | 0.0367 | 0.0649 | Classic Turing spots |
| **Labyrinth** | 0.0390 | 0.0580 | Endless maze corridors |
| **Mitosis** | 0.0272 | 0.0513 | Cells that divide and drift |
| **Solitons** | 0.0140 | 0.0540 | Stable moving blobs |
| **Zebra** | 0.0620 | 0.0609 | Parallel stripe bands |
| **U-Skate World** | 0.0620 | 0.0610 | Self-propelled gliders |
| **Extinction** | 0.0200 | 0.0650 | Pattern slowly dies (interesting edge case) |

Each preset also stores the `seedMode` and `palette` that showcase it best.

---

## 6. Seed / Initialisation Modes

The grid begins with U=1.0 everywhere, V=0.0 everywhere, then seeds are painted in. The `seed` string is hashed into a 32-bit integer used to initialise the **mulberry32** PRNG for all random choices.

| Mode | Description |
|---|---|
| `spots` | 20–80 small circular blobs of (U=0.5, V=0.25), radius 2–8px, random positions |
| `stripe` | 3–10 horizontal or vertical bands of (U=0.5, V=0.25), random thickness |
| `noise` | Full-grid Perlin-like noise (value noise via PRNG), each cell gets U∈[0.8,1], V∈[0,0.2] |
| `center` | Single large square blob at the centre |
| `corners` | Four blobs placed near each corner |
| `cross` | Thin cross-shaped stripe through the midpoint |
| `random_scatter` | Fully random per-cell U and V from PRNG |

All modes use the provided `seed` string. The same seed+mode always produces the identical initial grid.

---

## 7. Colour Palettes

Map the **V channel** (range 0–1) through a colour palette to produce an RGB pixel. Use smooth linear interpolation between palette stops.

Implement these palettes as arrays of `[t, r, g, b]` stops:

| Name | Visual character |
|---|---|
| `viridis` | Purple → teal → yellow (perceptually uniform) |
| `plasma` | Purple → pink → yellow |
| `inferno` | Black → red → yellow → white |
| `magma` | Black → purple → orange → white |
| `thermal` | Black → blue → cyan → green → yellow → red → white |
| `ice` | Black → deep blue → cyan → white |
| `fire` | Black → dark red → orange → yellow → white |
| `grayscale` | Black → white |
| `alien` | Black → dark green → bright green → lime → white |
| `neon` | Black → purple → magenta → cyan → white |

Exact RGB stop values for `viridis` (reference implementation):
```
[0.0,  68,  1, 84]
[0.25, 59, 82,139]
[0.5,  33,145,140]
[0.75, 94,201, 97]
[1.0, 253,231, 37]
```
(Source: matplotlib viridis colourmap, public domain)

---

## 8. Rendering

### 8.1 Primary: WebGL (preferred)

Use a **WebGL1** render path for 60fps performance on large grids.

- Keep U and V as two `FLOAT` (or `HALF_FLOAT`) textures of size W×H
- The simulation update is a **fragment shader** that samples the 8 neighbours + self, computes the update, and writes to a ping-pong FBO pair
- The display shader samples the V texture, applies the colour palette (encoded as a 256×1 `RGB` LUT texture), and outputs to screen
- The full simulation step (stepsPerFrame iterations) happens entirely on the GPU each animation frame before the display draw call

WebGL shader pseudocode (update pass):
```glsl
uniform sampler2D uState;  // current U/V packed as rg channels
uniform float f, k, Du, Dv, dt;
uniform vec2 texelSize;

void main() {
  vec2 uv = v_texCoord;
  vec2 c  = texture2D(uState, uv).rg;
  float U = c.r, V = c.g;

  // Laplacian via 9-tap weighted stencil
  vec2 lap = vec2(0.0);
  lap += 0.20 * texture2D(uState, uv + vec2( texelSize.x, 0)).rg;
  lap += 0.20 * texture2D(uState, uv + vec2(-texelSize.x, 0)).rg;
  lap += 0.20 * texture2D(uState, uv + vec2(0,  texelSize.y)).rg;
  lap += 0.20 * texture2D(uState, uv + vec2(0, -texelSize.y)).rg;
  lap += 0.05 * texture2D(uState, uv + vec2( texelSize.x,  texelSize.y)).rg;
  lap += 0.05 * texture2D(uState, uv + vec2(-texelSize.x,  texelSize.y)).rg;
  lap += 0.05 * texture2D(uState, uv + vec2( texelSize.x, -texelSize.y)).rg;
  lap += 0.05 * texture2D(uState, uv + vec2(-texelSize.x, -texelSize.y)).rg;
  lap -= 1.00 * c;

  float reaction = U * V * V;
  float dU = Du * lap.r - reaction + f * (1.0 - U);
  float dV = Dv * lap.g + reaction - (f + k) * V;

  gl_FragColor = vec4(clamp(U + dU, 0.0, 1.0), clamp(V + dV, 0.0, 1.0), 0.0, 1.0);
}
```

Boundary condition: **wrapping** (toroidal) — texture2D coords wrap via `GL_REPEAT`.

### 8.2 Fallback: Canvas 2D (CPU)

If WebGL is unavailable, fall back to a CPU loop over two `Float32Array` buffers (double-buffering) with the same mathematical update. Write V-mapped colours to an `ImageData` object, then `putImageData` each frame. This will be slower but must remain functionally correct. Warn the user with a small banner: "WebGL not available — running in CPU mode (may be slower)."

---

## 9. Canvas / Display Layout

```
┌──────────────────────────────────────────────────┐
│  🧬 Reaction-Diffusion Engine         [?] [GitHub]│  ← top bar
├───────────────────┬──────────────────────────────┤
│                   │  PARAMETERS                  │
│                   │  ─────────────────────────── │
│    CANVAS         │  [Preset buttons row]        │
│    (simulation    │                              │
│     fills this    │  Feed Rate   f  [slider] 0.055│
│     area)         │  Kill Rate   k  [slider] 0.062│
│                   │  Diffusion U    [slider] 0.210│
│                   │  Diffusion V    [slider] 0.105│
│                   │  Steps/Frame    [slider]  10  │
│                   │  ─────────────────────────── │
│                   │  Colour Palette [dropdown]   │
│                   │  Invert         [checkbox]   │
│                   │  Colour Bias    [slider]     │
│                   │  ─────────────────────────── │
│                   │  Seed Pattern   [dropdown]   │
│                   │  Seed Value  [text] [🎲]     │
│                   │  Grid Size      [dropdown]   │
│                   │  [Reset / Reseed]            │
│                   │  ─────────────────────────── │
│                   │  [⏸ Pause]  [▶ Step]        │
│                   │  [📷 Export PNG]             │
│                   │  Export Size [dropdown]      │
└───────────────────┴──────────────────────────────┘
```

- Canvas takes all remaining width on the left, fills the viewport height minus the top bar.
- Panel is a fixed-width sidebar (300px) on the right. On small screens (< 768px) the panel collapses to the bottom, canvas takes full width.
- The canvas is always square (W=H=gridSize pixels during simulation). The display canvas is CSS-scaled to fill its container using `image-rendering: pixelated`.

---

## 10. Export

### 10.1 Same-Size PNG
Capture the current canvas contents and trigger a browser download as `rd_export_<seed>_<f>_<k>.png`.

### 10.2 High-Resolution PNG (off-screen render)
Offer export sizes: **512 × 512**, **1024 × 1024**, **2048 × 2048**, **4096 × 4096**.

Process:
1. Create an off-screen `OffscreenCanvas` (or hidden `<canvas>`) at the target resolution.
2. Re-run the **same simulation from scratch** (same seed, same parameters) for a fixed number of warmup iterations (use a progress bar — the UI must not freeze; use `setTimeout`/chunked loop or a Web Worker).
3. Map the final V buffer to the chosen palette at full resolution.
4. Encode as PNG and download.

The number of warmup iterations for export should match the current frame count displayed in the UI (so the exported image looks like what the user sees). If frame count > 5000, cap at 5000 iterations for export to keep wait time sane.

Show a modal progress overlay during export: `"Rendering… 2340 / 5000 iterations"` with a cancel button.

### 10.3 Export Metadata
Alongside the PNG download, also offer a "Copy Parameters JSON" button that copies this to clipboard:

```json
{
  "generator": "Gray-Scott Reaction-Diffusion Engine",
  "version": "1.0",
  "seed": "hello-world",
  "seedMode": "spots",
  "f": 0.055,
  "k": 0.062,
  "Du": 0.21,
  "Dv": 0.105,
  "palette": "viridis",
  "invert": false,
  "colorBias": 0.5,
  "iterationsAtExport": 1200
}
```

This lets anyone reproduce the exact image.

---

## 11. Additional UI Behaviours

| Feature | Description |
|---|---|
| **Frame counter** | Bottom-left overlay on canvas: `"Frame: 1234"` in small monospace text |
| **FPS counter** | Bottom-right overlay: `"FPS: 60"` updated every second |
| **Pause / Resume** | Spacebar toggles pause. Button label updates. Simulation state is frozen but canvas still shows. |
| **Single Step** | While paused, clicking "Step" advances exactly 1 iteration. |
| **Keyboard shortcuts** | `Space` = pause, `R` = reseed, `E` = export PNG (current size), `P` = cycle palette |
| **Randomise Preset** | Button that picks a random (f, k) from within valid pattern space, randomises seed, and reseeds |
| **URL hash persistence** | On every parameter change, update `window.location.hash` with a compact base64-encoded parameter object. On load, parse hash and restore parameters. This lets users share a specific view by sharing the URL. |
| **Fullscreen** | A fullscreen button that hides the control panel and fills the viewport with the canvas. Press Esc or click again to exit. |

---

## 12. Performance Requirements

| Scenario | Target |
|---|---|
| 512×512, WebGL, 10 steps/frame | ≥ 60 fps |
| 1024×1024, WebGL, 10 steps/frame | ≥ 30 fps |
| 512×512, CPU fallback, 10 steps/frame | ≥ 10 fps |
| Export 4096×4096, 1000 iterations | Completes within 60 seconds |

WebGL implementation is mandatory for meeting the 512 target. CPU fallback is only for compatibility.

---

## 13. Visual Design

The app should look **dark, scientific, and beautiful** — like a visualisation tool from a research lab.

- Background: `#0a0a0f` (near-black with faint blue tint)
- Panel background: `#111118`
- Panel border: `1px solid #2a2a3a`
- Text: `#c8c8d8`
- Accent / highlights: `#6e8efb` (soft blue-purple)
- Slider thumb: accent colour
- Preset buttons: pill-shaped, outlined style; active preset gets filled accent background
- Font: `'JetBrains Mono', 'Fira Code', monospace` for parameter values and seed; system sans-serif for labels
- Canvas border: `2px solid #2a2a3a` with a faint `box-shadow: 0 0 30px rgba(110,142,251,0.15)` glow
- Smooth transitions on colour changes (`transition: background 0.2s`)

Load the JetBrains Mono font from Google Fonts (`fonts.googleapis.com`).

---

## 14. README Requirements

The `README.md` must include:

1. **What it is** — a one-paragraph lay explanation of reaction-diffusion and why it produces these patterns.
2. **How to run** — "Open `index.html` in any modern browser. No server or build step required."
3. **Parameter guide** — a table explaining every slider in plain English, including typical value ranges and what they affect visually.
4. **Preset guide** — a row per preset describing what to expect.
5. **Keyboard shortcuts** — listed.
6. **Technical notes** — brief: Gray-Scott equations, grid size, Laplacian stencil, WebGL vs CPU mode.
7. **Exporting** — how to get a print-quality image.
8. **Licence** — MIT.

---

## 15. Greeble Compliance Checklist

Before submitting to the Greeble dashboard, verify:

- [x] Output generated entirely by code (no external images used)
- [x] Can export to arbitrary sizes (4096×4096 minimum) → meets "indefinite size" intent
- [x] Output is a 2D PNG image
- [x] At least 4 user-configurable parameters (this spec has 10)
- [x] Abides by Hack Club Code of Conduct (no inappropriate content, fully original)
- [x] Time tracked via Hackatime

---

## 16. Implementation Order (Suggested for Agentic Coding)

Implement in this order to enable incremental testing:

1. **Scaffold** — `index.html` skeleton, CSS layout (canvas left, panel right), empty JS module structure.
2. **CPU Simulation Core** — `Float32Array` grid, `tick()` function, correct Gray-Scott update math, boundary wrapping.
3. **Canvas 2D Renderer** — `toImageData()` with grayscale palette, `requestAnimationFrame` loop, frame counter.
4. **UI Controls** — All sliders wired to simulation params, live update on change.
5. **Seed System** — mulberry32 PRNG, all 7 seed modes, text input + randomise button.
6. **Presets** — All 8 presets as data objects, preset button row.
7. **Colour Palettes** — All 10 palettes, dropdown, interpolation, invert, bias.
8. **WebGL Renderer** — Ping-pong FBO, update shader, display shader with LUT texture. Replace Canvas 2D path. Keep CPU fallback.
9. **Export System** — Same-size PNG, high-res off-screen render with progress modal, JSON clipboard copy.
10. **Polish** — Keyboard shortcuts, URL hash persistence, fullscreen mode, FPS display, responsive layout, dark theme refinement.
11. **README** — Write after all features work.
12. **Test** — Verify all Greeble requirements, test in Chrome, Firefox, and Safari.

---

## 17. Known Gotchas & Implementation Notes

- **Double-buffering is mandatory.** Updating U and V in-place while reading neighbours produces incorrect results. Always read from one buffer and write to another, then swap.
- **The (f, k) parameter space is very sensitive.** Small changes (0.001) produce wildly different patterns. Outside valid ranges, the system either goes to all-U (blank) or all-V (saturated). This is expected behaviour, not a bug.
- **WebGL FLOAT textures** require the `OES_texture_float` extension on WebGL1. Check for it and fall back to CPU if unavailable.
- **Export resolution ≠ simulation resolution.** The high-res export re-runs the simulation at the export resolution. Do not simply upscale the simulation canvas — that produces pixelated results.
- **Colour interpolation** should be in **linear RGB** (not sRGB/gamma-corrected) to avoid muddy midtones. Convert sRGB stops to linear before interpolating, then convert back to sRGB for the final pixel.
- **Wrapping boundaries in WebGL:** use `GL_REPEAT` on texture wrap mode. In CPU mode, use modulo arithmetic: `idx = ((x + W) % W) + ((y + H) % H) * W`.
- **mulberry32 PRNG** reference implementation (public domain):
  ```javascript
  function mulberry32(seed) {
    return function() {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
  }
  // Hash a string seed to a uint32:
  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = Math.imul(31, h) + s.charCodeAt(i) | 0;
    }
    return h >>> 0;
  }
  ```
- **Pause during export** — The animation loop must be suspended during the off-screen export to prevent the main simulation from consuming GPU resources simultaneously.

---

*Spec version: 1.0 — written for Hack Club Greeble submission*
*Mathematical model: Gray-Scott (1984), Pearl & Lacalli (1985)*
*Colour palettes: matplotlib viridis/plasma/inferno/magma (New BSD License)*
