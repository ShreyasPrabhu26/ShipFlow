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