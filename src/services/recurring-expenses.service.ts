import { prisma } from "../config/prisma.js";

export class RecurringExpensesService {
  static async runCycle() {
    console.log("🔁 Running recurring expenses cycle...");

    const now = new Date();

    const recurringExpenses = await prisma.expense.findMany({
      where: {
        isRecurring: true
      }
    });

    for (const expense of recurringExpenses) {
      await this.handleExpense(expense, now);
    }

    console.log("✅ Recurring cycle finished");
  }

  private static async handleExpense(expense: any, now: Date) {
    const lastDate = expense.date;

    let shouldCreate = false;
    let nextDate = new Date(lastDate);

    if (expense.recurringFrequency === "weekly") {
      nextDate.setDate(nextDate.getDate() + 7);
      shouldCreate = nextDate <= now;
    }

    if (expense.recurringFrequency === "monthly") {
      nextDate.setMonth(nextDate.getMonth() + 1);
      shouldCreate = nextDate <= now;
    }

    if (!shouldCreate) return;

    // יצירת ההוצאה החדשה
    await prisma.expense.create({
      data: {
        title: expense.title,
        amount: expense.amount,
        category: expense.category,
        mood: expense.mood,
        isNeed: expense.isNeed,
        date: nextDate,

        isRecurring: expense.isRecurring,
        recurringFrequency: expense.recurringFrequency,
        installmentCount: expense.installmentCount,
        isOngoing: expense.isOngoing,

        user: {
          connect: { id: expense.userId }
        }
      }
    });

    // עדכון ההוצאה המקורית לתאריך החדש
    await prisma.expense.update({
      where: { id: expense.id },
      data: {
        date: nextDate
      }
    });
  }
}