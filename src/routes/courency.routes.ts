// routes/itemRoutes.ts
import express from "express";
import {
  uploadItems,
  createItem,
  listItems,
  getItem,
  updateItem,
  deleteItem
} from "../controllers/courency.controller";
import { upload } from "../middlewares/multer.middleware";

const router = express.Router();

router.post("/upload", upload.single("file"), uploadItems);
router.post("/", createItem);
router.get("/", listItems);
router.get("/:id", getItem);
router.put("/:id", updateItem);
router.delete("/:id", deleteItem);

export default router;
