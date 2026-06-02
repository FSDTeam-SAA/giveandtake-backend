import { Request, Response, NextFunction, RequestHandler } from "express";
import httpStatus from 'http-status'
import AppError from '../errors/AppError'
import { CreateResume } from '../models/createResume.model'
import { Experience } from '../models/experience.model'
import { Education } from '../models/education.model'
import { AwardsAndHonor } from '../models/awardsAndHonor.model'
import { ElevatorPitch } from '../models/elevatorPitch.model'
import { removeElevatorPitchArtifacts } from '../services/videoProcessing.queue'
import sendResponse from '../utils/sendResponse'
import { uploadToCloudinary } from '../utils/cloudinary'
import path from 'path'
import { User } from '../models/user.model'
import { asQueryString } from '../utils/authz'
import fs from 'fs'


type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<any>;

const catchAsync = (fn: AsyncRequestHandler): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Whitelist of resume fields a client is allowed to set/update.
// `userId`, `photo`, `banner` and `file` are derived server-side and must
// never be taken from the parsed client payload.
const RESUME_FIELDS = [
  "type",
  "aboutUs",
  "title",
  "firstName",
  "lastName",
  "sureName",
  "country",
  "city",
  "zipCode",
  "jobCategoryId",
  "email",
  "phoneNumber",
  "location",
  "certifications",
  "languages",
  "sLink",
  "skills",
  "immediatelyAvailable",
] as const;

const pickResumeFields = (input: any): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  if (!input || typeof input !== "object") return out;
  for (const key of RESUME_FIELDS) {
    if (input[key] !== undefined) out[key] = input[key];
  }
  return out;
};

// helper to move resume file to uploads/resumes
const moveFileToUploads = async (tempPath: string, destRelative: string): Promise<string> => {
  const uploadsDir = path.join(process.cwd(), "uploads");
  const finalPath = path.join(uploadsDir, destRelative);

  await fs.promises.mkdir(path.dirname(finalPath), { recursive: true });
  await fs.promises.rename(tempPath, finalPath);

  // return relative URL for frontend usage
  return "/" + destRelative.replace(/\\/g, "/");
};

export const createResume = catchAsync(async (req: Request, res: Response) => {
  // Always derive ownership from the authenticated token, never the body.
  const userId = req.user?._id;
  if (!userId) throw new AppError(httpStatus.UNAUTHORIZED, "Authentication required");

  const user = await User.findById(userId);
  if (!user) throw new AppError(httpStatus.BAD_REQUEST, "User not found");

  // parse JSON data
  const resume = JSON.parse(req.body.resume || "{}");
  const experiences = JSON.parse(req.body.experiences || "[]");
  const educationList = JSON.parse(req.body.educationList || "[]");
  const awardsAndHonors = JSON.parse(req.body.awardsAndHonors || "[]");

  const files = req.files as Record<string, Express.Multer.File[]> | undefined;

  let photoUrl: string | null = null;
  let bannerUrl: string | null = null;
  let resumeFileRelative: string | null = null;

  // handle photo
  if (files?.photo && files.photo[0]) {
    const logoRes = await uploadToCloudinary(files.photo[0].path);
    if (logoRes?.secure_url) {
      photoUrl = logoRes.secure_url;
      if (!user.avatar) user.avatar = { url: "" };
      user.avatar.url = photoUrl;
      
    }
    fs.unlinkSync(files.photo[0].path); // cleanup
  }

  // handle banner
  if (files?.banner && files.banner[0]) {
    const certRes = await uploadToCloudinary(files.banner[0].path);
    if (certRes?.secure_url) bannerUrl = certRes.secure_url;
    fs.unlinkSync(files.banner[0].path);
  }

  // handle resume file (local storage)
  if (files?.resume && files.resume[0]) {
    const resumeFile = files.resume[0];
    const safeName = `${Date.now()}-${resumeFile.originalname.replace(/\s+/g, "_")}`;
    const destRelative = path.posix.join("resumes", safeName);
    resumeFileRelative = await moveFileToUploads(resumeFile.path, destRelative);
  }
  if(resume.firstName){
    user.name = `${resume.firstName} ${resume.lastName}`
  }
  await user.save();

  // save main resume doc — only whitelisted fields, ownership from token
  const resumeDoc = await CreateResume.create({
    ...pickResumeFields(resume),
    userId,
    photo: photoUrl,
    banner: bannerUrl,
    file: resumeFileRelative
      ? [{ filename: path.basename(resumeFileRelative), url: resumeFileRelative, uploadedAt: new Date() }]
      : [],
  });

  // save related docs (force userId from token, drop any client-supplied userId/_id)
  const experienceDocs = experiences.length
    ? await Experience.insertMany(experiences.map((exp: any) => ({ ...exp, _id: undefined, userId })))
    : [];

  const educationDocs = educationList.length
    ? await Education.insertMany(educationList.map((edu: any) => ({ ...edu, _id: undefined, userId })))
    : [];

  const awarenessDocs = awardsAndHonors.length
    ? await AwardsAndHonor.insertMany(awardsAndHonors.map((honor: any) => ({ ...honor, _id: undefined, userId })))
    : [];

  return res.status(httpStatus.CREATED).json({
    success: true,
    message: "Resume created successfully",
    data: {
      resume: resumeDoc,
      experiences: experienceDocs,
      education: educationDocs,
      awardsAndHonors: awarenessDocs,
    },
  });
});


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
  const { slug } = req.params

  // Step 1: Find user by slug
  const user = await User.findOne({ slug }).select('_id deactivate')
  if (!user) {
    return res.status(httpStatus.NOT_FOUND).json({
      success: false,
      message: 'User not found',
    })
  }

  const userId = user._id

  // Step 2: Fetch related resources using userId
  const [resume, experiences, education, awardsAndHonors, elevatorPitch] = await Promise.all([
    CreateResume.findOne({ userId }),
    Experience.find({ userId }),
    Education.find({ userId }),
    AwardsAndHonor.find({ userId }),
    ElevatorPitch.find({ userId }),
  ])

  // Step 3: Send unified response
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Resume fetched successfully',
    data: {
      deactivate: Boolean(user.deactivate),
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

  const user = await User.findById(userId);
  if (!user) {
    throw new AppError(400, "User not found")
  }
  const resume = JSON.parse(req.body.resume || '{}')
  const experiences = JSON.parse(req.body.experiences || '[]')
  const educationList = JSON.parse(req.body.educationList || '[]')
  const awardsAndHonors = JSON.parse(req.body.awardsAndHonors || '[]')

  if (!userId) throw new AppError(httpStatus.BAD_REQUEST, 'User ID is required')

  // // Upload new photo if provided
  // if (req.file) {
  //   const cloudinaryResult = await uploadToCloudinary(req.file.path)
  //   if (cloudinaryResult) {
  //     resume.photo = cloudinaryResult.secure_url
  //   }
  // }


  const files = req.files as Record<string, Express.Multer.File[]>;

  if (files?.photo) {
    const logoRes = await uploadToCloudinary(files.photo[0].path);
    if (logoRes?.secure_url) {
      resume.photo = logoRes.secure_url;
      if (!user.avatar) {
        user.avatar = { url: "" }; // initialize if missing
      }
      user.avatar.url = logoRes.secure_url || "";
      
    }
  }
    if(resume.firstName){
    user.name = `${resume.firstName} ${resume.lastName}`
  }
  await user?.save()

  if (files?.banner) {
    const certRes = await uploadToCloudinary(files.banner[0].path);
    if (certRes?.secure_url) {
      resume.banner = certRes.secure_url;
    }
  }

  // Update or create the main resume document.
  // Whitelist fields; force userId from token (server-derived photo/banner kept).
  const resumeUpdate: Record<string, unknown> = pickResumeFields(resume);
  if (resume.photo !== undefined) resumeUpdate.photo = resume.photo;
  if (resume.banner !== undefined) resumeUpdate.banner = resume.banner;
  const updatedResume = await CreateResume.findOneAndUpdate(
    { userId },
    { ...resumeUpdate, userId },
    { new: true, upsert: true }
  )

  // // Delete old related documents
  // await Promise.all([
  //   Experience.deleteMany({ userId }),
  //   Education.deleteMany({ userId }),
  //   AwardsAndHonor.deleteMany({ userId }),
  // ])

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

  // Strip client-supplied ownership/identity keys from a sub-doc payload so the
  // mutation cannot reassign a record to (or away from) the authenticated user.
  const sanitizeSubDoc = (input: any): Record<string, unknown> => {
    const { _id, userId: _ignoredUserId, type, ...rest } = input ?? {};
    return rest;
  };

  const [updatedExperiences, updatedEducation, updatedAwards] = await Promise.all([
    // 🔹 Experiences
    Promise.all(
      experiences.map(async (exp: any) => {
        if (exp.type === "create") {
          return await Experience.create({ ...sanitizeSubDoc(exp), userId });
        }
        if (exp.type === "update" && exp._id) {
          // Scope by owner so an attacker cannot edit another user's sub-doc by _id.
          return await Experience.findOneAndUpdate(
            { _id: asQueryString(exp._id), userId },
            { ...sanitizeSubDoc(exp), userId },
            { new: true }
          );
        }
        if (exp.type === "delete" && exp._id) {
          return await Experience.findOneAndDelete({ _id: asQueryString(exp._id), userId });
        }
        return null;
      })
    ),

    // 🔹 Education
    Promise.all(
      educationList.map(async (edu: any) => {
        if (edu.type === "create") {
          return await Education.create({ ...sanitizeSubDoc(edu), userId });
        }
        if (edu.type === "update" && edu._id) {
          return await Education.findOneAndUpdate(
            { _id: asQueryString(edu._id), userId },
            { ...sanitizeSubDoc(edu), userId },
            { new: true }
          );
        }
        if (edu.type === "delete" && edu._id) {
          return await Education.findOneAndDelete({ _id: asQueryString(edu._id), userId });
        }
        return null;
      })
    ),

    // 🔹 Awards & Honors
    Promise.all(
      awardsAndHonors.map(async (honor: any) => {
        if (honor.type === "create") {
          return await AwardsAndHonor.create({ ...sanitizeSubDoc(honor), userId });
        }
        if (honor.type === "update" && honor._id) {
          return await AwardsAndHonor.findOneAndUpdate(
            { _id: asQueryString(honor._id), userId },
            { ...sanitizeSubDoc(honor), userId },
            { new: true }
          );
        }
        if (honor.type === "delete" && honor._id) {
          return await AwardsAndHonor.findOneAndDelete({ _id: asQueryString(honor._id), userId });
        }
        return null;
      })
    ),
  ]);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Elevator Pitch updated successfully',
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

  const pitch = await ElevatorPitch.findOne({ userId })
  if (pitch) {
    await removeElevatorPitchArtifacts({
      userId: userId.toString(),
      rawKey: pitch.video?.rawKey ?? pitch.video?.url ?? undefined,
    })
  }

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
