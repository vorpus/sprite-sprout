<script lang="ts">
  import { editorState } from '../lib/state.svelte';
  import type { ToolType } from '../lib/types';

  const tools: Array<{ id: ToolType; label: string; shortcut: string }> = [
    { id: 'pencil', label: 'P', shortcut: 'p' },
    { id: 'eraser', label: 'E', shortcut: 'e' },
    { id: 'fill', label: 'G', shortcut: 'g' },
    { id: 'picker', label: 'I', shortcut: 'i' },
  ];

  const toolTitles: Record<ToolType, string> = {
    pencil: 'Pencil (P)',
    eraser: 'Eraser (E)',
    fill: 'Fill (G)',
    picker: 'Picker (I)',
  };

  function selectTool(id: ToolType): void {
    editorState.activeTool = id;
  }

  function handleKeyDown(e: KeyboardEvent): void {
    // Ignore if the user is typing in an input
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    for (const tool of tools) {
      if (e.key.toLowerCase() === tool.shortcut) {
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
      title={toolTitles[tool.id]}
      onclick={() => selectTool(tool.id)}
    >
      {tool.label}
    </button>
  {/each}
</div>

<style>
  .toolbar-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 0;
    gap: 4px;
  }

  .label {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-secondary);
    padding-top: 4px;
    padding-bottom: 4px;
  }

  .tool-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 600;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: background 0.1s, color 0.1s, border-color 0.1s;
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
</style>
