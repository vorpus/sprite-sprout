# Color Quantization Techniques Research

> Phase 2 research — 2026-02-15

## Context

Sprite Sprout currently uses three quantization approaches:
- **Median cut** — splits RGB histogram at population medians
- **Weighted octree** — builds RGB octree, merges leaves by frequency
- **K-means refinement** (CIELAB Delta E) — polishes octree output in 3 iterations

This document surveys additional techniques for finding the best K colors (16–32) when converting RGB pixel art.

---

## 1. Wu's Variance Minimizer (1991)

**Paper**: "Efficient Statistical Computations for Optimal Colour Quantization" (Xiaolin Wu, Graphics Gems II)

Greedy orthogonal bipartition of a 3D RGB histogram where each split minimizes the sum of weighted variances of the resulting sub-boxes.

**How it works**:
1. Quantize RGB into a 33×33×33 grid histogram.
2. Precompute 3D cumulative moments (count, channel sums, sum-of-squares) for O(1) variance queries on any axis-aligned box.
3. Repeatedly select the box with largest weighted variance, try all axis-aligned cuts on all three axes, and choose the cut that minimizes the combined variance.
4. Pixel mapping is direct — each pixel maps to its histogram cell's box centroid.

**Strengths**:
- Faster than median cut with higher quality (minimizes MSE, not population count).
- No nearest-neighbor search during palette assignment.
- Straightforward to implement; `image-q` has a TS version.

**Weaknesses**:
- Operates in RGB by default; Lab/OKLab gamuts are not rectangular, complicating the histogram approach.
- Axis-aligned cuts only — cannot make diagonal splits.
- 5-bit pre-quantization (32 levels/channel) discards some precision.

**JS feasibility**: Easy. The `image-q` npm library includes a TypeScript implementation.

---

## 2. K-Means Variants

### 2a. MacQueen's Online K-Means

Updates centroids immediately after each pixel assignment rather than waiting for a full pass. Research (Thompson & Celebi 2020) shows it converges significantly faster than Lloyd's batch k-means while delivering nearly identical quality — finds good assignments within the first iteration.

**Relevance**: Best variant for performance-sensitive browser code. Drop-in replacement for existing `refineWithKMeans`.

### 2b. K-Means++ Initialization

Selects initial centroids with probability proportional to squared distance from existing centroids. Research on color quantization specifically (Celebi 2010) shows mixed results — deterministic initialization from octree/median-cut often outperforms k-means++ for this domain. Our current octree-seeded approach is already the recommended hybrid.

### 2c. Mini-Batch K-Means

Processes random subsets per iteration. Unnecessary at pixel-art sizes (4K–65K pixels), where full-batch processing is already instant.

### Performance at Sprite Sizes

| Image | Pixels | K=16, 3 iter | K=32, 5 iter |
|-------|--------|-------------|-------------|
| 64×64 | 4,096 | < 1ms | < 2ms |
| 128×128 | 16,384 | ~2ms | ~5ms |
| 256×256 | 65,536 | ~5–30ms | ~15–50ms |

**Key references**:
- Lloyd (1982) — standard batch k-means
- MacQueen (1967) — online variant
- Arthur & Vassilvitskii (2007) — k-means++
- Celebi (2023) — "Forty years of color quantization: a modern, algorithmic survey"
- Thompson & Celebi (2020) — "Fast color quantization using MacQueen's k-means algorithm"

---

## 3. Perceptual Color Spaces

### 3a. CIELAB (current)

- L\*a\*b\* with Delta E (CIE76) approximates perceptual difference.
- Conversion requires gamma linearization → XYZ matrix → cube-root with conditional linear segment.
- CIEDE2000 fixes worst errors but costs ~3× CIE76.
- Known weakness: blues shift toward purple during interpolation.

### 3b. OKLab (Ottosson 2020)

- Same LCh structure, better-optimized matrix coefficients (fitted against CAM16 + IPT data).
- Conversion: linear sRGB → M1 matrix → cube root → M2 matrix. Two 3×3 multiplies, no conditionals.
- Better hue linearity (no purple shift), better chroma prediction, simpler implementation.
- `culori` (already in the npm ecosystem) supports OKLab natively.

**Caveat for quantization**: L has much larger amplitude than a,b. At very low K (< 16), Euclidean distance in OKLab over-emphasizes lightness, producing desaturated palettes. Workaround: weight a,b channels by ~1.5–2× or use a weighted distance metric.

### Impact on Quantization

Running k-means, median cut, or Wu's in a perceptual space improves:
1. **Cluster boundaries** — splits along perceptually meaningful axes.
2. **Centroid averaging** — weighted averages stay chromatically faithful.
3. **Pixel assignment** — prevents visually jarring mismatches.
4. **K-means convergence** — minimizes perceptual error, not RGB error.

Cost is negligible at pixel-art sizes: OKLab conversion of a 64×64 image takes < 1ms.

---

## 4. NeuQuant (Dekker 1994)

1D Kohonen self-organizing map (SOM) with 256 neurons. A sampling factor trades quality for speed. Produces smooth palettes with minimal banding for photographic content.

**Not recommended for pixel art** because:
- Optimized for 256-color palettes, not 16–32.
- Frequency/bias mechanism favors gradient smoothness over distinct-color retention.
- Merges rare but visually important accent colors (e.g., 1-pixel eye highlights).
- The 1D SOM topology has no benefit for discrete palette discovery.

**JS libraries**: `image-q`, `neuquant-js` (both browser-ready).

---

## 5. Spatial Color Quantization (SCQ)

**Paper**: Puzicha, Held et al. (2000) — "On Spatial Quantization of Color Images"

Co-optimizes palette and per-pixel assignments via MRF energy minimization with deterministic annealing. Considers pixel neighborhoods, modeling how the human eye blends adjacent colors.

**Strengths**: Best visual results at extremely low color counts (4–16). Built-in perceptually optimal dithering.

**Not recommended for pixel art**:
- Built-in dithering destroys hard edges that define pixel art.
- Computationally expensive (orders of magnitude slower than octree).
- No JS/WASM port exists (only C: scolorq, Rust: rscolorq).

---

## 6. Popularity Algorithm

Pick the K most frequently occurring colors. Map remaining pixels to nearest selected color.

**Surprisingly decent for pixel art** after grid-snap, because:
- Snap eliminates anti-aliasing intermediates.
- Remaining colors are mostly the "intended" palette.
- Dominant colors are guaranteed representation.

**Weakness**: Ignores rare but visually important colors (highlights, accents). The existing weighted octree already incorporates popularity-weighted reduction.

---

## 7. Simulated Annealing / Genetic Algorithms

### Simulated Annealing (SA)

Treats palette as a state, proposes random perturbations, accepts worse solutions with decreasing probability. With hybrid SA + C-means, consistently outperforms deterministic methods.

### Genetic Algorithms (GA)

Population of candidate palettes evolves via crossover and mutation. Studies show superior quality vs. heuristics and k-means for small palette sizes.

### Other Metaheuristics

Particle Swarm Optimization, Artificial Bee Colony, Cuckoo Search, Differential Evolution — all applied to palette optimization with good results.

### Feasibility

At sprite sizes, SA with 5,000 iterations on a 64×64 image: ~1–3s in pure JS. Feasible behind a Web Worker as an optional "optimize palette" feature, but too slow for real-time preview.

---

## 8. Dithering Techniques

### Error Diffusion

| Algorithm | Neighbors | Divisor | Notes |
|-----------|-----------|---------|-------|
| Floyd-Steinberg | 4 | 16 | Most common; visible checkerboard in uniform regions |
| Jarvis-Judice-Ninke | 12 | 48 | Smoother, 3× slower |
| Atkinson | 6 | 8 | Propagates only 75% of error; better midtone contrast |
| Burkes | 7 | 32 | Good speed/quality balance |
| Sierra Lite | 2 | 4 | Fastest; adequate quality |

### Ordered Dithering

- Bayer matrix (2×2 to 16×16) — fully parallelizable, position-independent, animation-safe.
- Blue noise — more organic patterns but expensive to generate.
- Yliluoma's algorithms — extend ordered dithering to arbitrary palettes.

### Dithering-Aware Quantization

Co-optimizes palette and dithering pattern (Huang et al. 2015). Relevant when dithering is applied, but dithering is generally undesirable for pixel art.

### Pixel Art and Dithering

**Dithering is generally problematic for sprites** because:
- Small sprites (16–64px) lack resolution for patterns to read as gradients.
- Dithering destroys the hard edges that define pixel art.
- Animation causes shimmer as patterns shift frame-to-frame.
- Well-chosen palettes include deliberate ramp colors, making dithering redundant.

**Where it works**: large-area backgrounds (128px+), stylistic retro aesthetics (Game Boy, C64), 1-bit art, static images.

**Recommendation**: Offer dithering as opt-in, not default. If offered, Bayer ordered dithering is preferable — position-independent (animation-safe), regular patterns consistent with pixel art aesthetics.

---

## Recommendations for Sprite Sprout

| Priority | Change | Effort | Impact |
|----------|--------|--------|--------|
| **High** | ~~Add OKLab distance; run k-means refinement in OKLab~~ | Easy | ✅ Implemented as `'oklab-refine'` method |
| **Medium** | Add Wu's quantizer as alternative to median cut | Easy | Better initial palette (variance-minimized splits) |
| **Medium** | Switch to MacQueen's online k-means | Easy | Faster convergence, same quality |
| **Low** | SA/GA palette optimizer behind Web Worker | Moderate | Highest quality for users willing to wait |
| **Skip** | NeuQuant, SCQ, deep learning | — | Wrong fit for pixel art at small palette sizes |

### Biggest Win

**OKLab-space k-means refinement** — a targeted upgrade to the existing pipeline that improves perceptual quality with simpler math than CIELAB.

---

## Key References

- Wu, X. (1991). "Efficient Statistical Computations for Optimal Colour Quantization." Graphics Gems II.
- Dekker, A.H. (1994). "Kohonen neural networks for optimal colour quantization." Network: Computation in Neural Systems.
- Puzicha, J. et al. (2000). "On Spatial Quantization of Color Images." IEEE Trans. Image Processing.
- Arthur, D. & Vassilvitskii, S. (2007). "K-means++: The advantages of careful seeding." SODA.
- Celebi, M.E. (2011). "Improving the performance of k-means for color quantization." Image and Vision Computing.
- Huang, H. et al. (2015). "Efficient, Edge-Aware, Combined Color Quantization and Dithering." IEEE Trans. Image Processing.
- Ottosson, B. (2020). "A perceptual color space for image processing." https://bottosson.github.io/posts/oklab/
- Thompson, S. & Celebi, M.E. (2020). "Fast color quantization using MacQueen's k-means algorithm." J. Real-Time Image Processing.
- Celebi, M.E. (2023). "Forty years of color quantization: a modern, algorithmic survey." Artificial Intelligence Review.

### JS/TS Libraries

- [image-q](https://www.npmjs.com/package/image-q) — NeuQuant, Wu, RGBQuant, CIEDE2000, 11+ dithering methods (TypeScript, MIT)
- [RgbQuant.js](https://github.com/leeoniya/RgbQuant.js) — fast histogram-based quantizer
- [quantize](https://www.npmjs.com/package/quantize) — modified median cut (tiny, fast)
- [libimagequant-wasm](https://github.com/valterkraemer/imagequant-wasm) — pngquant engine via WASM (gold standard quality)
