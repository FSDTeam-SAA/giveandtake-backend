import fs from 'fs'
import path from 'path'
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'

/**
 * Cloudflare R2 uploader for PUBLIC assets — drop-in replacement for the old
 * `uploadToCloudinary`. Used for everything that must be served by a plain URL:
 * avatars, company logo/banner, resume photo/banner, blog images, job-category
 * icons, message image attachments, and the public recruiter intro video.
 *
 * IMPORTANT: this targets a DEDICATED public bucket (R2_PUBLIC_BUCKET_NAME),
 * kept separate from the private video buckets (R2_BUCKET_NAME) used by the
 * access-controlled elevator-pitch pipeline. R2 public access is per-bucket, so
 * public assets and private videos must NOT share a bucket.
 *
 * Behaviour mirrors the old Cloudinary helper so call sites need no changes:
 *  - returns a Cloudinary-shaped object exposing `secure_url` and `public_id`
 *    (`public_id` is the R2 object key, used later for deletion),
 *  - leaves the local temp file in place on success (controllers that already
 *    `fs.unlinkSync` after upload keep working — no double-unlink),
 *  - removes the local temp file on failure, then rethrows.
 */

// Config is resolved LAZILY (at first call), not at module load. server.ts
// imports the app before dotenv.config() runs, so reading process.env at import
// time would yield undefined values. Resolving on first use guarantees the env
// is populated. The client is memoised after the first call.
//
// The public image bucket may live in a DIFFERENT R2 account than the private
// video bucket, and may use its own (least-privilege) credentials — each falls
// back to the main R2_* values when the R2_PUBLIC_* override isn't set.
let cachedClient: S3Client | undefined

const getR2 = () => {
  const accountId =
    process.env.R2_PUBLIC_ACCOUNT_ID || process.env.R2_ACCOUNT_ID
  const bucket = process.env.R2_PUBLIC_BUCKET_NAME || process.env.R2_BUCKET_NAME
  const base = (process.env.R2_PUBLIC_BASE || '').replace(/\/$/, '')

  if (!bucket) {
    throw new Error(
      'R2 image upload misconfigured: set R2_PUBLIC_BUCKET_NAME (or R2_BUCKET_NAME) in the environment.'
    )
  }

  if (!cachedClient) {
    cachedClient = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: (process.env.R2_PUBLIC_ACCESS_KEY_ID ||
          process.env.R2_ACCESS_KEY_ID)!,
        secretAccessKey: (process.env.R2_PUBLIC_SECRET_ACCESS_KEY ||
          process.env.R2_SECRET_ACCESS_KEY)!,
      },
    })
  }

  return { client: cachedClient, accountId, bucket, base }
}

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.pdf': 'application/pdf',
}

const contentTypeFor = (fileName: string): string =>
  CONTENT_TYPES[path.extname(fileName).toLowerCase()] || 'application/octet-stream'

/**
 * Upload a local temp file to the public R2 bucket.
 * @param localFilePath multer temp file path
 * @param folder        R2 key prefix, e.g. 'avatars' | 'blogs' | 'companies'
 */
export const uploadToR2 = async (
  localFilePath: string,
  folder: string = 'uploads'
) => {
  if (!localFilePath) return null

  const { client, accountId, bucket, base: publicBase } = getR2()

  const fileName = path.basename(localFilePath)
  const safeFolder = folder.replace(/^\/+|\/+$/g, '')
  const key = `${safeFolder}/${Date.now()}-${Math.round(
    Math.random() * 1e9
  )}-${fileName}`

  try {
    // Streaming multipart upload — handles large files (e.g. intro videos)
    // without buffering the whole file in memory.
    const upload = new Upload({
      client,
      params: {
        Bucket: bucket,
        Key: key,
        Body: fs.createReadStream(localFilePath),
        ContentType: contentTypeFor(fileName),
        CacheControl: 'public, max-age=31536000, immutable',
      },
      queueSize: 4,
      partSize: 8 * 1024 * 1024,
      leavePartsOnError: false,
    })
    await upload.done()

    const origin =
      publicBase || `https://${bucket}.${accountId}.r2.cloudflarestorage.com`
    const secureUrl = `${origin}/${key}`

    return {
      secure_url: secureUrl,
      url: secureUrl,
      public_id: key,
      key,
    }
  } catch (error) {
    // Mirror the old Cloudinary helper: clean up the local temp file on failure.
    if (fs.existsSync(localFilePath)) {
      try {
        fs.unlinkSync(localFilePath)
      } catch {
        /* ignore cleanup errors */
      }
    }
    throw error
  }
}

/**
 * Delete an object from the public R2 bucket by its key (the `public_id`
 * returned at upload time). Deleting a non-existent key is a no-op on R2, so
 * passing a legacy Cloudinary public_id from old records is safe.
 */
export const deleteFromR2 = async (publicId?: string) => {
  if (!publicId) return
  const { client, bucket } = getR2()
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: publicId }))
}
