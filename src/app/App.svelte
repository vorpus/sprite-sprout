<script lang="ts">
  import Toolbar from './Toolbar.svelte';
  import CanvasArea from './CanvasArea.svelte';
  import CleanupPanel from './CleanupPanel.svelte';
  import ExportPanel from './ExportPanel.svelte';
  import StatusBar from './StatusBar.svelte';
  import { editorState } from '../lib/state.svelte';

  let exportPanel: ExportPanel;

  function handleKeydown(e: KeyboardEvent): void {
    const mod = e.metaKey || e.ctrlKey;

    // Ctrl+Shift+E — download at native resolution
    if (e.ctrlKey && e.shiftKey && e.key === 'E') {
      e.preventDefault();
      exportPanel?.triggerDownload();
    }
    // Ctrl+Shift+C — copy to clipboard
    if (e.ctrlKey && e.shiftKey && e.key === 'C') {
      e.preventDefault();
      exportPanel?.triggerCopy();
    }

    if (!mod) return;

    // Ctrl+Shift+Z or Ctrl+Y — Redo
    if ((e.key === 'z' || e.key === 'Z') && e.shiftKey) {
      e.preventDefault();
      editorState.redo();
      return;
    }
    if (e.key === 'y' && !e.shiftKey) {
      e.preventDefault();
      editorState.redo();
      return;
    }

    // Ctrl+Z — Undo
    if (e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      editorState.undo();
      return;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="editor">
  <div class="toolbar">
    <Toolbar />
  </div>
  <div class="canvas-area">
    <CanvasArea />
  </div>
  <div class="panel-right">
    <CleanupPanel />
    <div class="panel-divider"></div>
    <ExportPanel bind:this={exportPanel} />
  </div>
  <div class="status-bar">
    <StatusBar />
  </div>
</div>

<style>
  .editor {
    display: grid;
    grid-template-columns: var(--toolbar-width) 1fr var(--panel-width);
    grid-template-rows: 1fr var(--statusbar-height);
    grid-template-areas:
      "toolbar canvas panel"
      "status  status status";
    height: 100%;
    background: var(--bg-primary);
  }

  .toolbar {
    grid-area: toolbar;
    background: var(--bg-panel);
    border-right: 1px solid var(--border-color);
  }

  .canvas-area {
    grid-area: canvas;
    background: var(--bg-secondary);
    overflow: hidden;
    position: relative;
  }

  .panel-right {
    grid-area: panel;
    background: var(--bg-panel);
    border-left: 1px solid var(--border-color);
    overflow-y: auto;
  }

  .status-bar {
    grid-area: status;
    background: var(--bg-panel);
    border-top: 1px solid var(--border-color);
    display: flex;
    align-items: center;
    padding: 0 12px;
    font-size: 11px;
    color: var(--text-secondary);
  }

  .panel-divider {
    height: 1px;
    background: var(--border-color);
    margin: 0 12px;
  }
</style>
