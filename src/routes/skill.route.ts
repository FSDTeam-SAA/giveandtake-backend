import express from "express";
import {
  createSkill,
  getAllSkills,
  getSkillById,
  updateSkill,
  deleteSkill,
} from "../controllers/skill.controller";

const router = express.Router();

// CREATE skill (with optional icon upload)
router.post("/", createSkill);

// GET all skills
router.get("/", getAllSkills);

// GET single skill by ID
router.get("/:id", getSkillById);

// UPDATE skill (with optional new icon upload)
router.put("/:id", updateSkill);

// DELETE skill
router.delete("/:id", deleteSkill);

export default router;