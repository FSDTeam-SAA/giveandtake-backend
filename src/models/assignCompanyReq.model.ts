import mongoose, { Schema, Document, Model } from 'mongoose'

const ReqCompanySchema = new Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    status: {
      type: String,
      enum: ["pending", "accepted","rejected"],
      default: "pending"
    }
  },
  { timestamps: true }
)

export const ReqCompany= mongoose.model(
  'ReqCompany',
  ReqCompanySchema
)
