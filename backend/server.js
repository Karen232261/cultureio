import express from "express";
import cors from "cors";
import multer from "multer";
import { uploadToS3 } from "./s3.js";
import crypto from "crypto";

const app = express();

// CHANGE 1: Use Railway's dynamic port or default to 3000
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Multer setup (store file in memory)
const upload = multer({ storage: multer.memoryStorage() });

app.post("/upload", upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { timestamp, location, contact } = req.body;

    const ext = req.file.originalname.split(".").pop();
    const filename = `${crypto.randomUUID()}.${ext}`;

    // CHANGE 2: Ensure your S3 helper is called with the correct data
    const result = await uploadToS3(
      req.file.buffer,
      filename,
      req.file.mimetype
    );

    console.log("Uploaded to S3:", filename);

    res.json({
      success: true,
      file: result,
      metadata: { timestamp, location, contact }
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});

app.get("/api/prompt", (req, res) => {
  res.json({
    prompt: "Take a photo of something that represents connection.",
  });
});

// CHANGE 3: Bind to 0.0.0.0 to ensure Railway can route traffic to it
app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});