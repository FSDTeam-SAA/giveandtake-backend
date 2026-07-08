import express from 'express'
import {
  createMessageRoom,
  getMessageRooms,
  deleteMessageRoom,
  acceptMessageRoom,
} from '../controllers/messageRoom.controller'

const router = express.Router()

router.post('/create-message-room', createMessageRoom)
router.get('/get-message-rooms', getMessageRooms)
router.delete('/delete-message-room/:roomId', deleteMessageRoom)
router.patch('/:roomid/accept', acceptMessageRoom)

export default router
