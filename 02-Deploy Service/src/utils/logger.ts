/**
 * Logger utility
 * Provides consistent logging functionality across the application
 */

export default class Logger {
  static info(message: string, ...args: any[]) {
    console.log(`[INFO] ${message}`, ...args);
  }

  static warn(message: string, ...args: any[]) {
    console.log(`[WARN] ${message}`, ...args);
  }

  static error(message: string, ...args: any[]) {
    console.error(`[ERROR] ${message}`, ...args);
  }

  static download = {
    start: (s3Key: string, localPath: string) => {
      console.log(`[DOWNLOAD] Starting download from S3 key '${s3Key}' to '${localPath}'`);
    },
    fileStart: (s3Key: string, fileSize: number, localPath: string) => {
      console.log(`[DOWNLOAD] Starting file download '${s3Key}' (${Logger.formatBytes(fileSize)}) to '${localPath}'`);
    },
    fileSuccess: (s3Key: string, fileSize: number, durationMs: number) => {
      console.log(`[DOWNLOAD] Successfully downloaded '${s3Key}' (${Logger.formatBytes(fileSize)}) in ${durationMs}ms`);
    },
    fileError: (s3Key: string, localPath: string, error: any) => {
      console.error(`[DOWNLOAD] Failed to download '${s3Key}' to '${localPath}':`, error);
    },
    complete: (filesDownloaded: number, bytesDownloaded: number, totalTimeSeconds: number) => {
      console.log(
        `[DOWNLOAD] Completed downloading ${filesDownloaded} files ` +
        `(${Logger.formatBytes(bytesDownloaded)}) in ${totalTimeSeconds.toFixed(1)}s`
      );
    }
  };

  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
