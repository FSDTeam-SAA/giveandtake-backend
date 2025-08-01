import express from 'express'
import {
  createMessage,
  getMessagesByRoom,
  updateMessage,
  deleteMessage,
} from '../controllers/message.controller'
import { upload } from '../middlewares/multer.middleware'

const router = express.Router()

router.post('/', upload.array('files'), createMessage)
router.get('/:roomId', getMessagesByRoom)
router.patch('/:messageId', updateMessage)
router.delete('/:messageId', deleteMessage)

export default router
