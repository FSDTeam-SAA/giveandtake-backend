import express from 'express'
import {
  createCompany,
  updateCompany,
  getCompanyByUserId,
  deleteCompany,
  getCompanyEmployeesWithSkills,
  getCompanyByEmployeeId,
} from '../controllers/company.controller'
import { upload } from '../middlewares/multer.middleware'
import { protect } from '../middlewares/auth.middleware'

const router = express.Router()

router.post('/', upload.single('clogo'), protect ,createCompany)
router.put('/:id',upload.single('clogo'), updateCompany)
router.get('/user/:userId', getCompanyByUserId)
router.get('/employee/:userId', getCompanyByEmployeeId)
router.delete('/:id', deleteCompany)
router.get('/company-employess/skills/:userId', getCompanyEmployeesWithSkills)

export default router
