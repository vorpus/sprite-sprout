<script lang="ts">
  import { editorState } from '../lib/state.svelte';
  import {
    loadImageFromFile,
    loadImageFromClipboard,
    analyzeImage,
  } from '../lib/engine/io/import';

  // ---- Local reactive state ---------------------------------------------------

  let isDragOver = $state(false);
  let isLoading = $state(false);
  let isDemoLoading = $state(false);
  let errorMessage: string | null = $state(null);

  /** Hidden file input element */
  let fileInput: HTMLInputElement | undefined = $state();

  // ---- Import handler ---------------------------------------------------------

  async function handleImport(file: File): Promise<void> {
    if (!file.type.startsWith('image/')) {
      errorMessage = 'Please drop an image file (PNG, JPG, GIF, etc.)';
      return;
    }

    isLoading = true;
    errorMessage = null;

    try {
      const imageData = await loadImageFromFile(file);

      // Store the original source image
      editorState.sourceImage = imageData;

      // Create a working canvas copy
      editorState.canvas = {
        width: imageData.width,
        height: imageData.height,
        data: new Uint8ClampedArray(imageData.data),
      };

      // Analyze the image
      editorState.analysis = analyzeImage(imageData);

      // Signal that the canvas has new data
      editorState.bumpVersion();
    } catch (err) {
      errorMessage =
        err instanceof Error ? err.message : 'Failed to load image';
    } finally {
      isLoading = false;
    }
  }

  // ---- Drag-and-drop handlers -------------------------------------------------

  function handleDragOver(e: DragEvent): void {
    e.preventDefault();
    isDragOver = true;
  }

  function handleDragLeave(e: DragEvent): void {
    e.preventDefault();
    isDragOver = false;
  }

  async function handleDrop(e: DragEvent): Promise<void> {
    e.preventDefault();
    isDragOver = false;

    const file = e.dataTransfer?.files[0];
    if (file) {
      await handleImport(file);
    }
  }

  // ---- File picker ------------------------------------------------------------

  function openFilePicker(): void {
    fileInput?.click();
  }

  async function handleFileChange(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      await handleImport(file);
    }
    // Reset so the same file can be re-selected
    input.value = '';
  }

  // ---- Demo loader ------------------------------------------------------------

  async function loadDemo(e: MouseEvent): Promise<void> {
    e.stopPropagation();
    isDemoLoading = true;
    errorMessage = null;
    try {
      const res = await fetch('/demo-sprites.png');
      if (!res.ok) throw new Error('Could not load demo image');
      const blob = await res.blob();
      const file = new File([blob], 'demo-sprites.png', { type: 'image/png' });
      await handleImport(file);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Failed to load demo';
    } finally {
      isDemoLoading = false;
    }
  }

  // ---- Clipboard paste --------------------------------------------------------

  async function handlePaste(e: ClipboardEvent): Promise<void> {
    if (!e.clipboardData) return;

    const imageData = await loadImageFromClipboard(e.clipboardData.items);
    if (imageData) {
      e.preventDefault();

      isLoading = true;
      errorMessage = null;

      try {
        editorState.sourceImage = imageData;

        editorState.canvas = {
          width: imageData.width,
          height: imageData.height,
          data: new Uint8ClampedArray(imageData.data),
        };

        editorState.analysis = analyzeImage(imageData);
        editorState.bumpVersion();
      } catch (err) {
        errorMessage =
          err instanceof Error ? err.message : 'Failed to load image';
      } finally {
        isLoading = false;
      }
    }
  }
</script>

<svelte:window onpaste={handlePaste} />

<div
  class="drop-zone"
  class:drag-over={isDragOver}
  class:loading={isLoading}
  role="button"
  tabindex="0"
  aria-label="Import image"
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
  onclick={openFilePicker}
  onkeydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openFilePicker();
    }
  }}
>
  <input
    bind:this={fileInput}
    type="file"
    accept="image/*"
    class="file-input"
    onchange={handleFileChange}
  />

  <div class="drop-content">
    {#if isLoading}
      <p class="label">Loading...</p>
    {:else if isDragOver}
      <p class="label">Release to drop</p>
    {:else}
      <p class="label">Drop an image here</p>
      <p class="hint">or click to browse</p>
      <p class="hint">You can also paste from clipboard</p>
      <button
        class="demo-btn"
        onclick={loadDemo}
        disabled={isDemoLoading}
      >
        {isDemoLoading ? 'Loading demo...' : 'Try a demo image'}
      </button>
    {/if}

    {#if errorMessage}
      <p class="error">{errorMessage}</p>
    {/if}
  </div>
</div>

<style>
  .drop-zone {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px dashed var(--border-color, #555);
    border-radius: 8px;
    margin: 16px;
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background-color 0.15s ease;
  }

  .drop-zone:hover,
  .drop-zone:focus-visible {
    border-color: var(--accent-color, #7c8aff);
    background-color: rgba(124, 138, 255, 0.05);
    outline: none;
  }

  .drop-zone.drag-over {
    border-color: var(--accent-color, #7c8aff);
    background-color: rgba(124, 138, 255, 0.1);
    border-style: solid;
  }

  .drop-zone.loading {
    pointer-events: none;
    opacity: 0.7;
  }

  .file-input {
    display: none;
  }

  .drop-content {
    text-align: center;
    color: var(--text-secondary, #999);
  }

  .label {
    font-size: 14px;
    margin-bottom: 4px;
  }

  .hint {
    font-size: 12px;
    opacity: 0.6;
  }

  .error {
    color: var(--error-color, #ff5555);
    font-size: 12px;
    margin-top: 8px;
  }

  .demo-btn {
    margin-top: 16px;
    padding: 6px 16px;
    font-size: 12px;
    background: var(--accent, #4fc3f7);
    color: #111;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
    transition: background-color 0.15s ease;
  }

  .demo-btn:hover {
    background: var(--accent-hover, #81d4fa);
    color: #111;
  }

  .demo-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
