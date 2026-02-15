import { describe, it, expect } from 'vitest';
import {
  pencilStroke,
  eraserStroke,
  floodFill,
  pickColor,
  bresenhamLine,
} from './tools';
import type { Color } from '../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a blank (transparent) pixel buffer of the given dimensions. */
function makeBuffer(width: number, height: number): Uint8ClampedArray {
  return new Uint8ClampedArray(width * height * 4);
}

/** Build a buffer from an array of RGBA tuples (row-major). */
function makeBufferFrom(pixels: Color[], width: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(pixels.length * 4);
  for (let i = 0; i < pixels.length; i++) {
    data[i * 4] = pixels[i][0];
    data[i * 4 + 1] = pixels[i][1];
    data[i * 4 + 2] = pixels[i][2];
    data[i * 4 + 3] = pixels[i][3];
  }
  return data;
}

/** Read a pixel from a buffer as a Color tuple. */
function readPx(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
): Color {
  const i = (y * width + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

// ---------------------------------------------------------------------------
// pencilStroke
// ---------------------------------------------------------------------------

describe('pencilStroke', () => {
  it('sets a pixel and returns correct before/after', () => {
    const w = 4;
    const h = 4;
    const data = makeBuffer(w, h);
    const color: Color = [255, 0, 0, 255];

    const change = pencilStroke(data, w, h, 2, 1, color);

    expect(change).not.toBeNull();
    expect(change!.x).toBe(2);
    expect(change!.y).toBe(1);
    expect(change!.before).toEqual([0, 0, 0, 0]);
    expect(change!.after).toEqual([255, 0, 0, 255]);

    // Verify the buffer was actually mutated
    expect(readPx(data, w, 2, 1)).toEqual([255, 0, 0, 255]);
  });

  it('returns null if the pixel already has the same color', () => {
    const w = 2;
    const h = 2;
    const data = makeBuffer(w, h);
    const color: Color = [100, 200, 50, 255];

    pencilStroke(data, w, h, 0, 0, color);
    const second = pencilStroke(data, w, h, 0, 0, color);

    expect(second).toBeNull();
  });

  it('returns null for out-of-bounds coordinates', () => {
    const data = makeBuffer(2, 2);
    expect(pencilStroke(data, 2, 2, -1, 0, [0, 0, 0, 255])).toBeNull();
    expect(pencilStroke(data, 2, 2, 0, 5, [0, 0, 0, 255])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// eraserStroke
// ---------------------------------------------------------------------------

describe('eraserStroke', () => {
  it('sets a pixel to transparent', () => {
    const w = 3;
    const h = 3;
    const data = makeBuffer(w, h);

    // First paint a pixel
    pencilStroke(data, w, h, 1, 1, [255, 128, 0, 255]);
    expect(readPx(data, w, 1, 1)).toEqual([255, 128, 0, 255]);

    // Then erase it
    const change = eraserStroke(data, w, h, 1, 1);

    expect(change).not.toBeNull();
    expect(change!.before).toEqual([255, 128, 0, 255]);
    expect(change!.after).toEqual([0, 0, 0, 0]);
    expect(readPx(data, w, 1, 1)).toEqual([0, 0, 0, 0]);
  });

  it('returns null if the pixel is already transparent', () => {
    const data = makeBuffer(2, 2);
    expect(eraserStroke(data, 2, 2, 0, 0)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// floodFill
// ---------------------------------------------------------------------------

describe('floodFill', () => {
  it('fills a connected same-color region', () => {
    // 4x4 all-white canvas
    const w = 4;
    const h = 4;
    const white: Color = [255, 255, 255, 255];
    const pixels = Array(w * h).fill(white) as Color[];
    const data = makeBufferFrom(pixels, w);

    const red: Color = [255, 0, 0, 255];
    const changes = floodFill(data, w, h, 0, 0, red);

    // All 16 pixels should have been filled
    expect(changes.length).toBe(16);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        expect(readPx(data, w, x, y)).toEqual(red);
      }
    }
  });

  it('does not cross color boundaries', () => {
    // 4x4 canvas: left half white, right half black
    const w = 4;
    const h = 4;
    const white: Color = [255, 255, 255, 255];
    const black: Color = [0, 0, 0, 255];
    const pixels: Color[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        pixels.push(x < 2 ? white : black);
      }
    }
    const data = makeBufferFrom(pixels, w);

    const red: Color = [255, 0, 0, 255];
    const changes = floodFill(data, w, h, 0, 0, red);

    // Only the left half (8 pixels) should be filled
    expect(changes.length).toBe(8);

    for (let y = 0; y < h; y++) {
      // Left side: red
      expect(readPx(data, w, 0, y)).toEqual(red);
      expect(readPx(data, w, 1, y)).toEqual(red);
      // Right side: still black
      expect(readPx(data, w, 2, y)).toEqual(black);
      expect(readPx(data, w, 3, y)).toEqual(black);
    }
  });

  it('returns empty array if fill color matches target', () => {
    const w = 2;
    const h = 2;
    const red: Color = [255, 0, 0, 255];
    const pixels = Array(4).fill(red) as Color[];
    const data = makeBufferFrom(pixels, w);

    const changes = floodFill(data, w, h, 0, 0, red);
    expect(changes).toEqual([]);
  });

  it('returns empty array for out-of-bounds start', () => {
    const data = makeBuffer(2, 2);
    expect(floodFill(data, 2, 2, -1, 0, [255, 0, 0, 255])).toEqual([]);
  });

  it('fills with tolerance', () => {
    // 3x1: slightly different shades of red
    const w = 3;
    const h = 1;
    const pixels: Color[] = [
      [255, 0, 0, 255],
      [250, 5, 5, 255],
      [0, 0, 255, 255], // blue — should NOT be filled
    ];
    const data = makeBufferFrom(pixels, w);

    const green: Color = [0, 255, 0, 255];
    const changes = floodFill(data, w, h, 0, 0, green, 15);

    // First two pixels should be filled, blue should not
    expect(changes.length).toBe(2);
    expect(readPx(data, w, 0, 0)).toEqual(green);
    expect(readPx(data, w, 1, 0)).toEqual(green);
    expect(readPx(data, w, 2, 0)).toEqual([0, 0, 255, 255]);
  });
});

// ---------------------------------------------------------------------------
// pickColor
// ---------------------------------------------------------------------------

describe('pickColor', () => {
  it('reads the correct pixel color', () => {
    const w = 3;
    const h = 2;
    const pixels: Color[] = [
      [10, 20, 30, 255],
      [40, 50, 60, 128],
      [70, 80, 90, 0],
      [100, 110, 120, 255],
      [130, 140, 150, 255],
      [160, 170, 180, 255],
    ];
    const data = makeBufferFrom(pixels, w);

    expect(pickColor(data, w, h, 0, 0)).toEqual([10, 20, 30, 255]);
    expect(pickColor(data, w, h, 1, 0)).toEqual([40, 50, 60, 128]);
    expect(pickColor(data, w, h, 2, 0)).toEqual([70, 80, 90, 0]);
    expect(pickColor(data, w, h, 0, 1)).toEqual([100, 110, 120, 255]);
    expect(pickColor(data, w, h, 2, 1)).toEqual([160, 170, 180, 255]);
  });

  it('returns transparent black for out-of-bounds', () => {
    const data = makeBuffer(2, 2);
    expect(pickColor(data, 2, 2, -1, 0)).toEqual([0, 0, 0, 0]);
    expect(pickColor(data, 2, 2, 0, 10)).toEqual([0, 0, 0, 0]);
  });
});

// ---------------------------------------------------------------------------
// bresenhamLine
// ---------------------------------------------------------------------------

describe('bresenhamLine', () => {
  it('produces correct points for a horizontal line', () => {
    const points = bresenhamLine(0, 0, 4, 0);
    expect(points).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
    ]);
  });

  it('produces correct points for a vertical line', () => {
    const points = bresenhamLine(2, 0, 2, 3);
    expect(points).toEqual([
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 2, y: 3 },
    ]);
  });

  it('produces correct points for a diagonal line (45 degrees)', () => {
    const points = bresenhamLine(0, 0, 3, 3);
    expect(points).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ]);
  });

  it('handles a single-point line', () => {
    const points = bresenhamLine(5, 5, 5, 5);
    expect(points).toEqual([{ x: 5, y: 5 }]);
  });

  it('handles negative direction (right to left)', () => {
    const points = bresenhamLine(3, 0, 0, 0);
    expect(points).toEqual([
      { x: 3, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 0 },
    ]);
  });

  it('handles a steep line (more vertical than horizontal)', () => {
    const points = bresenhamLine(0, 0, 1, 4);
    // Should have 5 points for the longer axis
    expect(points.length).toBe(5);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points[points.length - 1]).toEqual({ x: 1, y: 4 });
  });
});
