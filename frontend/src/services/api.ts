import { Media, UploadMediaRequest, UpdateMediaRequest } from '../types';
import { measurementService } from './measurements';
import { rumTrackEvent } from '../observability/coralogixRum';

// Use empty string for Docker deployment (nginx proxy handles routing)
// or fallback to localhost:7043 for local development
const API_BASE_URL = process.env.REACT_APP_API_URL !== undefined 
  ? process.env.REACT_APP_API_URL 
  : 'https://localhost:7043';

async function fetchWithTracing(url: string, options: RequestInit = {}): Promise<Response> {
  const startTime = performance.now();

  // Start time measurement for the API call
  // Extract pathname from URL or use the path directly if it's relative
  const pathname = url.startsWith('http') ? new URL(url).pathname : url;
  const apiCallName = `api_call_${pathname.replace(/\//g, '_')}`;
  measurementService.startTimeMeasurement(apiCallName, {
    method: options.method || 'GET',
    endpoint: url
  });

  try {
    const response = await fetch(url, options);
    
    const endTime = performance.now();
    
    // End time measurement
    measurementService.endTimeMeasurement(apiCallName);
    
    // Track API metrics
    measurementService.trackAPIMetrics(
      url, 
      options.method || 'GET', 
      startTime, 
      endTime, 
      undefined, // Response size will be tracked when reading response
      response.status
    );

    return response;
  } catch (error) {
    const endTime = performance.now();
    
    // End time measurement even on error
    measurementService.endTimeMeasurement(apiCallName);
    
    // Track failed API call
    measurementService.trackAPIMetrics(
      url, 
      options.method || 'GET', 
      startTime, 
      endTime, 
      undefined,
      0 // Indicate network error
    );
    
    throw error;
  }
}

export class ApiResponseError extends Error {
  readonly status: number;

  constructor(operation: string, status: number) {
    super(`${operation} failed with status ${status}`);
    this.name = 'ApiResponseError';
    this.status = status;
  }
}

function assertOk(response: Response, operation: string): void {
  if (!response.ok) {
    throw new ApiResponseError(operation, response.status);
  }
}

// Funnel event data must stay free of ids, file names, titles and tags.
function describeFailure(error: unknown): string {
  if (error instanceof ApiResponseError) {
    return String(error.status);
  }

  return error instanceof TypeError ? 'network_error' : 'unknown';
}

export const mediaApi = {
  // Get all media items
  async getAll(): Promise<Media[]> {
    const response = await fetchWithTracing(`${API_BASE_URL}/api/media`);
    const data = await response.json();
    
    // Track response size and item count
    const responseText = JSON.stringify(data);
    measurementService.sendCustomMeasurement('api_response_size_bytes', new Blob([responseText]).size, {
      endpoint: '/api/media',
      method: 'GET'
    });
    measurementService.sendCustomMeasurement('media_items_count', data.length);
    
    return data;
  },

  // Get media item by ID
  async getById(id: string): Promise<Media> {
    const response = await fetchWithTracing(`${API_BASE_URL}/api/media/${id}`);
    return response.json();
  },

  // Upload new media
  async upload(files: FileList, metadata: UploadMediaRequest): Promise<Media> {
    const uploadStartTime = performance.now();
    const formData = new FormData();
    
    let totalFileSize = 0;
    
    // Add files and calculate total size
    for (let i = 0; i < files.length; i++) {
      const file = files.item(i);
      if (!file) {
        continue;
      }

      formData.append('files', file);
      totalFileSize += file.size;
    }
    
    // Track upload metrics
    measurementService.sendCustomMeasurement('upload_file_count', files.length);
    measurementService.sendCustomMeasurement('upload_total_size_bytes', totalFileSize);
    
    // Add metadata
    if (metadata.title) {
      formData.append('title', metadata.title);
    }
    if (metadata.description) {
      formData.append('description', metadata.description);
    }
    if (metadata.tags && metadata.tags.length > 0) {
      formData.append('tags', metadata.tags.join(','));
    }

    try {
      const response = await fetchWithTracing(`${API_BASE_URL}/api/media`, {
        method: 'POST',
        body: formData
      });
      assertOk(response, 'Upload');
      
      const uploadEndTime = performance.now();
      const uploadDuration = uploadEndTime - uploadStartTime;
      
      const result = await response.json();
      
      // Track successful upload metrics
      for (let i = 0; i < files.length; i++) {
        const file = files.item(i);
        if (!file) {
          continue;
        }

        measurementService.trackUploadMetrics(
          file.name,
          file.size,
          uploadDuration, 
          true
        );
      }

      rumTrackEvent('media_uploaded', {
        media_type: files.item(0)?.type || 'unknown',
        file_size_bytes: totalFileSize
      });
      
      return result;
    } catch (error) {
      const uploadEndTime = performance.now();
      const uploadDuration = uploadEndTime - uploadStartTime;
      
      // Track failed upload metrics
      for (let i = 0; i < files.length; i++) {
        const file = files.item(i);
        if (!file) {
          continue;
        }

        measurementService.trackUploadMetrics(
          file.name,
          file.size,
          uploadDuration, 
          false
        );
      }

      rumTrackEvent('media_upload_failed', { status_or_reason: describeFailure(error) });
      
      throw error;
    }
  },

  // Update media metadata
  async update(id: string, data: UpdateMediaRequest): Promise<Media> {
    try {
      const response = await fetchWithTracing(`${API_BASE_URL}/api/media/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
      assertOk(response, 'Update');
      const result = await response.json();
      rumTrackEvent('media_updated');
      return result;
    } catch (error) {
      rumTrackEvent('media_update_failed', { status_or_reason: describeFailure(error) });
      throw error;
    }
  },

  // Delete media
  async delete(id: string): Promise<void> {
    try {
      const response = await fetchWithTracing(`${API_BASE_URL}/api/media/${id}`, {
        method: 'DELETE'
      });
      assertOk(response, 'Delete');
      rumTrackEvent('media_deleted');
    } catch (error) {
      rumTrackEvent('media_delete_failed', { status_or_reason: describeFailure(error) });
      throw error;
    }
  },

  // Get media file URL
  getFileUrl(id: string): string {
    return `${API_BASE_URL}/api/media/${id}/file`;
  },

  // Get all available tags
  async getAllTags(): Promise<string[]> {
    const response = await fetchWithTracing(`${API_BASE_URL}/api/media/tags`);
    return response.json();
  },

  // Filter media by tags
  async filterByTags(tags: string[]): Promise<Media[]> {
    const tagsParam = tags.join(',');
    const response = await fetchWithTracing(`${API_BASE_URL}/api/media/filter?tags=${encodeURIComponent(tagsParam)}`);
    const data = await response.json();
    
    // Track response size and item count
    const responseText = JSON.stringify(data);
    measurementService.sendCustomMeasurement('api_response_size_bytes', new Blob([responseText]).size, {
      endpoint: '/api/media/filter',
      method: 'GET'
    });
    measurementService.sendCustomMeasurement('filtered_media_items_count', data.length, {
      tags: tagsParam
    });
    
    return data;
  },
}; 