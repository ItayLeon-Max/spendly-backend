import { prisma } from "../config/prisma.js";
import { PushService } from "./push.service.js";

type SmartPushMessage = {
  title: string;
  body: string;
};

const PUSH_COOLDOWN_HOURS = 3;
const MIN_BUDGET_FOR_ALERTS = 1;
const ENGAGEMENT_PUSH_START_HOUR = 12;
const ENGAGEMENT_PUSH_END_HOUR = 21;
const MIN_EXPENSES_FOR_REENGAGEMENT = 1;

export class PushRulesService {
  static async runSmartPushCycle() {
    console.log("🚀 Running smart push cycle...");
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
    console.log("👥 Users found for smart push:", users.length);

    for (const user of users) {
      console.log("➡️ Checking user:", user.id);
      const shouldSkipForCooldown =
        user.lastPushSentAt &&
        Date.now() - new Date(user.lastPushSentAt).getTime() <
          PUSH_COOLDOWN_HOURS * 60 * 60 * 1000;

      if (shouldSkipForCooldown) {
        console.log("⏳ Skipping user בגלל cooldown:", user.id);
        continue;
      }

      const message = this.buildSmartMessageForUser({
        preferredLanguage: user.preferredLanguage,
        monthlyBudget: user.monthlyBudget,
        expenses: user.expenses
      });

      if (!message) {
        console.log("⏭ Skipping user because no smart push message matched:", user.id);
        continue;
      }

      console.log("📤 Sending smart push to user:", user.id);
      console.log("📝 Smart push payload:", message);
      await PushService.sendToUser(user.id, message);

      await prisma.user.update({
        where: { id: user.id },
        data: { lastPushSentAt: new Date() }
      });
      console.log("✅ Updated lastPushSentAt for user:", user.id);
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
    const hasAnyExpenses = expenses.length >= MIN_EXPENSES_FOR_REENGAGEMENT;
    const currentHour = now.getHours();
    const isEngagementWindow =
      currentHour >= ENGAGEMENT_PUSH_START_HOUR &&
      currentHour <= ENGAGEMENT_PUSH_END_HOUR;
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

    if (isEngagementWindow) {
      if (hasNoExpensesToday) {
        return this.randomMessage(preferredLanguage, "come_back_today");
      }

      if (hasAnyExpenses) {
        return this.randomMessage(preferredLanguage, "engagement_nudge");
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
      | "come_back_today"
      | "engagement_nudge"
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
        ],
        come_back_today: [
          {
            title: "Spendly misses you 👀",
            body: "No expenses logged yet today. Open the app for a quick money check-in."
          },
          {
            title: "Tiny check, big clarity ✨",
            body: "A 20-second look at Spendly could help you stay ahead today."
          },
          {
            title: "Quick budget pulse 📱",
            body: "Open Spendly and see how your day is shaping up before tonight."
          }
        ],
        engagement_nudge: [
          {
            title: "Quick Spendly moment? 💡",
            body: "Your budget is quiet right now, which is exactly why this is a great time to check in."
          },
          {
            title: "Stay one step ahead 👣",
            body: "Open Spendly for a fast look before today turns into tomorrow’s surprise."
          },
          {
            title: "Your wallet story is still unfolding 📊",
            body: "Jump into Spendly and keep the picture clear while things are still fresh."
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
        ],
        come_back_today: [
          {
            title: "Spendly מתגעגעת 👀",
            body: "עוד לא נרשמו הוצאות היום. פתח את האפליקציה לבדיקה קצרה של המצב."
          },
          {
            title: "בדיקה קטנה, סדר גדול ✨",
            body: "20 שניות ב- Spendly יכולות לתת לך תמונה חדה יותר על היום שלך."
          },
          {
            title: "דופק תקציבי מהיר 📱",
            body: "כדאי לפתוח את Spendly ולראות איך היום שלך נראה לפני הערב."
          }
        ],
        engagement_nudge: [
          {
            title: "רגע קטן עם Spendly? 💡",
            body: "התקציב שלך שקט כרגע, וזה בדיוק הזמן המושלם לפתוח את האפליקציה ולהתעדכן."
          },
          {
            title: "להישאר צעד אחד קדימה 👣",
            body: "פתח את Spendly להצצה מהירה לפני שהיום של היום הופך להפתעה של מחר."
          },
          {
            title: "הסיפור של הארנק שלך עוד נכתב 📊",
            body: "כנס ל- Spendly ותשמור על תמונה ברורה כל עוד הכל עוד טרי בזיכרון."
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