import apn from "apn";
import { prisma } from "../config/prisma.js";

const privateKey = process.env.APN_PRIVATE_KEY?.replace(/\\n/g, "\n");

const apnProvider = new apn.Provider({
  token: {
    key: privateKey!,
    keyId: process.env.APN_KEY_ID!,
    teamId: process.env.APN_TEAM_ID!
  },
  production: false
});

type PushMessage = {
  title: string;
  body: string;
};

export class PushService {
  static async sendToUser(userId: string, message: PushMessage) {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user || !user.pushToken || !user.pushNotificationsEnabled) {
      return;
    }

    const notification = new apn.Notification();
    notification.topic = process.env.APN_BUNDLE_ID!;
    notification.alert = {
      title: message.title,
      body: message.body
    };
    notification.sound = "default";
    notification.badge = 1;

    try {
      const result = await apnProvider.send(notification, user.pushToken);

      if (result.failed.length > 0) {
        console.error("APNs failed:", result.failed);
      }

      if (result.sent.length > 0) {
        console.log("APNs sent successfully:", result.sent.length);
      }
    } catch (error) {
      console.error("Push send error:", error);
    }
  }

  static async sendToAllUsers(message: PushMessage) {
    const users = await prisma.user.findMany({
      where: {
        pushToken: { not: null },
        pushNotificationsEnabled: true
      }
    });

    for (const user of users) {
      await this.sendToUser(user.id, message);
    }
  }

  static async sendSmartRandomNotification() {
    const users = await prisma.user.findMany({
      where: {
        pushToken: { not: null },
        pushNotificationsEnabled: true
      }
    });

    for (const user of users) {
      const message = this.generateSmartMessage(user.preferredLanguage);
      await this.sendToUser(user.id, message);

      await prisma.user.update({
        where: { id: user.id },
        data: { lastPushSentAt: new Date() }
      });
    }
  }

  private static generateSmartMessage(language: "english" | "hebrew"): PushMessage {
    if (language === "hebrew") {
      const options = [
        {
          title: "בדיקה קטנה 👀",
          body: "עבר קצת זמן מאז שבדקת את ההוצאות שלך… שווה להציץ 👇"
        },
        {
          title: "רגע לפני שזה בורח 💸",
          body: "אולי שווה לבדוק את Spendly לפני שהתקציב מתחיל לרוץ"
        },
        {
          title: "Spendly קוראת לך 📱",
          body: "יש מצב שהיום יצא קצת יותר מהרגיל 😅"
        }
      ];

      return options[Math.floor(Math.random() * options.length)];
    }

    const options = [
      {
        title: "Quick check 👀",
        body: "It might be a good time to review your spending."
      },
      {
        title: "Before it gets out of control 💸",
        body: "Take a quick look at your budget in Spendly."
      },
      {
        title: "Spendly ping 📱",
        body: "Today might have been a bit expensive 😅"
      }
    ];

    return options[Math.floor(Math.random() * options.length)];
  }
}