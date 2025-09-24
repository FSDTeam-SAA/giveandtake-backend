"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const createResume_controller_1 = require("../controllers/createResume.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const multer_middleware_1 = require("../middlewares/multer.middleware");
const router = express_1.default.Router();
router.post('/create-resume', multer_middleware_1.upload.fields([
    { name: "photo", maxCount: 1 }, // first file field
    { name: "banner", maxCount: 1 }, // second file field
]), createResume_controller_1.createResume);
router.get('/get-resume', auth_middleware_1.protect, createResume_controller_1.resumeOfaUser);
router.get('/get-resume/:userId', createResume_controller_1.resumeOfaUser1);
router.patch('/resume/update', auth_middleware_1.protect, multer_middleware_1.upload.fields([
    { name: "photo", maxCount: 1 }, // first file field
    { name: "banner", maxCount: 1 }, // second file field
]), createResume_controller_1.updateResume);
router.delete('/resume/delete', auth_middleware_1.protect, createResume_controller_1.deleteResume);
exports.default = router;
