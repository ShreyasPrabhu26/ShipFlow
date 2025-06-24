/**
 * Application configuration
 * Centralizes all environment variables and default values
 */

// AWS Configuration
export const AWS_REGION = process.env.AWS_REGION || 'ap-south-1';
export const S3_BUCKET = process.env.S3_BUCKET || 'ship-flow2';

// AWS Credentials - these should come from environment variables for security
export const AWS_CREDENTIALS = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN // Optional, for temporary credentials
};

// Determine if we have explicit credentials configured
export const HAS_EXPLICIT_CREDENTIALS = !!(AWS_CREDENTIALS.accessKeyId && AWS_CREDENTIALS.secretAccessKey);
