-- AlterTable
ALTER TABLE `users` ADD COLUMN `birth_date` DATE NULL,
    ADD COLUMN `gender` ENUM('FEMALE', 'MALE') NULL;
