import { Notification } from '../models/notification.model'
import { Server } from 'socket.io'
import mongoose from 'mongoose'

let io: Server | null = null

export const initNotificationSocket = (socketIO: Server) => {
  io = socketIO
}

/********************************
 * CREATE AND EMIT NOTIFICATION *
 ********************************/
export const createNotification = async ({
  to,
  message,
  type,
  id,
}: {
  to: mongoose.Types.ObjectId
  message: string
  type: string
  id: mongoose.Types.ObjectId
}) => {
  const notification = await Notification.create({
    to,
    message,
    type,
    id,
  })

  // Emit live notification
  if (io) {
    io.to(to.toString()).emit('newNotification', notification)
  }

  return notification
}
