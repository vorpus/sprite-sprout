export interface ChangelogEntry {
  version: string;
  date: string;
  items: string[];
}

export const changelog: ChangelogEntry[] = [
  {
    version: 'unreleased',
    date: '',
    items: [],
  },
  {
    version: '0.2.0',
    date: '2026-02-15',
    items: [
      'Three new color reduction algorithms: Median Cut, Weighted Octree, Octree + CIELAB Refine',
      'Method selector in Cleanup panel for choosing quantization algorithm',
      'Cleanup controls auto-apply — no more Apply/Cancel buttons, Ctrl+Z to undo',
    ],
  },
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
