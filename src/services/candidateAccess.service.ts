import { User } from '../models/user.model';
import { Job } from '../models/job.model';
import { Company } from '../models/company.model';
import AppError from '../errors/AppError';

export const visibleAccountFilter = {
  deactivate: { $ne: true },
  deletionInProgress: { $ne: true },
};

export const assertVisibleAccount = async (userId: unknown) => {
  if (!await User.exists({ _id: userId, ...visibleAccountFilter })) {
    throw new AppError(404, 'Candidate not found');
  }
};

export const assertCanManageJob = async (jobId: unknown, actor: any) => {
  const job = await Job.findById(jobId);
  if (!job) throw new AppError(404, 'Job not found');
  if (actor && (['admin', 'super-admin'].includes(actor.role) ||
      String(job.userId) === String(actor._id))) return;
  if (actor && job.companyId && await Company.exists({
    _id: job.companyId,
    $or: [{ userId: actor._id }, { employeesId: actor._id }],
  })) return;
  throw new AppError(403, 'You cannot manage applications for this job');
};
