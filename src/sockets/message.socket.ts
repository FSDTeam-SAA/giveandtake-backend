import { Server } from 'socket.io'
import jwt, { JwtPayload } from 'jsonwebtoken'
import { User } from '../models/user.model'
import { MessageRoom } from '../models/messageRoom.model'

const OBJECT_ID_RE = /^[a-f\d]{24}$/i
const isObjectId = (v: unknown): v is string =>
  typeof v === 'string' && OBJECT_ID_RE.test(v)

export const setupMessageSocket = (io: Server) => {
  // ---- Handshake authentication (C8/H16) -------------------------------
  // Every socket connection must present a valid access token. The token is
  // taken from the handshake auth payload (preferred) or the query string.
  io.use(async (socket, next) => {
    try {
      const auth = socket.handshake.auth as { token?: unknown } | undefined
      const queryToken = socket.handshake.query?.token
      const token =
        (typeof auth?.token === 'string' && auth.token) ||
        (typeof queryToken === 'string' && queryToken) ||
        ''
      if (!token) return next(new Error('Unauthorized'))

      const decoded = jwt.verify(
        token,
        process.env.JWT_ACCESS_SECRET as string
      ) as JwtPayload
      const user = await User.findById(decoded._id)
      if (!user) return next(new Error('Unauthorized'))

      socket.data.user = user
      next()
    } catch {
      next(new Error('Unauthorized'))
    }
  })

  io.on('connection', (socket) => {
    const userId: string | undefined = socket.data.user?._id?.toString()
    console.log('User connected:', socket.id)

    // ---- joinRoom: only participants of the room may join (C8/H18) ------
    socket.on('joinRoom', async (roomId) => {
      if (!isObjectId(roomId) || !userId) return
      try {
        const room = await MessageRoom.findById(roomId)
        if (!room) return
        const participants = [room.userId, room.recruiterId, room.companyId]
          .filter(Boolean)
          .map((p: any) => p.toString())
        if (!participants.includes(userId)) return // not a participant
        socket.join(roomId)
      } catch {
        // swallow — never join on error
      }
    })

    // ---- joinNotification: ignore client-supplied id; own room only (H17)
    socket.on('joinNotification', () => {
      if (userId) socket.join(userId)
    })

    socket.on('leaveRoom', (roomId) => {
      if (isObjectId(roomId)) socket.leave(roomId)
    })

    socket.on('disconnect', () => {
      console.log('User disconnected :', socket.id)
    })

    // Auto-subscribe to own notification room (rooms are keyed by user id).
    if (userId) socket.join(userId)
  })
}
