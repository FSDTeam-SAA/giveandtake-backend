import { Schema, model, Document } from "mongoose";

export interface IChatbotQA extends Document {
  question: string;
  answer: string;
  tags?: string[];
  isActive: boolean;
}

const ChatbotQASchema = new Schema<IChatbotQA>(
  {
    question: {
      type: String,
      required: true,
    },
    answer: {
      type: String,
      required: true,
    },
    tags: {
      type: [String],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

ChatbotQASchema.index({ isActive: 1 });
ChatbotQASchema.index({ question: "text", answer: "text" });

export default model<IChatbotQA>("ChatbotQA", ChatbotQASchema);
