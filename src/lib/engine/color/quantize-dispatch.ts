import type { Color } from '../../types';
import type { QuantizeResult } from './quantize';
import { octreeQuantize, octreeQuantizeWeighted } from './quantize';
import { medianCutQuantize } from './median-cut';
import { refineWithKMeans, refineWithKMeansOklab } from './refine';

export type QuantizeMethod =
  | 'octree'
  | 'weighted-octree'
  | 'median-cut'
  | 'octree-refine'
  | 'oklab-refine';

export const QUANTIZE_METHODS: { value: QuantizeMethod; label: string }[] = [
  { value: 'median-cut', label: 'Median Cut' },
  { value: 'weighted-octree', label: 'Weighted Octree' },
  { value: 'oklab-refine', label: 'OKLab + Refine' },
  { value: 'octree-refine', label: 'Octree + Refine' },
  { value: 'octree', label: 'Octree (Fast)' },
];

/**
 * Quantize image colors using the specified method.
 */
export function quantize(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  targetColors: number,
  method: QuantizeMethod,
): QuantizeResult {
  switch (method) {
    case 'octree':
      return octreeQuantize(data, width, height, targetColors);

    case 'weighted-octree':
      return octreeQuantizeWeighted(data, width, height, targetColors);

    case 'median-cut':
      return medianCutQuantize(data, width, height, targetColors);

    case 'octree-refine': {
      const initial = octreeQuantize(data, width, height, targetColors);
      return refineWithKMeans(data, width, height, initial.palette);
    }

    case 'oklab-refine': {
      const initial = octreeQuantize(data, width, height, targetColors);
      return refineWithKMeansOklab(data, width, height, initial.palette);
    }
  }
}
