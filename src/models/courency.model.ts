import mongoose, { Document, Schema } from "mongoose";

export interface IItem extends Document {
  code: string;
  currencyName: string;
  primaryCountry?: string;
  symbol?: string;
  sourceFile?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ItemSchema = new Schema<IItem>(
  {
    code: { type: String, required: true, trim: true, unique: true }, // unique currency code
    currencyName: { type: String, required: true, trim: true },
    primaryCountry: { type: String, default: null, trim: true },
    symbol: { type: String, default: null, trim: true },
    sourceFile: { type: String, default: null },
  },
  { timestamps: true }
);

// Index for faster queries on code + currencyName if needed
ItemSchema.index({ code: 1, currencyName: 1 });

export const Item = mongoose.model<IItem>("Item", ItemSchema);
