import { Request, Response } from "express";
import catchAsync from "../utils/catchAsync";
import { JobCategory } from "../models/jobCategory.model";
import sendResponse from "../utils/sendResponse";
import httpStatus from "http-status";
import { uploadToCloudinary, deleteFromCloudinary } from "../utils/cloudinary";
import AppError from "../errors/AppError";
import { buildMetaPagination, getPaginationParams } from "../utils/pagination";

// create category
export const createJobCategory = catchAsync(
  async (req: Request, res: Response) => {
    const { name, role } = req.body;
    if (!name) {
      throw new AppError(httpStatus.BAD_REQUEST, "Please fill in all fields");
    }

    let categoryIcon = "";
    if (req.file) {
      const result = await uploadToCloudinary(req.file.path);

      if (!result) {
        throw new AppError(
          httpStatus.INTERNAL_SERVER_ERROR,
          "Failed to upload image"
        );
      }

      categoryIcon = result.secure_url;
    }

    const category = await JobCategory.create({
      name,
      categoryIcon,
      role: JSON.parse(role || "{}"),
    });

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "Job category created successfully",
      data: category,
    });
  }
);

// get all categories
export const getAllCategorys = catchAsync(
  async (req: Request, res: Response) => {
    const { page, limit, skip } = getPaginationParams(req.query);
    const search = req.query.search ? String(req.query.search) : ''

    // Build search filter
    let filter: any = {};
    if (search) {
      filter = {
        $or: [
          { name: { $regex: search, $options: "i" } }, // case-insensitive search for name
          { role: { $in: [new RegExp(search, "i")] } }, // search inside role array
        ],
      };
    }

    // Fetch categories
    const category = await JobCategory.find(filter)
      .sort({ createdAt: -1 })

    // Count total for pagination
    const total = await JobCategory.countDocuments(filter);

    const meta = buildMetaPagination(total, page, limit);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Job categories fetched successfully",
      data: { category, meta },
    });
  }
);

// get all categorys
export const getSingleCategorys = catchAsync(
  async (req: Request, res: Response) => {
    const {id} = req.params
    const category = await JobCategory.findById(id);
    console.log("first");

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Job category fetched successfully",
      data: category,
    });
  }
);

// updateJobCategory
export const updateJobCategory = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, role } = req.body;

    const category = await JobCategory.findById(id);
    if (!category) {
      throw new AppError(httpStatus.NOT_FOUND, "Job category not found");
    }

    let newIcon = category.categoryIcon;

    if (req.file) {
      const result = await uploadToCloudinary(req.file.path);
      if (!result) {
        throw new AppError(
          httpStatus.INTERNAL_SERVER_ERROR,
          "Failed to upload image"
        );
      }
      await deleteFromCloudinary(category.categoryIcon);

      newIcon = result.secure_url;
    }

    category.name = name;
    category.categoryIcon = newIcon;
    category.role = JSON.parse(role);
    await category.save();

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Job category updated successfully",
      data: category,
    });
  }
);

// delete category
export const deleteJobCategory = catchAsync(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const category = await JobCategory.findById(id);
    if (!category) {
      throw new AppError(httpStatus.NOT_FOUND, "Category not found");
    }

    // Delete icon from Cloudinary
    const publicId = category.categoryIcon?.split("/").pop()?.split(".")[0];
    if (publicId) {
      await deleteFromCloudinary(publicId);
    }

    await category.deleteOne();

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Category deleted successfully",
      data: null,
    });
  }
);
