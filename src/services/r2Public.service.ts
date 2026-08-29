import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";

/**
 * Cloudflare R2 bucket for *publicly readable* assets (avatars, banners,
 * logos, images and short videos rendered directly by the browser).
 *
 * This is a different bucket from the private video bucket in s3.service.ts:
 * objects here are served straight from R2_PUBLIC_BASE with no signing, so the
 * URLs stored in Mongo stay valid forever.
 */
const accountId = process.env.R2_PUBLIC_ACCOUNT_ID || process.env.R2_ACCOUNT_ID;
const bucketName =
  process.env.R2_PUBLIC_BUCKET_NAME || process.env.R2_BUCKET_NAME || "";
const accessKeyId =
  process.env.R2_PUBLIC_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID || "";
const secretAccessKey =
  process.env.R2_PUBLIC_SECRET_ACCESS_KEY ||
  process.env.R2_SECRET_ACCESS_KEY ||
  "";

const publicClient = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

/** Public base must be the bucket's r2.dev domain or a mapped custom domain. */
const publicBase = (
  process.env.R2_PUBLIC_BASE ||
  `https://${bucketName}.${accountId}.r2.cloudflarestorage.com`
).replace(/\/$/, "");

export const publicUrlForKey = (key: string) =>
  `${publicBase}/${key.replace(/^\/+/, "")}`;

/** Strip a public URL back down to its object key. */
export const extractPublicKey = (url?: string | null): string => {
  if (!url) return "";
  let key: string;
  try {
    const parsed = new URL(url);
    key = parsed.pathname;
    try {
      const configuredBase = new URL(publicBase);
      const basePath = configuredBase.pathname
        .replace(/^\/+/, "")
        .replace(/\/+$/, "");
      const normalizedPath = key.replace(/^\/+/, "");
      key =
        basePath && normalizedPath.startsWith(`${basePath}/`)
          ? normalizedPath.slice(basePath.length + 1)
          : normalizedPath;
    } catch {
      // The outer URL was valid; ignore an invalid public-base configuration.
    }
  } catch {
    key = url;
  }
  key = decodeURIComponent(key).replace(/^\/+/, "");
  return bucketName && key.startsWith(`${bucketName}/`)
    ? key.slice(bucketName.length + 1)
    : key;
};

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".webm": "video/webm",
  ".pdf": "application/pdf",
  ".xlsx":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const contentTypeFor = (fileName: string) =>
  CONTENT_TYPES[path.extname(fileName).toLowerCase()] ||
  "application/octet-stream";

const sanitize = (name: string) =>
  path
    .basename(name)
    .replace(/[^a-zA-Z0-9.\-_]+/g, "_")
    .replace(/_{2,}/g, "_")
    .toLowerCase();

/** Remove a local temp file, tolerating one that is already gone. */
export const removeLocalFile = (localFilePath?: string | null) => {
  if (!localFilePath) return;
  try {
    fs.unlinkSync(localFilePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`Failed to remove local file "${localFilePath}":`, error);
    }
  }
};

/**
 * Upload a local (multer) file to the public bucket. The temp file is always
 * removed afterwards, success or failure — callers must not unlink it.
 */
export const uploadPublicFile = async (
  localFilePath: string,
  folder = "uploads"
) => {
  const fileName = sanitize(localFilePath);
  const key = `${folder}/${Date.now()}-${fileName}`;

  try {
    await publicClient.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: fs.createReadStream(localFilePath),
        ContentLength: fs.statSync(localFilePath).size,
        ContentType: contentTypeFor(fileName),
        CacheControl: "public, max-age=31536000, immutable",
      })
    );
  } finally {
    removeLocalFile(localFilePath);
  }

  return { key, url: publicUrlForKey(key) };
};

export const deletePublicFile = async (key: string) => {
  if (!key) return;
  await publicClient.send(
    new DeleteObjectCommand({ Bucket: bucketName, Key: key })
  );
};
