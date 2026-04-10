import { prisma } from "../config/prisma.js";
import { PushService } from "./push.service.js";
export class RecurringExpensesService {
    static async runCycle() {
        console.log("🔁 Running recurring expenses cycle...");
        const now = new Date();
        const recurringExpenses = await prisma.expense.findMany({
            where: {
                isRecurring: true
            },
            include: {
                user: {
                    select: {
                        preferredLanguage: true
                    }
                }
            }
        });
        for (const expense of recurringExpenses) {
            await this.handleExpense(expense, now);
        }
        console.log("✅ Recurring cycle finished");
    }
    static async handleExpense(expense, now) {
        const nextDate = expense.nextRecurringDate ?? this.computeNextRecurringDate(expense.date, expense.recurringFrequency);
        if (!nextDate || nextDate > now) {
            return;
        }
        const isMonthlyInstallment = expense.recurringFrequency === "monthly" &&
            expense.isOngoing === false &&
            expense.totalInstallments !== null &&
            expense.currentInstallmentNumber !== null;
        if (isMonthlyInstallment) {
            const remainingInstallments = expense.remainingInstallments ?? 0;
            if (remainingInstallments <= 0) {
                await prisma.expense.update({
                    where: { id: expense.id },
                    data: {
                        isRecurring: false,
                        nextRecurringDate: null
                    }
                });
                return;
            }
            const nextInstallmentNumber = (expense.currentInstallmentNumber ?? 0) + 1;
            const nextRemainingInstallments = Math.max(remainingInstallments - 1, 0);
            const createdExpense = await prisma.expense.create({
                data: {
                    title: expense.title,
                    amount: expense.amount,
                    category: expense.category,
                    mood: expense.mood,
                    isNeed: expense.isNeed,
                    date: nextDate,
                    isRecurring: nextRemainingInstallments > 0,
                    recurringFrequency: nextRemainingInstallments > 0 ? expense.recurringFrequency : null,
                    installmentCount: expense.installmentCount,
                    isOngoing: false,
                    recurringGroupId: expense.recurringGroupId,
                    originalTotalAmount: expense.originalTotalAmount,
                    totalInstallments: expense.totalInstallments,
                    currentInstallmentNumber: nextInstallmentNumber,
                    remainingInstallments: nextRemainingInstallments,
                    nextRecurringDate: nextRemainingInstallments > 0 ? this.addMonths(nextDate, 1) : null,
                    user: {
                        connect: { id: expense.userId }
                    }
                }
            });
            await prisma.expense.update({
                where: { id: expense.id },
                data: {
                    isRecurring: false,
                    nextRecurringDate: null
                }
            });
            await this.sendRecurringPush(expense, createdExpense);
            return;
        }
        const followingRecurringDate = this.computeNextRecurringDate(nextDate, expense.recurringFrequency);
        const createdExpense = await prisma.expense.create({
            data: {
                title: expense.title,
                amount: expense.amount,
                category: expense.category,
                mood: expense.mood,
                isNeed: expense.isNeed,
                date: nextDate,
                isRecurring: true,
                recurringFrequency: expense.recurringFrequency,
                installmentCount: expense.installmentCount,
                isOngoing: expense.isOngoing,
                recurringGroupId: expense.recurringGroupId,
                originalTotalAmount: expense.originalTotalAmount,
                totalInstallments: expense.totalInstallments,
                currentInstallmentNumber: expense.currentInstallmentNumber,
                remainingInstallments: expense.remainingInstallments,
                nextRecurringDate: followingRecurringDate,
                user: {
                    connect: { id: expense.userId }
                }
            }
        });
        await prisma.expense.update({
            where: { id: expense.id },
            data: {
                isRecurring: false,
                nextRecurringDate: null
            }
        });
        await this.sendRecurringPush(expense, createdExpense);
    }
    static computeNextRecurringDate(date, recurringFrequency) {
        if (recurringFrequency === "weekly") {
            return this.addDays(date, 7);
        }
        if (recurringFrequency === "monthly") {
            return this.addMonths(date, 1);
        }
        return null;
    }
    static addDays(date, days) {
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + days);
        return nextDate;
    }
    static addMonths(date, months) {
        const nextDate = new Date(date);
        nextDate.setMonth(nextDate.getMonth() + months);
        return nextDate;
    }
    static async sendRecurringPush(sourceExpense, createdExpense) {
        const language = sourceExpense.user.preferredLanguage;
        let title = "";
        let body = "";
        const isInstallment = createdExpense.recurringFrequency === "monthly" &&
            createdExpense.isOngoing === false &&
            createdExpense.currentInstallmentNumber !== null &&
            createdExpense.totalInstallments !== null &&
            createdExpense.totalInstallments > 1;
        if (isInstallment) {
            if (language === "hebrew") {
                title = "נוצר תשלום חדש 💸";
                body = `ירד תשלום ${createdExpense.currentInstallmentNumber} מתוך ${createdExpense.totalInstallments} עבור ${createdExpense.title}.`;
            }
            else {
                title = "New payment created 💸";
                body = `Payment ${createdExpense.currentInstallmentNumber} of ${createdExpense.totalInstallments} was created for ${createdExpense.title}.`;
            }
        }
        else if (createdExpense.recurringFrequency === "weekly") {
            if (language === "hebrew") {
                title = "נוצר חיוב שבועי חדש 🔁";
                body = `נרשמה הוצאה שבועית חדשה עבור ${createdExpense.title} בסך ${createdExpense.amount}₪.`;
            }
            else {
                title = "New weekly expense created 🔁";
                body = `A new weekly expense for ${createdExpense.title} was created for ₪${createdExpense.amount}.`;
            }
        }
        else {
            if (language === "hebrew") {
                title = "נוצר חיוב חודשי חדש 🔁";
                body = `נרשמה הוצאה חודשית חדשה עבור ${createdExpense.title} בסך ${createdExpense.amount}₪.`;
            }
            else {
                title = "New monthly expense created 🔁";
                body = `A new monthly expense for ${createdExpense.title} was created for ₪${createdExpense.amount}.`;
            }
        }
        await PushService.sendToUser(sourceExpense.userId, {
            title,
            body,
            data: {
                type: "recurring_expense_created"
            }
        });
    }
}
