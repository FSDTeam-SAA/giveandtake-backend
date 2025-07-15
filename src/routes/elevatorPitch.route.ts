// routes/elevatorPitch.route.ts
import express from 'express'
import {
  createResume,
  updateResume,
  deleteResume,
  streamElevatorPitch,
} from '../controllers/elevatorPitch.controller'
import { resumeUpload } from '../middlewares/multer.middleware'

const router = express.Router()

router.post('/video', resumeUpload, createResume)
router.put('/video', resumeUpload, updateResume)
router.delete('/video', deleteResume)
router.get('/stream/:id', streamElevatorPitch)

export default router
