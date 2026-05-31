import express from 'express'
import {
  createNewsletterSubscription,
  deleteNewsletterSubscription,
  getAllSubscribers,
  sendNewsletterToSubscribers,
} from '../controllers/newsletter.controller'
import { protect, isAdmin } from '../middlewares/auth.middleware'


const router = express.Router()

/*****************
 * PUBLIC ROUTES *
 *****************/
router.post('/subscribe', createNewsletterSubscription)
router.delete('/unsubscribe/:email', deleteNewsletterSubscription)

/**************************
 * ADMIN PROTECTED ROUTES *
 **************************/
router.get('/subscribers', protect, isAdmin, getAllSubscribers)
router.post('/send', protect, isAdmin, sendNewsletterToSubscribers)

export default router
