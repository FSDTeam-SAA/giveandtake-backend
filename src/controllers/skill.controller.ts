import { Request, Response } from "express";
import httpStatus from "http-status";
import { SkillModel } from "../models/skill.model";
import catchAsync from "../utils/catchAsync";
import sendResponse from "../utils/sendResponse";
import { uploadToCloudinary } from "../utils/cloudinary";
import AppError from "../errors/AppError";

// CREATE Skill
export const createSkill = catchAsync(async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name) {
    throw new AppError(httpStatus.BAD_REQUEST, "Please provide a skill name");
  }

  let categoryIcon = "";
//   if (req.file) {
//     const result = await uploadToCloudinary(req.file.path);

//     if (!result) {
//       throw new AppError(
//         httpStatus.INTERNAL_SERVER_ERROR,
//         "Failed to upload image"
//       );
//     }

//     categoryIcon = result.secure_url;
//   }

  const skill = await SkillModel.create({
    name,
    categoryIcon,
  });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Skill created successfully",
    data: skill,
  });
});

// GET All Skills
export const getAllSkills = catchAsync(async (req: Request, res: Response) => {
  const skills = await SkillModel.find().sort({ createdAt: -1 });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Skills fetched successfully",
    data: skills,
  });
});

// GET Single Skill
export const getSkillById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const skill = await SkillModel.findById(id);

  if (!skill) {
    throw new AppError(httpStatus.NOT_FOUND, "Skill not found");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Skill fetched successfully",
    data: skill,
  });
});

// UPDATE Skill
export const updateSkill = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name } = req.body;

  let updateData: any = {};
  if (name) updateData.name = name;

//   if (req.file) {
//     const result = await uploadToCloudinary(req.file.path);
//     if (!result) {
//       throw new AppError(
//         httpStatus.INTERNAL_SERVER_ERROR,
//         "Failed to upload image"
//       );
//     }
//     updateData.categoryIcon = result.secure_url;
//   }

  const updatedSkill = await SkillModel.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  });

  if (!updatedSkill) {
    throw new AppError(httpStatus.NOT_FOUND, "Skill not found");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Skill updated successfully",
    data: updatedSkill,
  });
});

// DELETE Skill
export const deleteSkill = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const skill = await SkillModel.findByIdAndDelete(id);

  if (!skill) {
    throw new AppError(httpStatus.NOT_FOUND, "Skill not found");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Skill deleted successfully",
    data: skill,
  });
});
