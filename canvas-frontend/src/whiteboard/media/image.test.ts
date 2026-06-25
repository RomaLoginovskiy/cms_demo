import { createShapeDraft } from '../store/whiteboardStore';

test('creates image shape payload with CMS reference fields', () => {
  const shape = createShapeDraft('board-1', 'Image', {
    mediaId: 'media-1',
    imageUrl: 'http://localhost:8080/api/media/media-1/file',
    altText: 'Welcome Image'
  });

  expect(shape.type).toBe('Image');
  expect(shape.mediaId).toBe('media-1');
  expect(shape.imageUrl).toContain('/api/media/media-1/file');
  expect(shape.altText).toBe('Welcome Image');
});
