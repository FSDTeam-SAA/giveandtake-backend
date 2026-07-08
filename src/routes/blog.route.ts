import express from 'express'
import {
  createBlog,
  getAllBlogs,
  getSingleBlog,
  updateBlog,
  deleteBlog,
} from '../controllers/blog.controller'
import { protect } from '../middlewares/auth.middleware'
import { upload } from '../middlewares/multer.middleware'

const router = express.Router()

router.post('/', protect, upload.single('image'), createBlog)
router.get('/get-all', getAllBlogs)
router.get('/:id', getSingleBlog)
router.patch('/:id', protect, upload.single('image'), updateBlog)
router.delete('/:id', protect, deleteBlog)

export default router
