"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.S3DirectoryUploader = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const path = __importStar(require("path"));
const config_1 = require("../config");
const logger_1 = __importDefault(require("./logger"));
/**
 * Utility class to handle recursive uploads of directories to S3
 */
class S3DirectoryUploader {
    /**
     * Creates a new S3DirectoryUploader instance
     * @param region - AWS region
     * @param bucket - S3 bucket name
     */
    constructor(region, bucket) {
        this.stats = {
            totalFiles: 0,
            filesUploaded: 0,
            totalBytes: 0,
            bytesUploaded: 0,
            startTime: 0,
            lastLogTime: 0
        };
        this.logIntervalMs = 2000; // Log progress every 2 seconds
        logger_1.default.info(`Initializing S3DirectoryUploader for region ${region}, bucket ${bucket}`);
        // Initialize S3 client with region and optional credentials if available
        const clientConfig = { region };
        // Only add credentials if they are explicitly provided
        if (config_1.HAS_EXPLICIT_CREDENTIALS) {
            logger_1.default.info('Using explicitly provided AWS credentials');
            clientConfig.credentials = {
                accessKeyId: config_1.AWS_CREDENTIALS.accessKeyId,
                secretAccessKey: config_1.AWS_CREDENTIALS.secretAccessKey
            };
            // Add session token if available
            if (config_1.AWS_CREDENTIALS.sessionToken) {
                logger_1.default.info('Using AWS session token');
                clientConfig.credentials.sessionToken = config_1.AWS_CREDENTIALS.sessionToken;
            }
        }
        else {
            logger_1.default.warn('No explicit credentials found. Using AWS credential provider chain.');
        }
        // Add custom request handler for debugging
        clientConfig.requestHandler = Object.assign(Object.assign({}, clientConfig.requestHandler), { debug: true });
        this.s3Client = new client_s3_1.S3Client(clientConfig);
        this.bucket = bucket;
    }
    /**
     * Uploads a file to S3
     * @param filePath - Local file path
     * @param s3Key - S3 key (path in bucket)
     */
    uploadFile(filePath, s3Key) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const fileStats = yield (0, promises_1.stat)(filePath);
                const fileSize = fileStats.size;
                logger_1.default.upload.fileStart(filePath, fileSize, s3Key);
                const startTime = Date.now();
                const fileStream = (0, fs_1.createReadStream)(filePath);
                const params = {
                    Bucket: this.bucket,
                    Key: s3Key,
                    Body: fileStream,
                    ContentLength: fileSize,
                };
                yield this.s3Client.send(new client_s3_1.PutObjectCommand(params));
                const duration = Date.now() - startTime;
                // Update statistics
                this.stats.filesUploaded++;
                this.stats.bytesUploaded += fileSize;
                logger_1.default.upload.fileSuccess(s3Key, fileSize, duration);
                // Log progress periodically
                this.logProgress();
            }
            catch (error) {
                logger_1.default.upload.fileError(filePath, s3Key, error);
                throw error;
            }
        });
    }
    /**
     * Format bytes to a human-readable string
     */
    // Using the shared formatBytes function from Logger
    formatBytes(bytes) {
        return logger_1.default.formatBytes(bytes);
    }
    /**
     * Log upload progress if enough time has passed since the last log
     */
    logProgress() {
        const now = Date.now();
        // Only log if it's been at least logIntervalMs since last log
        if (now - this.stats.lastLogTime >= this.logIntervalMs) {
            const elapsedSeconds = (now - this.stats.startTime) / 1000;
            logger_1.default.upload.progress(this.stats.filesUploaded, this.stats.totalFiles, this.stats.bytesUploaded, this.stats.totalBytes, elapsedSeconds);
            this.stats.lastLogTime = now;
        }
    }
    /**
     * Recursively uploads a directory and its contents to S3
     * @param dirPath - Path to the directory to upload
     * @param s3Prefix - S3 key prefix (folder in bucket)
     * @returns Promise that resolves when all uploads are complete
     */
    /**
     * Count all files and their total size in the directory
     */
    calculateDirectoryStats(dirPath) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const entries = yield (0, promises_1.readdir)(dirPath, { withFileTypes: true });
                for (const entry of entries) {
                    const entryPath = path.join(dirPath, entry.name);
                    if (entry.isDirectory()) {
                        // Recursively count files in subdirectory
                        yield this.calculateDirectoryStats(entryPath);
                    }
                    else {
                        // Count file and its size
                        const fileStats = yield (0, promises_1.stat)(entryPath);
                        this.stats.totalFiles++;
                        this.stats.totalBytes += fileStats.size;
                    }
                }
            }
            catch (error) {
                logger_1.default.error(`Error calculating directory stats for ${dirPath}:`, error);
                throw error;
            }
        });
    }
    /**
     * Recursively uploads a directory and its contents to S3
     * @param dirPath - Path to the directory to upload
     * @param s3Prefix - S3 key prefix (folder in bucket)
     * @returns Promise that resolves when all uploads are complete
     */
    uploadDirectory(dirPath_1) {
        return __awaiter(this, arguments, void 0, function* (dirPath, s3Prefix = '') {
            try {
                logger_1.default.upload.start(dirPath, this.bucket);
                // Reset stats and start timer
                this.stats = {
                    totalFiles: 0,
                    filesUploaded: 0,
                    totalBytes: 0,
                    bytesUploaded: 0,
                    startTime: Date.now(),
                    lastLogTime: Date.now()
                };
                // First, calculate total files and size for progress reporting
                logger_1.default.info('Calculating directory statistics...');
                yield this.calculateDirectoryStats(dirPath);
                logger_1.default.info(`Found ${this.stats.totalFiles} files totaling ${this.formatBytes(this.stats.totalBytes)}`);
                // Now perform the actual upload
                // List all files/folders in the directory
                const entries = yield (0, promises_1.readdir)(dirPath, { withFileTypes: true });
                const uploadPromises = [];
                const concurrencyLimit = 5; // Limit concurrent uploads to avoid overwhelming connections
                let activePromises = 0;
                // Function to process next entry with concurrency control
                const processEntry = (index) => __awaiter(this, void 0, void 0, function* () {
                    if (index >= entries.length)
                        return;
                    const entry = entries[index];
                    const entryPath = path.join(dirPath, entry.name);
                    const entryS3Key = s3Prefix ? `${s3Prefix}/${entry.name}` : entry.name;
                    activePromises++;
                    try {
                        if (entry.isDirectory()) {
                            // Recursively handle subdirectory
                            yield this.uploadDirectory(entryPath, entryS3Key);
                        }
                        else {
                            // Upload file
                            yield this.uploadFile(entryPath, entryS3Key);
                        }
                    }
                    finally {
                        activePromises--;
                        // Process next entry
                        yield processEntry(index + concurrencyLimit);
                    }
                });
                // Start initial batch of promises up to concurrencyLimit
                const initialPromises = [];
                for (let i = 0; i < Math.min(concurrencyLimit, entries.length); i++) {
                    initialPromises.push(processEntry(i));
                }
                // Wait for all initial promises to complete
                yield Promise.all(initialPromises);
                // Final stats
                const totalTimeSeconds = (Date.now() - this.stats.startTime) / 1000;
                // Log completion
                logger_1.default.upload.complete(this.stats.filesUploaded, this.stats.bytesUploaded, totalTimeSeconds);
            }
            catch (error) {
                logger_1.default.error(`Error uploading directory ${dirPath} to ${s3Prefix}:`, error);
                throw error;
            }
        });
    }
}
exports.S3DirectoryUploader = S3DirectoryUploader;
