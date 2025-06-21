"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const upload_1 = __importDefault(require("./routes/upload"));
const logger_1 = __importDefault(require("./utils/logger"));
dotenv_1.default.config();
const PORT = process.env.PORT || 3000;
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use("/upload", upload_1.default);
app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
    // Log AWS credential status
    const hasAwsKeys = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
    logger_1.default.info(`AWS credentials available: ${hasAwsKeys}`);
});
