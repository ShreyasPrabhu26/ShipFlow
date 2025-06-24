import dotenv from 'dotenv';
import express from "express";
import uploadRouter from "./routes/upload";
import Logger from './utils/logger';
import { createClient } from "redis";

dotenv.config();
const PORT = process.env.PORT || 3000;
const app = express();

// Initialize Redis subscriber client
const subscriber = createClient();
subscriber.connect().then(() => {
  Logger.info('Redis subscriber connected');
}).catch(err => {
  Logger.error('Redis subscriber connection error:', err);
});

app.use(express.json());
app.use("/upload", uploadRouter);

// Status endpoint
app.get("/status", async (req, res) => {
  const id = req.query.id;
  const response = await subscriber.hGet("status", id as string);
  res.json({
    status: response
  });
});

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);

  // Log AWS credential status
  const hasAwsKeys = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
  Logger.info(`AWS credentials available: ${hasAwsKeys}`);
});

