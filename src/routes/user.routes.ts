import express from "express";
import {
  register,
  verifyEmail,
  login,
  forgetPassword,
  resetPassword,
  changePassword,
  resendVerificationOtp,
  getDefaultSecurityQuestions,
  submitSecurityAnswers,
  securityResetPassword,
  verifySecurityAnswers,
  deactivateUser,
  getAllUserEmails,
  getUserById,
  updateUser,
  refreshToken,
  getUserById1,
  getCandidates,
  getRecruitersWithAccounts,
  getCompaniesWithAccounts,
  fetchAllUsers,
  getAllCompanies,
  softDeactivateUser,
  checkSubmitSecurityAnswers,
  otpVerifyResetPassword,
  getAllUser,
  deleteUser,
  emailChange,
  logout,
} from "../controllers/user.controller";
import { protect, isAdmin } from "../middlewares/auth.middleware";
import { authLimiter, otpLimiter } from "../middlewares/rateLimit.middleware";
import { resumeUpload } from "../middlewares/multer.middleware";

const router = express.Router();

router.post("/user/register", authLimiter, register);
router.post("/user/login", authLimiter, login);
router.post("/user/verify", otpLimiter, verifyEmail);
router.post("/user/resend-otp", otpLimiter, resendVerificationOtp);
router.post("/user/verify-reset-otp", otpLimiter, otpVerifyResetPassword);
router.post("/user/forget", otpLimiter, forgetPassword);
router.post("/user/reset-password", otpLimiter, resetPassword);
router.post("/user/change-password", protect, changePassword);
router.post("/user/logout", protect, logout);
router.patch("/user/deactivate", protect, deactivateUser);
router.patch("/user/disable", protect, softDeactivateUser);

/**********************
 * SECURITY QUESTIONS *
 **********************/
router.get("/default-security-questions", getDefaultSecurityQuestions);
router.post("/security-answers", otpLimiter, submitSecurityAnswers);
router.post("/security-answers/check", otpLimiter, checkSubmitSecurityAnswers);
router.post("/verify-security-answers", otpLimiter, verifySecurityAnswers);
router.post(
  "/security-answers/reset-password",
  otpLimiter,
  securityResetPassword
);

// getAllUserEmails exposes user emails -> require authentication (H15/H29).
router.get("/all/user", protect, getAllUserEmails);
router.post("/change-email", protect, emailChange);
// getAllUser returns full user documents -> admin only (C3/H29).
router.get("/all/all-user", protect, isAdmin, getAllUser);
router.delete("/delete/user/:id", protect, isAdmin, deleteUser);
router.get("/all/companies", getAllCompanies);

router.get("/user/single", protect, getUserById);
router.get("/user/single/:userId", protect, getUserById1);
router.patch("/user/update", protect, resumeUpload, updateUser);
router.post("/refresh-token", authLimiter, refreshToken);

// People-directory listings expose PII (emails/phones) -> require auth (H15).
router.get("/candidates", protect, getCandidates);
router.get("/recruiters", protect, getRecruitersWithAccounts);
router.get("/companies", protect, getCompaniesWithAccounts);

// fetch all user without admin
router.get("/fetch/all/users", protect, fetchAllUsers);

export default router;
