import apn from "apn";
import { prisma } from "../config/prisma.js";
const privateKey = process.env.APN_PRIVATE_KEY?.replace(/\\n/g, "\n");
const apnProvider = new apn.Provider({
    token: {
        key: privateKey,
        keyId: process.env.APN_KEY_ID,
        teamId: process.env.APN_TEAM_ID
    },
    production: true // Set to true for production environment
});
export class PushService {
    static async sendToUser(userId, message) {
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });
        if (!user || !user.pushToken || !user.pushNotificationsEnabled) {
            return;
        }
        const notification = new apn.Notification();
        notification.pushType = "alert";
        notification.topic = process.env.APN_BUNDLE_ID;
        notification.alert = {
            title: message.title,
            body: message.body
        };
        notification.sound = "default";
        notification.badge = 1;
        notification.payload = message.data || {};
        try {
            const result = await apnProvider.send(notification, user.pushToken);
            console.log("APNs sent:", result.sent);
            console.log("APNs failed:", result.failed);
        }
        catch (error) {
            console.error("Push send error:", error);
        }
    }
    static async sendToAllUsers(message) {
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
    static generateSmartMessage(language) {
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
