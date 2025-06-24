import { Request, Response } from "express";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream";
import { AWS_REGION, S3_BUCKET, AWS_CREDENTIALS, HAS_EXPLICIT_CREDENTIALS } from "../config";
import Logger from "../utils/logger";

// Initialize S3 client
const clientConfig: any = { region: AWS_REGION };

// Add credentials if available
if (HAS_EXPLICIT_CREDENTIALS) {
  clientConfig.credentials = {
    accessKeyId: AWS_CREDENTIALS.accessKeyId!,
    secretAccessKey: AWS_CREDENTIALS.secretAccessKey!
  };

  // Add session token if available
  if (AWS_CREDENTIALS.sessionToken) {
    clientConfig.credentials.sessionToken = AWS_CREDENTIALS.sessionToken;
  }
}

const s3 = new S3Client(clientConfig);

/**
 * Serve files from S3 based on hostname and path
 */
export async function serveFileController(req: Request, res: Response) {
  const startTime = Date.now();
  const host = req.hostname;
  const id = host.split(".")[0];
  const filePath = req.path;
  
  try {
    // Log the request
    Logger.request.start(host, filePath);
    
    // Get the file from S3
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: `dist/${id}${filePath}`
    });
    
    const response = await s3.send(command);
    
    // Determine content type based on file extension
    let contentType = "application/octet-stream"; // Default content type
    if (filePath.endsWith(".html")) {
      contentType = "text/html";
    } else if (filePath.endsWith(".css")) {
      contentType = "text/css";
    } else if (filePath.endsWith(".js")) {
      contentType = "application/javascript";
    } else if (filePath.endsWith(".json")) {
      contentType = "application/json";
    } else if (filePath.endsWith(".png")) {
      contentType = "image/png";
    } else if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) {
      contentType = "image/jpeg";
    } else if (filePath.endsWith(".svg")) {
      contentType = "image/svg+xml";
    }
    
    // Set content type and send the file
    res.set("Content-Type", contentType);
    
    // Convert the Body to a stream and pipe it to the response
    if (response.Body instanceof Readable) {
      response.Body.pipe(res);
    } else {
      // If Body is not a stream, convert it
      res.send(response.Body);
    }
    
    // Log success
    const duration = Date.now() - startTime;
    Logger.request.success(host, filePath, duration);
  } catch (error: any) {
    // Log error
    Logger.request.error(host, filePath, error);
    res.status(404).send(`File not found: ${error.message}`);
  }
}
