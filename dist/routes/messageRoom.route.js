"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const messageRoom_controller_1 = require("../controllers/messageRoom.controller");
const router = express_1.default.Router();
router.post('/create-message-room', messageRoom_controller_1.createMessageRoom);
router.get('/get-message-rooms', messageRoom_controller_1.getMessageRooms);
router.delete('/delete-message-room/:roomId', messageRoom_controller_1.deleteMessageRoom);
router.patch('/:roomid/accept', messageRoom_controller_1.acceptMessageRoom);
exports.default = router;
