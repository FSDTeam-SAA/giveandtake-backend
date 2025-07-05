import express from 'express';
import { createExperience, deleteExperience, getExperienceById, getExperiencesByUser, updateExperience } from '../controllers/exprience.controller';
import { protect } from '../middlewares/auth.middleware';


const router = express.Router();
router.use(protect)

router.post('/', createExperience); 
router.get('/', getExperiencesByUser); 
router.get('/:id', getExperienceById); 
router.patch('/:id', updateExperience); 
router.delete('/:id', deleteExperience); 

export default router;
