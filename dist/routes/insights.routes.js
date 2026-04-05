import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { getMonthlyStory } from "../controllers/insights.controller.js";
const router = Router();
router.get("/monthly-story", requireAuth, getMonthlyStory);
export default router;
