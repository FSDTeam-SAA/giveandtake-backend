import { Schema, model, Document, Types } from "mongoose";

export type ChatbotKnowledgeSource = "faq" | "content" | "custom" | "blog";

export interface IChatbotKnowledge extends Document {
  sourceType: ChatbotKnowledgeSource;
  sourceId?: Types.ObjectId | string;
  chunkIndex: number;
  text: string;
  metadata?: Record<string, unknown>;
  embedding: number[];
  hash?: string;
}

const ChatbotKnowledgeSchema = new Schema<IChatbotKnowledge>(
  {
    sourceType: {
      type: String,
      enum: ["faq", "content", "custom", "blog"],
      required: true,
    },
    sourceId: {
      type: Schema.Types.Mixed,
    },
    chunkIndex: {
      type: Number,
      default: 0,
    },
    text: {
      type: String,
      required: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
    embedding: {
      type: [Number],
      required: true,
    },
    hash: {
      type: String,
      index: true,
      unique: false,
    },
  },
  { timestamps: true }
);

ChatbotKnowledgeSchema.index({ sourceType: 1, sourceId: 1, chunkIndex: 1 }, { unique: true });

export default model<IChatbotKnowledge>("ChatbotKnowledge", ChatbotKnowledgeSchema);
