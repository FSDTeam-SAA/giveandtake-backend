import { Schema, model } from 'mongoose'
import { IFollowing } from '../interface/following.interface'


const followingSchema = new Schema<IFollowing>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    recruiterId: { type: Schema.Types.ObjectId, ref: 'User' }, 
    companyId: { type: Schema.Types.ObjectId, ref: 'User' }, 
  },
  {
    timestamps: true,
  }
)

export const Following = model<IFollowing>('Following', followingSchema)
