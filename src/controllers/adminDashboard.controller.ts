import { Request, Response } from "express";
import { User } from "../models/user.model";
import { paymentInfo } from "../models/paymentInfo.model";
import catchAsync from "../utils/catchAsync";
import sendResponse from "../utils/sendResponse";
import moment from "moment";

/****************************************************
 * API FOR TOTAL USER TOTAL RECRUITER, TOTAL AMOUNT *
 ****************************************************/
export const getAdminDashboardStats = catchAsync(
  async (req: Request, res: Response) => {
    const totalCandidates = await User.countDocuments({ role: "candidate" });
    const totalRecruiters = await User.countDocuments({ role: "recruiter" });
    const totalCompany = await User.countDocuments({ role: "company" });

    const totalAmountData = await paymentInfo.aggregate([
      { $match: { paymentStatus: "complete" } },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$amount" },
        },
      },
    ]);

    const totalAmount = totalAmountData[0]?.totalAmount || 0;

    // === Monthly Aggregation ===
    const monthlyBarData = await paymentInfo.aggregate([
      { $match: { paymentStatus: "complete" } },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          totalAmount: { $sum: "$amount" },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    const monthlyDataFormatted = monthlyBarData.map((item) => {
      const monthName = moment()
        .month(item._id.month - 1)
        .format("MMMM");
      return {
        year: item._id.year,
        month: monthName,
        totalAmount: item.totalAmount,
      };
    });

    // === Yearly Aggregation ===
    const yearlyBarData = await paymentInfo.aggregate([
      { $match: { paymentStatus: "complete" } },
      {
        $group: {
          _id: { year: { $year: "$createdAt" } },
          totalAmount: { $sum: "$amount" },
        },
      },
      { $sort: { "_id.year": 1 } },
    ]);

    const yearlyDataFormatted = yearlyBarData.map((item) => ({
      year: item._id.year,
      totalAmount: item.totalAmount,
    }));

    sendResponse(res, {
      statusCode: 200,
      success: true,
      message: "Admin dashboard stats with chart data fetched successfully",
      data: {
        totalCandidates,
        totalRecruiters,
        totalCompany,
        totalAmount,
        charts: {
          monthly: monthlyDataFormatted,
          yearly: yearlyDataFormatted,
        },
      },
    });
  }
);
