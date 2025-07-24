import { v2 as cloudinary } from 'cloudinary'
import fs from 'fs'
import config from '../config/config'
import path from 'path'

// cloudinary.config({
//   cloud_name: config.cloudinary.cloudName,
//   api_key: config.cloudinary.apiKey,
//   api_secret: config.cloudinary.apiSecret,
// })
cloudinary.config({
  cloud_name: 'ddtuyxcsl',
  api_key: '155594432527689',
  api_secret: 'fw86uLN2JW_S9tYxb69R48Fym2k',
})

export const uploadToCloudinary = async (
  localFilePath: string,
  folderPath?: string
) => {
  try {
    if (!localFilePath) return null

    const uploadOptions: any = {
      resource_type: 'auto',
    }

    // Only add folder if provided
    if (folderPath) {
      uploadOptions.folder = folderPath
    }

    const response = await cloudinary.uploader.upload(
      localFilePath,
      uploadOptions
    )

    return response
  } catch (error) {
    // Remove file from local storage if upload fails
    if (fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath)
    }
    throw error
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

// export const uploadHLS = async (localDir: string, cloudinaryFolder: string) => {
//   try {
//     // Upload all files in the directory
//     const files = fs.readdirSync(localDir)
//     const uploadPromises = files.map((file) => {
//       const filePath = path.join(localDir, file)
//       console.log('firstdsfds')
//       return cloudinary.uploader.upload(filePath, {
//         resource_type: file.endsWith('.m3u8') ? 'video' : 'raw',
//         folder: cloudinaryFolder,
//         use_filename: true,
//       })
//     })

//     const results = await Promise.all(uploadPromises)

//     // Find the playlist file
//     const playlist = results.find((r) => r.original_filename === 'playlist')

//     return {
//       playlistUrl: playlist?.secure_url,
//       resources: results,
//     }
//   } catch (error) {
//     console.error('Error uploading HLS:', error)
//     throw error
//   }
// }


export const uploadHLS = async (localDir: string, cloudinaryFolder: string) => {
  try {
    // Find the playlist file
    const files = fs.readdirSync(localDir)
    const playlistFile = files.find((file) => file.endsWith('.m3u8'))

    if (!playlistFile) {
      throw new Error('No playlist file found')
    }

    const playlistPath = path.join(localDir, playlistFile)

    // Upload only the playlist file
    const result = await cloudinary.uploader.upload(playlistPath, {
      resource_type: 'video',
      folder: cloudinaryFolder,
      use_filename: true,
    })

    return {
      playlistUrl: result.secure_url,
      public_id: result.public_id,
    }
  } catch (error) {
    console.error('Error uploading HLS:', error)
    throw error
  }
}