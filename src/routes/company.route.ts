import express from 'express'
import {
  createCompany,
  updateCompany,
  getCompanyByUserId,
  deleteCompany,
} from '../controllers/company.controller'
import { upload } from '../middlewares/multer.middleware'

const router = express.Router()

router.post('/', upload.single('clogo'), createCompany)
router.put('/:id', updateCompany)
router.get('/user/:userId', getCompanyByUserId)
router.delete('/:id', deleteCompany)

export default router
