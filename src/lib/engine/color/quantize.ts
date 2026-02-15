import type { Color } from '../../types';

export interface QuantizeResult {
  palette: Color[];
  indexedData: Uint8Array;
  remappedData: Uint8ClampedArray;
}

// ---------------------------------------------------------------------------
// Octree node
// ---------------------------------------------------------------------------

interface OctreeNode {
  rSum: number;
  gSum: number;
  bSum: number;
  pixelCount: number;
  paletteIndex: number;
  children: (OctreeNode | null)[];
  isLeaf: boolean;
  depth: number;
}

function createNode(depth: number): OctreeNode {
  return {
    rSum: 0,
    gSum: 0,
    bSum: 0,
    pixelCount: 0,
    paletteIndex: -1,
    children: [null, null, null, null, null, null, null, null],
    isLeaf: false,
    depth,
  };
}

function childIndex(r: number, g: number, b: number, depth: number): number {
  const bit = 7 - depth;
  return (((r >> bit) & 1) << 2) | (((g >> bit) & 1) << 1) | ((b >> bit) & 1);
}

/**
 * Count palette entries in the tree: leaves with pixels + interior nodes with pixels.
 */
function countPaletteEntries(node: OctreeNode): number {
  if (node.isLeaf) {
    return node.pixelCount > 0 ? 1 : 0;
  }
  let count = node.pixelCount > 0 ? 1 : 0;
  for (let i = 0; i < 8; i++) {
    if (node.children[i] !== null) {
      count += countPaletteEntries(node.children[i]!);
    }
  }
  return count;
}

/**
 * Count leaves in a subtree (for reduction math).
 */
function countLeaves(node: OctreeNode): number {
  if (node.isLeaf) return 1;
  let count = 0;
  for (let i = 0; i < 8; i++) {
    if (node.children[i] !== null) {
      count += countLeaves(node.children[i]!);
    }
  }
  return count;
}

/**
 * Recursively gather all color data from a node's subtree into the node itself,
 * then null out all children. Turns the node into a leaf.
 */
function collapseIntoSelf(node: OctreeNode): void {
  for (let i = 0; i < 8; i++) {
    const child = node.children[i];
    if (child === null) continue;
    if (!child.isLeaf) {
      collapseIntoSelf(child);
    }
    node.rSum += child.rSum;
    node.gSum += child.gSum;
    node.bSum += child.bSum;
    node.pixelCount += child.pixelCount;
    node.children[i] = null;
  }
  node.isLeaf = true;
}

/**
 * Gather all color data from a child subtree into a target node,
 * then null out the child's subtree. Does NOT mark target as leaf.
 */
function absorbChild(target: OctreeNode, childIdx: number): number {
  const child = target.children[childIdx];
  if (child === null) return 0;

  const leaves = countLeaves(child);

  // Recursively gather
  function gather(node: OctreeNode): void {
    target.rSum += node.rSum;
    target.gSum += node.gSum;
    target.bSum += node.bSum;
    target.pixelCount += node.pixelCount;

    for (let i = 0; i < 8; i++) {
      if (node.children[i] !== null) {
        gather(node.children[i]!);
      }
    }
  }

  gather(child);
  target.children[childIdx] = null;

  return leaves;
}

// ---------------------------------------------------------------------------
// Octree quantizer
// ---------------------------------------------------------------------------

export function octreeQuantize(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  targetColors: number,
): QuantizeResult {
  const pixelCount = width * height;

  if (targetColors <= 0) {
    return {
      palette: [],
      indexedData: new Uint8Array(pixelCount),
      remappedData: new Uint8ClampedArray(data.length),
    };
  }

  const root = createNode(0);
  let leafCount = 0;

  // ---- Insert ----
  function insertColor(r: number, g: number, b: number): void {
    let node = root;
    for (let depth = 0; depth < 7; depth++) {
      const idx = childIndex(r, g, b, depth);
      if (node.children[idx] === null) {
        const child = createNode(depth + 1);
        node.children[idx] = child;
        if (depth + 1 === 7) {
          child.isLeaf = true;
          leafCount++;
        }
      }
      node = node.children[idx]!;
    }
    node.rSum += r;
    node.gSum += g;
    node.bSum += b;
    node.pixelCount++;
  }

  // ---- Step 1: Insert all opaque pixels ----
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    insertColor(data[i], data[i + 1], data[i + 2]);
  }

  // ---- Step 2: Reduce ----
  // Phase A: Standard octree reduction - collapse interior nodes (deepest first)
  // into leaves until we can't safely reduce further.
  {
    // Collect all interior nodes
    const interiorsByDepth: OctreeNode[][] = [[], [], [], [], [], [], [], []];

    function collectInteriors(node: OctreeNode): void {
      if (node.isLeaf) return;
      for (let i = 0; i < 8; i++) {
        if (node.children[i] !== null) {
          collectInteriors(node.children[i]!);
        }
      }
      interiorsByDepth[node.depth].push(node);
    }
    collectInteriors(root);

    // Reduce from deepest level upward
    for (let depth = 6; depth >= 0 && leafCount > targetColors; depth--) {
      const nodes = interiorsByDepth[depth];
      // Sort: fewest leaves first (smallest merges first for precision)
      nodes.sort((a, b) => countLeaves(a) - countLeaves(b));

      for (const node of nodes) {
        if (node.isLeaf) continue; // already reduced by a parent collapse
        if (leafCount <= targetColors) break;

        const leaves = countLeaves(node);
        const reduction = leaves - 1;
        if (reduction <= 0) continue;

        if (leafCount - reduction >= targetColors) {
          collapseIntoSelf(node);
          leafCount -= reduction;
        }
      }
    }
  }

  // Phase B: If we still have too many leaves, do granular child-by-child
  // absorption at upper levels. This handles cases where all remaining
  // branches diverge at the root level.
  while (leafCount > targetColors) {
    // Find the shallowest interior node with >1 child
    let bestNode: OctreeNode | null = null;

    function findBest(node: OctreeNode): void {
      if (node.isLeaf) return;
      let childCount = 0;
      for (let i = 0; i < 8; i++) {
        if (node.children[i] !== null) {
          childCount++;
          findBest(node.children[i]!);
        }
      }
      if (childCount >= 2) {
        if (bestNode === null || node.depth < bestNode.depth) {
          bestNode = node;
        }
      }
    }
    findBest(root);

    if (bestNode === null) break;
    const target = bestNode as OctreeNode;

    // Absorb the child with the fewest leaves into the parent node
    let minLeaves = Infinity;
    let minIdx = -1;
    for (let i = 0; i < 8; i++) {
      if (target.children[i] === null) continue;
      const cl = countLeaves(target.children[i]!);
      if (cl < minLeaves) {
        minLeaves = cl;
        minIdx = i;
      }
    }

    if (minIdx === -1) break;

    const absorbed = absorbChild(target, minIdx);
    leafCount -= absorbed;

    // If parent was not previously a palette entry (pixelCount was 0 before
    // absorption started adding to it), we've effectively added a new entry
    // when pixelCount first goes > 0. But since we track leafCount and will
    // count palette entries at the end, we just need the loop to converge.

    // If only 1 child remains, check if we're still over target
    // If 0 children remain, this becomes a leaf
    let remainingChildren = 0;
    for (let i = 0; i < 8; i++) {
      if (target.children[i] !== null) remainingChildren++;
    }
    if (remainingChildren === 0) {
      target.isLeaf = true;
      leafCount += 1;
    }

    // Recompute effective palette count since interior nodes with pixelCount
    // also count. leafCount doesn't capture these, so use the real count.
    const effectiveCount = countPaletteEntries(root);
    if (effectiveCount <= targetColors) break;

    // Update leafCount to stay in sync
    leafCount = effectiveCount;
  }

  // ---- Step 3: Build palette ----
  const palette: Color[] = [];

  function assignPaletteIndices(node: OctreeNode): void {
    if (node.isLeaf) {
      if (node.pixelCount > 0) {
        node.paletteIndex = palette.length;
        palette.push([
          Math.round(node.rSum / node.pixelCount),
          Math.round(node.gSum / node.pixelCount),
          Math.round(node.bSum / node.pixelCount),
          255,
        ]);
      }
      return;
    }

    // Interior node with accumulated pixels (from partial absorption)
    if (node.pixelCount > 0) {
      node.paletteIndex = palette.length;
      palette.push([
        Math.round(node.rSum / node.pixelCount),
        Math.round(node.gSum / node.pixelCount),
        Math.round(node.bSum / node.pixelCount),
        255,
      ]);
    }

    for (let i = 0; i < 8; i++) {
      if (node.children[i] !== null) {
        assignPaletteIndices(node.children[i]!);
      }
    }
  }

  assignPaletteIndices(root);

  // ---- Step 4: Map each pixel to its palette index ----
  const indexedData = new Uint8Array(pixelCount);
  const remappedData = new Uint8ClampedArray(data.length);

  for (let p = 0; p < pixelCount; p++) {
    const i = p * 4;

    if (data[i + 3] === 0) {
      indexedData[p] = 0;
      remappedData[i] = 0;
      remappedData[i + 1] = 0;
      remappedData[i + 2] = 0;
      remappedData[i + 3] = 0;
      continue;
    }

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Walk the tree to find the palette entry for this pixel.
    // Stop at a leaf, or at a node whose child for this pixel's path
    // has been absorbed (child === null). In that case use the node's palette.
    let node = root;
    for (let depth = 0; depth < 7; depth++) {
      if (node.isLeaf) break;
      const idx = childIndex(r, g, b, depth);
      const child = node.children[idx];
      if (child === null) break;
      node = child;
    }

    const pi = node.paletteIndex;
    indexedData[p] = pi;

    const color = palette[pi];
    remappedData[i] = color[0];
    remappedData[i + 1] = color[1];
    remappedData[i + 2] = color[2];
    remappedData[i + 3] = 255;
  }

  return { palette, indexedData, remappedData };
}
