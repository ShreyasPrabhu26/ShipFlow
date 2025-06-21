import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createReadStream } from 'fs';
import { readdir, stat } from 'fs/promises';
import * as path from 'path';
import { AWS_CREDENTIALS, HAS_EXPLICIT_CREDENTIALS } from '../config';
import Logger from './logger';

// For performance monitoring
interface UploadStats {
    totalFiles: number;
    filesUploaded: number;
    totalBytes: number;
    bytesUploaded: number;
    startTime: number;
    lastLogTime: number;
}

/**
 * Utility class to handle recursive uploads of directories to S3
 */
export class S3DirectoryUploader {
    private s3Client: S3Client;
    private bucket: string;
    private stats: UploadStats = {
        totalFiles: 0,
        filesUploaded: 0,
        totalBytes: 0,
        bytesUploaded: 0,
        startTime: 0,
        lastLogTime: 0
    };
    private logIntervalMs = 2000; // Log progress every 2 seconds

    /**
     * Creates a new S3DirectoryUploader instance
     * @param region - AWS region
     * @param bucket - S3 bucket name
     */
    constructor(region: string, bucket: string) {
        Logger.info(`Initializing S3DirectoryUploader for region ${region}, bucket ${bucket}`);

        // Initialize S3 client with region and optional credentials if available
        const clientConfig: any = { region };

        // Only add credentials if they are explicitly provided
        if (HAS_EXPLICIT_CREDENTIALS) {
            Logger.info('Using explicitly provided AWS credentials');
            clientConfig.credentials = {
                accessKeyId: AWS_CREDENTIALS.accessKeyId!,
                secretAccessKey: AWS_CREDENTIALS.secretAccessKey!
            };

            // Add session token if available
            if (AWS_CREDENTIALS.sessionToken) {
                Logger.info('Using AWS session token');
                clientConfig.credentials.sessionToken = AWS_CREDENTIALS.sessionToken;
            }
        } else {
            Logger.warn('No explicit credentials found. Using AWS credential provider chain.');
        }

        // Add custom request handler for debugging
        clientConfig.requestHandler = {
            ...clientConfig.requestHandler,
            debug: true
        };

        this.s3Client = new S3Client(clientConfig);
        this.bucket = bucket;
    }

    /**
     * Uploads a file to S3
     * @param filePath - Local file path
     * @param s3Key - S3 key (path in bucket)
     */
    private async uploadFile(filePath: string, s3Key: string): Promise<void> {
        try {
            const fileStats = await stat(filePath);
            const fileSize = fileStats.size;

            Logger.upload.fileStart(filePath, fileSize, s3Key);

            const startTime = Date.now();
            const fileStream = createReadStream(filePath);

            const params = {
                Bucket: this.bucket,
                Key: s3Key,
                Body: fileStream,
                ContentLength: fileSize,
            };

            await this.s3Client.send(new PutObjectCommand(params));

            const duration = Date.now() - startTime;

            // Update statistics
            this.stats.filesUploaded++;
            this.stats.bytesUploaded += fileSize;

            Logger.upload.fileSuccess(s3Key, fileSize, duration);

            // Log progress periodically
            this.logProgress();
        } catch (error) {
            Logger.upload.fileError(filePath, s3Key, error);
            throw error;
        }
    }

    /**
     * Format bytes to a human-readable string
     */
    // Using the shared formatBytes function from Logger
    private formatBytes(bytes: number): string {
        return Logger.formatBytes(bytes);
    }

    /**
     * Log upload progress if enough time has passed since the last log
     */
    private logProgress(): void {
        const now = Date.now();

        // Only log if it's been at least logIntervalMs since last log
        if (now - this.stats.lastLogTime >= this.logIntervalMs) {
            const elapsedSeconds = (now - this.stats.startTime) / 1000;

            Logger.upload.progress(
                this.stats.filesUploaded,
                this.stats.totalFiles,
                this.stats.bytesUploaded,
                this.stats.totalBytes,
                elapsedSeconds
            );

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
    private async calculateDirectoryStats(dirPath: string): Promise<void> {
        try {
            const entries = await readdir(dirPath, { withFileTypes: true });

            for (const entry of entries) {
                const entryPath = path.join(dirPath, entry.name);

                if (entry.isDirectory()) {
                    // Recursively count files in subdirectory
                    await this.calculateDirectoryStats(entryPath);
                } else {
                    // Count file and its size
                    const fileStats = await stat(entryPath);
                    this.stats.totalFiles++;
                    this.stats.totalBytes += fileStats.size;
                }
            }
        } catch (error) {
            Logger.error(`Error calculating directory stats for ${dirPath}:`, error);
            throw error;
        }
    }

    /**
     * Recursively uploads a directory and its contents to S3
     * @param dirPath - Path to the directory to upload
     * @param s3Prefix - S3 key prefix (folder in bucket)
     * @returns Promise that resolves when all uploads are complete
     */
    public async uploadDirectory(dirPath: string, s3Prefix: string = ''): Promise<void> {
        try {
            Logger.upload.start(dirPath, this.bucket);

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
            Logger.info('Calculating directory statistics...');
            await this.calculateDirectoryStats(dirPath);
            Logger.info(`Found ${this.stats.totalFiles} files totaling ${this.formatBytes(this.stats.totalBytes)}`);

            // Now perform the actual upload
            // List all files/folders in the directory
            const entries = await readdir(dirPath, { withFileTypes: true });
            const uploadPromises: Promise<void>[] = [];
            const concurrencyLimit = 5; // Limit concurrent uploads to avoid overwhelming connections
            let activePromises = 0;

            // Function to process next entry with concurrency control
            const processEntry = async (index: number) => {
                if (index >= entries.length) return;

                const entry = entries[index];
                const entryPath = path.join(dirPath, entry.name);
                const entryS3Key = s3Prefix ? `${s3Prefix}/${entry.name}` : entry.name;

                activePromises++;
                try {
                    if (entry.isDirectory()) {
                        // Recursively handle subdirectory
                        await this.uploadDirectory(entryPath, entryS3Key);
                    } else {
                        // Upload file
                        await this.uploadFile(entryPath, entryS3Key);
                    }
                } finally {
                    activePromises--;
                    // Process next entry
                    await processEntry(index + concurrencyLimit);
                }
            };

            // Start initial batch of promises up to concurrencyLimit
            const initialPromises = [];
            for (let i = 0; i < Math.min(concurrencyLimit, entries.length); i++) {
                initialPromises.push(processEntry(i));
            }

            // Wait for all initial promises to complete
            await Promise.all(initialPromises);

            // Final stats
            const totalTimeSeconds = (Date.now() - this.stats.startTime) / 1000;

            // Log completion
            Logger.upload.complete(
                this.stats.filesUploaded,
                this.stats.bytesUploaded,
                totalTimeSeconds
            );
        } catch (error) {
            Logger.error(`Error uploading directory ${dirPath} to ${s3Prefix}:`, error);
            throw error;
        }
    }
}
