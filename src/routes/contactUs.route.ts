import express from 'express'
import { createContactUs } from '../controllers/contactUs.controller'

const router = express.Router()

router.post('/contact-us', createContactUs)

export default router
