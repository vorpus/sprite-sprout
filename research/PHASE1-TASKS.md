# Phase 1 Tasks -- Agent-Sized Implementation Plan

## Gaps Identified in Phase 1 Design

Before the task breakdown, here are areas the original Phase 1 spec was thin on:

### 1. The Import-to-Cleanup Transition (not specified)
When a user drops a 1024x1024 AI-generated image, what happens? The canvas can't stay at 1024x1024 -- that's the upscaled resolution, not the actual pixel art. The flow needs to be:
- Import at original resolution as a "source image"
- Run grid detection to determine the logical resolution (e.g., 64x64)
- Grid snap **changes the canvas dimensions** from 1024x1024 to 64x64
- This is a fundamentally different event than drawing -- the entire coordinate system changes
- Undo of grid snap needs to restore the original dimensions

### 2. State Management Architecture (types defined, wiring not)
The design defines TypeScript interfaces but not how Svelte 5 reactivity wraps them. Critical decisions:
- Pixel buffers (`Uint8ClampedArray`) must live **outside** the reactive system (too expensive to track)
- A `$state` version counter triggers re-renders when pixel data changes
- Tool state, zoom/pan state, palette state, and cleanup settings are all reactive
- How do components communicate? A single store? Multiple stores? Context?

### 3. Canvas Renderer Interaction Details (underspecified)
- Zoom levels and bounds (min/max zoom, scroll-to-zoom sensitivity)
- Pan bounds (should the canvas be pinnable off-screen?)
- Grid line rendering (color, thickness, when to show/hide)
- Cursor pixel highlight (which pixel is the mouse over?)
- Coordinate mapping: screen coords -> canvas pixel coords at current zoom/pan

### 4. Drawing Tools Constrained to Palette (not addressed)
After palette reduction, should drawing be locked to the reduced palette? This is a key UX decision:
- **Recommendation**: Default to palette-locked. Active color picker selects from palette only. "Freecolor" toggle available for power users. This prevents accidentally re-introducing noise colors.

### 5. "Live Preview" Implementation (vague)
"Slider with live preview" means re-running quantization or grid snap on every slider change. This needs:
- A temporary preview buffer (not the committed canvas state)
- Debounced slider -> recompute -> render preview
- Commit button to apply, or cancel to revert
- The renderer needs to know "am I showing the real state or a preview?"

### 6. Cleanup as Canvas Resize (not acknowledged)
Grid snap is the only Phase 1 operation that **changes canvas dimensions**. This ripples through:
- Renderer (different backing buffer size, recalculate zoom-to-fit)
- Undo system (must snapshot dimensions, not just pixels)
- Tools (coordinate mapping changes)
- Before/after (comparing images of different sizes)

### 7. Error States (not mentioned)
- Grid detection fails (no clear grid) -- need fallback: let user manually specify grid size
- Image is already clean -- skip/disable cleanup controls
- Image isn't pixel art at all -- still works as a basic editor
- Very large images (2048+) -- warn or auto-reject?

---

## Task Dependency Graph

```
T1: Scaffold
 ↓
T2: Core State + Data Model
 ↓
T3: Canvas Renderer ←──────────────────┐
 ↓                                      │
T4: Image Import                        │
 ↓                                      │
T5: Grid Detection + Snap Engine        │
 ↓                                      │
T6: Color Engine                        │
 ↓                                      │
T7: Cleanup Pipeline + Panel ───────────┤ (drives renderer via state)
 ↓                                      │
T8: Before/After Preview ──────────────┘
 ↓
T9: Drawing Tools + Toolbar
 ↓
T10: Palette Panel
 ↓
T11: Undo/Redo
 ↓
T12: Export (PNG + Clipboard)
```

T5 and T6 are independent of each other (both pure engine, no UI). They can be built in parallel.
T9 and T10 are closely related but separable. T10 could be built in parallel with T9.

---

## Task 1: Project Scaffold

**Goal**: Vite + Svelte 5 + TypeScript project with empty app shell.

**What to build**:
- `npm create vite` with Svelte + TypeScript template
- Install dependencies: `culori`, `image-q` (leave others for later tasks)
- Configure `vite.config.ts` (nothing exotic needed)
- Create `src/app/App.svelte` with a CSS grid layout:
  ```
  ┌─────────┬────────────────────────┬──────────┐
  │ Toolbar  │                        │ Cleanup  │
  │ (left)   │     Canvas Area        │ Panel    │
  │          │     (center)           │ (right)  │
  │          │                        │          │
  ├─────────┴────────────────────────┴──────────┤
  │              Status Bar (bottom)              │
  └───────────────────────────────────────────────┘
  ```
- Placeholder components for each panel (empty `<div>` with labels)
- Global CSS: dark theme base (pixel art editors are always dark), `image-rendering: pixelated` utility class
- `src/lib/` directory for engine code

**Output**: Running `npm run dev` shows the empty editor shell with labeled panel areas.

**Estimated scope**: ~200 lines (configs + shell components + CSS)

**No dependencies on other tasks.**

---

## Task 2: Core State + Data Model

**Goal**: The reactive state layer that every other component reads from and writes to.

**What to build**:

```typescript
// src/lib/types.ts -- Core type definitions
interface EditorState {
  // Source image (original import, never mutated after import)
  sourceImage: ImageData | null;

  // Working canvas (the pixel art being edited)
  canvas: {
    width: number;
    height: number;
    data: Uint8ClampedArray;      // RGBA pixels -- lives OUTSIDE reactivity
  } | null;

  // Reactivity trigger -- increment to force re-render
  canvasVersion: number;

  // Detected/user-set properties
  detectedGridSize: number | null;  // e.g., 8 means 8x8 pixel blocks in source
  palette: Color[];                  // Current palette (extracted or user-defined)

  // Tool state
  activeTool: "pencil" | "eraser" | "fill" | "picker";
  activeColor: Color;
  activeColorIndex: number;

  // Viewport
  zoom: number;
  panX: number;
  panY: number;

  // Cleanup state
  cleanupPreview: {
    data: Uint8ClampedArray;
    width: number;
    height: number;
  } | null;
  showingPreview: boolean;

  // UI state
  showGrid: boolean;
  showBeforeAfter: boolean;
}

type Color = [number, number, number, number]; // RGBA
```

- `src/lib/state.svelte.ts` -- Svelte 5 runes-based store using `$state`
- Helper functions: `getPixel(x, y)`, `setPixel(x, y, color)`, `getImageData()`, `setImageData()`
- `bumpVersion()` function that increments `canvasVersion` to trigger reactive updates
- Canvas data mutation always goes through helpers (never direct buffer access from components)

**Why this matters**: Every subsequent task imports from this store. Getting the reactive/non-reactive boundary right here prevents painful refactors later. Pixel data is a plain `Uint8ClampedArray` that Svelte never deep-tracks. The `canvasVersion` counter is the bridge.

**Estimated scope**: ~250 lines (types + store + helpers)

**Depends on**: T1 (project exists)

---

## Task 3: Canvas Renderer

**Goal**: Interactive canvas that displays pixel art with zoom, pan, and grid overlay.

**What to build**:

`src/app/CanvasView.svelte`:
- A `<canvas>` element that fills the center panel
- **Rendering pipeline** (runs on `canvasVersion` change or viewport change):
  1. Clear the display canvas
  2. If `showingPreview`, use `cleanupPreview.data`; otherwise use `canvas.data`
  3. Write pixel data to a small offscreen canvas at native resolution
  4. Draw the offscreen canvas onto the display canvas scaled by `zoom`, offset by `panX/panY`
  5. `imageSmoothingEnabled = false` for crisp pixels
  6. If `showGrid && zoom >= 6`, draw 1px grid lines at pixel boundaries

- **Zoom**: Scroll wheel. Zoom toward cursor position (not center). Discrete levels: 1, 2, 4, 6, 8, 12, 16, 24, 32. Min = fit-to-view, max = 32x.
- **Pan**: Middle-click drag OR Space + left-click drag. Constrained so canvas can't be fully panned off-screen.
- **Cursor highlight**: At zoom >= 4, draw a subtle outline around the pixel under the mouse.
- **Coordinate mapping**: `screenToPixel(screenX, screenY) -> {x, y}` accounting for zoom, pan, and canvas element offset. This function is critical -- every tool and every hover effect uses it.
- **Fit-to-view**: On image load, auto-calculate zoom to fit canvas in the viewport with padding.

`src/lib/engine/canvas/renderer.ts`:
- Pure functions for the rendering math (no DOM)
- `screenToPixel(screenX, screenY, zoom, panX, panY, canvasRect): {x, y}`
- `pixelToScreen(x, y, zoom, panX, panY): {screenX, screenY}`
- `calculateFitZoom(canvasW, canvasH, viewportW, viewportH): number`

**Key details**:
- The display `<canvas>` is sized to fill its container (responsive)
- `ResizeObserver` to handle viewport size changes
- `requestAnimationFrame` for rendering (not on every state change -- coalesce)
- Grid lines: 1px `rgba(255,255,255,0.15)` at zoom 6-12, `rgba(255,255,255,0.25)` at zoom 16+

**Estimated scope**: ~350 lines (component + renderer utilities)

**Depends on**: T2 (reads from state store)

---

## Task 4: Image Import

**Goal**: Get images into the editor via drag-drop, paste, or file picker.

**What to build**:

`src/app/ImportDropZone.svelte`:
- Covers the full editor area when no image is loaded
- Shows "Drop image here, paste from clipboard, or click to browse"
- Drag-and-drop: `dragover`/`drop` events, accept image/* files
- Clipboard paste: `document.addEventListener("paste", ...)` -- works globally
- File picker: `<input type="file" accept="image/*">` triggered by click
- Visual feedback: border highlight on dragover

`src/lib/engine/io/import.ts`:
- `loadImageFromFile(file: File): Promise<ImageData>` -- create `Image` element, draw to temp canvas, `getImageData()`
- `loadImageFromClipboard(items: DataTransferItemList): Promise<ImageData | null>`
- `analyzeImage(imageData: ImageData): ImageAnalysis` -- quick pass to determine:
  - Unique color count
  - Dimensions
  - Whether it looks like upscaled pixel art (heuristic: many repeated color runs)
  - Suggested grid sizes to try

On successful import:
1. Store original as `sourceImage` in state
2. Set `canvas` to a copy of the source image data
3. Trigger fit-to-view zoom
4. Run `analyzeImage()` and store results
5. Show the smart suggestion banner: "Detected ~64x64 grid, 342 colors. [Auto-Clean] [Manual]"

**Edge cases**:
- SVG input: rasterize at a reasonable size, warn user
- Very large images (>2048px): warn and offer to downscale first
- Non-image files: ignore with toast message
- Subsequent imports: confirm "Replace current image? Unsaved changes will be lost."

**Estimated scope**: ~250 lines (component + import utilities + analysis)

**Depends on**: T2 (writes to state store), T3 (triggers fit-to-view)

---

## Task 5: Grid Detection + Snap Engine

**Goal**: Pure TypeScript algorithms to detect the pixel grid in AI-generated art and snap to it.

**What to build**:

`src/lib/engine/grid/detect.ts`:
- `detectGridSize(imageData: Uint8ClampedArray, width: number, height: number): GridDetectionResult`
- **Algorithm: Runs-based detection**
  1. For each row, scan left-to-right recording the length of each same-color run (tolerance: Delta E < 5 in RGB for speed)
  2. Build a histogram of run lengths
  3. The mode (most common run length) is the candidate grid size
  4. Repeat for columns
  5. If row and column modes agree, high confidence. If they differ, flag for user.
- **Algorithm: Edge-aware validation**
  1. Compute horizontal gradient (simple: `|pixel[x] - pixel[x+1]|` summed across RGB)
  2. For each candidate grid size G, compute a "grid score": sum of gradients at positions that are multiples of G, divided by sum of all gradients. Higher score = edges align with grid.
  3. Try candidates from 2 to 32. Return the one with highest grid score.
- **Combined**: Use runs-based for initial candidates, edge-aware to confirm/disambiguate.
- Return type:
  ```typescript
  interface GridDetectionResult {
    gridSize: number;            // Best guess
    confidence: number;          // 0-1
    candidates: Array<{          // Top 3 candidates
      size: number;
      score: number;
    }>;
    logicalWidth: number;        // sourceWidth / gridSize
    logicalHeight: number;       // sourceHeight / gridSize
  }
  ```

`src/lib/engine/grid/snap.ts`:
- `snapToGrid(source: Uint8ClampedArray, sourceWidth: number, sourceHeight: number, gridSize: number): SnapResult`
- **Algorithm**:
  1. Divide source into gridSize x gridSize blocks
  2. For each block, collect all pixel colors
  3. **Majority vote**: Find the most common color in the block (fast: build a color frequency map using `(r<<16)|(g<<8)|b` as key)
  4. **Weighted center** (fallback for ambiguous blocks): Weight pixels by distance from block center (Gaussian or linear falloff). Center pixels are more likely to be the "true" color; edge pixels are where AA artifacts live.
  5. Use majority if one color has > 50% of pixels; weighted center otherwise.
  6. Write the chosen color to the output buffer at the logical pixel position.
- Return type:
  ```typescript
  interface SnapResult {
    data: Uint8ClampedArray;     // The snapped image at logical resolution
    width: number;               // logicalWidth
    height: number;              // logicalHeight
  }
  ```

**Test considerations**: Include 2-3 hardcoded small test cases (e.g., a 12x12 image with a clear 4x4 grid) as unit tests to verify the algorithm.

**Estimated scope**: ~300 lines (detect + snap + types)

**Depends on**: Nothing (pure engine code). Can be built in parallel with T6.

---

## Task 6: Color Engine

**Goal**: Pure TypeScript for color distance, palette extraction, quantization, and remapping.

**What to build**:

`src/lib/engine/color/distance.ts`:
- `rgbToLab(r, g, b): [L, a, b]` -- RGB (0-255) to CIELAB conversion
- `deltaE(lab1, lab2): number` -- Euclidean distance in CIELAB (simpler and 3x faster than CIEDE2000, perceptually adequate for 8-32 color palettes)
- `rgbDeltaE(color1: Color, color2: Color): number` -- convenience wrapper

`src/lib/engine/color/palette.ts`:
- `extractColors(data: Uint8ClampedArray): Map<number, number>` -- unique color -> pixel count. Key is `(r<<16)|(g<<8)|b` (ignore alpha for counting). Returns sorted by frequency.
- `extractTopColors(data: Uint8ClampedArray, maxColors: number): Color[]` -- the N most frequent colors.

`src/lib/engine/color/quantize.ts`:
- `octreeQuantize(data: Uint8ClampedArray, width: number, height: number, targetColors: number): QuantizeResult`
- **Octree algorithm** (O(n), fast enough for real-time slider):
  1. Insert all pixels into an octree (8-way tree based on RGB bit planes)
  2. Nodes at deeper levels represent finer color distinctions
  3. Reduce from leaves upward, merging the least-used nodes, until `targetColors` remain
  4. Each remaining leaf defines a palette entry (average color of all pixels that mapped to it)
- Return type:
  ```typescript
  interface QuantizeResult {
    palette: Color[];              // The reduced palette
    indexedData: Uint8Array;       // Per-pixel palette index
    remappedData: Uint8ClampedArray; // Full RGBA at same dimensions
  }
  ```

`src/lib/engine/color/remap.ts`:
- `remapToPalette(data: Uint8ClampedArray, palette: Color[]): Uint8ClampedArray` -- for each pixel, find nearest palette color by Delta E, write it. Used when user changes palette after initial quantization.
- `mergePaletteColors(palette: Color[], indexA: number, indexB: number): Color[]` -- merge two palette entries (average or pick the more frequent one). Remap all pixels that were indexB to indexA.

**Important**: All functions operate on flat `Uint8ClampedArray` + width/height. No Canvas or DOM dependency. This keeps them testable and WASM-swappable.

**Estimated scope**: ~400 lines (distance + palette extraction + octree + remap)

**Depends on**: Nothing (pure engine). Can be built in parallel with T5.

---

## Task 7: Cleanup Pipeline + Panel

**Goal**: Wire grid detection + snap + palette reduction into an interactive UI panel.

**What to build**:

`src/lib/engine/cleanup/pipeline.ts`:
- `autoClean(source: ImageData): CleanupResult` -- the one-click pipeline:
  1. `detectGridSize(source)` -> grid size
  2. `snapToGrid(source, gridSize)` -> snapped image at logical resolution
  3. `extractColors(snapped)` -> color count
  4. If color count > 32: `octreeQuantize(snapped, suggestedColorCount)` -> reduced
  5. Return both the snapped and reduced results plus metadata
- `suggestColorCount(uniqueColors: number): number` -- heuristic: if <16 unique, suggest that count. If 16-64, suggest 16. If 64-256, suggest 24. If >256, suggest 32.

`src/app/CleanupPanel.svelte`:
- **Smart banner** (shown after import, before any cleanup):
  - "This image appears to be ~{gridSize}x{gridSize} pixel art with {colorCount} colors"
  - [Auto-Clean] button -- runs `autoClean()`, applies result
  - [Dismiss] link -- hides banner, user edits manually

- **Grid section**:
  - "Grid Size" label with detected value
  - Slider: range 2-32, step 1, default = detected value
  - Dropdown of top 3 candidates from detection (with confidence scores)
  - "Manual" input for typing an exact number
  - [Apply Grid Snap] button
  - **Live preview**: on slider change (debounced 150ms), run `snapToGrid` with new value, write result to `cleanupPreview` in state. Renderer shows preview. On apply, commit preview to `canvas`. On cancel, clear preview.

- **Palette section**:
  - "Colors" label with current unique count
  - Slider: range 2-64, step 1, default = suggested count
  - Mini palette display: small colored squares showing the current/preview palette
  - [Reduce Colors] button
  - **Live preview**: on slider change (debounced 200ms), run `octreeQuantize`, write to preview.

- **Auto-Clean applies grid snap FIRST (which changes dimensions), then palette reduction on the result.** These are two discrete state changes. The undo system (T11) should group them as one entry when triggered via Auto-Clean.

**Canvas resize handling**:
When grid snap is applied:
1. `canvas.width` and `canvas.height` change (e.g., 512 -> 64)
2. `canvas.data` is replaced with the smaller buffer
3. `sourceImage` stays at original resolution (for before/after)
4. Renderer recalculates fit-to-view zoom
5. `bumpVersion()` triggers re-render

**Estimated scope**: ~350 lines (pipeline orchestrator + panel component)

**Depends on**: T2 (state), T3 (renderer preview mode), T5 (grid engine), T6 (color engine)

---

## Task 8: Before/After Preview

**Goal**: Compare original import with current cleaned state.

**What to build**:

`src/app/BeforeAfterToggle.svelte`:
- **Two modes**, toggled in status bar:
  1. **Hold mode** (default): Hold spacebar to see the original. Release to see current. Simple and fast.
  2. **Split mode**: Draggable vertical divider. Left = original, right = current.

- **Hold mode implementation**:
  - `keydown`/`keyup` listeners for Space
  - On hold: renderer temporarily shows `sourceImage` instead of `canvas`
  - Status bar shows "Showing original" indicator while held
  - Zoom/pan stay the same (so comparison is pixel-accurate)

- **Split mode implementation**:
  - Overlay a `<div>` with `pointer-events: none` clipping the canvas
  - Left side renders source at current zoom/pan; right side renders current canvas
  - Draggable divider handle (a thin vertical bar) updates the clip position
  - Both sides share the same zoom/pan state

- **Size mismatch handling**: After grid snap, source is 512x512 but canvas is 64x64. In before/after:
  - Scale the 64x64 current state UP by the grid size factor for comparison
  - Or scale the 512x512 original DOWN to 64x64 using nearest-neighbor
  - **Recommendation**: show current at its real size, show original downscaled to match. This way the user sees the actual output quality.

- **Toggle button** in status bar: "Before/After: [Hold] [Split] [Off]"

**Estimated scope**: ~200 lines (component + keyboard handling + clip math)

**Depends on**: T2 (state: sourceImage, canvas), T3 (renderer: shared zoom/pan)

---

## Task 9: Drawing Tools + Toolbar

**Goal**: Pencil, eraser, flood fill, and color picker tools for manual touch-up.

**What to build**:

`src/lib/engine/canvas/tools.ts` (pure engine, no DOM):
- `pencilStroke(data, width, height, x, y, color): PixelChange[]` -- set single pixel, return what changed
- `eraserStroke(data, width, height, x, y): PixelChange[]` -- set pixel to transparent [0,0,0,0]
- `floodFill(data, width, height, x, y, fillColor, tolerance): PixelChange[]` -- BFS/queue-based fill. Tolerance = max Delta E for "same color" (default 0 = exact match, useful for cleaning up near-duplicate colors). Returns all changed pixels.
- `pickColor(data, width, height, x, y): Color` -- read pixel color at position

```typescript
interface PixelChange {
  x: number;
  y: number;
  before: Color;
  after: Color;
}
```

`src/app/Toolbar.svelte`:
- Vertical toolbar on the left side
- Tool buttons: Pencil (P), Eraser (E), Fill (G), Picker (I) -- keyboard shortcuts in parens
- Active tool highlighted
- Tool-specific options below the buttons:
  - Fill: tolerance slider (0-50 Delta E)

`src/app/CanvasView.svelte` (extend from T3):
- Add mouse event handlers: `mousedown`, `mousemove`, `mouseup`
- On `mousedown` + `mousemove` with pencil/eraser: call tool function, `bumpVersion()`
- On `mousedown` with fill: call `floodFill`, `bumpVersion()`
- On `mousedown` with picker: call `pickColor`, update `activeColor` in state
- **Pencil continuous stroke**: track `isDrawing` state. On `mousemove` while drawing, interpolate between last and current pixel (Bresenham line) to avoid gaps at fast mouse movement.
- **Palette-locked drawing**: pencil and fill use `activeColor` which is always a palette color (set via palette panel, T10). The color picker tool reads from canvas and snaps to the nearest palette color.

**Cursor styling**:
- Pencil: crosshair
- Eraser: crosshair with eraser icon (or just crosshair)
- Fill: paint bucket cursor (CSS `cursor: url(...)`)
- Picker: eyedropper cursor

**Estimated scope**: ~350 lines (tool engine + toolbar component + canvas event handlers)

**Depends on**: T2 (state: activeTool, activeColor), T3 (canvas view: mouse events, screenToPixel)

---

## Task 10: Palette Panel

**Goal**: Display and interact with the current color palette.

**What to build**:

`src/app/PalettePanel.svelte`:
- **Palette grid**: Small colored squares (16x16px each) arranged in a wrapping grid
- Each square shows its color; clicking sets it as `activeColor`
- Active color has a visible border/highlight
- Hover shows tooltip: hex value + pixel count

- **Active color display**: Larger swatch at top of panel showing:
  - Current foreground color (large square)
  - Hex input field for manual entry (auto-snaps to nearest palette color if palette-locked)

- **Palette actions**:
  - "Extract from image" button (re-runs `extractTopColors` on current canvas)
  - Sorting: by frequency, by hue, by luminance (dropdown)
  - Color count badge: "16 colors"

- **Palette-lock toggle**: Small lock icon. When locked:
  - Drawing tools only use palette colors
  - Color picker snaps to nearest palette color
  - New colors can't be introduced
  - When unlocked: freeform color picking allowed (but warn that it may introduce noise)

- **Color editing** (minimal for MVP):
  - Double-click a palette swatch to open a small color input (`<input type="color">`)
  - Changing a palette color auto-remaps all pixels of the old color to the new color

**Integration with cleanup (T7)**:
- After `octreeQuantize`, the resulting palette is set in state
- After `remapToPalette`, palette updates and canvas re-renders
- Palette panel is reactive to `state.palette` changes

**Estimated scope**: ~250 lines (panel component + palette interaction logic)

**Depends on**: T2 (state: palette, activeColor), T6 (color engine: extractTopColors, remapToPalette)

---

## Task 11: Undo/Redo

**Goal**: Full snapshot undo/redo for all operations.

**What to build**:

`src/lib/engine/history/undo.ts`:
```typescript
interface HistoryEntry {
  label: string;                    // "Pencil stroke", "Grid snap", "Reduce to 16 colors"
  canvasSnapshot: {
    data: Uint8ClampedArray;        // Full copy of pixel data
    width: number;
    height: number;
  };
  paletteSnapshot: Color[];
}

interface HistoryManager {
  push(label: string): void;        // Snapshot current state before an operation
  undo(): boolean;                  // Restore previous snapshot, return success
  redo(): boolean;                  // Restore next snapshot, return success
  canUndo: boolean;
  canRedo: boolean;
  entries: HistoryEntry[];          // For UI display
  currentIndex: number;
}
```

- **Snapshot strategy**: Call `push()` BEFORE mutating canvas. This captures the "before" state. The undo stack stores up to 50 entries. Memory at 64x64: 50 * 16KB = 800KB. At 128x128: 50 * 64KB = 3.2MB. Negligible.
- **Canvas resize handling**: When grid snap changes dimensions, the snapshot stores the pre-snap dimensions AND data. Undo restores both the data and the canvas size.
- **Grouped operations**: `autoClean` should call `push("Auto-Clean")` once before running the whole pipeline. This makes it one undo step.

`src/app/App.svelte` (extend):
- Keyboard shortcuts: `Ctrl+Z` for undo, `Ctrl+Shift+Z` (or `Ctrl+Y`) for redo
- Status bar shows: "Undo: {label}" / "Redo: {label}" or grayed out if unavailable

**Operations that create undo entries**:
- Every `mouseup` at end of a pencil/eraser stroke
- Every flood fill
- Grid snap apply
- Palette reduction apply
- Auto-Clean
- Individual color edits from palette panel

**NOT undo-able** (viewport-only, no data change):
- Zoom, pan
- Tool selection
- Grid overlay toggle

**Estimated scope**: ~200 lines (history manager + keyboard wiring)

**Depends on**: T2 (state: canvas, palette), needs to be wired into T7 (cleanup) and T9 (tools)

---

## Task 12: Export (PNG + Clipboard)

**Goal**: Get cleaned pixel art out of the editor.

**What to build**:

`src/lib/engine/io/export.ts`:
- `exportPNG(data: Uint8ClampedArray, width: number, height: number): Promise<Blob>` -- write to temp canvas, `toBlob("image/png")`
- `exportScaledPNG(data, width, height, scale: number): Promise<Blob>` -- create canvas at width*scale x height*scale, draw with `imageSmoothingEnabled = false`, export. Common scales: 1x (native), 2x, 4x, 8x, 16x.
- `copyToClipboard(blob: Blob): Promise<void>` -- `navigator.clipboard.write([new ClipboardItem({"image/png": blob})])`
- `downloadBlob(blob: Blob, filename: string): void` -- create `<a>` element with `URL.createObjectURL`, click, revoke

`src/app/ExportPanel.svelte` (or modal/dropdown):
- **Quick export** (top of panel or status bar):
  - [Copy] button -- copies at native resolution to clipboard. Toast: "Copied 64x64 PNG"
  - [Download] button -- downloads at native resolution. Filename: `sprite-sprout-{WxH}.png`

- **Export options** (expandable):
  - Scale selector: 1x, 2x, 4x, 8x, 16x (shows resulting dimensions: "64x64 -> 512x512")
  - [Download Scaled] button
  - Background toggle: transparent vs solid color (for formats/uses that don't support alpha)

- **Keyboard shortcut**: `Ctrl+Shift+E` for quick export (native, download), `Ctrl+Shift+C` for clipboard copy

**Estimated scope**: ~180 lines (export utilities + panel component)

**Depends on**: T2 (state: canvas data)

---

## Summary

| Task | Name | ~Lines | Depends On | Parallelizable With |
|------|------|--------|------------|---------------------|
| T1 | Project Scaffold | 200 | -- | -- |
| T2 | Core State + Data Model | 250 | T1 | -- |
| T3 | Canvas Renderer | 350 | T2 | -- |
| T4 | Image Import | 250 | T2, T3 | -- |
| **T5** | **Grid Detection + Snap** | **300** | **--** | **T6** |
| **T6** | **Color Engine** | **400** | **--** | **T5** |
| T7 | Cleanup Pipeline + Panel | 350 | T2, T3, T5, T6 | -- |
| T8 | Before/After Preview | 200 | T2, T3 | T9, T10 |
| T9 | Drawing Tools + Toolbar | 350 | T2, T3 | T8, T10 |
| T10 | Palette Panel | 250 | T2, T6 | T8, T9 |
| T11 | Undo/Redo | 200 | T2 | T12 |
| T12 | Export | 180 | T2 | T11 |
| | **Total** | **~3,280** | | |

**Critical path**: T1 -> T2 -> T3 -> T4 -> T7 (needs T5+T6) -> integration

**Maximum parallelism**: After T2, you can run T5 and T6 in parallel. After T7, you can run T8, T9, T10 in parallel. T11 and T12 can run in parallel.
