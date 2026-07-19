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
  getPitchPlaybackToken,
} from "../controllers/elevatorPitch.controller";
import { optionalAuth, protect } from "../middlewares/auth.middleware";
import { gatePitchAccess } from "../middlewares/checkVideoAccess.middleware";

const router = express.Router();

router.post("/video/upload-url", protect, requestElevatorPitchUploadUrl);
router.post("/video/complete", protect, completeElevatorPitchUpload);
router.get("/video", protect, getElevatorPitchForUser);
router.delete("/video", protect, deleteResume);

// Mint a short-lived playback token for a pitch the viewer is allowed to watch
router.get("/playback-token/:pitchId", protect, getPitchPlaybackToken);

// Media routes: public for company/recruiter pitches, gated for candidates.
// optionalAuth populates req.user when a Bearer token is present without
// rejecting anonymous requests; gatePitchAccess enforces the per-role policy.
router.get(
  "/stream/:userId/:segment",
  optionalAuth,
  gatePitchAccess,
  secureStream
);

router.get("/stream/:id", optionalAuth, gatePitchAccess, streamElevatorPitch);

router.get("/key/:userId/:key", optionalAuth, gatePitchAccess, getEncryptionKey);

router.get("/all/elevator-pitches", getAllElevatorPitches);

export default router;
