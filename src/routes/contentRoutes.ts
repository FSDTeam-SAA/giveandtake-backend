import { Router } from "express";
import {
  upsertContent,
  getAllContent,
  getContentByType,
} from "../controllers/contentController";

const router = Router();

router.post("/", upsertContent);        // create or update
router.get("/", getAllContent);         // get all
router.get("/:type", getContentByType); // get one by type

export default router;
