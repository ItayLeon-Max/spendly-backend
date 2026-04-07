/*
  Warnings:

  - A unique constraint covering the columns `[userId,category,sharedBudgetId]` on the table `BudgetAllocation` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE `BudgetAllocation` DROP FOREIGN KEY `BudgetAllocation_userId_fkey`;

-- DropIndex
DROP INDEX `BudgetAllocation_userId_category_key` ON `BudgetAllocation`;

-- AlterTable
ALTER TABLE `BudgetAllocation` ADD COLUMN `sharedBudgetId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Expense` ADD COLUMN `sharedBudgetId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `SharedBudget` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,

    INDEX `SharedBudget_ownerId_idx`(`ownerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SharedBudgetMember` (
    `id` VARCHAR(191) NOT NULL,
    `role` ENUM('owner', 'member') NOT NULL DEFAULT 'member',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sharedBudgetId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,

    INDEX `SharedBudgetMember_sharedBudgetId_idx`(`sharedBudgetId`),
    INDEX `SharedBudgetMember_userId_idx`(`userId`),
    UNIQUE INDEX `SharedBudgetMember_sharedBudgetId_userId_key`(`sharedBudgetId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SharedBudgetInvite` (
    `id` VARCHAR(191) NOT NULL,
    `status` ENUM('pending', 'accepted', 'declined') NOT NULL DEFAULT 'pending',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `respondedAt` DATETIME(3) NULL,
    `sharedBudgetId` VARCHAR(191) NOT NULL,
    `invitedByUserId` VARCHAR(191) NOT NULL,
    `invitedUserId` VARCHAR(191) NOT NULL,

    INDEX `SharedBudgetInvite_sharedBudgetId_idx`(`sharedBudgetId`),
    INDEX `SharedBudgetInvite_invitedByUserId_idx`(`invitedByUserId`),
    INDEX `SharedBudgetInvite_invitedUserId_idx`(`invitedUserId`),
    INDEX `SharedBudgetInvite_status_idx`(`status`),
    UNIQUE INDEX `SharedBudgetInvite_sharedBudgetId_invitedUserId_key`(`sharedBudgetId`, `invitedUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `BudgetAllocation_sharedBudgetId_idx` ON `BudgetAllocation`(`sharedBudgetId`);

-- CreateIndex
CREATE UNIQUE INDEX `BudgetAllocation_userId_category_sharedBudgetId_key` ON `BudgetAllocation`(`userId`, `category`, `sharedBudgetId`);

-- CreateIndex
CREATE INDEX `Expense_sharedBudgetId_idx` ON `Expense`(`sharedBudgetId`);

-- AddForeignKey
ALTER TABLE `SharedBudget` ADD CONSTRAINT `SharedBudget_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SharedBudgetMember` ADD CONSTRAINT `SharedBudgetMember_sharedBudgetId_fkey` FOREIGN KEY (`sharedBudgetId`) REFERENCES `SharedBudget`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SharedBudgetMember` ADD CONSTRAINT `SharedBudgetMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SharedBudgetInvite` ADD CONSTRAINT `SharedBudgetInvite_sharedBudgetId_fkey` FOREIGN KEY (`sharedBudgetId`) REFERENCES `SharedBudget`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SharedBudgetInvite` ADD CONSTRAINT `SharedBudgetInvite_invitedByUserId_fkey` FOREIGN KEY (`invitedByUserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SharedBudgetInvite` ADD CONSTRAINT `SharedBudgetInvite_invitedUserId_fkey` FOREIGN KEY (`invitedUserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Expense` ADD CONSTRAINT `Expense_sharedBudgetId_fkey` FOREIGN KEY (`sharedBudgetId`) REFERENCES `SharedBudget`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BudgetAllocation` ADD CONSTRAINT `BudgetAllocation_sharedBudgetId_fkey` FOREIGN KEY (`sharedBudgetId`) REFERENCES `SharedBudget`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
