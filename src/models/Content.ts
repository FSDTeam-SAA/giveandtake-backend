import { Schema, model, Document } from "mongoose";

export interface IContent extends Document {
  type: "about" | "privacy" | "candidate" | "recruiter" | "company" | "terms";
  title: string;
  description: string; // stores HTML from rich text editor
}

const ContentSchema = new Schema<IContent>(
  {
    type: {
      type: String,
      enum: ["about", "privacy", "candidate", "recruiter", "company", "terms"],
      required: true,
      unique: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

export default model<IContent>("Content", ContentSchema);
