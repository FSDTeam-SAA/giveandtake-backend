// models/elevatorPitch.model.ts
import mongoose, { Schema, Document } from 'mongoose'

interface IElevatorPitch extends Document {
  userId: mongoose.Types.ObjectId
  video: {
    url: string
    publicId: string
    hlsUrl?: string
    encryptionKeyUrl?: string
    localPaths?: {
      original: string
      hls: string
      key: string
    }
  }
}

const elevatorPitchSchema = new Schema<IElevatorPitch>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    video: {
      url: String,
      publicId: String,
      hlsUrl: String,
      encryptionKeyUrl: String,
      localPaths: {
      original: String,
      hls: String,
      key: String,
    }
    },
  },
  { timestamps: true }
)

export const ElevatorPitch = mongoose.model<IElevatorPitch>(
  'ElevatorPitch',
  elevatorPitchSchema
)
