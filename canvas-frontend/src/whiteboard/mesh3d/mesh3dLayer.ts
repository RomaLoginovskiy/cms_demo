import * as THREE from 'three';
import { parseMesh3DGeometry, meshBBoxScale } from '../geometry/meshGeometry';
import { Shape, Viewport } from '../types/models';

interface MeshEntry {
  group: THREE.Group;
  geometryKey: string;
}

export class Mesh3DLayer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 2000);
  private readonly ambient = new THREE.AmbientLight(0xffffff, 0.65);
  private readonly directional = new THREE.DirectionalLight(0xffffff, 0.85);
  private readonly meshes = new Map<string, MeshEntry>();
  private canvas: HTMLCanvasElement | null = null;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, premultipliedAlpha: false });
    this.renderer.setClearColor(0x000000, 0);
    this.scene.add(this.ambient);
    this.directional.position.set(1, 2, 3);
    this.scene.add(this.directional);
  }

  attach(container: HTMLElement): HTMLCanvasElement {
    const canvas = this.renderer.domElement;
    this.canvas = canvas;
    canvas.className = 'mesh3d-overlay';
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.pointerEvents = 'none';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);
    return canvas;
  }

  dispose(): void {
    for (const entry of this.meshes.values()) {
      this.scene.remove(entry.group);
      entry.group.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((material: THREE.Material) => material.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    }

    this.meshes.clear();
    this.renderer.dispose();
    this.canvas?.remove();
  }

  render(shapes: Shape[], viewport: Viewport, width: number, height: number): void {
    if (!this.canvas) {
      return;
    }

    const meshShapes = shapes.filter(shape => shape.type === 'Mesh3D');
    if (meshShapes.length === 0) {
      this.canvas.style.display = 'none';
      return;
    }

    this.canvas.style.display = 'block';
    const ratio = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(Math.max(1, width), Math.max(1, height), false);

    this.camera.left = 0;
    this.camera.right = width;
    this.camera.top = height;
    this.camera.bottom = 0;
    this.camera.position.set(0, 0, 500);
    this.camera.updateProjectionMatrix();

    const activeIds = new Set(meshShapes.map(shape => shape.id));

    for (const id of [...this.meshes.keys()]) {
      if (!activeIds.has(id)) {
        const entry = this.meshes.get(id);
        if (entry) {
          this.scene.remove(entry.group);
        }
        this.meshes.delete(id);
      }
    }

    for (const shape of meshShapes) {
      this.syncShape(shape, viewport, height);
    }

    this.renderer.render(this.scene, this.camera);
  }

  private syncShape(shape: Shape, viewport: Viewport, canvasHeight: number): void {
    const geometry = parseMesh3DGeometry(shape.geometryJson);
    if (!geometry) {
      return;
    }

    const geometryKey = `${shape.geometryJson}|${shape.fill}|${shape.stroke}`;
    let entry = this.meshes.get(shape.id);
    if (!entry || entry.geometryKey !== geometryKey) {
      if (entry) {
        this.scene.remove(entry.group);
      }

      entry = { group: this.buildGroup(geometry, shape), geometryKey };
      this.meshes.set(shape.id, entry);
      this.scene.add(entry.group);
    }

    const scale = meshBBoxScale(shape.width, shape.height) * viewport.zoom;
    const centerX = shape.x * viewport.zoom + viewport.offsetX + (shape.width * viewport.zoom) / 2;
    const centerY = shape.y * viewport.zoom + viewport.offsetY + (shape.height * viewport.zoom) / 2;
    entry.group.position.set(centerX, canvasHeight - centerY, 0);
    entry.group.scale.set(scale, scale, scale);
    entry.group.rotation.x = shape.rotationX ?? 0;
    entry.group.rotation.y = shape.rotationY ?? 0;
  }

  private buildGroup(geometry: NonNullable<ReturnType<typeof parseMesh3DGeometry>>, shape: Shape): THREE.Group {
    const buffer = new THREE.BufferGeometry();
    const positions: number[] = [];
    for (const face of geometry.faces) {
      for (const index of face) {
        const vertex = geometry.vertices[index];
        if (!vertex) {
          continue;
        }

        positions.push(vertex[0], vertex[1], vertex[2]);
      }
    }

    buffer.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    buffer.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(shape.fill),
      metalness: 0.1,
      roughness: 0.6,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(buffer, material);
    const edges = new THREE.EdgesGeometry(buffer);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: new THREE.Color(shape.stroke) }));

    const group = new THREE.Group();
    group.add(mesh);
    group.add(line);
    return group;
  }
}
