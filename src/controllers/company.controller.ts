import { Request, Response } from 'express'
import { Company } from '../models/company.model'
import catchAsync from '../utils/catchAsync'
import httpStatus from 'http-status'
import sendResponse from '../utils/sendResponse'
import { uploadToCloudinary } from '../utils/cloudinary'
import { AwardsAndHonor } from '../models/awardsAndHonor.model'
import mongoose from 'mongoose'
import AppError from '../errors/AppError'
import {
  getPaginationParams,
  buildMetaPagination,
  MetaPagination,
} from '../utils/pagination'
import { CreateResume } from '../models/createResume.model'
import { User } from '../models/user.model'
import { ElevatorPitch } from '../models/elevatorPitch.model'
import { RecruiterAccount } from '../models/recruiterAccount.model'
import { ReqCompany } from '../models/assignCompanyReq.model'

/******************
 * CREATE COMPANY *
 ******************/

// export const createCompany = catchAsync(async (req: Request, res: Response) => {
//   const session = await mongoose.startSession();
//   session.startTransaction();

//   try {
//     const { AwardsAndHonors, ...companyData } = req.body;

//     // Handle file upload (e.g. logo)
//     // if (req.file?.path) {
//     //   const cloudinaryRes = await uploadToCloudinary(req.file.path);
//     //   if (cloudinaryRes?.secure_url) {
//     //     companyData.clogo = cloudinaryRes.secure_url;
//     //   }
//     // }
//     const files = req.files as Record<string, Express.Multer.File[]>;

//     if (files?.clogo?.[0]?.path) {
//       const logoRes = await uploadToCloudinary(files.clogo[0].path);
//       if (logoRes?.secure_url) {
//         companyData.clogo = logoRes.secure_url;
//       }
//     }

//     if (files?.banner?.[0]?.path) {
//       const certRes = await uploadToCloudinary(files.banner[0].path);
//       if (certRes?.secure_url) {
//         companyData.banner = certRes.secure_url;
//       }
//     }
//     companyData.employeesId = JSON.parse(companyData.employeesId || "[]");
//     companyData.links = JSON.parse(companyData.links || "[]");
//     companyData.service = JSON.parse(companyData.service || "[]");
//     // Optional: attach userId from req.user if available
//     if (req.user?._id) {
//       companyData.userId = req.user._id;
//     }

//     // Create company document
//     const newCompany = await Company.create([companyData], { session });

//     // Parse and insert awards and honors if provided
//     let createdHonors = [] as any[];

//     let parsedHonors = [];
//     if (typeof AwardsAndHonors === "string") {
//       try {
//         parsedHonors = JSON.parse(AwardsAndHonors);
//       } catch (err) {
//         throw new AppError(
//           httpStatus.BAD_REQUEST,
//           "Invalid JSON format in AwardsAndHonors"
//         );
//       }
//     } else if (Array.isArray(AwardsAndHonors)) {
//       parsedHonors = AwardsAndHonors;
//     }

//     if (parsedHonors.length > 0) {
//       const honorData = parsedHonors.map((item: any) => ({
//         ...item,
//         userId: companyData.userId,
//       }));
//       createdHonors = await AwardsAndHonor.insertMany(honorData, { session });
//     }

//     await session.commitTransaction();
//     session.endSession();

//     sendResponse(res, {
//       statusCode: httpStatus.CREATED,
//       success: true,
//       message: "Company and associated honors created successfully",
//       data: {
//         company: newCompany[0],
//         honors: createdHonors,
//       },
//     });
//   } catch (error) {
//     await session.abortTransaction();
//     session.endSession();
//     console.error("Error creating company:", error);
//     throw error;
//   }
// });

export const createCompany = catchAsync(async (req: Request, res: Response) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const { AwardsAndHonors, ...companyData } = req.body
    const files = req.files as Record<string, Express.Multer.File[]>
    const user = await User.findById(req?.user?._id) as any

    if (files?.clogo?.[0]?.path) {
      const logoRes = await uploadToCloudinary(files.clogo[0].path)
      if (logoRes?.secure_url) {
        companyData.clogo = logoRes.secure_url
                if (!user.avatar) {
          user.avatar = { url: "" }; // initialize if missing
        }
        user.avatar.url = logoRes.secure_url || "";
        await user?.save()
      }
    }

    if (files?.banner?.[0]?.path) {
      const certRes = await uploadToCloudinary(files.banner[0].path)
      if (certRes?.secure_url) {
        companyData.banner = certRes.secure_url
      }
    }

    companyData.employeesId = JSON.parse(companyData.employeesId || '[]')
    companyData.sLink = JSON.parse(companyData.sLink || '[]')
    companyData.service = JSON.parse(companyData.service || '[]')

    // Optional: attach userId from req.user if available
    if (req.user?._id) {
      companyData.userId = req.user._id
      companyData.slug = user.slug
    }

    // ✅ Create company document
    const newCompany = await Company.create([companyData], { session })
    const createdCompany = newCompany[0]

    // ✅ If employeesId provided, update RecruiterAccount with companyId
    if (companyData.employeesId.length > 0) {
      await RecruiterAccount.updateMany(
        { userId: { $in: companyData.employeesId } },
        { $set: { companyId: createdCompany._id } },
        { session }
      )
    }

    // ✅ Handle Awards and Honors
    let createdHonors: any[] = []
    let parsedHonors: any[] = []

    if (typeof AwardsAndHonors === 'string') {
      try {
        parsedHonors = JSON.parse(AwardsAndHonors)
      } catch (err) {
        throw new AppError(
          httpStatus.BAD_REQUEST,
          'Invalid JSON format in AwardsAndHonors'
        )
      }
    } else if (Array.isArray(AwardsAndHonors)) {
      parsedHonors = AwardsAndHonors
    }

    if (parsedHonors.length > 0) {
      const honorData = parsedHonors.map((item: any) => ({
        ...item,
        userId: companyData.userId,
      }))
      createdHonors = await AwardsAndHonor.insertMany(honorData, { session })
    }

    await session.commitTransaction()
    session.endSession()

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: 'Company and associated honors created successfully',
      data: {
        company: createdCompany,
        honors: createdHonors,
      },
    })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    console.error('Error creating company:', error)
    throw error
  }
})

/************************
 * UPDATE COMPANY BY ID *
 ************************/
export const updateCompany = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params

  const companyData = { ...req.body } as any

  const files = req.files as Record<string, Express.Multer.File[]>

  if (files?.clogo) {
    const logoRes = await uploadToCloudinary(files.clogo[0].path)
    if (logoRes?.secure_url) {
      companyData.clogo = logoRes.secure_url
    }
  }

  if (files?.banner) {
    const certRes = await uploadToCloudinary(files.banner[0].path)
    if (certRes?.secure_url) {
      companyData.banner = certRes.secure_url
    }
  }

  companyData.employeesId = JSON.parse(req.body.employeesId || '[]')
  companyData.sLink = JSON.parse(req.body.sLink || '[]')
  companyData.service = JSON.parse(req.body.service || '[]')

  const updated = await Company.findByIdAndUpdate(id, companyData, {
    new: true,
    runValidators: true,
  })
  const honors = JSON.parse(req.body.honors || '[]') // expecting array
  let results
  if (honors.length > 0) {
    results = await Promise.all(
      honors.map(async (item: any) => {
        if (item.type === 'create') {
          const newHonor = new AwardsAndHonor({
            userId: req.user?._id, // adjust if needed
            title: item.title,
            programeDate: item.programeDate,
            description: item.description,
            issuer: item.issuer,
          })
          return await newHonor.save()
        }

        if (item.type === 'update' && item._id) {
          return await AwardsAndHonor.findByIdAndUpdate(
            item._id,
            {
              title: item.title,
              programeDate: item.programeDate,
              description: item.description,
              issuer: item.issuer,
            },
            { new: true }
          )
        }

        if (item.type === 'delete' && item._id) {
          return await AwardsAndHonor.findByIdAndDelete(item._id)
        }

        return null
      })
    )
  }

  if (!updated) {
    res.status(httpStatus.NOT_FOUND).json({
      success: false,
      message: 'Company not found',
    })
    return
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Company updated successfully',
    data: { updated, results },
  })
})

/**************************
 * GET COMPANY BY USER ID *
 **************************/
export const getCompanyByUserId = catchAsync(
  async (req: Request, res: Response) => {
    const { userId } = req.params

    const { page, limit, skip } = getPaginationParams(req.query)

    // Count total companies for this user
    const totalCompanies = await Company.countDocuments({ userId })

    // Fetch companies with pagination
    const companies = await Company.find({ userId })
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      const countJob = await Company.countDocuments({userId})

    let companiesWithPitch = await Promise.all(
      companies.map(async (company) => {
        // Find related pitch by companyId
        const pitch = await ElevatorPitch.findOne({ userId: userId })

        // Merge pitch into company object
        return {
          ...company.toObject(),
          elevatorPitch: pitch || null, // add pitch data or null
        }
      })
    )

    // Get related AwardsAndHonor (if any), for all companies by user
    const honors = await AwardsAndHonor.find({ userId }).sort({
      programeDate: -1,
    })

    const meta = buildMetaPagination(totalCompanies, page, limit)

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Companies and related honors fetched successfully',

      data: {
        meta,
        companies: companiesWithPitch,
        honors,
      },
    })
  }
)


export const getCompanyByUserSlug = catchAsync(async (req: Request, res: Response) => {
  const { slug } = req.params
  const { page, limit, skip } = getPaginationParams(req.query)

  // Step 1 — Find user by slug
  const user = await User.findOne({ slug }).select('_id deactivate')
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found')
  }

  const userId = user._id

  // Step 2 — Count total companies for this user
  const totalCompanies = await Company.countDocuments({ userId })

  // Step 3 — Fetch companies with pagination
  const companies = await Company.find({ userId })
    .skip(skip)
    .limit(limit)
    .sort({ createdAt: -1 })

  // Step 4 — Fetch shared pitch (since ElevatorPitch is tied to user, not company)
  const pitch = await ElevatorPitch.findOne({ userId })

  // Step 5 — Merge pitch with each company
  const companiesWithPitch = companies.map((company) => ({
    ...company.toObject(),
    elevatorPitch: pitch || null,
  }))

  // Step 6 — Get AwardsAndHonor for all companies by this user
  const honors = await AwardsAndHonor.find({ userId }).sort({ programeDate: -1 })

  // Step 7 — Build pagination metadata
  const meta = buildMetaPagination(totalCompanies, page, limit)

  // Step 8 — Send response
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Companies and related honors fetched successfully',
    data: {
      deactivate: Boolean(user.deactivate),
      meta,
      companies: companiesWithPitch,
      honors,
    },
  })
})

export const getCompanyByEmployeeId = catchAsync(
  async (req: Request, res: Response) => {
    const { userId } = req.params

    const { page, limit, skip } = getPaginationParams(req.query)

    // Count total companies for this user
    const totalCompanies = await Company.countDocuments({ userId })

    // Fetch companies with pagination
    const companies = await Company.find({ employeesId: { $in: [userId] } })
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })

    const companiesWithHonors = await Promise.all(
      companies.map(async (company) => {
        const honors = await AwardsAndHonor.find({
          userId: company.userId,
        }).sort({ programeDate: -1 })

        return { ...company.toObject(), honors }
      })
    )

    // // Get related AwardsAndHonor (if any), for all companies by user
    // const honors = await AwardsAndHonor.find({ userId }).sort({
    //   programeDate: -1,
    // })

    const meta = buildMetaPagination(totalCompanies, page, limit)

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Companies and related honors fetched successfully',

      data: {
        meta,
        companiesWithHonors,
      },
    })
  }
)

/************************
 * DELETE COMPANY BY ID *
 ************************/
export const deleteCompany = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params
  const deleted = await Company.findByIdAndDelete(id)

  if (!deleted) {
    res.status(404).json({
      success: false,
      message: 'Company not found',
    })
    return
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Company deleted successfully',
    data: deleted,
  })
})

/*************************************
 * GET COMPANY EMPLOYEES WITH SKILLS *
 *************************************/
export const getCompanyEmployeesWithSkills = catchAsync(
  async (req: Request, res: Response) => {
    const { userId } = req.params
    const { page, limit, skip } = getPaginationParams(req.query)

    // 1. Find the company document for the given userId (company)
    const company = await Company.findOne({ userId })
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })

    if (!company) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Company not found',
        data: null,
      })
    }

    // 2. Convert employee ObjectIds to strings for querying
    const employeeIds = company.employeesId.map(
      (id) => new mongoose.Types.ObjectId(id)
    )

    // 3. Fetch employee details from User model
    const employees = await User.find({
      _id: { $in: employeeIds },
    }).select('_id name email phoneNum role avatar slug')

    // 4. Fetch skills from CreateResume model for these employees
    const resumes = await CreateResume.find({
      userId: { $in: employeeIds },
    }).select('userId skills')

    // Create a map of userId => skills
    const skillsMap = new Map(
      resumes.map((resume) => [resume.userId.toString(), resume.skills])
    )

    // 5. Combine employee data with their skills
    const employeesWithSkills = employees.map((employee) => ({
      _id: employee._id,
      name: employee.name,
      slug: employee.slug,
      email: employee.email,
      phoneNum: employee.phoneNum,
      role: employee.role,
      photo:employee.avatar,
      skills: skillsMap.get(employee._id.toString()) || [],
    }))

    const request = await ReqCompany.find({company: company._id, status: "pending"}).populate('userId', '_id name email phoneNum role avatar slug')

    // 6. Prepare the response data
    const responseData = {
      company: {
        _id: company._id,
        cname: company.cname,
        clogo: company.clogo,
        industry: company.industry,
        aboutUs: company.aboutUs,
        country: company.country,
        city: company.city,
      },
      employees: employeesWithSkills,
      request,
      meta: buildMetaPagination(1, page, limit),
    }

    // 7. Send the response
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Company and employees with skills fetched successfully',
      data: responseData,
    })
  }
)
