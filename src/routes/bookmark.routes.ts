
import express from 'express'
import {
  createBookmark,
  getBookmarksByUser,
} from '../controllers/bookmark.controller'

const router = express.Router()

router.post('/', createBookmark)
router.get('/user/:userId', getBookmarksByUser)

export default router
