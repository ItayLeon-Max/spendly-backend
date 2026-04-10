import { prisma } from "../config/prisma.js";
import { PushService } from "./push.service.js";

type RecurringExpenseRecord = {
  id: string;
  title: string;
  amount: number;
  category: string;
  mood: "happy" | "stressed" | "spontaneous" | "tired" | "treatingMyself" | null;
  isNeed: boolean;
  date: Date;
  isRecurring: boolean;
  recurringFrequency: string | null;
  installmentCount: number | null;
  isOngoing: boolean;
  recurringGroupId: string | null;
  originalTotalAmount: number | null;
  totalInstallments: number | null;
  currentInstallmentNumber: number | null;
  remainingInstallments: number | null;
  nextRecurringDate: Date | null;
  userId: string;
  user: {
    preferredLanguage: "english" | "hebrew";
  };
};

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

    for (const expense of recurringExpenses as RecurringExpenseRecord[]) {
      await this.handleExpense(expense, now);
    }

    console.log("✅ Recurring cycle finished");
  }

  private static async handleExpense(expense: RecurringExpenseRecord, now: Date) {
    const nextDate = expense.nextRecurringDate ?? this.computeNextRecurringDate(expense.date, expense.recurringFrequency);

    if (!nextDate || nextDate > now) {
      return;
    }

    const isMonthlyInstallment =
      expense.recurringFrequency === "monthly" &&
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
          nextRecurringDate:
            nextRemainingInstallments > 0 ? this.addMonths(nextDate, 1) : null,

          user: {
            connect: { id: expense.userId }
          }
        } as any
      });

      await prisma.expense.update({
        where: { id: expense.id },
        data: {
          isRecurring: false,
          nextRecurringDate: null
        } as any
      });

      await this.sendRecurringPush(expense, createdExpense);

      return;
    }

    const followingRecurringDate = this.computeNextRecurringDate(
      nextDate,
      expense.recurringFrequency
    );

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
      } as any
    });

    await prisma.expense.update({
      where: { id: expense.id },
      data: {
        isRecurring: false,
        nextRecurringDate: null
      } as any
    });

    await this.sendRecurringPush(expense, createdExpense);
  }

  private static computeNextRecurringDate(
    date: Date,
    recurringFrequency: string | null
  ): Date | null {
    if (recurringFrequency === "weekly") {
      return this.addDays(date, 7);
    }

    if (recurringFrequency === "monthly") {
      return this.addMonths(date, 1);
    }

    return null;
  }

  private static addDays(date: Date, days: number): Date {
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + days);
    return nextDate;
  }

  private static addMonths(date: Date, months: number): Date {
    const nextDate = new Date(date);
    nextDate.setMonth(nextDate.getMonth() + months);
    return nextDate;
  }

  private static async sendRecurringPush(
    sourceExpense: RecurringExpenseRecord,
    createdExpense: {
      title: string;
      amount: number;
      recurringFrequency: string | null;
      isOngoing: boolean;
      currentInstallmentNumber: number | null;
      totalInstallments: number | null;
    }
  ) {
    const language = sourceExpense.user.preferredLanguage;

    let title = "";
    let body = "";

    const isInstallment =
      createdExpense.recurringFrequency === "monthly" &&
      createdExpense.isOngoing === false &&
      createdExpense.currentInstallmentNumber !== null &&
      createdExpense.totalInstallments !== null &&
      createdExpense.totalInstallments > 1;

    if (isInstallment) {
      if (language === "hebrew") {
        title = "נוצר תשלום חדש 💸";
        body = `ירד תשלום ${createdExpense.currentInstallmentNumber} מתוך ${createdExpense.totalInstallments} עבור ${createdExpense.title}.`;
      } else {
        title = "New payment created 💸";
        body = `Payment ${createdExpense.currentInstallmentNumber} of ${createdExpense.totalInstallments} was created for ${createdExpense.title}.`;
      }
    } else if (createdExpense.recurringFrequency === "weekly") {
      if (language === "hebrew") {
        title = "נוצר חיוב שבועי חדש 🔁";
        body = `נרשמה הוצאה שבועית חדשה עבור ${createdExpense.title} בסך ${createdExpense.amount}₪.`;
      } else {
        title = "New weekly expense created 🔁";
        body = `A new weekly expense for ${createdExpense.title} was created for ₪${createdExpense.amount}.`;
      }
    } else {
      if (language === "hebrew") {
        title = "נוצר חיוב חודשי חדש 🔁";
        body = `נרשמה הוצאה חודשית חדשה עבור ${createdExpense.title} בסך ${createdExpense.amount}₪.`;
      } else {
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