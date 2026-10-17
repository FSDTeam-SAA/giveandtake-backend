import { isValidObjectId } from "mongoose";
import AppError from "../errors/AppError";
import catchAsync from "../utils/catchAsync";
import sendResponse from "../utils/sendResponse";
import { Qualification } from "../models/qualification.model";
import { qualificationKey } from "../utils/qualificationDefaults";

export const listQualifications = (includeInactive = true) => catchAsync(async (_req, res) => {
  const data = await Qualification.find(includeInactive ? {} : { active: true })
    .sort({ order: 1, createdAt: 1, _id: 1 });
  res.setHeader("Cache-Control", "no-store");
  sendResponse(res, { statusCode: 200, success: true, message: "Qualifications fetched", data });
});

export const saveQualification = catchAsync(async (req, res) => {
  const { label, active } = req.body;
  if (typeof label !== "string" || !label.trim() || label.trim().length > 100 || !qualificationKey(label)) {
    throw new AppError(400, "Qualification must contain 1 to 100 characters.");
  }
  if (active !== undefined && typeof active !== "boolean") {
    throw new AppError(400, "Active must be true or false.");
  }
  const id = req.params.id;
  if (id && !isValidObjectId(id)) throw new AppError(400, "Invalid qualification ID.");
  const fields = { label: label.trim(), key: qualificationKey(label), ...(active === undefined ? {} : { active }) };
  try {
    const data = id
      ? await Qualification.findByIdAndUpdate(id, { $set: fields }, { new: true, runValidators: true })
      : await Qualification.create({ ...fields, value: label.trim() });
    if (!data) throw new AppError(404, "Qualification not found.");
    sendResponse(res, { statusCode: id ? 200 : 201, success: true, message: "Qualification saved", data });
  } catch (error: any) {
    if (error.code === 11000) throw new AppError(409, "This qualification already exists. Edit the existing entry instead.");
    throw error;
  }
});
