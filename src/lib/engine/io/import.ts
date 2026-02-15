import type { ImageAnalysis } from '../../types';

/**
 * Load an image file into ImageData by creating a temporary Image element,
 * drawing it onto an offscreen canvas, and extracting the pixel data.
 */
export async function loadImageFromFile(file: File): Promise<ImageData> {
  const url = URL.createObjectURL(file);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`Failed to load image: ${file.name}`));
      el.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not create 2D rendering context');
    }

    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Load an image from a clipboard paste event.
 * Returns null if no image item is found in the clipboard data.
 */
export async function loadImageFromClipboard(
  items: DataTransferItemList,
): Promise<ImageData | null> {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) {
        return loadImageFromFile(file);
      }
    }
  }
  return null;
}

/**
 * Perform a quick analysis of imported image data.
 *
 * - Counts unique colors (using packed RGB keys, ignoring fully transparent pixels)
 * - Checks whether the image looks like upscaled pixel art by measuring
 *   average same-color run lengths across rows
 * - Suggests grid sizes from [2, 4, 8, 16] that evenly divide both dimensions
 */
export function analyzeImage(imageData: ImageData): ImageAnalysis {
  const { data, width, height } = imageData;
  const colorSet = new Set<number>();

  // --- Count unique colors and measure run lengths ---
  let totalRuns = 0;
  let totalRunLength = 0;

  for (let y = 0; y < height; y++) {
    let runLength = 1;
    let prevKey = -1;

    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      // Skip fully transparent pixels for color counting
      if (a > 0) {
        const key = (r << 16) | (g << 8) | b;
        colorSet.add(key);

        if (x === 0) {
          prevKey = key;
          runLength = 1;
        } else if (key === prevKey) {
          runLength++;
        } else {
          totalRuns++;
          totalRunLength += runLength;
          prevKey = key;
          runLength = 1;
        }
      } else {
        // Transparent pixel — end current run if one was active
        if (prevKey !== -1) {
          totalRuns++;
          totalRunLength += runLength;
          prevKey = -1;
          runLength = 1;
        }
      }
    }

    // End-of-row: close the last run
    if (prevKey !== -1) {
      totalRuns++;
      totalRunLength += runLength;
    }
  }

  const avgRunLength = totalRuns > 0 ? totalRunLength / totalRuns : 1;
  const looksLikePixelArt = avgRunLength > 2;

  // --- Suggest grid sizes that evenly divide both dimensions ---
  const candidates = [2, 4, 8, 16];
  const suggestedGridSizes = candidates.filter(
    (g) => width % g === 0 && height % g === 0,
  );

  return {
    uniqueColorCount: colorSet.size,
    width,
    height,
    suggestedGridSizes,
    looksLikePixelArt,
  };
}
