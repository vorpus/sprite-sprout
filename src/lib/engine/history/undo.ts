import type { Color, CanvasState } from '../../types';

export interface HistoryEntry {
  label: string;
  canvasSnapshot: {
    data: Uint8ClampedArray;
    width: number;
    height: number;
  };
  paletteSnapshot: Color[];
}

export class HistoryManager {
  private entries: HistoryEntry[] = [];
  private currentIndex: number = -1;
  private maxEntries: number = 50;

  /**
   * Snapshot current state BEFORE an operation.
   * Discards any redo entries beyond currentIndex, deep-copies canvas
   * data and palette, and trims if over maxEntries.
   */
  push(label: string, canvas: CanvasState, palette: Color[]): void {
    // Discard any redo entries beyond currentIndex
    this.entries = this.entries.slice(0, this.currentIndex + 1);

    // Deep copy canvas data and palette
    const entry: HistoryEntry = {
      label,
      canvasSnapshot: {
        data: new Uint8ClampedArray(canvas.data),
        width: canvas.width,
        height: canvas.height,
      },
      paletteSnapshot: palette.map((c) => [...c] as Color),
    };

    this.entries.push(entry);
    this.currentIndex = this.entries.length - 1;

    // Trim from the front if over maxEntries
    if (this.entries.length > this.maxEntries) {
      const overflow = this.entries.length - this.maxEntries;
      this.entries = this.entries.slice(overflow);
      this.currentIndex -= overflow;
    }
  }

  /** Restore previous state, return the snapshot or null. */
  undo(): HistoryEntry | null {
    if (!this.canUndo) return null;
    this.currentIndex--;
    return this.cloneEntry(this.entries[this.currentIndex]);
  }

  /** Restore next state, return the snapshot or null. */
  redo(): HistoryEntry | null {
    if (!this.canRedo) return null;
    this.currentIndex++;
    return this.cloneEntry(this.entries[this.currentIndex]);
  }

  get canUndo(): boolean {
    return this.currentIndex > 0;
  }

  get canRedo(): boolean {
    return this.currentIndex < this.entries.length - 1;
  }

  /** Label of entry that would be undone (the one before current). */
  get undoLabel(): string | null {
    if (!this.canUndo) return null;
    return this.entries[this.currentIndex].label;
  }

  /** Label of entry that would be redone (the one after current). */
  get redoLabel(): string | null {
    if (!this.canRedo) return null;
    return this.entries[this.currentIndex + 1].label;
  }

  /** Reset history (on new image import). */
  clear(): void {
    this.entries = [];
    this.currentIndex = -1;
  }

  /** Return a deep clone of a history entry so callers can't mutate snapshots. */
  private cloneEntry(entry: HistoryEntry): HistoryEntry {
    return {
      label: entry.label,
      canvasSnapshot: {
        data: new Uint8ClampedArray(entry.canvasSnapshot.data),
        width: entry.canvasSnapshot.width,
        height: entry.canvasSnapshot.height,
      },
      paletteSnapshot: entry.paletteSnapshot.map((c) => [...c] as Color),
    };
  }
}
