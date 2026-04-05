-- AlterTable
ALTER TABLE `Expense` ADD COLUMN `isNeed` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `mood` ENUM('happy', 'stressed', 'spontaneous', 'tired', 'treatingMyself') NULL;
