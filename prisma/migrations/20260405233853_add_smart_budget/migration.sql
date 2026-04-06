-- AlterTable
ALTER TABLE `User` ADD COLUMN `managedBudget` DOUBLE NULL,
    ADD COLUMN `monthlyIncome` DOUBLE NULL;

-- CreateTable
CREATE TABLE `BudgetAllocation` (
    `id` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,

    INDEX `BudgetAllocation_userId_idx`(`userId`),
    UNIQUE INDEX `BudgetAllocation_userId_category_key`(`userId`, `category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `BudgetAllocation` ADD CONSTRAINT `BudgetAllocation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
