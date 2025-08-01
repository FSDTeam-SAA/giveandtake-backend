"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const exprience_controller_1 = require("../controllers/exprience.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = express_1.default.Router();
router.use(auth_middleware_1.protect);
router.post('/', exprience_controller_1.createExperience);
router.get('/', exprience_controller_1.getExperiencesByUser);
router.get('/:id', exprience_controller_1.getExperienceById);
router.patch('/:id', exprience_controller_1.updateExperience);
router.delete('/:id', exprience_controller_1.deleteExperience);
exports.default = router;
