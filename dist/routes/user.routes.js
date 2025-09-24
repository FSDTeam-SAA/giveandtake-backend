"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const user_controller_1 = require("../controllers/user.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const multer_middleware_1 = require("../middlewares/multer.middleware");
const router = express_1.default.Router();
router.post("/user/register", user_controller_1.register);
router.post("/user/login", user_controller_1.login);
router.post("/user/verify", user_controller_1.verifyEmail);
router.post("/user/forget", user_controller_1.forgetPassword),
    router.post("/user/reset-password", user_controller_1.resetPassword);
router.post("/user/change-password", auth_middleware_1.protect, user_controller_1.changePassword);
router.patch("/user/deactivate", auth_middleware_1.protect, user_controller_1.deactivateUser);
router.patch("/user/disable", auth_middleware_1.protect, user_controller_1.softDeactivateUser);
/**********************
 * SECURITY QUESTIONS *
 **********************/
router.get("/default-security-questions", user_controller_1.getDefaultSecurityQuestions);
router.post("/security-answers", user_controller_1.submitSecurityAnswers);
router.post("/security-answers/check", user_controller_1.checkSubmitSecurityAnswers);
router.post("/verify-security-answers", user_controller_1.verifySecurityAnswers);
router.post("/security-answers/reset-password", user_controller_1.securityResetPassword);
router.get("/all/user", user_controller_1.getAllUserEmails);
router.get("/all/companies", user_controller_1.getAllCompanies);
router.get("/user/single", auth_middleware_1.protect, user_controller_1.getUserById);
router.get("/user/single/:userId", auth_middleware_1.protect, user_controller_1.getUserById1);
router.patch("/user/update", auth_middleware_1.protect, multer_middleware_1.resumeUpload, user_controller_1.updateUser);
router.post("/refresh-token", user_controller_1.refreshToken);
router.get("/candidates", user_controller_1.getCandidates);
router.get("/recruiters", user_controller_1.getRecruitersWithAccounts);
router.get("/companies", user_controller_1.getCompaniesWithAccounts);
// fetch all user without admin
router.get("/fetch/all/users", user_controller_1.fetchAllUsers);
exports.default = router;
