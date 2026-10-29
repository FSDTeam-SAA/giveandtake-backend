import { fieldLimits } from "../middlewares/fieldLimits"
import express from "express";
import {
  createSkill,
  getAllSkills,
  getSkillById,
  updateSkill,
  deleteSkill,
  uploadSkillsFile,
} from "../controllers/skill.controller";
import { upload } from "../middlewares/multer.middleware";
import { protect, isAdmin } from "../middlewares/auth.middleware";
import { manageSkills, listSkillSubmissions, reviewSkillSubmission } from "../controllers/skill.controller";

const router = express.Router();

// CREATE skill (with optional icon upload)
router.get("/manage", protect, isAdmin, manageSkills);
router.get("/submissions", protect, isAdmin, listSkillSubmissions);
router.post("/submissions/review", protect, isAdmin, reviewSkillSubmission);
router.post("/", protect, isAdmin, fieldLimits("skill"), createSkill);
router.post("/csv", protect, isAdmin, upload.single("file"), uploadSkillsFile);

// GET all skills
router.get("/", getAllSkills);

// GET single skill by ID
router.get("/:id", getSkillById);

// UPDATE skill (with optional new icon upload)
router.put("/:id", protect, isAdmin, fieldLimits("skill"), updateSkill);

// DELETE skill
router.delete("/:id", protect, isAdmin, deleteSkill);

export default router;
