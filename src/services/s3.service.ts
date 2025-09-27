// services/s3.service.ts
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs";
import path from "path";

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export const uploadToS3 = async (filePath: string, s3Key: string) => {
  const fileContent = fs.readFileSync(filePath);
  const bucketName = process.env.AWS_BUCKET_NAME!;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: s3Key,
    Body: fileContent,
    ContentType: getContentType(s3Key),
  });

  await s3Client.send(command);
  return `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;
};

export const getSignedS3Url = async (
  s3Key: string,
  expiresIn: number = 3600
) => {
  const bucketName = process.env.AWS_BUCKET_NAME!;
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: s3Key,
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
};

export const deleteFromS3 = async (s3Key: string) => {
  const bucketName = process.env.AWS_BUCKET_NAME!;
  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: s3Key,
  });

  await s3Client.send(command);
};

export const uploadHLSFilesToS3 = async (
  localDir: string,
  s3Folder: string
) => {
  const files = fs.readdirSync(localDir);
  const uploadedUrls: { [key: string]: string } = {};

  for (const file of files) {
    const filePath = path.join(localDir, file);
    const s3Key = `${s3Folder}/${file}`;
    const url = await uploadToS3(filePath, s3Key);
    uploadedUrls[file] = url;
  }

  return uploadedUrls;
};

const getContentType = (filename: string): string => {
  const ext = path.extname(filename).toLowerCase();
  const contentTypes: { [key: string]: string } = {
    ".m3u8": "application/vnd.apple.mpegurl",
    ".ts": "video/mp2t",
    ".key": "application/octet-stream",
    ".mp4": "video/mp4",
    ".m4s": "video/iso.segment",
  };
  return contentTypes[ext] || "application/octet-stream";
};
