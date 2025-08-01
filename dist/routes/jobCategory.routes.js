"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_middleware_1 = require("../middlewares/multer.middleware");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const jobCategory_controller_1 = require("../controllers/jobCategory.controller");
const router = express_1.default.Router();
router.get('/job-category', jobCategory_controller_1.getAllCategorys);
router.post('/job-category', auth_middleware_1.protect, auth_middleware_1.isAdmin, multer_middleware_1.upload.single('categoryIcon'), jobCategory_controller_1.createJobCategory);
router.patch('/job-category/:id', auth_middleware_1.protect, auth_middleware_1.isAdmin, multer_middleware_1.upload.single('categoryIcon'), jobCategory_controller_1.updateJobCategory);
router.delete('/job-category/:id', auth_middleware_1.protect, auth_middleware_1.isAdmin, jobCategory_controller_1.deleteJobCategory);
exports.default = router;
