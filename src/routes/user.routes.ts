import express from 'express'
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
} from '../controllers/user.controller'
import { protect } from '../middlewares/auth.middleware'
import { resumeUpload } from '../middlewares/multer.middleware'

const router = express.Router()

router.post('/user/register', register)
router.post('/user/login', login)
router.post('/user/verify', verifyEmail)
router.post('/user/forget', forgetPassword),
router.post('/user/reset-password', resetPassword)
router.post('/user/change-password', protect, changePassword)
router.patch('/user/deactivate', protect, deactivateUser)


/**********************
 * SECURITY QUESTIONS *
 **********************/
router.get('/default-security-questions', getDefaultSecurityQuestions)
router.post('/security-answers', submitSecurityAnswers)
router.post('/verify-security-answers', verifySecurityAnswers)
router.post('/security-answers/reset-password', securityResetPassword)

router.get('/all/user', getAllUserEmails)

router.get('/user/single', protect, getUserById)
router.patch('/user/update', protect, resumeUpload,updateUser)


export default router
