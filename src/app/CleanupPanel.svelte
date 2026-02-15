<script lang="ts">
  import { editorState } from '../lib/state.svelte';
  import { autoClean, suggestColorCount } from '../lib/engine/cleanup/pipeline';
  import { snapToGrid } from '../lib/engine/grid/snap';
  import { extractTopColors } from '../lib/engine/color/palette';
  import { calculateFitZoom } from '../lib/engine/canvas/renderer';
  import {
    quantize,
    QUANTIZE_METHODS,
    type QuantizeMethod,
  } from '../lib/engine/color/quantize-dispatch';

  // ---------------------------------------------------------------------------
  // Local state
  // ---------------------------------------------------------------------------

  let gridSizeInput: number = $state(4);
  let colorCountInput: number = $state(16);
  let colorMethod: QuantizeMethod = $state('median-cut');
  let colorsReduced: boolean = $state(false);
  let bannerDismissed: boolean = $state(false);
  let cleanupApplied: boolean = $state(false);

  // Debounce timers
  let gridDebounceTimer: ReturnType<typeof setTimeout> | undefined = $state(undefined);
  let colorDebounceTimer: ReturnType<typeof setTimeout> | undefined = $state(undefined);

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  let hasCanvas: boolean = $derived(editorState.canvas !== null);

  let hasAnalysis: boolean = $derived(editorState.analysis !== null);

  let showBanner: boolean = $derived(
    hasAnalysis && !bannerDismissed && !cleanupApplied,
  );

  let detectedGrid: number = $derived(editorState.detectedGridSize ?? 4);

  let analysisColorCount: number = $derived(
    editorState.analysis?.uniqueColorCount ?? 0,
  );

  let suggestedGridSizes: number[] = $derived(
    editorState.analysis?.suggestedGridSizes ?? [],
  );

  let topCandidates: number[] = $derived(suggestedGridSizes.slice(0, 3));

  // ---------------------------------------------------------------------------
  // Sync grid size input when detection changes
  // ---------------------------------------------------------------------------

  $effect(() => {
    if (editorState.detectedGridSize !== null) {
      gridSizeInput = editorState.detectedGridSize;
    }
  });

  $effect(() => {
    if (editorState.analysis) {
      const suggested = suggestColorCount(editorState.analysis.uniqueColorCount);
      colorCountInput = suggested;
    }
  });

  /**
   * Fit and center the canvas in the viewport after a resize.
   * Falls back to reading the DOM if editorState viewport values aren't set.
   */
  function fitAndCenter(canvasW: number, canvasH: number): void {
    let vw = editorState.viewportW;
    let vh = editorState.viewportH;

    // Fallback: read from the canvas container element directly
    if (vw <= 0 || vh <= 0) {
      const el = document.querySelector('[role="application"][aria-label="Pixel art canvas"]');
      if (el) {
        const rect = el.getBoundingClientRect();
        vw = rect.width;
        vh = rect.height;
        editorState.viewportW = vw;
        editorState.viewportH = vh;
      }
    }

    if (vw <= 0 || vh <= 0 || canvasW <= 0 || canvasH <= 0) return;

    const newZoom = calculateFitZoom(canvasW, canvasH, vw, vh);
    editorState.zoom = newZoom;
    editorState.panX = (vw - canvasW * newZoom) / 2;
    editorState.panY = (vh - canvasH * newZoom) / 2;
  }

  // ---------------------------------------------------------------------------
  // Grid preview (debounced)
  // ---------------------------------------------------------------------------

  function scheduleGridPreview(): void {
    clearTimeout(gridDebounceTimer);
    gridDebounceTimer = setTimeout(() => {
      runGridPreview();
    }, 200);
  }

  function runGridPreview(): void {
    const canvas = editorState.canvas;
    if (!canvas) return;

    const source = editorState.sourceImage;
    if (!source) return;

    const sourceData = new Uint8ClampedArray(source.data);
    const result = snapToGrid(sourceData, source.width, source.height, gridSizeInput);

    editorState.cleanupPreview = {
      data: result.data,
      width: result.width,
      height: result.height,
    };
    editorState.showingPreview = true;
  }

  function cancelGridPreview(): void {
    clearTimeout(gridDebounceTimer);
    editorState.cleanupPreview = null;
    editorState.showingPreview = false;
  }

  function applyGridSnap(): void {
    const canvas = editorState.canvas;
    if (!canvas) return;

    const source = editorState.sourceImage;
    if (!source) return;

    const sourceData = new Uint8ClampedArray(source.data);
    const result = snapToGrid(sourceData, source.width, source.height, gridSizeInput);

    editorState.pushHistory('Grid snap');
    editorState.canvas = {
      width: result.width,
      height: result.height,
      data: result.data,
    };

    // Re-apply color reduction if it was previously active
    if (colorsReduced) {
      const quantized = quantize(
        result.data,
        result.width,
        result.height,
        colorCountInput,
        colorMethod,
      );
      editorState.canvas.data.set(quantized.remappedData);
      editorState.palette = quantized.palette;
    } else {
      editorState.palette = extractTopColors(result.data, 64);
    }

    editorState.cleanupPreview = null;
    editorState.showingPreview = false;
    editorState.bumpVersion();
    fitAndCenter(result.width, result.height);
    cleanupApplied = true;
  }

  // ---------------------------------------------------------------------------
  // Color preview (debounced)
  // ---------------------------------------------------------------------------

  function scheduleColorPreview(): void {
    clearTimeout(colorDebounceTimer);
    colorDebounceTimer = setTimeout(() => {
      runColorPreview();
    }, 200);
  }

  function runColorPreview(): void {
    const canvas = editorState.canvas;
    if (!canvas) return;

    const quantized = quantize(
      canvas.data,
      canvas.width,
      canvas.height,
      colorCountInput,
      colorMethod,
    );

    editorState.cleanupPreview = {
      data: quantized.remappedData,
      width: canvas.width,
      height: canvas.height,
    };
    editorState.showingPreview = true;
  }

  function cancelColorPreview(): void {
    clearTimeout(colorDebounceTimer);
    editorState.cleanupPreview = null;
    editorState.showingPreview = false;
  }

  function applyReduceColors(): void {
    const canvas = editorState.canvas;
    if (!canvas) return;

    const quantized = quantize(
      canvas.data,
      canvas.width,
      canvas.height,
      colorCountInput,
      colorMethod,
    );

    editorState.pushHistory('Reduce colors');
    canvas.data.set(quantized.remappedData);
    editorState.palette = quantized.palette;
    editorState.cleanupPreview = null;
    editorState.showingPreview = false;
    editorState.bumpVersion();
    colorsReduced = true;
    cleanupApplied = true;
  }

  // ---------------------------------------------------------------------------
  // Auto-clean
  // ---------------------------------------------------------------------------

  function handleAutoClean(): void {
    const source = editorState.sourceImage;
    if (!source) return;

    const sourceData = new Uint8ClampedArray(source.data);
    const result = autoClean(sourceData, source.width, source.height);

    // Sync UI controls to reflect what auto-clean chose
    gridSizeInput = result.gridSize;
    colorMethod = 'octree-refine';
    if (result.reduced) {
      colorCountInput = result.reducedColorCount;
    }

    editorState.pushHistory('Auto-Clean');

    // Apply grid snap result
    const finalData = result.reduced ? result.reduced : result.snapped;
    editorState.canvas = {
      width: finalData.width,
      height: finalData.height,
      data: finalData.data,
    };

    // Update palette
    if (result.reduced) {
      editorState.palette = result.reduced.palette;
    } else {
      editorState.palette = extractTopColors(result.snapped.data, 64);
    }

    editorState.cleanupPreview = null;
    editorState.showingPreview = false;
    editorState.bumpVersion();
    fitAndCenter(finalData.width, finalData.height);
    colorsReduced = result.reduced !== null;
    cleanupApplied = true;
    bannerDismissed = true;
  }

  // ---------------------------------------------------------------------------
  // Grid input handlers
  // ---------------------------------------------------------------------------

  function handleGridInput(e: Event): void {
    const target = e.target as HTMLInputElement;
    const val = parseInt(target.value, 10);
    if (!isNaN(val) && val >= 2 && val <= 32) {
      gridSizeInput = val;
      scheduleGridPreview();
    }
  }

  function selectCandidate(size: number): void {
    gridSizeInput = size;
    scheduleGridPreview();
  }

  function handleColorInput(e: Event): void {
    const target = e.target as HTMLInputElement;
    const val = parseInt(target.value, 10);
    if (!isNaN(val) && val >= 2 && val <= 64) {
      colorCountInput = val;
      scheduleColorPreview();
    }
  }

  function handleMethodChange(e: Event): void {
    colorMethod = (e.target as HTMLSelectElement).value as QuantizeMethod;
    scheduleColorPreview();
  }
</script>

<div class="panel-inner">
  <h3>Cleanup</h3>

  {#if !hasCanvas}
    <p class="hint">Import an image to see cleanup options</p>
  {:else}
    <!-- Smart banner -->
    {#if showBanner}
      <div class="banner">
        <p class="banner-text">
          Detected ~{detectedGrid}x{detectedGrid} grid, {analysisColorCount} colors
        </p>
        <div class="banner-actions">
          <button class="action-btn accent" onclick={handleAutoClean}>
            Auto-Clean
          </button>
          <button
            class="link-btn"
            onclick={() => (bannerDismissed = true)}
          >
            Dismiss
          </button>
        </div>
      </div>
      <div class="divider"></div>
    {/if}

    <!-- Grid section -->
    <div class="section">
      <span class="section-label">Grid Size</span>
      {#if editorState.detectedGridSize !== null}
        <span class="detected-label">detected: {editorState.detectedGridSize}px</span>
      {/if}

      <div class="input-row">
        <input
          type="range"
          min="2"
          max="32"
          bind:value={gridSizeInput}
          oninput={handleGridInput}
          class="slider"
        />
        <input
          type="number"
          min="2"
          max="32"
          bind:value={gridSizeInput}
          oninput={handleGridInput}
          class="num-input"
        />
      </div>

      {#if topCandidates.length > 0}
        <div class="chip-row">
          {#each topCandidates as size}
            <button
              class="chip"
              class:active={gridSizeInput === size}
              onclick={() => selectCandidate(size)}
            >
              {size}px
            </button>
          {/each}
        </div>
      {/if}

      <div class="button-row">
        <button class="action-btn" onclick={applyGridSnap}>
          Apply Grid Snap
        </button>
        {#if editorState.showingPreview}
          <button class="action-btn cancel" onclick={cancelGridPreview}>
            Cancel
          </button>
        {/if}
      </div>
    </div>

    <div class="divider"></div>

    <!-- Palette section -->
    <div class="section">
      <span class="section-label">
        Colors: {analysisColorCount}
      </span>

      <select class="method-select" value={colorMethod} onchange={handleMethodChange}>
        {#each QUANTIZE_METHODS as m}
          <option value={m.value}>{m.label}</option>
        {/each}
      </select>

      <div class="input-row">
        <input
          type="range"
          min="2"
          max="64"
          bind:value={colorCountInput}
          oninput={handleColorInput}
          class="slider"
        />
        <input
          type="number"
          min="2"
          max="64"
          bind:value={colorCountInput}
          oninput={handleColorInput}
          class="num-input"
        />
      </div>

      <div class="button-row">
        <button class="action-btn" onclick={applyReduceColors}>
          Reduce Colors
        </button>
        {#if editorState.showingPreview}
          <button class="action-btn cancel" onclick={cancelColorPreview}>
            Cancel
          </button>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .panel-inner {
    padding: 12px;
  }

  h3 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-secondary);
    margin-bottom: 12px;
  }

  .hint {
    font-size: 11px;
    color: var(--text-secondary);
    opacity: 0.6;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .section-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-secondary);
    opacity: 0.7;
  }

  .detected-label {
    font-size: 10px;
    color: var(--accent);
    opacity: 0.8;
  }

  .input-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .slider {
    flex: 1;
    height: 4px;
    accent-color: var(--accent);
    cursor: pointer;
  }

  .num-input {
    width: 48px;
    padding: 4px 6px;
    font-size: 12px;
    background: var(--bg-surface);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    text-align: center;
  }

  .chip-row {
    display: flex;
    gap: 4px;
  }

  .chip {
    padding: 3px 8px;
    font-size: 11px;
    background: var(--bg-surface);
    border: 1px solid var(--border-color);
    border-radius: 10px;
    color: var(--text-primary);
    cursor: pointer;
  }

  .chip:hover {
    background: var(--accent);
    color: #111;
  }

  .chip.active {
    background: var(--accent);
    color: #111;
    border-color: var(--accent);
  }

  .button-row {
    display: flex;
    gap: 6px;
  }

  .action-btn {
    flex: 1;
    padding: 6px 10px;
    font-size: 12px;
    background: var(--bg-surface);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    cursor: pointer;
  }

  .action-btn:hover {
    background: var(--accent);
    color: #111;
  }

  .action-btn.accent {
    background: var(--accent);
    color: #111;
    border-color: var(--accent);
  }

  .action-btn.accent:hover {
    opacity: 0.9;
  }

  .action-btn.cancel {
    flex: none;
    background: transparent;
    border-color: var(--text-secondary);
    color: var(--text-secondary);
  }

  .action-btn.cancel:hover {
    background: var(--bg-surface);
    color: var(--text-primary);
  }

  .link-btn {
    background: none;
    border: none;
    color: var(--text-secondary);
    font-size: 11px;
    cursor: pointer;
    text-decoration: underline;
    padding: 0;
  }

  .link-btn:hover {
    color: var(--text-primary);
  }

  .banner {
    background: var(--bg-surface);
    border: 1px solid var(--accent);
    border-radius: 6px;
    padding: 10px;
    margin-bottom: 4px;
  }

  .banner-text {
    font-size: 12px;
    color: var(--text-primary);
    margin-bottom: 8px;
  }

  .banner-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .divider {
    height: 1px;
    background: var(--border-color);
    margin: 12px 0;
  }

  .method-select {
    width: 100%;
    padding: 4px 6px;
    font-size: 12px;
    background: var(--bg-surface);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    cursor: pointer;
  }

  .method-select:focus {
    outline: 1px solid var(--accent);
    outline-offset: -1px;
  }
</style>
