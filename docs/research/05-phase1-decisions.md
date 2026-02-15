# Phase 1 Implementation Decisions

> Decisions made during Phase 1 (MVP) implementation by agent teams.
> Reference this before modifying any Phase 1 code.

---

## T1: Project Scaffold

- **Vitest** chosen for testing (over Jest) — uses same Vite config, zero extra setup
- **CSS variables** for theming — all colors in `:root`, enables future theme switching
- **CSS Grid layout** for editor shell: `grid-template-areas` with toolbar/canvas/panel/status zones
- **`src/lib/`** for engine code (not `src/engine/`) — follows Svelte/SvelteKit conventions

## T2: Core State + Data Model

- **Class-based EditorStore** with `$state` runes — cleaner than module-level `$state` for grouping related reactive fields + methods
- **`canvasVersion` counter pattern** — pixel buffers (`Uint8ClampedArray`) are too large for Svelte's reactivity. Mutate the buffer, then `bumpVersion()` to trigger reactive subscribers.
- **Helper functions are pure and stateless** (`getPixel`, `setPixel`, `createCanvas`, `cloneCanvas`) — outside the class, operate on raw buffers, no framework coupling
- **Out-of-bounds safety**: `getPixel` returns `[0,0,0,0]`, `setPixel` silently ignores — no exceptions during tool operations near canvas edges

## T3: Canvas Renderer

- **DPR-aware**: canvas backing store scales by `devicePixelRatio` for HiDPI displays
- **rAF coalescing**: dirty flag prevents multiple renders per frame; single `requestAnimationFrame` loop
- **OffscreenCanvas** for native-resolution staging — `putImageData` at native size, then `drawImage` scaled by zoom with `imageSmoothingEnabled = false`
- **Discrete zoom levels** `[1, 2, 4, 6, 8, 12, 16, 24, 32]` — no continuous zoom, prevents sub-pixel rendering artifacts
- **Zoom toward cursor**: recalculate pan offset so the pixel under the pointer stays fixed on screen
- **Pan clamping**: at least 25% of canvas visible on each axis — prevents losing the canvas off-screen

## T4: Image Import

- **Three input methods**: drag-drop, clipboard paste, file picker — all funnel through `loadImageFromFile()`
- **Image → ImageData pipeline**: `File → URL.createObjectURL → Image → temp canvas → getImageData()` — object URL revoked in `finally` block
- **`analyzeImage()` heuristic**: average same-color run length > 2 → `looksLikePixelArt`
- **Suggested grid sizes**: filtered to `[2, 4, 8, 16]` that evenly divide both width and height
- **ImportDropZone** replaces canvas placeholder when `editorState.canvas === null`

## T5: Grid Detection + Snap

- **Combined scoring**: 40% runs-based + 60% edge-aware — edge alignment is a stronger signal than run-length mode
- **Run tolerance**: RGB distance < 30 for same-color grouping (avoids noise from AA/compression)
- **Edge scoring**: sum of gradients at grid multiples / total gradients — higher = edges align with candidate
- **Snap majority vote threshold**: > 50% of block pixels must share a color. Below that, falls back to **weighted-center** (Gaussian-like distance weighting from block center)
- **Non-divisible dimensions**: truncated via `Math.floor(dim / gridSize)` — partial blocks at edges are dropped
- **14 unit tests** covering detection, snapping, edge cases

## T6: Color Engine

- **Two-phase octree quantization**:
  - *Phase A*: Standard bottom-up reduction (collapse deepest subtrees first) — handles well-clustered colors
  - *Phase B*: Granular absorption (merge individual child branches into parent) — handles colors spread across top-level octants where Phase A can't reduce further
- **CIE76 Delta E** (Euclidean in CIELAB) — confirmed sufficient; CIEDE2000 not needed for 8-32 color palettes
- **D65 illuminant** for RGB→XYZ→LAB with proper piecewise linear/cubic root transform
- **Skip transparent pixels** in extraction and quantization — they don't contribute to the color palette
- **TS narrowing fix**: closure assignments inside nested functions need explicit `as OctreeNode` assertion after null checks (TypeScript can't narrow through closures)
- **20 unit tests**

## T7: Cleanup Pipeline

- **`suggestColorCount` heuristic**: <16 unique → keep all; 16-64 → 16; 64-256 → 24; >256 → 32
- **Debounce timing**: 200ms for both grid and color preview sliders — fast enough to feel responsive, slow enough to avoid computation spam
- **Auto-Clean is a single undo entry**: `pushHistory("Auto-Clean")` called once before the full pipeline (grid snap + palette reduce)
- **Grid snap replaces canvas entirely** — new dimensions, new buffer, palette re-extracted via `extractTopColors(snapped, 64)`
- **Palette reduce mutates in-place** — `canvas.data.set(quantized.remappedData)`, no dimension change

## T8: Before/After Preview

- **Initial approach (reverted)**: img-based overlay with `max-width:100%; object-fit:contain` — ignored zoom/pan, caused misalignment
- **Final approach**: all rendering through CanvasArea's canvas pipeline with **aligned zoom**
  - `sourceZoom = zoom * (canvasW / sourceW)` — makes same logical content occupy same screen pixels
  - Same `panX`/`panY` for both source and canvas — no separate pan state needed
- **Hold mode**: spacebar swaps pixel data source in render function; BeforeAfterToggle only handles keyboard events + label overlay
- **Split mode**: canvas `clip()` regions — left side clips to source at aligned zoom, right side clips to current canvas at normal zoom

## T9: Drawing Tools

- **Bresenham line interpolation** between pointer events — prevents gaps during fast mouse movement
- **BFS flood fill** with optional tolerance (default 0 = exact RGBA match). Tolerance > 0 uses Euclidean RGB distance — kept self-contained, no dependency on color/distance module
- **Pointer capture** on mousedown for continuous strokes — prevents stroke breaks when cursor leaves canvas during fast drawing
- **Pan takes priority**: middle-click or Space+left-click always pans, even if a tool is active
- **18 unit tests**

## T10: Palette Panel

- **Sorted palette preserves original indices** — `$derived.by()` produces `{ color, originalIndex }[]` so clicking a swatch in any sort order correctly maps back to `activeColorIndex`
- **Three sort modes**: frequency (counts from canvas), hue (from RGB), luminance (L from CIELAB)
- **Palette-lock snaps** active color to nearest palette entry on toggle and on hex input
- **Color editing via native `<input type="color">`** triggered by double-click — `pushHistory` before remap, then `remapToPalette` to update all pixels

## T11: Undo/Redo

- **Full snapshot strategy** — 50 entries max, ~800KB at 64x64. Deep copy on both push and return (callers can't corrupt history)
- **Fork behavior**: push after undo discards all redo entries (standard undo tree pruning)
- **Canvas resize in history**: snapshots store width + height + data, so undo of grid snap restores original dimensions
- **12 unit tests** with deep copy isolation verification

## T12: Export

- **Nearest-neighbor upscale** via `imageSmoothingEnabled = false` on a scaled canvas — same technique as the renderer
- **Component exports `triggerDownload()`/`triggerCopy()`** — called from App.svelte keyboard handler via `bind:this` ref
- **Scale options**: 1x, 2x, 4x, 8x, 16x with dimension preview ("64x64 → 512x512")
- **Clipboard API**: `navigator.clipboard.write([new ClipboardItem({'image/png': blob})])` — requires secure context (HTTPS or localhost)

---

## Cross-Cutting Decisions

| Decision | What we chose | Why |
|----------|---------------|-----|
| Svelte 5 runes over stores | `$state`, `$derived`, `$effect` | Simpler, first-class in Svelte 5, no boilerplate |
| Class-based store over module | `class EditorStore` | Groups reactive state + methods; single export |
| OffscreenCanvas for staging | Used in renderer + before/after | Avoids DOM canvas creation; faster in workers later |
| Vitest over Jest | Shares Vite config | Zero setup, native ESM/TS |
| Pointer events over mouse events | `onpointerdown` etc. | Touch-compatible, pointer capture API |
| No external state library | Pure Svelte 5 reactivity | Editor state is simple enough; no need for Redux-like complexity |
