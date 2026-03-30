import express from "express";
import cors from "cors";
import crypto from "crypto";
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "node:url";
import basicAuth from "express-basic-auth";

// Import S3 logic
import { generatePresignedUrl, generateGetPresignedUrl } from "./s3.js";
import { CultureModel } from "./culture_schema.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// connecting to mongoose
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("Connected to MongoDB Atlas"))
  .catch(err => console.error("MongoDB connection error:", err));

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "/frontend")));

// Admin Login Protection (Change these credentials in Railway Variables later!)
const adminProtector = basicAuth({
    users: { [process.env.ADMIN_USER]: process.env.ADMIN_PASS }, 
    challenge: true,
    realm: 'CultureIO Admin'
});

const port = process.env.PORT || 3000;

// UPLOADINF ROUTES

// STEP 1: Request an upload "Ticket"
app.post("/api/get-upload-url", async (req, res) => {
  try {
    const { contentType, extension } = req.body;
    if (!contentType || !extension) return res.status(400).json({ error: "Missing data" });

    const filename = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const signedUrl = await generatePresignedUrl(filename, contentType);
    const publicUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${filename}`;

    res.json({ uploadUrl: signedUrl, publicUrl: publicUrl });
  } catch (err) {
    res.status(500).json({ error: "S3 Signer Error" });
  }
});

// STEP 2: Save the "Proof" to MongoDB (Hidden until approved)
app.post("/api/save-entry", async (req, res) => {
  try {
    const { s3Url, caption, contact, location, timestamp } = req.body;
    const newEntry = new CultureModel({
      s3Url,
      caption,
      contact,
      location,
      timestamp: timestamp || new Date().toISOString(),
      approved: false // Starts hidden!
    });
    await newEntry.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// public gallery
app.get("/api/findall", async (req, res) => {
  try {
    const data = await CultureModel.find({ approved: true }).sort({ createdAt: -1 });
    
    // Sign every image for viewing
    const results = await Promise.all(data.map(async (doc) => {
        const filename = doc.s3Url.split("/").pop();
        const temporaryUrl = await generateGetPresignedUrl(filename);
        return { ...doc._doc, s3Url: temporaryUrl };
    }));
    res.send(results);
  } catch (err) {
    res.status(500).send(err);
  }
});

//// ADMIN STUFF ////

// Protect the admin page file
app.get("/admin.html", adminProtector, (req, res) => {
    res.sendFile(path.join(__dirname, "/frontend/admin.html"));
});

// Get all unapproved photos for review
app.get("/api/admin/pending", adminProtector, async (req, res) => {
  try {
    const data = await CultureModel.find({ approved: false }).sort({ createdAt: -1 });
    const results = await Promise.all(data.map(async (doc) => {
        const filename = doc.s3Url.split("/").pop();
        const temporaryUrl = await generateGetPresignedUrl(filename);
        return { ...doc._doc, s3Url: temporaryUrl };
    }));
    res.send(results);
  } catch (err) {
    res.status(500).send(err);
  }
});

// Approve action
app.put("/api/admin/approve/:id", adminProtector, async (req, res) => {
  await CultureModel.findByIdAndUpdate(req.params.id, { approved: true });
  res.json({ success: true });
});

// Delete action
app.delete("/api/admin/delete/:id", adminProtector, async (req, res) => {
  await CultureModel.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});


// miscellaneous
app.get("/api/prompt", (req, res) => {
  res.json({ prompt: "Take a photo of something that represents connection." });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});