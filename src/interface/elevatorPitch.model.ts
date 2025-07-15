import mongoose from "mongoose"

export interface IElevatorPitch extends Document {
  userId: mongoose.Types.ObjectId
  video: string
}
