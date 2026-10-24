// Fast raycasts against furniture: three-mesh-bvh builds a bounding volume tree per geometry and
// replaces Mesh.raycast with one that uses it (meshes without a tree raycast as before).

import * as THREE from 'three';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';

// The library's typings and three's disagree on the tree type; the runtime functions match.
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree as unknown as THREE.BufferGeometry['computeBoundsTree'];
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

/** Build the tree once for a geometry that will be hit-tested. */
export function ensureBvh(g: THREE.BufferGeometry) {
  if (!g.boundsTree) g.computeBoundsTree();
}
