# AGENTS.md — Knowledge Base Map

> This file is the table of contents. The docs/ folder is the system of record.
> If something isn't linked here, it doesn't exist yet — write it.

---

## Project Overview

**Sprite Sprout** — a web-based pixel art editor that cleans up AI-generated pixel art.
Core loop: drag image → auto-detect grid → one-click cleanup → refine → export.

Tech: TypeScript, Svelte 5 (Runes), Canvas 2D, Vite.

---

## Documentation (System of Record)

All persistent knowledge lives in `docs/`. These are the source of truth.

### Design

| Doc | What it covers |
|-----|----------------|
| [docs/DESIGN.md](docs/DESIGN.md) | Product design, architecture, data model, algorithms, tech decisions |

### Research

Deep dives completed during planning. Reference before making architectural decisions.

| Doc | What it covers |
|-----|----------------|
| [docs/research/01-tech-stack.md](docs/research/01-tech-stack.md) | Library comparisons, rendering strategy, framework choice |
| [docs/research/02-wasm-analysis.md](docs/research/02-wasm-analysis.md) | JS vs WASM benchmarks — conclusion: JS is fast enough |
| [docs/research/03-features-and-ux.md](docs/research/03-features-and-ux.md) | AI pixel art problems ranked, feature prioritization, UX patterns |
| [docs/research/04-animation-and-export.md](docs/research/04-animation-and-export.md) | Animation data model, GIF pipeline, sprite sheets, layer system |
| [docs/research/05-phase1-decisions.md](docs/research/05-phase1-decisions.md) | Implementation decisions made during Phase 1 (per-task) |

### Execution Plans

Complex work gets a plan doc with progress tracking and decision logs.

| Doc | Status | What it covers |
|-----|--------|----------------|
| [docs/exec-plans/PHASE1-TASKS.md](docs/exec-plans/PHASE1-TASKS.md) | Complete | 12 agent-sized tasks (T1–T12) with dependency graph for MVP |

### Changelog

| Doc | What it covers |
|-----|----------------|
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | User-facing changelog in Keep a Changelog format |

### Technical Debt

| Doc | What it covers |
|-----|----------------|
| [docs/debt/README.md](docs/debt/README.md) | Known debt items, tracked with status and priority |

---

## Architecture (Quick Reference)

```
src/
  app/              # Svelte 5 UI components
  engine/           # Pure TS, no framework deps
    canvas/         # Renderer, zoom, grid overlay, tools
    color/          # Quantization (octree, median-cut, k-means refine), palette, distance
    grid/           # Grid detection + snap
    analysis/       # AA detection, noise, outlines
    cleanup/        # Pipeline chaining detect → snap → reduce → clean
    animation/      # Timeline, GIF encoding
    io/             # PNG, sprite sheet, project file I/O
    history/        # Command-pattern undo/redo
    batch/          # Web Worker for batch processing
```

**Boundary rule**: `engine/` functions accept and return `Uint8ClampedArray`. No Svelte, no DOM.

---

## Documentation Rules

> **Docs ship with the code, not after it.**
> Every iteration — feature, spike, refactor — must update the relevant docs
> as part of the same commit(s). If the docs don't reflect what was built, the work isn't done.

### What to document and where

| What | Where | When to update |
|------|-------|----------------|
| Product design, architecture, data model | `docs/DESIGN.md` | When adding/changing features, data structures, or system behavior |
| Research & deep dives | `docs/research/NN-topic.md` | Before making architectural decisions — write the analysis first |
| Implementation decisions | `docs/research/NN-phaseX-decisions.md` | During implementation — log each task's key decisions as you go |
| Execution plans | `docs/exec-plans/` | Before starting complex work — create the plan, track progress inline |
| Technical debt | `docs/debt/README.md` | The moment you discover it — don't defer |
| Changelog | `docs/CHANGELOG.md` + `src/lib/changelog.ts` | Every user-facing change — features, fixes, removals |
| This file (AGENTS.md) | `AGENTS.md` | When new docs are created, phases complete, or architecture changes |

### Execution plans

For complex work, create a plan in `docs/exec-plans/` before writing code:
- File name: `PHASEX-TASKS.md` or a descriptive name
- Include: goal, task breakdown, dependency graph, progress checkboxes
- Log decisions and blockers inline as the work progresses
- Move to `docs/exec-plans/completed/` when done

### Small changes

No plan doc needed, but still update any affected docs (design, debt, decisions).

### Decision logs

Every implementation task should record its key decisions in the relevant decisions doc:
- What was chosen and what was rejected
- Why (tradeoffs, constraints, benchmarks)
- Anything the next person touching this code needs to know

### Technical debt

When you discover debt during implementation, add it immediately to `docs/debt/README.md`:
- One-line description
- Where in the code it lives
- Severity (low / medium / high)

### Checklist before considering work "done"

- [ ] Code compiles, tests pass
- [ ] Decision log updated for every non-trivial choice
- [ ] DESIGN.md updated if feature behavior or architecture changed
- [ ] Debt tracker updated if shortcuts were taken
- [ ] AGENTS.md updated if new docs were created or phases completed
- [ ] Committed and pushed

---

## Key Constraints

- **Image sizes**: Pixel art is tiny (32×32 to 256×256). Don't over-optimize.
- **Color distance**: Use CIELAB Delta E, not CIEDE2000 (3× cheaper, close enough).
- **Quantization**: Default to octree (O(n), real-time). K-means available as "high quality" option.
- **Undo**: Full snapshot, not diffs (16 KB/snapshot at 64×64 — trivial).
- **Pixel buffers**: Always `Uint8ClampedArray`, always outside reactive state.
- **Grid snap changes canvas dimensions** — this affects renderer, undo, tools, and before/after.

---

## Phase Roadmap

| Phase | Focus | Status |
|-------|-------|--------|
| 1 | MVP: import → cleanup → draw → export | **Complete** |
| 2 | Power features: palette lock, orphan removal, outline repair | — |
| 3 | Animation: timeline, onion skin, GIF/spritesheet export | — |
| 4 | Polish: dithering, smart eraser, project files, shortcuts | — |

See [docs/DESIGN.md](docs/DESIGN.md) § Feature Phases for full checklists.
