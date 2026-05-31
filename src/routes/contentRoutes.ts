import { Router } from "express";
import {
  upsertContent,
  getAllContent,
  getContentByType,
} from "../controllers/contentController";
import { protect, isAdmin } from "../middlewares/auth.middleware";

const router = Router();

router.post("/", protect, isAdmin, upsertContent); // create or update (admin only)
router.get("/", getAllContent);         // get all
router.get("/:type", getContentByType); // get one by type

export default router;
