import { v2 as cloudinary } from 'cloudinary'
import fs from 'fs'
import config from "../config/config"
import path from 'path'

cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
})

export const uploadToCloudinary = async (localFilePath: string) => {
  try {
    if (!localFilePath) return null

    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: 'auto',
    })

    // Remove file from local storage after upload
    fs.unlinkSync(localFilePath)

    return response
  } catch (error) {
    // Remove file from local storage if upload fails
    if (fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath)
    }
    return null
  }
}

export const deleteFromCloudinary = async (publicId: string) => {
  try {
    if (!publicId) return
    await cloudinary.uploader.destroy(publicId, {
      resource_type: 'video',
    })
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error)
  }
}



export const uploadHLS = async (localDir: string, folder: string) => {
  try {
    // Upload all files in the directory
    const files = fs.readdirSync(localDir)
    const uploadPromises = files.map((file) => {
      const filePath = path.join(localDir, file)
      return cloudinary.uploader.upload(filePath, {
        resource_type: 'auto',
        folder: `${folder}/hls`,
        use_filename: true,
      })
    })

    const results = await Promise.all(uploadPromises)

    // Find the playlist file
    const playlist = results.find((r) => r.original_filename === 'playlist')

    return {
      playlistUrl: playlist?.secure_url,
      resources: results,
    }
  } catch (error) {
    console.error('Error uploading HLS:', error)
    throw error
  }
}