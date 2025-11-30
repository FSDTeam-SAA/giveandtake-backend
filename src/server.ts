import app from './app'
import dotenv from 'dotenv'
import { connectDB } from './config/db'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import { setupMessageSocket } from './sockets/message.socket'
import cron from 'node-cron'
import {
  deleteOldDeactivatedUsers,
  notifyExpiredSubscriptions,
  notifyJobExpiryToRecruiters,
  updateExpiredPlans,
  removeExpiredElevatorPitches,
  purgeExpiredJobApplications,
} from './jobs/deleteOldDeactivatedUsers'
import path from 'path'
import { initNotificationSocket } from './sockets/notification.service'

dotenv.config()

const PORT = process.env.PORT || 5000

const httpServer = createServer(app)

export const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
})

initNotificationSocket(io)

// Runs every day at midnight
cron.schedule('0 0 * * *', async () => {
  console.log('Running user deletion job...')
  await deleteOldDeactivatedUsers()
  await updateExpiredPlans(); 
  await notifyExpiredSubscriptions();
  await notifyJobExpiryToRecruiters();
})

cron.schedule('1 0 * * *', async () => {
  console.log('Running elevator pitch & job cleanup tasks...')
  await removeExpiredElevatorPitches();
  await purgeExpiredJobApplications();
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
