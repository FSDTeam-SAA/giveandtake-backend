import express from 'express'
import { getAdminDashboardStats } from '../controllers/adminDashboard.controller'

const router = express.Router()

router.get('/stats', getAdminDashboardStats)

export default router
