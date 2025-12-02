export interface Media {
  id: string;
  fileName: string;
  title?: string;
  description?: string;
  contentType: string;
  size: number;
  uploadedAt: string;
}

export interface UploadMediaRequest {
  title?: string;
  description?: string;
}

export interface UpdateMediaRequest {
  title?: string;
  description?: string;
}

export interface ApiError {
  message: string;
  details?: string;
} 