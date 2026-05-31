import express from 'express'
import { getAdminDashboardStats } from '../controllers/adminDashboard.controller'
import { protect, isAdmin } from '../middlewares/auth.middleware'

const router = express.Router()

router.get('/stats', protect, isAdmin, getAdminDashboardStats)

export default router
