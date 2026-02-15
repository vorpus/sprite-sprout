<script lang="ts">
  import { editorState, type BeforeAfterMode } from '../lib/state.svelte';

  function setMode(mode: BeforeAfterMode): void {
    editorState.beforeAfterMode = mode;
    // Reset showBeforeAfter when switching away from hold
    if (mode !== 'hold') {
      editorState.showBeforeAfter = false;
    }
  }

  function openHelp(): void {
    editorState.showOnboarding = true;
  }
</script>

<span>Sprite Sprout</span>
<span class="spacer"></span>
{#if editorState.canvas}
  <span>{editorState.canvas.width}x{editorState.canvas.height}</span>
{/if}
{#if editorState.analysis}
  <span class="separator">|</span>
  <span>{editorState.analysis.uniqueColorCount} colors</span>
  {#if editorState.analysis.looksLikePixelArt}
    <span class="separator">|</span>
    <span>Pixel art detected</span>
  {/if}
{/if}
{#if !editorState.canvas}
  <span>No image loaded</span>
{/if}

{#if editorState.history.canUndo || editorState.history.canRedo}
  <span class="separator">|</span>
  {#if editorState.history.canUndo}
    <span class="history-info">Undo: {editorState.history.undoLabel}</span>
  {/if}
  {#if editorState.history.canRedo}
    <span class="history-info">Redo: {editorState.history.redoLabel}</span>
  {/if}
{/if}

{#if editorState.canvas && editorState.sourceImage}
  <span class="separator">|</span>
  <span class="ba-label">Before/After:</span>
  <span class="ba-group">
    <button
      class="ba-btn"
      class:active={editorState.beforeAfterMode === 'hold'}
      onclick={() => setMode('hold')}
    >Hold</button>
    <button
      class="ba-btn"
      class:active={editorState.beforeAfterMode === 'split'}
      onclick={() => setMode('split')}
    >Split</button>
    <button
      class="ba-btn"
      class:active={editorState.beforeAfterMode === 'off'}
      onclick={() => setMode('off')}
    >Off</button>
  </span>
  {#if editorState.beforeAfterMode === 'hold' && editorState.showBeforeAfter}
    <span class="showing-original">Showing original</span>
  {/if}
{/if}

<button class="help-btn" onclick={openHelp} title="About Sprite Sprout">?</button>

<style>
  .spacer {
    flex: 1;
  }

  .separator {
    margin: 0 6px;
    opacity: 0.4;
  }

  .ba-label {
    margin-right: 4px;
  }

  .ba-group {
    display: inline-flex;
    gap: 1px;
  }

  .ba-btn {
    font-size: 10px;
    padding: 1px 6px;
    border: 1px solid var(--border-color);
    background: var(--bg-surface);
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 3px;
    line-height: 1.4;
  }

  .ba-btn:hover {
    background: var(--bg-panel);
    color: var(--text-primary);
  }

  .ba-btn.active {
    background: var(--accent);
    color: #111;
    border-color: var(--accent);
  }

  .showing-original {
    margin-left: 6px;
    color: var(--accent);
    font-weight: 600;
  }

  .history-info {
    margin: 0 4px;
    opacity: 0.7;
  }

  .help-btn {
    width: 18px;
    height: 18px;
    padding: 0;
    font-size: 11px;
    font-weight: 600;
    line-height: 16px;
    text-align: center;
    border-radius: 50%;
    border: 1px solid var(--border-color);
    background: var(--bg-surface);
    color: var(--text-secondary);
    cursor: pointer;
    flex-shrink: 0;
  }

  .help-btn:hover {
    background: var(--accent);
    color: #111;
    border-color: var(--accent);
  }
</style>
