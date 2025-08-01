"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const appliedJob_controller_1 = require("../controllers/appliedJob.controller");
const router = express_1.default.Router();
router.post('/', appliedJob_controller_1.applyForJob);
router.get('/job/:jobId', appliedJob_controller_1.getApplicationsByJob);
router.get('/user/:userId', appliedJob_controller_1.getApplicationsByUser);
router.patch('/:id/status', appliedJob_controller_1.updateApplicationStatus);
router.delete('/:id', appliedJob_controller_1.deleteApplication);
exports.default = router;
