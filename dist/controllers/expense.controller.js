import { prisma } from "../config/prisma.js";
const allowedMoods = [
    "happy",
    "stressed",
    "spontaneous",
    "tired",
    "treatingMyself"
];
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
        const { title, amount, category, mood, isNeed, date } = req.body;
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
        const createData = {
            title: String(title).trim(),
            amount: parsedAmount,
            category: String(category).trim(),
            isNeed: typeof isNeed === "boolean" ? isNeed : true,
            date: date ? new Date(date) : new Date(),
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
        const { title, amount, category, mood, isNeed, date } = req.body;
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
        if (date !== undefined) {
            updateData.date = new Date(date);
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
