import { Schema, model, Document, Types } from "mongoose";

export interface IChatbotHistory extends Document {
  conversationId?: string;
  userId?: Types.ObjectId;
  role: "user" | "assistant";
  content: string;
  thoughtSignature?: string;
}

const ChatbotHistorySchema = new Schema<IChatbotHistory>(
  {
    conversationId: {
      type: String,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    role: {
      type: String,
      enum: ["user", "assistant"],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    thoughtSignature: {
      type: String,
    },
  },
  { timestamps: true }
);

ChatbotHistorySchema.index({ userId: 1, conversationId: 1, createdAt: 1 });

export default model<IChatbotHistory>("ChatbotHistory", ChatbotHistorySchema);

