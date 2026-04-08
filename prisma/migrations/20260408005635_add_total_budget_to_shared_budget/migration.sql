/*
  Warnings:

  - Added the required column `totalBudget` to the `SharedBudget` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `SharedBudget` ADD COLUMN `totalBudget` DOUBLE NOT NULL;

-- AddForeignKey
ALTER TABLE `BudgetAllocation` ADD CONSTRAINT `BudgetAllocation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
