<script lang="ts">
  import { editorState } from '../lib/state.svelte';

  // ---- Hold mode: spacebar toggles showBeforeAfter ---------------------------

  function handleKeyDown(e: KeyboardEvent): void {
    if (editorState.beforeAfterMode !== 'hold') return;
    if (e.code !== 'Space') return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    e.preventDefault();
    editorState.showBeforeAfter = true;
  }

  function handleKeyUp(e: KeyboardEvent): void {
    if (editorState.beforeAfterMode !== 'hold') return;
    if (e.code !== 'Space') return;
    editorState.showBeforeAfter = false;
  }

  // ---- Split mode: draggable divider ----------------------------------------

  let isDraggingSplit = $state(false);
  let containerEl: HTMLDivElement | undefined = $state();

  function handleSplitPointerDown(e: PointerEvent): void {
    e.preventDefault();
    isDraggingSplit = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handleSplitPointerMove(e: PointerEvent): void {
    if (!isDraggingSplit || !containerEl) return;
    const rect = containerEl.getBoundingClientRect();
    const fraction = Math.max(0.05, Math.min(0.95, (e.clientX - rect.left) / rect.width));
    editorState.splitPosition = fraction;
  }

  function handleSplitPointerUp(): void {
    isDraggingSplit = false;
  }

  let showSplit = $derived(
    editorState.beforeAfterMode === 'split' &&
    editorState.sourceImage !== null &&
    editorState.canvas !== null,
  );

  let showHoldLabel = $derived(
    editorState.beforeAfterMode === 'hold' &&
    editorState.showBeforeAfter &&
    editorState.sourceImage !== null &&
    editorState.canvas !== null,
  );
</script>

<!-- Hold mode: spacebar listener -->
<svelte:window onkeydown={handleKeyDown} onkeyup={handleKeyUp} />

<!-- Hold mode: just a label overlay (rendering is done by CanvasArea) -->
{#if showHoldLabel}
  <div class="hold-label">Original</div>
{/if}

<!-- Split mode: divider handle + labels (rendering is done by CanvasArea) -->
{#if showSplit}
  <div
    class="split-container"
    bind:this={containerEl}
    role="separator"
    aria-label="Before/after split divider"
  >
    <div class="split-label left-label">Before</div>

    <!-- Divider handle -->
    <div
      class="split-divider"
      style="left: {editorState.splitPosition * 100}%;"
      onpointerdown={handleSplitPointerDown}
      onpointermove={handleSplitPointerMove}
      onpointerup={handleSplitPointerUp}
      role="slider"
      aria-label="Split position"
      aria-valuenow={Math.round(editorState.splitPosition * 100)}
      tabindex="0"
    >
      <div class="divider-line"></div>
      <div class="divider-handle">
        <svg width="12" height="24" viewBox="0 0 12 24" fill="none">
          <rect x="2" y="0" width="1" height="24" fill="currentColor" />
          <rect x="5" y="0" width="1" height="24" fill="currentColor" />
          <rect x="8" y="0" width="1" height="24" fill="currentColor" />
        </svg>
      </div>
    </div>

    <div
      class="split-label right-label"
      style="left: {editorState.splitPosition * 100}%;"
    >
      After
    </div>
  </div>
{/if}

<style>
  .hold-label {
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10;
    background: rgba(0, 0, 0, 0.6);
    color: var(--accent, #4fc3f7);
    padding: 2px 10px;
    border-radius: 4px;
    font-size: 11px;
    pointer-events: none;
    white-space: nowrap;
  }

  .split-container {
    position: absolute;
    inset: 0;
    z-index: 10;
    pointer-events: none;
  }

  .split-label {
    position: absolute;
    top: 8px;
    background: rgba(0, 0, 0, 0.6);
    color: var(--accent, #4fc3f7);
    padding: 2px 10px;
    border-radius: 4px;
    font-size: 11px;
    pointer-events: none;
    white-space: nowrap;
  }

  .left-label {
    left: 12px;
  }

  .right-label {
    margin-left: 12px;
  }

  .split-divider {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 20px;
    transform: translateX(-50%);
    cursor: ew-resize;
    pointer-events: all;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 11;
  }

  .divider-line {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    width: 2px;
    background: var(--accent, #4fc3f7);
    transform: translateX(-50%);
    box-shadow: 0 0 6px rgba(79, 195, 247, 0.4);
  }

  .divider-handle {
    position: relative;
    z-index: 1;
    width: 20px;
    height: 36px;
    background: var(--bg-surface, #253354);
    border: 1px solid var(--accent, #4fc3f7);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--accent, #4fc3f7);
  }
</style>
