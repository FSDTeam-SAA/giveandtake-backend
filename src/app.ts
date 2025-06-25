import express from 'express'
import userRoutes from './routes/user.routes'
import { globalErrorHandler } from './middlewares/globalErrorHandler'
import { notFound } from './middlewares/notFound'
const app = express()

app.use(express.json())

app.use('/api/users', userRoutes)

app.use(notFound as never)
app.use(globalErrorHandler)

export default app
