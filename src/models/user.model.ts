import mongoose, { Schema } from 'mongoose'
import bcrypt from 'bcrypt'
import { IUser, UserModel } from '../interface/user.interface'

const userSchema: Schema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true }, // NEW
    email: { type: String, required: true, unique: true },
    phoneNum: { type: String },
    password: { type: String, select: 0, required: true },
    role: {
      type: String,
      enum: ['candidate', 'recruiter', 'company', 'admin', 'super-admin'],
      default: 'candidate',
    },
    avatar: {
      url: { type: String, default: '' },
    },
    address: { type: String },
    securityQuestions: [
      {
        question: { type: String, default: '' },
        answer: { type: String, default: '' },
      },
    ],
    dateOfbirth: { type: Date },
    verificationInfo: {
      verified: { type: Boolean, default: false },
      token: { type: String, default: '' },
      resetToken: { type: String, default: '' },
    },
    password_reset_token: { type: String, default: '' },
    deactivate: { type: Boolean, default: false },
    dateOfdeactivate: { type: Date },
    refresh_token: { type: String },
  },
  { timestamps: true }
)

// --- helpers for slugging ---
function baseSlugFromName(name: string) {
  const cleaned = (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // keep only letters & numbers
  return cleaned || 'user'
}

async function generateUniqueSlug(
  model: mongoose.Model<IUser>,
  base: string,
  excludeId?: mongoose.Types.ObjectId
) {
  // Find existing slugs that start with base and optionally end with digits
  const regex = new RegExp(`^${base}(\\d+)?$`, 'i')
  const existing = await model
    .find({ slug: { $regex: regex }, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })
    .select('slug')
    .lean()

  if (!existing.length) return base

  // Collect numeric suffixes already used
  const taken = new Set(
    existing.map(d => {
      const m = (d.slug as string).match(new RegExp(`^${base}(\\d+)?$`, 'i'))
      return m && m[1] ? Number(m[1]) : 0
    })
  )

  // If base without suffix is free, use it. Otherwise, find the smallest free number.
  if (!taken.has(0)) return base
  let i = 1
  while (taken.has(i)) i++
  return `${base}${i}`
}

// Generate slug on create and whenever name changes
userSchema.pre('validate', async function (next) {
  const user = this as unknown as mongoose.Document & { name: string; slug?: string; isModified: (k: string) => boolean }

  if (!user.isModified('name') && user.slug) return next()

  const base = baseSlugFromName(user.name)
  // Use the model registered below (avoid hoist issues by using this.model)
  const model = (user.constructor as mongoose.Model<IUser>)
  user.slug = await generateUniqueSlug(model, base, user._id as any)

  next()
})

// Pre save middleware / hook : will work on create() save()
userSchema.pre('save', async function (next) {
  const user = this as any
  if (user.isModified('password')) {
    const saltRounds = Number(process.env.bcrypt_salt_round) || 10
    user.password = await bcrypt.hash(user.password, saltRounds)
  }
  next()
})

userSchema.statics.isUserExistsByEmail = async function (email: string) {
  return await User.findOne({ email }).select('+password +secureFolderPin')
}

userSchema.statics.isOTPVerified = async function (id: string) {
  const user = await User.findById(id).select('+verificationInfo')
  return user?.verificationInfo.verified
}

userSchema.statics.isPasswordMatched = async function (
  plainTextPassword: string,
  hashPassword: string
) {
  return await bcrypt.compare(plainTextPassword, hashPassword)
}

export const User = mongoose.model<IUser, UserModel>('User', userSchema)
