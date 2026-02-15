# Sprite Sprout

Web-based pixel art editor for cleaning up AI-generated pixel art.

## Agent Instructions

Read [AGENTS.md](./AGENTS.md) first. It is the map to this repository.

All documentation lives in `docs/`. When in doubt, check the docs before asking.

## Quick Rules

- **Engine code** (`src/engine/`) is pure TypeScript — no framework imports, no DOM access
- **UI code** (`src/app/`) is Svelte 5 with Runes (`$state`, `$derived`, `$effect`)
- Pixel buffers are `Uint8ClampedArray` (RGBA) — never wrap these in reactive state
- Canvas 2D for rendering, not WebGL
- Run `npm test` before considering any task complete
