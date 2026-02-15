import type { Color } from '../../types';
import { rgbToLab, deltaE } from './distance';

/**
 * Find the index of the nearest palette color to the given RGB, using Delta E
 * in CIELAB space for perceptual accuracy.
 */
function nearestPaletteIndex(
  r: number,
  g: number,
  b: number,
  paletteLabs: [number, number, number][],
): number {
  const lab = rgbToLab(r, g, b);
  let bestIndex = 0;
  let bestDist = Infinity;

  for (let i = 0; i < paletteLabs.length; i++) {
    const dist = deltaE(lab, paletteLabs[i]);
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = i;
    }
  }

  return bestIndex;
}

/**
 * Remap every pixel in the image data to the nearest color in the palette,
 * using Delta E (CIELAB) for perceptual distance.
 *
 * Fully transparent pixels (alpha === 0) are preserved as-is.
 * Returns a new Uint8ClampedArray with the same dimensions.
 */
export function remapToPalette(
  data: Uint8ClampedArray,
  palette: Color[],
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(data.length);

  if (palette.length === 0) {
    return result;
  }

  // Pre-compute LAB values for the palette
  const paletteLabs: [number, number, number][] = palette.map((c) =>
    rgbToLab(c[0], c[1], c[2]),
  );

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) {
      // Preserve fully transparent pixels
      result[i] = 0;
      result[i + 1] = 0;
      result[i + 2] = 0;
      result[i + 3] = 0;
      continue;
    }

    const idx = nearestPaletteIndex(data[i], data[i + 1], data[i + 2], paletteLabs);
    const color = palette[idx];

    result[i] = color[0];
    result[i + 1] = color[1];
    result[i + 2] = color[2];
    result[i + 3] = data[i + 3]; // preserve original alpha for semi-transparent pixels
  }

  return result;
}

/**
 * Merge two palette entries by averaging them. Returns a new palette array
 * with indexB removed and indexA replaced by the averaged color.
 *
 * The merged color's alpha is the average of both entries' alpha values.
 */
export function mergePaletteColors(
  palette: Color[],
  indexA: number,
  indexB: number,
): Color[] {
  if (indexA === indexB) return [...palette.map((c) => [...c] as Color)];
  if (indexA < 0 || indexA >= palette.length) throw new RangeError('indexA out of bounds');
  if (indexB < 0 || indexB >= palette.length) throw new RangeError('indexB out of bounds');

  const a = palette[indexA];
  const b = palette[indexB];

  const merged: Color = [
    Math.round((a[0] + b[0]) / 2),
    Math.round((a[1] + b[1]) / 2),
    Math.round((a[2] + b[2]) / 2),
    Math.round((a[3] + b[3]) / 2),
  ];

  const result: Color[] = [];
  for (let i = 0; i < palette.length; i++) {
    if (i === indexB) continue; // remove entry B
    if (i === indexA) {
      result.push(merged);
    } else {
      result.push([...palette[i]] as Color);
    }
  }

  return result;
}
