"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const blog_controller_1 = require("../controllers/blog.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const router = express_1.default.Router();
router.post('/', auth_middleware_1.protect, blog_controller_1.createBlog);
router.get('/get-all', blog_controller_1.getAllBlogs);
router.get('/:id', blog_controller_1.getSingleBlog);
router.patch('/:id', auth_middleware_1.protect, blog_controller_1.updateBlog);
router.delete('/:id', auth_middleware_1.protect, blog_controller_1.deleteBlog);
exports.default = router;
