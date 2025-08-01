"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const company_controller_1 = require("../controllers/company.controller");
const multer_middleware_1 = require("../middlewares/multer.middleware");
const router = express_1.default.Router();
router.post('/', multer_middleware_1.upload.single('clogo'), company_controller_1.createCompany);
router.put('/:id', company_controller_1.updateCompany);
router.get('/user/:userId', company_controller_1.getCompanyByUserId);
router.delete('/:id', company_controller_1.deleteCompany);
exports.default = router;
