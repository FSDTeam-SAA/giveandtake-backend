import express from 'express'
import {
  createResume,
  resumeOfaUser,
} from '../controllers/createResume.controller'

const router = express.Router()

router.post('/create-resume', createResume)
router.get('/get-resume', resumeOfaUser)

export default router