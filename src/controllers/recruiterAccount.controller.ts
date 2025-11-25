import { Request, Response } from 'express'
import httpStatus from 'http-status'
import catchAsync from '../utils/catchAsync'
import AppError from '../errors/AppError'
import { RecruiterAccount } from '../models/recruiterAccount.model'
import sendResponse from '../utils/sendResponse'
import { uploadToCloudinary } from '../utils/cloudinary'
import { User } from '../models/user.model'
import { ReqCompany } from '../models/assignCompanyReq.model'
import mongoose, { Schema } from 'mongoose'
import { ElevatorPitch } from '../models/elevatorPitch.model'

/****************************
 * CREATE RECRUITER ACCOUNT *
 ****************************/
export const createRecruiterAccount = catchAsync(
  async (req: Request, res: Response) => {
    const { userId, ...rest } = req.body

    const user = await User.findById(userId);
    if (!user) {
      throw new AppError(400, "User not found")
    }

    const existing = await RecruiterAccount.findOne({ userId })
    if (existing) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Account already exists for this user'
      )
    }

    let videoUrl = ''
    let photoUrl = ''
    let banner = ''

    // @ts-ignore
    const files = req.files as { [fieldname: string]: Express.Multer.File[] }

    if (files?.videoFile?.[0]) {
      const uploaded = await uploadToCloudinary(files.videoFile[0].path)
      if (uploaded) videoUrl = uploaded.secure_url
    }

    if (files?.photo?.[0]) {
      const uploaded = await uploadToCloudinary(files.photo[0].path)
      if (uploaded) {
        photoUrl = uploaded.secure_url

        if (!user.avatar) {
          user.avatar = { url: "" }; // initialize if missing
        }
        user.avatar.url = uploaded.secure_url || "";
        await user?.save()


      }
    }

    if (files?.banner?.[0]?.path) {
      const certRes = await uploadToCloudinary(files.banner[0].path);
      if (certRes?.secure_url) {
        banner = certRes.secure_url;
      }
    }
    const { companyId, ...saferest } = rest;
    if (companyId) {
      const reqCom = await ReqCompany.findOneAndUpdate(
        { userId, company: companyId }, // match condition
        { $setOnInsert: { userId, company: new mongoose.Types.ObjectId(companyId) } }, // insert only if not exists
        { upsert: true, new: true } // create if not exists, return the doc
      );
    }
    if (saferest.firstName || saferest.sureName) {
      user.name = `${saferest.firstName} ${saferest.sureName}`
    }
    await user.save();
    const recruiterAccount = await RecruiterAccount.create({
      slug: user.slug,
      userId,
      videoFile: videoUrl,
      photo: photoUrl,
      banner,
      ...saferest,
    })

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: 'Recruiter account created successfully',
      data: recruiterAccount,
    })
  }
)

/************************************
 * GET RECRUITER ACCOUNT BY USER ID *
 ************************************/
export const getRecruiterAccountByUserId = catchAsync(
  async (req: Request, res: Response) => {
    const { userId } = req.params

    const account = await RecruiterAccount.findOne({ userId }).populate(
      'companyId',
      '-verificationInfo -password_reset_token -deactivate'
    )

    const userDoc = await User.findById(userId).select('slug deactivate');

    if (!account) {
      throw new AppError(httpStatus.NOT_FOUND, 'Recruiter account not found')
    }

    const pitch = await ElevatorPitch.findOne({ userId: userId })

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Recruiter account fetched successfully',
      data: {
        ...account.toObject(),
        elevatorPitch: pitch || null,
        slug: userDoc?.slug,
        deactivate: Boolean(userDoc?.deactivate),
      },
    })
  }
)

export const getRecruiterAccountByUserSlug = catchAsync(async (req: Request, res: Response) => {
  const { slug } = req.params

  const user = await User.findOne({ slug }).select('_id deactivate')
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found')
  }

  const userId = user._id

  const account = await RecruiterAccount.findOne({ userId }).populate(
    'companyId',
    '-verificationInfo -password_reset_token -deactivate'
  )

  if (!account) {
    throw new AppError(httpStatus.NOT_FOUND, 'Recruiter account not found')
  }

  const pitch = await ElevatorPitch.findOne({ userId })

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Recruiter account fetched successfully',
    data: {
      ...account.toObject(),
      elevatorPitch: pitch || null,
      deactivate: Boolean(user.deactivate),
    },
  })
})


/****************************
 * UPDATE RECRUITER ACCOUNT *
 ****************************/
export const updateRecruiterAccount = catchAsync(
  async (req: Request, res: Response) => {
    const { userId } = req.params
    const updates = { ...req.body }

    const user = await User.findById(userId);
    if (!user) {
      throw new AppError(400, "User not found")
    }

    // @ts-ignore
    const files = req.files as { [fieldname: string]: Express.Multer.File[] }

    const existingAccount = await RecruiterAccount.findOne({ userId })

    if (!existingAccount) {
      throw new AppError(httpStatus.NOT_FOUND, 'Recruiter account not found')
    }

    if (files?.videoFile) {
      const uploaded = await uploadToCloudinary(files.videoFile[0].path)
      if (uploaded) updates.videoFile = uploaded.secure_url
    }

    // // Handle new video upload
    if (files?.banner) {
      const uploadedVideo = await uploadToCloudinary(files?.banner[0]?.path)
      if (uploadedVideo?.secure_url) {
        updates.banner = uploadedVideo.secure_url
        // Optional: delete old video from Cloudinary if storing public_id
      }
    }

    // Handle new photo upload
    if (files?.photo) {
      const uploadedPhoto = await uploadToCloudinary(files?.photo[0]?.path)
      if (uploadedPhoto?.secure_url) {
        updates.photo = uploadedPhoto.secure_url
        // Optional: delete old photo from Cloudinary if storing public_id
        if (!user.avatar) {
          user.avatar = { url: "" }; // initialize if missing
        }
        user.avatar.url = uploadedPhoto.secure_url || "";
      }
    }
      if(updates.name){
    user.name = updates.name
  }
  await user?.save()

    const updatedAccount = await RecruiterAccount.findOneAndUpdate(
      { userId },
      updates,
      { new: true, runValidators: true }
    )

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Recruiter account updated successfully',
      data: updatedAccount,
    })
  }
)

/*******************************
 * * DELETE RECRUITER ACCOUNT *
 *******************************/
export const deleteRecruiterAccount = catchAsync(
  async (req: Request, res: Response) => {
    const { userId } = req.params

    const deleted = await RecruiterAccount.findOneAndDelete({ userId })

    if (!deleted) {
      throw new AppError(httpStatus.NOT_FOUND, 'Recruiter account not found')
    }

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Recruiter account deleted successfully',
      data: deleted,
    })
  }
)
