<script lang="ts">
  import { editorState } from '../lib/state.svelte';
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

<style>
  .spacer {
    flex: 1;
  }

  .separator {
    margin: 0 6px;
    opacity: 0.4;
  }
</style>
