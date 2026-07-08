import { Document, Model, Types } from 'mongoose'

export interface IUser {
  _id(_id: any): unknown
  save(): unknown
  name: string
  slug: string
  email: string
  phoneNum: string
  password: string
  whatsappNum?: string
  address?: string
  securityQuestions?: {
    question: string
    answer: string
  }[]

  avatar?: {
    url: string
  }

  dateOfbirth?: Date
  role: 'admin' | 'candidate' | 'recruiter' | 'company'
  verificationInfo: {
    verified: boolean
    token: string
    resetToken: string
  }
  password_reset_token: string
  deactivate: boolean
  dateOfdeactivate: Date | undefined
  refresh_token: string
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
