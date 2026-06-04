ALTER TABLE `users`
    ADD COLUMN `login_id` VARCHAR(12) NULL,
    ADD COLUMN `phone_number` VARCHAR(20) NULL;

CREATE UNIQUE INDEX `users_login_id_key` ON `users`(`login_id`);
