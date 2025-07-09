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



app.use(notFound as never)
app.use(globalErrorHandler)

export default app
