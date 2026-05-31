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
  removeOrphanedElevatorPitchAssets,
  purgeExpiredJobApplications,
  deleteOldApplicationResumes,
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
  await notifyJobExpiryToRecruiters();
})

cron.schedule('1 0 * * *', async () => {
  console.log('Running elevator pitch & job cleanup tasks...')
  await notifyExpiredSubscriptions();
  await removeExpiredElevatorPitches();
  // await removeOrphanedElevatorPitchAssets();
  await purgeExpiredJobApplications();
})

cron.schedule('2 0 * * *', async () => {
  console.log('Running old application resume cleanup...')
  await deleteOldApplicationResumes();
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

// L20: keep a failing cron job / stray rejection from silently crashing the
// process, and shut down cleanly on termination signals.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason)
})
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err)
})

const gracefulShutdown = (signal: string) => {
  console.log(`${signal} received — shutting down gracefully...`)
  httpServer.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 10000).unref()
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
