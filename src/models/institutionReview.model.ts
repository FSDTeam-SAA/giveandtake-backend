import mongoose, { Schema } from 'mongoose';

const institutionReviewSchema = new Schema({
  _id: { type: String, required: true },
  name: { type: String, required: true },
  country: { type: String, default: '' },
  status: { type: String, enum: ['approved', 'rejected'], required: true },
  universityId: { type: Schema.Types.ObjectId, ref: 'University', default: null },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

export const InstitutionReview = mongoose.model('InstitutionReview', institutionReviewSchema);
