import mongoose, { Schema, Document } from "mongoose";
import slugify from "slugify";

export interface IUser extends Document {
  name: string;
  slug: string;
  email: string;
  password: string;
  address?: string;
  phoneNum?: string;
  role: "admin" | "candidate" | "recruiter" | "company";
  dateOfbirth?: Date;
  avatar?: {
    url?: string;
  };
  verificationInfo: {
    token?: string;
    verified?: boolean;
    resetToken?: string;
  };
  password_reset_token?: string;
  refresh_token?: string;
  deactivate?: boolean;
  dateOfdeactivate?: Date;
  securityQuestions?: Array<{ question: string; answer: string }>;
  createdAt?: Date;
  updatedAt?: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, unique: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    address: { type: String, trim: true },
    phoneNum: { type: String, trim: true },
    role: { type: String, enum: ["admin", "candidate", "recruiter", "company"], default: "candidate" },
    dateOfbirth: { type: Date },
    avatar: {
      url: { type: String },
    },
    verificationInfo: {
      token: { type: String, default: "" },
      verified: { type: Boolean, default: false },
      resetToken: { type: String, default: "" },
    },
    password_reset_token: { type: String, default: "" },
    refresh_token: { type: String, default: "" },
    deactivate: { type: Boolean, default: false },
    dateOfdeactivate: { type: Date },
    securityQuestions: [
      {
        question: { type: String },
        answer: { type: String },
      },
    ],
  },
  { timestamps: true }
);

//
// ✅ SLUG GENERATION & UNIQUENESS LOGIC
//
async function generateUniqueSlug(doc: any, name: string) {
  let baseSlug = slugify(name, { lower: true, strict: true });
  let slug = baseSlug;
  let counter = 1;

  const query: any = { slug };
  if (doc._id) query._id = { $ne: doc._id };

  while (await mongoose.models.User.exists(query)) {
    slug = `${baseSlug}-${counter++}`;
    query.slug = slug;
  }

  return slug;
}

// Pre-save hook — triggers when creating or updating name
userSchema.pre("save", async function (next) {
  if (this.isModified("name")) {
    this.slug = await generateUniqueSlug(this, this.name);
  }
  next();
});

// Pre-findOneAndUpdate hook — triggers for findByIdAndUpdate / findOneAndUpdate
userSchema.pre("findOneAndUpdate", async function (next) {
  const update = this.getUpdate() as any;
  if (update && update.name) {
    const slug = await generateUniqueSlug(this, update.name);
    update.slug = slug;
    this.setUpdate(update);
  }
  next();
});

// Pre-updateMany hook — safeguard for bulk updates
userSchema.pre("updateMany", async function (next) {
  const update = this.getUpdate() as any;
  if (update && update.name) {
    const slug = await generateUniqueSlug(this, update.name);
    update.slug = slug;
    this.setUpdate(update);
  }
  next();
});

//
// ✅ STATIC METHODS (for controllers)
//
userSchema.statics.isUserExistsByEmail = async function (email: string) {
  return this.findOne({ email });
};

userSchema.statics.isPasswordMatched = async function (
  givenPassword: string,
  savedPassword: string
) {
  // Comparison is handled in controller, so this can be a no-op or wrapper
  return givenPassword === savedPassword;
};

userSchema.statics.isOTPVerified = async function (id: string) {
  const user = await this.findById(id);
  return user?.verificationInfo?.verified ?? false;
};

export const User = mongoose.model<IUser>("User", userSchema);
