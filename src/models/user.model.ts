import mongoose, { Schema, Document, Model } from 'mongoose'
import bcrypt from 'bcrypt'
import slugify from 'slugify'
import { IUser, UserModel } from '../interface/user.interface'

const userSchema: Schema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    slug: { type: String, unique: true, trim: true }, // ✅ Added slug field
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
    address: {
      type: String,
    },
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

//
// ✅ Password hashing stays exactly as before
//
userSchema.pre('save', async function (next) {
  const user = this as any

  // Hash password
  if (user.isModified('password')) {
    const saltRounds = Number(process.env.bcrypt_salt_round) || 10
    user.password = await bcrypt.hash(user.password, saltRounds)
  }

  // ✅ Slug logic for name changes
  if (user.isModified('name')) {
    user.slug = slugify(user.name, { lower: true, strict: true })
  }

  next()
})

//
// ✅ Ensure slug updates for findOneAndUpdate / findByIdAndUpdate
//
userSchema.pre('findOneAndUpdate', async function (next) {
  const update = this.getUpdate() as any
  if (update && update.name) {
    update.slug = slugify(update.name, { lower: true, strict: true })
    this.setUpdate(update)
  }
  next()
})

//
// ✅ Optional uniqueness safeguard (if you expect duplicate names)
//
userSchema.pre(['save', 'findOneAndUpdate'], async function (next) {
  const doc: any = this
  const update = (this as any).getUpdate?.() || doc
  const name = update?.name || doc?.name
  if (!name) return next()

  let baseSlug = slugify(name, { lower: true, strict: true })
  let slug = baseSlug
  let counter = 1

  const query: any = { slug }
  if (doc._id) query._id = { $ne: doc._id }

  while (await mongoose.models.User.exists(query)) {
    slug = `${baseSlug}-${counter++}`
    query.slug = slug
  }

  if (update?.name) update.slug = slug
  else doc.slug = slug

  if (typeof doc.setUpdate === 'function') doc.setUpdate(update)
  next()
})

//
// ✅ Static methods remain exactly the same
//
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
