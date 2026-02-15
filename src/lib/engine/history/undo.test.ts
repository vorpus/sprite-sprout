import { describe, it, expect } from 'vitest';
import { HistoryManager } from './undo';
import type { Color, CanvasState } from '../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a tiny 2x2 canvas filled with a single color. */
function makeCanvas(r: number, g: number, b: number, a: number = 255): CanvasState {
  const data = new Uint8ClampedArray(2 * 2 * 4);
  for (let i = 0; i < 4; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  return { width: 2, height: 2, data };
}

function makePalette(...colors: Color[]): Color[] {
  return colors;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HistoryManager', () => {
  it('push adds entries', () => {
    const hm = new HistoryManager();
    const canvas = makeCanvas(255, 0, 0);
    const palette = makePalette([255, 0, 0, 255]);

    hm.push('First', canvas, palette);
    expect(hm.canUndo).toBe(false); // Only one entry, can't undo
    expect(hm.canRedo).toBe(false);

    hm.push('Second', canvas, palette);
    expect(hm.canUndo).toBe(true);
    expect(hm.canRedo).toBe(false);
  });

  it('undo returns previous snapshot with correct data', () => {
    const hm = new HistoryManager();
    const redCanvas = makeCanvas(255, 0, 0);
    const greenCanvas = makeCanvas(0, 255, 0);
    const redPalette = makePalette([255, 0, 0, 255]);
    const greenPalette = makePalette([0, 255, 0, 255]);

    hm.push('Red state', redCanvas, redPalette);
    hm.push('Green state', greenCanvas, greenPalette);

    const entry = hm.undo();
    expect(entry).not.toBeNull();
    // After undo, we should get the red state snapshot
    expect(entry!.canvasSnapshot.data[0]).toBe(255); // R
    expect(entry!.canvasSnapshot.data[1]).toBe(0);   // G
    expect(entry!.paletteSnapshot[0]).toEqual([255, 0, 0, 255]);
  });

  it('redo returns next snapshot after undo', () => {
    const hm = new HistoryManager();
    const redCanvas = makeCanvas(255, 0, 0);
    const greenCanvas = makeCanvas(0, 255, 0);
    const palette = makePalette([0, 0, 0, 255]);

    hm.push('Red', redCanvas, palette);
    hm.push('Green', greenCanvas, palette);

    hm.undo(); // back to Red
    const entry = hm.redo();
    expect(entry).not.toBeNull();
    // Should get the green state
    expect(entry!.canvasSnapshot.data[0]).toBe(0);
    expect(entry!.canvasSnapshot.data[1]).toBe(255);
  });

  it('undo at beginning returns null', () => {
    const hm = new HistoryManager();
    expect(hm.undo()).toBeNull();

    // Also after pushing only one entry
    hm.push('Only', makeCanvas(0, 0, 0), []);
    expect(hm.undo()).toBeNull();
  });

  it('redo at end returns null', () => {
    const hm = new HistoryManager();
    expect(hm.redo()).toBeNull();

    hm.push('Only', makeCanvas(0, 0, 0), []);
    expect(hm.redo()).toBeNull();
  });

  it('push after undo discards redo entries', () => {
    const hm = new HistoryManager();
    const canvas = makeCanvas(0, 0, 0);
    const palette: Color[] = [];

    hm.push('A', canvas, palette);
    hm.push('B', canvas, palette);
    hm.push('C', canvas, palette);

    hm.undo(); // back to B
    hm.undo(); // back to A

    // Now push a new entry — should discard B and C from the redo stack
    hm.push('D', canvas, palette);
    expect(hm.canRedo).toBe(false);
    expect(hm.canUndo).toBe(true);

    // Undo should go back to A, not B
    const entry = hm.undo();
    expect(entry).not.toBeNull();
    expect(entry!.label).toBe('A');
  });

  it('maxEntries limit works (push 55 entries, only 50 remain)', () => {
    const hm = new HistoryManager();
    const canvas = makeCanvas(0, 0, 0);
    const palette: Color[] = [];

    for (let i = 0; i < 55; i++) {
      hm.push(`Entry ${i}`, canvas, palette);
    }

    // Undo back as far as possible to count entries
    let count = 1; // Current entry counts
    while (hm.undo() !== null) {
      count++;
    }
    expect(count).toBe(50);
  });

  it('clear resets everything', () => {
    const hm = new HistoryManager();
    const canvas = makeCanvas(0, 0, 0);
    const palette: Color[] = [];

    hm.push('A', canvas, palette);
    hm.push('B', canvas, palette);
    hm.push('C', canvas, palette);

    hm.clear();

    expect(hm.canUndo).toBe(false);
    expect(hm.canRedo).toBe(false);
    expect(hm.undoLabel).toBeNull();
    expect(hm.redoLabel).toBeNull();
    expect(hm.undo()).toBeNull();
    expect(hm.redo()).toBeNull();
  });

  it('canUndo/canRedo flags are correct', () => {
    const hm = new HistoryManager();
    const canvas = makeCanvas(0, 0, 0);
    const palette: Color[] = [];

    // Empty history
    expect(hm.canUndo).toBe(false);
    expect(hm.canRedo).toBe(false);

    hm.push('A', canvas, palette);
    expect(hm.canUndo).toBe(false); // only one entry
    expect(hm.canRedo).toBe(false);

    hm.push('B', canvas, palette);
    expect(hm.canUndo).toBe(true);
    expect(hm.canRedo).toBe(false);

    hm.push('C', canvas, palette);
    expect(hm.canUndo).toBe(true);
    expect(hm.canRedo).toBe(false);

    hm.undo(); // at B
    expect(hm.canUndo).toBe(true);
    expect(hm.canRedo).toBe(true);

    hm.undo(); // at A
    expect(hm.canUndo).toBe(false);
    expect(hm.canRedo).toBe(true);

    hm.redo(); // at B
    expect(hm.canUndo).toBe(true);
    expect(hm.canRedo).toBe(true);

    hm.redo(); // at C
    expect(hm.canUndo).toBe(true);
    expect(hm.canRedo).toBe(false);
  });

  it('canvas data in snapshots is a deep copy (mutating original does not affect snapshot)', () => {
    const hm = new HistoryManager();
    const canvas = makeCanvas(100, 100, 100);
    const palette = makePalette([100, 100, 100, 255]);

    hm.push('Snapshot', canvas, palette);

    // Mutate the original canvas data
    canvas.data[0] = 0;
    canvas.data[1] = 0;
    canvas.data[2] = 0;

    // Mutate the original palette
    palette[0][0] = 0;

    // Push a second entry and undo to get back the first snapshot
    hm.push('After mutation', makeCanvas(0, 0, 0), makePalette([0, 0, 0, 255]));
    const entry = hm.undo();

    // The snapshot should still have the original values
    expect(entry).not.toBeNull();
    expect(entry!.canvasSnapshot.data[0]).toBe(100);
    expect(entry!.canvasSnapshot.data[1]).toBe(100);
    expect(entry!.canvasSnapshot.data[2]).toBe(100);
    expect(entry!.paletteSnapshot[0][0]).toBe(100);
  });

  it('undoLabel and redoLabel return correct labels', () => {
    const hm = new HistoryManager();
    const canvas = makeCanvas(0, 0, 0);
    const palette: Color[] = [];

    expect(hm.undoLabel).toBeNull();
    expect(hm.redoLabel).toBeNull();

    hm.push('Pencil stroke', canvas, palette);
    expect(hm.undoLabel).toBeNull(); // only one entry
    expect(hm.redoLabel).toBeNull();

    hm.push('Grid snap', canvas, palette);
    expect(hm.undoLabel).toBe('Grid snap'); // would undo the current entry's label
    expect(hm.redoLabel).toBeNull();

    hm.undo(); // back to Pencil stroke
    expect(hm.undoLabel).toBeNull();
    expect(hm.redoLabel).toBe('Grid snap');
  });

  it('returned entries from undo/redo are deep copies (mutating them does not affect internal state)', () => {
    const hm = new HistoryManager();
    const canvas = makeCanvas(50, 50, 50);
    const palette = makePalette([50, 50, 50, 255]);

    hm.push('A', canvas, palette);
    hm.push('B', makeCanvas(100, 100, 100), makePalette([100, 100, 100, 255]));

    const entry = hm.undo();
    expect(entry).not.toBeNull();

    // Mutate the returned entry
    entry!.canvasSnapshot.data[0] = 200;
    entry!.paletteSnapshot[0][0] = 200;

    // Redo and then undo again — should still get original values
    hm.redo();
    const entry2 = hm.undo();
    expect(entry2).not.toBeNull();
    expect(entry2!.canvasSnapshot.data[0]).toBe(50);
    expect(entry2!.paletteSnapshot[0][0]).toBe(50);
  });
});
