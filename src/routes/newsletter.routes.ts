import express from 'express'
import {
  createNewsletterSubscription,
  deleteNewsletterSubscription,
  getAllSubscribers,
  sendNewsletterToSubscribers,
} from '../controllers/newsletter.controller'
import { protect } from '../middlewares/auth.middleware'


const router = express.Router()

/*****************
 * PUBLIC ROUTES *
 *****************/
router.post('/subscribe', createNewsletterSubscription)
router.delete('/unsubscribe/:email', deleteNewsletterSubscription)

/**************************
 * ADMIN PROTECTED ROUTES *
 **************************/
router.get('/subscribers', protect,  getAllSubscribers)
router.post('/send', protect, sendNewsletterToSubscribers)

export default router
