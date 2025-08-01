"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const message_controller_1 = require("../controllers/message.controller");
const multer_middleware_1 = require("../middlewares/multer.middleware");
const router = express_1.default.Router();
router.post('/', multer_middleware_1.upload.array('files'), message_controller_1.createMessage);
router.get('/:roomId', message_controller_1.getMessagesByRoom);
router.patch('/:messageId', message_controller_1.updateMessage);
router.delete('/:messageId', message_controller_1.deleteMessage);
exports.default = router;
