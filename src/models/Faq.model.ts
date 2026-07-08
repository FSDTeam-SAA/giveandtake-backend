import { Schema, model, Document } from "mongoose";

export interface IFaq extends Document {
  question: string;
  answer: string;
  category?: string; // optional, e.g. "general", "billing", etc.
  order?: number; // optional for sorting
}

const FaqSchema = new Schema<IFaq>(
  {
    question: {
      type: String,
      required: true,
    },
    answer: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      default: "general",
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

export default model<IFaq>("Faq", FaqSchema);
