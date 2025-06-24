import express from "express";
import dotenv from "dotenv";
import serveRouter from "./routes/serve";
import { AWS_REGION, S3_BUCKET, HAS_EXPLICIT_CREDENTIALS } from "./config";

// Load environment variables
dotenv.config();
const PORT = process.env.PORT || 3000;
const app = express();

// Middleware
app.use(express.json());

// Routes - All requests go through the serve router
app.use("/", serveRouter);

// Start the server
app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
    console.log(`AWS Region: ${AWS_REGION}, S3 Bucket: ${S3_BUCKET}`);
    console.log(`AWS credentials available: ${HAS_EXPLICIT_CREDENTIALS}`);
});
