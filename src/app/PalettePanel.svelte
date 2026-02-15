<script lang="ts">
  import type { Color } from '../lib/types';
  import { editorState } from '../lib/state.svelte';
  import { extractTopColors, extractColors } from '../lib/engine/color/palette';
  import { remapToPalette } from '../lib/engine/color/remap';
  import { rgbToLab } from '../lib/engine/color/distance';

  // ---------------------------------------------------------------------------
  // Local state
  // ---------------------------------------------------------------------------

  let paletteLocked: boolean = $state(false);
  let sortMode: 'frequency' | 'hue' | 'luminance' = $state('frequency');

  /** Hidden native color-picker element, driven programmatically */
  let colorPickerEl: HTMLInputElement | undefined = $state(undefined);
  let editingIndex: number = $state(-1);

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  let hasCanvas: boolean = $derived(editorState.canvas !== null);

  let colorCount: number = $derived(editorState.palette.length);

  /** Sorted copy of the palette for display */
  let sortedPalette: { color: Color; originalIndex: number }[] = $derived.by(() => {
    const entries = editorState.palette.map((c, i) => ({ color: c, originalIndex: i }));

    if (sortMode === 'hue') {
      entries.sort((a, b) => hue(a.color) - hue(b.color));
    } else if (sortMode === 'luminance') {
      entries.sort((a, b) => luminance(a.color) - luminance(b.color));
    } else {
      // frequency — need canvas pixel data
      if (editorState.canvas) {
        // Access canvasVersion to create reactive dependency on pixel changes
        void editorState.canvasVersion;
        const freqMap = extractColors(editorState.canvas.data);
        entries.sort((a, b) => {
          const keyA = (a.color[0] << 16) | (a.color[1] << 8) | a.color[2];
          const keyB = (b.color[0] << 16) | (b.color[1] << 8) | b.color[2];
          return (freqMap.get(keyB) ?? 0) - (freqMap.get(keyA) ?? 0);
        });
      }
    }

    return entries;
  });

  /** Active color as hex string */
  let activeHex: string = $derived(colorToHex(editorState.activeColor));

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function colorToHex(c: Color): string {
    return (
      '#' +
      c[0].toString(16).padStart(2, '0') +
      c[1].toString(16).padStart(2, '0') +
      c[2].toString(16).padStart(2, '0')
    );
  }

  function hexToColor(hex: string): Color | null {
    const m = hex.match(/^#?([0-9a-f]{6})$/i);
    if (!m) return null;
    const v = parseInt(m[1], 16);
    return [((v >> 16) & 0xff), ((v >> 8) & 0xff), (v & 0xff), 255];
  }

  function colorToCss(c: Color): string {
    return `rgba(${c[0]},${c[1]},${c[2]},${c[3] / 255})`;
  }

  /** Simple hue from RGB (0-360). Used for sorting. */
  function hue(c: Color): number {
    const r = c[0] / 255;
    const g = c[1] / 255;
    const b = c[2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    if (d === 0) return 0;
    let h: number;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
    return h;
  }

  /** Relative luminance (Y from Lab). Used for sorting. */
  function luminance(c: Color): number {
    const lab = rgbToLab(c[0], c[1], c[2]);
    return lab[0]; // L component
  }

  /**
   * Find the palette index whose color is nearest to the given color
   * (simple Euclidean in RGB — fine for snap-to-palette).
   */
  function nearestPaletteIdx(c: Color): number {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < editorState.palette.length; i++) {
      const p = editorState.palette[i];
      const dr = c[0] - p[0];
      const dg = c[1] - p[1];
      const db = c[2] - p[2];
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  function selectColor(originalIndex: number): void {
    editorState.activeColorIndex = originalIndex;
    editorState.activeColor = [...editorState.palette[originalIndex]] as Color;
  }

  function handleHexInput(e: Event): void {
    const target = e.target as HTMLInputElement;
    const parsed = hexToColor(target.value);
    if (!parsed) return;

    if (paletteLocked && editorState.palette.length > 0) {
      // Snap to nearest palette color
      const idx = nearestPaletteIdx(parsed);
      editorState.activeColorIndex = idx;
      editorState.activeColor = [...editorState.palette[idx]] as Color;
    } else {
      editorState.activeColor = parsed;
    }
  }

  function extractFromImage(): void {
    if (!editorState.canvas) return;
    const colors = extractTopColors(editorState.canvas.data, 64);
    editorState.palette = colors;
    if (colors.length > 0) {
      editorState.activeColor = [...colors[0]] as Color;
      editorState.activeColorIndex = 0;
    }
  }

  function handleSwatchDblClick(originalIndex: number): void {
    editingIndex = originalIndex;
    // Wait a tick so the ref is ready, then trigger native picker
    requestAnimationFrame(() => {
      if (colorPickerEl) {
        colorPickerEl.value = colorToHex(editorState.palette[originalIndex]);
        colorPickerEl.click();
      }
    });
  }

  function handleColorPickerChange(e: Event): void {
    const target = e.target as HTMLInputElement;
    const newColor = hexToColor(target.value);
    if (!newColor || editingIndex < 0 || editingIndex >= editorState.palette.length) return;

    // Push history before modifying
    editorState.pushHistory('Edit palette color');

    // Build new palette with the changed color
    const newPalette = editorState.palette.map((c) => [...c] as Color);
    newPalette[editingIndex] = newColor;

    // Remap canvas pixels to the new palette
    if (editorState.canvas) {
      editorState.canvas.data.set(remapToPalette(editorState.canvas.data, newPalette));
      editorState.bumpVersion();
    }

    editorState.palette = newPalette;

    // If the edited swatch was the active color, update it
    if (editorState.activeColorIndex === editingIndex) {
      editorState.activeColor = [...newColor] as Color;
    }

    editingIndex = -1;
  }

  function toggleLock(): void {
    paletteLocked = !paletteLocked;
    // If just locked, snap current color to nearest palette entry
    if (paletteLocked && editorState.palette.length > 0) {
      const idx = nearestPaletteIdx(editorState.activeColor);
      editorState.activeColorIndex = idx;
      editorState.activeColor = [...editorState.palette[idx]] as Color;
    }
  }
</script>

<!-- Hidden native color picker, positioned off-screen -->
<input
  type="color"
  bind:this={colorPickerEl}
  class="hidden-picker"
  onchange={handleColorPickerChange}
/>

<div class="panel-inner">
  <h3>Palette</h3>

  {#if !hasCanvas}
    <p class="hint">Import an image to manage palette</p>
  {:else}
    <!-- Active color display -->
    <div class="active-color-section">
      <div class="active-swatch" style:background-color={colorToCss(editorState.activeColor)}></div>
      <input
        type="text"
        class="hex-input"
        value={activeHex}
        maxlength={7}
        spellcheck={false}
        onchange={handleHexInput}
      />
      <button
        class="lock-btn"
        class:locked={paletteLocked}
        onclick={toggleLock}
        title={paletteLocked ? 'Palette locked — colors snap to palette' : 'Palette unlocked — freeform color'}
      >
        {#if paletteLocked}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM15.1 8H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"/>
          </svg>
        {:else}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h1.9c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10z"/>
          </svg>
        {/if}
      </button>
    </div>

    <!-- Palette grid -->
    <div class="palette-grid">
      {#each sortedPalette as { color, originalIndex } (originalIndex)}
        <button
          class="swatch"
          class:active={editorState.activeColorIndex === originalIndex}
          style:background-color={colorToCss(color)}
          title={colorToHex(color)}
          onclick={() => selectColor(originalIndex)}
          ondblclick={() => handleSwatchDblClick(originalIndex)}
        ></button>
      {/each}
    </div>

    <!-- Palette actions -->
    <div class="palette-actions">
      <button class="action-btn full-width" onclick={extractFromImage}>
        Extract from image
      </button>

      <div class="sort-row">
        <label class="sort-label" for="palette-sort">Sort</label>
        <select
          id="palette-sort"
          class="sort-select"
          bind:value={sortMode}
        >
          <option value="frequency">Frequency</option>
          <option value="hue">Hue</option>
          <option value="luminance">Luminance</option>
        </select>
      </div>

      <span class="color-count">{colorCount} color{colorCount !== 1 ? 's' : ''}</span>
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

  /* Active color display */
  .active-color-section {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }

  .active-swatch {
    width: 32px;
    height: 32px;
    border-radius: 4px;
    border: 1px solid var(--border-color);
    flex-shrink: 0;
  }

  .hex-input {
    flex: 1;
    min-width: 0;
    padding: 4px 6px;
    font-size: 12px;
    font-family: monospace;
    background: var(--bg-surface);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    outline: none;
  }

  .hex-input:focus {
    border-color: var(--accent);
  }

  .lock-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    background: var(--bg-surface);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-secondary);
    cursor: pointer;
    flex-shrink: 0;
  }

  .lock-btn:hover {
    background: var(--accent);
    color: #111;
  }

  .lock-btn.locked {
    background: var(--accent);
    color: #111;
    border-color: var(--accent);
  }

  /* Palette grid */
  .palette-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, 16px);
    gap: 2px;
    justify-content: start;
    margin-bottom: 12px;
    max-height: 160px;
    overflow-y: auto;
  }

  .swatch {
    width: 16px;
    height: 16px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 2px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .swatch:hover {
    border-color: var(--text-secondary);
    /* Override global button hover */
    background: inherit;
    color: inherit;
  }

  .swatch.active {
    border-color: #ffffff;
    box-shadow: 0 0 0 1px #ffffff;
  }

  /* Palette actions */
  .palette-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .action-btn {
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

  .action-btn.full-width {
    width: 100%;
  }

  .sort-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .sort-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-secondary);
    opacity: 0.7;
    flex-shrink: 0;
  }

  .sort-select {
    flex: 1;
    min-width: 0;
    padding: 3px 6px;
    font-size: 11px;
    background: var(--bg-surface);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    cursor: pointer;
    outline: none;
  }

  .sort-select:focus {
    border-color: var(--accent);
  }

  .color-count {
    font-size: 10px;
    color: var(--text-secondary);
    opacity: 0.7;
    text-align: center;
  }

  /* Hidden native color picker */
  .hidden-picker {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    pointer-events: none;
  }
</style>
