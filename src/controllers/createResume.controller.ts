import { Request, Response } from 'express'
import catchAsync from '../utils/catchAsync'
import httpStatus from 'http-status'
import AppError from '../errors/AppError'
import { CreateResume } from '../models/createResume.model'
import { Experience } from '../models/experience.model'
import { Education } from '../models/education.model'
import { AwardsAndHonor } from '../models/awardsAndHonor.model'

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
