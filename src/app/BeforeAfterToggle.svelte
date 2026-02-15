<script lang="ts">
  import { editorState } from '../lib/state.svelte';

  // ---- Hold mode: spacebar toggles showBeforeAfter ---------------------------

  function handleKeyDown(e: KeyboardEvent): void {
    if (editorState.beforeAfterMode !== 'hold') return;
    if (e.code !== 'Space') return;
    // Don't intercept space when user is typing in an input/textarea
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

  // Derived: should show the split overlay?
  let showSplit = $derived(
    editorState.beforeAfterMode === 'split' &&
    editorState.sourceImage !== null &&
    editorState.canvas !== null,
  );

  // Derived: should show the "before" full overlay (hold mode)?
  let showHoldOverlay = $derived(
    editorState.beforeAfterMode === 'hold' &&
    editorState.showBeforeAfter &&
    editorState.sourceImage !== null &&
    editorState.canvas !== null,
  );

  // Build a downscaled nearest-neighbor ImageData from source that matches canvas dims
  let downscaledSourceUrl = $derived.by((): string | null => {
    if (!editorState.sourceImage || !editorState.canvas) return null;
    const src = editorState.sourceImage;
    const cw = editorState.canvas.width;
    const ch = editorState.canvas.height;

    // Create an offscreen canvas at the target (canvas) dimensions
    const off = new OffscreenCanvas(cw, ch);
    const ctx = off.getContext('2d');
    if (!ctx) return null;

    // First put source into a temp canvas at its native size
    const srcCanvas = new OffscreenCanvas(src.width, src.height);
    const srcCtx = srcCanvas.getContext('2d');
    if (!srcCtx) return null;
    srcCtx.putImageData(src, 0, 0);

    // Draw with nearest-neighbor downscale
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(srcCanvas, 0, 0, cw, ch);

    // Convert to a blob URL
    // Since $derived must be synchronous, we use a canvas data URL
    const tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = cw;
    tmpCanvas.height = ch;
    const tmpCtx = tmpCanvas.getContext('2d');
    if (!tmpCtx) return null;
    tmpCtx.drawImage(off, 0, 0);
    return tmpCanvas.toDataURL();
  });
</script>

<!-- Hold mode: listen for spacebar globally (handlers check mode internally) -->
<svelte:window onkeydown={handleKeyDown} onkeyup={handleKeyUp} />

<!-- Hold overlay: show source image over the entire canvas area -->
{#if showHoldOverlay && downscaledSourceUrl}
  <div class="hold-overlay">
    <img
      src={downscaledSourceUrl}
      alt="Original source"
      class="pixelated overlay-img"
      draggable="false"
    />
    <div class="hold-label">Original</div>
  </div>
{/if}

<!-- Split overlay: left side shows source, right side shows canvas -->
{#if showSplit && downscaledSourceUrl}
  <div
    class="split-container"
    bind:this={containerEl}
    role="separator"
    aria-label="Before/after split divider"
  >
    <!-- Left side: source image, clipped by split position -->
    <div
      class="split-left"
      style="clip-path: inset(0 {(1 - editorState.splitPosition) * 100}% 0 0);"
    >
      <img
        src={downscaledSourceUrl}
        alt="Original source"
        class="pixelated overlay-img"
        draggable="false"
      />
      <div class="split-label left-label">Before</div>
    </div>

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

    <!-- Right label (always visible on the right half) -->
    <div
      class="split-label right-label"
      style="left: {editorState.splitPosition * 100}%;"
    >
      After
    </div>
  </div>
{/if}

<style>
  /* ---- Hold overlay ---- */
  .hold-overlay {
    position: absolute;
    inset: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-secondary, #16213e);
    pointer-events: none;
  }

  .overlay-img {
    image-rendering: pixelated;
    image-rendering: crisp-edges;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .hold-label {
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.6);
    color: var(--accent, #4fc3f7);
    padding: 2px 10px;
    border-radius: 4px;
    font-size: 11px;
    pointer-events: none;
    white-space: nowrap;
  }

  /* ---- Split overlay ---- */
  .split-container {
    position: absolute;
    inset: 0;
    z-index: 10;
    pointer-events: none;
  }

  .split-left {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-secondary, #16213e);
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

  /* ---- Divider ---- */
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
