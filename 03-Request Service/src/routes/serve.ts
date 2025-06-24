import express from "express";
import { serveFileController } from "../controllers/serve";

const router = express.Router();

// Wildcard route to serve files from S3
router.get("/*", serveFileController);

export default router;
