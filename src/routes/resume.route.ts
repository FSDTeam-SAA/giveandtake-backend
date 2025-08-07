import express from 'express'
import {
  createResume,
  deleteResume,
  getResumeByUserId,
  updateResumeFiles,
} from '../controllers/resume.controller'
import { protect } from '../middlewares/auth.middleware'
import { resumeFileUpload } from '../middlewares/multer.middleware'

const router = express.Router()

router.post('/', protect, resumeFileUpload, createResume)
router.get('/my', protect, getResumeByUserId)
router.patch('/:resumeId', protect, resumeFileUpload, updateResumeFiles)
router.delete('/:resumeId', protect, deleteResume)

export default router
