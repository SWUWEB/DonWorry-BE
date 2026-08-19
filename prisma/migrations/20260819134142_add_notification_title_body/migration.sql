/*
  Warnings:

  - Added the required column `body` to the `notifications` table without a default value. This is not possible if the table is not empty.
  - Added the required column `title` to the `notifications` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `monthly_budgets` ADD COLUMN `category_budgets` JSON NULL;

-- 1단계: Nullable 컬럼 추가
ALTER TABLE `notifications` ADD COLUMN `title` VARCHAR(100) NULL;
ALTER TABLE `notifications` ADD COLUMN `body` VARCHAR(500) NULL;

-- 2단계: 기존 데이터 백필
UPDATE `notifications`
SET
  `title` = COALESCE(`title`, '알림'),
  `body` = COALESCE(`body`, '새로운 알림이 도착했어요.')
WHERE `title` IS NULL OR `body` IS NULL;

-- 3단계: NOT NULL로 전환
ALTER TABLE `notifications` MODIFY COLUMN `title` VARCHAR(100) NOT NULL;
ALTER TABLE `notifications` MODIFY COLUMN `body` VARCHAR(500) NOT NULL;