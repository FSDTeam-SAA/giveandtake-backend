import express from 'express'
import {
  createRecruiterAccount,
  getRecruiterAccountByUserId,
  updateRecruiterAccount,
  deleteRecruiterAccount,
  getRecruiterAccountByUserSlug,
} from '../controllers/recruiterAccount.controller'
// import { protect } from '../middlewares/auth.middleware'
import { upload } from '../middlewares/multer.middleware'
import { protect } from '../middlewares/auth.middleware'

const router = express.Router()

router.post(
  '/recruiter-account',
  protect,
  upload.fields([
    { name: 'photo', maxCount: 1 },
    {name: 'banner', maxCount: 1},
    {name: 'videoFile', maxCount: 1}
  ]),
  createRecruiterAccount
)

router.get('/recruiter-account/:userId', getRecruiterAccountByUserId)
router.get('/recruiter-account/slug/:slug', getRecruiterAccountByUserSlug)
router.patch(
  '/recruiter-account/:userId',
  protect,
  upload.fields([
    { name: 'banner', maxCount: 1 },
    { name: 'photo', maxCount: 1 },
    { name: 'videoFile', maxCount: 1 },
  ]),
  updateRecruiterAccount
)

router.delete('/recruiter-account/:userId', protect, deleteRecruiterAccount)

export default router
