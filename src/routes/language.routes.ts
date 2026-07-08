// routes/languageRoutes.ts
import express from "express";
import { upload } from "../middlewares/multer.middleware";
import { createLanguage, deleteLanguage, getLanguage, listLanguages, updateLanguage, uploadLanguages } from "../controllers/language.controller";


const router = express.Router();

// Upload file (field name 'file')
router.post("/upload", upload.single("file"), uploadLanguages);

// CRUD
router.post("/", createLanguage);
router.get("/", listLanguages);
router.get("/:id", getLanguage);
router.put("/:id", updateLanguage);
router.delete("/:id", deleteLanguage);

export default router;
