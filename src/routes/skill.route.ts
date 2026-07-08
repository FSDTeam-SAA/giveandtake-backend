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

const router = express.Router();

// CREATE skill (with optional icon upload)
router.post("/", createSkill);
router.post("/csv",upload.single("file"), uploadSkillsFile);

// GET all skills
router.get("/", getAllSkills);

// GET single skill by ID
router.get("/:id", getSkillById);

// UPDATE skill (with optional new icon upload)
router.put("/:id", updateSkill);

// DELETE skill
router.delete("/:id", deleteSkill);

export default router;