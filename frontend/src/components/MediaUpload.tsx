import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMedia } from '../contexts/MediaContext';
import { measurementService } from '../services/measurements';
import { UploadMediaRequest } from '../types/index';
import { mediaApi } from '../services/api';
import TagInput from './TagInput';

interface UploadFile {
  id: string;
  file: File;
  preview: string;
  title: string;
  description: string;
  tags: string[];
  isUploading: boolean;
  uploadProgress: number;
  error?: string | undefined;
}

const MediaUpload: React.FC = () => {
  const navigate = useNavigate();
  const { dispatch } = useMedia();
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const maxSize = 5 * 1024 * 1024; // 5MB

    if (!allowedTypes.includes(file.type)) {
      return 'Only JPEG, PNG, GIF, and WebP images are allowed.';
    }

    if (file.size > maxSize) {
      return 'File size must be less than 5MB.';
    }

    return null;
  };

  const createUploadFile = (file: File): UploadFile => ({
    id: Math.random().toString(36).substr(2, 9),
    file,
    preview: URL.createObjectURL(file),
    title: file.name.replace(/\.[^/.]+$/, ''), // Remove extension
    description: '',
    tags: [],
    isUploading: false,
    uploadProgress: 0,
  });

  const handleFiles = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);
    const validFiles: UploadFile[] = [];
    let totalSize = 0;
    let rejectedCount = 0;

    fileArray.forEach((file) => {
      const error = validateFile(file);
      if (!error) {
        validFiles.push(createUploadFile(file));
        totalSize += file.size;
      } else {
        alert(`${file.name}: ${error}`);
        rejectedCount++;
      }
    });

    // Track file selection metrics
    measurementService.sendCustomMeasurement('files_selected_count', fileArray.length);
    measurementService.sendCustomMeasurement('files_accepted_count', validFiles.length);
    measurementService.sendCustomMeasurement('files_rejected_count', rejectedCount);
    measurementService.sendCustomMeasurement('files_total_size_bytes', totalSize);

    setFiles((prev) => [...prev, ...validFiles]);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    // Track drag and drop usage
    measurementService.sendCustomMeasurement('drag_drop_events', 1);

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      handleFiles(droppedFiles);
    }
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles) {
      // Track file browser usage
      measurementService.sendCustomMeasurement('file_browser_events', 1);
      handleFiles(selectedFiles);
    }
  };

  const updateFile = (id: string, updates: Partial<UploadFile>) => {
    setFiles((prev) =>
      prev.map((file) => (file.id === id ? { ...file, ...updates } : file))
    );
  };

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file?.preview) {
        URL.revokeObjectURL(file.preview);
      }
      return prev.filter((f) => f.id !== id);
    });
  };

  const uploadSingleFile = async (uploadFile: UploadFile) => {
    const uploadStartTime = performance.now();
    
    try {
      updateFile(uploadFile.id, { isUploading: true, uploadProgress: 0, error: undefined });

      // Start upload time measurement
      measurementService.startTimeMeasurement(`upload_${uploadFile.id}`, {
        file_name: uploadFile.file.name,
        file_size: uploadFile.file.size.toString(),
        file_type: uploadFile.file.type
      });

      // Create FileList from single file
      const fileList = new DataTransfer();
      fileList.items.add(uploadFile.file);

      const uploadRequest: UploadMediaRequest = {
        title: uploadFile.title,
        description: uploadFile.description,
        tags: uploadFile.tags.length > 0 ? uploadFile.tags : undefined,
      };

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        updateFile(uploadFile.id, { 
          uploadProgress: Math.min(uploadFile.uploadProgress + 10, 90) 
        });
      }, 200);

      const result = await mediaApi.upload(fileList.files, uploadRequest);
      
      clearInterval(progressInterval);
      updateFile(uploadFile.id, { isUploading: false, uploadProgress: 100 });

      // End upload time measurement
      measurementService.endTimeMeasurement(`upload_${uploadFile.id}`);
      
      // Track detailed upload metrics
      measurementService.sendCustomMeasurement('successful_uploads', 1);
      measurementService.sendCustomMeasurement('upload_success_rate', 100, {
        file_type: uploadFile.file.type
      });

      // Add to context
      dispatch({ type: 'ADD_MEDIA', payload: result });

      // Remove file after successful upload
      setTimeout(() => removeFile(uploadFile.id), 1500);

    } catch (error) {
      // End upload time measurement even on error
      measurementService.endTimeMeasurement(`upload_${uploadFile.id}`);
      
      // Track failed upload metrics
      measurementService.sendCustomMeasurement('failed_uploads', 1);
      measurementService.sendCustomMeasurement('upload_success_rate', 0, {
        file_type: uploadFile.file.type,
        error_type: error instanceof Error ? error.name : 'unknown'
      });
      
      updateFile(uploadFile.id, {
        isUploading: false,
        uploadProgress: 0,
        error: error instanceof Error ? error.message : 'Upload failed',
      });
    }
  };

  const uploadAll = async () => {
    const filesToUpload = files.filter((f) => !f.isUploading && !f.error && f.uploadProgress !== 100);
    
    // Track batch upload metrics
    measurementService.sendCustomMeasurement('batch_upload_initiated', 1);
    measurementService.sendCustomMeasurement('batch_upload_file_count', filesToUpload.length);
    
    measurementService.startTimeMeasurement('batch_upload_time');
    
    for (const file of filesToUpload) {
      await uploadSingleFile(file);
    }
    
    measurementService.endTimeMeasurement('batch_upload_time');
    
    measurementService.sendCustomMeasurement('batch_upload_completed', 1);
  };

  const hasFilesToUpload = files.some((f) => !f.isUploading && !f.error && f.uploadProgress !== 100);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-display text-gray-900">Upload Media</h1>
        <button
          onClick={() => navigate('/')}
          className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          ← Back to Gallery
        </button>
      </div>

      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          relative border-2 border-dashed rounded-lg p-12 text-center transition-all
          ${isDragOver 
            ? 'border-blue-400 bg-blue-50' 
            : 'border-gray-300 hover:border-gray-400'
          }
        `}
      >
        <div 
          className="space-y-4 pointer-events-none"
        >
          <div className="text-6xl text-gray-400">
            📁
          </div>
          <div>
            <p className="text-lg font-medium text-gray-900 mb-2">
              Drop images here or click to browse
            </p>
            <p className="text-sm text-gray-500">
              Supports JPEG, PNG, GIF, WebP (max 5MB each)
            </p>
          </div>
        </div>
        
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={handleFileInput}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">
              Files to Upload ({files.length})
            </h3>
            {hasFilesToUpload && (
              <button
                onClick={uploadAll}
                disabled={files.some((f) => f.isUploading)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Upload All
              </button>
            )}
          </div>

          <div className="space-y-4">
            {files.map((uploadFile) => (
              <div
                key={uploadFile.id}
                className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm"
              >
                <div className="flex gap-4">
                  {/* Preview */}
                  <div className="flex-shrink-0">
                    <img
                      src={uploadFile.preview}
                      alt={uploadFile.title}
                      className="w-20 h-20 object-cover rounded-lg border"
                    />
                  </div>

                  {/* File Info */}
                  <div className="flex-grow space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Title
                        </label>
                        <input
                          type="text"
                          value={uploadFile.title}
                          onChange={(e) => updateFile(uploadFile.id, { title: e.target.value })}
                          disabled={uploadFile.isUploading}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Description
                        </label>
                        <input
                          type="text"
                          value={uploadFile.description}
                          onChange={(e) => updateFile(uploadFile.id, { description: e.target.value })}
                          disabled={uploadFile.isUploading}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Tags
                      </label>
                      <TagInput
                        tags={uploadFile.tags}
                        onChange={(tags) => updateFile(uploadFile.id, { tags })}
                        disabled={uploadFile.isUploading}
                        placeholder="Add tags (press Enter or comma to add)"
                      />
                    </div>

                    <div className="flex items-center justify-between text-sm text-gray-500">
                      <span>
                        {uploadFile.file.name} • {(uploadFile.file.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                      <div className="flex items-center gap-2">
                        {uploadFile.error && (
                          <span className="text-red-600 text-sm">
                            {uploadFile.error}
                          </span>
                        )}
                                                 {!uploadFile.isUploading && uploadFile.uploadProgress !== 100 && (
                           <button
                             onClick={() => uploadSingleFile(uploadFile)}
                             className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                           >
                             Upload
                           </button>
                         )}
                        {uploadFile.uploadProgress === 100 && (
                          <span className="text-green-600 text-sm font-medium">
                            ✓ Uploaded
                          </span>
                        )}
                        <button
                          onClick={() => removeFile(uploadFile.id)}
                          disabled={uploadFile.isUploading}
                          className="text-red-600 hover:text-red-700 text-sm font-medium disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    {(uploadFile.isUploading || uploadFile.uploadProgress > 0) && (
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all duration-300 ${
                            uploadFile.error
                              ? 'bg-red-500'
                              : uploadFile.uploadProgress === 100
                              ? 'bg-green-500'
                              : 'bg-blue-500'
                          }`}
                          style={{ width: `${uploadFile.uploadProgress}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MediaUpload; 