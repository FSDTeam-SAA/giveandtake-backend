import express from 'express'
import {
  getUserNotifications,
  markAllAsRead,
  markNotificationAsRead,
} from '../controllers/notification.controller'
import { protect } from '../middlewares/auth.middleware'

const router = express.Router()

router.get('/:userId', protect, getUserNotifications)
router.patch('/read/:userId', protect, markAllAsRead)
router.patch('/:userId/read/:notificationId', protect, markNotificationAsRead)

export default router
