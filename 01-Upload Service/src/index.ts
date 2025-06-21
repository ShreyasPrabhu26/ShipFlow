import express from "express";
import uploadRouter from "./routes/upload";

const PORT = process.env.PORT || 3002;

const app = express();

app.use(express.json());
app.use("/upload", uploadRouter);

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});

