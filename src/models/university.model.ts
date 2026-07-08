// models/University.ts
import mongoose, { Document, Schema } from "mongoose";

export interface IUniversity extends Document {
  country: string;
  name: string;
  sourceFile?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UniversitySchema = new Schema<IUniversity>(
  {
    country: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    sourceFile: { type: String, default: null },
  },
  { timestamps: true }
);

// To prevent duplicates: same country + name
UniversitySchema.index({ country: 1, name: 1 }, { unique: true });

export const University = mongoose.model<IUniversity>("University", UniversitySchema);
