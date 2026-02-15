import type { Color } from '../../types';

export interface QuantizeResult {
  palette: Color[];
  indexedData: Uint8Array;
  remappedData: Uint8ClampedArray;
}

// ---------------------------------------------------------------------------
// Histogram entry — one unique RGB color and how many pixels share it
// ---------------------------------------------------------------------------

interface ColorEntry {
  r: number;
  g: number;
  b: number;
  count: number;
}

// ---------------------------------------------------------------------------
// Bucket — a group of colors that will eventually become one palette entry
// ---------------------------------------------------------------------------

interface Bucket {
  entries: ColorEntry[];
  population: number; // total pixel count across all entries
  rMin: number;
  rMax: number;
  gMin: number;
  gMax: number;
  bMin: number;
  bMax: number;
}

function computeBounds(entries: ColorEntry[]): Pick<
  Bucket,
  'rMin' | 'rMax' | 'gMin' | 'gMax' | 'bMin' | 'bMax'
> {
  let rMin = 255, rMax = 0;
  let gMin = 255, gMax = 0;
  let bMin = 255, bMax = 0;

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.r < rMin) rMin = e.r;
    if (e.r > rMax) rMax = e.r;
    if (e.g < gMin) gMin = e.g;
    if (e.g > gMax) gMax = e.g;
    if (e.b < bMin) bMin = e.b;
    if (e.b > bMax) bMax = e.b;
  }

  return { rMin, rMax, gMin, gMax, bMin, bMax };
}

function makeBucket(entries: ColorEntry[]): Bucket {
  let population = 0;
  for (let i = 0; i < entries.length; i++) {
    population += entries[i].count;
  }
  const bounds = computeBounds(entries);
  return { entries, population, ...bounds };
}

/**
 * Volume of the bucket in RGB space (product of channel ranges).
 */
function bucketVolume(b: Bucket): number {
  return (b.rMax - b.rMin + 1) *
         (b.gMax - b.gMin + 1) *
         (b.bMax - b.bMin + 1);
}

// ---------------------------------------------------------------------------
// Median-cut quantizer
// ---------------------------------------------------------------------------

export function medianCutQuantize(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  targetColors: number,
): QuantizeResult {
  const pixelCount = width * height;

  // Edge case: nothing requested
  if (targetColors <= 0) {
    return {
      palette: [],
      indexedData: new Uint8Array(pixelCount),
      remappedData: new Uint8ClampedArray(data.length),
    };
  }

  // ---- Step 1: Build histogram of unique opaque colors ----
  const colorMap = new Map<number, number>(); // packed RGB → frequency

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue; // skip transparent
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    colorMap.set(key, (colorMap.get(key) ?? 0) + 1);
  }

  // Convert map to entry array
  const allEntries: ColorEntry[] = [];
  colorMap.forEach((count, key) => {
    allEntries.push({
      r: (key >> 16) & 0xff,
      g: (key >> 8) & 0xff,
      b: key & 0xff,
      count,
    });
  });

  const uniqueCount = allEntries.length;

  // Edge case: no opaque pixels at all
  if (uniqueCount === 0) {
    return {
      palette: [],
      indexedData: new Uint8Array(pixelCount),
      remappedData: new Uint8ClampedArray(data.length),
    };
  }

  const effectiveTarget = Math.min(targetColors, uniqueCount);

  // ---- Step 2: Initial bucket ----
  const buckets: Bucket[] = [makeBucket(allEntries)];

  // ---- Step 3: Split loop ----
  while (buckets.length < effectiveTarget) {
    // Find the bucket with the largest (population * volume) that can be split
    let bestIdx = -1;
    let bestScore = -1;

    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i];
      if (b.entries.length < 2) continue; // can't split a single-color bucket
      const score = b.population * bucketVolume(b);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) break; // all buckets have 1 entry — can't split further

    const bucket = buckets[bestIdx];

    // Find the channel with the largest range
    const rRange = bucket.rMax - bucket.rMin;
    const gRange = bucket.gMax - bucket.gMin;
    const bRange = bucket.bMax - bucket.bMin;

    let sortChannel: 'r' | 'g' | 'b';
    if (rRange >= gRange && rRange >= bRange) {
      sortChannel = 'r';
    } else if (gRange >= bRange) {
      sortChannel = 'g';
    } else {
      sortChannel = 'b';
    }

    // Sort entries along the chosen channel
    bucket.entries.sort((a, b) => a[sortChannel] - b[sortChannel]);

    // Find the weighted median split point
    const halfPop = bucket.population / 2;
    let cumulative = 0;
    let splitIdx = 0;

    for (let i = 0; i < bucket.entries.length - 1; i++) {
      cumulative += bucket.entries[i].count;
      if (cumulative >= halfPop) {
        splitIdx = i + 1;
        break;
      }
    }

    // Ensure we don't create an empty bucket
    if (splitIdx === 0) splitIdx = 1;

    const leftEntries = bucket.entries.slice(0, splitIdx);
    const rightEntries = bucket.entries.slice(splitIdx);

    // Replace the original bucket with two new ones
    buckets[bestIdx] = makeBucket(leftEntries);
    buckets.push(makeBucket(rightEntries));
  }

  // ---- Step 4: Build palette from weighted averages ----
  const palette: Color[] = [];

  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    let rSum = 0, gSum = 0, bSum = 0;
    let totalCount = 0;

    for (let j = 0; j < b.entries.length; j++) {
      const e = b.entries[j];
      rSum += e.r * e.count;
      gSum += e.g * e.count;
      bSum += e.b * e.count;
      totalCount += e.count;
    }

    palette.push([
      Math.round(rSum / totalCount),
      Math.round(gSum / totalCount),
      Math.round(bSum / totalCount),
      255,
    ]);
  }

  // ---- Step 5: Map pixels to nearest palette color ----
  const indexedData = new Uint8Array(pixelCount);
  const remappedData = new Uint8ClampedArray(data.length);

  for (let p = 0; p < pixelCount; p++) {
    const i = p * 4;

    if (data[i + 3] === 0) {
      // Fully transparent — pass through as [0,0,0,0]
      indexedData[p] = 0;
      remappedData[i] = 0;
      remappedData[i + 1] = 0;
      remappedData[i + 2] = 0;
      remappedData[i + 3] = 0;
      continue;
    }

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Find nearest palette color (squared Euclidean in RGB)
    let bestDist = Infinity;
    let bestPi = 0;

    for (let pi = 0; pi < palette.length; pi++) {
      const c = palette[pi];
      const dr = r - c[0];
      const dg = g - c[1];
      const db = b - c[2];
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) {
        bestDist = dist;
        bestPi = pi;
      }
    }

    indexedData[p] = bestPi;

    const color = palette[bestPi];
    remappedData[i] = color[0];
    remappedData[i + 1] = color[1];
    remappedData[i + 2] = color[2];
    remappedData[i + 3] = 255;
  }

  return { palette, indexedData, remappedData };
}
