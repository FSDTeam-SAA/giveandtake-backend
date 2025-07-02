import express from 'express'
import { createJobCategory } from '../controllers/jobCategory.controller'
import { upload } from '../middlewares/multer.middleware'
import { protect } from '../middlewares/auth.middleware'

const router = express.Router()

router.post(
  '/job-category',
  protect,
  upload.single('categoryIcon'),
  createJobCategory
)


export default router