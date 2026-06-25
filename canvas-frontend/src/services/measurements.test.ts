import { measurementService } from './measurements';
import { rumSendCustomMeasurement, rumStartTimeMeasure, rumEndTimeMeasure, rumInfoLog } from '../observability/coralogixRum';

jest.mock('../observability/coralogixRum', () => ({
  rumAddTiming: jest.fn(),
  rumEndTimeMeasure: jest.fn(),
  rumInfoLog: jest.fn(),
  rumSendCustomMeasurement: jest.fn(),
  rumStartTimeMeasure: jest.fn()
}));

describe('measurementService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('routes timers through guarded RUM wrappers', () => {
    measurementService.startTimeMeasurement('canvas_render', { area: 'board' });
    measurementService.endTimeMeasurement('canvas_render');

    expect(rumStartTimeMeasure).toHaveBeenCalledWith('canvas_render', { area: 'board' });
    expect(rumEndTimeMeasure).toHaveBeenCalledWith('canvas_render');
    expect(rumSendCustomMeasurement).toHaveBeenCalledWith('canvas_render_duration_ms', expect.any(Number));
    expect(rumInfoLog).toHaveBeenCalledWith(
      expect.stringContaining('Custom measurement: canvas_render_duration_ms'),
      expect.objectContaining({ measurement_name: 'canvas_render_duration_ms' }),
      { area: 'board' }
    );
  });

  it('scrubs raw URLs from API labels', () => {
    measurementService.trackAPIMetrics('https://example.test/api/boards/123?token=secret', 'GET', 0, 10, undefined, 200);
    measurementService.sendCustomMeasurement('legacy_api_call', 1, {
      endpoint: 'https://example.test/api/media/987/file?token=secret',
      tag: 'customer-name',
      media_id: 'media-123'
    });

    expect(rumInfoLog).toHaveBeenCalledWith(expect.stringContaining('api_response_time_ms'), expect.anything(), {
      api_endpoint: '/api/boards/:id',
      http_method: 'GET',
      status_code: '200'
    });
    expect(rumInfoLog).toHaveBeenCalledWith(expect.stringContaining('legacy_api_call'), expect.anything(), {
      endpoint: '/api/media/:id/file'
    });
  });

  it('scrubs dynamic identifiers from measurement names', () => {
    measurementService.startTimeMeasurement('api_call__api_media_filter?tags=customer-name#private');
    measurementService.startTimeMeasurement('upload_q1w2e3r4t');
    measurementService.endTimeMeasurement('api_call__api_media_filter?tags=customer-name#private');
    measurementService.endTimeMeasurement('upload_q1w2e3r4t');

    expect(rumStartTimeMeasure).toHaveBeenCalledWith('api_call__api_media_filter', undefined);
    expect(rumEndTimeMeasure).toHaveBeenCalledWith('api_call__api_media_filter');
    expect(rumStartTimeMeasure).toHaveBeenCalledWith('upload_id', undefined);
    expect(rumEndTimeMeasure).toHaveBeenCalledWith('upload_id');
    expect(rumSendCustomMeasurement).toHaveBeenCalledWith('upload_id_duration_ms', expect.any(Number));
  });

  it('abandons timers without emitting duration metrics', () => {
    measurementService.startTimeMeasurement('whiteboard_board_load_first_shape_visible', {
      operation: 'open_board'
    });
    measurementService.abandonTimeMeasurement('whiteboard_board_load_first_shape_visible');

    expect(rumEndTimeMeasure).toHaveBeenCalledWith('whiteboard_board_load_first_shape_visible');
    expect(rumSendCustomMeasurement).not.toHaveBeenCalled();
    expect(rumInfoLog).not.toHaveBeenCalled();

    measurementService.endTimeMeasurement('whiteboard_board_load_first_shape_visible');
    expect(rumEndTimeMeasure).toHaveBeenCalledTimes(1);
  });

  it('does not attach image URLs or file names to custom labels', () => {
    measurementService.trackImageMetrics('https://cdn.example.test/media/private-image.png?sig=secret', 12, 100, 50);
    measurementService.trackUploadMetrics('quarterly-plan.secret.png', 1024, 100, true);

    expect(rumInfoLog).toHaveBeenCalledWith(
      expect.stringContaining('image_load_time_ms'),
      expect.anything(),
      { image_source: 'cms' }
    );
    expect(rumInfoLog).toHaveBeenCalledWith(
      expect.stringContaining('file_upload_time_ms'),
      expect.anything(),
      {
        file_extension: 'png',
        upload_success: 'true'
      }
    );
  });
});
