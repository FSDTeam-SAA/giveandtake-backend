import express from 'express'
import { globalErrorHandler } from './middlewares/globalErrorHandler'
import { notFound } from './middlewares/notFound'
import cors from 'cors'

import userRoutes from './routes/user.routes'
import jobRoutes from './routes/job.route'
import jobCategoryRoutes from './routes/jobCategory.routes'
import subscriptionPlanRoutes from './routes/subscriptionPlan.route'
import exprienceRoutes from './routes/exprience.route'
import contactUsRoutes from './routes/contactUs.route'
import recruiterAccoumntRoutes from './routes/recruiterAccount.routes'
import followingRoutes from './routes/following.route'
import messageRoomesRoutes from './routes/messageRoom.route'
import messageRoutes from './routes/message.route'
import appliedJobsRoutes from './routes/appliedJob.route'
import notificationRoutes from './routes/notification.route'
import paymentRoutes from './routes/payment.route'
import adminDashboardRoutes from './routes/adminDashboard.routes'
import bookmarkRoutes from './routes/bookmark.routes'


const app = express()

app.use(
  cors({
    origin: '*', //  frontend origin
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  })
)

app.use(express.json())

app.use('/api/v1', userRoutes)

app.use('/api/v1', jobRoutes)

app.use('/api/v1/category', jobCategoryRoutes)

app.use('/api/v1/subscription', subscriptionPlanRoutes)

app.use('/api/v1/experiences', exprienceRoutes)

app.use('/api/v1/contact', contactUsRoutes)

/**************************
 * APIS FOR RECRUITER APP *
 **************************/
app.use('/api/v1/recruiter', recruiterAccoumntRoutes)

/*****************************
 * APIS FOR FOLLOWING SYSTEM *
 *****************************/
app.use('/api/v1/following', followingRoutes)

/****************************
 * APIS FOR MESSAGING ROOMS *
 ****************************/
app.use('/api/v1/message-room', messageRoomesRoutes)

/*****************************
 * APIS FOR MESSAGING SYSTEM *
 *****************************/
app.use('/api/v1/message', messageRoutes)

/*************************
 * APIS FOR APPLIED JOBS *
 *************************/
app.use('/api/v1/applied-jobs', appliedJobsRoutes)

/********************************
 * APIS FOR NOTIFICATION SYSTEM *
 ********************************/
app.use('/api/v1/notifications', notificationRoutes)

/*********************
 * APIS FOR PAYMENTS *
 *********************/
app.use('/api/v1/payments', paymentRoutes)

/****************************
 * APIS FOR ADMIN DASHBOARD *
 ****************************/
app.use('/api/v1/admin', adminDashboardRoutes)

/********************
 * APIS FOR BOOKING *
 ********************/
app.use('/api/v1/bookmark', bookmarkRoutes)



app.use(notFound as never)
app.use(globalErrorHandler)

export default app
