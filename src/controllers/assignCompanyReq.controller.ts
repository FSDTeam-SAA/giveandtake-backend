import mongoose from "mongoose";
import AppError from "../errors/AppError";
import { ReqCompany } from "../models/assignCompanyReq.model";
import { Company } from "../models/company.model";
import { RecruiterAccount } from "../models/recruiterAccount.model";
import catchAsync from "../utils/catchAsync";
import sendResponse from "../utils/sendResponse";
import { createNotification } from "../sockets/notification.service";

export const employeeReq = catchAsync(async (req, res) => {
  const { companyId } = req.body;
  const company = await Company.findById(companyId);
  if (!company) {
    throw new AppError(404, "Company not Found");
  }

  const check = await ReqCompany.findOne({
    company: companyId,
    userId: req.user?._id,
    status: "accepted",
  });

  if (check) {
    throw new AppError(400, "You have already been accepted into this company");
  }

  const reqCom = await ReqCompany.create({
    userId: req.user?._id,
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

  if (status === "accepted") {
    const company1 = await Company.findById(companyId);
    const company = await Company.findByIdAndUpdate(
      { _id: companyId },
      { $addToSet: { employeesId: userId } }, // avoids duplicates
      { new: true }
    );

    const recuirter = await RecruiterAccount.findOneAndUpdate(
      { userId: userId },
      { companyId: companyId }, // avoids duplicates
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

  const company = await Company.findOneAndUpdate(
    { userId: companyId },
    { $addToSet: { employeesId: employeeIds } }, // avoids duplicates
    { new: true }
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Employee added to the company",
    data: company,
  });
});

export const companyEmployeeRemove = catchAsync(async (req, res) => {
  const { employeeId, companyId } = req.body;

  console.log(companyId, employeeId);

  const company = await Company.findOneAndUpdate(
    { userId: new mongoose.Types.ObjectId(companyId) },
    { $pull: { employeesId: new mongoose.Types.ObjectId(employeeId) } }, // remove employeeId
    { new: true }
  );

  const employee = await RecruiterAccount.findByIdAndUpdate(
    employeeId,
    { companyId: null },
    { new: true }
  );

  if (!company) {
    throw new AppError(404, "Company not found");
  }

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Employee removed from the company",
    data: company,
  });
});
