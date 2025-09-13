import AppError from "../errors/AppError";
import { ReqCompany } from "../models/assignCompanyReq.model";
import { Company } from "../models/company.model";
import catchAsync from "../utils/catchAsync";
import sendResponse from "../utils/sendResponse";

export const employeeReq = catchAsync(async (req, res) => {
    const { companyId } = req.body;

    const check = await ReqCompany.findOne({ company: companyId, userId: req.user?._id })
    if (check) {
        throw new AppError(400, "You are already Req for this Company")
    }
    const reqCom = await ReqCompany.create({
        userId: req.user?._id,
        company: companyId
    })

    sendResponse(res, {
        statusCode: 200,
        success: true,
        message: "Successfully requested",
        data: reqCom
    })
})

export const UpdateEmployeeReq = catchAsync(async (req, res) => {
    const id = req.params.id
    const { companyId, userId, status } = req.body;

    const check = await ReqCompany.findOne({ company: companyId, userId: userId })
    if (!check) {
        throw new AppError(400, "Not Found")
    }

    if (status === "accepted") {
        const company = await Company.findByIdAndUpdate(
            companyId,
            { $addToSet: { employeesId: userId } }, // avoids duplicates
            { new: true }
        );
    }
    const reqCom = await ReqCompany.findByIdAndUpdate(id, {
        status: status
    }, { new: true })

    sendResponse(res, {
        statusCode: 200,
        success: true,
        message: "Successfully request Update",
        data: reqCom
    })
})

export const companyEmployeeAdd = catchAsync(async (req, res) => {
    const { employeeIds, companyId } = req.body;

    const company = await Company.findByIdAndUpdate(
        companyId,
        { $addToSet: { employeesId: employeeIds } }, // avoids duplicates
        { new: true }
    );

    sendResponse(res,{
        statusCode: 200,
        success: true,
        message: "employee added to the company",
        data: company
    })
})