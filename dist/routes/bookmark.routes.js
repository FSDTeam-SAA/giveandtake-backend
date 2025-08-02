"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const bookmark_controller_1 = require("../controllers/bookmark.controller");
const router = express_1.default.Router();
router.post('/', bookmark_controller_1.createBookmark);
router.get('/user/:userId', bookmark_controller_1.getBookmarksByUser);
exports.default = router;
