"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const upload_1 = require("../controllers/upload");
const uploadRouter = (0, express_1.default)();
uploadRouter.post("/", upload_1.uploadController);
exports.default = uploadRouter;
