import express from 'express'
import { createResume } from '../controllers/createResume.controller'

const router = express.Router()

router.post('/create-resume', createResume)

export default router