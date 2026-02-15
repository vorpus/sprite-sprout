<script lang="ts">
  import Toolbar from './Toolbar.svelte';
  import CanvasArea from './CanvasArea.svelte';
  import CleanupPanel from './CleanupPanel.svelte';
  import StatusBar from './StatusBar.svelte';
</script>

<div class="editor">
  <div class="toolbar">
    <Toolbar />
  </div>
  <div class="canvas-area">
    <CanvasArea />
  </div>
  <div class="panel-right">
    <CleanupPanel />
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
</style>
