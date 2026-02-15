<script lang="ts">
  import { editorState } from '../lib/state.svelte';
  import ImportDropZone from './ImportDropZone.svelte';
  import BeforeAfterToggle from './BeforeAfterToggle.svelte';
  import {
    screenToPixel,
    pixelToScreen,
    calculateFitZoom,
    nextZoomLevel,
    prevZoomLevel,
    clampPan,
  } from '../lib/engine/canvas/renderer';
  import {
    pencilStroke,
    eraserStroke,
    floodFill,
    pickColor,
    bresenhamLine,
  } from '../lib/engine/canvas/tools';

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

  /** Is a drawing stroke active? (left-click with a tool) */
  let isDrawing = $state(false);

  /** Last pixel position during a drawing stroke (for Bresenham interpolation) */
  let lastPixel: { x: number; y: number } | null = $state(null);

  /** Offscreen canvas used for building the native-resolution image */
  let offscreen: OffscreenCanvas | undefined;
  let offCtx: OffscreenCanvasRenderingContext2D | undefined | null;

  /** Secondary offscreen canvas for source image in before/after */
  let srcOffscreen: OffscreenCanvas | undefined;
  let srcOffCtx: OffscreenCanvasRenderingContext2D | undefined | null;

  // ---- Derived values -------------------------------------------------------

  let canvas = $derived(editorState.canvas);
  let zoom = $derived(editorState.zoom);
  let panX = $derived(editorState.panX);
  let panY = $derived(editorState.panY);

  /** Cursor style based on active tool (overridden by panning state in template) */
  let toolCursor = $derived.by(() => {
    switch (editorState.activeTool) {
      case 'pencil':
      case 'eraser':
        return 'crosshair';
      case 'fill':
        return 'cell';
      case 'picker':
        return 'copy';
      default:
        return 'crosshair';
    }
  });

  // ---- Drawing tools --------------------------------------------------------

  /**
   * Convert a pointer event to a pixel coordinate on the sprite canvas.
   * Returns null if the canvas or display element is unavailable.
   */
  function pointerToPixel(e: PointerEvent): { x: number; y: number } | null {
    if (!displayCanvas || !canvas) return null;
    const rect = displayCanvas.getBoundingClientRect();
    const pix = screenToPixel(e.clientX, e.clientY, zoom, panX, panY, rect);
    return { x: Math.floor(pix.x), y: Math.floor(pix.y) };
  }

  /**
   * Apply the current tool at a single pixel coordinate.
   */
  function applyToolAt(px: number, py: number): void {
    if (!canvas) return;

    const tool = editorState.activeTool;
    const { data, width, height } = canvas;

    switch (tool) {
      case 'pencil': {
        const change = pencilStroke(data, width, height, px, py, editorState.activeColor);
        if (change) editorState.bumpVersion();
        break;
      }
      case 'eraser': {
        const change = eraserStroke(data, width, height, px, py);
        if (change) editorState.bumpVersion();
        break;
      }
      case 'fill': {
        const changes = floodFill(data, width, height, px, py, editorState.activeColor);
        if (changes.length > 0) editorState.bumpVersion();
        break;
      }
      case 'picker': {
        const color = pickColor(data, width, height, px, py);
        // Only pick opaque-ish colors (ignore transparent pixels)
        if (color[3] > 0) {
          editorState.activeColor = color;
        }
        break;
      }
    }
  }

  /**
   * Apply pencil/eraser along a Bresenham line from lastPixel to current pixel.
   */
  function applyStrokeAlongLine(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
  ): void {
    if (!canvas) return;

    const points = bresenhamLine(fromX, fromY, toX, toY);
    const tool = editorState.activeTool;
    const { data, width, height } = canvas;
    let changed = false;

    for (const pt of points) {
      if (tool === 'pencil') {
        if (pencilStroke(data, width, height, pt.x, pt.y, editorState.activeColor)) {
          changed = true;
        }
      } else if (tool === 'eraser') {
        if (eraserStroke(data, width, height, pt.x, pt.y)) {
          changed = true;
        }
      }
    }

    if (changed) editorState.bumpVersion();
  }

  // ---- Rendering ------------------------------------------------------------

  function markDirty(): void {
    if (dirty) return;
    dirty = true;
    rafId = requestAnimationFrame(render);
  }

  /**
   * Prepare an offscreen canvas with the source image data for before/after.
   * Returns the offscreen canvas or undefined if unavailable.
   */
  function prepareSourceOffscreen(): OffscreenCanvas | undefined {
    const src = editorState.sourceImage;
    if (!src) return undefined;

    if (
      !srcOffscreen ||
      srcOffscreen.width !== src.width ||
      srcOffscreen.height !== src.height
    ) {
      srcOffscreen = new OffscreenCanvas(src.width, src.height);
      srcOffCtx = srcOffscreen.getContext('2d');
    }
    if (!srcOffCtx) return undefined;

    srcOffCtx.putImageData(src, 0, 0);
    return srcOffscreen;
  }

  /**
   * Draw an image buffer onto the display canvas at the given zoom and pan.
   */
  function drawAligned(
    ctx: CanvasRenderingContext2D,
    source: OffscreenCanvas,
    sourceW: number,
    sourceH: number,
    drawZoom: number,
    drawPanX: number,
    drawPanY: number,
  ): void {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, drawPanX, drawPanY, sourceW * drawZoom, sourceH * drawZoom);
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

    // 2. Determine which pixel data to show for the "current" canvas
    let pixelData: Uint8ClampedArray;
    let dataW: number;
    let dataH: number;

    if (editorState.showingPreview && editorState.cleanupPreview) {
      pixelData = editorState.cleanupPreview.data;
      dataW = editorState.cleanupPreview.width;
      dataH = editorState.cleanupPreview.height;
    } else {
      pixelData = canvas.data;
      dataW = canvas.width;
      dataH = canvas.height;
    }

    // 3. Prepare the "current" offscreen
    if (!offscreen || offscreen.width !== dataW || offscreen.height !== dataH) {
      offscreen = new OffscreenCanvas(dataW, dataH);
      offCtx = offscreen.getContext('2d');
    }
    if (!offCtx) return;

    const imgData = new ImageData(new Uint8ClampedArray(pixelData), dataW, dataH);
    offCtx.putImageData(imgData, 0, 0);

    // 4. Render based on before/after mode
    const src = editorState.sourceImage;
    const isHold = editorState.showBeforeAfter && editorState.beforeAfterMode === 'hold' && src;
    const isSplit = editorState.beforeAfterMode === 'split' && src && editorState.canvas;

    if (isHold) {
      // Hold mode: render source at aligned zoom (same pan, adjusted zoom)
      const srcOff = prepareSourceOffscreen();
      if (srcOff && src) {
        const sourceZoom = zoom * canvas.width / src.width;
        drawAligned(ctx, srcOff, src.width, src.height, sourceZoom, panX, panY);
      } else {
        // Fallback: render current canvas
        drawAligned(ctx, offscreen, dataW, dataH, zoom, panX, panY);
      }
    } else if (isSplit && src) {
      // Split mode: render both through the canvas pipeline
      const splitScreenX = Math.round(editorState.splitPosition * w);

      // Right side: current canvas (clipped to right of divider)
      ctx.save();
      ctx.beginPath();
      ctx.rect(splitScreenX, 0, w - splitScreenX, h);
      ctx.clip();
      drawAligned(ctx, offscreen, dataW, dataH, zoom, panX, panY);
      ctx.restore();

      // Left side: source at aligned zoom (clipped to left of divider)
      const srcOff = prepareSourceOffscreen();
      if (srcOff) {
        const sourceZoom = zoom * canvas.width / src.width;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, splitScreenX, h);
        ctx.clip();
        drawAligned(ctx, srcOff, src.width, src.height, sourceZoom, panX, panY);
        ctx.restore();
      }
    } else {
      // Normal: render current canvas
      drawAligned(ctx, offscreen, dataW, dataH, zoom, panX, panY);
    }

    // 5. Grid lines (always based on current canvas dimensions)
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
    // Middle-click or Space + left-click → pan
    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      e.preventDefault();
      startPan(e);
      return;
    }

    // Left-click only → apply tool
    if (e.button === 0 && canvas) {
      e.preventDefault();
      const pix = pointerToPixel(e);
      if (!pix) return;

      const tool = editorState.activeTool;

      if (tool === 'pencil' || tool === 'eraser') {
        isDrawing = true;
        lastPixel = pix;
        applyToolAt(pix.x, pix.y);
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } else if (tool === 'fill' || tool === 'picker') {
        // Single-click tools — apply once, no drag
        applyToolAt(pix.x, pix.y);
      }
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

    // Drawing stroke — interpolate from last position
    if (isDrawing && lastPixel) {
      const curPix = { x: hoverPixelX, y: hoverPixelY };
      if (curPix.x !== lastPixel.x || curPix.y !== lastPixel.y) {
        applyStrokeAlongLine(lastPixel.x, lastPixel.y, curPix.x, curPix.y);
        lastPixel = curPix;
      }
    }

    markDirty();
  }

  function handlePointerUp(_e: PointerEvent): void {
    isPanning = false;
    isDrawing = false;
    lastPixel = null;
  }

  function handlePointerLeave(): void {
    hoverPixelX = -1;
    hoverPixelY = -1;
    isPanning = false;
    isDrawing = false;
    lastPixel = null;
    markDirty();
  }

  // ---- Keyboard (space for pan) ---------------------------------------------

  function handleKeyDown(e: KeyboardEvent): void {
    if (e.code === 'Space') {
      // When before/after hold mode is active, Space is used for preview,
      // not for panning — let BeforeAfterToggle handle it
      if (editorState.beforeAfterMode === 'hold') return;
      e.preventDefault();
      spaceHeld = true;
    }
  }

  function handleKeyUp(e: KeyboardEvent): void {
    if (e.code === 'Space') {
      if (editorState.beforeAfterMode === 'hold') return;
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
    editorState.showBeforeAfter;
    editorState.beforeAfterMode;
    editorState.sourceImage;
    editorState.splitPosition;
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
      style:cursor={isPanning || spaceHeld ? undefined : toolCursor}
      onwheel={handleWheel}
      onpointerdown={handlePointerDown}
      onpointermove={handlePointerMove}
      onpointerup={handlePointerUp}
      onpointerleave={handlePointerLeave}
    ></canvas>
    <BeforeAfterToggle />
  {:else}
    <ImportDropZone />
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

</style>
