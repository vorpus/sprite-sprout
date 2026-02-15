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
    version: '0.3.0',
    date: '2026-02-15',
    items: [
      'Material Symbols icons for toolbar (pencil, eraser, fill, picker)',
      'Instant tooltips with tool name and keyboard shortcut',
      'Clear (bomb) button to reset editor and load a new image',
      'Three demo images: Fishing Cat, Salaryman, Sprite Sheet',
      'Help button moved to toolbar (bottom-aligned)',
      'Grid and color sliders start at "Original" — no confusing pre-filled values',
      'Color slider sentinel (65 = Original) locks to 1–64 after first reduction',
      'Before/after defaults to split view',
      'Fix: cleanup controls (grid size, colors) no longer re-trigger the auto-clean banner',
      'Fix: drawing tools (pencil, eraser, flood fill) now support undo/redo',
      'Confirmation dialog when auto-clean or grid snap would overwrite manual edits',
      'Release script: npm run release minor|major',
    ],
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
