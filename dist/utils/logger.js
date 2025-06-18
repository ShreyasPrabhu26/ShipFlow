"use strict";
/**
 * Logger utility for application-wide logging
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = exports.LogLevel = void 0;
exports.formatBytes = formatBytes;
exports.setLogLevel = setLogLevel;
exports.getLogLevel = getLogLevel;
exports.debug = debug;
exports.info = info;
exports.warn = warn;
exports.error = error;
exports.uploadStart = uploadStart;
exports.uploadProgress = uploadProgress;
exports.uploadFileSuccess = uploadFileSuccess;
exports.uploadFileStart = uploadFileStart;
exports.uploadFileError = uploadFileError;
exports.uploadComplete = uploadComplete;
// Log levels enum
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["DEBUG"] = 0] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 1] = "INFO";
    LogLevel[LogLevel["WARN"] = 2] = "WARN";
    LogLevel[LogLevel["ERROR"] = 3] = "ERROR";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
// Current log level
let currentLogLevel = LogLevel.INFO;
// Format bytes to a human-readable string
function formatBytes(bytes) {
    if (bytes === 0)
        return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
// Set the log level
function setLogLevel(level) {
    currentLogLevel = level;
}
// Get the current log level
function getLogLevel() {
    return currentLogLevel;
}
// Format timestamp
function getTimestamp() {
    return new Date().toISOString();
}
// Basic logging functions
function debug(message, ...args) {
    if (currentLogLevel <= LogLevel.DEBUG) {
        console.log(`[${getTimestamp()}] [DEBUG] ${message}`, ...args);
    }
}
function info(message, ...args) {
    if (currentLogLevel <= LogLevel.INFO) {
        console.log(`[${getTimestamp()}] [INFO] ${message}`, ...args);
    }
}
function warn(message, ...args) {
    if (currentLogLevel <= LogLevel.WARN) {
        console.warn(`[${getTimestamp()}] [WARN] ${message}`, ...args);
    }
}
function error(message, ...args) {
    if (currentLogLevel <= LogLevel.ERROR) {
        console.error(`[${getTimestamp()}] [ERROR] ${message}`, ...args);
    }
}
// Specialized logging for S3 uploads
function uploadStart(dirPath, bucket) {
    info(`Starting upload of directory ${dirPath} to S3 bucket ${bucket}`);
}
function uploadProgress(filesUploaded, totalFiles, bytesUploaded, totalBytes, elapsedSeconds) {
    const percentComplete = totalFiles > 0 ?
        ((filesUploaded / totalFiles) * 100).toFixed(1) : '0';
    info(`Progress: ${filesUploaded}/${totalFiles} files ` +
        `(${percentComplete}%), ${formatBytes(bytesUploaded)}/${formatBytes(totalBytes)}, ` +
        `elapsed: ${elapsedSeconds.toFixed(1)}s`);
}
function uploadFileSuccess(s3Key, fileSize, duration) {
    debug(`✓ Uploaded: ${s3Key} (${formatBytes(fileSize)}) in ${duration}ms`);
}
function uploadFileStart(filePath, fileSize, s3Key) {
    debug(`Uploading file: ${filePath} (${formatBytes(fileSize)}) to S3 key: ${s3Key}`);
}
function uploadFileError(filePath, s3Key, err) {
    error(`❌ Error uploading ${filePath} to ${s3Key}:`, err);
}
function uploadComplete(filesUploaded, bytesUploaded, totalTimeSeconds) {
    info(`✅ Upload complete! ${filesUploaded} files (${formatBytes(bytesUploaded)}) uploaded in ${totalTimeSeconds.toFixed(1)}s`);
    if (bytesUploaded > 0) {
        const speedMBps = (bytesUploaded / (1024 * 1024)) / totalTimeSeconds;
        info(`Average upload speed: ${speedMBps.toFixed(2)} MB/s`);
    }
}
exports.Logger = {
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
exports.default = exports.Logger;
