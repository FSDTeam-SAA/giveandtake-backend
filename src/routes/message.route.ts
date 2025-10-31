import express from 'express'
import {
  createMessage,
  getMessagesByRoom,
  updateMessage,
  deleteMessage,
} from '../controllers/message.controller'
import { upload } from '../middlewares/multer.middleware'
import { protect } from '../middlewares/auth.middleware'

const router = express.Router()

router.post('/', protect, upload.array('files'), createMessage)
router.get('/:roomId', getMessagesByRoom)
router.patch('/:messageId', updateMessage)
router.delete('/:messageId', deleteMessage)

export default router
