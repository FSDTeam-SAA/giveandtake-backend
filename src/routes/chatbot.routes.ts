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

const router = Router();

router.post("/chat", chatWithBot);
router.post("/rebuild", rebuildChatbotKnowledge);

router.get("/qa", listChatbotQA);
router.post("/qa", createChatbotQA);
router.put("/qa/:id", updateChatbotQA);
router.patch("/qa/:id/status", toggleChatbotQAStatus);
router.delete("/qa/:id", deleteChatbotQA);

export default router;
