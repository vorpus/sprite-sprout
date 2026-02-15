# Animation, Layering & Export Pipeline

## Animation System Design

### Recommended Model: Simplified Aseprite (Cel-Based Timeline)

The sprite is a 2D grid: rows are layers, columns are frames. Each cell is a **cel** -- an image positioned at (x, y) on the canvas for a specific layer at a specific frame.

Key features:
- **Linked cels**: Multiple frames share the same image data. Editing one updates all. Essential for static elements (backgrounds).
- **Continuous vs. discontinuous layers**: Continuous auto-creates linked cels on frame duplication (backgrounds). Discontinuous creates independent cels (animated parts).
- **Per-cel positioning**: Each cel has its own (x, y) offset, allowing repositioning without modifying pixels.
- **Sparse storage**: Empty cells = layer contributes nothing for that frame.

### Onion Skinning

- Flatten all layers for neighboring frames
- Tint previous frames red/warm, next frames blue/cool
- Opacity falls off with distance from current frame
- Implementation: `globalAlpha` + temporary offscreen canvas + `globalCompositeOperation = "source-atop"` for tinting
- Configurable range: 1-3 frames in each direction

### Frame Timing

- Per-frame delay in milliseconds
- Common values: 100ms (10fps), 83ms (12fps), 200ms (5fps)
- Individual frames can have different delays (hold key poses longer)

---

## GIF Export

### Recommended Library: gifenc

| Library | Status | Size | Best For |
|---------|--------|------|----------|
| **gifenc** | Maintained | ~8KB | Pixel art, flat graphics, speed |
| gif.js | **Abandoned** (no updates since ~2016) | ~20KB + worker | Legacy only |
| modern-gif | Recent, TypeScript | ~15KB | Encode + decode |
| FFmpeg.wasm | Active, heavy | ~25MB | Overkill for pixel art |

gifenc advantages:
- 2x+ faster than gif.js
- Optimized for flat-style graphics
- Full control over quantization, palette, transparency, disposal per frame
- 64x64 at 20 frames: sub-100ms encoding

### gifenc Workflow

```
1. Create GIFEncoder({ auto: true })
2. For each frame:
   a. Get RGBA pixel data (Uint8ClampedArray)
   b. quantize(rgba, 256) -> palette
   c. applyPalette(rgba, palette) -> indexed
   d. encoder.writeFrame(indexed, width, height, { palette, delay, transparent, dispose })
3. encoder.finish()
4. encoder.bytes -> Uint8Array (the GIF file)
5. Blob -> download
```

### Color Quantization Strategy for GIF

1. **If frame already <= 256 colors** (common in pixel art): skip quantization, build palette directly. Preserves pixel-perfect accuracy.
2. **If quantization needed**: use gifenc's built-in quantizer.
3. **Global palette preferred**: Quantize from union of all colors across all frames to avoid color flickering between frames.
4. Reserve one palette index for transparency (255 usable colors).

### GIF Optimization (Frame Differencing)

1. Compare frame N with N-1
2. Set identical pixels to transparent index
3. Crop to bounding box of changed pixels
4. Set disposal to "do not dispose" (1)

Dramatically reduces file size for animations with static backgrounds.

### GIF Transparency

GIF = 1-bit transparency only (fully transparent or fully opaque). Fine for pixel art. Map alpha=0 pixels to a designated `transparentIndex`.

---

## Sprite Sheet Operations

### Import

1. **Uniform grid** (most common): User specifies or tool auto-detects frame width/height. Auto-detection heuristic: find GCD of dimensions, or scan for full rows/columns of background color.
2. **Transparency-based**: Scan for connected non-transparent regions. Each region = a frame.
3. **JSON/XML metadata**: Parse TexturePacker-format data files.

### Export

- Layout: horizontal strip, vertical strip, or grid (rows x columns)
- Configurable padding (0px tight, 1-2px for engine compatibility)
- Output: PNG with transparency
- Optional JSON metadata matching TexturePacker format for game engine import

---

## Layer System

### Blending Modes (Priority for Pixel Art)

| Mode | Canvas 2D Value | Use Case |
|------|----------------|----------|
| **Normal** | `source-over` | Default (most layer work) |
| **Multiply** | `multiply` | Shadows, darkening |
| **Screen** | `screen` | Light effects, glow |
| **Overlay** | `overlay` | Color grading |
| **Darken** | `darken` | Keep only darkest pixels (outlines) |
| **Lighten** | `lighten` | Keep only lightest pixels |

All natively supported by Canvas 2D `globalCompositeOperation`.

**Minimum viable**: Normal + Multiply. **Recommended**: all six above.

### Reference Layers

- Can contain higher-resolution images (sketches to trace)
- Never included in export
- Adjustable opacity, scale, position
- Useful for alignment between sprites

### Layer Groups

- Tree structure: `LayerImage` (leaf) or `LayerGroup` (branch with children)
- Collapse/expand, toggle visibility as unit
- Group opacity multiplies with child opacity

---

## Data Model

### In-Memory Structure

```
Sprite {
  width, height: number
  colorMode: "rgba"
  palette: Color[]

  layers: LayerNode[]          // Root layer stack (bottom to top)
  frames: FrameInfo[]          // Per-frame metadata
  tags: Tag[]                  // Named frame ranges ("walk", "idle")
}

LayerNode = LayerImage | LayerGroup

LayerImage {
  type: "image"
  id, name: string
  visible, locked: boolean
  opacity: number              // 0.0 - 1.0
  blendMode: string
  continuous: boolean
  cels: Map<number, Cel>       // frameIndex -> Cel (sparse)
}

LayerGroup {
  type: "group"
  id, name: string
  visible, locked: boolean
  opacity: number
  collapsed: boolean
  children: LayerNode[]
}

Cel {
  id: string
  imageData: Uint8ClampedArray
  width, height: number
  x, y: number                 // Position offset
  linkedCelId: string | null   // Shares imageData with another cel
}

FrameInfo { duration: number }

Tag {
  name: string
  fromFrame, toFrame: number
  color: string
  direction: "forward" | "reverse" | "pingpong"
}
```

### Memory at 64x64

- Single cel: 64 * 64 * 4 = 16 KB
- 20 frames, 5 layers, all occupied: 100 cels = ~1.6 MB
- 128x128, 50 frames, 10 layers: ~32 MB (still manageable)

### Serialization

**Custom binary format with JSON header:**
```
[4 bytes: magic "SPRT"]
[4 bytes: version]
[4 bytes: JSON header length N]
[N bytes: JSON header (deflate compressed)]
[remaining: pixel data chunks (deflate compressed)]
```

- JSON for human-debuggable metadata
- Binary for pixel data (avoids 33% Base64 bloat)
- Native `CompressionStream` API for deflate (no library needed)

**Simpler alternative**: ZIP with fflate containing `project.json` + individual PNG files per cel.

### Auto-Save

IndexedDB: handles binary blobs natively, generous storage limits (~50MB+).

### Undo/Redo

**Full snapshot stack** (simple, sufficient at pixel art sizes):
- 64x64 = 16 KB per snapshot
- 100 undo steps = ~1.6 MB per cel
- Global undo stack (not per-layer/frame)

```
UndoEntry {
  type: string
  timestamp: number
  patches: CelPatch[]           // Which cels changed
  structuralChanges: any        // Layer/frame add/delete/reorder
}

CelPatch {
  layerId: string
  frameIndex: number
  beforeData, afterData: Uint8ClampedArray | null
  beforePosition, afterPosition: {x, y} | null
}
```

---

## Library Summary

| Concern | Library | Rationale |
|---------|---------|-----------|
| GIF encoding | gifenc | Fastest, lightest, pixel art optimized |
| GIF decoding | modern-gif or gifuct-js | Import animated GIFs as frames |
| Compression | Native CompressionStream | No dependency, Baseline 2023 |
| File save/load | Custom binary + CompressionStream | Compact, fast |
| Auto-save | IndexedDB (native) | Handles binary, generous limits |
| Sprite sheet | Canvas 2D (native) | Draw frames into grid, toBlob() |
