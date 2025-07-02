import express from 'express'
import { globalErrorHandler } from './middlewares/globalErrorHandler'
import { notFound } from './middlewares/notFound'

import userRoutes from './routes/user.routes'
import jobRoutes from './routes/job.route'
import jobCategoryRoutes from './routes/jobCategory.routes'
import subscriptionPlanRoutes from './routes/subscriptionPlan.route'

const app = express()

app.use(express.json())

app.use('/api/v1', userRoutes)

app.use('/api/v1', jobRoutes)

app.use('/api/v1/category', jobCategoryRoutes)

app.use('/api/v1/subscription', subscriptionPlanRoutes)

app.use(notFound as never)
app.use(globalErrorHandler)

export default app
