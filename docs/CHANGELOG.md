# Changelog

All notable changes to Sprite Sprout will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added

- Three new color reduction algorithms: Median Cut, Weighted Octree, Octree + CIELAB Refine
- Method selector dropdown in Cleanup panel for choosing quantization algorithm
- Quantize dispatcher module for unified algorithm access

### Changed

- Cleanup controls now auto-apply: adjusting grid size or color sliders immediately commits changes (Ctrl+Z to undo) instead of requiring Apply/Cancel buttons
- Color reduction always quantizes from a clean pre-reduction snapshot, preventing quality degradation from re-quantizing

## [0.1.0] - 2026-02-15

### Added

- Import images via drag-and-drop, file picker, or clipboard paste
- Auto grid detection and snap-to-grid
- One-click color reduction (octree quantization)
- Anti-aliasing artifact cleanup
- Before/after preview (hold, split, off modes)
- Drawing tools: pencil, eraser, flood fill
- Palette panel with color editing
- PNG export and clipboard copy
- Undo/redo with full snapshot history
- Onboarding modal with welcome guide and changelog
- "Try a demo image" button in empty state
