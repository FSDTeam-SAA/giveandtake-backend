import { Router } from "express";
import {
  upsertContent,
  createContent,
  updateContent,
  deleteContent,
  getAllContent,
  getPublishedContent,
  getContentByType,
} from "../controllers/contentController";
import { protect, isAdmin } from "../middlewares/auth.middleware";

const router = Router();

// Public reads
router.get("/", getAllContent);                 // get all pages
router.get("/published", getPublishedContent);  // published pages (footer/nav)
router.get("/:type", getContentByType);         // get one by slug/type

// Admin writes
router.post("/", protect, isAdmin, upsertContent);           // create or update by type
router.post("/pages", protect, isAdmin, createContent);      // create a new dynamic page
router.patch("/pages/:id", protect, isAdmin, updateContent); // update a page by id
router.delete("/pages/:id", protect, isAdmin, deleteContent);// delete a custom page

export default router;
