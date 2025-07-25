import express from 'express'
import {
  createResume,
  deleteResume,
  streamElevatorPitch,
  secureStream,
  getEncryptionKey,
} from '../controllers/elevatorPitch.controller'
import { resumeUpload } from '../middlewares/multer.middleware'
import { protect } from '../middlewares/auth.middleware'
import { checkVideoAccess } from '../middlewares/checkVideoAccess.middleware'

const router = express.Router()

router.post('/video', protect, resumeUpload, createResume)


router.delete('/video', protect, deleteResume)

router.get(
  '/stream/:userId/:segment',
  //  protect,
  // checkVideoAccess,
  secureStream
)


router.get('/stream/:id',
  //  protect,
    // checkVideoAccess,
     streamElevatorPitch)




router.get('/key/:userId/:key', 
  // protect,
  //  checkVideoAccess,
    getEncryptionKey)


export default router