import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import dotenv from "dotenv";

dotenv.config();

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// function for UPLOADING
export async function generatePresignedUrl(filename, contentType) {
  const command = new PutObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: filename,
    ContentType: contentType,
  });
  return await getSignedUrl(s3, command, { expiresIn: 300 });
}

// function for VIEWING/DOWNLAODING
export async function generateGetPresignedUrl(filename) {
  const command = new GetObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: filename,
  });

  // This link will work for 1 hour (3600 seconds)
  return await getSignedUrl(s3, command, { expiresIn: 3600 });
}