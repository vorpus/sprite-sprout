<script lang="ts">
  import { editorState } from '../lib/state.svelte';
  import type { ToolType } from '../lib/types';

  const tools: Array<{ id: ToolType; icon: string; name: string; shortcut: string }> = [
    { id: 'pencil', icon: 'stylus', name: 'Pencil', shortcut: 'P' },
    { id: 'eraser', icon: 'ink_eraser', name: 'Eraser', shortcut: 'E' },
    { id: 'fill', icon: 'format_color_fill', name: 'Fill', shortcut: 'G' },
    { id: 'picker', icon: 'colorize', name: 'Picker', shortcut: 'I' },
  ];

  interface Props {
    onhelp?: () => void;
  }

  let { onhelp }: Props = $props();

  function selectTool(id: ToolType): void {
    editorState.activeTool = id;
  }

  function handleClear(): void {
    editorState.reset();
  }

  function handleKeyDown(e: KeyboardEvent): void {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    for (const tool of tools) {
      if (e.key.toLowerCase() === tool.shortcut.toLowerCase()) {
        editorState.activeTool = tool.id;
        return;
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="toolbar-inner">
  <span class="label">Tools</span>

  {#each tools as tool (tool.id)}
    <button
      class="tool-btn"
      class:active={editorState.activeTool === tool.id}
      onclick={() => selectTool(tool.id)}
    >
      <span class="material-symbols-outlined">{tool.icon}</span>
      <span class="tooltip">{tool.name} <kbd>{tool.shortcut}</kbd></span>
    </button>
  {/each}

  {#if editorState.canvas}
    <button class="tool-btn clear-btn" onclick={handleClear}>
      <span class="material-symbols-outlined">bomb</span>
      <span class="tooltip">Clear</span>
    </button>
  {/if}

  <div class="spacer"></div>

  <button class="tool-btn help-btn" onclick={onhelp}>
    <span class="material-symbols-outlined">help</span>
    <span class="tooltip">About</span>
  </button>
</div>

<style>
  .toolbar-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 0;
    gap: 4px;
    height: 100%;
  }

  .label {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-secondary);
    padding-top: 4px;
    padding-bottom: 4px;
  }

  .spacer {
    flex: 1;
  }

  .tool-btn {
    position: relative;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: background 0.1s, color 0.1s, border-color 0.1s;
  }

  .tool-btn .material-symbols-outlined {
    font-size: 20px;
  }

  .tool-btn:hover {
    background: var(--bg-surface);
    color: var(--text-primary);
  }

  .tool-btn.active {
    background: var(--accent);
    color: #111;
    border-color: var(--accent);
  }

  .clear-btn {
    margin-top: 8px;
  }

  .clear-btn:hover {
    color: var(--error-color, #ff5555);
  }

  .help-btn {
    margin-bottom: 4px;
  }

  /* Custom tooltip — shows instantly on hover */
  .tooltip {
    display: none;
    position: absolute;
    left: calc(100% + 8px);
    top: 50%;
    transform: translateY(-50%);
    white-space: nowrap;
    background: var(--bg-surface);
    color: var(--text-primary);
    font-size: 11px;
    font-weight: normal;
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid var(--border-color);
    pointer-events: none;
    z-index: 50;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .tooltip kbd {
    display: inline-block;
    font-family: inherit;
    font-size: 10px;
    padding: 0 4px;
    margin-left: 4px;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 3px;
    color: var(--text-secondary);
  }

  .tool-btn:hover .tooltip {
    display: block;
  }
</style>
