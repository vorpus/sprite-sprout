import type { Color } from '../../types';

/**
 * Convert an RGB color (0-255 per channel) to CIELAB.
 * Uses the D65 illuminant reference white.
 */
export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  // 1. Linearize sRGB (gamma expansion)
  let rLin = r / 255;
  let gLin = g / 255;
  let bLin = b / 255;

  rLin = rLin > 0.04045 ? Math.pow((rLin + 0.055) / 1.055, 2.4) : rLin / 12.92;
  gLin = gLin > 0.04045 ? Math.pow((gLin + 0.055) / 1.055, 2.4) : gLin / 12.92;
  bLin = bLin > 0.04045 ? Math.pow((bLin + 0.055) / 1.055, 2.4) : bLin / 12.92;

  // 2. Linear RGB → XYZ (sRGB matrix, D65)
  let x = rLin * 0.4124564 + gLin * 0.3575761 + bLin * 0.1804375;
  let y = rLin * 0.2126729 + gLin * 0.7151522 + bLin * 0.0721750;
  let z = rLin * 0.0193339 + gLin * 0.1191920 + bLin * 0.9503041;

  // 3. Normalize by D65 reference white
  x /= 0.95047;
  y /= 1.00000;
  z /= 1.08883;

  // 4. XYZ → LAB
  const epsilon = 0.008856; // (6/29)^3
  const kappa = 903.3; // (29/3)^3

  const fx = x > epsilon ? Math.cbrt(x) : (kappa * x + 16) / 116;
  const fy = y > epsilon ? Math.cbrt(y) : (kappa * y + 16) / 116;
  const fz = z > epsilon ? Math.cbrt(z) : (kappa * z + 16) / 116;

  const L = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const bVal = 200 * (fy - fz);

  return [L, a, bVal];
}

/**
 * Euclidean distance in CIELAB space (CIE76 Delta E).
 * Good enough for pixel art color comparison.
 */
export function deltaE(
  lab1: [number, number, number],
  lab2: [number, number, number],
): number {
  const dL = lab1[0] - lab2[0];
  const da = lab1[1] - lab2[1];
  const db = lab1[2] - lab2[2];
  return Math.sqrt(dL * dL + da * da + db * db);
}

/**
 * Convenience: compute Delta E between two RGBA colors.
 * Alpha channel is ignored for the perceptual distance calculation.
 */
export function rgbDeltaE(c1: Color, c2: Color): number {
  const lab1 = rgbToLab(c1[0], c1[1], c1[2]);
  const lab2 = rgbToLab(c2[0], c2[1], c2[2]);
  return deltaE(lab1, lab2);
}
