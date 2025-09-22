// models/Language.ts
import mongoose, { Document, Schema } from "mongoose";

export interface ILanguage extends Document {
  name: string;
  isoCode?: string | null;
  nativeName?: string | null;
  direction?: "ltr" | "rtl";
  sourceFile?: string;
  createdAt: Date;
  updatedAt: Date;
}

const LanguageSchema: Schema = new Schema<ILanguage>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    isoCode: { type: String, index: true, sparse: true },
    nativeName: { type: String, default: null },
    direction: { type: String, enum: ["ltr", "rtl"], default: "ltr" },
    sourceFile: { type: String, default: null },
  },
  { timestamps: true }
);

export const Language = mongoose.model<ILanguage>("Language", LanguageSchema);
