"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const contactUs_controller_1 = require("../controllers/contactUs.controller");
const router = express_1.default.Router();
router.post('/contact-us', contactUs_controller_1.createContactUs);
exports.default = router;
