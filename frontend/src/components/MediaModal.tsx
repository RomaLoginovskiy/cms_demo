import React, { useState } from 'react';
import { Media, UpdateMediaRequest } from '../types';
import { mediaApi } from '../services/api';
import { useMedia } from '../contexts/MediaContext';
import TagInput from './TagInput';

interface MediaModalProps {
  media: Media | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function MediaModal({ media, isOpen, onClose }: MediaModalProps) {
  const { dispatch } = useMedia();
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [title, setTitle] = useState(media?.title || '');
  const [description, setDescription] = useState(media?.description || '');
  const [tags, setTags] = useState<string[]>(media?.tags || []);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (media) {
      setTitle(media.title || '');
      setDescription(media.description || '');
      setTags(media.tags || []);
    }
  }, [media]);

  if (!isOpen || !media) return null;

  const handleSave = async () => {
    try {
      setLoading(true);
      const updateData: UpdateMediaRequest = {
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        tags: tags,
      };

      const updatedMedia = await mediaApi.update(media.id, updateData);
      dispatch({ type: 'UPDATE_MEDIA', payload: updatedMedia });
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update media:', error);
      // TODO: Show error toast
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this media? This action cannot be undone.')) {
      return;
    }

    try {
      setLoading(true);
      await mediaApi.delete(media.id);
      dispatch({ type: 'DELETE_MEDIA', payload: media.id });
      onClose();
    } catch (error) {
      console.error('Failed to delete media:', error);
      // TODO: Show error toast
    } finally {
      setLoading(false);
    }
  };

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
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-display font-medium">Media Details</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col lg:flex-row overflow-hidden">
          {/* Image */}
          <div className="lg:w-2/3 bg-gray-100 flex items-center justify-center p-4">
            <img
              src={mediaApi.getFileUrl(media.id)}
              alt={media.title || media.fileName}
              className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-lg"
            />
          </div>

          {/* Metadata Panel */}
          <div className="lg:w-1/3 p-6 flex flex-col">
            <div className="flex-1">
              {/* Title */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-coral focus:border-transparent"
                    placeholder="Enter title..."
                  />
                ) : (
                  <p className="text-lg font-medium text-gray-900">
                    {media.title || media.fileName}
                  </p>
                )}
              </div>

              {/* Description */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                {isEditing ? (
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-coral focus:border-transparent"
                    placeholder="Enter description..."
                  />
                ) : (
                  <p className="text-gray-600">
                    {media.description || 'No description available'}
                  </p>
                )}
              </div>

              {/* Tags */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Tags</label>
                <TagInput
                  tags={tags}
                  onChange={setTags}
                  readOnly={!isEditing}
                  disabled={loading}
                  placeholder="Add tags..."
                />
              </div>

              {/* File Information */}
              <div className="space-y-3 text-sm text-gray-500 border-t pt-4">
                <div className="flex justify-between">
                  <span>File name:</span>
                  <span className="font-mono text-xs">{media.fileName}</span>
                </div>
                <div className="flex justify-between">
                  <span>File size:</span>
                  <span>{formatFileSize(media.size)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Type:</span>
                  <span>{media.contentType}</span>
                </div>
                <div className="flex justify-between">
                  <span>Uploaded:</span>
                  <span>{formatDate(media.uploadedAt)}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col space-y-3 mt-6 pt-6 border-t">
              {isEditing ? (
                <div className="flex space-x-3">
                  <button
                    onClick={handleSave}
                    disabled={loading}
                    className="btn-primary flex-1 disabled:opacity-50"
                  >
                    {loading ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setTitle(media.title || '');
                      setDescription(media.description || '');
                      setTags(media.tags || []);
                    }}
                    disabled={loading}
                    className="btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="btn-primary w-full"
                >
                  Edit Details
                </button>
              )}
              
              <button
                onClick={handleDelete}
                disabled={loading}
                className="w-full px-4 py-2 border border-red-300 text-red-600 rounded-md hover:bg-red-50 hover:border-red-400 transition-colors disabled:opacity-50"
              >
                {loading ? 'Deleting...' : 'Delete Media'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 