export interface ChangelogEntry {
  version: string;
  date: string;
  items: string[];
}

export const changelog: ChangelogEntry[] = [
  {
    version: '0.1.0',
    date: '2026-02-15',
    items: [
      'Import images via drag-and-drop, file picker, or clipboard paste',
      'Auto grid detection and snap-to-grid',
      'One-click color reduction (octree quantization)',
      'Anti-aliasing artifact cleanup',
      'Before/after preview (hold, split, off modes)',
      'Drawing tools: pencil, eraser, flood fill',
      'Palette panel with color editing',
      'PNG export and clipboard copy',
      'Undo/redo with full snapshot history',
    ],
  },
];
