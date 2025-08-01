"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const recruiterAccount_controller_1 = require("../controllers/recruiterAccount.controller");
// import { protect } from '../middlewares/auth.middleware'
const multer_middleware_1 = require("../middlewares/multer.middleware");
const router = express_1.default.Router();
router.post('/recruiter-account', 
//   protect,
multer_middleware_1.upload.fields([
    { name: 'videoFile', maxCount: 1 },
    { name: 'photo', maxCount: 1 },
]), recruiterAccount_controller_1.createRecruiterAccount);
router.get('/recruiter-account/:userId', 
// protect,
recruiterAccount_controller_1.getRecruiterAccountByUserId);
router.patch('/recruiter-account/:userId', 
//   protect,
multer_middleware_1.upload.fields([
    { name: 'videoFile', maxCount: 1 },
    { name: 'photo', maxCount: 1 },
]), recruiterAccount_controller_1.updateRecruiterAccount);
router.delete('/recruiter-account/:userId', 
// protect,
recruiterAccount_controller_1.deleteRecruiterAccount);
exports.default = router;
