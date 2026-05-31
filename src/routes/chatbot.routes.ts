import { Router } from "express";
import {
  chatWithBot,
  rebuildChatbotKnowledge,
  createChatbotQA,
  updateChatbotQA,
  listChatbotQA,
  deleteChatbotQA,
  toggleChatbotQAStatus,
} from "../controllers/chatbotController";
import { protect, isAdmin } from "../middlewares/auth.middleware";
import { chatLimiter } from "../middlewares/rateLimit.middleware";

const router = Router();

router.post("/chat", chatLimiter, chatWithBot);
router.post("/rebuild", protect, isAdmin, rebuildChatbotKnowledge);

router.get("/qa", listChatbotQA);
router.post("/qa", protect, isAdmin, createChatbotQA);
router.put("/qa/:id", protect, isAdmin, updateChatbotQA);
router.patch("/qa/:id/status", protect, isAdmin, toggleChatbotQAStatus);
router.delete("/qa/:id", protect, isAdmin, deleteChatbotQA);

export default router;
