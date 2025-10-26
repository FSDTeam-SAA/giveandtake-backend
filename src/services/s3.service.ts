// services/s3.service.ts
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
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

const bucketUrl = (key: string) =>
  `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

const multipartUpload = async (params: {
  Key: string;
  Body: fs.ReadStream;
  ContentType?: string;
  CacheControl?: string;
}) => {
  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: process.env.AWS_BUCKET_NAME!,
      ...params,
    },
    queueSize: 4,
    partSize: 8 * 1024 * 1024,
    leavePartsOnError: false,
  });

  await upload.done();
};

export const uploadToS3 = async (filePath: string, s3Key: string) => {
  const stream = fs.createReadStream(filePath);

  await multipartUpload({
    Key: s3Key,
    Body: stream,
    ContentType: getContentType(s3Key),
    CacheControl: s3Key.endsWith(".key")
      ? "private, max-age=0, no-cache"
      : "public, max-age=31536000, immutable",
  });

  return bucketUrl(s3Key);
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
  const entries = fs.readdirSync(localDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && !entry.name.endsWith(".info"))
    .map((entry) => entry.name);
  const uploadedUrls: { [key: string]: string } = {};

  const maxConcurrent = Math.min(6, Math.max(1, files.length));
  let cursor = 0;

  const worker = async () => {
    while (cursor < files.length) {
      const file = files[cursor];
      cursor += 1;
      const filePath = path.join(localDir, file);
      const s3Key = `${s3Folder}/${file}`;
      const url = await uploadToS3(filePath, s3Key);
      uploadedUrls[file] = url;
    }
  };

  await Promise.all(
    Array.from({ length: maxConcurrent }, () => worker())
  );

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

export const uploadFileToS3 = async (localFilePath: string, folder: string) => {
  const fileName = path.basename(localFilePath);
  const key = `${folder}/${Date.now()}-${fileName}`;
  const body = fs.createReadStream(localFilePath);

  await multipartUpload({
    Key: key,
    Body: body,
    ContentType: "application/octet-stream",
  });

  // Delete file from local after upload
  fs.unlinkSync(localFilePath);

  // Generate signed URL (valid for 7 days)
  const signedUrl = await getSignedUrl(
    s3Client,
    new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME!,
      Key: key,
    }),
    { expiresIn: 7 * 24 * 60 * 60 } // 7 days
  );

  // Return permanent S3 URL (not signed, public access if your bucket allows)
  const fileUrl = bucketUrl(key);

  return { key, fileUrl, signedUrl };
};
