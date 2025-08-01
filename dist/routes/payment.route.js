"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const payment_controller_1 = require("../controllers/payment.controller");
const router = express_1.default.Router();
// paypal
router.post('/paypal/create-order', payment_controller_1.createPaypalOrder);
router.post('/paypal/capture-order', payment_controller_1.capturePaypalPayment);
router.get('/all-payments', payment_controller_1.getAllPayments);
router.get('/user/:userId', payment_controller_1.getPaymentsByUserId);
exports.default = router;
