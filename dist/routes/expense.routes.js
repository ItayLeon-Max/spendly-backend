import { Router } from "express";
import { createExpense, deleteExpense, getExpenses, updateExpense } from "../controllers/expense.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
const router = Router();
router.get("/", requireAuth, getExpenses);
router.post("/", requireAuth, createExpense);
router.patch("/:expenseId", requireAuth, updateExpense);
router.delete("/:expenseId", requireAuth, deleteExpense);
export default router;
