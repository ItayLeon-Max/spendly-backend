import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/upload.middleware.js";
import { getCurrentUser, removeProfileImage, setupSmartBudget, updateBudgetAllocations, updateMonthlyBudget, uploadProfileImage, updatePushSettings, savePushToken, getMyCustomCategories, createCustomCategory, createSharedBudget, inviteUserToSharedBudget, getMySharedBudgetInvites, acceptSharedBudgetInvite, declineSharedBudgetInvite, getMySharedBudgets, deleteSharedBudget, getSharedBudgetDetail, getSharedBudgetExpenses, addSharedBudgetExpense } from "../controllers/user.controller.js";
const router = Router();
router.get("/me", requireAuth, getCurrentUser);
router.patch("/me/budget", requireAuth, updateMonthlyBudget);
router.post("/me/budget/setup", requireAuth, setupSmartBudget);
router.patch("/me/budget/allocations", requireAuth, updateBudgetAllocations);
router.patch("/me/push-settings", requireAuth, updatePushSettings);
router.post("/me/profile-image", requireAuth, upload.single("image"), uploadProfileImage);
router.delete("/me/profile-image", requireAuth, removeProfileImage);
router.post("/me/push-token", requireAuth, savePushToken);
// ===============================
// CUSTOM CATEGORY ROUTES
// ===============================
router.get("/custom-categories", requireAuth, getMyCustomCategories);
router.post("/custom-categories", requireAuth, createCustomCategory);
// ===============================
// SHARED BUDGET ROUTES
// ===============================
// Create a new shared budget
router.post("/shared-budgets", requireAuth, createSharedBudget);
// Get all shared budgets for current user
router.get("/shared-budgets", requireAuth, getMySharedBudgets);
// Get one shared budget detail
router.get("/shared-budgets/:sharedBudgetId", requireAuth, getSharedBudgetDetail);
// Get all expenses for one shared budget
router.get("/shared-budgets/:sharedBudgetId/expenses", requireAuth, getSharedBudgetExpenses);
// Add expense to one shared budget
router.post("/shared-budgets/:sharedBudgetId/expenses", requireAuth, addSharedBudgetExpense);
// Invite a user to a shared budget (owner only)
router.post("/shared-budgets/:sharedBudgetId/invites", requireAuth, inviteUserToSharedBudget);
// Get my pending invites
router.get("/shared-budgets/invites/me", requireAuth, getMySharedBudgetInvites);
// Accept invite
router.post("/shared-budgets/invites/:inviteId/accept", requireAuth, acceptSharedBudgetInvite);
// Decline invite
router.post("/shared-budgets/invites/:inviteId/decline", requireAuth, declineSharedBudgetInvite);
// Delete a shared budget (owner only)
router.delete("/shared-budgets/:sharedBudgetId", requireAuth, deleteSharedBudget);
export default router;
