import { Document, Model, Types } from 'mongoose'

export interface IUser {
  _id(_id: any): unknown
  save(): unknown
  name: string
  email: string
  phoneNum: string
  password: string
  whatsappNum?: string
  wishlist: string[]
  avatar?: string
  role: 'admin' | 'user'
  verificationInfo: {
    verified: boolean
    token: string
  }
  password_reset_token: string
}

export interface UserModel extends Model<IUser> {
  isUserExistsByEmail(email: string): Promise<IUser>
  isOTPVerified(id: string): Promise<boolean>
  isPasswordMatched(
    plainTextPassword: string,
    hashPassword: string
  ): Promise<boolean>
  isJWTIssuedBeforePasswordChanged(
    passwordChangeTimeStamp: Date,
    JwtIssuedTimeStamp: number
  ): boolean
}
