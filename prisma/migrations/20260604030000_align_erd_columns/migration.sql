-- Rename auth token user foreign key column to match the user_id convention.
ALTER TABLE `auth_tokens` DROP FOREIGN KEY `auth_tokens_users_id_fkey`;
DROP INDEX `auth_tokens_users_id_idx` ON `auth_tokens`;
ALTER TABLE `auth_tokens` RENAME COLUMN `users_id` TO `user_id`;
CREATE INDEX `auth_tokens_user_id_idx` ON `auth_tokens`(`user_id`);
ALTER TABLE `auth_tokens` ADD CONSTRAINT `auth_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Add notification read state columns.
ALTER TABLE `notifications`
    ADD COLUMN `is_read` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `read_at` DATETIME(3) NULL;

-- Add category discriminator for category-level reports.
ALTER TABLE `consumption_analysis_reports`
    DROP INDEX `consumption_analysis_reports_user_id_report_type_report_mont_key`,
    ADD COLUMN `category_key` VARCHAR(50) NOT NULL DEFAULT 'TOTAL';

CREATE UNIQUE INDEX `reports_user_type_month_category_key` ON `consumption_analysis_reports`(`user_id`, `report_type`, `report_month`, `category_key`);
