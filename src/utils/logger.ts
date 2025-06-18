/**
 * Logger utility for application-wide logging
 */

// Log levels enum
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

// Current log level
let currentLogLevel = LogLevel.INFO;

// Format bytes to a human-readable string
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Set the log level
export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

// Get the current log level
export function getLogLevel(): LogLevel {
  return currentLogLevel;
}

// Format timestamp
function getTimestamp(): string {
  return new Date().toISOString();
}

// Basic logging functions
export function debug(message: string, ...args: any[]): void {
  if (currentLogLevel <= LogLevel.DEBUG) {
    console.log(`[${getTimestamp()}] [DEBUG] ${message}`, ...args);
  }
}

export function info(message: string, ...args: any[]): void {
  if (currentLogLevel <= LogLevel.INFO) {
    console.log(`[${getTimestamp()}] [INFO] ${message}`, ...args);
  }
}

export function warn(message: string, ...args: any[]): void {
  if (currentLogLevel <= LogLevel.WARN) {
    console.warn(`[${getTimestamp()}] [WARN] ${message}`, ...args);
  }
}

export function error(message: string, ...args: any[]): void {
  if (currentLogLevel <= LogLevel.ERROR) {
    console.error(`[${getTimestamp()}] [ERROR] ${message}`, ...args);
  }
}

// Specialized logging for S3 uploads
export function uploadStart(dirPath: string, bucket: string): void {
  info(`Starting upload of directory ${dirPath} to S3 bucket ${bucket}`);
}

export function uploadProgress(filesUploaded: number, totalFiles: number, bytesUploaded: number, totalBytes: number, elapsedSeconds: number): void {
  const percentComplete = totalFiles > 0 ? 
    ((filesUploaded / totalFiles) * 100).toFixed(1) : '0';
    
  info(`Progress: ${filesUploaded}/${totalFiles} files ` + 
       `(${percentComplete}%), ${formatBytes(bytesUploaded)}/${formatBytes(totalBytes)}, ` +
       `elapsed: ${elapsedSeconds.toFixed(1)}s`);
}

export function uploadFileSuccess(s3Key: string, fileSize: number, duration: number): void {
  debug(`✓ Uploaded: ${s3Key} (${formatBytes(fileSize)}) in ${duration}ms`);
}

export function uploadFileStart(filePath: string, fileSize: number, s3Key: string): void {
  debug(`Uploading file: ${filePath} (${formatBytes(fileSize)}) to S3 key: ${s3Key}`);
}

export function uploadFileError(filePath: string, s3Key: string, err: any): void {
  error(`❌ Error uploading ${filePath} to ${s3Key}:`, err);
}

export function uploadComplete(filesUploaded: number, bytesUploaded: number, totalTimeSeconds: number): void {
  info(`✅ Upload complete! ${filesUploaded} files (${formatBytes(bytesUploaded)}) uploaded in ${totalTimeSeconds.toFixed(1)}s`);
  
  if (bytesUploaded > 0) {
    const speedMBps = (bytesUploaded / (1024 * 1024)) / totalTimeSeconds;
    info(`Average upload speed: ${speedMBps.toFixed(2)} MB/s`);
  }
}

export const Logger = {
  setLogLevel,
  getLogLevel,
  debug,
  info,
  warn,
  error,
  formatBytes,
  upload: {
    start: uploadStart,
    progress: uploadProgress,
    fileStart: uploadFileStart,
    fileSuccess: uploadFileSuccess,
    fileError: uploadFileError,
    complete: uploadComplete
  }
};

export default Logger;
