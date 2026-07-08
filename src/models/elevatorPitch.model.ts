import mongoose, { Schema, Document } from 'mongoose'

export type ElevatorPitchProcessingState =
  | 'pending'
  | 'uploaded'
  | 'queued'
  | 'processing'
  | 'ready'
  | 'failed'

export interface IElevatorPitch extends Document {
  userId: mongoose.Types.ObjectId
  video: {
    url?: string | null
    hlsUrl?: string | null
    encryptionKeyUrl?: string | null
    rawKey?: string | null
    rawBucket?: string | null
    localPaths?: {
      original?: string | null
      hls?: string | null
      key?: string | null
    }
  }
  metadata?: {
    duration?: number | null
    format?: string | null
    vcodec?: string | null
    rotation?: number | null
    width?: number | null
    height?: number | null
  }
  processing?: {
    state: ElevatorPitchProcessingState
    startedAt?: Date | null
    updatedAt?: Date | null
    completedAt?: Date | null
    retries?: number
    error?: string | null
    fileSize?: number | null
    fileName?: string | null
  }
  status: string
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
      url: { type: String, default: null },
      hlsUrl: { type: String, default: null },
      encryptionKeyUrl: { type: String, default: null },
      rawKey: { type: String, default: null },
      rawBucket: { type: String, default: null },
      localPaths: {
        original: { type: String, default: null },
        hls: { type: String, default: null },
        key: { type: String, default: null },
      },
    },
    metadata: {
      duration: { type: Number, default: null },
      format: { type: String, default: null },
      vcodec: { type: String, default: null },
      rotation: { type: Number, default: null },
      width: { type: Number, default: null },
      height: { type: Number, default: null },
    },
    processing: {
      state: {
        type: String,
        enum: ['pending', 'uploaded', 'queued', 'processing', 'ready', 'failed'],
        default: 'pending',
      },
      startedAt: { type: Date, default: null },
      updatedAt: { type: Date, default: null },
      completedAt: { type: Date, default: null },
      retries: { type: Number, default: 0 },
      error: { type: String, default: null },
      fileSize: { type: Number, default: null },
      fileName: { type: String, default: null },
    },
    status: {
      type: String,
      enum: ['active', 'deactivate'],
      default: 'active',
    },
  },
  { timestamps: true }
)

export const ElevatorPitch = mongoose.model<IElevatorPitch>(
  'ElevatorPitch',
  elevatorPitchSchema
)
