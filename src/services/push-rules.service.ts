import { prisma } from "../config/prisma.js";
import { PushService } from "./push.service.js";

type SmartPushMessage = {
  title: string;
  body: string;
};

const PUSH_COOLDOWN_HOURS = 3;
const MIN_BUDGET_FOR_ALERTS = 1;

export class PushRulesService {
  static async runSmartPushCycle() {
    const users = await prisma.user.findMany({
      where: {
        pushToken: { not: null },
        pushNotificationsEnabled: true
      },
      include: {
        expenses: {
          orderBy: {
            date: "desc"
          }
        }
      }
    });

    for (const user of users) {
      const shouldSkipForCooldown =
        user.lastPushSentAt &&
        Date.now() - new Date(user.lastPushSentAt).getTime() <
          PUSH_COOLDOWN_HOURS * 60 * 60 * 1000;

      if (shouldSkipForCooldown) {
        continue;
      }

      const message = this.buildSmartMessageForUser({
        preferredLanguage: user.preferredLanguage,
        monthlyBudget: user.monthlyBudget,
        expenses: user.expenses
      });

      if (!message) {
        continue;
      }

      await PushService.sendToUser(user.id, message);

      await prisma.user.update({
        where: { id: user.id },
        data: { lastPushSentAt: new Date() }
      });
    }
  }

  private static buildSmartMessageForUser(input: {
    preferredLanguage: "english" | "hebrew";
    monthlyBudget: number;
    expenses: Array<{
      amount: number;
      category: string;
      date: Date;
    }>;
  }): SmartPushMessage | null {
    const { preferredLanguage, monthlyBudget, expenses } = input;

    const now = new Date();

    const todayExpenses = expenses.filter((expense) =>
      this.isSameDay(expense.date, now)
    );

    const monthExpenses = expenses.filter(
      (expense) =>
        expense.date.getMonth() === now.getMonth() &&
        expense.date.getFullYear() === now.getFullYear()
    );

    const weekExpenses = expenses.filter((expense) =>
      this.isSameWeek(expense.date, now)
    );

    const todaySpent = todayExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const monthSpent = monthExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const weekSpent = weekExpenses.reduce((sum, expense) => sum + expense.amount, 0);

    const hasNoExpensesToday = todayExpenses.length === 0;
    const hasBudget = monthlyBudget >= MIN_BUDGET_FOR_ALERTS;

    if (hasBudget && monthSpent >= monthlyBudget) {
      return this.randomMessage(preferredLanguage, "budget_exceeded");
    }

    if (hasBudget && monthSpent >= monthlyBudget * 0.8) {
      return this.randomMessage(preferredLanguage, "budget_80");
    }

    if (hasBudget && weekSpent >= monthlyBudget * 0.4) {
      return this.randomMessage(preferredLanguage, "high_week");
    }

    if (hasNoExpensesToday && now.getHours() >= 18) {
      return this.randomMessage(preferredLanguage, "no_log_today");
    }

    if (todaySpent > 0) {
      const averageExpense =
        expenses.length > 0
          ? expenses.reduce((sum, expense) => sum + expense.amount, 0) / expenses.length
          : 0;

      if (todaySpent >= Math.max(averageExpense * 1.8, monthlyBudget * 0.08)) {
        return this.randomMessage(preferredLanguage, "smart_checkin");
      }
    }

    return null;
  }

  private static randomMessage(
    language: "english" | "hebrew",
    type:
      | "budget_exceeded"
      | "budget_80"
      | "high_week"
      | "no_log_today"
      | "smart_checkin"
  ): SmartPushMessage {
    const messages = {
      english: {
        budget_exceeded: [
          {
            title: "Budget exceeded 🙈",
            body: "Your monthly budget has officially been defeated. Time for a quick check."
          },
          {
            title: "That escalated 💸",
            body: "You’ve gone over budget. Open Spendly and see what happened."
          }
        ],
        budget_80: [
          {
            title: "80% already? 👀",
            body: "Your budget is getting nervous. Worth checking in."
          },
          {
            title: "Careful there 😅",
            body: "You’ve reached 80% of your monthly budget."
          }
        ],
        high_week: [
          {
            title: "Expensive week alert 💸",
            body: "This week is spending a little too confidently."
          },
          {
            title: "This week is loud 👀",
            body: "Your weekly spending is running high."
          }
        ],
        no_log_today: [
          {
            title: "Quick reminder 👋",
            body: "You haven’t logged anything today. Want to do a quick check?"
          },
          {
            title: "Spendly check-in 📱",
            body: "Before the day ends, it may be worth logging today’s expenses."
          }
        ],
        smart_checkin: [
          {
            title: "Today feels expensive 👀",
            body: "Spendly noticed a higher-than-usual spending pace today."
          },
          {
            title: "Tiny nudge, big value ✨",
            body: "A quick look now could save future chaos."
          }
        ]
      },
      hebrew: {
        budget_exceeded: [
          {
            title: "חרגת מהתקציב 🙈",
            body: "התקציב החודשי כבר מאחוריך. שווה להציץ רגע ב־Spendly."
          },
          {
            title: "זה קצת ברח 💸",
            body: "עברת את התקציב. פתח את Spendly ותראה מה קרה."
          }
        ],
        budget_80: [
          {
            title: "כבר 80%? 👀",
            body: "התקציב שלך מתחיל להילחץ. שווה לבדוק מה קורה."
          },
          {
            title: "רגע רגע 😅",
            body: "כבר הגעת ל־80% מהתקציב החודשי."
          }
        ],
        high_week: [
          {
            title: "שבוע יקר במיוחד 💸",
            body: "השבוע הזה מוציא כסף בביטחון גבוה מדי."
          },
          {
            title: "השבוע קצת חזק 👀",
            body: "נראה שההוצאות השבועיות שלך גבוהות מהרגיל."
          }
        ],
        no_log_today: [
          {
            title: "תזכורת קטנה 👋",
            body: "עוד לא הזנת הוצאות היום. רוצה לעשות בדיקה קטנה?"
          },
          {
            title: "בדיקת Spendly 📱",
            body: "לפני שהיום נגמר, אולי שווה לעדכן את הוצאות היום."
          }
        ],
        smart_checkin: [
          {
            title: "היום מרגיש יקר 👀",
            body: "Spendly זיהתה קצב הוצאות גבוה מהרגיל היום."
          },
          {
            title: "דחיפה קטנה, ערך גדול ✨",
            body: "בדיקה קצרה עכשיו יכולה לחסוך בלגן אחר כך."
          }
        ]
      }
    };

    const pool = messages[language][type];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private static isSameDay(a: Date, b: Date) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  private static isSameWeek(a: Date, b: Date) {
    const startOfWeek = (date: Date) => {
      const copy = new Date(date);
      const day = copy.getDay();
      const diff = copy.getDate() - day;
      copy.setDate(diff);
      copy.setHours(0, 0, 0, 0);
      return copy;
    };

    return startOfWeek(a).getTime() === startOfWeek(b).getTime();
  }
}