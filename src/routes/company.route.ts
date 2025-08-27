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

router.post('/', upload.fields([
    { name: "clogo", maxCount: 1 },   // first file field
    { name: "banner", maxCount: 1 }, // second file field
  ]), protect ,createCompany)
router.put('/:id',upload.fields([
    { name: "clogo", maxCount: 1 },   // first file field
    { name: "banner", maxCount: 1 }, // second file field
  ]),protect, updateCompany)
router.get('/user/:userId', getCompanyByUserId)
router.get('/employee/:userId', getCompanyByEmployeeId)
router.delete('/:id', deleteCompany)
router.get('/company-employess/skills/:userId', getCompanyEmployeesWithSkills)

export default router
