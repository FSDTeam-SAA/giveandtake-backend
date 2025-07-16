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

/********************
 * CREATE RESUME *
 ********************/
export const createResume = catchAsync(async (req: Request, res: Response) => {
  const { userId, resume, experiences, educationList, awardsAndHonors } =
    req.body

  if (!userId) throw new AppError(httpStatus.BAD_REQUEST, 'User ID is required')

  const resumeDoc = await CreateResume.create({ ...resume, userId })

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
    const userId  = req.user?._id

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
    const { userId } = req.user?._id
    // const 
})