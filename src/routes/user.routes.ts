import express from 'express'
import {
  register,
  verifyEmail,
  login,
  forgetPassword,
  resetPassword,
  changePassword,
} from '../controllers/user.controller'
import { protect } from '../middlewares/auth.middleware'

const router = express.Router()

router.post('/users/register', register)
router.post('/users/login', login)
router.post('/users/verify', verifyEmail)
router.post('/users/forget', forgetPassword),
  router.post('/users/reset-password', resetPassword)
router.post('/users/change-password', protect, changePassword)

export default router
