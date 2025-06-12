import Router from "express";
import { uploadController } from "../controllers/upload";

const uploadRouter = Router();

uploadRouter.post("/",uploadController)

export default uploadRouter;
