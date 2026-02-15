import type { Color, CanvasState, CleanupPreview, ToolType, ImageAnalysis } from './types';
import { HistoryManager } from './engine/history/undo';

export type BeforeAfterMode = 'hold' | 'split' | 'off';

// ---------------------------------------------------------------------------
// Helper functions for pixel manipulation (pure, work on raw buffers)
// ---------------------------------------------------------------------------

/**
 * Read a single pixel from an RGBA buffer.
 * Returns [r, g, b, a]. Out-of-bounds coordinates return fully transparent black.
 */
export function getPixel(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
): Color {
  const height = data.length / (width * 4);
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return [0, 0, 0, 0];
  }
  const i = (y * width + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

/**
 * Write a single pixel into an RGBA buffer.
 * Out-of-bounds writes are silently ignored.
 */
export function setPixel(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  color: Color,
): void {
  const height = data.length / (width * 4);
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return;
  }
  const i = (y * width + x) * 4;
  data[i] = color[0];
  data[i + 1] = color[1];
  data[i + 2] = color[2];
  data[i + 3] = color[3];
}

/**
 * Create a new blank (fully transparent) canvas of the given dimensions.
 */
export function createCanvas(width: number, height: number): CanvasState {
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
  };
}

/**
 * Deep-clone a CanvasState (copies the underlying pixel buffer).
 */
export function cloneCanvas(canvas: CanvasState): CanvasState {
  return {
    width: canvas.width,
    height: canvas.height,
    data: new Uint8ClampedArray(canvas.data),
  };
}

// ---------------------------------------------------------------------------
// Reactive state (singleton) — Svelte 5 runes
// ---------------------------------------------------------------------------

class EditorStore {
  // Source image (original import, never mutated)
  sourceImage: ImageData | null = $state(null);

  // Working canvas (non-reactive pixel data, reactive metadata)
  canvas: CanvasState | null = $state(null);
  canvasVersion: number = $state(0);

  // Analysis results from import
  analysis: ImageAnalysis | null = $state(null);

  // Palette
  palette: Color[] = $state([]);
  activeColor: Color = $state([0, 0, 0, 255]);
  activeColorIndex: number = $state(0);

  // Tool state
  activeTool: ToolType = $state('pencil');

  // Viewport
  zoom: number = $state(1);
  panX: number = $state(0);
  panY: number = $state(0);

  // Cleanup preview
  cleanupPreview: CleanupPreview | null = $state(null);
  showingPreview: boolean = $state(false);

  // Grid
  detectedGridSize: number | null = $state(null);

  // UI
  showGrid: boolean = $state(true);
  showBeforeAfter: boolean = $state(false);
  showOnboarding: boolean = $state(false);
  beforeAfterMode: BeforeAfterMode = $state('hold');
  splitPosition: number = $state(0.5); // 0..1, fraction of canvas width

  // Viewport dimensions (written by CanvasArea's ResizeObserver)
  viewportW: number = $state(0);
  viewportH: number = $state(0);

  // History (undo/redo)
  history = new HistoryManager();

  /**
   * Increment the canvas version counter to signal that the underlying
   * pixel buffer has been mutated and any dependent views should re-render.
   */
  bumpVersion(): void {
    this.canvasVersion++;
  }

  /**
   * Snapshot the current canvas + palette into history BEFORE an operation.
   */
  pushHistory(label: string): void {
    if (!this.canvas) return;
    this.history.push(label, this.canvas, this.palette);
  }

  /**
   * Undo: restore the previous canvas + palette from history.
   */
  undo(): void {
    const entry = this.history.undo();
    if (!entry) return;
    this.canvas = {
      width: entry.canvasSnapshot.width,
      height: entry.canvasSnapshot.height,
      data: entry.canvasSnapshot.data,
    };
    this.palette = entry.paletteSnapshot;
    this.bumpVersion();
  }

  /**
   * Redo: restore the next canvas + palette from history.
   */
  redo(): void {
    const entry = this.history.redo();
    if (!entry) return;
    this.canvas = {
      width: entry.canvasSnapshot.width,
      height: entry.canvasSnapshot.height,
      data: entry.canvasSnapshot.data,
    };
    this.palette = entry.paletteSnapshot;
    this.bumpVersion();
  }
}

export const editorState = new EditorStore();
