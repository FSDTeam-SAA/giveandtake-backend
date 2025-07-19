import express from 'express'
import {
  createCompany,
  updateCompany,
  getCompanyByUserId,
  deleteCompany,
} from '../controllers/company.controller'

const router = express.Router()

router.post('/', createCompany)
router.put('/:id', updateCompany)
router.get('/user/:userId', getCompanyByUserId)
router.delete('/:id', deleteCompany)

export default router
