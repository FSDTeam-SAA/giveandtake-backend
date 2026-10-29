import mongoose, { Schema } from 'mongoose';
const skillReviewSchema = new Schema({
  _id: { type: String, required: true },
  name: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], required: true },
  skillId: { type: Schema.Types.ObjectId, ref: 'SkillModel', default: null },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });
export const SkillReview = mongoose.model('SkillReview', skillReviewSchema);
