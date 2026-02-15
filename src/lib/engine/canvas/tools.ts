// ---------------------------------------------------------------------------
// Pure drawing tools — NO DOM, NO Svelte
// ---------------------------------------------------------------------------

import type { Color, PixelChange } from '../../types';

// ---------------------------------------------------------------------------
// Helpers (private)
// ---------------------------------------------------------------------------

function idx(x: number, y: number, width: number): number {
  return (y * width + x) * 4;
}

function inBounds(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}

function readPixel(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
): Color {
  const i = idx(x, y, width);
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

function writePixel(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  color: Color,
): void {
  const i = idx(x, y, width);
  data[i] = color[0];
  data[i + 1] = color[1];
  data[i + 2] = color[2];
  data[i + 3] = color[3];
}

function colorsEqual(a: Color, b: Color): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

function rgbDistance(a: Color, b: Color): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

// ---------------------------------------------------------------------------
// Pencil
// ---------------------------------------------------------------------------

/**
 * Set a single pixel to the given color.
 * Returns a PixelChange describing the before/after, or null if the pixel
 * was already that color or the coordinates are out of bounds.
 */
export function pencilStroke(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  color: Color,
): PixelChange | null {
  if (!inBounds(x, y, width, height)) return null;

  const before = readPixel(data, width, x, y);
  if (colorsEqual(before, color)) return null;

  writePixel(data, width, x, y, color);
  const after: Color = [...color];

  return { x, y, before, after };
}

// ---------------------------------------------------------------------------
// Eraser
// ---------------------------------------------------------------------------

/**
 * Set a single pixel to fully transparent black [0, 0, 0, 0].
 * Returns a PixelChange or null if the pixel was already transparent.
 */
export function eraserStroke(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
): PixelChange | null {
  const transparent: Color = [0, 0, 0, 0];
  return pencilStroke(data, width, height, x, y, transparent);
}

// ---------------------------------------------------------------------------
// Flood fill (BFS)
// ---------------------------------------------------------------------------

/**
 * BFS flood fill starting at (x, y) with the given fill color.
 *
 * - tolerance = 0 (default): exact RGBA match
 * - tolerance > 0: simple RGB distance (Euclidean) is used; pixels whose
 *   distance from the target pixel is <= tolerance are treated as matching.
 *
 * Returns an array of PixelChange for every pixel that was modified.
 */
export function floodFill(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  fillColor: Color,
  tolerance: number = 0,
): PixelChange[] {
  if (!inBounds(x, y, width, height)) return [];

  const targetColor = readPixel(data, width, x, y);

  // If the fill color is the same as the target, nothing to do
  if (colorsEqual(targetColor, fillColor)) return [];

  const changes: PixelChange[] = [];
  const visited = new Uint8Array(width * height);

  const matches = (px: number, py: number): boolean => {
    const c = readPixel(data, width, px, py);
    if (tolerance === 0) {
      return colorsEqual(c, targetColor);
    }
    // For tolerance-based matching, also compare alpha
    const da = c[3] - targetColor[3];
    const dist = Math.sqrt(
      (c[0] - targetColor[0]) ** 2 +
      (c[1] - targetColor[1]) ** 2 +
      (c[2] - targetColor[2]) ** 2 +
      da * da,
    );
    return dist <= tolerance;
  };

  const queue: Array<{ x: number; y: number }> = [{ x, y }];
  visited[y * width + x] = 1;

  while (queue.length > 0) {
    const pos = queue.shift()!;
    const px = pos.x;
    const py = pos.y;

    const before = readPixel(data, width, px, py);
    writePixel(data, width, px, py, fillColor);
    changes.push({ x: px, y: py, before, after: [...fillColor] });

    // 4-connected neighbors
    const neighbors: Array<[number, number]> = [
      [px - 1, py],
      [px + 1, py],
      [px, py - 1],
      [px, py + 1],
    ];

    for (const [nx, ny] of neighbors) {
      if (!inBounds(nx, ny, width, height)) continue;
      const vi = ny * width + nx;
      if (visited[vi]) continue;
      visited[vi] = 1;
      if (matches(nx, ny)) {
        queue.push({ x: nx, y: ny });
      }
    }
  }

  return changes;
}

// ---------------------------------------------------------------------------
// Color picker
// ---------------------------------------------------------------------------

/**
 * Read the color of the pixel at (x, y).
 * Returns [0, 0, 0, 0] for out-of-bounds coordinates.
 */
export function pickColor(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
): Color {
  if (!inBounds(x, y, width, height)) return [0, 0, 0, 0];
  return readPixel(data, width, x, y);
}

// ---------------------------------------------------------------------------
// Bresenham line
// ---------------------------------------------------------------------------

/**
 * Compute all integer pixel coordinates on the line from (x0, y0) to
 * (x1, y1) using the Bresenham line algorithm.
 */
export function bresenhamLine(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];

  let cx = x0;
  let cy = y0;

  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;

  for (;;) {
    points.push({ x: cx, y: cy });

    if (cx === x1 && cy === y1) break;

    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      cx += sx;
    }
    if (e2 <= dx) {
      err += dx;
      cy += sy;
    }
  }

  return points;
}
