import express from "express";
import cors from "cors";
import crypto from "crypto";
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "node:url";

// Import BOTH functions from s3.js
import { generatePresignedUrl, generateGetPresignedUrl } from "./s3.js";
import { CultureModel } from "./culture_schema.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("Connected to MongoDB Atlas"))
  .catch(err => console.error("MongoDB connection error:", err));

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "/frontend")));

const port = process.env.PORT || 3000;

// STEP 1: Request Upload URL
app.post("/api/get-upload-url", async (req, res) => {
  try {
    const { contentType, extension } = req.body;
    if (!contentType || !extension) {
      return res.status(400).json({ error: "contentType and extension are required" });
    }

    const timestamp = Date.now();
    const filename = `${timestamp}-${crypto.randomUUID()}.${extension}`;
    const signedUrl = await generatePresignedUrl(filename, contentType);

    // Note: We still store the basic path in Mongo, but we'll sign it on the way out
    const publicUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${filename}`;

    res.json({
      uploadUrl: signedUrl,
      publicUrl: publicUrl
    });
  } catch (err) {
    console.error("Error generating signed URL:", err);
    res.status(500).json({ error: "Could not create upload URL" });
  }
});

// STEP 2: Save to MongoDB
app.post("/api/save-entry", async (req, res) => {
  try {
    const { s3Url, caption, contact, location, timestamp } = req.body;

    let parsedLocation = location;
    if (typeof location === "string") {
      try { parsedLocation = JSON.parse(location); } catch (e) { console.error(e); }
    }

    const newEntry = new CultureModel({
      s3Url,
      caption,
      contact,
      location: parsedLocation,
      timestamp: timestamp || new Date().toISOString()
    });

    await newEntry.save();
    res.json({ success: true, dbEntry: newEntry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// STEP 3: Find All (Now with dynamic viewing URLs)
app.get("/api/findall", async (req, res) => {
  try {
    const data = await CultureModel.find().sort({ createdAt: -1 });

    // Generate a temporary viewing URL for every image in the gallery
    const resultsWithSignedUrls = await Promise.all(
      data.map(async (doc) => {
        // Extract the filename (everything after the last slash)
        const filename = doc.s3Url.split("/").pop();
        
        try {
          const temporaryUrl = await generateGetPresignedUrl(filename);
          // Return the doc data but swap the s3Url for the signed one
          return {
            ...doc._doc,
            s3Url: temporaryUrl
          };
        } catch (err) {
          console.error(`Failed to sign ${filename}`, err);
          return doc; // Fallback to original if it fails
        }
      })
    );

    res.send(resultsWithSignedUrls);
  } catch (err) {
    res.status(500).send(err);
  }
});

app.get("/api/prompt", (req, res) => {
  res.json({ prompt: "Take a photo of something that represents connection." });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});