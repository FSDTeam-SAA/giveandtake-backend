import mongoose, { Schema, Document } from 'mongoose'
import { IElevatorPitch } from '../interface/elevatorPitch.model'


const elevatorPitchSchema: Schema<IElevatorPitch> = new Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    video: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
)

export const ElevatorPitch = mongoose.model<IElevatorPitch>(
  'ElevatorPitch',
  elevatorPitchSchema
)
