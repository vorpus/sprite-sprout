import type { Color } from '../../types';
import { detectGridSize } from '../grid/detect';
import { snapToGrid } from '../grid/snap';
import { extractColors } from '../color/palette';
import { octreeQuantize } from '../color/quantize';

export interface CleanupResult {
  snapped: { data: Uint8ClampedArray; width: number; height: number };
  reduced: { data: Uint8ClampedArray; width: number; height: number; palette: Color[] } | null;
  gridSize: number;
  originalColorCount: number;
  reducedColorCount: number;
}

/**
 * Heuristic for suggested color count based on how many unique colors exist.
 */
export function suggestColorCount(uniqueColors: number): number {
  if (uniqueColors < 16) return uniqueColors;
  if (uniqueColors <= 64) return 16;
  if (uniqueColors <= 256) return 24;
  return 32;
}

/**
 * One-click auto-clean: detect grid -> snap -> quantize.
 *
 * 1. Run detectGridSize on source
 * 2. snapToGrid with detected grid size -> snapped image at logical resolution
 * 3. Count unique colors with extractColors
 * 4. If > 32 colors: run octreeQuantize with suggestColorCount -> reduced
 * 5. Return snapped + reduced results
 */
export function autoClean(
  sourceData: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
): CleanupResult {
  // Step 1: detect grid
  const detection = detectGridSize(sourceData, sourceWidth, sourceHeight);
  const gridSize = detection.gridSize;

  // Step 2: snap to grid
  const snapped = snapToGrid(sourceData, sourceWidth, sourceHeight, gridSize);

  // Step 3: count unique colors in the snapped result
  const colorMap = extractColors(snapped.data);
  const originalColorCount = colorMap.size;

  // Step 4: quantize if too many colors
  let reduced: CleanupResult['reduced'] = null;
  let reducedColorCount = originalColorCount;

  if (originalColorCount > 32) {
    const targetColors = suggestColorCount(originalColorCount);
    const quantized = octreeQuantize(
      snapped.data,
      snapped.width,
      snapped.height,
      targetColors,
    );
    reduced = {
      data: quantized.remappedData,
      width: snapped.width,
      height: snapped.height,
      palette: quantized.palette,
    };
    reducedColorCount = quantized.palette.length;
  }

  return {
    snapped,
    reduced,
    gridSize,
    originalColorCount,
    reducedColorCount,
  };
}
