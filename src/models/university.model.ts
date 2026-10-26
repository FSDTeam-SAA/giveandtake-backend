// models/University.ts
import mongoose, { Document, Schema } from "mongoose";

export interface IUniversity extends Document {
  country: string;
  name: string;
  sourceFile?: string;
  active?: boolean;
  normalizedKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UniversitySchema = new Schema<IUniversity>(
  {
    country: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    sourceFile: { type: String, default: null },
    active: { type: Boolean, default: true },
    normalizedKey: { type: String },
  },
  { timestamps: true }
);

// To prevent duplicates: same country + name
UniversitySchema.index({ country: 1, name: 1 }, { unique: true });
// Legacy records may omit this field; new/edited records get race-safe deduplication.
UniversitySchema.index({ normalizedKey: 1 }, { unique: true, sparse: true });

export const University = mongoose.model<IUniversity>("University", UniversitySchema);
