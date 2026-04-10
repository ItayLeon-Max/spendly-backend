-- AlterTable
ALTER TABLE `Expense` ADD COLUMN `currentInstallmentNumber` INTEGER NULL,
    ADD COLUMN `nextRecurringDate` DATETIME(3) NULL,
    ADD COLUMN `originalTotalAmount` DOUBLE NULL,
    ADD COLUMN `recurringGroupId` VARCHAR(191) NULL,
    ADD COLUMN `remainingInstallments` INTEGER NULL,
    ADD COLUMN `totalInstallments` INTEGER NULL;
