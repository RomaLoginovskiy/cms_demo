import React, { useState } from 'react';
import { Media } from '../types';
import { mediaApi } from '../services/api';
import { measurementService } from '../services/measurements';
import { createTraceparent } from '../services/tracing';

interface MediaTileProps {
  media: Media;
  onClick: (media: Media) => void;
}

export default function MediaTile({ media, onClick }: MediaTileProps) {
  const [imageLoadStart] = useState(performance.now());

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getCategoryFromContentType = (contentType: string): string => {
    if (contentType.startsWith('image/')) {
      return 'Photography';
    }
    return 'Media';
  };

  return (
    <div
      className="media-tile cursor-pointer"
      onClick={() => {
        // Track media tile clicks
        measurementService.sendCustomMeasurement('media_tile_clicks', 1, {
          media_id: media.id,
          media_type: media.contentType,
          file_size_category: media.size > 1024 * 1024 ? 'large' : 'small'
        });
        onClick(media);
      }}
    >
      <img
        src={`${mediaApi.getFileUrl(media.id)}?traceparent=${createTraceparent()}`}
        alt={media.title || media.fileName}
        className="media-tile-image"
        loading="lazy"
        onLoad={(e) => {
          const loadTime = performance.now() - imageLoadStart;
          const img = e.target as HTMLImageElement;
          
          // Track image loading metrics
          measurementService.trackImageMetrics(
            media.fileName,
            loadTime,
            img.naturalWidth,
            img.naturalHeight
          );
          
          // Track thumbnail loading success
          measurementService.sendCustomMeasurement('thumbnail_loads_successful', 1, {
            media_id: media.id,
            content_type: media.contentType
          });
        }}
        onError={(e) => {
          const loadTime = performance.now() - imageLoadStart;
          
          // Track image loading errors
          measurementService.sendCustomMeasurement('thumbnail_loads_failed', 1, {
            media_id: media.id,
            content_type: media.contentType,
            load_time_ms: loadTime.toString()
          });
          
          // Fallback to a placeholder if image fails to load
          const target = e.target as HTMLImageElement;
          target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2VlZSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5JbWFnZSBub3QgZm91bmQ8L3RleHQ+PC9zdmc+';
        }}
      />
      
      <div className="p-4">
        <h3 className="font-medium text-lg mb-1 truncate">
          {media.title || media.fileName}
        </h3>
        
        <p className="text-sm text-gray-600 mb-2 line-clamp-2">
          {media.description || 'No description available'}
        </p>
        
        <div className="flex justify-between items-center text-xs text-gray-500">
          <span>{formatDate(media.uploadedAt)}</span>
          <span>{formatFileSize(media.size)}</span>
        </div>
        
        <div className="media-tile-category">
          {getCategoryFromContentType(media.contentType)}
        </div>
      </div>
    </div>
  );
} 