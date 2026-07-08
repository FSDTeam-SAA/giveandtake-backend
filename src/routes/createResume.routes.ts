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

router.post('/create-resume', upload.fields([
    { name: "photo", maxCount: 1 },   // first file field
    { name: "banner", maxCount: 1 }, // second file field
  ]), createResume)
router.get('/get-resume', protect, resumeOfaUser)
router.get('/get-resume/:slug', resumeOfaUser1)
router.patch('/resume/update', protect, upload.fields([
    { name: "photo", maxCount: 1 },   // first file field
    { name: "banner", maxCount: 1 }, // second file field
  ]), updateResume)
router.delete('/resume/delete', protect, deleteResume)

export default router
