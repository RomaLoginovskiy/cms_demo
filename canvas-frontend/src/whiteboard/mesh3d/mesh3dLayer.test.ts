import { Shape } from '../types/models';

const groups: Array<{ rotation: { x: number; y: number; z: number }; position: { set: jest.Mock }; scale: { set: jest.Mock } }> = [];

jest.mock('three', () => {
  class MockGroup {
    rotation = { x: 0, y: 0, z: 0 };
    position = { set: jest.fn() };
    scale = { set: jest.fn() };
    add = jest.fn();
    traverse = jest.fn();
  }

  class MockScene {
    add = jest.fn();
    remove = jest.fn();
    traverse = jest.fn((fn: (obj: MockGroup) => void) => {
      for (const group of groups) {
        fn(group as unknown as MockGroup);
      }
    });
  }

  return {
    Scene: jest.fn(() => new MockScene()),
    WebGLRenderer: jest.fn(() => ({
      setClearColor: jest.fn(),
      setPixelRatio: jest.fn(),
      setSize: jest.fn(),
      render: jest.fn(),
      dispose: jest.fn(),
      domElement: document.createElement('canvas')
    })),
    OrthographicCamera: jest.fn(() => ({
      position: { set: jest.fn() },
      updateProjectionMatrix: jest.fn()
    })),
    AmbientLight: jest.fn(),
    DirectionalLight: jest.fn(function DirectionalLight() {
      return { position: { set: jest.fn() } };
    }),
    BufferGeometry: jest.fn(() => ({
      setAttribute: jest.fn(),
      computeVertexNormals: jest.fn()
    })),
    Float32BufferAttribute: jest.fn(),
    MeshStandardMaterial: jest.fn(),
    Mesh: jest.fn(),
    EdgesGeometry: jest.fn(),
    LineBasicMaterial: jest.fn(),
    LineSegments: jest.fn(),
    Color: jest.fn(),
    Group: jest.fn(() => {
      const group = new MockGroup();
      groups.push(group);
      return group;
    }),
    DoubleSide: 2
  };
});

import { Mesh3DLayer } from './mesh3dLayer';

const cubeGeometry = JSON.stringify({
  version: 1,
  kind: 'mesh3d',
  vertices: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5]],
  faces: [[0, 1, 2]]
});

function meshShape(overrides: Partial<Shape> = {}): Shape {
  return {
    id: 'mesh-1',
    boardId: 'board-1',
    type: 'Mesh3D',
    x: 100,
    y: 100,
    width: 160,
    height: 160,
    endX: null,
    endY: null,
    fill: '#93c5fd',
    stroke: '#1f2937',
    strokeWidth: 2,
    text: null,
    fontSize: null,
    zIndex: 5,
    mediaId: null,
    imageUrl: null,
    altText: null,
    templateId: 'cube',
    geometryJson: cubeGeometry,
    rotationX: 0,
    rotationY: 0,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

describe('Mesh3DLayer', () => {
  beforeEach(() => {
    groups.length = 0;
  });

  it('hides overlay when board has no Mesh3D shapes', () => {
    const container = document.createElement('div');
    const layer = new Mesh3DLayer();
    const overlay = layer.attach(container);

    layer.render([], { offsetX: 0, offsetY: 0, zoom: 1 }, 600, 800);
    expect(overlay.style.display).toBe('none');

    layer.render(
      [meshShape()],
      { offsetX: 0, offsetY: 0, zoom: 1 },
      600,
      800
    );
    expect(overlay.style.display).toBe('block');

    layer.dispose();
  });

  it('applies orbit rotation to the mesh group when rendering', () => {
    const container = document.createElement('div');
    const layer = new Mesh3DLayer();
    layer.attach(container);

    layer.render(
      [meshShape({ rotationX: 0.5, rotationY: 1.25 })],
      { offsetX: 0, offsetY: 0, zoom: 1 },
      600,
      800
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]!.rotation.x).toBeCloseTo(0.5);
    expect(groups[0]!.rotation.y).toBeCloseTo(1.25);

    layer.dispose();
  });
});
