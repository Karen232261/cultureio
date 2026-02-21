import express from "express";
import cors from "cors";
import multer from "multer";
import { uploadToS3 } from "./s3.js";
import crypto from "crypto";

const app = express();
const port = 3000;

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

    const result = await uploadToS3(
      req.file.buffer,
      filename,
      req.file.mimetype,
      {
        timestamp,
        location: typeof location === "string" ? location : JSON.stringify(location),
        contact,
      }
    );


    console.log("Uploaded:", {
      filename,
      timestamp,
      location,
      contact,
    });

    res.json({
      success: true,
      file: result,
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

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
