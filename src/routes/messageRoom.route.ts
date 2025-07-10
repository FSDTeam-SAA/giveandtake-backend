import express from 'express'
import {
  createMessageRoom,
  getMessageRooms,
  deleteMessageRoom,
  acceptMessageRoom,
} from '../controllers/messageRoom.controller'

const router = express.Router()

router.post('/message-room', createMessageRoom)
router.get('/message-rooms', getMessageRooms)
router.delete('/message-room/:roomId', deleteMessageRoom)
router.patch('/message-room/:roomId/accept', acceptMessageRoom)

export default router
