/**
 * Export utilities — convert pixel data to PNG blobs, copy to clipboard,
 * and trigger browser downloads.  Uses the Canvas API for encoding.
 */

/**
 * Export pixel data as a PNG blob at native (1x) resolution.
 *
 * Creates a temporary canvas, writes the raw RGBA data, and converts to a
 * PNG blob via `toBlob`.
 */
export async function exportPNG(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not create 2D rendering context');
  }

  const imageData = new ImageData(new Uint8ClampedArray(data), width, height);
  ctx.putImageData(imageData, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to create PNG blob'));
      }
    }, 'image/png');
  });
}

/**
 * Export a scaled PNG using nearest-neighbor upscaling.
 *
 * Creates a source canvas at the native resolution, then draws it scaled
 * onto a larger canvas with `imageSmoothingEnabled = false` to preserve
 * crisp pixel edges.
 */
export async function exportScaledPNG(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  scale: number,
): Promise<Blob> {
  // Source canvas at native resolution
  const src = document.createElement('canvas');
  src.width = width;
  src.height = height;

  const srcCtx = src.getContext('2d');
  if (!srcCtx) {
    throw new Error('Could not create 2D rendering context');
  }

  const imageData = new ImageData(new Uint8ClampedArray(data), width, height);
  srcCtx.putImageData(imageData, 0, 0);

  // Destination canvas at scaled resolution
  const dst = document.createElement('canvas');
  dst.width = width * scale;
  dst.height = height * scale;

  const dstCtx = dst.getContext('2d');
  if (!dstCtx) {
    throw new Error('Could not create 2D rendering context');
  }

  dstCtx.imageSmoothingEnabled = false;
  dstCtx.drawImage(src, 0, 0, dst.width, dst.height);

  return new Promise<Blob>((resolve, reject) => {
    dst.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to create scaled PNG blob'));
      }
    }, 'image/png');
  });
}

/**
 * Copy an image blob to the system clipboard using the Clipboard API.
 */
export async function copyToClipboard(blob: Blob): Promise<void> {
  await navigator.clipboard.write([
    new ClipboardItem({ 'image/png': blob }),
  ]);
}

/**
 * Trigger a browser download for the given blob.
 *
 * Creates a temporary `<a>` element with an object URL, clicks it, and
 * revokes the URL after a short delay.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  // Clean up after a tick so the browser has time to start the download
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}
