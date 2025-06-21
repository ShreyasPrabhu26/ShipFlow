import { Request, Response } from "express";
import { UploadRequestBody, UploadResponse } from "../types";
import simpleGit from "simple-git";
import { v4 as uuidv4 } from 'uuid';
import path from "path";
import { S3DirectoryUploader } from "../utils/s3Uploader";
import { AWS_REGION, S3_BUCKET } from "../config";
import Logger from "../utils/logger";
import { createClient } from "redis";

const publisher = createClient();
publisher.connect()

export async function uploadController(req: Request & { body: UploadRequestBody }, res: Response) {
  const startTime = Date.now();
  Logger.info(`Upload request received for repo: ${req.body.repoUrl}`);

  // Generate ID upfront so it's accessible throughout the function
  const id = uuidv4();

  try {
    // 1. Clone the repository
    const repoUrl = req.body.repoUrl;
    const outputDir = `output/${id}`;

    Logger.info(`Generated UUID: ${id}`);
    Logger.info(`Output directory: ${outputDir}`);

    const cloneStartTime = Date.now();
    Logger.info(`Cloning repository ${repoUrl} to ${outputDir}...`);

    try {
      await simpleGit().clone(repoUrl, outputDir);
      const cloneDuration = Date.now() - cloneStartTime;
      Logger.info(`Repository cloned successfully in ${cloneDuration}ms`);
    } catch (cloneError) {
      Logger.error(`Failed to clone repository:`, cloneError);
      throw cloneError;
    }

    // 2. Upload the directory to S3
    Logger.info(`Preparing to upload contents of ${outputDir} to S3 bucket ${S3_BUCKET}...`);

    // Debug S3 connection and credentials
    Logger.info(`Using AWS Region: ${AWS_REGION}`);
    Logger.info(`Using S3 Bucket: ${S3_BUCKET}`);
    Logger.info(`AWS credentials available: ${!!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY}`);

    const uploadStartTime = Date.now();
    const s3Uploader = new S3DirectoryUploader(AWS_REGION, S3_BUCKET);

    try {
      // Upload the cloned repo to S3 under a folder with the UUID
      const absolutePath = path.resolve(outputDir);
      Logger.info(`Starting upload from absolute path: ${absolutePath}`);

      await s3Uploader.uploadDirectory(absolutePath, id);

      const uploadDuration = Date.now() - uploadStartTime;
      Logger.info(`S3 upload completed in ${uploadDuration}ms`);
    } catch (uploadError) {
      Logger.error(`Failed to upload to S3:`, uploadError);
      throw uploadError;
    }

    // 3. Return success response
    const totalDuration = Date.now() - startTime;
    Logger.info(`Upload process completed successfully in ${totalDuration}ms`);

    publisher.lPush("build-queue", id);

    const response: UploadResponse = {
      id,
      processingTimeMs: totalDuration
    };

    res.json(response);

  } catch (error: unknown) {
    const totalDuration = Date.now() - startTime;
    Logger.error(`Error in upload process after ${totalDuration}ms:`, error);

    // Check for specific error types to provide better diagnostics
    if (error instanceof Error) {
      // Check for AWS-specific errors
      if (error.message.includes('CredentialsProviderError')) {
        Logger.error('[CRITICAL] AWS credentials error - Please check your AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables');
      } else if (error.message.includes('AccessDenied')) {
        Logger.error(`[CRITICAL] AWS S3 access denied - Please check permissions for bucket ${S3_BUCKET}`);
      } else if (error.message.includes('NetworkingError')) {
        Logger.error('[CRITICAL] AWS networking error - Please check your internet connection and AWS region settings');
      }
    }

    res.status(500).json({
      error: 'Failed to process the upload',
      message: error instanceof Error ? error.message : String(error),
      processingTimeMs: totalDuration
    });
  }
}