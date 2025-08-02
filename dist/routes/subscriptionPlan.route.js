"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const subscriptionPlan_controller_1 = require("../controllers/subscriptionPlan.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = express_1.default.Router();
router.post('/plans', auth_middleware_1.protect, subscriptionPlan_controller_1.createSubscriptionPlan);
router.get('/plans', subscriptionPlan_controller_1.getAllSubscriptionPlans);
router.patch('/plans/:id', auth_middleware_1.protect, subscriptionPlan_controller_1.updateSubscriptionPlan);
router.delete('/plans/:id', auth_middleware_1.protect, subscriptionPlan_controller_1.deleteSubscriptionPlan);
exports.default = router;
