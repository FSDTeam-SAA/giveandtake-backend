import express from 'express'
import {
  createResume,
  resumeOfaUser,
  updateResume,
  deleteResume,
  resumeOfaUser1,
} from '../controllers/createResume.controller'
import { protect } from '../middlewares/auth.middleware'
import { upload } from '../middlewares/multer.middleware'

const router = express.Router()

router.post('/create-resume', upload.single('photo'), createResume)
router.get('/get-resume', protect, resumeOfaUser)
router.get('/get-resume/:userId', protect, resumeOfaUser1)
router.patch('/resume/update', protect, upload.single('photo'), updateResume)
router.delete('/resume/delete', protect, deleteResume)

export default router
