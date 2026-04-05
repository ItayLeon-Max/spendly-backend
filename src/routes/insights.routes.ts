import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import {
  getHomeInsights,
  getMonthlyStory
} from "../controllers/insights.controller.js";

const router = Router();

router.get("/monthly-story", requireAuth, getMonthlyStory);
router.get("/home-insights", requireAuth, getHomeInsights);

export default router;