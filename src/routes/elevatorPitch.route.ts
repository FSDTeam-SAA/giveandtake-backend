// import express from 'express'
// import {
//   createResume,
//   deleteResume,
//   streamElevatorPitch,
//   secureStream,
//   getEncryptionKey,
//   getAllElevatorPitches,
// } from '../controllers/elevatorPitch.controller'
// import { resumeUpload } from '../middlewares/multer.middleware'
// import { isAdmin, protect } from '../middlewares/auth.middleware'
// import { checkVideoAccess } from '../middlewares/checkVideoAccess.middleware'

// const router = express.Router()

// router.post('/video', protect, resumeUpload, createResume)

// router.get('/stream/:userId/:segment', secureStream)

// router.delete('/video', protect, deleteResume)

// router.get('/stream/:id', streamElevatorPitch)

// router.get('/key/:userId/:key', getEncryptionKey)

// router.get('/all/elevator-pitches', getAllElevatorPitches)

// export default router

import express from "express";
import {
  requestElevatorPitchUploadUrl,
  completeElevatorPitchUpload,
  getElevatorPitchForUser,
  deleteResume,
  streamElevatorPitch,
  secureStream,
  getEncryptionKey,
  getAllElevatorPitches,
} from "../controllers/elevatorPitch.controller";
import { protect } from "../middlewares/auth.middleware";

const router = express.Router();

router.post("/video/upload-url", protect, requestElevatorPitchUploadUrl);
router.post("/video/complete", protect, completeElevatorPitchUpload);
router.get("/video", protect, getElevatorPitchForUser);
router.delete("/video", protect, deleteResume);

router.get("/stream/:userId/:segment", secureStream);

router.get("/stream/:id", streamElevatorPitch);

router.get("/key/:userId/:key", getEncryptionKey);

router.get("/all/elevator-pitches", getAllElevatorPitches);

export default router;
