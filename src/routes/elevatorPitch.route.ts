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
import { protect, protectAllowQueryToken } from "../middlewares/auth.middleware";
import { checkVideoAccess } from "../middlewares/checkVideoAccess.middleware";

const router = express.Router();

router.post("/video/upload-url", protect, requestElevatorPitchUploadUrl);
router.post("/video/complete", protect, completeElevatorPitchUpload);
router.get("/video", protect, getElevatorPitchForUser);
router.delete("/video", protect, deleteResume);

// Sub-resource route (nested playlist + .ts segments). Native video players
// don't send the Authorization header on HLS sub-requests, so this is NOT
// behind `protect`; it is authorised by the short-lived `?t=` media token that
// streamElevatorPitch bakes into the rewritten playlist URLs (see secureStream).
router.get("/stream/:userId/:segment", secureStream);

// Master playlist route, keyed by the pitch :id. Accepts the access token from
// either the Authorization header (web) or a `?token=` query param (native
// mobile players that can't set headers on HLS), then checkVideoAccess applies.
router.get("/stream/:id", protectAllowQueryToken, checkVideoAccess, streamElevatorPitch);

// AES key route — same story: the native player fetches the key without an
// Authorization header, so it is authorised by the `?t=` media token inside
// getEncryptionKey rather than by `protect`.
router.get("/key/:userId/:key", getEncryptionKey);

router.get("/all/elevator-pitches", protect, getAllElevatorPitches);

export default router;
