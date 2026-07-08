import { Server } from 'socket.io'
import mongoose from 'mongoose'
import { Notification } from '../models/notification.model'

let io: Server | null = null

export const initNotificationSocket = (socketIO: Server) => {
  io = socketIO
}

const toPlainNotification = (notification: any) =>
  typeof notification?.toObject === 'function'
    ? notification.toObject()
    : notification

const getRoomId = (userId?: mongoose.Types.ObjectId | string | null) => {
  if (!userId) return null
  return typeof userId === 'string' ? userId : userId.toString()
}

export const broadcastUnreadCount = async (
  userId: mongoose.Types.ObjectId | string,
  countOverride?: number
) => {
  const roomId = getRoomId(userId)
  if (!roomId) return 0

  const count =
    typeof countOverride === 'number'
      ? countOverride
      : await Notification.countDocuments({
          to: userId,
          isViewed: false,
        })

  if (io) {
    io.to(roomId).emit('notificationCountUpdated', { count })
  }

  return count
}

const emitNewNotification = async (notification: any) => {
  const roomId = getRoomId(notification?.to)
  if (!io || !roomId) return

  const unreadCount = await broadcastUnreadCount(notification.to)

  io.to(roomId).emit('newNotification', {
    notification: toPlainNotification(notification),
    count: unreadCount,
  })
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

  await emitNewNotification(notification)

  return notification
}
