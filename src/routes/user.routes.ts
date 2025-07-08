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
} from '../controllers/user.controller'
import { protect } from '../middlewares/auth.middleware'

const router = express.Router()

router.post('/user/register', register)
router.post('/user/login', login)
router.post('/user/verify', verifyEmail)
router.post('/user/forget', forgetPassword),
router.post('/user/reset-password', resetPassword)
router.post('/user/change-password', protect, changePassword)

/**********************
 * SECURITY QUESTIONS *
 **********************/
router.get('/default-security-questions', getDefaultSecurityQuestions)
router.post('/security-answers', submitSecurityAnswers)
router.post('/security-answers/reset-password', securityResetPassword)


export default router
