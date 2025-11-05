import express from 'express'
import {
  createCompany,
  updateCompany,
  getCompanyByUserId,
  deleteCompany,
  getCompanyEmployeesWithSkills,
  getCompanyByEmployeeId,
  getCompanyByUserSlug,
} from '../controllers/company.controller'
import { upload } from '../middlewares/multer.middleware'
import { protect } from '../middlewares/auth.middleware'
import { companyEmployeeAdd, companyEmployeeRemove, employeeReq, UpdateEmployeeReq } from '../controllers/assignCompanyReq.controller'

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
router.get('/companies/slug/:slug', getCompanyByUserSlug)
router.get('/employee/:userId', getCompanyByEmployeeId)
router.delete('/:id', deleteCompany)
router.get('/company-employess/skills/:userId', getCompanyEmployeesWithSkills)

router.post('/apply-for-company-employee',protect, employeeReq)
router.patch('/update-company-employee/:id',protect, UpdateEmployeeReq)
router.patch('/add-employee-to-company',protect, companyEmployeeAdd)
router.patch('/remove-employee-to-company',protect, companyEmployeeRemove)

export default router
