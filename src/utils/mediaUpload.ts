import {
  deletePublicFile,
  extractPublicKey,
  removeLocalFile,
  uploadPublicFile,
} from '../services/r2Public.service'

/**
 * Single entry point for user-uploaded images and short videos (avatars,
 * banners, logos). Everything goes to the public Cloudflare R2 bucket, so the
 * stored URL renders directly in the browser with no signing.
 *
 * The local multer temp file is always removed, success or failure — callers
 * must not unlink it themselves.
 *
 * Returns null when there is no file to upload.
 */
export const uploadMedia = async (
  localFilePath?: string | null,
  folder = 'uploads'
): Promise<{ url: string; key: string } | null> => {
  if (!localFilePath) return null

  try {
    return await uploadPublicFile(localFilePath, folder)
  } catch (error) {
    removeLocalFile(localFilePath)
    throw new Error(
      `R2 upload failed: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    )
  }
}

/**
 * Delete previously uploaded media. Accepts either an R2 key or a stored URL.
 * Never throws — losing an old file must not fail the request that replaced it.
 */
export const deleteMedia = async (keyOrUrl?: string | null) => {
  const key = extractPublicKey(keyOrUrl)
  if (!key) return
  try {
    await deletePublicFile(key)
  } catch (error) {
    console.warn(`Failed to delete R2 object "${key}":`, error)
  }
}
