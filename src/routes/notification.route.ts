import express from 'express'
import {
  getUserNotifications,
  markAllAsRead,
  markNotificationAsRead,
} from '../controllers/notification.controller'

const router = express.Router()

router.get('/:userId', getUserNotifications)
router.patch('/read/:userId', markAllAsRead)
router.patch('/:userId/read/:notificationId', markNotificationAsRead)

export default router
