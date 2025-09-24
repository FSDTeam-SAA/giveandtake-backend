"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const elevatorPitch_controller_1 = require("../controllers/elevatorPitch.controller");
const multer_middleware_1 = require("../middlewares/multer.middleware");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = express_1.default.Router();
router.post('/video', auth_middleware_1.protect, multer_middleware_1.resumeUpload, elevatorPitch_controller_1.createResume);
router.get('/stream/:userId/:segment', elevatorPitch_controller_1.secureStream);
router.delete('/video', auth_middleware_1.protect, elevatorPitch_controller_1.deleteResume);
router.get('/stream/:id', elevatorPitch_controller_1.streamElevatorPitch);
router.get('/key/:userId/:key', elevatorPitch_controller_1.getEncryptionKey);
router.get('/all/elevator-pitches', elevatorPitch_controller_1.getAllElevatorPitches);
exports.default = router;
