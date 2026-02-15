// ---------------------------------------------------------------------------
// Pure rendering math — NO DOM, NO Svelte
// ---------------------------------------------------------------------------

/**
 * Discrete zoom levels available in the editor.
 * Each level represents a pixel-multiplier (1x through 32x).
 */
export const ZOOM_LEVELS = [1, 2, 4, 6, 8, 12, 16, 24, 32] as const;

/**
 * Convert screen (mouse / pointer) coordinates to pixel coordinates on the
 * sprite canvas, accounting for zoom, pan, and the position of the canvas
 * element on screen.
 *
 * Returns fractional values — callers should `Math.floor` for pixel indices.
 */
export function screenToPixel(
  screenX: number,
  screenY: number,
  zoom: number,
  panX: number,
  panY: number,
  canvasRect: { left: number; top: number },
): { x: number; y: number } {
  return {
    x: (screenX - canvasRect.left - panX) / zoom,
    y: (screenY - canvasRect.top - panY) / zoom,
  };
}

/**
 * Convert a pixel coordinate on the sprite canvas to screen coordinates
 * (relative to the canvas element's top-left corner).
 */
export function pixelToScreen(
  x: number,
  y: number,
  zoom: number,
  panX: number,
  panY: number,
): { screenX: number; screenY: number } {
  return {
    screenX: x * zoom + panX,
    screenY: y * zoom + panY,
  };
}

/**
 * Calculate the zoom level required to fit the entire sprite canvas within
 * the viewport, with optional padding on each side.
 *
 * The returned value is clamped to the nearest *lower* discrete zoom level
 * so the canvas always fits without overflow.
 */
export function calculateFitZoom(
  canvasW: number,
  canvasH: number,
  viewportW: number,
  viewportH: number,
  padding: number = 32,
): number {
  if (canvasW <= 0 || canvasH <= 0 || viewportW <= 0 || viewportH <= 0) {
    return 1;
  }

  const availW = viewportW - padding * 2;
  const availH = viewportH - padding * 2;

  if (availW <= 0 || availH <= 0) {
    return 1;
  }

  const idealZoom = Math.min(availW / canvasW, availH / canvasH);

  // Find the largest discrete zoom level that doesn't exceed the ideal zoom.
  let best: number = ZOOM_LEVELS[0];
  for (const level of ZOOM_LEVELS) {
    if (level <= idealZoom) {
      best = level;
    } else {
      break;
    }
  }
  return best;
}

/**
 * Return the next higher zoom level from the discrete set.
 * If the current value is at or above the maximum, returns the maximum.
 */
export function nextZoomLevel(current: number): number {
  for (const level of ZOOM_LEVELS) {
    if (level > current) {
      return level;
    }
  }
  return ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
}

/**
 * Return the next lower zoom level from the discrete set.
 * If the current value is at or below the minimum, returns the minimum.
 */
export function prevZoomLevel(current: number): number {
  for (let i = ZOOM_LEVELS.length - 1; i >= 0; i--) {
    if (ZOOM_LEVELS[i] < current) {
      return ZOOM_LEVELS[i];
    }
  }
  return ZOOM_LEVELS[0];
}

/**
 * Clamp pan offsets so that the sprite canvas cannot be dragged entirely
 * off-screen. At least a quarter of the canvas (in screen pixels) must
 * remain visible on each axis.
 */
export function clampPan(
  panX: number,
  panY: number,
  canvasW: number,
  canvasH: number,
  zoom: number,
  viewportW: number,
  viewportH: number,
): { panX: number; panY: number } {
  const scaledW = canvasW * zoom;
  const scaledH = canvasH * zoom;

  // Keep at least 25% of the canvas visible in each axis
  const minVisibleX = Math.min(scaledW * 0.25, viewportW * 0.25);
  const minVisibleY = Math.min(scaledH * 0.25, viewportH * 0.25);

  const minPanX = -scaledW + minVisibleX;
  const maxPanX = viewportW - minVisibleX;
  const minPanY = -scaledH + minVisibleY;
  const maxPanY = viewportH - minVisibleY;

  return {
    panX: Math.min(Math.max(panX, minPanX), maxPanX),
    panY: Math.min(Math.max(panY, minPanY), maxPanY),
  };
}
