import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import {
  createSkill,
  getAllSkills,
  getSkillById,
  updateSkill,
  deleteSkill,
  uploadSkillsFile,
} from "../controllers/skill.controller";
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

// CREATE skill (with optional icon upload)
router.post("/", createSkill);
// Spreadsheet/CSV import: admins only + conservative size limit
router.post("/csv", protect, isAdmin, importUpload.single("file"), uploadSkillsFile);

// GET all skills
router.get("/", getAllSkills);

// GET single skill by ID
router.get("/:id", getSkillById);

// UPDATE skill (with optional new icon upload)
router.put("/:id", updateSkill);

// DELETE skill
router.delete("/:id", deleteSkill);

export default router;