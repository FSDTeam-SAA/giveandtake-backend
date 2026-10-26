// routes/universityRoutes.ts
import express from "express";
import { uploadUniversities, createUniversity, listUniversities, getUniversity, updateUniversity, deleteUniversity, manageUniversities, listInstitutionSubmissions, reviewInstitutionSubmission } from "../controllers/university.controller";
import { protect, isAdmin } from "../middlewares/auth.middleware";
import { upload } from "../middlewares/multer.middleware";
 // reuse earlier multer upload

const router = express.Router();

// Upload file (field name “file”)
router.post("/upload", protect, isAdmin, upload.single("file"), uploadUniversities);
router.get("/manage", protect, isAdmin, manageUniversities);
router.get("/submissions", protect, isAdmin, listInstitutionSubmissions);
router.post("/submissions/review", protect, isAdmin, reviewInstitutionSubmission);

// CRUD
router.post("/", protect, isAdmin, createUniversity);
router.get("/", listUniversities);
router.get("/:id", getUniversity);
router.put("/:id", protect, isAdmin, updateUniversity);
router.delete("/:id", protect, isAdmin, deleteUniversity);

export default router;
