/*
  Warnings:

  - Added the required column `body` to the `notifications` table without a default value. This is not possible if the table is not empty.
  - Added the required column `title` to the `notifications` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `monthly_budgets` ADD COLUMN `category_budgets` JSON NULL;

-- AlterTable
ALTER TABLE `notifications` ADD COLUMN `body` VARCHAR(255) NOT NULL,
    ADD COLUMN `title` VARCHAR(100) NOT NULL;
