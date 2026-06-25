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
  title?: string | undefined;
  description?: string | undefined;
  tags?: string[] | undefined;
}

export interface UpdateMediaRequest {
  title?: string | undefined;
  description?: string | undefined;
  tags?: string[] | undefined;
}

export interface ApiError {
  message: string;
  details?: string;
} 