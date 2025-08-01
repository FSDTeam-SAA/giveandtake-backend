"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const following_controller_1 = require("../controllers/following.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = express_1.default.Router();
router.post('/follow', auth_middleware_1.protect, following_controller_1.followEntity);
router.delete('/unfollow', auth_middleware_1.protect, following_controller_1.unfollowEntity);
router.get('/count', following_controller_1.countFollowers);
exports.default = router;
