import express from 'express'
import {
  createResume,
  deleteResume,
  streamElevatorPitch,
  secureStream,
  getEncryptionKey,
  getAllElevatorPitches,
} from '../controllers/elevatorPitch.controller'
import { resumeUpload } from '../middlewares/multer.middleware'
import { isAdmin, protect } from '../middlewares/auth.middleware'
import { checkVideoAccess } from '../middlewares/checkVideoAccess.middleware'

const router = express.Router()

router.post('/video', protect, resumeUpload, createResume)

router.get('/stream/:userId/:segment', protect, checkVideoAccess, secureStream)

router.delete('/video', protect, deleteResume)

router.get('/stream/:id', protect, checkVideoAccess, streamElevatorPitch)

router.get('/key/:userId/:key', protect, checkVideoAccess, getEncryptionKey)

router.get('/all/elevator-pitches', protect, getAllElevatorPitches)

export default router
