#!/usr/bin/env node
/**
 * Minimal OBJ → mesh3d JSON (triangles only). Usage:
 * node scripts/build-mesh-template.mjs model.obj
 */
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/build-mesh-template.mjs <file.obj>');
  process.exit(1);
}

const text = readFileSync(file, 'utf8');
const vertices = [];
const faces = [];

for (const line of text.split('\n')) {
  const parts = line.trim().split(/\s+/);
  if (parts[0] === 'v' && parts.length >= 4) {
    vertices.push(parts.slice(1, 4).map(Number));
  } else if (parts[0] === 'f' && parts.length >= 4) {
    const indices = parts.slice(1, 4).map(token => Number(token.split('/')[0]) - 1);
    faces.push(indices);
  }
}

let minX = Infinity;
let minY = Infinity;
let minZ = Infinity;
let maxX = -Infinity;
let maxY = -Infinity;
let maxZ = -Infinity;
for (const [x, y, z] of vertices) {
  minX = Math.min(minX, x);
  minY = Math.min(minY, y);
  minZ = Math.min(minZ, z);
  maxX = Math.max(maxX, x);
  maxY = Math.max(maxY, y);
  maxZ = Math.max(maxZ, z);
}
const scale = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-6);
const cx = (minX + maxX) / 2;
const cy = (minY + maxY) / 2;
const cz = (minZ + maxZ) / 2;
const normalized = vertices.map(([x, y, z]) => [
  (x - cx) / scale,
  (y - cy) / scale,
  (z - cz) / scale
]);

console.log(JSON.stringify({ version: 1, kind: 'mesh3d', vertices: normalized, faces }, null, 2));
