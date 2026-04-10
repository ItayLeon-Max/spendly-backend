import { randomUUID } from "crypto";
import { prisma } from "../config/prisma.js";
const allowedMoods = [
    "happy",
    "stressed",
    "spontaneous",
    "tired",
    "treatingMyself"
];
const allowedRecurringFrequencies = ["weekly", "monthly"];
const getExpenseIdFromParams = (req) => {
    const rawExpenseId = req.params.expenseId;
    if (typeof rawExpenseId !== "string" || rawExpenseId.trim() === "") {
        return null;
    }
    return rawExpenseId;
};
const parseMood = (rawMood) => {
    if (rawMood === undefined) {
        return undefined;
    }
    if (rawMood === null || rawMood === "") {
        return null;
    }
    if (typeof rawMood !== "string") {
        return undefined;
    }
    const trimmedMood = rawMood.trim();
    if (!allowedMoods.includes(trimmedMood)) {
        return undefined;
    }
    return trimmedMood;
};
const parseRecurringFrequency = (rawFrequency) => {
    if (rawFrequency === undefined) {
        return undefined;
    }
    if (rawFrequency === null || rawFrequency === "") {
        return null;
    }
    if (typeof rawFrequency !== "string") {
        return undefined;
    }
    const trimmedFrequency = rawFrequency.trim().toLowerCase();
    if (!allowedRecurringFrequencies.includes(trimmedFrequency)) {
        return undefined;
    }
    return trimmedFrequency;
};
const parseOptionalPositiveInteger = (rawValue) => {
    if (rawValue === undefined) {
        return undefined;
    }
    if (rawValue === null || rawValue === "") {
        return null;
    }
    const parsedValue = Number(rawValue);
    if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
        return undefined;
    }
    return parsedValue;
};
const roundCurrencyAmount = (value) => {
    return Math.round(value * 100) / 100;
};
const addDays = (date, days) => {
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + days);
    return nextDate;
};
const addMonths = (date, months) => {
    const nextDate = new Date(date);
    nextDate.setMonth(nextDate.getMonth() + months);
    return nextDate;
};
export const getExpenses = async (req, res) => {
    try {
        if (!req.user?.userId) {
            return res.status(401).json({
                message: "Unauthorized"
            });
        }
        const page = Math.max(Number(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
        const skip = (page - 1) * limit;
        const searchQuery = typeof req.query.q === "string" ? req.query.q.trim() : "";
        const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
        const sortBy = req.query.sortBy === "amount" ? "amount" : "date";
        const sortOrder = req.query.sortOrder === "asc" ? "asc" : "desc";
        const where = {
            userId: req.user.userId
        };
        if (searchQuery) {
            where.title = {
                contains: searchQuery
            };
        }
        if (category && category !== "All") {
            where.category = category;
        }
        const orderBy = sortBy === "amount" ? { amount: sortOrder } : { date: sortOrder };
        const [expenses, totalCount] = await Promise.all([
            prisma.expense.findMany({
                where,
                orderBy,
                skip,
                take: limit
            }),
            prisma.expense.count({ where })
        ]);
        const totalPages = Math.max(Math.ceil(totalCount / limit), 1);
        return res.status(200).json({
            items: expenses,
            pagination: {
                page,
                limit,
                totalCount,
                totalPages,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1
            }
        });
    }
    catch {
        return res.status(500).json({
            message: "Server error while fetching expenses"
        });
    }
};
export const createExpense = async (req, res) => {
    try {
        if (!req.user?.userId) {
            return res.status(401).json({
                message: "Unauthorized"
            });
        }
        const { title, amount, category, mood, isNeed, date, isRecurring, recurringFrequency, installmentCount, isOngoing } = req.body;
        if (!title || amount === undefined || !category) {
            return res.status(400).json({
                message: "title, amount and category are required"
            });
        }
        const parsedAmount = Number(amount);
        if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
            return res.status(400).json({
                message: "amount must be a valid positive number"
            });
        }
        const parsedMood = parseMood(mood);
        if (mood !== undefined && parsedMood === undefined) {
            return res.status(400).json({
                message: "mood is invalid"
            });
        }
        if (isNeed !== undefined && typeof isNeed !== "boolean") {
            return res.status(400).json({
                message: "isNeed must be a boolean"
            });
        }
        if (isRecurring !== undefined && typeof isRecurring !== "boolean") {
            return res.status(400).json({
                message: "isRecurring must be a boolean"
            });
        }
        if (isOngoing !== undefined && typeof isOngoing !== "boolean") {
            return res.status(400).json({
                message: "isOngoing must be a boolean"
            });
        }
        const parsedRecurringFrequency = parseRecurringFrequency(recurringFrequency);
        if (recurringFrequency !== undefined && parsedRecurringFrequency === undefined) {
            return res.status(400).json({
                message: "recurringFrequency is invalid"
            });
        }
        const parsedInstallmentCount = parseOptionalPositiveInteger(installmentCount);
        if (installmentCount !== undefined && parsedInstallmentCount === undefined) {
            return res.status(400).json({
                message: "installmentCount must be a valid positive integer"
            });
        }
        const recurringEnabled = isRecurring === true;
        const recurringOngoing = isOngoing === true;
        if (recurringEnabled && !parsedRecurringFrequency) {
            return res.status(400).json({
                message: "recurringFrequency is required when isRecurring is true"
            });
        }
        if (!recurringEnabled && recurringFrequency !== undefined) {
            return res.status(400).json({
                message: "recurringFrequency can only be sent when isRecurring is true"
            });
        }
        if (!recurringEnabled && installmentCount !== undefined) {
            return res.status(400).json({
                message: "installmentCount can only be sent when isRecurring is true"
            });
        }
        if (!recurringEnabled && isOngoing !== undefined) {
            return res.status(400).json({
                message: "isOngoing can only be sent when isRecurring is true"
            });
        }
        if (parsedRecurringFrequency === "monthly" && recurringOngoing && parsedInstallmentCount !== null && parsedInstallmentCount !== undefined) {
            return res.status(400).json({
                message: "installmentCount cannot be sent for ongoing monthly recurring expenses"
            });
        }
        if (parsedRecurringFrequency === "monthly" && !recurringOngoing && parsedInstallmentCount === null) {
            return res.status(400).json({
                message: "installmentCount is required for monthly installment recurring expenses"
            });
        }
        if (parsedRecurringFrequency === "weekly" && installmentCount !== undefined) {
            return res.status(400).json({
                message: "installmentCount is only supported for monthly recurring expenses"
            });
        }
        const expenseDate = date ? new Date(date) : new Date();
        if (Number.isNaN(expenseDate.getTime())) {
            return res.status(400).json({
                message: "date is invalid"
            });
        }
        const isMonthlyInstallmentPlan = recurringEnabled &&
            parsedRecurringFrequency === "monthly" &&
            !recurringOngoing &&
            parsedInstallmentCount !== null &&
            parsedInstallmentCount !== undefined;
        const recurringGroupId = recurringEnabled ? randomUUID() : null;
        const firstInstallmentAmount = isMonthlyInstallmentPlan
            ? roundCurrencyAmount(parsedAmount / parsedInstallmentCount)
            : parsedAmount;
        const nextRecurringDate = recurringEnabled
            ? parsedRecurringFrequency === "weekly"
                ? addDays(expenseDate, 7)
                : addMonths(expenseDate, 1)
            : null;
        const createData = {
            title: String(title).trim(),
            amount: firstInstallmentAmount,
            category: String(category).trim(),
            isNeed: typeof isNeed === "boolean" ? isNeed : true,
            date: expenseDate,
            isRecurring: recurringEnabled,
            recurringFrequency: recurringEnabled ? parsedRecurringFrequency ?? null : null,
            installmentCount: recurringEnabled && parsedRecurringFrequency === "monthly" && !recurringOngoing
                ? parsedInstallmentCount ?? null
                : null,
            isOngoing: recurringEnabled ? recurringOngoing : false,
            recurringGroupId,
            originalTotalAmount: isMonthlyInstallmentPlan ? parsedAmount : null,
            totalInstallments: isMonthlyInstallmentPlan ? parsedInstallmentCount : null,
            currentInstallmentNumber: isMonthlyInstallmentPlan ? 1 : null,
            remainingInstallments: isMonthlyInstallmentPlan
                ? parsedInstallmentCount - 1
                : null,
            nextRecurringDate,
            user: {
                connect: {
                    id: req.user.userId
                }
            }
        };
        if (parsedMood !== undefined) {
            createData.mood = parsedMood;
        }
        const expense = await prisma.expense.create({
            data: createData
        });
        return res.status(201).json(expense);
    }
    catch {
        return res.status(500).json({
            message: "Server error while creating expense"
        });
    }
};
export const updateExpense = async (req, res) => {
    try {
        if (!req.user?.userId) {
            return res.status(401).json({
                message: "Unauthorized"
            });
        }
        const expenseId = getExpenseIdFromParams(req);
        if (!expenseId) {
            return res.status(400).json({
                message: "Invalid expenseId"
            });
        }
        const { title, amount, category, mood, isNeed, date, isRecurring, recurringFrequency, installmentCount, isOngoing } = req.body;
        const existingExpense = await prisma.expense.findFirst({
            where: {
                id: expenseId,
                userId: req.user.userId
            }
        });
        if (!existingExpense) {
            return res.status(404).json({
                message: "Expense not found"
            });
        }
        const updateData = {};
        if (title !== undefined) {
            const cleanTitle = String(title).trim();
            if (!cleanTitle) {
                return res.status(400).json({
                    message: "title cannot be empty"
                });
            }
            updateData.title = cleanTitle;
        }
        if (amount !== undefined) {
            const parsedAmount = Number(amount);
            if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
                return res.status(400).json({
                    message: "amount must be a valid positive number"
                });
            }
            updateData.amount = parsedAmount;
        }
        if (category !== undefined) {
            const cleanCategory = String(category).trim();
            if (!cleanCategory) {
                return res.status(400).json({
                    message: "category cannot be empty"
                });
            }
            updateData.category = cleanCategory;
        }
        if (mood !== undefined) {
            const parsedMood = parseMood(mood);
            if (parsedMood === undefined) {
                return res.status(400).json({
                    message: "mood is invalid"
                });
            }
            updateData.mood = parsedMood;
        }
        if (isNeed !== undefined) {
            if (typeof isNeed !== "boolean") {
                return res.status(400).json({
                    message: "isNeed must be a boolean"
                });
            }
            updateData.isNeed = isNeed;
        }
        if (isRecurring !== undefined) {
            if (typeof isRecurring !== "boolean") {
                return res.status(400).json({
                    message: "isRecurring must be a boolean"
                });
            }
            updateData.isRecurring = isRecurring;
        }
        const parsedRecurringFrequency = parseRecurringFrequency(recurringFrequency);
        if (recurringFrequency !== undefined) {
            if (parsedRecurringFrequency === undefined) {
                return res.status(400).json({
                    message: "recurringFrequency is invalid"
                });
            }
            updateData.recurringFrequency = parsedRecurringFrequency;
        }
        const parsedInstallmentCount = parseOptionalPositiveInteger(installmentCount);
        if (installmentCount !== undefined) {
            if (parsedInstallmentCount === undefined) {
                return res.status(400).json({
                    message: "installmentCount must be a valid positive integer"
                });
            }
            updateData.installmentCount = parsedInstallmentCount;
        }
        const effectiveIsRecurring = isRecurring !== undefined ? isRecurring : existingExpense.isRecurring;
        const effectiveRecurringFrequency = recurringFrequency !== undefined
            ? parsedRecurringFrequency
            : existingExpense.recurringFrequency;
        const effectiveIsOngoing = isOngoing !== undefined ? isOngoing : existingExpense.isOngoing;
        const effectiveInstallmentCount = installmentCount !== undefined
            ? parsedInstallmentCount
            : existingExpense.installmentCount;
        if (effectiveIsRecurring && !effectiveRecurringFrequency) {
            return res.status(400).json({
                message: "recurringFrequency is required when isRecurring is true"
            });
        }
        if (!effectiveIsRecurring && recurringFrequency !== undefined) {
            return res.status(400).json({
                message: "recurringFrequency can only be sent when isRecurring is true"
            });
        }
        if (!effectiveIsRecurring && installmentCount !== undefined) {
            return res.status(400).json({
                message: "installmentCount can only be sent when isRecurring is true"
            });
        }
        if (!effectiveIsRecurring && isOngoing !== undefined) {
            return res.status(400).json({
                message: "isOngoing can only be sent when isRecurring is true"
            });
        }
        if (effectiveRecurringFrequency === "monthly" &&
            effectiveIsOngoing &&
            effectiveInstallmentCount !== null &&
            effectiveInstallmentCount !== undefined) {
            return res.status(400).json({
                message: "installmentCount cannot be sent for ongoing monthly recurring expenses"
            });
        }
        if (effectiveRecurringFrequency === "monthly" &&
            !effectiveIsOngoing &&
            effectiveInstallmentCount === null) {
            return res.status(400).json({
                message: "installmentCount is required for monthly installment recurring expenses"
            });
        }
        if (effectiveRecurringFrequency === "weekly" && installmentCount !== undefined) {
            return res.status(400).json({
                message: "installmentCount is only supported for monthly recurring expenses"
            });
        }
        if (isOngoing !== undefined) {
            if (typeof isOngoing !== "boolean") {
                return res.status(400).json({
                    message: "isOngoing must be a boolean"
                });
            }
            updateData.isOngoing = isOngoing;
        }
        if (date !== undefined) {
            const parsedDate = new Date(date);
            if (Number.isNaN(parsedDate.getTime())) {
                return res.status(400).json({
                    message: "date is invalid"
                });
            }
            updateData.date = parsedDate;
        }
        const monthlyInstallmentPlanAfterUpdate = effectiveIsRecurring &&
            effectiveRecurringFrequency === "monthly" &&
            !effectiveIsOngoing &&
            effectiveInstallmentCount !== null &&
            effectiveInstallmentCount !== undefined;
        if (amount !== undefined && monthlyInstallmentPlanAfterUpdate) {
            updateData.originalTotalAmount = Number(amount);
            updateData.amount = roundCurrencyAmount(Number(amount) / effectiveInstallmentCount);
            updateData.totalInstallments = effectiveInstallmentCount;
            if (existingExpense.currentInstallmentNumber === null) {
                updateData.currentInstallmentNumber = 1;
            }
            if (existingExpense.currentInstallmentNumber !== null) {
                updateData.remainingInstallments = Math.max(effectiveInstallmentCount - existingExpense.currentInstallmentNumber, 0);
            }
        }
        const updatedExpense = await prisma.expense.update({
            where: {
                id: expenseId
            },
            data: updateData
        });
        return res.status(200).json(updatedExpense);
    }
    catch {
        return res.status(500).json({
            message: "Server error while updating expense"
        });
    }
};
export const deleteExpense = async (req, res) => {
    try {
        if (!req.user?.userId) {
            return res.status(401).json({
                message: "Unauthorized"
            });
        }
        const expenseId = getExpenseIdFromParams(req);
        if (!expenseId) {
            return res.status(400).json({
                message: "Invalid expenseId"
            });
        }
        const existingExpense = await prisma.expense.findFirst({
            where: {
                id: expenseId,
                userId: req.user.userId
            }
        });
        if (!existingExpense) {
            return res.status(404).json({
                message: "Expense not found"
            });
        }
        await prisma.expense.delete({
            where: {
                id: expenseId
            }
        });
        return res.status(200).json({
            message: "Expense deleted successfully"
        });
    }
    catch {
        return res.status(500).json({
            message: "Server error while deleting expense"
        });
    }
};
