import path from 'path'
import fs from 'fs'

import catchAsync from '../utils/catchAsync'
import AppError from '../errors/AppError'
import httpStatus from 'http-status'
import { generateOTP } from '../utils/generateOTP'
import { createToken, verifyToken } from '../utils/authToken'
import { sendEmail } from '../utils/sendEmail'
import { User } from '../models/user.model'
import sendResponse from '../utils/sendResponse'
import { defaultSecurityQuestions } from '../constants/defaultSecurityQuestions'
import { JwtPayload } from 'jsonwebtoken'
import { Request, Response } from 'express'

import { getPaginationParams, buildMetaPagination } from '../utils/pagination'
import { deleteFromCloudinary, uploadToCloudinary } from '../utils/cloudinary'

export const register = catchAsync(async (req, res) => {
  const { name, email, password, address, phoneNum, role } = req.body
  if (!name || !email || !password) {
    throw new AppError(httpStatus.FORBIDDEN, 'Please fill in all fields')
  }
  const otp = generateOTP()
  const jwtPayloadOTP = {
    otp: otp,
  }

  const otptoken = createToken(
    jwtPayloadOTP,
    process.env.OTP_SECRET as string,
    process.env.OTP_EXPIRE
  )

  const user = await User.create({
    name,
    email,
    password,
    phoneNum,
    address,
    role,
    verificationInfo: { token: otptoken },
  })
  await sendEmail(user.email, 'Registerd Account', `Your OTP is ${otp}`)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'User Logged in successfully',
    data: user,
  })
})

export const login = catchAsync(async (req, res) => {
  const { email, password } = req.body
  const user = await User.isUserExistsByEmail(email)
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found')
  }
  // console.log(await User.isPasswordMatched(password.toString(), user.password))
  if (
    user?.password &&
    !(await User.isPasswordMatched(password, user.password))
  ) {
    throw new AppError(httpStatus.FORBIDDEN, 'Password is not correct')
  }
  if (!(await User.isOTPVerified(user._id.toString()))) {
    const otp = generateOTP()
    const jwtPayloadOTP = {
      otp: otp,
    }

    const otptoken = createToken(
      jwtPayloadOTP,
      process.env.OTP_SECRET as string,
      process.env.OTP_EXPIRE
    )
    user.verificationInfo.token = otptoken
    await user.save()
    await sendEmail(user.email, 'Registerd Account', `Your OTP is ${otp}`)

    return sendResponse(res, {
      statusCode: httpStatus.FORBIDDEN,
      success: false,
      message: 'OTP is not verified, please verify your OTP',
      data: { email: user.email },
    })
  }

  // REACTIVATE ACCOUNT IF ACCOUNT IS DEACTIVATE
  if (user.deactivate) {
    user.deactivate = false
    user.dateOfdeactivate = undefined
  }

  const jwtPayload = {
    _id: user._id,
    email: user.email,
    role: user.role,
  }
  const accessToken = createToken(
    jwtPayload,
    process.env.JWT_ACCESS_SECRET as string,
    process.env.JWT_ACCESS_EXPIRES_IN as string
  )
  const refreshToken = createToken(
    jwtPayload,
    process.env.JWT_REFRESH_SECRET as string,
    process.env.JWT_REFRESH_EXPIRES_IN as string
  )
  user.refresh_token = refreshToken

  let _user = await user.save()

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'User Logged in successfully',
    data: {
      accessToken,
      role: user.role,
      _id: user._id,
      refreshToken
    },
  })
})

export const verifyEmail = catchAsync(async (req, res) => {
  const { email, otp } = req.body
  const user = await User.isUserExistsByEmail(email)
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found')
  }
  if (user.verificationInfo.verified) {
    throw new AppError(httpStatus.BAD_REQUEST, 'User already verified')
  }
  if (otp) {
    const savedOTP = verifyToken(
      user.verificationInfo.token,
      process.env.OTP_SECRET || ''
    ) as JwtPayload
    console.log(savedOTP)
    if (otp === savedOTP.otp) {
      user.verificationInfo.verified = true
      user.verificationInfo.token = ''
      await user.save()

      sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'User verified',
        data: '',
      })
    } else {
      throw new AppError(httpStatus.BAD_REQUEST, 'Invalid OTP')
    }
  } else {
    throw new AppError(httpStatus.BAD_REQUEST, 'OTP is required')
  }
})

export const forgetPassword = catchAsync(async (req, res) => {
  const { email } = req.body
  const user = await User.isUserExistsByEmail(email)
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found')
  }
  const otp = generateOTP()
  const jwtPayloadOTP = {
    otp: otp,
  }

  const otptoken = createToken(
    jwtPayloadOTP,
    process.env.OTP_SECRET as string,
    process.env.OTP_EXPIRE as string
  )
  user.password_reset_token = otptoken
  await user.save()

  /////// TODO: SENT EMAIL MUST BE DONE
  sendEmail(user.email, 'Reset Password', `Your OTP is ${otp}`)

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'OTP sent to your email',
    data: '',
  })
})

export const resetPassword = catchAsync(async (req, res) => {
  const { password, otp, email } = req.body
  const user = await User.isUserExistsByEmail(email)
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found')
  }
  if (!user.password_reset_token) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Password reset token is invalid'
    )
  }
  const verify = (await verifyToken(
    user.password_reset_token,
    process.env.OTP_SECRET!
  )) as JwtPayload
  if (verify.otp !== otp) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Invalid OTP')
  }
  user.password = password
  await user.save()
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Password reset successfully',
    data: {},
  })
})

export const changePassword = catchAsync(async (req, res) => {
  const { oldPassword, newPassword } = req.body
  if (!oldPassword || !newPassword) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Old password and new password are required'
    )
  }
  if (oldPassword === newPassword) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Old password and new password cannot be same'
    )
  }
  const user = await User.findById({ _id: req.user?._id })

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found')
  }
  user.password = newPassword
  await user.save()
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Password changed',
    data: '',
  })
})

/**************************************
 * Set SECURITY QUESTIONS AND ANSWERS *
 **************************************/
export const setSecurityQuestions = catchAsync(async (req, res) => {
  const { email, securityQuestions } = req.body

  if (!email || typeof email !== 'string') {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Email is required and must be a string'
    )
  }

  if (
    !Array.isArray(securityQuestions) ||
    securityQuestions.some(
      (q) =>
        !q.question ||
        typeof q.question !== 'string' ||
        !q.answer ||
        typeof q.answer !== 'string'
    )
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      'Invalid security questions format'
    )
  }

  const user = await User.findOne({ email })

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found')
  }

  await user.save()

  res.status(httpStatus.OK).json({
    success: true,
    message: 'Security questions saved successfully',
  })
})

/**********************************
 * GET DEFAULT SECURITY QUESTIONS *
 **********************************/
export const getDefaultSecurityQuestions = catchAsync(async (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Default security questions fetched successfully',
    date: defaultSecurityQuestions,
  })
})

/***************************
 * SUBMIT SECURITY ANSWERS *
 ***************************/
export const submitSecurityAnswers = catchAsync(
  async (req: Request, res: Response) => {
    const { email, securityQuestions } = req.body
    // console.log("securityQuestions", securityQuestions)

    if (!email || !Array.isArray(securityQuestions)) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Invalid input')
    }

    const user = await User.findOne({ email })
    // console.log("first", user)
    if (!user) throw new AppError(httpStatus.NOT_FOUND, 'User not found')

    // Overwrite existing questions
    user.securityQuestions = securityQuestions
    await user.save()

    res.status(httpStatus.OK).json({
      success: true,
      message: 'Security questions saved',
    })
  }
)

/***************************
 * VERIFY SECURITY ANSWERS *
 ***************************/
export const verifySecurityAnswers = catchAsync(
  async (req: Request, res: Response) => {
    const { email, answers } = req.body

    if (!email || !Array.isArray(answers)) {
      throw new AppError(httpStatus.BAD_REQUEST, 'Invalid input')
    }

    const user = await User.findOne({ email }).select('securityQuestions')

    if (user?.securityQuestions?.length !== answers.length) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        'Number of answers does not match the number of security questions'
      ) 
    }

    if (!user || user.securityQuestions.length <= 0) {
      throw new AppError(httpStatus.NOT_FOUND, 'Security questions not found')
    }

    const matched = user.securityQuestions?.every((q, i) => {
      return q.answer.trim().toLowerCase() === answers[i]?.trim().toLowerCase()
    })

    if (!matched) {
      throw new AppError(
        httpStatus.UNAUTHORIZED,
        'Security answers do not match'
      )
    }

    const resetToken = createToken(
      { email },
      process.env.JWT_ACCESS_SECRET as string,
      process.env.JWT_ACCESS_EXPIRES_IN as string
    )
    user.verificationInfo.resetToken = resetToken
    await user.save()

    res.status(httpStatus.OK).json({
      success: true,
      message: 'Answers verified. You can now reset your password.',
      data: { resetToken },
    })
  }
)

/**********************************************
 * RESET PASSWORD USING THE SECURITY PASSWORD *
 **********************************************/
export const securityResetPassword = catchAsync(
  async (req: Request, res: Response) => {
    const { token } = req.query
    const { newPassword } = req.body

    if (!token || typeof token !== 'string') {
      throw new AppError(httpStatus.BAD_REQUEST, 'Reset token is required')
    }

    if (!newPassword || typeof newPassword !== 'string') {
      throw new AppError(httpStatus.BAD_REQUEST, 'New password is required')
    }

    const user = await User.findOne({
      'verificationInfo.resetToken': token,
    }).select('+password')

    if (!user) {
      throw new AppError(
        httpStatus.UNAUTHORIZED,
        'Invalid or expired reset token'
      )
    }

    // Set new password (bcrypt will hash in pre-save hook)
    user.password = newPassword
    user.verificationInfo.resetToken = '' // clear token
    await user.save()

    res.status(httpStatus.OK).json({
      success: true,
      message: 'Password has been reset successfully',
    })
  }
)

/***************************
 * DEACTIVATE USER ACCOUNT *
 ***************************/
export const deactivateUser = catchAsync(async (req, res) => {
  const userId = req.user?._id

  const user = await User.findById(userId)
  if (!user) throw new AppError(httpStatus.NOT_FOUND, 'User not found')

  user.deactivate = true
  user.dateOfdeactivate = new Date()
  await user.save()

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Account deactivated. Your data will be deleted in 30 days.',
    data: null,
  })
})

/**********************************
 * GET ALL THE USER EMAIL AND _ID *
 **********************************/
export const getAllUserEmails = catchAsync(
  async (req: Request, res: Response) => {
    const users = await User.find({}, { _id: 1, email: 1 }).lean()

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'All user emails and IDs fetched successfully',
      data: users,
    })
  }
)

/***************************
 * GET A SINGLE USER BY ID *
 ***************************/
export const getUserById = catchAsync(async (req: Request, res: Response) => {
  const id = req.user?._id

  const user = await User.findById(id).select(
    '-password -verificationInfo -password_reset_token'
  )

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found')
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'User fetched successfully',
    data: user,
  })
})

/**************************
 * UPDATE USER INFO BY ID *
 **************************/
// export const updateUser = catchAsync(async (req: Request, res: Response) => {
//   const id = req.query._id
//   const updateData = req.body

//   if (!id) throw new AppError(httpStatus.BAD_REQUEST, 'User ID is required')

//   // Optional: Restrict fields if needed
//   const allowedFields = ['name', 'phoneNum', 'address', 'avatar']
//   const filteredData: Partial<Record<string, any>> = {}

//   for (const field of allowedFields) {
//     if (updateData[field] !== undefined) {
//       filteredData[field] = updateData[field]
//     }
//   }

//   const updatedUser = await User.findByIdAndUpdate(id, filteredData, {
//     new: true,
//     runValidators: true,
//   }).select('-password -verificationInfo -password_reset_token')

//   if (!updatedUser) {
//     throw new AppError(httpStatus.NOT_FOUND, 'User not found or not updated')
//   }

//   sendResponse(res, {
//     statusCode: httpStatus.OK,
//     success: true,
//     message: 'User updated successfully',
//     data: updatedUser,
//   })
// })

export const updateUser = catchAsync(async (req: Request, res: Response) => {
  const id = req.user?._id
  const updateData = req.body

  if (!id) throw new AppError(httpStatus.BAD_REQUEST, 'User ID is required')

  const allowedFields = ['name', 'phoneNum', 'address']
  const filteredData: Partial<Record<string, any>> = {}

  for (const field of allowedFields) {
    if (updateData[field] !== undefined) {
      filteredData[field] = updateData[field]
    }
  }

  // Handle avatar upload
  if (req.files && (req.files as any).photo) {
    const photo = (req.files as any).photo[0]
    const uploadResult = await uploadToCloudinary(photo.path, 'avatars')

    // Remove old avatar from Cloudinary if needed (optional)
    const existingUser = await User.findById(id).select('avatar')
    if (existingUser?.avatar?.url) {
      const publicId = path.basename(existingUser.avatar.url).split('.')[0]
      await deleteFromCloudinary(publicId)
    }

    filteredData.avatar = {
      url: uploadResult?.secure_url,
    }

    // Delete local file
    fs.unlinkSync(photo.path)
  }

  const updatedUser = await User.findByIdAndUpdate(id, filteredData, {
    new: true,
    runValidators: true,
  }).select('-password -verificationInfo -password_reset_token')

  if (!updatedUser) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found or not updated')
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'User updated successfully',
    data: updatedUser,
  })
})


// Refresh Token
export const refreshToken = catchAsync(async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        throw new AppError(400, 'Refresh token is required');
    }

    const decoded = verifyToken(refreshToken, process.env.JWT_REFRESH_SECRET as string) as JwtPayload;
    const user = await User.findById(decoded._id);
    if (!user ) {
        throw new AppError(401, 'Invalid refresh token');
    }
    const jwtPayload = {
        _id: user._id,
        email: user.email,
        role: user.role,
    };

    const accessToken = createToken(
        jwtPayload,
        process.env.JWT_ACCESS_SECRET as string,
        process.env.JWT_ACCESS_EXPIRES_IN as string,
    );

    const refreshToken1 = createToken(
        jwtPayload,
        process.env.JWT_REFRESH_SECRET as string,
        process.env.JWT_REFRESH_EXPIRES_IN as string,
    );
    user.refresh_token = refreshToken1;
    await user.save();

    sendResponse(res, {
        statusCode: 200,
        success: true,
        message: 'Token refreshed successfully',
        data: { accessToken: accessToken, refreshToken: refreshToken1 },
    });
});