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
  let banner = null
  // if (req.file) {
  //   const cloudinaryResult = await uploadToCloudinary(req.file.path)
  //   if (cloudinaryResult) {
  //     uploadFileUrl = cloudinaryResult.secure_url
  //   }
  // }

      const files = req.files as Record<string, Express.Multer.File[]>;

    if (files?.photo) {
      const logoRes = await uploadToCloudinary(files.photo[0].path);
      if (logoRes?.secure_url) {
        uploadFileUrl = logoRes.secure_url;
      }
    }

        if (files?.banner) {
      const certRes = await uploadToCloudinary(files.banner[0].path);
      if (certRes?.secure_url) {
        banner = certRes.secure_url;
      }
    }
  const resumeDoc = await CreateResume.create({
    ...resume,
    userId,
    photo: uploadFileUrl,
    banner
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



/*********************
 * GET A USER RESUME *
 *********************/
export const resumeOfaUser1 = catchAsync(async (req: Request, res: Response) => {
  const userId = req.params.userId

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


  const resume = JSON.parse(req.body.resume || '{}')
  const experiences = JSON.parse(req.body.experiences || '[]')
  const educationList = JSON.parse(req.body.educationList || '[]')
  const awardsAndHonors = JSON.parse(req.body.awardsAndHonors || '[]')
  
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
  // const [updatedExperiences, updatedEducation, updatedAwards] =
  //   await Promise.all([
  //     experiences.length
  //       ? Experience.insertMany(
  //           experiences.map((exp: any) => ({ ...exp, userId }))
  //         )
  //       : Promise.resolve([]),
  //     educationList.length
  //       ? Education.insertMany(
  //           educationList.map((edu: any) => ({ ...edu, userId }))
  //         )
  //       : Promise.resolve([]),
  //     awardsAndHonors.length
  //       ? AwardsAndHonor.insertMany(
  //           awardsAndHonors.map((honor: any) => ({ ...honor, userId }))
  //         )
  //       : Promise.resolve([]),
  //   ])

  const [updatedExperiences, updatedEducation, updatedAwards] = await Promise.all([
  // 🔹 Experiences
  Promise.all(
    experiences.map(async (exp: any) => {
      if (exp.type === "create") {
        return await Experience.create({ ...exp, userId });
      }
      if (exp.type === "update" && exp._id) {
        return await Experience.findByIdAndUpdate(
          exp._id,
          { ...exp, userId },
          { new: true }
        );
      }
      if (exp.type === "delete" && exp._id) {
        return await Experience.findByIdAndDelete(exp._id);
      }
      return null;
    })
  ),

  // 🔹 Education
  Promise.all(
    educationList.map(async (edu: any) => {
      if (edu.type === "create") {
        return await Education.create({ ...edu, userId });
      }
      if (edu.type === "update" && edu._id) {
        return await Education.findByIdAndUpdate(
          edu._id,
          { ...edu, userId },
          { new: true }
        );
      }
      if (edu.type === "delete" && edu._id) {
        return await Education.findByIdAndDelete(edu._id);
      }
      return null;
    })
  ),

  // 🔹 Awards & Honors
  Promise.all(
    awardsAndHonors.map(async (honor: any) => {
      if (honor.type === "create") {
        return await AwardsAndHonor.create({ ...honor, userId });
      }
      if (honor.type === "update" && honor._id) {
        return await AwardsAndHonor.findByIdAndUpdate(
          honor._id,
          { ...honor, userId },
          { new: true }
        );
      }
      if (honor.type === "delete" && honor._id) {
        return await AwardsAndHonor.findByIdAndDelete(honor._id);
      }
      return null;
    })
  ),
]);

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
