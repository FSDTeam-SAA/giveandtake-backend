// routes/universityRoutes.ts
import express from "express";
import { uploadUniversities, createUniversity, listUniversities, getUniversity, updateUniversity, deleteUniversity } from "../controllers/university.controller";
import { upload } from "../middlewares/multer.middleware";
 // reuse earlier multer upload

const router = express.Router();

// Upload file (field name “file”)
router.post("/upload", upload.single("file"), uploadUniversities);

// CRUD
router.post("/", createUniversity);
router.get("/", listUniversities);
router.get("/:id", getUniversity);
router.put("/:id", updateUniversity);
router.delete("/:id", deleteUniversity);

export default router;
