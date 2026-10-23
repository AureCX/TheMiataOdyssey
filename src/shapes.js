// Shared geometry helpers for props and buildings.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// A box with softly rounded edges: radius ~12 % of the smallest side, at most 12 cm. Thin panels keep crisp edges.
// Called with `new` like THREE.BoxGeometry (a constructor that returns an object returns that object).
export function RBox(w = 1, h = 1, d = 1) {
  const r = Math.min(0.12, Math.min(w, h, d) * 0.12);
  return r < 0.012 ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, 2, r);
}
