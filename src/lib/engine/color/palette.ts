import type { Color } from '../../types';

/**
 * Extract unique opaque colors from raw RGBA pixel data and count their occurrences.
 * Fully transparent pixels (alpha === 0) are skipped.
 * The map key is (r << 16) | (g << 8) | b.
 */
export function extractColors(data: Uint8ClampedArray): Map<number, number> {
  const map = new Map<number, number>();
  const len = data.length;

  for (let i = 0; i < len; i += 4) {
    const a = data[i + 3];
    if (a === 0) continue; // skip fully transparent pixels

    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    map.set(key, (map.get(key) ?? 0) + 1);
  }

  return map;
}

/**
 * Get the N most frequent colors as RGBA tuples (alpha = 255).
 * Fully transparent pixels are excluded.
 */
export function extractTopColors(
  data: Uint8ClampedArray,
  maxColors: number,
): Color[] {
  const colorMap = extractColors(data);

  // Sort entries by count descending
  const sorted = [...colorMap.entries()].sort((a, b) => b[1] - a[1]);

  const result: Color[] = [];
  const count = Math.min(maxColors, sorted.length);

  for (let i = 0; i < count; i++) {
    const key = sorted[i][0];
    const r = (key >> 16) & 0xff;
    const g = (key >> 8) & 0xff;
    const b = key & 0xff;
    result.push([r, g, b, 255]);
  }

  return result;
}
