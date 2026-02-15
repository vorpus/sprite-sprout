<script lang="ts">
  import { editorState } from '../lib/state.svelte';
  import {
    screenToPixel,
    pixelToScreen,
    calculateFitZoom,
    nextZoomLevel,
    prevZoomLevel,
    clampPan,
  } from '../lib/engine/canvas/renderer';

  // ---- Local reactive state -------------------------------------------------

  /** The visible <canvas> element */
  let displayCanvas: HTMLCanvasElement | undefined = $state();

  /** Container element for the ResizeObserver */
  let container: HTMLDivElement | undefined = $state();

  /** Viewport dimensions (updated by ResizeObserver) */
  let viewportW = $state(0);
  let viewportH = $state(0);

  /** Pixel coordinate the mouse is currently hovering */
  let hoverPixelX = $state(-1);
  let hoverPixelY = $state(-1);

  /** Is a pan gesture active? */
  let isPanning = $state(false);

  /** Is Space held? */
  let spaceHeld = $state(false);

  /** Last pointer position during pan */
  let lastPanX = 0;
  let lastPanY = 0;

  /** Dirty flag for rAF coalescing */
  let dirty = false;
  let rafId: number | undefined;

  /** Offscreen canvas used for building the native-resolution image */
  let offscreen: OffscreenCanvas | undefined;
  let offCtx: OffscreenCanvasRenderingContext2D | undefined | null;

  // ---- Derived values -------------------------------------------------------

  let canvas = $derived(editorState.canvas);
  let zoom = $derived(editorState.zoom);
  let panX = $derived(editorState.panX);
  let panY = $derived(editorState.panY);

  // ---- Rendering ------------------------------------------------------------

  function markDirty(): void {
    if (dirty) return;
    dirty = true;
    rafId = requestAnimationFrame(render);
  }

  function render(): void {
    dirty = false;
    rafId = undefined;

    if (!displayCanvas || !canvas) return;

    const ctx = displayCanvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = viewportW;
    const h = viewportH;

    // Ensure the canvas backing store matches the viewport
    const physW = Math.round(w * dpr);
    const physH = Math.round(h * dpr);
    if (displayCanvas.width !== physW || displayCanvas.height !== physH) {
      displayCanvas.width = physW;
      displayCanvas.height = physH;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 1. Clear
    ctx.clearRect(0, 0, w, h);

    // 2. Determine which pixel data to show
    let pixelData: Uint8ClampedArray;
    let dataW: number;
    let dataH: number;

    if (
      editorState.showingPreview &&
      editorState.cleanupPreview
    ) {
      pixelData = editorState.cleanupPreview.data;
      dataW = editorState.cleanupPreview.width;
      dataH = editorState.cleanupPreview.height;
    } else {
      pixelData = canvas.data;
      dataW = canvas.width;
      dataH = canvas.height;
    }

    // 3. Write pixel data to offscreen canvas at native resolution
    if (
      !offscreen ||
      offscreen.width !== dataW ||
      offscreen.height !== dataH
    ) {
      offscreen = new OffscreenCanvas(dataW, dataH);
      offCtx = offscreen.getContext('2d');
    }

    if (!offCtx) return;

    const imgData = new ImageData(
      new Uint8ClampedArray(pixelData),
      dataW,
      dataH,
    );
    offCtx.putImageData(imgData, 0, 0);

    // 4. Draw offscreen canvas scaled by zoom, offset by pan
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      offscreen,
      panX,
      panY,
      dataW * zoom,
      dataH * zoom,
    );

    // 5. Grid lines
    if (editorState.showGrid && zoom >= 6) {
      drawGrid(ctx, dataW, dataH);
    }

    // 6. Cursor highlight
    if (
      zoom >= 4 &&
      hoverPixelX >= 0 &&
      hoverPixelX < dataW &&
      hoverPixelY >= 0 &&
      hoverPixelY < dataH
    ) {
      drawCursorHighlight(ctx);
    }
  }

  function drawGrid(
    ctx: CanvasRenderingContext2D,
    dataW: number,
    dataH: number,
  ): void {
    const alpha = zoom >= 16 ? 0.25 : 0.15;
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
    ctx.lineWidth = 1;

    ctx.beginPath();

    // Vertical lines
    for (let x = 0; x <= dataW; x++) {
      const sx = Math.round(panX + x * zoom) + 0.5;
      ctx.moveTo(sx, panY);
      ctx.lineTo(sx, panY + dataH * zoom);
    }

    // Horizontal lines
    for (let y = 0; y <= dataH; y++) {
      const sy = Math.round(panY + y * zoom) + 0.5;
      ctx.moveTo(panX, sy);
      ctx.lineTo(panX + dataW * zoom, sy);
    }

    ctx.stroke();
  }

  function drawCursorHighlight(ctx: CanvasRenderingContext2D): void {
    const sx = panX + hoverPixelX * zoom;
    const sy = panY + hoverPixelY * zoom;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      Math.round(sx) + 0.5,
      Math.round(sy) + 0.5,
      Math.round(zoom) - 1,
      Math.round(zoom) - 1,
    );
  }

  // ---- Zoom -----------------------------------------------------------------

  function handleWheel(e: WheelEvent): void {
    e.preventDefault();

    if (!canvas || !displayCanvas) return;

    const rect = displayCanvas.getBoundingClientRect();
    const cursorScreenX = e.clientX - rect.left;
    const cursorScreenY = e.clientY - rect.top;

    // Pixel under cursor before zoom
    const pixBefore = {
      x: (cursorScreenX - panX) / zoom,
      y: (cursorScreenY - panY) / zoom,
    };

    const newZoom =
      e.deltaY < 0
        ? nextZoomLevel(zoom)
        : prevZoomLevel(zoom);

    // Adjust pan to keep the pixel under the cursor in the same screen position
    let newPanX = cursorScreenX - pixBefore.x * newZoom;
    let newPanY = cursorScreenY - pixBefore.y * newZoom;

    const clamped = clampPan(
      newPanX,
      newPanY,
      canvas.width,
      canvas.height,
      newZoom,
      viewportW,
      viewportH,
    );

    editorState.zoom = newZoom;
    editorState.panX = clamped.panX;
    editorState.panY = clamped.panY;
  }

  // ---- Pan ------------------------------------------------------------------

  function startPan(e: PointerEvent): void {
    isPanning = true;
    lastPanX = e.clientX;
    lastPanY = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerDown(e: PointerEvent): void {
    // Middle-click or Space + left-click
    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      e.preventDefault();
      startPan(e);
    }
  }

  function handlePointerMove(e: PointerEvent): void {
    if (!displayCanvas || !canvas) return;

    if (isPanning) {
      const dx = e.clientX - lastPanX;
      const dy = e.clientY - lastPanY;
      lastPanX = e.clientX;
      lastPanY = e.clientY;

      const clamped = clampPan(
        panX + dx,
        panY + dy,
        canvas.width,
        canvas.height,
        zoom,
        viewportW,
        viewportH,
      );

      editorState.panX = clamped.panX;
      editorState.panY = clamped.panY;
      return;
    }

    // Update hover pixel
    const rect = displayCanvas.getBoundingClientRect();
    const pix = screenToPixel(
      e.clientX,
      e.clientY,
      zoom,
      panX,
      panY,
      rect,
    );
    hoverPixelX = Math.floor(pix.x);
    hoverPixelY = Math.floor(pix.y);
    markDirty();
  }

  function handlePointerUp(_e: PointerEvent): void {
    isPanning = false;
  }

  function handlePointerLeave(): void {
    hoverPixelX = -1;
    hoverPixelY = -1;
    isPanning = false;
    markDirty();
  }

  // ---- Keyboard (space for pan) ---------------------------------------------

  function handleKeyDown(e: KeyboardEvent): void {
    if (e.code === 'Space') {
      e.preventDefault();
      spaceHeld = true;
    }
  }

  function handleKeyUp(e: KeyboardEvent): void {
    if (e.code === 'Space') {
      spaceHeld = false;
      if (isPanning) isPanning = false;
    }
  }

  // ---- Public API -----------------------------------------------------------

  /**
   * Fit the sprite canvas to the current viewport with comfortable padding.
   */
  export function fitToView(): void {
    if (!canvas) return;

    const newZoom = calculateFitZoom(
      canvas.width,
      canvas.height,
      viewportW,
      viewportH,
    );

    // Center the canvas
    const scaledW = canvas.width * newZoom;
    const scaledH = canvas.height * newZoom;
    const newPanX = (viewportW - scaledW) / 2;
    const newPanY = (viewportH - scaledH) / 2;

    editorState.zoom = newZoom;
    editorState.panX = newPanX;
    editorState.panY = newPanY;
  }

  // ---- Effects --------------------------------------------------------------

  // Re-render whenever canvas version, zoom, pan, or viewport changes
  $effect(() => {
    // Touch reactive dependencies to subscribe
    editorState.canvasVersion;
    editorState.zoom;
    editorState.panX;
    editorState.panY;
    editorState.showGrid;
    editorState.showingPreview;
    editorState.cleanupPreview;
    viewportW;
    viewportH;

    markDirty();
  });

  // ResizeObserver for viewport size tracking
  $effect(() => {
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        viewportW = cr.width;
        viewportH = cr.height;
      }
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  });

  // Cleanup rAF on destroy
  $effect(() => {
    return () => {
      if (rafId !== undefined) {
        cancelAnimationFrame(rafId);
      }
    };
  });
</script>

<svelte:window onkeydown={handleKeyDown} onkeyup={handleKeyUp} />

<div
  class="canvas-container"
  bind:this={container}
  role="application"
  aria-label="Pixel art canvas"
>
  {#if canvas}
    <canvas
      bind:this={displayCanvas}
      class="display-canvas"
      class:panning={isPanning || spaceHeld}
      onwheel={handleWheel}
      onpointerdown={handlePointerDown}
      onpointermove={handlePointerMove}
      onpointerup={handlePointerUp}
      onpointerleave={handlePointerLeave}
    ></canvas>
  {:else}
    <div class="canvas-placeholder">
      <p>Canvas</p>
      <p class="hint">Drop an image here to start</p>
    </div>
  {/if}
</div>

<style>
  .canvas-container {
    width: 100%;
    height: 100%;
    overflow: hidden;
    position: relative;
  }

  .display-canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    cursor: crosshair;
    image-rendering: pixelated;
  }

  .display-canvas.panning {
    cursor: grab;
  }

  .canvas-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-secondary);
    gap: 8px;
  }

  .hint {
    font-size: 12px;
    opacity: 0.6;
  }
</style>
