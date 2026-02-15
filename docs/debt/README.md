# Technical Debt Tracker

> Add items as they're discovered during implementation. Remove when resolved.

## Format

```
### [severity] Short description
- **Where**: file path or module
- **Details**: what's wrong and why it matters
- **Added**: date
- **Resolved**: date (move to Resolved section)
```

## Active

### [low] No error handling on image import
- **Where**: `src/app/ImportDropZone.svelte`, `src/lib/engine/io/import.ts`
- **Details**: Very large images (2048+), non-image files, and corrupt files can cause unhandled errors. The design spec calls for toast messages and size warnings but these aren't implemented yet.
- **Added**: 2026-02-15

### [low] Export requires secure context
- **Where**: `src/lib/engine/io/export.ts` (copyToClipboard)
- **Details**: `navigator.clipboard.write()` requires HTTPS or localhost. No fallback for non-secure contexts. Should gracefully degrade with a user message.
- **Added**: 2026-02-15

## Resolved

### [low] No pushHistory calls in drawing tools
- **Where**: `src/app/CanvasArea.svelte` (applyToolAt, applyStrokeAlongLine)
- **Details**: Pencil/eraser strokes and flood fills called `bumpVersion()` but never `pushHistory()`. Fixed: history is pushed on pointerdown before first pixel change; entire stroke is one undo entry.
- **Added**: 2026-02-15
- **Resolved**: 2026-02-15

### [low] Cleanup preview conflicts between grid and color
- **Where**: `src/app/CleanupPanel.svelte`
- **Details**: Both grid and color sections wrote to `editorState.cleanupPreview`, causing conflicts and blocking painting. Eliminated by switching to auto-apply: slider changes commit directly to canvas with undo history instead of using a non-interactive preview overlay.
- **Added**: 2026-02-15
- **Resolved**: 2026-02-15
