"use strict";
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
exports.uploadController = uploadController;
const simple_git_1 = __importDefault(require("simple-git"));
const uuid_1 = require("uuid");
const path_1 = __importDefault(require("path"));
const s3Uploader_1 = require("../utils/s3Uploader");
const config_1 = require("../config");
const logger_1 = __importDefault(require("../utils/logger"));
const redis_1 = require("redis");
const publisher = (0, redis_1.createClient)();
publisher.connect();
function uploadController(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const startTime = Date.now();
        logger_1.default.info(`Upload request received for repo: ${req.body.repoUrl}`);
        // Generate ID upfront so it's accessible throughout the function
        const id = (0, uuid_1.v4)();
        try {
            // 1. Clone the repository
            const repoUrl = req.body.repoUrl;
            const outputDir = `output/${id}`;
            logger_1.default.info(`Generated UUID: ${id}`);
            logger_1.default.info(`Output directory: ${outputDir}`);
            const cloneStartTime = Date.now();
            logger_1.default.info(`Cloning repository ${repoUrl} to ${outputDir}...`);
            try {
                yield (0, simple_git_1.default)().clone(repoUrl, outputDir);
                const cloneDuration = Date.now() - cloneStartTime;
                logger_1.default.info(`Repository cloned successfully in ${cloneDuration}ms`);
            }
            catch (cloneError) {
                logger_1.default.error(`Failed to clone repository:`, cloneError);
                throw cloneError;
            }
            // 2. Upload the directory to S3
            logger_1.default.info(`Preparing to upload contents of ${outputDir} to S3 bucket ${config_1.S3_BUCKET}...`);
            // Debug S3 connection and credentials
            logger_1.default.info(`Using AWS Region: ${config_1.AWS_REGION}`);
            logger_1.default.info(`Using S3 Bucket: ${config_1.S3_BUCKET}`);
            logger_1.default.info(`AWS credentials available: ${!!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY}`);
            const uploadStartTime = Date.now();
            const s3Uploader = new s3Uploader_1.S3DirectoryUploader(config_1.AWS_REGION, config_1.S3_BUCKET);
            try {
                // Upload the cloned repo to S3 under a folder with the UUID
                const absolutePath = path_1.default.resolve(outputDir);
                logger_1.default.info(`Starting upload from absolute path: ${absolutePath}`);
                yield s3Uploader.uploadDirectory(absolutePath, id);
                const uploadDuration = Date.now() - uploadStartTime;
                logger_1.default.info(`S3 upload completed in ${uploadDuration}ms`);
            }
            catch (uploadError) {
                logger_1.default.error(`Failed to upload to S3:`, uploadError);
                throw uploadError;
            }
            // 3. Return success response
            const totalDuration = Date.now() - startTime;
            logger_1.default.info(`Upload process completed successfully in ${totalDuration}ms`);
            publisher.lPush("build-queue", id);
            const response = {
                id,
                processingTimeMs: totalDuration
            };
            res.json(response);
        }
        catch (error) {
            const totalDuration = Date.now() - startTime;
            logger_1.default.error(`Error in upload process after ${totalDuration}ms:`, error);
            // Check for specific error types to provide better diagnostics
            if (error instanceof Error) {
                // Check for AWS-specific errors
                if (error.message.includes('CredentialsProviderError')) {
                    logger_1.default.error('[CRITICAL] AWS credentials error - Please check your AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables');
                }
                else if (error.message.includes('AccessDenied')) {
                    logger_1.default.error(`[CRITICAL] AWS S3 access denied - Please check permissions for bucket ${config_1.S3_BUCKET}`);
                }
                else if (error.message.includes('NetworkingError')) {
                    logger_1.default.error('[CRITICAL] AWS networking error - Please check your internet connection and AWS region settings');
                }
            }
            res.status(500).json({
                error: 'Failed to process the upload',
                message: error instanceof Error ? error.message : String(error),
                processingTimeMs: totalDuration
            });
        }
    });
}
