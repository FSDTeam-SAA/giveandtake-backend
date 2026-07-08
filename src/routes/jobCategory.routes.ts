import express from 'express'
import { upload } from '../middlewares/multer.middleware'
import { protect, isAdmin } from '../middlewares/auth.middleware'

import {
  createJobCategory,
  getAllCategorys,
  updateJobCategory,
  deleteJobCategory,
  getSingleCategorys,
} from '../controllers/jobCategory.controller'

const router = express.Router()
router.get('/job-category', getAllCategorys)
router.post(
  '/job-category',
  protect,
  isAdmin,
  upload.single('categoryIcon'),
  createJobCategory
)
router.patch(
  '/job-category/:id',
  protect,
  isAdmin,
  upload.single('categoryIcon'),
  updateJobCategory
)

router.delete('/job-category/:id', protect, isAdmin, deleteJobCategory)
router.get('/job-category/:id', protect, isAdmin, getSingleCategorys)
export default router
