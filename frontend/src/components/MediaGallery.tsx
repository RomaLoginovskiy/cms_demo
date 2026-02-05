import React, { useEffect, useMemo } from 'react';
import { useMedia } from '../contexts/MediaContext';
import { mediaApi } from '../services/api';
import { measurementService } from '../services/measurements';
import { useComponentMeasurement, useAsyncMeasurement } from '../hooks/useMeasurement';
import MediaTile from './MediaTile';
import { Media } from '../types';
import { CoralogixRum } from '@coralogix/browser';

interface MediaGalleryProps {
  onMediaSelect: (media: Media) => void;
}

export default function MediaGallery({ onMediaSelect }: MediaGalleryProps) {
  const { state, dispatch } = useMedia();
  const { media, loading, error, availableTags, selectedTags } = state;
  
  // Use component measurement hook
  const { measureInteraction } = useComponentMeasurement('MediaGallery', {
    media_count: media.length.toString()
  });
  
  // Use async measurement hook
  const { measureAsync } = useAsyncMeasurement();

  useEffect(() => {
    loadMedia();
    loadTags();
    
    // Measure DOM metrics after component mounts
    setTimeout(() => {
      measurementService.measureDOMMetrics();
    }, 100);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filtered media based on selected tags
  const filteredMedia = useMemo(() => {
    if (selectedTags.length === 0) {
      return media;
    }
    return media.filter(item => 
      item.tags && item.tags.some(tag => 
        selectedTags.some(selectedTag => 
          tag.toLowerCase() === selectedTag.toLowerCase()
        )
      )
    );
  }, [media, selectedTags]);

  const loadTags = async () => {
    try {
      const tags = await mediaApi.getAllTags();
      dispatch({ type: 'SET_AVAILABLE_TAGS', payload: tags });
    } catch (err) {
      console.error('Failed to load tags:', err);
    }
  };

  const handleTagClick = (tag: string) => {
    dispatch({ type: 'TOGGLE_TAG_FILTER', payload: tag });
    measurementService.sendCustomMeasurement('tag_filter_toggle', 1, { tag });
  };

  const handleClearFilters = () => {
    dispatch({ type: 'CLEAR_TAG_FILTERS' });
    measurementService.sendCustomMeasurement('tag_filter_clear', 1);
  };

  const loadMedia = async () => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      
      // Use the async measurement hook for the entire media loading operation
      await measureAsync('media_gallery_load', async () => {
        const mediaItems = await mediaApi.getAll();
        dispatch({ type: 'SET_MEDIA', payload: mediaItems });
        
        // Track gallery metrics
        measurementService.sendCustomMeasurement('gallery_items_loaded', mediaItems.length);
        
        // Legacy measurement for compatibility
        CoralogixRum.sendCustomMeasurement('my-page-load', 1000);
      }, {
        component: 'MediaGallery'
      });
      
    } catch (err) {
      // Track error metrics
      measurementService.sendCustomMeasurement('gallery_load_errors', 1, {
        error_type: 'media_fetch_failed'
      });
      
      dispatch({ 
        type: 'SET_ERROR', 
        payload: err instanceof Error ? err.message : 'Failed to load media' 
      });
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-coral mx-auto mb-4"></div>
          <p className="text-gray-600">Loading media...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-96">
        <div className="text-center">
          <div className="text-red-500 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-red-600 font-medium">Error loading media</p>
          <p className="text-gray-600 text-sm mt-1">{error}</p>
          <button
            onClick={() => {
              measureInteraction('retry_button_click');
              measurementService.sendCustomMeasurement('gallery_retry_attempts', 1);
              loadMedia();
            }}
            className="btn-primary mt-4"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (media.length === 0) {
    return (
      <div className="flex justify-center items-center min-h-96">
        <div className="text-center">
          <div className="text-gray-400 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-xl font-medium text-gray-900 mb-2">No media uploaded yet</h3>
          <p className="text-gray-600 mb-6">Get started by uploading your first image.</p>
          <button
            onClick={() => {
              measureInteraction('upload_button_click', { context: 'empty_gallery' });
              measurementService.sendCustomMeasurement('upload_button_clicks', 1, {
                context: 'empty_gallery'
              });
              onMediaSelect({} as Media); // Trigger upload flow
            }}
            className="btn-primary"
          >
            Upload Media
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h2 className="text-3xl font-display font-light text-charcoal mb-2">Media Gallery</h2>
        <p className="text-gray-medium">
          {selectedTags.length > 0 
            ? `${filteredMedia.length} of ${media.length} items`
            : `${media.length} ${media.length === 1 ? 'item' : 'items'}`
          }
        </p>
      </div>

      {/* Tag Filters */}
      {availableTags.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-700">Filter by tags</h3>
            {selectedTags.length > 0 && (
              <button
                onClick={handleClearFilters}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Clear filters
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {availableTags.map((tag) => {
              const isSelected = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => handleTagClick(tag)}
                  className={`
                    px-3 py-1.5 rounded-full text-sm font-medium transition-colors
                    ${isSelected 
                      ? 'bg-blue-600 text-white hover:bg-blue-700' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }
                  `}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* No results message */}
      {filteredMedia.length === 0 && selectedTags.length > 0 && (
        <div className="flex justify-center items-center min-h-48">
          <div className="text-center">
            <p className="text-gray-600 mb-4">No media matches the selected tags.</p>
            <button
              onClick={handleClearFilters}
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              Clear filters
            </button>
          </div>
        </div>
      )}

      {/* Responsive Grid: 1 column on mobile, 2 on tablet, 3 on desktop */}
      {filteredMedia.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredMedia.map((item) => (
            <MediaTile
              key={item.id}
              media={item}
              onClick={onMediaSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
} 