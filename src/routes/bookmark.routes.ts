
import express from 'express'
import {
  createBookmark,
  getBookmarksByUser,
  updateBookmarked,
} from '../controllers/bookmark.controller'
import { protect } from '../middlewares/auth.middleware'

const router = express.Router()

router.post('/', createBookmark)
router.patch('/update',protect, updateBookmarked)
router.get('/user/:userId', getBookmarksByUser)

export default router
