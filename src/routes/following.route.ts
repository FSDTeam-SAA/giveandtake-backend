import express from 'express'
import {
  followEntity,
  unfollowEntity,
  countFollowers,
} from '../controllers/following.controller'
import { protect } from '../middlewares/auth.middleware'

const router = express.Router()

router.post(
  '/follow',
  protect,
  followEntity
)
router.delete(
  '/unfollow',
  protect,
  unfollowEntity
)
router.get('/count', countFollowers)

export default router
