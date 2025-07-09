import express from 'express'
import {
  createRecruiterAccount,
  getRecruiterAccountByUserId,
  updateRecruiterAccount,
  deleteRecruiterAccount,
} from '../controllers/recruiterAccount.controller'
import { protect } from '../middlewares/auth.middleware'

const router = express.Router()

router.post('/recruiter-account', protect, createRecruiterAccount)
router.get('/recruiter-account/:userId', protect, getRecruiterAccountByUserId)
router.patch('/recruiter-account/:userId', protect, updateRecruiterAccount)
router.delete('/recruiter-account/:userId', protect, deleteRecruiterAccount)

export default router
