import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
dotenv.config();


// Make sure your AWS CLI is logged in and working first!
// This will: aws sts get-caller-identity

const REGION = "us-east-1"; // your bucket is in us-east-1
const BUCKET = process.argv[2]; // bucket name from command line
const FILE_PATH = process.argv[3]; // file path from command line

if (!BUCKET || !FILE_PATH) {
  console.error("Usage: node s3_upload.js <bucket-name> <file-path>");
  process.exit(1);
}

// Create S3 client (uses same credentials as AWS CLI)
const s3 = new S3Client({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

// Get filename only
const fileName = path.basename(FILE_PATH);

// Read file
const fileStream = fs.createReadStream(FILE_PATH);

async function upload() {
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: fileName,
      Body: fileStream,
    });

    await s3.send(command);
    console.log("Upload successful:", fileName);
  } catch (err) {
    console.error("Upload failed:", err);
  }
}

upload();
