# Tech Stack Research

## Recommended Stack

| Layer | Choice | Alternative |
|-------|--------|-------------|
| **Rendering** | Canvas 2D API | WebGL (via PixiJS) if shader effects needed later |
| **Framework** | Svelte 5 (Runes) | SolidJS (if team prefers JSX/React-like syntax) |
| **State / Undo** | Custom command pattern with delta storage | zustand-travel (if using React/SolidJS) |
| **PNG I/O** | Native Canvas API + UPNG.js (indexed/APNG) | fast-png |
| **GIF Encoding** | gifenc | gif.js (legacy only) |
| **GIF Decoding** | omggif or modern-gif | gifuct-js |
| **Sprite Sheets** | Custom grid packing + maxrects-packer | spritesheet.js |
| **Project Files** | JSON + binary blobs in zip via fflate | Single JSON with base64 (simpler, larger) |
| **Color Library** | culori | chroma.js (better palette generation) |
| **Quantization** | image-q | RgbQuant.js (lighter) |
| **AI Cleanup** | unfake.js algorithms (reference/integrate) | Custom implementation |
| **Build Tool** | Vite | -- |
| **Language** | TypeScript | -- |

---

## Rendering: Canvas 2D API

### Why Canvas 2D (not WebGL)

At pixel art sizes (32x32 through 256x256), Canvas 2D is more than sufficient:

| Size | Pixels | `putImageData` Time | Verdict |
|------|--------|---------------------|---------|
| 32x32 | 1,024 | ~0.01ms | Trivial |
| 64x64 | 4,096 | ~0.02ms | Trivial |
| 128x128 | 16,384 | ~0.05ms | Trivial |
| 256x256 | 65,536 | ~0.1ms | Trivial |

Even with 10+ layers, full recomposite at 256x256 is well under 1ms.

Canvas 2D advantages for this use case:
- **Direct pixel access** via `ImageData` / `Uint8ClampedArray` -- the fundamental operation for pixel art
- **Built-in compositing** via `globalCompositeOperation` for layer blend modes
- **Battle-tested** in Piskel and Lospec Pixel Editor
- **Lower implementation complexity** than WebGL shaders + textures + framebuffers

### Zoomed Pixel Grid Rendering

1. Store artwork in a small off-screen canvas at native resolution (e.g., 64x64)
2. Render to display canvas using `ctx.drawImage()` with `imageSmoothingEnabled = false`
3. Overlay grid lines at pixel boundaries (only at zoom >= 4x)
4. Set CSS `image-rendering: pixelated` on the canvas element

### Layer Compositing

One off-screen `ImageData` buffer per layer, composited onto a single display canvas:
- Each layer stores its own `Uint8ClampedArray` of RGBA values at native resolution
- Layers composited bottom-to-top using `ctx.drawImage()` with appropriate `globalCompositeOperation`
- `OffscreenCanvas` available for Web Worker compositing if needed (unnecessary at these sizes)

---

## Framework: Svelte 5

### Why Svelte 5 with Runes

1. **Fine-grained reactivity without virtual DOM** -- compiled to direct DOM updates, near-zero framework overhead
2. **`$effect` for canvas bridge** -- clean pattern for "when state changes, redraw canvas"
3. **Excellent component model** for tool-heavy UI (toolbars, color pickers, layer panels, timeline)
4. **~10 KB bundle** -- saves room for image processing libraries
5. **Two-way binding** (`bind:value`) simplifies tool option panels

### Close Alternative: SolidJS
- Marginally better raw performance (~7 KB bundle)
- JSX syntax familiar to React developers
- Smaller ecosystem is the main disadvantage

### Why NOT React
- Virtual DOM reconciliation is unnecessary overhead
- Canvas doesn't benefit from React's diffing
- `useEffect` cleanup dance for canvas code is a known pain point

---

## File I/O

### PNG: Browser-native + UPNG.js
- **Reading**: `Image` element -> canvas -> `getImageData()`. Zero library overhead.
- **Writing**: `canvas.toBlob('image/png')` for standard export.
- **Advanced** (indexed color, APNG): UPNG.js -- the PNG engine behind Photopea.

### GIF: gifenc
- 2x+ faster than gif.js
- Optimized for flat-style graphics (pixel art)
- Small and dependency-free
- Full control over quantization, palette, transparency, disposal per frame
- For decoding/import: omggif (lightweight, pure-JS)

### Project Format: ZIP via fflate
```
project.zip/
  project.json    -- metadata, layers, palette, animation timing
  layers/0.bin    -- raw Uint8ClampedArray per layer/frame
  layers/1.bin
  ...
```
- fflate is the fastest JS zip library (~8 KB)
- Similar to .ora (OpenRaster) and .aseprite internal structure
- Avoids base64 bloat from embedding binary in JSON

---

## Key Libraries for AI Cleanup

### unfake.js
Purpose-built for cleaning up AI-generated pixel art:
- Automatic pixel size detection
- Color quantization via image-q
- Morphological cleanup (filling holes, removing noise)
- Jaggy cleanup (smoothing staircase artifacts)
- Alpha channel binarization

### image-q
Color quantization library used by unfake.js:
- Supports RGBQuant, NeuQuant, Wu's algorithms
- CIEDE2000 color distance
- Essential for reducing AI art from thousands of colors to a clean indexed palette

### culori
Color manipulation library:
- Tree-shakeable from `culori/fn`
- OKLCH / OKLAB perceptually uniform color spaces
- Color difference functions (CIEDE2000, Euclidean, Manhattan)
- Built-in blend modes and alpha handling

---

## Existing Projects to Study

| Project | Tech | Key Insight |
|---------|------|-------------|
| **Piskel** | Vanilla JS, Canvas 2D | Proves Canvas 2D is sufficient; study rendering pipeline |
| **Lospec Pixel Editor** | Vue.js, Canvas 2D | Study tool architecture (archived but instructive) |
| **unfake.js** | OpenCV.js, image-q | Direct reference for AI cleanup algorithms |
| **Aseprite** | C++, custom renderer | Study layer/frame/cel data model |
| **Pixelorama** | Godot Engine | Study non-destructive effects for pixel art |
