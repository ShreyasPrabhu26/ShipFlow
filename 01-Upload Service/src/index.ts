import dotenv from 'dotenv';
import express from "express";
import uploadRouter from "./routes/upload";
import Logger from './utils/logger';

dotenv.config();
const PORT = process.env.PORT || 3000;
const app = express();

app.use(express.json());
app.use("/upload", uploadRouter);

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);

  // Log AWS credential status
  const hasAwsKeys = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
  Logger.info(`AWS credentials available: ${hasAwsKeys}`);
});

