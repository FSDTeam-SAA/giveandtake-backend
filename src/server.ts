import app from './app'
import dotenv from 'dotenv'
import { connectDB } from './config/db'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import { setupMessageSocket } from './sockets/message.socket'

dotenv.config()

const PORT = process.env.PORT || 5000

const httpServer = createServer(app)

export const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
})

setupMessageSocket(io)

connectDB().then(() => {
  // app.listen(PORT, () => {
  //   console.log(`Server is running on port ${PORT}`)
  // })

  httpServer.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
  })
})
