import express from 'express'
import {
  createBlog,
  getAllBlogs,
  getSingleBlog,
  updateBlog,
  deleteBlog,
} from '../controllers/blog.controller'
import { protect } from '../middlewares/auth.middleware'

const router = express.Router()

router.post('/', protect, createBlog)
router.get('/get-all', getAllBlogs)
router.get('/:id', getSingleBlog)
router.patch('/:id', protect, updateBlog)
router.delete('/:id', protect, deleteBlog)

export default router
