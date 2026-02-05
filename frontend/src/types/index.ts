export interface Media {
  id: string;
  fileName: string;
  title?: string;
  description?: string;
  contentType: string;
  size: number;
  uploadedAt: string;
  tags?: string[];
}

export interface UploadMediaRequest {
  title?: string;
  description?: string;
  tags?: string[];
}

export interface UpdateMediaRequest {
  title?: string;
  description?: string;
  tags?: string[];
}

export interface ApiError {
  message: string;
  details?: string;
} 