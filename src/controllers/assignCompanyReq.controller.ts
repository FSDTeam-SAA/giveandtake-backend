import mongoose from "mongoose";
import AppError from "../errors/AppError";
import { ReqCompany } from "../models/assignCompanyReq.model";
import { Company } from "../models/company.model";
import { RecruiterAccount } from "../models/recruiterAccount.model";
import catchAsync from "../utils/catchAsync";
import sendResponse from "../utils/sendResponse";
import { createNotification } from "../sockets/notification.service";
import { assertOwner } from "../utils/authz";

const findCompanyByIdentifier = async (companyId: string) => {
  let company = null;

  if (mongoose.Types.ObjectId.isValid(companyId)) {
    company = await Company.findById(companyId);
  }

  if (!company) {
    company = await Company.findOne({ userId: companyId });
  }

  return company;
};

export const employeeReq = catchAsync(async (req, res) => {
  const { companyId } = req.body;
  const company = await Company.findById(companyId);
  if (!company) {
    throw new AppError(404, "Company not Found");
  }

  const userId = req.user?._id;

  const pendingReq = await ReqCompany.findOne({
    company: companyId,
    userId,
    status: "pending",
  });

  if (pendingReq) {
    throw new AppError(400, "You already have a pending request for this company");
  }

  const acceptedReq = await ReqCompany.findOne({
    company: companyId,
    userId,
    status: "accepted",
  });

  if (acceptedReq) {
    const isStillMember = company.employeesId?.some(
      (id) => id?.toString() === userId?.toString()
    );
    if (isStillMember) {
      throw new AppError(400, "You have already been accepted into this company");
    }

    const updatedReq = await ReqCompany.findByIdAndUpdate(
      acceptedReq._id,
      { status: "pending" },
      { new: true }
    );

    await createNotification({
      to: company.userId as any,
      message: `Recruiter connection request received`,
      type: "req_application",
      id: updatedReq?._id as any,
    });

    return sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Request submitted successfully",
      data: updatedReq,
    });
  }

  const reqCom = await ReqCompany.create({
    userId: userId,
    company: companyId,
  });
  await createNotification({
    to: company.userId as any,
    message: `Recruiter connection request received`,
    type: "req_application",
    id: reqCom._id,
  });

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Request submitted successfully",
    data: reqCom,
  });
});

export const UpdateEmployeeReq = catchAsync(async (req, res) => {
  const id = req.params.id;
  const { companyId, userId, status } = req.body;

  console.log(companyId, userId, status);
  const check = await ReqCompany.findById(id);
  if (!check) {
    throw new AppError(400, "Request not found");
  }

  // Authorize against the company referenced by the request itself, never the
  // client-supplied companyId. Only the company owner (or an admin) may
  // approve/reject employee requests.
  const requestCompany = await Company.findById(check.company);
  if (!requestCompany) {
    throw new AppError(404, "Company not found");
  }
  assertOwner(req, requestCompany.userId);

  if (status === "accepted") {
    if (!companyId || !mongoose.Types.ObjectId.isValid(userId)) {
      throw new AppError(400, "Invalid companyId or userId");
    }

    const company = requestCompany;

    await Company.findByIdAndUpdate(
      { _id: company._id },
      { $addToSet: { employeesId: userId } }, // avoids duplicates
      { new: true }
    );

    await RecruiterAccount.findOneAndUpdate(
      { userId: userId },
      { companyId: company._id }, // avoids duplicates
      { new: true }
    );

    await createNotification({
      to: userId as any,
      message: `You are now connected to ${company?.cname}`,
      type: "req_application",
      id: id as any,
    });
  }
  const reqCom = await ReqCompany.findByIdAndUpdate(
    id,
    {
      status: status,
    },
    { new: true }
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Request updated successfully",
    data: reqCom,
  });
});

export const companyEmployeeAdd = catchAsync(async (req, res) => {
  const { employeeIds, companyId } = req.body;

  const employeesList = Array.isArray(employeeIds)
    ? employeeIds.filter(Boolean)
    : employeeIds
    ? [employeeIds]
    : [];

  if (!companyId || employeesList.length === 0) {
    throw new AppError(400, "companyId and at least one employeeId are required");
  }

  const invalidId = employeesList.find((id: string) => !mongoose.Types.ObjectId.isValid(id));
  if (invalidId) {
    throw new AppError(400, "Invalid employeeId provided");
  }

  const company = await findCompanyByIdentifier(companyId);
  if (!company) {
    throw new AppError(404, "Company not found");
  }

  // Only the company owner (or an admin) may add employees to the company.
  assertOwner(req, company.userId);

  const employeeObjectIds = employeesList.map(
    (id: string) => new mongoose.Types.ObjectId(id)
  );

  const updatedCompany = await Company.findByIdAndUpdate(
    company._id,
    { $addToSet: { employeesId: { $each: employeeObjectIds } } },
    { new: true }
  );

  await RecruiterAccount.updateMany(
    { userId: { $in: employeeObjectIds } },
    { $set: { companyId: company._id } }
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Employee added to the company",
    data: updatedCompany,
  });
});

export const companyEmployeeRemove = catchAsync(async (req, res) => {
  const { employeeId, companyId } = req.body;

  console.log(companyId, employeeId);

  if (!employeeId || !companyId) {
    throw new AppError(400, "employeeId and companyId are required");
  }

  if (!mongoose.Types.ObjectId.isValid(employeeId)) {
    throw new AppError(400, "Invalid employeeId provided");
  }

  const company = await findCompanyByIdentifier(companyId);

  if (!company) {
    throw new AppError(404, "Company not found");
  }

  // Only the company owner (or an admin) may remove employees from the company.
  assertOwner(req, company.userId);

  const employeeObjectId = new mongoose.Types.ObjectId(employeeId);

  const updatedCompany = await Company.findByIdAndUpdate(
    company._id,
    { $pull: { employeesId: employeeObjectId } }, // remove employeeId
    { new: true }
  );

  await RecruiterAccount.findOneAndUpdate(
    { userId: employeeObjectId, companyId: company._id },
    { $set: { companyId: null } },
    { new: true }
  );

  await ReqCompany.updateMany(
    { company: company._id, userId: employeeObjectId },
    { $set: { status: "rejected" } }
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Employee removed from the company",
    data: updatedCompany,
  });
});

export const recruiterLeaveCompany = catchAsync(async (req, res) => {
  const recruiterId = req.user?._id;
  const { companyId } = req.body || {};

  if (!recruiterId) {
    throw new AppError(401, "Unauthorized");
  }

  if (!mongoose.Types.ObjectId.isValid(recruiterId)) {
    throw new AppError(400, "Invalid recruiter id");
  }

  let company = null;

  if (companyId) {
    company = await findCompanyByIdentifier(companyId);
  }

  if (!company) {
    company = await Company.findOne({ employeesId: recruiterId });
  }

  if (!company) {
    throw new AppError(404, "Company not found for this recruiter");
  }

  const updatedCompany = await Company.findByIdAndUpdate(
    company._id,
    { $pull: { employeesId: recruiterId } },
    { new: true }
  );

  await RecruiterAccount.findOneAndUpdate(
    { userId: recruiterId, companyId: company._id },
    { $set: { companyId: null } },
    { new: true }
  );

  await ReqCompany.updateMany(
    { company: company._id, userId: recruiterId },
    { $set: { status: "rejected" } }
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "You have left the company",
    data: updatedCompany,
  });
});
