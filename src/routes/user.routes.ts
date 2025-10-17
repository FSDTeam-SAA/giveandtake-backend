import express from "express";
import {
  register,
  verifyEmail,
  login,
  forgetPassword,
  resetPassword,
  changePassword,
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
} from "../controllers/user.controller";
import { protect } from "../middlewares/auth.middleware";
import { resumeUpload } from "../middlewares/multer.middleware";

const router = express.Router();

router.post("/user/register", register);
router.post("/user/login", login);
router.post("/user/verify", verifyEmail);
router.post("/user/verify-reset-otp", otpVerifyResetPassword);
router.post("/user/forget", forgetPassword),
router.post("/user/reset-password", resetPassword);
router.post("/user/change-password", protect, changePassword);
router.patch("/user/deactivate", protect, deactivateUser);
router.patch("/user/disable", protect, softDeactivateUser);

/**********************
 * SECURITY QUESTIONS *
 **********************/
router.get("/default-security-questions", getDefaultSecurityQuestions);
router.post("/security-answers", submitSecurityAnswers);
router.post("/security-answers/check", checkSubmitSecurityAnswers);
router.post("/verify-security-answers", verifySecurityAnswers);
router.post("/security-answers/reset-password", securityResetPassword);

router.get("/all/user", getAllUserEmails);
router.post("/change-email",protect, emailChange);
router.get("/all/all-user", getAllUser);
router.delete("/delete/user/:id", deleteUser);
router.get("/all/companies", getAllCompanies);

router.get("/user/single", protect, getUserById);
router.get("/user/single/:userId", protect, getUserById1);
router.patch("/user/update", protect, resumeUpload, updateUser);
router.post("/refresh-token", refreshToken);

router.get("/candidates", getCandidates);
router.get("/recruiters", getRecruitersWithAccounts);
router.get("/companies", getCompaniesWithAccounts);

// fetch all user without admin
router.get("/fetch/all/users", fetchAllUsers);

export default router;
