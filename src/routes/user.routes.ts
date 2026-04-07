import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/upload.middleware.js";
import {
  getCurrentUser,
  removeProfileImage,
  setupSmartBudget,
  updateBudgetAllocations,
  updateMonthlyBudget,
  uploadProfileImage,
  updatePushSettings,
  savePushToken
} from "../controllers/user.controller.js";

const router = Router();

router.get("/me", requireAuth, getCurrentUser);
router.patch("/me/budget", requireAuth, updateMonthlyBudget);
router.post("/me/budget/setup", requireAuth, setupSmartBudget);
router.patch("/me/budget/allocations", requireAuth, updateBudgetAllocations);
router.patch("/me/push-settings", requireAuth, updatePushSettings);

router.post("/me/profile-image", requireAuth, upload.single("image"), uploadProfileImage);
router.delete("/me/profile-image", requireAuth, removeProfileImage);

router.post("/me/push-token", requireAuth, savePushToken);

export default router;