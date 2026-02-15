import type { Color } from '../../types';

export interface GridDetectionResult {
  gridSize: number;
  confidence: number;
  candidates: Array<{ size: number; score: number }>;
  logicalWidth: number;
  logicalHeight: number;
}

const COLOR_TOLERANCE = 30;

/**
 * Get RGBA color at pixel (x, y) from a flat Uint8ClampedArray.
 */
function getPixel(data: Uint8ClampedArray, width: number, x: number, y: number): Color {
  const i = (y * width + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

/**
 * Simple RGB distance (ignoring alpha for tolerance checks).
 */
function colorDistance(a: Color, b: Color): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

/**
 * Algorithm 1: Runs-based detection.
 *
 * For each row, scan left-to-right recording same-color run lengths.
 * Build histogram of run lengths. The mode = candidate grid size.
 * Repeat for columns.
 */
function runsBased(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Map<number, number> {
  const histogram = new Map<number, number>();

  // Horizontal runs (per row)
  for (let y = 0; y < height; y++) {
    let runLength = 1;
    let prev = getPixel(data, width, 0, y);
    for (let x = 1; x < width; x++) {
      const cur = getPixel(data, width, x, y);
      if (colorDistance(prev, cur) < COLOR_TOLERANCE) {
        runLength++;
      } else {
        if (runLength >= 2) {
          histogram.set(runLength, (histogram.get(runLength) ?? 0) + 1);
        }
        runLength = 1;
        prev = cur;
      }
    }
    if (runLength >= 2) {
      histogram.set(runLength, (histogram.get(runLength) ?? 0) + 1);
    }
  }

  // Vertical runs (per column)
  for (let x = 0; x < width; x++) {
    let runLength = 1;
    let prev = getPixel(data, width, x, 0);
    for (let y = 1; y < height; y++) {
      const cur = getPixel(data, width, x, y);
      if (colorDistance(prev, cur) < COLOR_TOLERANCE) {
        runLength++;
      } else {
        if (runLength >= 2) {
          histogram.set(runLength, (histogram.get(runLength) ?? 0) + 1);
        }
        runLength = 1;
        prev = cur;
      }
    }
    if (runLength >= 2) {
      histogram.set(runLength, (histogram.get(runLength) ?? 0) + 1);
    }
  }

  return histogram;
}

/**
 * Find mode of a histogram, optionally filtering to divisors of given dimensions.
 */
function histogramMode(histogram: Map<number, number>): number {
  let bestSize = 1;
  let bestCount = 0;
  for (const [size, count] of histogram) {
    if (count > bestCount) {
      bestCount = count;
      bestSize = size;
    }
  }
  return bestSize;
}

/**
 * Algorithm 2: Edge-aware validation.
 *
 * Compute horizontal and vertical gradients.
 * For candidate grid sizes 2..32, compute a "grid score":
 *   sum of gradients at multiples of G / sum of all gradients.
 * Higher score = edges align more strongly with the grid.
 */
function edgeAwareScores(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  minG: number = 2,
  maxG: number = 32,
): Map<number, number> {
  // Compute horizontal gradient for each pixel boundary
  // gradient[y][x] = |pixel[x] - pixel[x+1]| summed across RGB
  const hGradients: number[] = new Array(height * (width - 1));
  let totalHGradient = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) {
      const a = getPixel(data, width, x, y);
      const b = getPixel(data, width, x + 1, y);
      const g = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
      hGradients[y * (width - 1) + x] = g;
      totalHGradient += g;
    }
  }

  // Compute vertical gradient
  const vGradients: number[] = new Array((height - 1) * width);
  let totalVGradient = 0;

  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width; x++) {
      const a = getPixel(data, width, x, y);
      const b = getPixel(data, width, x, y + 1);
      const g = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
      vGradients[y * width + x] = g;
      totalVGradient += g;
    }
  }

  const totalGradient = totalHGradient + totalVGradient;
  const scores = new Map<number, number>();

  if (totalGradient === 0) {
    // Uniform image — every grid size is equally valid, score them all 0
    for (let g = minG; g <= maxG; g++) {
      scores.set(g, 0);
    }
    return scores;
  }

  const effectiveMaxG = Math.min(maxG, Math.max(width, height));

  for (let g = minG; g <= effectiveMaxG; g++) {
    let gridGradient = 0;

    // Horizontal edges at column boundaries that are multiples of g.
    // A grid boundary at column g means the edge between pixel (g-1) and pixel g,
    // which is hGradients index (g-1) in each row.
    for (let y = 0; y < height; y++) {
      for (let col = g; col < width; col += g) {
        // Edge between pixel col-1 and col
        const idx = y * (width - 1) + (col - 1);
        gridGradient += hGradients[idx];
      }
    }

    // Vertical edges at row boundaries that are multiples of g.
    for (let x = 0; x < width; x++) {
      for (let row = g; row < height; row += g) {
        const idx = (row - 1) * width + x;
        gridGradient += vGradients[idx];
      }
    }

    scores.set(g, gridGradient / totalGradient);
  }

  return scores;
}

/**
 * Detect the grid size of a pixel art image from raw RGBA pixel data.
 *
 * Combines runs-based detection (for initial candidates) with
 * edge-aware validation (to confirm / re-rank).
 */
export function detectGridSize(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): GridDetectionResult {
  // Edge case: tiny images
  if (width <= 1 || height <= 1) {
    return {
      gridSize: 1,
      confidence: 1,
      candidates: [{ size: 1, score: 1 }],
      logicalWidth: width,
      logicalHeight: height,
    };
  }

  // Step 1: Runs-based histogram
  const runsHistogram = runsBased(data, width, height);
  const runsMode = histogramMode(runsHistogram);

  // Step 2: Edge-aware scores
  const edgeScores = edgeAwareScores(data, width, height);

  // Step 3: Combine scores
  // Normalize runs histogram to create a score per candidate
  const totalRuns = Array.from(runsHistogram.values()).reduce((a, b) => a + b, 0) || 1;
  const combined = new Map<number, number>();

  // Consider candidates from both sources
  const allCandidates = new Set<number>();
  for (const size of runsHistogram.keys()) {
    if (size >= 2 && size <= Math.max(width, height)) allCandidates.add(size);
  }
  for (const size of edgeScores.keys()) {
    allCandidates.add(size);
  }
  // Always include size 1
  allCandidates.add(1);

  for (const size of allCandidates) {
    const runsScore = (runsHistogram.get(size) ?? 0) / totalRuns;
    const edgeScore = edgeScores.get(size) ?? 0;
    // Weight: 40% runs, 60% edge-aware
    combined.set(size, runsScore * 0.4 + edgeScore * 0.6);
  }

  // Sort by combined score descending
  const sorted = Array.from(combined.entries())
    .sort((a, b) => b[1] - a[1]);

  // Top 3 candidates
  const top3 = sorted.slice(0, 3).map(([size, score]) => ({ size, score }));

  // Best candidate
  const bestSize = top3.length > 0 ? top3[0].size : 1;
  const bestScore = top3.length > 0 ? top3[0].score : 0;

  // Compute confidence:
  // - Runs mode agrees with edge-aware best → high confidence
  // - Score separation between #1 and #2 contributes to confidence
  let confidence: number;
  const runsAgreement = runsMode === bestSize ? 0.3 : 0;
  const secondScore = top3.length > 1 ? top3[1].score : 0;
  const separation = bestScore > 0 ? (bestScore - secondScore) / bestScore : 0;
  confidence = Math.min(1, runsAgreement + separation * 0.5 + bestScore * 0.5);

  // Clamp confidence to [0, 1]
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    gridSize: bestSize,
    confidence,
    candidates: top3,
    logicalWidth: Math.floor(width / bestSize),
    logicalHeight: Math.floor(height / bestSize),
  };
}
