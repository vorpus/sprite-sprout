import type { Color } from '../../types';

export interface SnapResult {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Get RGBA color at pixel (x, y) from a flat Uint8ClampedArray.
 */
function getPixel(data: Uint8ClampedArray, width: number, x: number, y: number): Color {
  const i = (y * width + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

/**
 * Snap a pixel art image to its logical grid resolution using majority-vote
 * per grid block, with weighted-center fallback.
 *
 * @param source       Raw RGBA pixel data of the source image
 * @param sourceWidth  Width of source image in pixels
 * @param sourceHeight Height of source image in pixels
 * @param gridSize     Size of each grid cell in source pixels
 * @returns            Snapped image at logical (downscaled) resolution
 */
export function snapToGrid(
  source: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  gridSize: number,
): SnapResult {
  if (gridSize < 1) {
    throw new Error(`gridSize must be >= 1, got ${gridSize}`);
  }

  // Grid size 1 means each pixel is already at logical resolution
  if (gridSize === 1) {
    const copy = new Uint8ClampedArray(source);
    return { data: copy, width: sourceWidth, height: sourceHeight };
  }

  const logicalWidth = Math.floor(sourceWidth / gridSize);
  const logicalHeight = Math.floor(sourceHeight / gridSize);

  if (logicalWidth <= 0 || logicalHeight <= 0) {
    throw new Error(
      `Grid size ${gridSize} is too large for ${sourceWidth}x${sourceHeight} image`,
    );
  }

  const output = new Uint8ClampedArray(logicalWidth * logicalHeight * 4);
  const blockPixelCount = gridSize * gridSize;
  const halfBlock = (gridSize - 1) / 2; // center of the block

  for (let ly = 0; ly < logicalHeight; ly++) {
    for (let lx = 0; lx < logicalWidth; lx++) {
      const blockStartX = lx * gridSize;
      const blockStartY = ly * gridSize;

      // Collect colors in this block with frequency map
      // Key: (r << 16) | (g << 8) | b   (alpha handled separately)
      const colorFreq = new Map<number, { count: number; r: number; g: number; b: number; a: number }>();

      for (let dy = 0; dy < gridSize; dy++) {
        for (let dx = 0; dx < gridSize; dx++) {
          const sx = blockStartX + dx;
          const sy = blockStartY + dy;
          if (sx >= sourceWidth || sy >= sourceHeight) continue;

          const [r, g, b, a] = getPixel(source, sourceWidth, sx, sy);
          const key = (r << 16) | (g << 8) | b;

          const entry = colorFreq.get(key);
          if (entry) {
            entry.count++;
            // Accumulate alpha for averaging
            entry.a += a;
          } else {
            colorFreq.set(key, { count: 1, r, g, b, a });
          }
        }
      }

      // Majority vote: find color with > 50% of pixels
      let chosenR = 0;
      let chosenG = 0;
      let chosenB = 0;
      let chosenA = 0;
      let found = false;

      const majorityThreshold = blockPixelCount * 0.5;

      for (const [, entry] of colorFreq) {
        if (entry.count > majorityThreshold) {
          chosenR = entry.r;
          chosenG = entry.g;
          chosenB = entry.b;
          chosenA = Math.round(entry.a / entry.count);
          found = true;
          break;
        }
      }

      // Fallback: weighted by distance from block center
      if (!found) {
        let totalWeight = 0;
        let wR = 0;
        let wG = 0;
        let wB = 0;
        let wA = 0;

        for (let dy = 0; dy < gridSize; dy++) {
          for (let dx = 0; dx < gridSize; dx++) {
            const sx = blockStartX + dx;
            const sy = blockStartY + dy;
            if (sx >= sourceWidth || sy >= sourceHeight) continue;

            const [r, g, b, a] = getPixel(source, sourceWidth, sx, sy);

            // Distance from center of the block (Manhattan or Euclidean).
            // Using inverse Euclidean distance as weight; center pixels matter more.
            const distX = dx - halfBlock;
            const distY = dy - halfBlock;
            const dist = Math.sqrt(distX * distX + distY * distY);
            // Weight: inverse distance, with a minimum to avoid division by zero
            const weight = 1 / (1 + dist);

            wR += r * weight;
            wG += g * weight;
            wB += b * weight;
            wA += a * weight;
            totalWeight += weight;
          }
        }

        if (totalWeight > 0) {
          chosenR = Math.round(wR / totalWeight);
          chosenG = Math.round(wG / totalWeight);
          chosenB = Math.round(wB / totalWeight);
          chosenA = Math.round(wA / totalWeight);
        }
      }

      // Write to output
      const outIdx = (ly * logicalWidth + lx) * 4;
      output[outIdx] = chosenR;
      output[outIdx + 1] = chosenG;
      output[outIdx + 2] = chosenB;
      output[outIdx + 3] = chosenA;
    }
  }

  return { data: output, width: logicalWidth, height: logicalHeight };
}
