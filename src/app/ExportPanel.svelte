<script lang="ts">
  import { editorState } from '../lib/state.svelte';
  import {
    exportPNG,
    exportScaledPNG,
    copyToClipboard,
    downloadBlob,
  } from '../lib/engine/io/export';

  const SCALE_OPTIONS = [1, 2, 4, 8, 16] as const;

  let selectedScale: number = $state(1);
  let copyFeedback: boolean = $state(false);
  let exporting: boolean = $state(false);

  let scaledWidth: number = $derived(
    editorState.canvas ? editorState.canvas.width * selectedScale : 0,
  );
  let scaledHeight: number = $derived(
    editorState.canvas ? editorState.canvas.height * selectedScale : 0,
  );

  let hasCanvas: boolean = $derived(editorState.canvas !== null);

  async function handleCopy(): Promise<void> {
    const canvas = editorState.canvas;
    if (!canvas) return;

    try {
      exporting = true;
      const blob = await exportPNG(canvas.data, canvas.width, canvas.height);
      await copyToClipboard(blob);
      copyFeedback = true;
      setTimeout(() => {
        copyFeedback = false;
      }, 1500);
    } finally {
      exporting = false;
    }
  }

  async function handleDownload(): Promise<void> {
    const canvas = editorState.canvas;
    if (!canvas) return;

    try {
      exporting = true;
      const blob = await exportPNG(canvas.data, canvas.width, canvas.height);
      downloadBlob(blob, `sprite-sprout-${canvas.width}x${canvas.height}.png`);
    } finally {
      exporting = false;
    }
  }

  async function handleDownloadScaled(): Promise<void> {
    const canvas = editorState.canvas;
    if (!canvas) return;

    try {
      exporting = true;
      const blob = await exportScaledPNG(
        canvas.data,
        canvas.width,
        canvas.height,
        selectedScale,
      );
      const sw = canvas.width * selectedScale;
      const sh = canvas.height * selectedScale;
      downloadBlob(blob, `sprite-sprout-${sw}x${sh}.png`);
    } finally {
      exporting = false;
    }
  }

  export function triggerDownload(): void {
    handleDownload();
  }

  export function triggerCopy(): void {
    handleCopy();
  }
</script>

<div class="panel-inner">
  <h3>Export</h3>

  {#if !hasCanvas}
    <p class="hint">Import an image to export</p>
  {:else}
    <div class="section">
      <span class="section-label">Quick actions</span>
      <div class="button-row">
        <button
          class="action-btn"
          disabled={exporting}
          onclick={handleCopy}
        >
          {copyFeedback ? 'Copied!' : 'Copy'}
        </button>
        <button
          class="action-btn"
          disabled={exporting}
          onclick={handleDownload}
        >
          Download
        </button>
      </div>
    </div>

    <div class="divider"></div>

    <div class="section">
      <span class="section-label">Scale</span>
      <div class="scale-row">
        {#each SCALE_OPTIONS as scale}
          <button
            class="scale-btn"
            class:active={selectedScale === scale}
            onclick={() => (selectedScale = scale)}
          >
            {scale}x
          </button>
        {/each}
      </div>
      {#if editorState.canvas}
        <span class="dimensions">
          {editorState.canvas.width}x{editorState.canvas.height}
          &rarr;
          {scaledWidth}x{scaledHeight}
        </span>
      {/if}
      <button
        class="action-btn full-width"
        disabled={exporting}
        onclick={handleDownloadScaled}
      >
        Download Scaled
      </button>
    </div>

    <div class="shortcuts">
      <span class="shortcut"><kbd>Ctrl+Shift+E</kbd> Download</span>
      <span class="shortcut"><kbd>Ctrl+Shift+C</kbd> Copy</span>
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

  .action-btn:hover:not(:disabled) {
    background: var(--accent);
    color: #111;
  }

  .action-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .action-btn.full-width {
    flex: none;
    width: 100%;
  }

  .scale-row {
    display: flex;
    gap: 4px;
  }

  .scale-btn {
    flex: 1;
    padding: 4px 0;
    font-size: 11px;
    background: var(--bg-surface);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-primary);
    cursor: pointer;
    text-align: center;
  }

  .scale-btn:hover {
    background: var(--accent);
    color: #111;
  }

  .scale-btn.active {
    background: var(--accent);
    color: #111;
    border-color: var(--accent);
  }

  .dimensions {
    font-size: 11px;
    color: var(--text-secondary);
    text-align: center;
  }

  .divider {
    height: 1px;
    background: var(--border-color);
    margin: 12px 0;
  }

  .shortcuts {
    margin-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .shortcut {
    font-size: 10px;
    color: var(--text-secondary);
    opacity: 0.5;
  }

  kbd {
    font-family: inherit;
    font-size: 10px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 3px;
    padding: 1px 4px;
    margin-right: 4px;
  }
</style>
