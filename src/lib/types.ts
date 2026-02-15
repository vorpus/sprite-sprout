export type Color = [number, number, number, number]; // RGBA

export interface CanvasState {
  width: number;
  height: number;
  data: Uint8ClampedArray; // RGBA pixels — lives OUTSIDE reactivity
}

export interface CleanupPreview {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface ImageAnalysis {
  uniqueColorCount: number;
  width: number;
  height: number;
  suggestedGridSizes: number[];
  looksLikePixelArt: boolean;
}

export type ToolType = 'pencil' | 'eraser' | 'fill' | 'picker';

export interface PixelChange {
  x: number;
  y: number;
  before: Color;
  after: Color;
}
