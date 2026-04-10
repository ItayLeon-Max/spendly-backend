-- AlterTable
ALTER TABLE `Expense` ADD COLUMN `installmentCount` INTEGER NULL,
    ADD COLUMN `isOngoing` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `isRecurring` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `recurringFrequency` VARCHAR(191) NULL;
