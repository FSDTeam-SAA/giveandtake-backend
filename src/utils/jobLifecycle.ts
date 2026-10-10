import AppError from "../errors/AppError";

export type JobDisplayStatus = "archived" | "expired" | "denied" | "pending" | "scheduled" | "published";

export function getJobDisplayStatus(job: any, now = new Date()): JobDisplayStatus {
  if (job.arcrivedJob) return "archived";
  const deadline = job.deadline ?? job.expiryDate;
  if (deadline && new Date(deadline).getTime() <= now.getTime()) return "expired";
  if (job.jobApprove === "denied") return "denied";
  if (job.adminApprove !== true || job.jobApprove !== "approved") return "pending";
  if (job.publishDate && new Date(job.publishDate).getTime() > now.getTime()) return "scheduled";
  return "published";
}

export function getJobAvailability(job: any, now = new Date()) {
  const displayStatus = getJobDisplayStatus(job, now);
  const deadline = job.deadline ?? job.expiryDate;
  const validDeadline = !deadline || Number.isFinite(new Date(deadline).getTime());
  const canApply = displayStatus === "published" && job.status !== "deactivate" && validDeadline;
  const applicationClosedReason = canApply ? null : displayStatus === "expired"
    ? "This job has expired and is no longer accepting applications."
    : displayStatus === "scheduled"
    ? "Applications for this job are not open yet."
    : "This job is not currently accepting applications.";
  return { displayStatus, canApply, applicationClosedReason };
}

export function assertJobAcceptsApplications(job: any, now = new Date()) {
  const availability = getJobAvailability(job, now);
  if (!availability.canApply) {
    throw new AppError(403, availability.applicationClosedReason!);
  }
}

// Keep public listings consistent with application availability, including legacy expiryDate-only jobs.
export function buildLiveJobFilter(now = new Date()) {
  return {
    arcrivedJob: false,
    status: { $ne: "deactivate" },
    jobApprove: "approved",
    adminApprove: true,
    $and: [
      { $or: [{ publishDate: null }, { publishDate: { $lte: now } }] },
      { $or: [
        { deadline: { $gt: now } },
        { $and: [
          { deadline: null },
          { $or: [{ expiryDate: null }, { expiryDate: { $gt: now } }] },
        ] },
      ] },
    ] as any[],
  };
}

// Only submitted dates are updated. Older clients may submit both expiry aliases
// and a duration; explicit dates take priority over that legacy duration.
export function resolveJobDatePatch(job: any, body: Record<string, unknown>, now = new Date()) {
  const patch: { publishDate?: Date; deadline?: Date; expiryDate?: Date } = {};
  const parse = (value: unknown, field: string): Date => {
    if (typeof value !== "string" && !(value instanceof Date)) {
      throw new AppError(400, `${field} must be a valid date.`);
    }
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new AppError(400, `${field} must be a valid date.`);
    return date;
  };
  if (Object.prototype.hasOwnProperty.call(body, "publishDate")) {
    patch.publishDate = parse(body.publishDate, "publishDate");
  }
  const explicit = ["deadline", "expiryDate", "expiaryDate"]
    .filter(field => Object.prototype.hasOwnProperty.call(body, field))
    .map(field => parse(body[field], field));
  if (explicit.some(date => date.getTime() !== explicit[0].getTime())) {
    throw new AppError(400, "Expiry dates conflict. Please submit one expiry date.");
  }
  let deadline = explicit[0];
  if (!deadline && body.expirationDate !== undefined && body.expirationDate !== "") {
    const days = Number(body.expirationDate);
    if (!Number.isSafeInteger(days) || days <= 0) {
      throw new AppError(400, "Expiration period must be a positive whole number of days.");
    }
    deadline = parse(patch.publishDate ?? job.publishDate ?? job.createdAt ?? now, "publishDate");
    deadline.setUTCDate(deadline.getUTCDate() + days);
    if (!Number.isFinite(deadline.getTime())) throw new AppError(400, "Expiration period is too large.");
  }
  const previousDeadline = job.deadline ?? job.expiryDate;
  const deadlineChanged = deadline && (!previousDeadline || deadline.getTime() !== new Date(previousDeadline).getTime());
  const publishChanged = patch.publishDate && (!job.publishDate || patch.publishDate.getTime() !== new Date(job.publishDate).getTime());
  const effectiveDeadline = deadline ?? (previousDeadline ? new Date(previousDeadline) : undefined);
  const effectivePublishDate = patch.publishDate ?? (job.publishDate ? new Date(job.publishDate) : undefined);
  if (deadlineChanged && deadline!.getTime() <= now.getTime()) {
    throw new AppError(400, "The new expiry date must be in the future.");
  }
  if ((deadlineChanged || publishChanged) && effectiveDeadline && effectivePublishDate && effectiveDeadline <= effectivePublishDate) {
    throw new AppError(400, "Expiry must be after the publication date.");
  }
  if (body.extendExpiry === true) {
    if (!deadlineChanged || (previousDeadline && deadline!.getTime() <= new Date(previousDeadline).getTime())) {
      throw new AppError(400, "Choose an expiry date later than the current expiry.");
    }
    if (publishChanged) throw new AppError(400, "Extending expiry must preserve the publication date.");
  }
  if (deadline) {
    patch.deadline = deadline;
    patch.expiryDate = deadline;
  }
  return patch;
}
