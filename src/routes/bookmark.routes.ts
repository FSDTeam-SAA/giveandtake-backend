
import express from 'express'
import {
  createBookmark,
  getBookmarksByUser,
  updateBookmarked,
} from '../controllers/bookmark.controller'

const router = express.Router()

router.post('/', createBookmark)
router.patch('/update/:jobId', updateBookmarked)
router.get('/user/:userId', getBookmarksByUser)

export default router
