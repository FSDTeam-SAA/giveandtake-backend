import express from 'express'
import {
  createMessageRoom,
  getMessageRooms,
  deleteMessageRoom,
  acceptMessageRoom,
} from '../controllers/messageRoom.controller'
import { protect } from '../middlewares/auth.middleware'

const router = express.Router()

router.post('/create-message-room', protect, createMessageRoom)
router.get('/get-message-rooms', protect, getMessageRooms)
router.delete('/delete-message-room/:roomId', protect, deleteMessageRoom)
router.patch('/:roomid/accept', protect, acceptMessageRoom)

export default router
