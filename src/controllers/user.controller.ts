import path from "path";
import fs from "fs";

import catchAsync from "../utils/catchAsync";
import AppError from "../errors/AppError";
import httpStatus from "http-status";
import bcrypt from "bcrypt";
import { generateOTP } from "../utils/generateOTP";
import { createToken, verifyToken } from "../utils/authToken";
import {
  accountCreationOtpTemplate,
  resetOtpTemplate,
  sendEmail,
} from "../utils/sendEmail";
import { User } from "../models/user.model";
import sendResponse from "../utils/sendResponse";
import { defaultSecurityQuestions } from "../constants/defaultSecurityQuestions";
import { JwtPayload } from "jsonwebtoken";
import { Request, Response } from "express";

import { getPaginationParams, buildMetaPagination } from "../utils/pagination";
import { deleteFromCloudinary, uploadToCloudinary } from "../utils/cloudinary";
import { CreateResume } from "../models/createResume.model";
import { RecruiterAccount } from "../models/recruiterAccount.model";
import { Company } from "../models/company.model";
import { paymentInfo } from "../models/paymentInfo.model";
import { Experience } from "../models/experience.model";
import { Job } from "../models/job.model";
import { isPaymentExpired, resolvePaymentExpiry } from "../utils/subscription";

const DEFAULT_NO_REPLY_EMAIL =
  process.env.NO_REPLY_EMAIL || "no-reply@evpitch.com";
const OTP_EXPIRES_IN = "10m";

const decodeOtpToken = (token: string) => {
  try {
    return verifyToken(token, process.env.OTP_SECRET || "") as JwtPayload;
  } catch (error: any) {
    if (error?.name === "TokenExpiredError") {
      throw new AppError(httpStatus.UNAUTHORIZED, "OTP expired");
    }
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid OTP token");
  }
};

const resolveUserPlanState = async (userId: any) => {
  const payment = await paymentInfo
    .findOne({
      userId,
      paymentStatus: "complete",
      planStatus: "active",
    })
    .sort({ updatedAt: -1 })
    .populate("planId");

  const state: {
    payment: any;
    plan: any;
    expiryDate: Date | null;
    payAsYouGo: boolean | undefined;
    isValid: boolean;
  } = {
    payment,
    plan: (payment?.planId as any) || null,
    expiryDate: null,
    payAsYouGo: false,
    isValid: false,
  };

  if (!payment || !state.plan) {
    return state;
  }

  const now = new Date();
  const expiryDate = resolvePaymentExpiry(payment);
  state.expiryDate = expiryDate ?? null;

  let shouldSave = false;
  if (
    expiryDate &&
    (!payment.expiresAt ||
      payment.expiresAt.getTime() !== expiryDate.getTime())
  ) {
    payment.expiresAt = expiryDate;
    shouldSave = true;
  }

  const expired = isPaymentExpired(payment, now);
  if (expired && payment.planStatus !== "deactivate") {
    payment.planStatus = "deactivate";
    shouldSave = true;
  }

  if (shouldSave) {
    await payment.save();
  }

  if (expired) {
    state.payment = null;
    state.plan = null;
    state.expiryDate = null;
    state.payAsYouGo = false;
    state.isValid = false;
    return state;
  }

  const planValid = (state.plan?.valid || "").toLowerCase();
  if (planValid === "payasyougo") {
    const baseline = payment.updatedAt ?? payment.createdAt ?? now;
    const jobExists = await Job.exists({
      userId,
      createdAt: { $gte: baseline },
    });
    state.payAsYouGo = !jobExists;
    state.isValid = false;
  } else {
    state.payAsYouGo = false;
    state.isValid = !expired && !!expiryDate;
  }

  return state;
};

export const register = catchAsync(async (req, res) => {
  const { name, email, password, address, phoneNum, role, dateOfbirth } =
    req.body;
  if (!name || !email || !password) {
    throw new AppError(httpStatus.FORBIDDEN, "Please fill in all fields");
  }
  // C2: never persist a client-supplied privileged role. Only self-service
  // roles are accepted; anything else (incl. admin/super-admin) -> "candidate".
  const SELF_SERVICE_ROLES = ["candidate", "recruiter", "company"];
  const safeRole = SELF_SERVICE_ROLES.includes(role) ? role : "candidate";
  const otp = generateOTP();
  const jwtPayloadOTP = { otp };
  const otptoken = createToken(
    jwtPayloadOTP,
    process.env.OTP_SECRET as string,
    OTP_EXPIRES_IN
  );
  const user = await User.create({
    name,
    email,
    password,
    phoneNum,
    address,
    role: safeRole,
    verificationInfo: { verified: false, token: otptoken, resetToken: "" },
    dateOfbirth,
  });

  try {
    await sendEmail(
      user.email,
      "OTP - Elevator Video PitchAc",
      accountCreationOtpTemplate(user.name, otp),
      { from: DEFAULT_NO_REPLY_EMAIL }
    );
  } catch (err) {
    // Roll back user creation if email failed
    await User.findByIdAndDelete(user._id);
    throw err;
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message:
      "Registration successful. Please verify the OTP sent to your email before continuing.",
    data: { email: user.email },
  });
});

export const resendVerificationOtp = catchAsync(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    throw new AppError(httpStatus.BAD_REQUEST, "Email is required");
  }

  const user = await User.isUserExistsByEmail(email);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  if (user.verificationInfo?.verified) {
    throw new AppError(httpStatus.BAD_REQUEST, "User is already verified");
  }

  const otp = generateOTP();
  const jwtPayloadOTP = { otp };
  const otptoken = createToken(
    jwtPayloadOTP,
    process.env.OTP_SECRET as string,
    OTP_EXPIRES_IN
  );

  user.verificationInfo = user.verificationInfo || {
    verified: false,
    token: "",
    resetToken: "",
  };
  user.verificationInfo.token = otptoken;
  await user.save();

  await sendEmail(
    user.email,
    "OTP - Elevator Video Pitch©",
    accountCreationOtpTemplate(user.name, otp),
    { from: DEFAULT_NO_REPLY_EMAIL }
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "OTP resent successfully",
    data: { email: user.email },
  });
});

export const login = catchAsync(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.isUserExistsByEmail(email);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }
  // console.log(await User.isPasswordMatched(password.toString(), user.password))
  if (
    user?.password &&
    !(await User.isPasswordMatched(password, user.password))
  ) {
    throw new AppError(httpStatus.FORBIDDEN, "Incorrect password");
  }
  if (!user.verificationInfo?.verified) {
    const needsSecurityQuestions =
      !user.securityQuestions || user.securityQuestions.length < 2;
    const otp = generateOTP();
    const jwtPayloadOTP = {
      otp: otp,
    };

    const otptoken = createToken(
      jwtPayloadOTP,
      process.env.OTP_SECRET as string,
      OTP_EXPIRES_IN
    );
    user.verificationInfo.token = otptoken;
    await user.save();
    await sendEmail(
      user.email,
      "OTP - Elevator Video PitchAc",
      accountCreationOtpTemplate(user.name, otp),
      { from: DEFAULT_NO_REPLY_EMAIL }
    );

    return sendResponse(res, {
      statusCode: httpStatus.FORBIDDEN,
      success: false,
      message:
        "Your email is not verified. We sent you a new OTP—please verify and complete your security questions to continue.",
      data: {
        email: user.email,
        nextStep: "verify-otp",
        needsSecurityQuestions,
      },
    });
  }

  // REACTIVATE ACCOUNT IF ACCOUNT IS DEACTIVATE
  if (user.deactivate) {
    user.deactivate = false;
    user.dateOfdeactivate = undefined;
  }

  const jwtPayload = {
    _id: user._id,
    email: user.email,
    role: user.role,
  };
  const accessToken = createToken(
    jwtPayload,
    process.env.JWT_ACCESS_SECRET as string,
    process.env.JWT_ACCESS_EXPIRES_IN as string
  );
  const refreshToken = createToken(
    jwtPayload,
    process.env.JWT_REFRESH_SECRET as string,
    process.env.JWT_REFRESH_EXPIRES_IN as string
  );
  user.refresh_token = refreshToken;

  let _user = await user.save();

  const { plan: activePlan, payAsYouGo, isValid } = await resolveUserPlanState(
    user._id
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User logged in successfully",
    data: {
      accessToken,
      role: user.role,
      _id: user._id,
      name: user.name,
      email: email,
      address: user.address,
      phoneNum: user.phoneNum,
      dateOfbirth: user.dateOfbirth,
      refreshToken,
      isValid,
      payAsYouGo,
      plan: activePlan,
    },
  });
});

export const verifyEmail = catchAsync(async (req, res) => {
  const { email, otp } = req.body;
  const user = await User.isUserExistsByEmail(email);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }
  if (user.verificationInfo.verified) {
    throw new AppError(httpStatus.BAD_REQUEST, "User already verified");
  }
  if (otp) {
    const savedOTP = decodeOtpToken(user.verificationInfo.token);
    if (otp === savedOTP.otp) {
      user.verificationInfo.verified = true;
      user.verificationInfo.token = "";
      await user.save();
      if (user?.role === 'candidate') {
        const resume = await CreateResume.findOne({ userId: user._id })
        if (resume) {
          resume.email = user.email
          await resume.save()
        }
      } else if (user?.role === 'recruiter') {
        const resume = await RecruiterAccount.findOne({ userId: user._id })
        if (resume) {
          resume.emailAddress = user.email
          await resume.save()
        }
      } else if (user?.role === 'company') {
        const resume = await Company.findOne({ userId: user._id })
        if (resume) {
          resume.cemail = user.email
          await resume.save()
        }
      }

      sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Email verified successfully",
        data: "",
      });
    } else {
      throw new AppError(httpStatus.BAD_REQUEST, "Invalid OTP");
    }
  } else {
    throw new AppError(httpStatus.BAD_REQUEST, "OTP is required");
  }
});

export const forgetPassword = catchAsync(async (req, res) => {
  const { email } = req.body;
  const user = await User.isUserExistsByEmail(email);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }
  const otp = generateOTP();
  const jwtPayloadOTP = {
    otp: otp,
  };

  const otptoken = createToken(
    jwtPayloadOTP,
    process.env.OTP_SECRET as string,
    OTP_EXPIRES_IN
  );
  user.password_reset_token = otptoken;
  await user.save();

  /////// TODO: SENT EMAIL MUST BE DONE
  // sendEmail(user.email, "Reset Password", `Your OTP is ${otp}`);
  sendEmail(
    user.email,
    "Reset Password OTP - Elevator Video Pitch©",
    resetOtpTemplate(user.name, otp),
    { from: DEFAULT_NO_REPLY_EMAIL }
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "OTP sent to your email.",
    data: "",
  });
});

export const otpVerifyResetPassword = catchAsync(async (req, res) => {
  const { otp, email } = req.body;
  const user = await User.isUserExistsByEmail(email);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }
  if (!user.password_reset_token) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Password reset token is invalid"
    );
  }
  const verify = decodeOtpToken(user.password_reset_token);
  if (verify.otp !== otp) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid OTP");
  }
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "OTP verified successfully",
    data: {},
  });
});

export const resetPassword = catchAsync(async (req, res) => {
  const { password, otp, email } = req.body;
  const user = await User.isUserExistsByEmail(email);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }
  if (!user.password_reset_token) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Password reset token is invalid"
    );
  }
  const verify = decodeOtpToken(user.password_reset_token);
  if (verify.otp !== otp) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid OTP");
  }
  user.password = password;
  user.password_reset_token = ""
  await user.save();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Password reset successfully",
    data: {},
  });
});

export const changePassword = catchAsync(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Old password and new password are required"
    );
  }
  if (oldPassword === newPassword) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Old password and new password cannot be same"
    );
  }
  // H1: must load the hashed password and verify the OLD password first.
  const user = await User.findById(req.user?._id).select("+password");

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }
  const matched = await User.isPasswordMatched(oldPassword, user.password);
  if (!matched) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Old password is incorrect");
  }
  user.password = newPassword;
  await user.save(); // pre-save hook re-hashes and revokes sessions (H2)
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Password changed. Please sign in again.",
    data: "",
  });
});

/**************************************
 * Set SECURITY QUESTIONS AND ANSWERS *
 **************************************/
export const setSecurityQuestions = catchAsync(async (req, res) => {
  const { email, securityQuestions } = req.body;

  if (!email || typeof email !== "string") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Email is required and must be a string"
    );
  }

  if (
    !Array.isArray(securityQuestions) ||
    securityQuestions.some(
      (q) =>
        !q.question ||
        typeof q.question !== "string" ||
        !q.answer ||
        typeof q.answer !== "string"
    )
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Invalid security questions format"
    );
  }

  const user = await User.findOne({ email });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  await user.save();

  res.status(httpStatus.OK).json({
    success: true,
    message: "Security questions saved successfully",
  });
});

/**********************************
 * GET DEFAULT SECURITY QUESTIONS *
 **********************************/
export const getDefaultSecurityQuestions = catchAsync(async (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Default security questions fetched successfully",
    data: defaultSecurityQuestions,
  });
});

/***************************
 * SUBMIT SECURITY ANSWERS *
 ***************************/
export const submitSecurityAnswers = catchAsync(
  async (req: Request, res: Response) => {
    const { securityQuestions } = req.body;
    const email = typeof req.body.email === "string" ? req.body.email : "";

    if (!email || !Array.isArray(securityQuestions)) {
      throw new AppError(httpStatus.BAD_REQUEST, "Invalid input");
    }

    const user = await User.findOne({ email });
    if (!user) throw new AppError(httpStatus.NOT_FOUND, "User not found");

    // H5: block overwriting an existing set unless the caller is the
    // authenticated owner. Otherwise an attacker could reset a victim's
    // answers by email and then take over the account via the reset flow.
    const alreadySet =
      Array.isArray(user.securityQuestions) &&
      user.securityQuestions.length > 0;
    const isOwner =
      !!req.user && req.user._id?.toString() === user._id?.toString();
    if (alreadySet && !isOwner) {
      throw new AppError(
        httpStatus.FORBIDDEN,
        "Security questions are already set. Sign in to change them."
      );
    }

    // H5: hash each answer with bcrypt — never store plaintext answers.
    const hashed = await Promise.all(
      securityQuestions.map(
        async (q: { question: string; answer: string }) => ({
          question: q.question,
          answer: await bcrypt.hash(
            String(q.answer).trim().toLowerCase(),
            10
          ),
        })
      )
    );
    user.securityQuestions = hashed;
    await user.save();

    res.status(httpStatus.OK).json({
      success: true,
      message: "Security questions saved",
    });
  }
);

export const checkSubmitSecurityAnswers = catchAsync(
  async (req: Request, res: Response) => {
    const email = typeof req.body.email === "string" ? req.body.email : "";

    if (!email) {
      throw new AppError(httpStatus.BAD_REQUEST, "Invalid input");
    }

    const user = await User.findOne({ email });
    if (!user) throw new AppError(httpStatus.NOT_FOUND, "User not found");

    if (!user.securityQuestions) {
      res.status(httpStatus.OK).json({
        success: true,
        message: "Security questions not found",
        data: { security: false },
      });
    }

    res.status(httpStatus.OK).json({
      success: true,
      message: "Security questions found",
      data: { security: true },
    });
  }
);

/***************************
 * VERIFY SECURITY ANSWERS *
 ***************************/
export const verifySecurityAnswers = catchAsync(
  async (req: Request, res: Response) => {
    const { answers } = req.body;
    const email = typeof req.body.email === "string" ? req.body.email : "";

    if (!email || !Array.isArray(answers)) {
      throw new AppError(httpStatus.BAD_REQUEST, "Invalid input");
    }

    const user = await User.findOne({ email }).select("securityQuestions");
    const questions = user?.securityQuestions;

    if (!user || !questions || questions.length <= 0) {
      throw new AppError(httpStatus.NOT_FOUND, "Security questions not found");
    }

    if (questions.length !== answers.length) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "Number of answers does not match the number of security questions"
      );
    }

    // H5: answers are now bcrypt-hashed, but older accounts may still have
    // legacy plaintext answers — support both during the transition.
    const results = await Promise.all(
      questions.map(async (q, i) => {
        const provided = String(answers[i] ?? "")
          .trim()
          .toLowerCase();
        const stored = q.answer ?? "";
        if (stored.startsWith("$2")) {
          return bcrypt.compare(provided, stored);
        }
        return provided === stored.trim().toLowerCase();
      })
    );
    const matched = results.every(Boolean);

    if (!matched) {
      throw new AppError(
        httpStatus.UNAUTHORIZED,
        "Security answers do not match"
      );
    }

    const resetToken = createToken(
      { email },
      process.env.JWT_ACCESS_SECRET as string,
      process.env.JWT_ACCESS_EXPIRES_IN as string
    );
    user.verificationInfo.resetToken = resetToken;
    await user.save();

    res.status(httpStatus.OK).json({
      success: true,
      message: "Answers verified. You can now reset your password.",
      data: { resetToken },
    });
  }
);

/**********************************************
 * RESET PASSWORD USING THE SECURITY PASSWORD *
 **********************************************/
export const securityResetPassword = catchAsync(
  async (req: Request, res: Response) => {
    const { token } = req.query;
    const { newPassword } = req.body;

    if (!token || typeof token !== "string") {
      throw new AppError(httpStatus.BAD_REQUEST, "Reset token is required");
    }

    if (!newPassword || typeof newPassword !== "string") {
      throw new AppError(httpStatus.BAD_REQUEST, "New password is required");
    }

    // H5: cryptographically verify the token (signature + expiry) instead of a
    // bare DB string match, then bind it to the matching user. A leaked,
    // forged, or expired token no longer works.
    let decoded: JwtPayload;
    try {
      decoded = verifyToken(
        token,
        process.env.JWT_ACCESS_SECRET as string
      ) as JwtPayload;
    } catch {
      throw new AppError(
        httpStatus.UNAUTHORIZED,
        "Invalid or expired reset token"
      );
    }

    const user = await User.findOne({
      "verificationInfo.resetToken": token,
    }).select("+password");

    if (!user || decoded.email !== user.email) {
      throw new AppError(
        httpStatus.UNAUTHORIZED,
        "Invalid or expired reset token"
      );
    }

    // Set new password (bcrypt will hash in pre-save hook)
    user.password = newPassword;
    user.verificationInfo.resetToken = ""; // single-use: clear token
    await user.save();

    res.status(httpStatus.OK).json({
      success: true,
      message: "Password has been reset successfully",
    });
  }
);

/***************************
 * DEACTIVATE USER ACCOUNT *
 ***************************/
export const deactivateUser = catchAsync(async (req, res) => {
  const userId = req.user?._id;

  const user = await User.findById(userId);
  if (!user) throw new AppError(httpStatus.NOT_FOUND, "User not found");

  user.deactivate = true;
  user.dateOfdeactivate = new Date();
  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Account deactivated. Your data will be deleted in 30 days.",
    data: null,
  });
});

//actual deactivate user without 30 days
export const softDeactivateUser = catchAsync(async (req, res) => {
  const userId = req.user?._id;

  const user = await User.findById(userId);
  if (!user) throw new AppError(httpStatus.NOT_FOUND, "User not found");

  user.deactivate = true;
  user.dateOfdeactivate = undefined; // no scheduled deletion
  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message:
      "Account soft deactivated indefinitely. You can reactivate anytime.",
    data: null,
  });
});

/**********************************
 * GET ALL THE USER EMAIL AND _ID *
 **********************************/
export const getAllUserEmails = catchAsync(
  async (req: Request, res: Response) => {
    const { userId } = req.query;

    const company = await Company.findOne({ userId: userId as string });
    const companyId = company?._id?.toString();

    // Fetch all users with selected fields
    const users = await User.find(
      {},
      { _id: 1, email: 1, role: 1, name: 1, avatar: 1 }
    ).lean();

    // Get all employeesId and userId (company owner) from all companies
    const companies = await Company.find(
      {},
      { employeesId: 1, userId: 1 }
    ).lean();

    // Gather all employee IDs across all companies
    const allEmployeeIds = new Set<string>();
    companies.forEach((c) => {
      if (c.employeesId) {
        c.employeesId.forEach((id) => allEmployeeIds.add(id.toString()));
      }
      if (c.userId) {
        allEmployeeIds.add(c.userId.toString());
      }
    });

    let currentCompanyEmployeeIds: string[] = [];
    if (companyId) {
      const currentCompany = companies.find(
        (c) => c._id?.toString() === companyId
      );
      if (currentCompany) {
        currentCompanyEmployeeIds = [
          ...(currentCompany.employeesId?.map((id) => id.toString()) || []),
        ];
        if (currentCompany.userId) {
          currentCompanyEmployeeIds.push(currentCompany.userId.toString());
        }
      }
    }

    // Exclude all employees except those in the current company (if provided)
    const excludedIds = [...allEmployeeIds].filter(
      (id) => !currentCompanyEmployeeIds.includes(id)
    );

    const filteredUsers = users.filter(
      (u) => !excludedIds.includes(u._id.toString())
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "All user emails and IDs fetched successfully",
      data: filteredUsers,
    });
  }
);

export const getAllCompanies = catchAsync(
  async (req: Request, res: Response) => {
    const companies = await Company.find({})
      .populate({
        path: "userId",
        select: "name email phoneNum avatar.url role", // no need to specify `model`
      })
      .select(
        "cname clogo banner country city cemail cPhoneNumber industry service links"
      );

    const filteredCompanies = companies.map((company) => ({
      id: company._id,
      cname: company.cname,
      clogo: company.clogo,
      cemail: company.cemail,
      industry: company.industry,
    }));

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "All Companies fetched successfully",
      data: filteredCompanies,
    });
  }
);

/***************************
 * GET A SINGLE USER BY ID *
 ***************************/
// export const getUserById = catchAsync(async (req: Request, res: Response) => {
//   const id = req.user?._id;

//   const user = await User.findById(id).select(
//     "-password -verificationInfo -password_reset_token"
//   );

//   if (!user) {
//     throw new AppError(httpStatus.NOT_FOUND, "User not found");
//   }

//   const resume = await CreateResume.findOne({ userId: id }).select("sLink");
//   const user1: any = user.toObject();
//   user1.sLink = resume?.sLink || null;

//   const checkPayment = await paymentInfo
//     .findOne({ userId: user._id })
//     .sort({ updatedAt: -1 })
//     .populate("planId");

//   let expiryDate: Date | null = null;
//   let payAsYouGo: boolean | undefined = undefined;
//   let isValid = false;
//   console.log("checkPayment", checkPayment);
//   if (checkPayment?.planId === null || !checkPayment) {
//     payAsYouGo = false;
//     isValid = false;
//   } else {
//     if (checkPayment?.planId?.valid != "PayAsYouGo") {
//       if (checkPayment.planId.valid === "monthly") {
//         expiryDate = moment(checkPayment.updatedAt).add(1, "month").toDate();
//       } else if (checkPayment.planId.valid === "yearly") {
//         expiryDate = moment(checkPayment.updatedAt).add(1, "year").toDate();
//       }

//       isValid = expiryDate ? new Date() <= expiryDate : false;
//     } else if (checkPayment?.planId?.valid === "PayAsYouGo") {
//       const jobExists = await Job.exists({
//         userId: user._id,
//         createdAt: { $gte: checkPayment.updatedAt },
//       });

//       if (jobExists) {
//         payAsYouGo = false; // already posted a job after payment
//       } else {
//         payAsYouGo = true; // can still post
//       }

//       isValid = false;
//     } else {
//       payAsYouGo = true;
//       isValid = false;
//     }
//   }

//   sendResponse(res, {
//     statusCode: httpStatus.OK,
//     success: true,
//     message: "User fetched successfully",
//     data: { ...user1, isValid, payAsYouGo, plan: checkPayment?.planId },
//   });
// });

import { Following } from "../models/following.model"; // adjust path if needed
import { AwardsAndHonor } from "../models/awardsAndHonor.model";
import { ElevatorPitch } from "../models/elevatorPitch.model";
import { AppliedJob } from "../models/appliedJob.model";

export const getUserById = catchAsync(async (req: Request, res: Response) => {
  const id = req.user?._id;

  const user = await User.findById(id).select(
    "-password -verificationInfo -password_reset_token"
  );

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  const resume = await CreateResume.findOne({ userId: id }).select("sLink");
  const user1: any = user.toObject();
  user1.sLink = resume?.sLink || null;
  user1.title = resume?.title || null;

  // ---- PLAN / PAYMENT LOGIC (unchanged) ----
  const { plan: activePlan, payAsYouGo, isValid } = await resolveUserPlanState(
    user._id
  );

  // ---- FOLLOWING / FOLLOWERS LOGIC ----
  const followingList = await Following.find({ userId: id }).populate(
    "recruiterId companyId",
    "name email"
  ); // Add other fields you want to expose
  const followersList = await Following.find({
    $or: [{ recruiterId: id }, { companyId: id }],
  }).populate("userId", "name email");

  const following = followingList.map((f) => f.recruiterId || f.companyId);
  const followers = followersList.map((f) => f.userId);

  // ---- SEND RESPONSE ----
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User fetched successfully",
    data: {
      ...user1,
      isValid,
      payAsYouGo,
      plan: activePlan,
      following,
      followers,
    },
  });
});

export const getUserById1 = catchAsync(async (req: Request, res: Response) => {
  const { userId } = req.params;

  const user = await User.findById(userId).select(
    "-password -verificationInfo -password_reset_token"
  );

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  const resume = await CreateResume.findOne({ userId: userId }).select("sLink");
  const user1: any = user.toObject();
  user1.sLink = resume?.sLink || null;

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User fetched successfully",
    data: user1,
  });
});

/**************************
 * UPDATE USER INFO BY ID *
 **************************/

export const updateUser = catchAsync(async (req: Request, res: Response) => {
  const id = req.user?._id;
  const updateData = req.body;

  if (!id) throw new AppError(httpStatus.BAD_REQUEST, "User ID is required");

  const allowedFields = ["name", "phoneNum", "address"];
  const filteredData: Partial<Record<string, any>> = {};

  for (const field of allowedFields) {
    if (updateData[field] !== undefined) {
      filteredData[field] = updateData[field];
    }
  }

  // Handle avatar upload
  if (req.files && (req.files as any).photo) {
    const photo = (req.files as any).photo[0];
    const uploadResult = await uploadToCloudinary(photo.path, "avatars");

    // Remove old avatar from Cloudinary if needed (optional)
    const existingUser = await User.findById(id).select("avatar role");
    if (existingUser?.avatar?.url) {
      const publicId = path.basename(existingUser.avatar.url).split(".")[0];
      await deleteFromCloudinary(publicId);
    }

    filteredData.avatar = {
      url: uploadResult?.secure_url,
    };
    if (existingUser?.role === 'candidate') {
      const resume = await CreateResume.findOne({ userId: id })
      if (resume) {
        resume.photo = uploadResult?.secure_url!
        if (updateData.name) {
          resume.firstName = updateData.name.split(" ")[0]
          resume.lastName = updateData.name.split(" ")[1]
        }
        await resume.save()
      }
    } else if (existingUser?.role === 'recruiter') {
      const resume = await RecruiterAccount.findOne({ userId: id })
      if (resume) {
        resume.photo = uploadResult?.secure_url!
        if (updateData.name) {
          resume.firstName = updateData.name.split(" ")[0]
          resume.lastName = updateData.name.split(" ")[1]
        }
        await resume.save()
      }
    } else if (existingUser?.role === 'company') {
      const resume = await Company.findOne({ userId: id })
      if (resume) {
        resume.clogo = uploadResult?.secure_url!
        await resume.save()
      }
    }

    // Delete local file
    fs.unlinkSync(photo.path);
  }

  const updatedUser = await User.findByIdAndUpdate(id, filteredData, {
    new: true,
  }).select("-password -verificationInfo -password_reset_token");

  if (!updatedUser) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found or update failed");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "User updated successfully",
    data: updatedUser,
  });
});

// Refresh Token
export const refreshToken = catchAsync(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    throw new AppError(400, "Refresh token is required");
  }

  const decoded = verifyToken(
    refreshToken,
    process.env.JWT_REFRESH_SECRET as string
  ) as JwtPayload;
  const user = await User.findById(decoded._id);
  if (!user) {
    throw new AppError(401, "Invalid refresh token");
  }
  // H2: the presented refresh token must equal the one currently stored, so a
  // leaked or rotated-out token cannot keep minting access tokens.
  if (!user.refresh_token || user.refresh_token !== refreshToken) {
    throw new AppError(401, "Invalid refresh token");
  }
  const jwtPayload = {
    _id: user._id,
    email: user.email,
    role: user.role,
  };

  const accessToken = createToken(
    jwtPayload,
    process.env.JWT_ACCESS_SECRET as string,
    process.env.JWT_ACCESS_EXPIRES_IN as string
  );

  const refreshToken1 = createToken(
    jwtPayload,
    process.env.JWT_REFRESH_SECRET as string,
    process.env.JWT_REFRESH_EXPIRES_IN as string
  );
  user.refresh_token = refreshToken1;
  await user.save();

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Token refreshed successfully",
    data: { accessToken: accessToken, refreshToken: refreshToken1 },
  });
});

// H2: logout — revoke the stored refresh token so it can no longer be used.
export const logout = catchAsync(async (req, res) => {
  const user = await User.findById(req.user?._id);
  if (user) {
    user.refresh_token = undefined;
    await user.save();
  }
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Logged out successfully",
    data: "",
  });
});

/***************************
 * GET ALL CANDIDATE USERS *
 ***************************/
export const getCandidates = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // Find candidates
    const candidates = await User.find({ role: "candidate" })
      .skip(skip)
      .limit(limit)
      .select("-password -refresh_token"); // exclude sensitive fields

    // Count total candidates
    const total = await User.countDocuments({ role: "candidate" });

    res.status(200).json({
      success: true,
      message: "Candidates retrieved successfully",
      data: candidates,
      meta: {
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Error retrieving candidates",
      error: error.message,
    });
  }
};

/****************************
 * GET ALL RECRUITER USERS *
 ****************************/
export const getRecruitersWithAccounts = async (
  req: Request,
  res: Response
) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // Find recruiters
    const recruiters = await User.find({ role: "recruiter" })
      .skip(skip)
      .limit(limit)
      .select("-password -refresh_token") // hide sensitive fields
      .lean(); // return plain JS objects (faster)

    // Get all recruiter IDs
    const recruiterIds = recruiters.map((r) => r._id);

    // Find recruiter accounts linked to those users
    const recruiterAccounts = await RecruiterAccount.find({
      userId: { $in: recruiterIds },
    }).lean();

    // Merge recruiter + recruiterAccount by userId
    const recruitersWithAccounts = recruiters.map((recruiter) => {
      const account = recruiterAccounts.find(
        (acc) => acc.userId.toString() === recruiter._id.toString()
      );
      return {
        ...recruiter,
        recruiterAccount: account || null,
      };
    });

    // Count total recruiters
    const total = await User.countDocuments({ role: "recruiter" });

    res.status(200).json({
      success: true,
      message: "Recruiters with accounts retrieved successfully",
      data: recruitersWithAccounts,
      meta: {
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      // recruiter.controller.ts
      success: false,
      message: "Error retrieving recruiters",
      error: error.message,
    });
  }
};

/*************************
 * GET ALL COMPANY USERS *
 *************************/
export const getCompaniesWithAccounts = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // Find users with role = company
    const companies = await User.find({ role: "company" })
      .skip(skip)
      .limit(limit)
      .select("-password -refresh_token")
      .lean();

    // Collect company user IDs
    const companyUserIds = companies.map((c) => c._id);

    // Fetch company profiles linked to those users
    const companyProfiles = await Company.find({
      userId: { $in: companyUserIds },
    }).lean();

    // Merge user + company profile
    const companiesWithAccounts = companies.map((companyUser) => {
      const profile = companyProfiles.find(
        (p) => p.userId?.toString() === companyUser._id.toString()
      );
      return {
        ...companyUser,
        companyProfile: profile || null,
      };
    });

    // Count total
    const total = await User.countDocuments({ role: "company" });

    res.status(200).json({
      success: true,
      message: "Companies with accounts retrieved successfully",
      data: companiesWithAccounts,
      meta: {
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Error retrieving companies",
      error: error.message,
    });
  }
};

// fetch all user without admin
export const fetchAllUsers = catchAsync(async (req, res) => {
  const rawQ = Array.isArray(req.query.q)
    ? req.query.q[0]
    : req.query.q;
  const q = typeof rawQ === "string" ? rawQ.trim().toLowerCase() : "";
  const hasQuery = q.length > 0;

  const users = await User.find({
    role: { $ne: "admin" },
    deactivate: { $ne: true },
  }).select(
    "name avatar address phoneNum role slug"
  );

  // Enrich users with photo and immediatelyAvailable (for candidates)
  const enrichedUsers = await Promise.all(
    users.map(async (user) => {
      let photoUrl: string | null = null;
      let name1 = null;
      let immediatelyAvailable: boolean | null = null;
      let locationParts: string[] = [];

      if (user.role === "candidate") {
        const resume = await CreateResume.findOne({ userId: user._id }).select(
          "photo immediatelyAvailable location city country"
        );
        if (!resume) return null;
        photoUrl = resume?.photo || null;
        immediatelyAvailable =
          typeof resume.immediatelyAvailable === "boolean"
            ? resume.immediatelyAvailable
            : null;
        locationParts = [resume.location, resume.city, resume.country].filter(
          Boolean
        ) as string[];
      } else if (user.role === "recruiter") {
        const recruiter = await RecruiterAccount.findOne({
          userId: user._id,
        }).select("photo location city country");
        if (!recruiter) return null;
        photoUrl = recruiter?.photo || null;
        locationParts = [
          recruiter.location,
          recruiter.city,
          recruiter.country,
        ].filter(Boolean) as string[];
      } else if (user.role === "company") {
        const company = await Company.findOne({ userId: user._id }).select(
          "clogo cname city country"
        );
        if (!company) return null;
        photoUrl = company?.clogo || null;
        name1 = company?.cname;
        locationParts = [company.city, company.country].filter(
          Boolean
        ) as string[];
      }

      // safely assign to avatar.url and include immediatelyAvailable (only meaningful for candidates)
      const enriched = {
        ...user.toObject(),
        name: name1 ? name1 : user.name,
        avatar: {
          ...user.avatar,
          url: photoUrl || user.avatar?.url || null,
        },
        immediatelyAvailable,
      };

      return { user: enriched, locationParts };
    })
  );

  let data = enrichedUsers.filter(Boolean) as Array<{
    user: any;
    locationParts: string[];
  }>;

  if (hasQuery) {
    data = data.filter(({ user, locationParts }) => {
      const availabilityText =
        user?.immediatelyAvailable === true
          ? "immediately available immediate available"
          : "";
      const searchBlob = [
        user?.name,
        user?.role,
        user?.address,
        ...locationParts,
        availabilityText,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchBlob.includes(q);
    });
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "All users fetched successfully",
    data: data.map((item) => item.user),
  });
});


export const getAllUser = catchAsync(async (req, res) => {
  const users = await User.find()

  const usersWithEvp = await Promise.all(
    users.map(async (user) => {
      let evpAvailable = false

      if (user.role === 'candidate') {
        const resume = await CreateResume.findOne({ userId: user._id })
        evpAvailable = !!resume
      } else if (user.role === 'company') {
        const company = await Company.findOne({ userId: user._id })
        evpAvailable = !!company
      } else if (user.role === 'recruiter') {
        const recruiterProfile = await RecruiterAccount.findOne({ userId: user._id })
        evpAvailable = !!recruiterProfile
      }

      return {
        ...user.toObject(),
        evpAvailable,
      }
    })
  )

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'All users fetched successfully',
    data: usersWithEvp,
  })
})

const decrementJobCountersForFilter = async (filter: Record<string, any>) => {
  const jobCounts = await AppliedJob.aggregate([
    { $match: filter },
    { $group: { _id: "$jobId", count: { $sum: 1 } } },
  ]);

  const updates = jobCounts.filter((group) => group._id);

  await Promise.all(
    updates.map(({ _id, count }) =>
      Job.findByIdAndUpdate(_id, { $inc: { counter: -count } })
    )
  );
};

export const deleteUser = catchAsync(async (req, res) => {
  const id = req.params.id

  const user = await User.findById(id)

  if (!user) {
    throw new AppError(400, "User not found")
  }
  if (user.role === "candidate") {
    await CreateResume.findOneAndDelete({ userId: user._id })
    await Experience.deleteMany({ userId: user._id })
    await AwardsAndHonor.deleteMany({ userId: user._id })
    await ElevatorPitch.findOneAndDelete({ userId: user._id })
    await decrementJobCountersForFilter({ userId: user._id });
    await AppliedJob.deleteMany({ userId: user._id })
  } else if (user.role === "recruiter") {
    const jobs = await Job.find({ userId: user._id });
    const jobIds = jobs.map((j) => j._id);
    if (jobIds.length) {
      await decrementJobCountersForFilter({ jobId: { $in: jobIds } });
      await AppliedJob.deleteMany({ jobId: { $in: jobIds } });
    }
    await Job.deleteMany({ userId: user._id });
    await Job.findOneAndDelete({ userId: user._id })
    await RecruiterAccount.findOneAndDelete({ userId: user._id })
    await Experience.deleteMany({ userId: user._id })
    await AwardsAndHonor.deleteMany({ userId: user._id })
    await ElevatorPitch.findOneAndDelete({ userId: user._id })
    await Company.findOneAndUpdate({ employeesId: user._id }, { $pull: { employeesId: user._id } })
  } else if (user.role === "company") {
    const jobs = await Job.find({ userId: user._id });
    const jobIds = jobs.map((j) => j._id);
    if (jobIds.length) {
      await decrementJobCountersForFilter({ jobId: { $in: jobIds } });
      await AppliedJob.deleteMany({ jobId: { $in: jobIds } });
    }
    await Job.deleteMany({ userId: user._id });
    await Job.findOneAndDelete({ userId: user._id })
    await RecruiterAccount.findOneAndDelete({ userId: user._id })
    await Experience.deleteMany({ userId: user._id })
    await AwardsAndHonor.deleteMany({ userId: user._id })
    await ElevatorPitch.findOneAndDelete({ userId: user._id })
    await Company.findOneAndDelete({ userId: user._id })
  }


  const delet = await User.findByIdAndDelete(id)
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "User deleted successfully",
    data: ''
  })
})


export const emailChange = catchAsync(async (req, res) => {
  const id = req.user?._id;
  const email = typeof req.body.email === "string" ? req.body.email : "";
  if (!email) {
    throw new AppError(httpStatus.BAD_REQUEST, "New email is required");
  }
  const user = await User.findById(id)
  if (!user) {
    throw new AppError(404, "User not found")
  }
  if (user.email == email) {
    throw new AppError(400, "New email must be different from the current email")
  }
  const oldEmail = user.email
  const existingUser = await User.findOne({ email })
  if (existingUser) {
    throw new AppError(404, "This email is already associated with another account")
  }
  user.email = email;
  user.verificationInfo.token = "";
  user.verificationInfo.verified = true;
  await user.save();

  await Promise.all([
    CreateResume.updateMany({ userId: id, email: oldEmail }, { email }),
    Company.updateMany({ userId: id, cemail: oldEmail }, { cemail: email }),
    RecruiterAccount.updateMany({ userId: id, emailAddress: oldEmail }, { emailAddress: email }),
  ]);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Email changed successfully.",
    data: { email: user.email },
  });
})



