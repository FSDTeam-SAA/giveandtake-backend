import { Types } from 'mongoose'

export interface IFollowing {
  userId: Types.ObjectId
  recruiterId?: Types.ObjectId
  companyId?: Types.ObjectId
}
