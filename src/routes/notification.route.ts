import express from 'express'
import {
  getUserNotifications,
  markAllAsRead,
} from '../controllers/notification.controller'

const router = express.Router()

router.get('/notifications/:userId', getUserNotifications)
router.patch('/notifications/read/:userId', markAllAsRead)

export default router
