# Sprite Sprout -- Design Document

> A web-based pixel art editor designed to clean up AI-generated pixel art.

## The Problem

AI image generators produce "pixel art" that looks good at a glance but breaks down on inspection. The art has no consistent grid, hundreds of near-duplicate colors, anti-aliasing halos, broken outlines, and stray pixels. No existing tool combines cleanup automation with a proper pixel art editor -- you either get a one-shot converter (Pixel Snapper, fixelart) or a full editor with no AI cleanup features (Aseprite, Piskel).

**Sprite Sprout fills this gap.**

---

## Core Workflow (Under 30 Seconds)

```
Drag & Drop  -->  Auto-Detect  -->  One-Click Clean  -->  Refine  -->  Export
   (0 clicks)     (instant)        (1 click)           (optional)   (1 click)
```

1. **Drop an image** -- Editor auto-analyzes grid size, color count, outline color
2. **Smart banner** -- "Detected: ~64x64 grid, 342 colors. [Auto-Clean]"
3. **Auto-Clean** -- Grid snap + palette reduction + orphan removal in one pipeline
4. **Before/after slider** -- Instantly compare original vs cleaned
5. **Refine** -- Slide-in panel with grid size / color count sliders (live preview)
6. **Touch up** -- Drawing tools with the reduced palette pre-loaded
7. **Export** -- PNG (native or scaled), GIF (animated), sprite sheet, clipboard

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Language | **TypeScript** | Type safety for complex editor state |
| Framework | **Svelte 5** (Runes) | Fine-grained reactivity, tiny bundle, `$effect` for canvas bridge |
| Rendering | **Canvas 2D** | Direct pixel access, built-in compositing, proven in pixel art editors |
| Build | **Vite** | Fast dev server, native TS/Svelte support |
| Color | **culori** | Perceptually uniform color spaces (OKLAB), tree-shakeable |
| Quantization | **image-q** | RGBQuant/NeuQuant/Wu, CIEDE2000 distance |
| GIF Export | **gifenc** | Fastest, lightest, flat-graphics optimized |
| Project Files | **fflate** (zip) | JSON metadata + binary pixel data |
| AI Cleanup Ref | **unfake.js** | Reference algorithms for grid detection + cleanup |

### Why NOT WebGL?
Pixel art images are tiny (32x32 to 256x256). Canvas 2D handles full 10-layer recomposite at 256x256 in under 1ms. WebGL's texture/shader overhead would likely be *slower* at these sizes.

### Why NOT WASM?
JS with typed arrays is fast enough for every operation at pixel art sizes. The only potential bottleneck is K-means with perceptual color distance at 256x256+, but octree/median-cut are fast alternatives. **Architecture with `Uint8ClampedArray` in/out boundaries** makes WASM a drop-in upgrade later if ever needed. See [02-wasm-analysis.md](./02-wasm-analysis.md) for the full benchmark analysis.

### Why NOT React?
Virtual DOM reconciliation is unnecessary overhead for a canvas-heavy app. Svelte 5 compiles to direct DOM updates with near-zero framework cost.

---

## Architecture

```
src/
  app/                          # Svelte UI components
    Editor.svelte               # Main editor layout
    Toolbar.svelte              # Tool selection
    PalettePanel.svelte         # Color palette + merge/split
    LayerPanel.svelte           # Layer stack
    Timeline.svelte             # Animation frames + onion skin controls
    CleanupPanel.svelte         # AI cleanup controls (grid, palette, etc.)
    PreviewToggle.svelte        # Before/after comparison

  engine/                       # Pure TS, framework-agnostic
    canvas/
      renderer.ts               # Zoom, grid overlay, layer compositing
      tools.ts                  # Pencil, eraser, fill, picker, selection
    color/
      quantize.ts               # Median-cut, octree quantization
      distance.ts               # CIELAB Delta E color distance
      palette.ts                # Palette extraction, merging, remapping
      dither.ts                 # Floyd-Steinberg, ordered dithering
    grid/
      detect.ts                 # Runs-based + edge-aware grid detection
      snap.ts                   # Snap pixels to detected grid
    analysis/
      antialias.ts              # Detect AA edges
      noise.ts                  # Find stray/orphan pixels
      outline.ts                # Edge detection, gap finding
    cleanup/
      pipeline.ts               # Chains: detect -> snap -> reduce -> clean
    animation/
      timeline.ts               # Frame management, onion skinning
      gif.ts                    # GIF encoding via gifenc
    io/
      png.ts                    # PNG import/export (native + UPNG.js)
      spritesheet.ts            # Sheet import/export
      project.ts                # Project save/load (.sprout format)
    history/
      undo.ts                   # Command pattern undo/redo
    batch/
      worker.ts                 # Web Worker for batch processing
```

**Key principle**: The `engine/` layer is pure TypeScript with no framework dependencies. Every function accepts and returns `Uint8ClampedArray` buffers. This keeps the cleanup algorithms testable, portable, and WASM-swappable.

---

## Data Model

```typescript
interface Sprite {
  width: number;
  height: number;
  palette: Color[];
  layers: LayerNode[];            // Bottom to top
  frames: FrameInfo[];
  tags: Tag[];                    // Named ranges: "walk", "idle"
}

type LayerNode = LayerImage | LayerGroup;

interface LayerImage {
  type: "image";
  id: string;
  name: string;
  visible: boolean;
  opacity: number;                // 0-1
  blendMode: string;              // "source-over", "multiply", etc.
  cels: Map<number, Cel>;         // frameIndex -> Cel (sparse)
}

interface Cel {
  imageData: Uint8ClampedArray;   // RGBA pixels
  width: number;
  height: number;
  x: number;                      // Canvas offset
  y: number;
  linkedCelId?: string;           // Shares data with another cel
}

interface FrameInfo {
  duration: number;               // ms (default: 100)
}
```

Memory at 64x64: 16 KB/cel. 20 frames x 5 layers = ~1.6 MB total. Trivial.

---

## Cleanup Algorithms

### Grid Detection + Snap (P0)

The signature feature. AI art is generated at high resolution (512-1024px) simulating a lower logical resolution (32-128px).

1. **Runs-based detection**: Scan rows/columns for same-color run lengths. Mode of run lengths = grid size.
2. **Edge-aware validation**: Sobel edges should cluster at grid boundaries. Histogram of edge positions modulo candidate sizes confirms the grid.
3. **Snap**: Divide into blocks. Per-block color via majority vote (clean areas) or weighted-center (ambiguous areas).
4. **Output**: True NxN pixel art at native resolution.

### Smart Palette Reduction (P0)

1. Octree quantization to initial palette (fast, O(n))
2. Hierarchical merging via CIELAB Delta E distance
3. Interactive: slider controls target color count with **live preview**
4. Optional: remap to a known palette (PICO-8, Game Boy, NES via Lospec API)

### Orphan Pixel Removal (P1)

Morphological erosion: flag pixels whose color differs from all 8 neighbors. Present as highlighted suggestions; user accepts/rejects.

### Outline Repair (P1)

1. Detect outline pixels by contrast/color
2. Moore-Neighbor tracing for connected paths
3. Bresenham gap-fill suggestions
4. Thickness normalization flagging

---

## Animation & Export

### Timeline Model (Aseprite-inspired)

Cel-based: rows = layers, columns = frames. Each cell is either empty or contains a Cel with its own pixel data and canvas offset. Linked cels share image data across frames (for static elements).

### Onion Skinning

Previous frames tinted warm, next frames tinted cool. Opacity falls off with distance. Configurable 1-3 frames each direction.

### GIF Export via gifenc

- Skip quantization if frame already <= 256 colors (common in cleaned pixel art)
- Global palette across frames to prevent color flickering
- Frame differencing: set unchanged pixels to transparent, crop to bounding box
- Per-frame delay for timing control

### Sprite Sheet Export

- Grid layout (rows x columns) or strips
- Configurable padding
- Optional TexturePacker-compatible JSON metadata

---

## Feature Phases

### Phase 1 -- MVP: The Cleanup Editor
The "80/20" -- address the most painful problems with minimum viable features.

- [ ] Drag-and-drop / paste import
- [ ] Auto grid detection + snap with live preview
- [ ] Smart palette reduction with slider
- [ ] Before/after toggle (spacebar hold or split view)
- [ ] Basic drawing tools (pencil, eraser, fill, color picker)
- [ ] Undo/redo
- [ ] PNG export (native + scaled)
- [ ] Clipboard copy

### Phase 2 -- Power Features
- [ ] Color merge tool (select similar, merge)
- [ ] Palette lock / remap to known palettes (Lospec integration)
- [ ] Orphan pixel removal
- [ ] Outline repair tool
- [ ] Pixel-perfect line mode
- [ ] Preset palettes panel

### Phase 3 -- Animation
- [ ] Animation timeline (frame-by-frame)
- [ ] Onion skinning
- [ ] Batch cleanup across frames
- [ ] GIF export
- [ ] Sprite sheet import/export
- [ ] Layer support with blending modes

### Phase 4 -- Polish
- [ ] Smart eraser (AA halo removal)
- [ ] Dithering tools (apply/remove/detect)
- [ ] Palette analysis heatmap
- [ ] Reference layers
- [ ] Layer groups
- [ ] Keyboard shortcut customization
- [ ] Project save/load (.sprout format)

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Canvas 2D over WebGL | Simpler, faster at small sizes, proven | WebGL adds complexity with no benefit under 256x256 |
| Svelte 5 over React | No VDOM overhead, smaller bundle, cleaner canvas integration | React's reconciliation is wasted on canvas-heavy apps |
| JS over WASM (initially) | Fast enough at pixel art sizes, simpler toolchain | WASM-ready architecture via Uint8ClampedArray boundaries |
| CIELAB Delta E over CIEDE2000 | 3x cheaper, perceptually similar for 8-32 color palettes | CIEDE2000's advantage is negligible for pixel art color ranges |
| Octree over K-means (default) | O(n) vs O(n*k*i), fast enough for real-time slider | K-means available as "high quality" option |
| Web Workers over WASM for batch | Parallelism > raw speed for independent frames | 4 workers = 4x throughput, bigger win than 3x per-frame speed |
| Full snapshot undo over diffs | 16 KB/snapshot at 64x64, simple implementation | Diffs add complexity with negligible memory savings at these sizes |
| gifenc over gif.js | 2x faster, maintained, smaller, better API | gif.js is abandoned since ~2016 |

---

## Research Files

- [PHASE1-TASKS.md](./PHASE1-TASKS.md) -- **Start here for implementation.** 12 agent-sized tasks with dependency graph.
- [01-tech-stack.md](./01-tech-stack.md) -- Detailed tech stack comparison and library evaluation
- [02-wasm-analysis.md](./02-wasm-analysis.md) -- WASM vs JS benchmarks for every operation
- [03-features-and-ux.md](./03-features-and-ux.md) -- AI pixel art problems, feature prioritization, UX research
- [04-animation-and-export.md](./04-animation-and-export.md) -- Animation data model, GIF pipeline, layer system
