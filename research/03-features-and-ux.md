# Features & UX Research

## AI Pixel Art Problems (Ranked by Severity)

### CRITICAL
1. **Inconsistent Grid Alignment** -- Pixels not on a consistent grid. "Pixels" drift from 4x4 to 3x5 to 5x4 across the image. AI has no concept of a discrete grid. **This is the #1 problem.**
2. **Too Many Colors** -- Hundreds/thousands of near-duplicate shades instead of 8-32 distinct colors. AI works in continuous color space.

### HIGH
3. **Anti-Aliasing Artifacts** -- Smooth gradients where hard edges should be. Outlines have halos of intermediate colors.
4. **Sub-Pixel Detail** -- Details at finer resolution than the intended grid. Mixed detail levels.
5. **Cross-Frame Inconsistency** -- Colors shift, proportions change between frames. Each generation is independent.

### MEDIUM
6. **Broken / Inconsistent Outlines** -- Vary between 1-3px, have gaps, change color.
7. **Noisy / Stray Pixels** -- Random wrong-color pixels, especially in flat-fill areas.

### LOW-MEDIUM
8. **Unintentional Dithering** -- Checkerboard patterns in areas that should be flat color.

---

## Existing Tools Landscape

### Pixel Snapper (Sprite Fusion)
- Rust CLI + WASM web tool
- Grid detection + K-means color reduction
- Dead simple: upload image, get result
- **Limitation**: One-shot tool, not an editor

### fixelart
- Divides image into configurable blocks, applies color strategies (majority, average, hybrid)
- **Limitation**: Requires user to know grid size. No auto-detection.

### unfake.js
- JS library: scale detection (runs-based + edge-aware), content-aware downscaling, quantization via image-q
- Real-time parameter tweaking with before/after -- **excellent UX reference**
- **Limitation**: Library, not a full editor

### Aseprite (gold standard pixel art editor)
- Powerful but **not designed for AI cleanup**. Color reduction is buried in menus (6+ clicks).
- No grid-snap tool, no auto-detection
- Community repeatedly requests better color reduction (issues #1099, #1499)

### Piskel / Lospec (web editors)
- Zero-install, simple UI
- **No AI-specific features** -- no color reduction, no grid snap, no batch

**The gap**: No tool combines AI cleanup automation with a proper pixel art editor.

---

## Prioritized Feature List

### P0 -- MVP (Core Cleanup Flow)

| Feature | Solves | Complexity |
|---------|--------|------------|
| **Auto grid detection + snap** | Grid alignment, sub-pixel detail | Medium |
| **Smart palette reduction with slider** | Too many colors, anti-aliasing | Medium |
| **Before/after preview toggle** | UX for all operations | Low |
| **Basic drawing tools** (pencil, eraser, fill, color picker) | Manual touch-up | Low |
| **Import/export** (PNG, clipboard) | Basic usability | Low |
| **Undo/redo with history** | Non-destructive editing | Low |

### P1 -- Power Features

| Feature | Solves | Complexity |
|---------|--------|------------|
| **Color merge tool** (select similar, merge to one) | Noisy pixels, excess colors | Low |
| **Palette lock / remap to known palette** | Style consistency, platform targeting | Low |
| **Orphan pixel removal** (auto-detect isolated strays) | Noisy pixels | Low |
| **Outline repair tool** (detect gaps, suggest fixes) | Broken outlines | Medium |
| **Pixel-perfect drawing mode** | Editing quality | Low |
| **Preset palettes panel** (PICO-8, Game Boy, NES, etc.) | Quick palette targeting | Low |

### P2 -- Animation & Batch

| Feature | Solves | Complexity |
|---------|--------|------------|
| **Animation timeline** (frame-by-frame, onion skinning) | Multi-frame sprites | Medium-High |
| **Batch cleanup** (same operations across all frames) | Cross-frame consistency | Medium |
| **Sprite sheet import/export** | Workflow integration | Medium |
| **GIF export** | Animation delivery | Medium |
| **Layer support** | Complex editing | Medium-High |

### P3 -- Delight Features

| Feature | Solves | Complexity |
|---------|--------|------------|
| **Smart eraser** (erase AA halos specifically) | Anti-aliasing | Medium |
| **Dithering pattern tools** (apply/remove/detect) | Unintentional dithering | Medium |
| **Palette analysis view** (color usage heatmap) | Color cleanup | Low-Medium |
| **Keyboard shortcut customization** | Power user productivity | Low |

---

## Key Algorithms

### Grid Detection & Snap

1. **Runs-based detection**: Scan rows/columns, measure same-color run lengths. Most common run length = grid size.
2. **Edge-aware detection**: Sobel edge detection, then histogram of edge positions modulo candidate grid sizes.
3. **Autocorrelation**: For each candidate grid size G, compute self-correlation shifted by G pixels.
4. **Snapping**: Divide into GxG blocks, determine output color via majority vote, weighted center, or content-adaptive.

### Smart Palette Extraction

1. Initial extraction via median-cut or octree (64 colors)
2. Perceptual clustering via CIEDE2000 distance
3. Hierarchical merging: similarity threshold slider, most similar colors merge at each step
4. Known palette matching: nearest-color in CIELAB space (Lospec API: 4100+ palettes)

### Outline Detection & Repair

1. Detect outline pixels by color (darkest) or contrast with neighbors
2. Moore-Neighbor tracing for connected paths
3. Gap filling via Bresenham's line algorithm
4. Thickness normalization: flag outline pixels thicker than 1px

---

## UX Principles

### What Makes Pixel Art Tools Frustrating
- Too many steps for common operations (Aseprite: 6+ clicks for color reduction)
- Destructive operations without preview
- No context-aware defaults (requiring manual grid size, color count)
- Overwhelming initial interface
- Disconnect between cleanup tools and editing tools

### What Makes Them Delightful
- **Instant visual feedback** with live preview
- **Smart defaults** that work 90% of the time
- **One-click with refinement** available
- **Non-destructive preview** (before/after toggle)
- **Progressive disclosure** (simple by default, powerful when needed)

### Key UX Patterns
- Slider + live preview for any parameter
- Before/after toggle (press-and-hold or split view)
- Undo stack with visual thumbnails
- Contextual suggestions: "This image has 847 colors. Reduce to 16?"
- Preset workflows: "Clean up AI art" button that chains operations

---

## The Ideal Primary Workflow

### "I generated pixel art with AI and want to clean it up quickly"

**Step 1: Import (0 clicks after drop)**
Drag-and-drop or paste. Editor auto-analyzes: grid size, color count, outline color.

**Step 2: Smart Suggestion Banner**
"Detected: ~64x64 grid, 342 colors. [Auto-Clean] [Dismiss]"

**Step 3: Auto-Clean Pipeline (one click)**
1. Grid snap (auto-detected size)
2. Palette reduction (auto-suggested count)
3. Orphan pixel removal

Result shown with a **before/after slider**.

**Step 4: Refine (optional)**
Slide-in panel with grid size slider, color count slider, palette view with merge/split.

**Step 5: Manual Touch-Up**
Drawing tools with the reduced palette pre-loaded.

**Step 6: Export**
PNG at native resolution, scaled resolution, or clipboard.

**Target time for common case: Under 30 seconds.**
