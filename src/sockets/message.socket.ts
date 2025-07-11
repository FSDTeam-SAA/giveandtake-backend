import { Server } from 'socket.io'

export const setupMessageSocket = (io: Server) => {
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id)

    socket.on('joinRoom', (roomId) => {
      socket.join(roomId)
    })

    socket.on('leaveRoom', (roomId) => {
      socket.leave(roomId)
    })

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id)
    })
  })
}
