import { Router } from "express";
import {
  getScrollingInfo,
  updateScrollingInfo,
} from "../controllers/scrollingInfo.controller";
import { isAdmin, protect } from "../middlewares/auth.middleware";

const router = Router();

router.get("/", getScrollingInfo);
router.put("/", protect, isAdmin, updateScrollingInfo);

export default router;
