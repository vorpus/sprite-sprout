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

// ---------------------------------------------------------------------------
// OKLab (Ottosson 2020)
// ---------------------------------------------------------------------------

/**
 * Convert an RGB color (0-255 per channel) to OKLab.
 * sRGB linearization → M1 matrix → cube root → M2 matrix.
 */
export function rgbToOklab(r: number, g: number, b: number): [number, number, number] {
  // 1. Linearize sRGB
  let rLin = r / 255;
  let gLin = g / 255;
  let bLin = b / 255;

  rLin = rLin > 0.04045 ? Math.pow((rLin + 0.055) / 1.055, 2.4) : rLin / 12.92;
  gLin = gLin > 0.04045 ? Math.pow((gLin + 0.055) / 1.055, 2.4) : gLin / 12.92;
  bLin = bLin > 0.04045 ? Math.pow((bLin + 0.055) / 1.055, 2.4) : bLin / 12.92;

  // 2. Linear RGB → LMS (M1 matrix)
  const l = 0.4122214708 * rLin + 0.5363325363 * gLin + 0.0514459929 * bLin;
  const m = 0.2119034982 * rLin + 0.6806995451 * gLin + 0.1073969566 * bLin;
  const s = 0.0883024619 * rLin + 0.2220049401 * gLin + 0.6896926080 * bLin;

  // 3. Cube root
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  // 4. LMS' → OKLab (M2 matrix)
  const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const bVal = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;

  return [L, a, bVal];
}

/**
 * Convert OKLab back to RGB (0-255 per channel).
 * M2 inverse → cube → M1 inverse → sRGB gamma.
 */
export function oklabToRgb(L: number, a: number, b: number): [number, number, number] {
  // 1. OKLab → LMS' (M2 inverse)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  // 2. Cube
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  // 3. LMS → linear RGB (exact inverse of M1, computed at double precision)
  let rLin =  4.0612058911584550 * l - 3.2669972759145920 * m + 0.2057913823715241 * s;
  let gLin = -1.2454797786146080 * l + 2.5495911906264810 * m - 0.3041114087157996 * s;
  let bLin = -0.1190556689640171 * l - 0.4024081653933972 * m + 1.5214638191025350 * s;

  // 4. Apply sRGB gamma and scale to 0-255
  const gamma = (c: number) =>
    c > 0.0031308 ? 1.055 * Math.pow(c, 1 / 2.4) - 0.055 : 12.92 * c;

  const rOut = Math.round(Math.min(255, Math.max(0, gamma(rLin) * 255)));
  const gOut = Math.round(Math.min(255, Math.max(0, gamma(gLin) * 255)));
  const bOut = Math.round(Math.min(255, Math.max(0, gamma(bLin) * 255)));

  return [rOut, gOut, bOut];
}

/**
 * Euclidean distance in OKLab space.
 * Better perceptual uniformity than CIE76, simpler math than CIEDE2000.
 */
export function oklabDistance(
  lab1: [number, number, number],
  lab2: [number, number, number],
): number {
  const dL = lab1[0] - lab2[0];
  const da = lab1[1] - lab2[1];
  const db = lab1[2] - lab2[2];
  return Math.sqrt(dL * dL + da * da + db * db);
}
