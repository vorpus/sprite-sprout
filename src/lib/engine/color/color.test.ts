import { describe, it, expect } from 'vitest';
import { rgbToLab, deltaE, rgbDeltaE } from './distance';
import { extractColors, extractTopColors } from './palette';
import { octreeQuantize } from './quantize';
import { remapToPalette, mergePaletteColors } from './remap';
import type { Color } from '../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a Uint8ClampedArray from an array of RGBA tuples. */
function makeImageData(pixels: Color[]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(pixels.length * 4);
  for (let i = 0; i < pixels.length; i++) {
    data[i * 4] = pixels[i][0];
    data[i * 4 + 1] = pixels[i][1];
    data[i * 4 + 2] = pixels[i][2];
    data[i * 4 + 3] = pixels[i][3];
  }
  return data;
}

// ---------------------------------------------------------------------------
// distance.ts
// ---------------------------------------------------------------------------

describe('rgbToLab', () => {
  it('converts black to [0, 0, 0]', () => {
    const [L, a, b] = rgbToLab(0, 0, 0);
    expect(L).toBeCloseTo(0, 1);
    expect(a).toBeCloseTo(0, 1);
    expect(b).toBeCloseTo(0, 1);
  });

  it('converts white to [100, ~0, ~0]', () => {
    const [L, a, b] = rgbToLab(255, 255, 255);
    expect(L).toBeCloseTo(100, 0);
    expect(Math.abs(a)).toBeLessThan(1);
    expect(Math.abs(b)).toBeLessThan(1);
  });

  it('converts pure red to a known LAB value', () => {
    const [L, a, b] = rgbToLab(255, 0, 0);
    // Expected roughly L≈53.2, a≈80.1, b≈67.2
    expect(L).toBeCloseTo(53.2, 0);
    expect(a).toBeGreaterThan(70);
    expect(b).toBeGreaterThan(60);
  });
});

describe('deltaE', () => {
  it('returns 0 for identical colors', () => {
    const lab: [number, number, number] = [50, 20, -30];
    expect(deltaE(lab, lab)).toBe(0);
  });

  it('returns a large value for black vs white', () => {
    const black = rgbToLab(0, 0, 0);
    const white = rgbToLab(255, 255, 255);
    const d = deltaE(black, white);
    expect(d).toBeGreaterThan(90); // L difference alone is ~100
  });

  it('returns a smaller value for similar colors', () => {
    const c1 = rgbToLab(100, 100, 100);
    const c2 = rgbToLab(105, 100, 100);
    const d = deltaE(c1, c2);
    expect(d).toBeLessThan(5);
    expect(d).toBeGreaterThan(0);
  });
});

describe('rgbDeltaE', () => {
  it('compares two RGBA colors', () => {
    const c1: Color = [0, 0, 0, 255];
    const c2: Color = [255, 255, 255, 255];
    expect(rgbDeltaE(c1, c2)).toBeGreaterThan(90);
  });

  it('returns 0 for same color', () => {
    const c: Color = [128, 64, 32, 255];
    expect(rgbDeltaE(c, c)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// palette.ts
// ---------------------------------------------------------------------------

describe('extractColors', () => {
  it('counts unique colors in a small buffer', () => {
    const pixels: Color[] = [
      [255, 0, 0, 255],
      [255, 0, 0, 255],
      [0, 255, 0, 255],
      [0, 0, 255, 255],
    ];
    const data = makeImageData(pixels);
    const colorMap = extractColors(data);

    expect(colorMap.size).toBe(3);
    // Red appears twice
    const redKey = (255 << 16) | (0 << 8) | 0;
    expect(colorMap.get(redKey)).toBe(2);
  });

  it('skips fully transparent pixels', () => {
    const pixels: Color[] = [
      [255, 0, 0, 0], // transparent — should be skipped
      [0, 255, 0, 255],
    ];
    const data = makeImageData(pixels);
    const colorMap = extractColors(data);

    expect(colorMap.size).toBe(1);
  });
});

describe('extractTopColors', () => {
  it('returns colors sorted by frequency', () => {
    const pixels: Color[] = [
      [0, 0, 255, 255], // blue x1
      [255, 0, 0, 255], // red x3
      [255, 0, 0, 255],
      [255, 0, 0, 255],
      [0, 255, 0, 255], // green x2
      [0, 255, 0, 255],
    ];
    const data = makeImageData(pixels);
    const top = extractTopColors(data, 3);

    expect(top.length).toBe(3);
    // Most frequent first: red, green, blue
    expect(top[0]).toEqual([255, 0, 0, 255]);
    expect(top[1]).toEqual([0, 255, 0, 255]);
    expect(top[2]).toEqual([0, 0, 255, 255]);
  });

  it('respects the maxColors limit', () => {
    const pixels: Color[] = [
      [255, 0, 0, 255],
      [0, 255, 0, 255],
      [0, 0, 255, 255],
    ];
    const data = makeImageData(pixels);
    const top = extractTopColors(data, 2);

    expect(top.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// quantize.ts
// ---------------------------------------------------------------------------

describe('octreeQuantize', () => {
  it('reduces a 4x4 image with 8 colors down to 2', () => {
    // Create a 4x4 image with 8 distinct colors (2 pixels each)
    const colors: Color[] = [
      [255, 0, 0, 255],
      [0, 255, 0, 255],
      [0, 0, 255, 255],
      [255, 255, 0, 255],
      [255, 0, 255, 255],
      [0, 255, 255, 255],
      [128, 0, 0, 255],
      [0, 128, 0, 255],
    ];
    const pixels: Color[] = [];
    for (const c of colors) {
      pixels.push(c, c); // 2 pixels per color = 16 total (4x4)
    }
    const data = makeImageData(pixels);

    const result = octreeQuantize(data, 4, 4, 2);

    expect(result.palette.length).toBe(2);
    expect(result.indexedData.length).toBe(16);
    expect(result.remappedData.length).toBe(64); // 16 * 4

    // Every pixel in remappedData should match one of the two palette colors
    for (let p = 0; p < 16; p++) {
      const i = p * 4;
      const r = result.remappedData[i];
      const g = result.remappedData[i + 1];
      const b = result.remappedData[i + 2];
      const a = result.remappedData[i + 3];

      const matchesPalette = result.palette.some(
        (c) => c[0] === r && c[1] === g && c[2] === b && c[3] === a,
      );
      expect(matchesPalette).toBe(true);
    }
  });

  it('preserves transparent pixels', () => {
    const pixels: Color[] = [
      [0, 0, 0, 0], // transparent
      [255, 0, 0, 255],
      [0, 255, 0, 255],
      [0, 0, 255, 255],
    ];
    const data = makeImageData(pixels);

    const result = octreeQuantize(data, 2, 2, 2);

    // First pixel should remain transparent
    expect(result.remappedData[0]).toBe(0);
    expect(result.remappedData[1]).toBe(0);
    expect(result.remappedData[2]).toBe(0);
    expect(result.remappedData[3]).toBe(0);
  });

  it('handles a single-color image', () => {
    const pixels: Color[] = Array(4).fill([42, 100, 200, 255]);
    const data = makeImageData(pixels);

    const result = octreeQuantize(data, 2, 2, 4);

    expect(result.palette.length).toBe(1);
    expect(result.palette[0]).toEqual([42, 100, 200, 255]);
  });
});

// ---------------------------------------------------------------------------
// remap.ts
// ---------------------------------------------------------------------------

describe('remapToPalette', () => {
  it('maps every pixel to the nearest palette entry', () => {
    const palette: Color[] = [
      [255, 0, 0, 255], // red
      [0, 0, 255, 255], // blue
    ];

    // Slightly off-red and slightly off-blue pixels
    const pixels: Color[] = [
      [240, 10, 10, 255], // should map to red
      [10, 10, 240, 255], // should map to blue
      [250, 5, 5, 255], // should map to red
      [5, 5, 250, 255], // should map to blue
    ];
    const data = makeImageData(pixels);

    const result = remapToPalette(data, palette);

    // Check that every pixel matches one of the palette colors
    for (let p = 0; p < 4; p++) {
      const i = p * 4;
      const r = result[i];
      const g = result[i + 1];
      const b = result[i + 2];

      const matchesPalette = palette.some(
        (c) => c[0] === r && c[1] === g && c[2] === b,
      );
      expect(matchesPalette).toBe(true);
    }

    // Verify the specific mappings
    expect(result[0]).toBe(255); // pixel 0 -> red
    expect(result[4]).toBe(0); // pixel 1 -> blue
    expect(result[4 + 2]).toBe(255); // pixel 1 -> blue (b channel)
  });

  it('preserves transparent pixels', () => {
    const palette: Color[] = [[255, 0, 0, 255]];
    const pixels: Color[] = [[0, 0, 0, 0]];
    const data = makeImageData(pixels);

    const result = remapToPalette(data, palette);

    expect(result[3]).toBe(0);
  });
});

describe('mergePaletteColors', () => {
  it('merges two palette entries and removes the second', () => {
    const palette: Color[] = [
      [255, 0, 0, 255],
      [0, 0, 255, 255],
      [0, 255, 0, 255],
    ];

    const merged = mergePaletteColors(palette, 0, 1);

    expect(merged.length).toBe(2);
    // First entry should be average of red and blue
    expect(merged[0]).toEqual([128, 0, 128, 255]);
    // Second entry (originally index 2) should remain
    expect(merged[1]).toEqual([0, 255, 0, 255]);
  });

  it('returns a copy when indexA === indexB', () => {
    const palette: Color[] = [
      [100, 100, 100, 255],
      [200, 200, 200, 255],
    ];

    const result = mergePaletteColors(palette, 0, 0);

    expect(result.length).toBe(2);
    expect(result[0]).toEqual([100, 100, 100, 255]);
  });

  it('throws for out-of-bounds indices', () => {
    const palette: Color[] = [[255, 0, 0, 255]];

    expect(() => mergePaletteColors(palette, 0, 5)).toThrow(RangeError);
    expect(() => mergePaletteColors(palette, -1, 0)).toThrow(RangeError);
  });
});
