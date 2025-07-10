import express from 'express'
import {
  createMessageRoom,
  getMessageRooms,
  deleteMessageRoom,
  acceptMessageRoom,
} from '../controllers/messageRoom.controller'

const router = express.Router()

router.post('/create-message-room', createMessageRoom)
router.get('/get-messagerooms', getMessageRooms)
router.delete('/deleteMessageRoom/:roomId', deleteMessageRoom)
router.patch('/:roomId/accept', acceptMessageRoom)

export default router
