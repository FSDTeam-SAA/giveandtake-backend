import express from 'express'
import { createResume } from '../controllers/createResume.controller'
import { resumeUpload } from '../middlewares/multer.middleware'

const router = express.Router()

router.post('/resume', resumeUpload, createResume)

export default router
