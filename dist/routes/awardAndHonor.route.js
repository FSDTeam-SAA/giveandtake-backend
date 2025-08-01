"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const awardsAndHonor_controller_1 = require("../controllers/awardsAndHonor.controller");
const router = express_1.default.Router();
router.post('/award-honor', awardsAndHonor_controller_1.createAwardAndHonor);
router.get('/award-honor/:userId', awardsAndHonor_controller_1.getByUserId);
router.patch('/award-honor/:id', awardsAndHonor_controller_1.updateAwardsAndHonor);
router.delete('/award-honor/:id', awardsAndHonor_controller_1.deleteAwardsAndHonor);
exports.default = router;
