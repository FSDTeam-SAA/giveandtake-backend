import express from 'express'
import {
  createResume,
  streamElevatorPitch,
} from '../controllers/elevatorPitch.controller'
import { resumeUpload } from '../middlewares/multer.middleware'

const router = express.Router()

router.post('/video', resumeUpload, createResume)

router.get('/stream/:id', streamElevatorPitch)


export default router
