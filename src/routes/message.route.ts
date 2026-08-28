import express from 'express'
import {
  createMessage,
  getMessagesByRoom,
  updateMessage,
  deleteMessage,
  getMyUnreadMessageCount,
  markRoomMessagesAsRead,
} from '../controllers/message.controller'
import { upload } from '../middlewares/multer.middleware'
import { protect } from '../middlewares/auth.middleware'

const router = express.Router()

router.post('/', protect, upload.array('files'), createMessage)
router.get('/unread-count', protect, getMyUnreadMessageCount)
router.patch('/rooms/:roomId/read', protect, markRoomMessagesAsRead)
router.get('/:roomId', getMessagesByRoom)
router.patch('/:messageId', updateMessage)
router.delete('/:messageId', deleteMessage)

export default router
