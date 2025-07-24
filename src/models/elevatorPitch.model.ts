import mongoose, { Schema, Document } from 'mongoose'

interface IElevatorPitch extends Document {
  userId: mongoose.Types.ObjectId
  video: {
    url: string // Public URL for original video (optional)
    hlsUrl: string // HLS playlist URL
    encryptionKeyUrl: string // URL for encryption key
    localPaths: {
      original: string // Path to original video
      hls: string // Path to HLS playlist
      key: string // Path to encryption key
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
      hlsUrl: String,
      encryptionKeyUrl: String,
      localPaths: {
        original: String,
        hls: String,
        key: String,
      },
    },
  },
  { timestamps: true }
)

export const ElevatorPitch = mongoose.model<IElevatorPitch>(
  'ElevatorPitch',
  elevatorPitchSchema
)
