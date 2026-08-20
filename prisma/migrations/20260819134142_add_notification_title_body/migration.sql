/*
  Warnings:

  - Added the required column `body` to the `notifications` table without a default value. This is not possible if the table is not empty.
  - Added the required column `title` to the `notifications` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `notifications` ADD COLUMN `title` VARCHAR(100) NULL;
ALTER TABLE `notifications` ADD COLUMN `body` VARCHAR(500) NULL;

UPDATE `notifications`
SET
  `title` = COALESCE(`title`, '알림'),
  `body` = COALESCE(`body`, '새로운 알림이 도착했어요.')
WHERE `title` IS NULL OR `body` IS NULL;

ALTER TABLE `notifications` MODIFY COLUMN `title` VARCHAR(100) NOT NULL;
ALTER TABLE `notifications` MODIFY COLUMN `body` VARCHAR(500) NOT NULL;