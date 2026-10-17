import { Schema, model } from "mongoose";

const schema = new Schema({
  value: { type: String, required: true, unique: true, immutable: true },
  label: { type: String, required: true, trim: true, maxlength: 100 },
  key: { type: String, required: true, unique: true },
  active: { type: Boolean, default: true },
  order: { type: Number, default: 1000 },
}, { timestamps: true });

export const Qualification = model("Qualification", schema);
