import express from 'express'
import { createResume } from '../controllers/elevatorPitch.controller'
import { resumeUpload } from '../middlewares/multer.middleware'

const router = express.Router()

router.post('/video', resumeUpload, createResume)

export default router
