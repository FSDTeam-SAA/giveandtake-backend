import express from 'express'
import {
  createCompany,
  updateCompany,
  getCompanyByUserId,
  deleteCompany,
} from '../controllers/company.controller'
import { upload } from '../middlewares/multer.middleware'
import { protect } from '../middlewares/auth.middleware'

const router = express.Router()

router.post('/', upload.single('clogo'), protect ,createCompany)
router.put('/:id', updateCompany)
router.get('/user/:userId', getCompanyByUserId)
router.delete('/:id', deleteCompany)

export default router
