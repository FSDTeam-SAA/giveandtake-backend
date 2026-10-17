import { Router } from "express";
import { protect, isAdmin } from "../middlewares/auth.middleware";
import { listQualifications, saveQualification } from "../controllers/qualification.controller";

const router = Router();
router.get("/", listQualifications());
router.get("/manage", protect, isAdmin, listQualifications(true));
router.post("/", protect, isAdmin, saveQualification);
router.patch("/:id", protect, isAdmin, saveQualification);
export default router;
