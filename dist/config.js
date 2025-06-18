"use strict";
/**
 * Application configuration
 * Centralizes all environment variables and default values
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HAS_EXPLICIT_CREDENTIALS = exports.AWS_CREDENTIALS = exports.S3_BUCKET = exports.AWS_REGION = void 0;
// AWS Configuration
exports.AWS_REGION = process.env.AWS_REGION || 'ap-south-1';
exports.S3_BUCKET = process.env.S3_BUCKET || 'ship-flow2';
// AWS Credentials - these should come from environment variables for security
// WARNING: Never hardcode actual credentials here
exports.AWS_CREDENTIALS = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN // Optional, for temporary credentials
};
// Determine if we have explicit credentials configured
exports.HAS_EXPLICIT_CREDENTIALS = !!(exports.AWS_CREDENTIALS.accessKeyId && exports.AWS_CREDENTIALS.secretAccessKey);
