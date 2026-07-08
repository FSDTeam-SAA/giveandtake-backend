import { Router } from "express";
import { upsertFaq, getAllFaqs, deleteFaq } from "../controllers/faqController";

const router = Router();

router.post("/", upsertFaq);       // Add or update FAQ
router.get("/", getAllFaqs);       // Get all FAQs
router.delete("/:id", deleteFaq);  // Delete an FAQ

export default router;
