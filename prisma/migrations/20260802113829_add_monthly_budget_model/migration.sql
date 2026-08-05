-- CreateTable
CREATE TABLE `monthly_budgets` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `year_month` CHAR(7) NOT NULL,
    `monthly_income` BIGINT UNSIGNED NULL,
    `monthly_budget` BIGINT UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `monthly_budgets_user_id_idx`(`user_id`),
    UNIQUE INDEX `monthly_budgets_user_year_month_key`(`user_id`, `year_month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `monthly_budgets` ADD CONSTRAINT `monthly_budgets_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
