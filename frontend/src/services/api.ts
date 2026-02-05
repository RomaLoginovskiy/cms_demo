import { Media, UploadMediaRequest, UpdateMediaRequest } from '../types';
import { measurementService } from './measurements';

// Use empty string for Docker deployment (nginx proxy handles routing)
// or fallback to localhost:7043 for local development
const API_BASE_URL = process.env.REACT_APP_API_URL !== undefined 
  ? process.env.REACT_APP_API_URL 
  : 'https://localhost:7043';

async function fetchWithTracing(url: string, options: RequestInit = {}): Promise<Response> {
  const startTime = performance.now();
  const headers = new Headers(options.headers);
  headers.set('traceparent', '00-' + crypto.randomUUID().replace(/-/g, '') + '-' + crypto.randomUUID().split('-')[0] + '-01');
  
  // Start time measurement for the API call
  // Extract pathname from URL or use the path directly if it's relative
  const pathname = url.startsWith('http') ? new URL(url).pathname : url;
  const apiCallName = `api_call_${pathname.replace(/\//g, '_')}`;
  measurementService.startTimeMeasurement(apiCallName, {
    method: options.method || 'GET',
    endpoint: url
  });

  try {
    const response = await fetch(url, {
      ...options,
      headers
    });
    
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
      formData.append('files', files[i]);
      totalFileSize += files[i].size;
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
      
      const uploadEndTime = performance.now();
      const uploadDuration = uploadEndTime - uploadStartTime;
      
      const result = await response.json();
      
      // Track successful upload metrics
      for (let i = 0; i < files.length; i++) {
        measurementService.trackUploadMetrics(
          files[i].name, 
          files[i].size, 
          uploadDuration, 
          true
        );
      }
      
      return result;
    } catch (error) {
      const uploadEndTime = performance.now();
      const uploadDuration = uploadEndTime - uploadStartTime;
      
      // Track failed upload metrics
      for (let i = 0; i < files.length; i++) {
        measurementService.trackUploadMetrics(
          files[i].name, 
          files[i].size, 
          uploadDuration, 
          false
        );
      }
      
      throw error;
    }
  },

  // Update media metadata
  async update(id: string, data: UpdateMediaRequest): Promise<Media> {
    const response = await fetchWithTracing(`${API_BASE_URL}/api/media/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    return response.json();
  },

  // Delete media
  async delete(id: string): Promise<void> {
    await fetchWithTracing(`${API_BASE_URL}/api/media/${id}`, {
      method: 'DELETE'
    });
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