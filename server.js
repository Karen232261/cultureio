import express from "express";
import cors from "cors";
import multer from "multer";
import { uploadToS3 } from "./s3.js";
import crypto from "crypto";

import mongoose from "mongoose";
import { CultureModel } from "./culture_schema.js";
import dotenv from "dotenv";

dotenv.config();


// Connect to MongoDB Atlas
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("Connected to MongoDB Atlas"))
  .catch(err => console.error("MongoDB connection error:", err));

import path from "path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express(); 

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, "/frontend")));

const port = process.env.PORT || 3000;

// Multer setup (store file in memory)
const upload = multer({ storage: multer.memoryStorage() });


app.post("/upload", upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    // Get text fields from the frontend
    const { timestamp, contact, caption } = req.body;

    // parse the location string back into a usable Object
    let parsedLocation = null;
    if (req.body.location) {
      try {
        parsedLocation = JSON.parse(req.body.location);
      } catch (e) {
        console.error("Location parsing failed:", e);
      }
    }

    // Upload the image to S3
    const ext = req.file.originalname.split(".").pop();
    const filename = `${crypto.randomUUID()}.${ext}`;
    
    const s3Result = await uploadToS3(req.file.buffer, filename, req.file.mimetype);

    // Save everything to MongoDB 
    const newEntry = new CultureModel({
      s3Url: s3Result.Location || s3Result, 
      caption: caption,
      contact: contact,
      location: parsedLocation, 
      timestamp: timestamp
    });

    await newEntry.save();

    console.log("Database entry saved for:", filename);

    res.json({
      success: true,
      dbEntry: newEntry
    });

  } catch (err) {
    console.error("Upload error:", err);
    // If the caption fails validation, it will send the error message here
    res.status(500).json({ error: err.message || "Upload failed" });
  }
});

app.get("/api/findall", async (req, res) => {
    try {
        const data = await CultureModel.find();
        res.send(data);
    } catch (err) {
        res.status(500).send(err);
    }
});

app.get("/api/prompt", (req, res) => {
  res.json({
    prompt: "Take a photo of something that represents connection.",
  });
});

// Bind to 0.0.0.0 to ensure Railway can route traffic to it
app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});

