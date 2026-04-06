import { prisma } from "../config/prisma.js";
const weekdayKeys = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday"
];
const getMonthRange = (year, month) => {
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    return { start, end };
};
const roundToTwo = (value) => {
    return Math.round(value * 100) / 100;
};
const buildPersonalityLine = (totalSpent, previousMonthTotal, topCategory, expenseCount) => {
    if (expenseCount === 0) {
        return "A quiet month. You barely spent anything.";
    }
    if (previousMonthTotal > 0) {
        const diff = totalSpent - previousMonthTotal;
        const ratio = diff / previousMonthTotal;
        if (ratio <= -0.2) {
            return "You were noticeably more disciplined than last month.";
        }
        if (ratio >= 0.2) {
            return "This month was more intense than the previous one.";
        }
    }
    if (topCategory) {
        if (topCategory.toLowerCase() === "food") {
            return "Food clearly shaped your month.";
        }
        if (topCategory.toLowerCase() === "shopping") {
            return "Shopping took the spotlight this month.";
        }
        if (topCategory.toLowerCase() === "transport") {
            return "You were on the move a lot this month.";
        }
    }
    return "A balanced month with a steady spending rhythm.";
};
export const getMonthlyStory = async (req, res) => {
    try {
        if (!req.user?.userId) {
            return res.status(401).json({
                message: "Unauthorized"
            });
        }
        const now = new Date();
        const requestedYear = Number(req.query.year) || now.getUTCFullYear();
        const requestedMonth = Number(req.query.month) || now.getUTCMonth() + 1;
        if (Number.isNaN(requestedYear) ||
            Number.isNaN(requestedMonth) ||
            requestedMonth < 1 ||
            requestedMonth > 12) {
            return res.status(400).json({
                message: "year and month must be valid values"
            });
        }
        const { start, end } = getMonthRange(requestedYear, requestedMonth);
        const previousMonthDate = new Date(Date.UTC(requestedYear, requestedMonth - 2, 1));
        const previousYear = previousMonthDate.getUTCFullYear();
        const previousMonth = previousMonthDate.getUTCMonth() + 1;
        const previousRange = getMonthRange(previousYear, previousMonth);
        const [currentExpenses, previousExpenses] = await Promise.all([
            prisma.expense.findMany({
                where: {
                    userId: req.user.userId,
                    date: {
                        gte: start,
                        lt: end
                    }
                },
                orderBy: {
                    date: "asc"
                },
                select: {
                    id: true,
                    title: true,
                    amount: true,
                    category: true,
                    date: true
                }
            }),
            prisma.expense.findMany({
                where: {
                    userId: req.user.userId,
                    date: {
                        gte: previousRange.start,
                        lt: previousRange.end
                    }
                },
                select: {
                    amount: true
                }
            })
        ]);
        const totalSpent = roundToTwo(currentExpenses.reduce((sum, expense) => sum + expense.amount, 0));
        const previousMonthTotal = roundToTwo(previousExpenses.reduce((sum, expense) => sum + expense.amount, 0));
        const expenseCount = currentExpenses.length;
        const categoryTotals = new Map();
        const dailyTotals = new Map();
        const weekdayTotals = new Map();
        for (const weekday of weekdayKeys) {
            weekdayTotals.set(weekday, 0);
        }
        for (const expense of currentExpenses) {
            categoryTotals.set(expense.category, roundToTwo((categoryTotals.get(expense.category) ?? 0) + expense.amount));
            const dayKey = expense.date.toISOString().slice(0, 10);
            dailyTotals.set(dayKey, roundToTwo((dailyTotals.get(dayKey) ?? 0) + expense.amount));
            const weekday = weekdayKeys[expense.date.getUTCDay()];
            weekdayTotals.set(weekday, roundToTwo((weekdayTotals.get(weekday) ?? 0) + expense.amount));
        }
        const topCategoryEntry = [...categoryTotals.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
        const topSpendingDayEntry = [...dailyTotals.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
        const busiestWeekdayEntry = [...weekdayTotals.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
        const biggestExpense = [...currentExpenses].sort((a, b) => b.amount - a.amount)[0] ?? null;
        const averageExpense = expenseCount > 0 ? roundToTwo(totalSpent / expenseCount) : 0;
        const comparedToPreviousMonthAmount = roundToTwo(totalSpent - previousMonthTotal);
        const comparedToPreviousMonthPercent = previousMonthTotal > 0
            ? roundToTwo((comparedToPreviousMonthAmount / previousMonthTotal) * 100)
            : null;
        const personalityLine = buildPersonalityLine(totalSpent, previousMonthTotal, topCategoryEntry?.[0] ?? null, expenseCount);
        return res.status(200).json({
            month: requestedMonth,
            year: requestedYear,
            totalSpent,
            expenseCount,
            averageExpense,
            previousMonthTotal,
            comparedToPreviousMonthAmount,
            comparedToPreviousMonthPercent,
            topCategory: topCategoryEntry
                ? {
                    name: topCategoryEntry[0],
                    total: topCategoryEntry[1]
                }
                : null,
            topSpendingDay: topSpendingDayEntry
                ? {
                    date: topSpendingDayEntry[0],
                    total: topSpendingDayEntry[1]
                }
                : null,
            busiestWeekday: busiestWeekdayEntry
                ? {
                    name: busiestWeekdayEntry[0],
                    total: busiestWeekdayEntry[1]
                }
                : null,
            biggestExpense: biggestExpense
                ? {
                    title: biggestExpense.title,
                    amount: biggestExpense.amount,
                    category: biggestExpense.category,
                    date: biggestExpense.date
                }
                : null,
            personalityLine
        });
    }
    catch (error) {
        console.error("getMonthlyStory error:", error);
        return res.status(500).json({
            message: "Server error while building monthly story"
        });
    }
};
export const getHomeInsights = async (req, res) => {
    try {
        if (!req.user?.userId) {
            return res.status(401).json({
                message: "Unauthorized"
            });
        }
        const expenses = await prisma.expense.findMany({
            where: {
                userId: req.user.userId
            },
            select: {
                amount: true,
                category: true,
                mood: true,
                isNeed: true,
                date: true
            },
            orderBy: {
                date: "desc"
            }
        });
        if (expenses.length === 0) {
            return res.status(200).json({
                mostCommonMood: null,
                needsPercentage: 0,
                wantsPercentage: 0,
                smartInsight: null
            });
        }
        const totalCount = expenses.length;
        const needsCount = expenses.filter((expense) => expense.isNeed).length;
        const wantsCount = totalCount - needsCount;
        const needsPercentage = roundToTwo((needsCount / totalCount) * 100);
        const wantsPercentage = roundToTwo((wantsCount / totalCount) * 100);
        const moodTotals = new Map();
        const moodExpenseCounts = new Map();
        const moodCategoryTotals = new Map();
        for (const expense of expenses) {
            if (!expense.mood) {
                continue;
            }
            moodTotals.set(expense.mood, roundToTwo((moodTotals.get(expense.mood) ?? 0) + expense.amount));
            moodExpenseCounts.set(expense.mood, (moodExpenseCounts.get(expense.mood) ?? 0) + 1);
            if (!moodCategoryTotals.has(expense.mood)) {
                moodCategoryTotals.set(expense.mood, new Map());
            }
            const categoryMap = moodCategoryTotals.get(expense.mood);
            categoryMap.set(expense.category, roundToTwo((categoryMap.get(expense.category) ?? 0) + expense.amount));
        }
        const mostCommonMoodEntry = [...moodExpenseCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
        const mostCommonMood = mostCommonMoodEntry?.[0] ?? null;
        let smartInsight = null;
        if (mostCommonMood) {
            const topCategoryForMood = [...(moodCategoryTotals.get(mostCommonMood)?.entries() ?? [])].sort((a, b) => b[1] - a[1])[0] ?? null;
            if (topCategoryForMood) {
                smartInsight = `You tend to spend more on ${topCategoryForMood[0]} when you're ${mostCommonMood}.`;
            }
            else {
                smartInsight = `Your most common spending mood is ${mostCommonMood}.`;
            }
        }
        else if (wantsPercentage >= 60) {
            smartInsight = "A large share of your expenses are wants rather than needs.";
        }
        else if (needsPercentage >= 70) {
            smartInsight = "Most of your spending is focused on essential needs.";
        }
        return res.status(200).json({
            mostCommonMood,
            needsPercentage,
            wantsPercentage,
            smartInsight
        });
    }
    catch (error) {
        console.error("getHomeInsights error:", error);
        return res.status(500).json({
            message: "Server error while building home insights"
        });
    }
};
