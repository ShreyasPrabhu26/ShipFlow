import * as AWS from 'aws-sdk';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { AWS_REGION, S3_BUCKET, AWS_CREDENTIALS, HAS_EXPLICIT_CREDENTIALS } from './config';
import Logger from './utils/logger';

// For creating directories
const mkdirAsync = promisify(fs.mkdir);
const writeFileAsync = promisify(fs.writeFile);
const existsAsync = promisify(fs.exists);

// For performance monitoring
interface DownloadStats {
    totalFiles: number;
    filesDownloaded: number;
    totalBytes: number;
    bytesDownloaded: number;
    startTime: number;
    lastLogTime: number;
}

/**
 * Utility class to handle recursive downloads from S3
 */
export class S3DirectoryDownloader {
    private s3Client: AWS.S3;
    private bucket: string;
    private stats: DownloadStats = {
        totalFiles: 0,
        filesDownloaded: 0,
        totalBytes: 0,
        bytesDownloaded: 0,
        startTime: 0,
        lastLogTime: 0
    };
    private logIntervalMs = 2000; // Log progress every 2 seconds

    /**
     * Creates a new S3DirectoryDownloader instance
     * @param region - AWS region
     * @param bucket - S3 bucket name
     */
    constructor(region: string, bucket: string) {
        Logger.info(`Initializing S3DirectoryDownloader for region ${region}, bucket ${bucket}`);

        // Initialize S3 client with region and optional credentials if available
        const clientConfig: AWS.S3.ClientConfiguration = { region };

        // Only add credentials if they are explicitly provided
        if (HAS_EXPLICIT_CREDENTIALS) {
            Logger.info('Using explicitly provided AWS credentials');
            clientConfig.credentials = new AWS.Credentials({
                accessKeyId: AWS_CREDENTIALS.accessKeyId!,
                secretAccessKey: AWS_CREDENTIALS.secretAccessKey!,
                sessionToken: AWS_CREDENTIALS.sessionToken
            });
        } else {
            Logger.warn('No explicit credentials found. Using AWS credential provider chain.');
        }

        this.s3Client = new AWS.S3(clientConfig);
        this.bucket = bucket;
    }

    /**
     * Downloads a file from S3
     * @param s3Key - S3 key (path in bucket)
     * @param localFilePath - Local file path to save the file
     */
    private async downloadFile(s3Key: string, localFilePath: string): Promise<void> {
        try {
            // Ensure the directory exists
            const dir = path.dirname(localFilePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            // Get object metadata to know the file size for progress reporting
            const headParams = {
                Bucket: this.bucket,
                Key: s3Key
            };

            const metadata = await this.s3Client.headObject(headParams).promise();
            const fileSize = metadata.ContentLength || 0;

            Logger.download.fileStart(s3Key, fileSize, localFilePath);
            const startTime = Date.now();

            // Create write stream to efficiently write the file to disk
            const outputFile = fs.createWriteStream(localFilePath);
            
            // Download the file using streaming for better memory efficiency
            return new Promise<void>((resolve, reject) => {
                this.s3Client.getObject({
                    Bucket: this.bucket,
                    Key: s3Key
                }).createReadStream()
                  .pipe(outputFile)
                  .on('error', (err) => {
                      Logger.download.fileError(s3Key, localFilePath, err);
                      reject(err);
                  })
                  .on('finish', () => {
                      const duration = Date.now() - startTime;
                      
                      // Update statistics
                      this.stats.filesDownloaded++;
                      this.stats.bytesDownloaded += fileSize;
                      
                      Logger.download.fileSuccess(s3Key, fileSize, duration);
                      
                      // Log progress periodically
                      this.logProgress();
                      resolve();
                  });
            });
        } catch (error) {
            Logger.download.fileError(s3Key, localFilePath, error);
            throw error;
        }
    }

    /**
     * Format bytes to a human-readable string
     */
    private formatBytes(bytes: number): string {
        return Logger.formatBytes(bytes);
    }

    /**
     * Log download progress if enough time has passed since the last log
     */
    private logProgress(): void {
        const now = Date.now();

        // Only log if it's been at least logIntervalMs since last log
        if (now - this.stats.lastLogTime >= this.logIntervalMs) {
            const elapsedSeconds = (now - this.stats.startTime) / 1000;
            const percentComplete = this.stats.totalFiles > 0
                ? Math.round((this.stats.filesDownloaded / this.stats.totalFiles) * 100)
                : 0;

            const bytesProgress = this.stats.totalBytes > 0
                ? Math.round((this.stats.bytesDownloaded / this.stats.totalBytes) * 100)
                : 0;

            const downloadRate = elapsedSeconds > 0
                ? this.stats.bytesDownloaded / elapsedSeconds
                : 0;

            Logger.info(
                `Download progress: ${this.stats.filesDownloaded}/${this.stats.totalFiles} files ` +
                `(${percentComplete}%) | ${this.formatBytes(this.stats.bytesDownloaded)}/${this.formatBytes(this.stats.totalBytes)} ` +
                `(${bytesProgress}%) | ${this.formatBytes(downloadRate)}/s`
            );

            this.stats.lastLogTime = now;
        }
    }

    /**
     * Calculate statistics for all objects with the given prefix
     * @param s3Prefix - S3 key prefix
     */
    private async calculateS3Stats(s3Prefix: string): Promise<void> {
        try {
            let continuationToken: string | undefined;
            let finished = false;

            while (!finished) {
                const listParams: AWS.S3.ListObjectsV2Request = {
                    Bucket: this.bucket,
                    Prefix: s3Prefix,
                    ContinuationToken: continuationToken
                };

                const response = await this.s3Client.listObjectsV2(listParams).promise();

                // Process objects
                if (response.Contents) {
                    for (const obj of response.Contents) {
                        if (obj.Size && obj.Size > 0) { // Skip directories (0-byte objects)
                            this.stats.totalFiles++;
                            this.stats.totalBytes += obj.Size;
                        }
                    }
                }

                // Check if there are more objects to list
                if (response.IsTruncated) {
                    continuationToken = response.NextContinuationToken;
                } else {
                    finished = true;
                }
            }
        } catch (error) {
            Logger.error(`Error calculating S3 stats for prefix ${s3Prefix}:`, error);
            throw error;
        }
    }

    /**
     * Download all files from S3 with the given prefix to the local directory
     * @param s3Prefix - S3 key prefix
     * @param localDir - Local directory to download files to
     */
    public async downloadFromS3(s3Prefix: string, localDir: string): Promise<void> {
        try {
            Logger.download.start(s3Prefix, localDir);

            // Reset stats and start timer
            this.stats = {
                totalFiles: 0,
                filesDownloaded: 0,
                totalBytes: 0,
                bytesDownloaded: 0,
                startTime: Date.now(),
                lastLogTime: Date.now()
            };

            // Make sure the output directory exists
            if (!await existsAsync(localDir)) {
                await mkdirAsync(localDir, { recursive: true });
            }

            // Calculate stats for reporting progress
            Logger.info('Calculating S3 statistics...');
            await this.calculateS3Stats(s3Prefix);
            Logger.info(`Found ${this.stats.totalFiles} files totaling ${this.formatBytes(this.stats.totalBytes)}`);

            // Download all objects with the specified prefix
            let continuationToken: string | undefined;
            let finished = false;
            const concurrencyLimit = 5; // Limit concurrent downloads
            const downloadPromises: Promise<void>[] = [];

            while (!finished) {
                const listParams: AWS.S3.ListObjectsV2Request = {
                    Bucket: this.bucket,
                    Prefix: s3Prefix,
                    ContinuationToken: continuationToken
                };

                const response = await this.s3Client.listObjectsV2(listParams).promise();

                // Process objects in batches for controlled concurrency
                if (response.Contents) {
                    const batchPromises: Promise<void>[] = [];

                    for (const obj of response.Contents) {
                        if (obj.Key && obj.Size && obj.Size > 0) { // Skip directories (0-byte objects)
                            // Determine the relative path from the prefix
                            const relativePath = obj.Key.slice(s3Prefix.length);
                            // Remove leading slash if present
                            const cleanRelativePath = relativePath.startsWith('/')
                                ? relativePath.slice(1)
                                : relativePath;

                            const localFilePath = path.join(localDir, cleanRelativePath);

                            // Add to the current batch
                            batchPromises.push(this.downloadFile(obj.Key, localFilePath));

                            // Process in batches of concurrencyLimit
                            if (batchPromises.length >= concurrencyLimit) {
                                downloadPromises.push(Promise.all(batchPromises).then(() => { }));
                                batchPromises.length = 0; // Clear the batch
                            }
                        }
                    }

                    // Handle any remaining items in the last batch
                    if (batchPromises.length > 0) {
                        downloadPromises.push(Promise.all(batchPromises).then(() => { }));
                    }
                }

                // Check if there are more objects to list
                if (response.IsTruncated) {
                    continuationToken = response.NextContinuationToken;
                } else {
                    finished = true;
                }
            }

            // Wait for all downloads to complete
            await Promise.all(downloadPromises);

            // Final stats
            const totalTimeSeconds = (Date.now() - this.stats.startTime) / 1000;

            // Log completion
            Logger.download.complete(
                this.stats.filesDownloaded,
                this.stats.bytesDownloaded,
                totalTimeSeconds
            );
        } catch (error) {
            Logger.error(`Error downloading from S3 prefix ${s3Prefix} to ${localDir}:`, error);
            throw error;
        }
    }
}

/**
 * Downloads the contents of an S3 folder to a local directory
 * @param id - The UUID of the folder in S3
 * @returns Promise that resolves when the download is complete
 */
export async function downloadS3Folder(id: string): Promise<void> {
    const outputDir = `output/${id}`;
    Logger.info(`Downloading S3 folder ${id} to ${outputDir}`);

    try {
        const downloader = new S3DirectoryDownloader(AWS_REGION, S3_BUCKET);
        await downloader.downloadFromS3(id, outputDir);
        Logger.info(`Successfully downloaded S3 folder ${id} to ${outputDir}`);
        return Promise.resolve();
    } catch (error) {
        Logger.error(`Failed to download S3 folder ${id}:`, error);
        return Promise.reject(error);
    }
}

/**
 * Upload statistics for tracking and logging purposes
 */
interface UploadStats {
    totalFiles: number;
    filesUploaded: number;
    totalBytes: number;
    bytesUploaded: number;
    startTime: number;
    lastLogTime: number;
}

/**
 * Utility class to handle recursive uploads to S3
 */
export class S3DirectoryUploader {
    private s3Client: AWS.S3;
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
        const clientConfig: AWS.S3.ClientConfiguration = { region };

        // Only add credentials if they are explicitly provided
        if (HAS_EXPLICIT_CREDENTIALS) {
            Logger.info('Using explicitly provided AWS credentials');
            clientConfig.credentials = new AWS.Credentials({
                accessKeyId: AWS_CREDENTIALS.accessKeyId!,
                secretAccessKey: AWS_CREDENTIALS.secretAccessKey!,
                sessionToken: AWS_CREDENTIALS.sessionToken
            });
        } else {
            Logger.warn('No explicit credentials found. Using AWS credential provider chain.');
        }

        this.s3Client = new AWS.S3(clientConfig);
        this.bucket = bucket;
    }

    /**
     * Format bytes to a human-readable string
     */
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
            const percentComplete = this.stats.totalFiles > 0
                ? Math.round((this.stats.filesUploaded / this.stats.totalFiles) * 100)
                : 0;

            const bytesProgress = this.stats.totalBytes > 0
                ? Math.round((this.stats.bytesUploaded / this.stats.totalBytes) * 100)
                : 0;

            const uploadRate = elapsedSeconds > 0
                ? this.stats.bytesUploaded / elapsedSeconds
                : 0;

            Logger.info(
                `Upload progress: ${this.stats.filesUploaded}/${this.stats.totalFiles} files ` +
                `(${percentComplete}%) | ${this.formatBytes(this.stats.bytesUploaded)}/${this.formatBytes(this.stats.totalBytes)} ` +
                `(${bytesProgress}%) | ${this.formatBytes(uploadRate)}/s`
            );

            this.stats.lastLogTime = now;
        }
    }

    /**
     * Uploads a file to S3
     * @param localFilePath - Path to local file
     * @param s3Key - The S3 key where the file will be uploaded
     */
    private async uploadFile(localFilePath: string, s3Key: string): Promise<void> {
        try {
            // Get file stats for size
            const fileStats = fs.statSync(localFilePath);
            const fileSize = fileStats.size;

            Logger.info(`Uploading file ${localFilePath} (${this.formatBytes(fileSize)}) to S3:${s3Key}`);
            const startTime = Date.now();

            // Create read stream for the file
            const fileContent = fs.createReadStream(localFilePath);
            
            const uploadParams = {
                Bucket: this.bucket,
                Key: s3Key,
                Body: fileContent,
                ContentType: this.getContentType(localFilePath)
            };

            await this.s3Client.upload(uploadParams).promise();

            // Update statistics
            this.stats.filesUploaded++;
            this.stats.bytesUploaded += fileSize;
            
            const duration = Date.now() - startTime;
            Logger.info(`Successfully uploaded ${localFilePath} to S3:${s3Key} (${this.formatBytes(fileSize)}) in ${duration}ms`);
            
            // Log progress periodically
            this.logProgress();
        } catch (error) {
            Logger.error(`Error uploading ${localFilePath} to S3:${s3Key}:`, error);
            throw error;
        }
    }

    /**
     * Gets the content type for a file based on its extension
     * @param filePath - Path to the file
     */
    private getContentType(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        switch (ext) {
            case '.html': return 'text/html';
            case '.css': return 'text/css';
            case '.js': return 'application/javascript';
            case '.json': return 'application/json';
            case '.png': return 'image/png';
            case '.jpg': case '.jpeg': return 'image/jpeg';
            case '.gif': return 'image/gif';
            case '.svg': return 'image/svg+xml';
            case '.ico': return 'image/x-icon';
            case '.txt': return 'text/plain';
            case '.pdf': return 'application/pdf';
            default: return 'application/octet-stream';
        }
    }

    /**
     * Calculate statistics for all files in the directory to be uploaded
     * @param localDir - Local directory to calculate stats for
     */
    private async calculateLocalStats(localDir: string): Promise<void> {
        try {
            const calculateForDir = (dir: string) => {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    
                    if (entry.isDirectory()) {
                        calculateForDir(fullPath); // Recurse into subdirectories
                    } else {
                        const stats = fs.statSync(fullPath);
                        this.stats.totalFiles++;
                        this.stats.totalBytes += stats.size;
                    }
                }
            };
            
            calculateForDir(localDir);
            
            Logger.info(`Found ${this.stats.totalFiles} files (${this.formatBytes(this.stats.totalBytes)}) to upload`);
        } catch (error) {
            Logger.error(`Error calculating stats for ${localDir}:`, error);
            throw error;
        }
    }

    /**
     * Upload a directory to S3
     * @param localDir - Local directory to upload
     * @param s3Prefix - The S3 key prefix to upload to
     */
    public async uploadDirectory(localDir: string, s3Prefix: string): Promise<void> {
        try {
            Logger.info(`Starting upload from ${localDir} to S3:${s3Prefix}`);

            // Reset stats and start timer
            this.stats = {
                totalFiles: 0,
                filesUploaded: 0,
                totalBytes: 0,
                bytesUploaded: 0,
                startTime: Date.now(),
                lastLogTime: Date.now()
            };
            
            // Calculate stats first
            await this.calculateLocalStats(localDir);
            
            // Upload files with concurrency limit
            const uploadQueue: Promise<void>[] = [];
            const concurrencyLimit = 5;
            
            const processDirectory = async (dir: string, relativePath: string) => {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                
                for (const entry of entries) {
                    const entryRelPath = path.join(relativePath, entry.name);
                    const fullPath = path.join(dir, entry.name);
                    
                    if (entry.isDirectory()) {
                        await processDirectory(fullPath, entryRelPath);
                    } else {
                        const s3Key = path.posix.join(s3Prefix, entryRelPath).replace(/\\/g, '/'); // Normalize for S3 paths
                        
                        // Manage concurrency
                        if (uploadQueue.length >= concurrencyLimit) {
                            await Promise.race(uploadQueue.map(p => p.catch(() => {})));
                            // Remove completed promises
                            const completedIndex = await Promise.race(
                                uploadQueue.map((p, i) => p.then(() => i).catch(() => -1))
                            );
                            if (completedIndex !== -1) {
                                uploadQueue.splice(completedIndex, 1);
                            }
                        }
                        
                        const uploadPromise = this.uploadFile(fullPath, s3Key).catch(err => {
                            Logger.error(`Failed to upload ${fullPath}:`, err);
                            throw err;
                        });
                        
                        uploadQueue.push(uploadPromise);
                    }
                }
            };
            
            await processDirectory(localDir, '');
            
            // Wait for all remaining uploads to complete
            if (uploadQueue.length > 0) {
                await Promise.all(uploadQueue);
            }
            
            const totalTimeSeconds = (Date.now() - this.stats.startTime) / 1000;
            
            Logger.info(
                `Upload completed: ${this.stats.filesUploaded} files (${this.formatBytes(this.stats.bytesUploaded)}) ` +
                `uploaded in ${totalTimeSeconds.toFixed(1)}s`
            );
        } catch (error) {
            Logger.error(`Error uploading directory ${localDir} to S3:${s3Prefix}:`, error);
            throw error;
        }
    }
}

/**
 * Uploads the dist folder from a built React project to S3
 * @param id - The project id
 * @param deploymentId - Optional deployment ID for S3 prefix
 * @returns Promise that resolves when upload is complete
 */
export async function uploadDistFolder(id: string, deploymentId?: string): Promise<void> {
    const projectDir = `output/${id}`;
    const distDir = path.join(projectDir, 'dist');
    const s3Prefix = deploymentId ? `deployments/${id}/${deploymentId}` : `deployments/${id}`;
    
    Logger.info(`Uploading dist folder from ${distDir} to S3 prefix: ${s3Prefix}`);
    
    try {
        // Check if dist directory exists
        if (!fs.existsSync(distDir)) {
            throw new Error(`Dist directory not found: ${distDir}`);
        }
        
        const uploader = new S3DirectoryUploader(AWS_REGION, S3_BUCKET);
        await uploader.uploadDirectory(distDir, s3Prefix);
        Logger.info(`Successfully uploaded dist folder from ${distDir} to S3 prefix: ${s3Prefix}`);
        return Promise.resolve();
    } catch (error) {
        Logger.error(`Failed to upload dist folder for project ${id}:`, error);
        return Promise.reject(error);
    }
}