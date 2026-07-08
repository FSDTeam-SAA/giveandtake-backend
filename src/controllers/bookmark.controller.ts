import { Request, Response } from "express";
import catchAsync from "../utils/catchAsync";
import { Bookmark } from "../models/bookmark.model";
import sendResponse from "../utils/sendResponse";
import httpStatus from "http-status";
import AppError from "../errors/AppError";
import { buildMetaPagination, getPaginationParams } from "../utils/pagination";

/***********************
 * CREATE BOOKMARK
 ***********************/
export const createBookmark = catchAsync(
  async (req: Request, res: Response) => {
    const { userId, jobId, bookmarked } = req.body;

    const existing = await Bookmark.findOne({ userId, jobId });
    if (existing)
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Job already bookmarked by user"
      );

    const bookmark = await Bookmark.create({ userId, jobId, bookmarked });

    sendResponse(res, {
      statusCode: 201,
      success: true,
      message: "Bookmark created successfully",
      data: bookmark,
    });
  }
);

export const updateBookmarked = catchAsync(async (req, res) => {
  const { bookmarked, userId, jobId } = req.body;

  let update = await Bookmark.findOneAndUpdate(
    { userId: userId, jobId: jobId },
    { bookmarked },
    { new: true }
  );
  if (!update) {
    update = await Bookmark.create({ userId, jobId, bookmarked });
  }
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message:
      bookmarked === true ? "Bookmarked successfully" : "Bookmark removed",
    data: update,
  });
});

/***********************
 * GET ALL BY USER ID
 ***********************/
export const getBookmarksByUser = catchAsync(
  async (req: Request, res: Response) => {
    const { userId } = req.params;

    // GET QUERYES FOR PAGINATION
    const { page, limit, skip } = getPaginationParams(req.query);

    const bookmarks = await Bookmark.find({ userId })
      .sort({ createdAt: -1 })
      .populate({
        path: 'jobId',
        populate: [
          { path: 'companyId' },
          { path: 'recruiterId' },
        ],
      })
      .skip(skip)
      .limit(limit);

    // TOTAL COUNT
    const totalItems = await Bookmark.countDocuments({ userId });

    // BUILD META DATA
    const meta = buildMetaPagination(totalItems, page, limit);

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Bookmarks fetched successfully",
      data: { bookmarks, meta },
    });
  }
);
