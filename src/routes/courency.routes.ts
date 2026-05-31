// routes/itemRoutes.ts
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  uploadItems,
  createItem,
  listItems,
  getItem,
  updateItem,
  deleteItem
} from "../controllers/courency.controller";
import { protect, isAdmin } from "../middlewares/auth.middleware";

const router = express.Router();

// Dedicated uploader for spreadsheet/CSV imports with a conservative 5 MB cap.
const importUploadDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(importUploadDir)) {
  fs.mkdirSync(importUploadDir, { recursive: true });
}
const importUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, importUploadDir),
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

// Spreadsheet/CSV import: admins only + conservative size limit
router.post("/upload", protect, isAdmin, importUpload.single("file"), uploadItems);
router.post("/", createItem);
router.get("/", listItems);
router.get("/:id", getItem);
router.put("/:id", updateItem);
router.delete("/:id", deleteItem);

export default router;
