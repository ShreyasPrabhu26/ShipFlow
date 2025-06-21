// Request types
export interface UploadRequestBody {
    repoUrl: string;
}

// Response types
export interface UploadResponse {
    id: string;
    processingTimeMs?: number; // Time taken to process the upload in milliseconds
}
