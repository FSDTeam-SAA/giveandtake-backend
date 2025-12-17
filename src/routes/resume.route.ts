import express from 'express'
import {
  createResume,
  deleteResume,
  getResumeByUserId,
  getResumeByUserId1,
  getResumeDownloadUrl,
  updateResumeFiles,
} from '../controllers/resume.controller'
import { protect } from '../middlewares/auth.middleware'
import { resumeFileUpload } from '../middlewares/multer.middleware'

const router = express.Router()

router.post('/', protect, resumeFileUpload, createResume)
router.get('/my', protect, getResumeByUserId)
router.get('/user/:userId', protect, getResumeByUserId1)
router.get('/:resumeId/download', protect, getResumeDownloadUrl)
router.patch('/:resumeId', protect, resumeFileUpload, updateResumeFiles)
router.delete('/:resumeId', protect, deleteResume)

export default router
