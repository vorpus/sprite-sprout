import type { Color } from '../../types';
import { rgbToLab, deltaE } from './distance';

export interface QuantizeResult {
  palette: Color[];
  indexedData: Uint8Array;
  remappedData: Uint8ClampedArray;
}

/**
 * Refine a palette using k-means clustering in CIELAB space.
 * Takes existing image data and an initial palette, returns a refined palette
 * and remapped pixel data.
 *
 * @param data - Source RGBA pixel data
 * @param width - Image width
 * @param height - Image height
 * @param initialPalette - Starting palette (e.g. from octree quantizer)
 * @param maxIterations - Max k-means iterations (default 3, good enough for refinement)
 * @returns Refined QuantizeResult with optimized palette
 */
export function refineWithKMeans(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  initialPalette: Color[],
  maxIterations: number = 3,
): QuantizeResult {
  const pixelCount = width * height;
  const k = initialPalette.length;

  // Empty palette — return empty result
  if (k === 0) {
    return {
      palette: [],
      indexedData: new Uint8Array(pixelCount),
      remappedData: new Uint8ClampedArray(data.length),
    };
  }

  // --- Pre-compute LAB values for all opaque pixels ---
  // Store per-pixel: LAB values and whether the pixel is opaque.
  // For transparent pixels we skip them in clustering.
  const pixelLabs = new Float64Array(pixelCount * 3);
  const opaque = new Uint8Array(pixelCount); // 1 = opaque, 0 = transparent

  for (let p = 0; p < pixelCount; p++) {
    const i = p * 4;
    if (data[i + 3] === 0) {
      // transparent — leave opaque[p] = 0, lab values don't matter
      continue;
    }
    opaque[p] = 1;
    const lab = rgbToLab(data[i], data[i + 1], data[i + 2]);
    pixelLabs[p * 3] = lab[0];
    pixelLabs[p * 3 + 1] = lab[1];
    pixelLabs[p * 3 + 2] = lab[2];
  }

  // --- Working copy of the palette (RGB) and its LAB representation ---
  const palette: Color[] = initialPalette.map(
    (c) => [c[0], c[1], c[2], c[3]] as Color,
  );
  const paletteLabs: [number, number, number][] = palette.map((c) =>
    rgbToLab(c[0], c[1], c[2]),
  );

  // Per-pixel cluster assignment
  const assignments = new Uint8Array(pixelCount);

  // --- K-means loop ---
  for (let iter = 0; iter < maxIterations; iter++) {
    // ---- Assign step ----
    // For each opaque pixel, find nearest palette entry by Delta E
    for (let p = 0; p < pixelCount; p++) {
      if (!opaque[p]) continue;

      const pL = pixelLabs[p * 3];
      const pA = pixelLabs[p * 3 + 1];
      const pB = pixelLabs[p * 3 + 2];

      let bestIdx = 0;
      let bestDist = Infinity;

      for (let c = 0; c < k; c++) {
        const dist = deltaE(
          [pL, pA, pB],
          paletteLabs[c],
        );
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = c;
        }
      }

      assignments[p] = bestIdx;
    }

    // ---- Update step ----
    // Compute new centroids as mean RGB of assigned pixels
    const rSums = new Float64Array(k);
    const gSums = new Float64Array(k);
    const bSums = new Float64Array(k);
    const counts = new Uint32Array(k);

    for (let p = 0; p < pixelCount; p++) {
      if (!opaque[p]) continue;
      const cluster = assignments[p];
      const i = p * 4;
      rSums[cluster] += data[i];
      gSums[cluster] += data[i + 1];
      bSums[cluster] += data[i + 2];
      counts[cluster]++;
    }

    let converged = true;

    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) {
        // No pixels assigned — keep old palette color
        continue;
      }

      const newR = Math.round(rSums[c] / counts[c]);
      const newG = Math.round(gSums[c] / counts[c]);
      const newB = Math.round(bSums[c] / counts[c]);

      // Check convergence: did any channel change by more than 1?
      if (
        Math.abs(newR - palette[c][0]) > 1 ||
        Math.abs(newG - palette[c][1]) > 1 ||
        Math.abs(newB - palette[c][2]) > 1
      ) {
        converged = false;
      }

      palette[c][0] = newR;
      palette[c][1] = newG;
      palette[c][2] = newB;
      palette[c][3] = 255;

      // Update LAB cache for this palette entry
      paletteLabs[c] = rgbToLab(newR, newG, newB);
    }

    if (converged) break;
  }

  // --- Final assignment pass ---
  // Build indexedData and remappedData from the refined palette
  const indexedData = new Uint8Array(pixelCount);
  const remappedData = new Uint8ClampedArray(data.length);

  for (let p = 0; p < pixelCount; p++) {
    const i = p * 4;

    if (!opaque[p]) {
      // Transparent pixel — preserve as [0,0,0,0]
      indexedData[p] = 0;
      remappedData[i] = 0;
      remappedData[i + 1] = 0;
      remappedData[i + 2] = 0;
      remappedData[i + 3] = 0;
      continue;
    }

    // Find nearest palette entry for this pixel
    const pL = pixelLabs[p * 3];
    const pA = pixelLabs[p * 3 + 1];
    const pB = pixelLabs[p * 3 + 2];

    let bestIdx = 0;
    let bestDist = Infinity;

    for (let c = 0; c < k; c++) {
      const dist = deltaE([pL, pA, pB], paletteLabs[c]);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = c;
      }
    }

    indexedData[p] = bestIdx;
    remappedData[i] = palette[bestIdx][0];
    remappedData[i + 1] = palette[bestIdx][1];
    remappedData[i + 2] = palette[bestIdx][2];
    remappedData[i + 3] = 255;
  }

  return { palette, indexedData, remappedData };
}
