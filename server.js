import express from "express";
import cors from "cors";
import crypto from "crypto";
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "node:url";
import basicAuth from "express-basic-auth";

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

const adminProtector = basicAuth({
    users: { [process.env.ADMIN_USER || 'admin']: process.env.ADMIN_PASS || 'password123' }, 
    challenge: true,
    realm: 'CultureIO Admin'
});

const port = process.env.PORT || 3000;
const CLASSIFIER_URL = process.env.CLASSIFIER_URL || "http://localhost:8001/classify";
const SIGNATURE_SERVICE_URL = process.env.SIGNATURE_SERVICE_URL || "http://localhost:8002";

// Same filename-resolution fallback used in /api/admin/pending, so this
// stays consistent whether an entry has an s3Url or only an imageId.
function resolveFilename(doc) {
  if (doc.s3Url) return doc.s3Url.split("/").pop();
  if (doc.imageId) return `${doc.imageId}.jpeg`;
  return null;
}

// Calls the Python classifier microservice and saves the result on the doc.
// Failures are logged, not thrown -- classification is best-effort and
// should never break an upload or a backfill run. Added so the graphing
// pages have scene data to cluster images by.
async function classifyAndSave(doc) {
  const filename = resolveFilename(doc);
  if (!filename) {
    console.error(`Classification skipped for ${doc._id}: no s3Url/imageId on this entry`);
    return;
  }
  try {
    const imageUrl = await generateGetPresignedUrl(filename);

    const res = await fetch(CLASSIFIER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Classifier-Secret": process.env.CLASSIFIER_SECRET || "",
      },
      body: JSON.stringify({ imageUrl }),
    });
    if (!res.ok) throw new Error(`Classifier returned ${res.status}`);

    const classification = await res.json();
    await CultureModel.findByIdAndUpdate(doc._id, { classification });
  } catch (err) {
    console.error(`Classification failed for ${doc._id}:`, err.message, err.cause || "");
  }
}

// Calls the Python signature microservice (ORB descriptors) and saves the
// result on the doc. Same fire-and-forget, best-effort pattern as
// classifyAndSave -- a failed signature shouldn't block an upload.
async function signatureAndSave(doc) {
  const filename = resolveFilename(doc);
  if (!filename) {
    console.error(`Signature skipped for ${doc._id}: no s3Url/imageId on this entry`);
    return;
  }
  try {
    const imageUrl = await generateGetPresignedUrl(filename);

    const res = await fetch(`${SIGNATURE_SERVICE_URL}/signature`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Signature-Secret": process.env.SIGNATURE_SECRET || "",
      },
      body: JSON.stringify({ imageUrl }),
    });
    if (!res.ok) throw new Error(`Signature service returned ${res.status}`);

    const signature = await res.json();
    await CultureModel.findByIdAndUpdate(doc._id, { signature });
    invalidateCandidateCache(); // new signature means the cached candidate list is stale
  } catch (err) {
    console.error(`Signature failed for ${doc._id}:`, err.message, err.cause || "");
  }
}

// In-memory cache of {id, orbDescriptors} for every approved, signed doc --
// rebuilt lazily so /api/webcam-match doesn't re-query Mongo and
// re-serialize hundreds of descriptor blobs on every single frame.
// Same idea as the viewUrlCache pattern in s3.js.
let candidateCache = null;
let candidateCacheAt = 0;
const CANDIDATE_CACHE_TTL_MS = 60_000; // rebuild at most once a minute

function invalidateCandidateCache() {
  candidateCache = null;
}

async function getCandidates() {
  const stale = !candidateCache || (Date.now() - candidateCacheAt) > CANDIDATE_CACHE_TTL_MS;
  if (stale) {
    const docs = await CultureModel.find({
      approved: true,
      "signature.orbDescriptors": { $ne: null },
    }).select("_id signature.orbDescriptors").lean();

    candidateCache = docs.map(doc => ({
      id: doc._id.toString(),
      orbDescriptors: doc.signature.orbDescriptors,
    }));
    candidateCacheAt = Date.now();
  }
  return candidateCache;
}

// STEP 1: Request an upload "Ticket"
app.post("/api/get-upload-url", async (req, res) => {
  try {
    // Receive the custom fileName from the frontend
    const { contentType, fileName } = req.body;
    if (!fileName) {
      return res.status(400).json({ error: "fileName is required" });
    }
    const uploadUrl = await generatePresignedUrl(fileName, contentType);
    // Construct the public URL using the bucket name and the new filename
    const publicUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;

    res.json({ uploadUrl, publicUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// STEP 2: Save and return the specific image data
app.post("/api/save-entry", async (req, res) => {
  try {
    // 1. You MUST extract these from req.body
    const { 
      referralID,  
      s3Url, 
      timestamp, 
      location, 
      contact, 
      caption,
      imageId
    } = req.body;

    // 2. Pass them into the model
    const newEntry = new CultureModel({
      referralID, // Ensure this matches your schema (referralID vs nfcTagId)
      s3Url,
      timestamp,
      location,
      contact,
      caption,
      imageId
    });

    await newEntry.save();
    classifyAndSave(newEntry); // fire-and-forget: don't make the user wait on this
    signatureAndSave(newEntry); // fire-and-forget: same reasoning
    res.json({ success: true });
  } catch (err) {
    console.error("Database Save Error:", err); // This prints the REAL error to your terminal
    res.status(500).json({ error: err.message });
  }
});

// admin moderation
app.get("/admin.html", adminProtector, (req, res) => {
    res.sendFile(path.join(__dirname, "/frontend/admin.html"));
});

// app.get("/api/admin/pending", adminProtector, async (req, res) => {
//   try {
//     const data = await CultureModel.find({ approved: false }).sort({ createdAt: -1 });
    
//     const results = await Promise.all(data.map(async (doc) => {
//         let filename = null;
//         if (doc.s3Url) {
//             filename = doc.s3Url.split("/").pop();
//         } 
                
//         if (!filename && doc.imageId) {
//             filename = `${doc.imageId}.jpeg`; 
//         }

//         if (filename) {
//             try {
//                 const temporaryUrl = await generateGetPresignedUrl(filename);
//                 return { ...doc._doc, s3Url: temporaryUrl };
//             } catch (err) {
//                 console.error(`S3 Sign failed for ${filename}:`, err.message);
//                 return { ...doc._doc, s3Url: 'https://via.placeholder.com/150?text=S3+Link+Error' };
//             }
//         }

//         // 3. Final safety net
//         return { ...doc._doc, s3Url: 'https://via.placeholder.com/150?text=No+Image+Reference' };
//     }));

//     res.json(results);
//   } catch (err) {
//     console.error("Admin route crash:", err);
//     res.status(500).json({ error: err.message });
//   }
// });

app.get("/api/admin/pending", adminProtector, async (req, res) => {
  try {
    const data = await CultureModel.find({ approved: false }).sort({ createdAt: -1 });
    res.json(data);
  } catch (err) {
    console.error("Admin route crash:", err);
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/admin/approve/:id", adminProtector, async (req, res) => {
  await CultureModel.findByIdAndUpdate(req.params.id, { approved: true });
  invalidateCandidateCache();
  res.json({ success: true });
});

app.delete("/api/admin/delete/:id", adminProtector, async (req, res) => {
  await CultureModel.findByIdAndDelete(req.params.id);
  invalidateCandidateCache();
  res.json({ success: true });
});

app.post("/api/admin/classify-backfill", adminProtector, async (req, res) => {
  const force = req.query.force === "true";
  const query = force
    ? {}
    : { $or: [{ classification: null }, { classification: { $exists: false } }] };

  const targets = await CultureModel.find(query);
  for (const doc of targets) {
    await classifyAndSave(doc); // sequential: gentle on the classifier service
  }
  res.json({ success: true, processed: targets.length, force });
});

app.post("/api/admin/signature-backfill", adminProtector, async (req, res) => {
  const force = req.query.force === "true";
  const query = force
    ? {}
    : { $or: [{ signature: null }, { signature: { $exists: false } }] };

  const targets = await CultureModel.find(query);
  for (const doc of targets) {
    await signatureAndSave(doc); // sequential: gentle on the signature service
  }
  res.json({ success: true, processed: targets.length, force });
});

// Public: data for the graphing pages (graph3d.html, graphcytoscape.html, graphscratch.html)
app.get("/api/graph-data", async (req, res) => {
  try {
    // const docs = await CultureModel.find({ approved: true }).lean();
    const docs = await CultureModel.find({}).lean();
 
    const imageNodes = await Promise.all(docs.map(async (doc) => {
      const filename = resolveFilename(doc);
      let viewUrl = null;
      if (filename) {
        try {
          viewUrl = await generateGetPresignedUrl(filename);
        } catch (err) {
          console.error(`S3 Sign failed for ${filename}:`, err.message);
        }
      }
 
      const scenePath = doc.classification?.scene?.path || [];
      const sceneBroad = doc.classification?.primaryCategory
        || scenePath[0]?.label
        || "unclassified";
      const sceneSpecific = scenePath.length
        ? scenePath[scenePath.length - 1].label
        : "unclassified";
      const sceneConfidence = scenePath.length
        ? scenePath[scenePath.length - 1].confidence
        : 0;
 
      return {
        id: doc._id.toString(),
        imageId: doc.imageId,
        img: viewUrl || 'https://via.placeholder.com/150?text=No+Image+Reference',
        caption: doc.caption || "",
        timestamp: doc.timestamp,
        isHub: false,
        sceneBroad,
        sceneSpecific,
        sceneConfidence,
      };
    }));

    const broadCategories = [...new Set(imageNodes.map(n => n.sceneBroad))];
    const hubNodes = broadCategories.map(broad => {
      const members = imageNodes.filter(n => n.sceneBroad === broad);
      const representative = members.reduce((best, n) =>
        (n.sceneConfidence > (best?.sceneConfidence ?? -1) ? n : best), null);

      return {
        id: `hub:${broad}`,
        isHub: true,
        label: broad,
        img: representative?.img || null,
        representativeId: representative?.id || null,
      };
    });
 
    const edges = imageNodes.map(n => ({
      source: n.id,
      target: `hub:${n.sceneBroad}`,
      confidence: n.sceneConfidence, // lets the frontend scale spring strength per edge
    }));
 
    res.json({ nodes: [...hubNodes, ...imageNodes], edges });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});






app.post("/api/webcam-match", async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "imageBase64 is required" });
    }

    const candidates = await getCandidates();
    if (!candidates.length) {
      return res.json({ matchId: null, score: 0, reason: "no signed submissions to match against" });
    }

    const matchRes = await fetch(`${SIGNATURE_SERVICE_URL}/match`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Signature-Secret": process.env.SIGNATURE_SECRET || "",
      },
      body: JSON.stringify({ imageBase64, candidates }),
    });
    if (!matchRes.ok) throw new Error(`Match service returned ${matchRes.status}`);

    const result = await matchRes.json();
    res.json(result);
  } catch (err) {
    console.error("Webcam match failed:", err.message, err.cause || "");
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});

// the url on the tag will be the regular url plus /tagIdname
app.get("/:tagId", (req, res, next) => {
    // If the request is for a file (like style.css or script.js), skip this
    if (path.extname(req.params.tagId)) {
        return next();
    }
    res.sendFile(path.join(__dirname, "/frontend/index.html"));
});