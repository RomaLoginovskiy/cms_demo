import { ApiResponseError, mediaApi } from './api';
import { rumTrackEvent } from '../observability/coralogixRum';

jest.mock('../observability/coralogixRum', () => ({
  ...jest.requireActual('../observability/coralogixRum'),
  rumTrackEvent: jest.fn()
}));

const mediaFixture = {
  id: '11111111-1111-4111-8111-111111111111',
  fileName: 'photo.png',
  title: 'Photo',
  contentType: 'image/png',
  size: 3,
  uploadedAt: '2026-05-25T00:00:00Z',
  tags: ['demo']
};

function response(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}

function fileList(...files: File[]): FileList {
  return {
    length: files.length,
    item: (index: number) => files[index] ?? null
  } as unknown as FileList;
}

describe('mediaApi', () => {
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.fn() as jest.MockedFunction<typeof fetch>;
    (globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = fetchMock;
  });

  afterEach(() => {
    delete (globalThis as typeof globalThis & { fetch?: typeof fetch }).fetch;
  });

  it('upload resolves and emits media_uploaded on success', async () => {
    fetchMock.mockResolvedValue(response(201, mediaFixture));

    const result = await mediaApi.upload(
      fileList(new File(['abc'], 'photo.png', { type: 'image/png' })),
      { title: 'Photo', tags: ['demo'] }
    );

    expect(result).toEqual(mediaFixture);
    expect(rumTrackEvent).toHaveBeenCalledWith('media_uploaded', {
      media_type: 'image/png',
      file_size_bytes: 3
    });
  });

  it('upload throws with status on non-ok response and emits media_upload_failed', async () => {
    fetchMock.mockResolvedValue(response(413, { message: 'too large' }));

    const upload = mediaApi.upload(fileList(new File(['abc'], 'photo.png', { type: 'image/png' })), {});

    await expect(upload).rejects.toThrow(ApiResponseError);
    await expect(upload).rejects.toThrow('Upload failed with status 413');
    expect(rumTrackEvent).toHaveBeenCalledWith('media_upload_failed', { status_or_reason: '413' });
    expect(rumTrackEvent).not.toHaveBeenCalledWith('media_uploaded', expect.anything());
  });

  it('upload reports network failures', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(mediaApi.upload(fileList(new File(['abc'], 'photo.png', { type: 'image/png' })), {}))
      .rejects.toThrow('Failed to fetch');
    expect(rumTrackEvent).toHaveBeenCalledWith('media_upload_failed', { status_or_reason: 'network_error' });
  });

  it('update resolves and emits media_updated on success', async () => {
    fetchMock.mockResolvedValue(response(200, mediaFixture));

    await expect(mediaApi.update(mediaFixture.id, { title: 'Photo' })).resolves.toEqual(mediaFixture);
    expect(rumTrackEvent).toHaveBeenCalledWith('media_updated');
  });

  it('update throws with status on non-ok response and emits media_update_failed', async () => {
    fetchMock.mockResolvedValue(response(404));

    await expect(mediaApi.update(mediaFixture.id, { title: 'Photo' }))
      .rejects.toThrow('Update failed with status 404');
    expect(rumTrackEvent).toHaveBeenCalledWith('media_update_failed', { status_or_reason: '404' });
  });

  it('delete resolves and emits media_deleted on success', async () => {
    fetchMock.mockResolvedValue(response(204));

    await expect(mediaApi.delete(mediaFixture.id)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/api/media/${mediaFixture.id}`),
      { method: 'DELETE' }
    );
    expect(rumTrackEvent).toHaveBeenCalledWith('media_deleted');
  });

  it('delete throws with status on non-ok response and emits media_delete_failed', async () => {
    fetchMock.mockResolvedValue(response(500));

    await expect(mediaApi.delete(mediaFixture.id)).rejects.toThrow('Delete failed with status 500');
    expect(rumTrackEvent).toHaveBeenCalledWith('media_delete_failed', { status_or_reason: '500' });
    expect(rumTrackEvent).not.toHaveBeenCalledWith('media_deleted');
  });
});
