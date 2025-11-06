// // services/s3.service.ts
// import {
//   S3Client,
//   PutObjectCommand,
//   GetObjectCommand,
//   DeleteObjectCommand,
//   ListObjectsV2Command,
//   DeleteObjectsCommand,
// } from "@aws-sdk/client-s3";
// import { Upload } from "@aws-sdk/lib-storage";
// import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
// import fs from "fs";
// import path from "path";
// import { pipeline } from "stream/promises";

// const s3Client = new S3Client({
//   region: process.env.AWS_REGION,
//   credentials: {
//     accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
//     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
//   },
// });

// const bucketUrl = (key: string) =>
//   `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

// const multipartUpload = async (params: {
//   Key: string;
//   Body: fs.ReadStream;
//   ContentType?: string;
//   CacheControl?: string;
// }) => {
//   const upload = new Upload({
//     client: s3Client,
//     params: {
//       Bucket: process.env.AWS_BUCKET_NAME!,
//       ...params,
//     },
//     queueSize: 8,
//     partSize: 8 * 1024 * 1024,
//     leavePartsOnError: false,
//   });

//   await upload.done();
// };

// export const uploadToS3 = async (filePath: string, s3Key: string) => {
//   const stream = fs.createReadStream(filePath);

//   await multipartUpload({
//     Key: s3Key,
//     Body: stream,
//     ContentType: getContentType(s3Key),
//     CacheControl: s3Key.endsWith(".key")
//       ? "private, max-age=0, no-cache"
//       : "public, max-age=31536000, immutable",
//   });

//   return bucketUrl(s3Key);
// };

// export const getSignedS3Url = async (
//   s3Key: string,
//   expiresIn: number = 3600
// ) => {
//   const bucketName = process.env.AWS_BUCKET_NAME!;
//   const command = new GetObjectCommand({
//     Bucket: bucketName,
//     Key: s3Key,
//   });

//   return await getSignedUrl(s3Client, command, { expiresIn });
// };

// export const deleteFromS3 = async (s3Key: string) => {
//   if (!s3Key) return;
//   const bucketName = process.env.AWS_BUCKET_NAME!;
//   const command = new DeleteObjectCommand({
//     Bucket: bucketName,
//     Key: s3Key,
//   });

//   await s3Client.send(command);
// };

// export const uploadHLSFilesToS3 = async (
//   localDir: string,
//   s3Folder: string
// ) => {
//   const entries = fs.readdirSync(localDir, { withFileTypes: true });
//   const files = entries
//     .filter((entry) => entry.isFile() && !entry.name.endsWith(".info"))
//     .map((entry) => entry.name);
//   const uploadedUrls: { [key: string]: string } = {};

//   const maxConcurrent = Math.min(6, Math.max(1, files.length));
//   let cursor = 0;

//   const worker = async () => {
//     while (cursor < files.length) {
//       const file = files[cursor];
//       cursor += 1;
//       const filePath = path.join(localDir, file);
//       const s3Key = `${s3Folder}/${file}`;
//       const url = await uploadToS3(filePath, s3Key);
//       uploadedUrls[file] = url;
//     }
//   };

//   await Promise.all(
//     Array.from({ length: maxConcurrent }, () => worker())
//   );

//   return uploadedUrls;
// };

// const getContentType = (filename: string): string => {
//   const ext = path.extname(filename).toLowerCase();
//   const contentTypes: { [key: string]: string } = {
//     ".m3u8": "application/vnd.apple.mpegurl",
//     ".ts": "video/mp2t",
//     ".key": "application/octet-stream",
//     ".mp4": "video/mp4",
//     ".m4s": "video/iso.segment",
//   };
//   return contentTypes[ext] || "application/octet-stream";
// };

// export const uploadFileToS3 = async (localFilePath: string, folder: string) => {
//   const fileName = path.basename(localFilePath);
//   const key = `${folder}/${Date.now()}-${fileName}`;
//   const body = fs.createReadStream(localFilePath);

//   await multipartUpload({
//     Key: key,
//     Body: body,
//     ContentType: "application/octet-stream",
//   });

//   // Delete file from local after upload
//   fs.unlinkSync(localFilePath);

//   // Generate signed URL (valid for 7 days)
//   const signedUrl = await getSignedUrl(
//     s3Client,
//     new PutObjectCommand({
//       Bucket: process.env.AWS_BUCKET_NAME!,
//       Key: key,
//     }),
//     { expiresIn: 7 * 24 * 60 * 60 } // 7 days
//   );

//   // Return permanent S3 URL (not signed, public access if your bucket allows)
//   const fileUrl = bucketUrl(key);

//   return { key, fileUrl, signedUrl };
// };

// export const getSignedUploadUrl = async ({
//   key,
//   contentType,
//   expiresIn = 15 * 60,
//   acl,
// }: {
//   key: string;
//   contentType?: string;
//   expiresIn?: number;
//   acl?: "public-read" | "private";
// }) => {
//   const command = new PutObjectCommand({
//     Bucket: process.env.AWS_BUCKET_NAME!,
//     Key: key,
//     ContentType: contentType,
//     ACL: acl,
//   });

//   const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });
//   return {
//     uploadUrl,
//     key,
//     bucket: process.env.AWS_BUCKET_NAME!,
//   };
// };

// export const downloadS3ObjectToFile = async ({
//   key,
//   destinationPath,
// }: {
//   key: string;
//   destinationPath: string;
// }) => {
//   const command = new GetObjectCommand({
//     Bucket: process.env.AWS_BUCKET_NAME!,
//     Key: key,
//   });

//   const response = await s3Client.send(command);
//   if (!response.Body) {
//     throw new Error(`No body returned when downloading S3 object "${key}"`);
//   }

//   await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
//   const writeStream = fs.createWriteStream(destinationPath);
//   await pipeline(response.Body as NodeJS.ReadableStream, writeStream);

//   return destinationPath;
// };

// export const deleteS3Prefix = async (prefix: string) => {
//   const bucket = process.env.AWS_BUCKET_NAME!;
//   let continuationToken: string | undefined;

//   do {
//     const listCommand = new ListObjectsV2Command({
//       Bucket: bucket,
//       Prefix: prefix,
//       ContinuationToken: continuationToken,
//     });

//     const listed = await s3Client.send(listCommand);
//     const objects = listed.Contents ?? [];
//     if (!objects.length) {
//       continuationToken = listed.NextContinuationToken;
//       continue;
//     }

//     const deleteCommand = new DeleteObjectsCommand({
//       Bucket: bucket,
//       Delete: {
//         Objects: objects.map((obj) => ({ Key: obj.Key! })),
//       },
//     });

//     await s3Client.send(deleteCommand);
//     continuationToken = listed.NextContinuationToken;
//   } while (continuationToken);
// };


import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";

/**
 * ✅ FIX #1:
 * Use the *account-level endpoint*, not the bucket subdomain.
 * For private R2 buckets, this must be:
 *    https://<ACCOUNT_ID>.r2.cloudflarestorage.com
 */
const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const bucketName = process.env.R2_BUCKET_NAME!;

/**
 * ✅ FIX #2:
 * Generate the *public* URL only if your bucket is public.
 * For private R2, this is just used for reference, not playback.
 */
const bucketUrl = (key: string) => {
  const base =
    process.env.R2_PUBLIC_BASE?.replace(/\/$/, "") ||
    // Keep this fallback for *public* buckets only
    `https://${bucketName}.${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  return `${base}/${key.replace(/^\/+/, "")}`;
};

const multipartUpload = async (params: {
  Key: string;
  Body: fs.ReadStream;
  ContentType?: string;
  CacheControl?: string;
}) => {
  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: bucketName,
      ...params,
    },
    queueSize: 8,
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

/**
 * ✅ FIX #3:
 * getSignedS3Url now correctly produces valid *private* R2 signed URLs.
 * They will look like:
 *   https://<ACCOUNT_ID>.r2.cloudflarestorage.com/<bucket>/<key>?X-Amz-...
 */
export const getSignedS3Url = async (s3Key: string, expiresIn = 3600) => {
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: s3Key,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
};

export const deleteFromS3 = async (s3Key: string) => {
  if (!s3Key) return;
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

  const uploadedUrls: Record<string, string> = {};
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

  await Promise.all(Array.from({ length: maxConcurrent }, () => worker()));
  return uploadedUrls;
};

const getContentType = (filename: string): string => {
  const ext = path.extname(filename).toLowerCase();
  const contentTypes: Record<string, string> = {
    ".m3u8": "application/vnd.apple.mpegurl", // HLS manifest
    ".ts": "video/mp2t", // HLS transport stream segments
    ".key": "application/octet-stream", // AES-128 key file
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
    ContentType: getContentType(fileName),
  });

  fs.unlinkSync(localFilePath);

  // Signed URL (private)
  const signedUrl = await getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: bucketName, Key: key }),
    { expiresIn: 7 * 24 * 60 * 60 }
  );

  const fileUrl = bucketUrl(key);
  return { key, fileUrl, signedUrl };
};

export const getSignedUploadUrl = async ({
  key,
  contentType,
  expiresIn = 15 * 60,
}: {
  key: string;
  contentType?: string;
  expiresIn?: number;
}) => {
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });
  return { uploadUrl, key, bucket: bucketName };
};

export const downloadS3ObjectToFile = async ({
  key,
  destinationPath,
}: {
  key: string;
  destinationPath: string;
}) => {
  const command = new GetObjectCommand({ Bucket: bucketName, Key: key });
  const response = await s3Client.send(command);
  if (!response.Body) {
    throw new Error(`No body returned when downloading S3 object "${key}"`);
  }

  await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
  const writeStream = fs.createWriteStream(destinationPath);
  await pipeline(response.Body as NodeJS.ReadableStream, writeStream);
  return destinationPath;
};

export const deleteS3Prefix = async (prefix: string) => {
  let continuationToken: string | undefined;
  do {
    const listed = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );

    const objects = listed.Contents ?? [];
    if (!objects.length) {
      continuationToken = listed.NextContinuationToken;
      continue;
    }

    await s3Client.send(
      new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: { Objects: objects.map((obj) => ({ Key: obj.Key! })) },
      })
    );

    continuationToken = listed.NextContinuationToken;
  } while (continuationToken);
};
