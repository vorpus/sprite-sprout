import { describe, it, expect } from 'vitest';
import { detectGridSize } from './detect';
import { snapToGrid } from './snap';

// ---------- helpers ----------

/**
 * Create an RGBA Uint8ClampedArray of size width x height filled with a
 * solid color per "logical pixel" on a given grid.
 *
 * `colorFn(lx, ly)` returns the RGBA color for logical pixel (lx, ly).
 */
function makeSyntheticImage(
  logicalW: number,
  logicalH: number,
  gridSize: number,
  colorFn: (lx: number, ly: number) => [number, number, number, number],
): { data: Uint8ClampedArray; width: number; height: number } {
  const width = logicalW * gridSize;
  const height = logicalH * gridSize;
  const data = new Uint8ClampedArray(width * height * 4);

  for (let ly = 0; ly < logicalH; ly++) {
    for (let lx = 0; lx < logicalW; lx++) {
      const [r, g, b, a] = colorFn(lx, ly);
      for (let dy = 0; dy < gridSize; dy++) {
        for (let dx = 0; dx < gridSize; dx++) {
          const px = lx * gridSize + dx;
          const py = ly * gridSize + dy;
          const i = (py * width + px) * 4;
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
          data[i + 3] = a;
        }
      }
    }
  }

  return { data, width, height };
}

/**
 * Simple checkerboard-like color function: alternating bright colors.
 */
function checkerboard(lx: number, ly: number): [number, number, number, number] {
  if ((lx + ly) % 2 === 0) {
    return [255, 0, 0, 255]; // red
  }
  return [0, 0, 255, 255]; // blue
}

/**
 * Distinct color per logical pixel (using simple hashing).
 */
function distinctColors(lx: number, ly: number): [number, number, number, number] {
  const r = ((lx * 73 + ly * 137) % 200) + 30;
  const g = ((lx * 47 + ly * 89) % 200) + 30;
  const b = ((lx * 113 + ly * 53) % 200) + 30;
  return [r, g, b, 255];
}

// ---------- detectGridSize tests ----------

describe('detectGridSize', () => {
  it('detects 4x4 grid in a 12x12 image (3x3 logical pixels)', () => {
    const { data, width, height } = makeSyntheticImage(3, 3, 4, checkerboard);
    expect(width).toBe(12);
    expect(height).toBe(12);

    const result = detectGridSize(data, width, height);

    expect(result.gridSize).toBe(4);
    expect(result.logicalWidth).toBe(3);
    expect(result.logicalHeight).toBe(3);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.candidates.length).toBeGreaterThanOrEqual(1);
    expect(result.candidates.length).toBeLessThanOrEqual(3);
  });

  it('detects 8x8 grid in a 16x16 image (2x2 logical pixels)', () => {
    const { data, width, height } = makeSyntheticImage(2, 2, 8, checkerboard);
    expect(width).toBe(16);
    expect(height).toBe(16);

    const result = detectGridSize(data, width, height);

    expect(result.gridSize).toBe(8);
    expect(result.logicalWidth).toBe(2);
    expect(result.logicalHeight).toBe(2);
  });

  it('detects grid with distinct colors per logical pixel', () => {
    const { data, width, height } = makeSyntheticImage(4, 4, 4, distinctColors);
    expect(width).toBe(16);
    expect(height).toBe(16);

    const result = detectGridSize(data, width, height);

    expect(result.gridSize).toBe(4);
    expect(result.logicalWidth).toBe(4);
    expect(result.logicalHeight).toBe(4);
  });

  it('returns candidates array with at most 3 entries', () => {
    const { data, width, height } = makeSyntheticImage(3, 3, 4, checkerboard);
    const result = detectGridSize(data, width, height);
    expect(result.candidates.length).toBeLessThanOrEqual(3);

    // Each candidate has size and score
    for (const c of result.candidates) {
      expect(typeof c.size).toBe('number');
      expect(typeof c.score).toBe('number');
    }
  });

  it('handles a 1x1 image gracefully', () => {
    const data = new Uint8ClampedArray([128, 64, 32, 255]);
    const result = detectGridSize(data, 1, 1);
    expect(result.gridSize).toBe(1);
    expect(result.logicalWidth).toBe(1);
    expect(result.logicalHeight).toBe(1);
    expect(result.confidence).toBe(1);
  });

  it('returns confidence between 0 and 1', () => {
    const { data, width, height } = makeSyntheticImage(3, 3, 4, checkerboard);
    const result = detectGridSize(data, width, height);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});

// ---------- snapToGrid tests ----------

describe('snapToGrid', () => {
  it('produces correct dimensions for a 12x12 image with gridSize 4', () => {
    const { data, width, height } = makeSyntheticImage(3, 3, 4, checkerboard);
    const result = snapToGrid(data, width, height, 4);
    expect(result.width).toBe(3);
    expect(result.height).toBe(3);
    expect(result.data.length).toBe(3 * 3 * 4);
  });

  it('majority vote picks the dominant color', () => {
    // Create a 4x4 block where 12 of 16 pixels are red, 4 are blue
    const width = 4;
    const height = 4;
    const data = new Uint8ClampedArray(width * height * 4);

    // Fill all red
    for (let i = 0; i < width * height; i++) {
      data[i * 4] = 255;     // R
      data[i * 4 + 1] = 0;   // G
      data[i * 4 + 2] = 0;   // B
      data[i * 4 + 3] = 255; // A
    }

    // Set 4 pixels to blue (still minority)
    for (let i = 0; i < 4; i++) {
      data[i * 4] = 0;
      data[i * 4 + 1] = 0;
      data[i * 4 + 2] = 255;
      data[i * 4 + 3] = 255;
    }

    const result = snapToGrid(data, width, height, 4);
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);

    // Majority is red (12 out of 16 = 75%)
    expect(result.data[0]).toBe(255); // R
    expect(result.data[1]).toBe(0);   // G
    expect(result.data[2]).toBe(0);   // B
    expect(result.data[3]).toBe(255); // A
  });

  it('weighted-center fallback when no majority', () => {
    // Create a 4x4 block with many distinct colors (no single color > 50%)
    const width = 4;
    const height = 4;
    const data = new Uint8ClampedArray(width * height * 4);

    // Fill each pixel with a different color
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        data[i] = x * 60;
        data[i + 1] = y * 60;
        data[i + 2] = (x + y) * 30;
        data[i + 3] = 255;
      }
    }

    const result = snapToGrid(data, width, height, 4);
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
    // Should produce some valid color (not black/zero by coincidence with these values)
    // Center pixels (1,1), (2,1), (1,2), (2,2) are weighted more heavily
    expect(result.data[3]).toBe(255); // Alpha should be 255
  });

  it('gridSize = 1 returns a copy of the source', () => {
    const data = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]);
    const result = snapToGrid(data, 2, 1, 1);
    expect(result.width).toBe(2);
    expect(result.height).toBe(1);
    expect(result.data).toEqual(data);
    // Should be a copy, not the same reference
    expect(result.data).not.toBe(data);
  });

  it('handles non-divisible dimensions by truncating', () => {
    // 10x10 image with gridSize 4 => logical 2x2 (last 2 pixel columns/rows ignored)
    const { data } = makeSyntheticImage(3, 3, 4, checkerboard);
    // Pretend it's a 10x10 by taking a 10x10 slice (we have a 12x12 source)
    const srcWidth = 12;
    const srcHeight = 12;

    // Use the 12x12 data but tell snap it's 10x10 by providing correct width
    // Actually let's just create a 10x10 image directly
    const w = 10;
    const h = 10;
    const smallData = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        smallData[i] = (x < 4 || (x >= 8 && x < 10)) ? 255 : 0;
        smallData[i + 1] = 0;
        smallData[i + 2] = (x >= 4 && x < 8) ? 255 : 0;
        smallData[i + 3] = 255;
      }
    }

    const result = snapToGrid(smallData, w, h, 4);
    expect(result.width).toBe(2);  // floor(10/4) = 2
    expect(result.height).toBe(2); // floor(10/4) = 2
    expect(result.data.length).toBe(2 * 2 * 4);
  });

  it('preserves exact colors in a clean grid', () => {
    const { data, width, height } = makeSyntheticImage(3, 3, 4, checkerboard);
    const result = snapToGrid(data, width, height, 4);

    // Verify each logical pixel matches the expected checkerboard color
    for (let ly = 0; ly < 3; ly++) {
      for (let lx = 0; lx < 3; lx++) {
        const i = (ly * 3 + lx) * 4;
        const expected = checkerboard(lx, ly);
        expect(result.data[i]).toBe(expected[0]);     // R
        expect(result.data[i + 1]).toBe(expected[1]); // G
        expect(result.data[i + 2]).toBe(expected[2]); // B
        expect(result.data[i + 3]).toBe(expected[3]); // A
      }
    }
  });

  it('throws for gridSize < 1', () => {
    const data = new Uint8ClampedArray(16);
    expect(() => snapToGrid(data, 2, 2, 0)).toThrow();
  });

  it('throws when grid size is larger than the image', () => {
    const data = new Uint8ClampedArray(4 * 4 * 4);
    expect(() => snapToGrid(data, 4, 4, 8)).toThrow();
  });
});
