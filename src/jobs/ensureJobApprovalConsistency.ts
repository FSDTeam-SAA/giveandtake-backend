import { Job } from "../models/job.model";

/**
 * Keeps legacy approval fields aligned for clients that still consume either
 * field. Safe to run on every boot: only inconsistent admin-approved jobs are
 * updated.
 */
export const ensureJobApprovalConsistency = async (): Promise<void> => {
  const result = await Job.updateMany(
    {
      adminApprove: true,
      jobApprove: { $ne: "approved" },
    },
    {
      $set: { jobApprove: "approved" },
    },
    { timestamps: false }
  );

  if (result.modifiedCount > 0) {
    console.log(
      `[jobs] synchronized approval state for ${result.modifiedCount} job(s)`
    );
  }
};

export default ensureJobApprovalConsistency;
