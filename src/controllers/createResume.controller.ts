import { Request, Response } from 'express'
import catchAsync from '../utils/catchAsync'
import httpStatus from 'http-status'
import AppError from '../errors/AppError'
import { CreateResume } from '../models/createResume.model'
import { Experience } from '../models/experience.model'
import { Education } from '../models/education.model'
import { AwardsAndHonor } from '../models/awardsAndHonor.model'
import { ElevatorPitch } from '../models/elevatorPitch.model'
import sendResponse from '../utils/sendResponse'
import { uploadToCloudinary } from '../utils/cloudinary'
import path from 'path'

/********************
 * CREATE RESUME *
 ********************/
export const createResume = catchAsync(async (req: Request, res: Response) => {

  const {userId} = req.body

  const resume = JSON.parse(req.body.resume || '{}')
  const experiences = JSON.parse(req.body.experiences || '[]')
  const educationList = JSON.parse(req.body.educationList || '[]')
  const awardsAndHonors = JSON.parse(req.body.awardsAndHonors || '[]')


  if (!userId) throw new AppError(httpStatus.BAD_REQUEST, 'User ID is required')

  // check if file was uplaod
  let uploadFileUrl = null
  if (req.file) {
    const cloudinaryResult = await uploadToCloudinary(req.file.path)
    if (cloudinaryResult) {
      uploadFileUrl = cloudinaryResult.secure_url
    }
  }
  const resumeDoc = await CreateResume.create({
    ...resume,
    userId,
    photo: uploadFileUrl,
  })

  const exparienceDocs = await Experience.insertMany(
    experiences.map((exp: any) => ({ ...exp, userId }))
  )

  const educationDocs = await Education.insertMany(
    educationList.map((edu: any) => ({ ...edu, userId }))
  )

  const awarenessDocs = await AwardsAndHonor.insertMany(
    awardsAndHonors.map((honor: any) => ({ ...honor, userId }))
  )
  res.status(httpStatus.CREATED).json({
    success: true,
    message: 'Resume created successfully',
    date: {
      resume: resumeDoc,
      experiences: exparienceDocs,
      education: educationDocs,
      awardsAndHonors: awarenessDocs,
    },
  })
})

/*********************
 * GET A USER RESUME *
 *********************/
export const resumeOfaUser = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?._id

  const resume = await CreateResume.findOne({ userId })
  const experiences = await Experience.find({ userId })
  const education = await Education.find({ userId })
  const awardsAndHonors = await AwardsAndHonor.find({ userId })
  const elevatorPitch = await ElevatorPitch.find({ userId })

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Resume fetched successfully',
    data: {
      resume,
      experiences,
      education,
      awardsAndHonors,
      elevatorPitch,
    },
  })
})

/*******************
 * UPDATE A RESUME *
 *******************/
export const updateResume = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?._id
  // const {
  //   resume,
  //   experiences = [],
  //   educationList = [],
  //   awardsAndHonors = [],
  // } = req.body


  const {
    resume = {},
    experiences = [],
    educationList = [],
    awardsAndHonors = [],
  } = req.body
  
  if (!userId) throw new AppError(httpStatus.BAD_REQUEST, 'User ID is required')

  // Upload new photo if provided
  if (req.file) {
    const cloudinaryResult = await uploadToCloudinary(req.file.path)
    if (cloudinaryResult) {
      resume.photo = cloudinaryResult.secure_url
    }
  }

  // Update or create the main resume document
  const updatedResume = await CreateResume.findOneAndUpdate(
    { userId },
    { ...resume, userId },
    { new: true, upsert: true }
  )

  // Delete old related documents
  await Promise.all([
    Experience.deleteMany({ userId }),
    Education.deleteMany({ userId }),
    AwardsAndHonor.deleteMany({ userId }),
  ])

  // Insert new related documents
  const [updatedExperiences, updatedEducation, updatedAwards] =
    await Promise.all([
      experiences.length
        ? Experience.insertMany(
            experiences.map((exp: any) => ({ ...exp, userId }))
          )
        : Promise.resolve([]),
      educationList.length
        ? Education.insertMany(
            educationList.map((edu: any) => ({ ...edu, userId }))
          )
        : Promise.resolve([]),
      awardsAndHonors.length
        ? AwardsAndHonor.insertMany(
            awardsAndHonors.map((honor: any) => ({ ...honor, userId }))
          )
        : Promise.resolve([]),
    ])

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Resume updated successfully',
    data: {
      resume: updatedResume,
      experiences: updatedExperiences,
      education: updatedEducation,
      awardsAndHonors: updatedAwards,
    },
  })
})

/*******************
 * DELETE A RESUME *
 *******************/
export const deleteResume = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?._id

  if (!userId) throw new AppError(httpStatus.BAD_REQUEST, 'User ID is required')

  await Promise.all([
    CreateResume.deleteOne({ userId }),
    Experience.deleteMany({ userId }),
    Education.deleteMany({ userId }),
    AwardsAndHonor.deleteMany({ userId }),
    ElevatorPitch.deleteMany({ userId }),
  ])

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Resume and all related data deleted successfully',
    data: null,
  })
})
