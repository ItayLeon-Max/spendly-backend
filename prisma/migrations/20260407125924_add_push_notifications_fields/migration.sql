-- AlterTable
ALTER TABLE `User` ADD COLUMN `lastPushSentAt` DATETIME(3) NULL,
    ADD COLUMN `preferredLanguage` ENUM('english', 'hebrew') NOT NULL DEFAULT 'english',
    ADD COLUMN `pushNotificationsEnabled` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `pushToken` TEXT NULL;
