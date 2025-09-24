"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const company_controller_1 = require("../controllers/company.controller");
const multer_middleware_1 = require("../middlewares/multer.middleware");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const assignCompanyReq_controller_1 = require("../controllers/assignCompanyReq.controller");
const router = express_1.default.Router();
router.post('/', multer_middleware_1.upload.fields([
    { name: "clogo", maxCount: 1 }, // first file field
    { name: "banner", maxCount: 1 }, // second file field
]), auth_middleware_1.protect, company_controller_1.createCompany);
router.put('/:id', multer_middleware_1.upload.fields([
    { name: "clogo", maxCount: 1 }, // first file field
    { name: "banner", maxCount: 1 }, // second file field
]), auth_middleware_1.protect, company_controller_1.updateCompany);
router.get('/user/:userId', company_controller_1.getCompanyByUserId);
router.get('/employee/:userId', company_controller_1.getCompanyByEmployeeId);
router.delete('/:id', company_controller_1.deleteCompany);
router.get('/company-employess/skills/:userId', company_controller_1.getCompanyEmployeesWithSkills);
router.post('/apply-for-company-employee', auth_middleware_1.protect, assignCompanyReq_controller_1.employeeReq);
router.patch('/update-company-employee/:id', auth_middleware_1.protect, assignCompanyReq_controller_1.UpdateEmployeeReq);
router.patch('/add-employee-to-company', auth_middleware_1.protect, assignCompanyReq_controller_1.companyEmployeeAdd);
router.patch('/remove-employee-to-company', auth_middleware_1.protect, assignCompanyReq_controller_1.companyEmployeeRemove);
exports.default = router;
