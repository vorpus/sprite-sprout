# WASM vs JavaScript Analysis

## Executive Summary

**Start with pure JavaScript. Architect with clean boundaries so WASM can be swapped in later for specific bottlenecks -- but you likely won't need it.**

For pixel art sizes (64x64 through 256x256), JavaScript with typed arrays is fast enough for every operation. The threshold where WASM becomes beneficial is roughly real-time (<16ms) processing on images >256x256 with complex multi-pass algorithms.

---

## Operation-by-Operation Analysis

### 1. Grid Alignment / Snap-to-Grid

| Image Size | Edge Detection (JS) | 2D FFT (JS) | Grid Snap Remap (JS) |
|------------|---------------------|-------------|---------------------|
| 64x64 | <1ms | <1ms | <1ms |
| 128x128 | ~1ms | ~2-3ms | <1ms |
| 256x256 | ~3-5ms | ~10-15ms | ~2ms |
| 512x512 | ~10-20ms | ~40-80ms | ~5-10ms |

**WASM benefit**: Low to Moderate (1.5-3x). Only FFT at 512x512 approaches a bottleneck, and simpler autocorrelation-based detection avoids FFT entirely.

**Verdict**: JS is fine.

### 2. Color Space Reduction

| Algorithm | 128x128 (JS) | 256x256 (JS) | 512x512 (JS) |
|-----------|-------------|-------------|-------------|
| Median cut | ~2-4ms | ~8-15ms | ~30-60ms |
| Octree | ~1-3ms | ~5-10ms | ~20-40ms |
| K-means (k=16, 20 iter) | ~15-30ms | ~60-120ms | ~250-500ms |
| Floyd-Steinberg | ~1-2ms | ~4-8ms | ~15-30ms |

**Key finding**: Floyd-Steinberg WASM vs JS benchmarks show nearly identical performance (memory-access-heavy, JS JIT optimizes well).

**WASM benefit**: Moderate for K-means only (2-5x). Median cut / octree have no meaningful benefit.

**Verdict**: Start with octree or median cut in JS. Add WASM K-means later if needed at 256x256+.

### 3. Smart Color Selection (Perceptual Distance)

Per-comparison cost:
- RGB Euclidean: ~7 operations
- CIELAB Delta E: ~30-40 operations
- CIEDE2000: ~80-100 operations

For palette optimization (10 sprites of 64x64, reducing to 16 colors):
- RGB Euclidean k-means: ~1-2ms in JS
- CIEDE2000 k-means: ~10-20ms in JS (pre-converted to Lab)

**WASM benefit**: Moderate (2-5x for CIEDE2000-heavy workloads). But CIELAB Delta E (not full CIEDE2000) is ~3x cheaper and perceptually similar enough for 8-32 color pixel art palettes.

**Verdict**: Use CIELAB Delta E in JavaScript. Good enough for pixel art color ranges.

### 4. Image Analysis (Anti-Aliasing, Noise, Outlines)

| Operation | 128x128 (JS) | 256x256 (JS) | 512x512 (JS) |
|-----------|-------------|-------------|-------------|
| Anti-alias detection | ~2-3ms | ~8-12ms | ~30-50ms |
| Stray pixel detection | ~1-2ms | ~4-8ms | ~15-30ms |
| Outline detection (Sobel) | ~2-4ms | ~8-15ms | ~30-60ms |

**WASM benefit**: Low (1.2-2x). These are memory-bound, not compute-bound.

**Verdict**: JS is more than adequate. Under 5ms at typical pixel art sizes.

### 5. Batch Operations (Animation Frames)

Single 128x128 frame: ~20ms total cleanup. For 8 frames: ~160ms. For 24 frames: ~480ms.

**The real solution is Web Workers, not WASM.** Each frame can be processed independently:
- 4 workers processing 8 frames = ~40ms perceived (parallel)
- Parallelism is a much bigger win than making each frame 3x faster

**Verdict**: Use Web Workers first. This is an architecture decision, not a language decision.

---

## Summary Table

| Operation | 128x128 JS | 256x256 JS | WASM Speedup | Worth It? |
|-----------|-----------|-----------|-------------|-----------|
| Grid snap (simple) | <2ms | ~5ms | 1.5-2x | No |
| Grid snap (FFT) | ~3ms | ~15ms | 2-3x | Only at 512x512 |
| Median cut | ~3ms | ~12ms | 1.5-2x | No |
| Octree quantization | ~2ms | ~8ms | 1.5x | No |
| K-means (k=16) | ~25ms | ~100ms | 3-5x | At 256x256+ |
| K-means + CIEDE2000 | ~80ms | ~300ms | 5-8x | Yes, at 256x256+ |
| Floyd-Steinberg | ~2ms | ~6ms | 1.0-1.3x | No |
| Anti-alias detection | ~3ms | ~10ms | 1.2-1.5x | No |
| Outline detection | ~3ms | ~12ms | 1.5-2x | No |

---

## WASM Build Complexity Cost

- **Toolchain**: Rust + wasm-pack + wasm32-unknown-unknown target (~30 min setup)
- **Bundle size**: ~20-50KB gzipped minimal; ~100-200KB with image + palette crates
- **Memory overhead**: Must copy pixel data JS -> WASM -> JS (~1-3ms for 256x256, can negate speedup at small sizes)
- **Developer experience**: Two languages, two debugging contexts, coordinated API changes

---

## Recommended Architecture

### Phase 1: Pure JavaScript

```
src/engine/
  color/
    quantize.ts      -- median-cut, octree
    distance.ts      -- CIELAB Delta E
    palette.ts        -- palette extraction and optimization
    dither.ts         -- Floyd-Steinberg, ordered
  grid/
    detect.ts         -- autocorrelation-based grid detection
    snap.ts           -- snap pixels to detected grid
  analysis/
    antialias.ts      -- detect AA edges
    noise.ts          -- find stray pixels
    outline.ts        -- edge detection
  batch/
    worker.ts         -- Web Worker for batch processing
    scheduler.ts      -- distributes frames across workers
```

**Key design principle**: Every module accepts and returns `Uint8ClampedArray` pixel buffers. This makes WASM swap-in trivial later -- same interface.

### Phase 2: Selective WASM (only if profiling shows need)

Likely candidates:
1. K-means with perceptual color distance at >= 256x256
2. 2D FFT for frequency-domain grid detection at 512x512
3. Batch processing of many large frames

**The Squoosh pattern**: JS for UI + orchestration, WASM modules for heavy codecs, Web Workers for non-blocking execution, on-demand WASM loading.

### Existing Rust/WASM Libraries

| Library | Purpose |
|---------|---------|
| `kmeans_colors` | Image color quantization (used by image_to_pixel_art_wasm) |
| `exoquant` | High-quality quantization + dithering |
| `libimagequant` | Powers pngquant, production-grade |
| `palette` | Perceptual color spaces (CIELAB) |
| `rustfft` | FFT for frequency analysis |
| `image` | General image processing |
| Photon | Rust/WASM image processing with edge detection |
