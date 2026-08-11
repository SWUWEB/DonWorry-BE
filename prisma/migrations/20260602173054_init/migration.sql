-- CreateTable
CREATE TABLE `users` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(255) NOT NULL,
    `kakao_user_id` VARCHAR(100) NULL,
    `password_hash` VARCHAR(255) NULL,
    `login_provider` ENUM('LOCAL', 'KAKAO') NOT NULL DEFAULT 'LOCAL',
    `email_verified_at` DATETIME(3) NULL,
    `nickname` VARCHAR(50) NOT NULL,
    `profile_image_url` VARCHAR(500) NULL,
    `interest_tags_json` JSON NULL,
    `saving_goal_text` VARCHAR(255) NULL,
    `target_saving_amount` BIGINT UNSIGNED NULL,
    `accumulated_saved_amount` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `saving_goal_is_active` BOOLEAN NOT NULL DEFAULT true,
    `notify_goal_enabled` BOOLEAN NOT NULL DEFAULT true,
    `notify_temptation_enabled` BOOLEAN NOT NULL DEFAULT true,
    `notify_general_enabled` BOOLEAN NOT NULL DEFAULT true,
    `notify_push_enabled` BOOLEAN NOT NULL DEFAULT true,
    `onboarding_completed_at` DATETIME(3) NULL,
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    UNIQUE INDEX `users_kakao_user_id_key`(`kakao_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auth_tokens` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `users_id` BIGINT UNSIGNED NULL,
    `token_hash` VARCHAR(255) NOT NULL,
    `email_snapshot` VARCHAR(255) NULL,
    `token_type` ENUM('EMAIL_VERIFY', 'PASSWORD_RESET') NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `auth_tokens_token_hash_key`(`token_hash`),
    INDEX `auth_tokens_users_id_idx`(`users_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `consumption_analysis_reports` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `report_type` ENUM('MONTHLY_TOTAL', 'CATEGORY') NOT NULL,
    `report_month` CHAR(7) NOT NULL,
    `consumed_count` INTEGER UNSIGNED NOT NULL,
    `skipped_count` INTEGER UNSIGNED NOT NULL,
    `skipped_amount` BIGINT UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `consumption_analysis_reports_user_id_idx`(`user_id`),
    UNIQUE INDEX `consumption_analysis_reports_user_id_report_type_report_mont_key`(`user_id`, `report_type`, `report_month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `wishlist_item_id` BIGINT UNSIGNED NULL,
    `notify_at` DATETIME(3) NOT NULL,
    `is_sent` BOOLEAN NOT NULL DEFAULT false,
    `sent_at` DATETIME(3) NULL,
    `notification_type` ENUM('TEMPTATION', 'GOAL', 'GENERAL') NOT NULL DEFAULT 'GENERAL',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notifications_user_id_idx`(`user_id`),
    INDEX `notifications_wishlist_item_id_idx`(`wishlist_item_id`),
    INDEX `notifications_notify_at_is_sent_idx`(`notify_at`, `is_sent`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `intervention_questions` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `question_text` VARCHAR(255) NOT NULL,
    `sort_order` INTEGER NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `risk_weight` INTEGER NOT NULL DEFAULT 1,

    UNIQUE INDEX `intervention_questions_sort_order_key`(`sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `intervention_answers` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `record_id` BIGINT UNSIGNED NOT NULL,
    `question_id` BIGINT UNSIGNED NOT NULL,
    `answer_value` BOOLEAN NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `intervention_answers_question_id_idx`(`question_id`),
    UNIQUE INDEX `intervention_answers_record_id_question_id_key`(`record_id`, `question_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `consumption_records` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `risk_score` INTEGER NULL DEFAULT 0,
    `type` ENUM('CONSUMED', 'SKIPPED') NOT NULL,
    `product_name` VARCHAR(255) NOT NULL,
    `price` DECIMAL(12, 2) NOT NULL,
    `product_url` TEXT NULL,
    `reason` VARCHAR(255) NULL,
    `occurred_at` DATETIME(3) NOT NULL,
    `url_parse_success` BOOLEAN NULL,
    `work_hours_needed` DECIMAL(12, 2) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `consumption_records_user_id_occurred_at_idx`(`user_id`, `occurred_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wishlist_items` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `product_name` VARCHAR(255) NOT NULL,
    `product_url` TEXT NULL,
    `price` BIGINT UNSIGNED NULL,
    `product_image_url` VARCHAR(500) NULL,
    `wait_type` ENUM('1H', '1D', '3D', '1W') NOT NULL DEFAULT '1H',
    `wait_until` DATETIME(3) NULL,
    `status` ENUM('WAITING', 'DECIDED') NOT NULL DEFAULT 'WAITING',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `wishlist_items_user_id_status_idx`(`user_id`, `status`),
    INDEX `wishlist_items_wait_until_idx`(`wait_until`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wishlist_decisions` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `wishlist_item_id` BIGINT UNSIGNED NOT NULL,
    `decision_round` INTEGER UNSIGNED NOT NULL,
    `decision_type` ENUM('BUY', 'SKIP', 'DELAY') NOT NULL,
    `reason_alternative` BOOLEAN NULL,
    `reason_need` BOOLEAN NULL,
    `reason_recent_buy` BOOLEAN NULL,
    `reason_type` ENUM('NECESSARY', 'HAS_ALTERNATIVE', 'LOW_NECESSITY', 'RECENT_SIMILAR_PURCHASE', 'PRICE_BURDEN', 'NEED_MORE_TIME', 'OTHER') NULL,
    `reason_detail` TEXT NULL,
    `selected_wait_type` ENUM('1H', '1D', '3D', '1W') NULL,
    `selected_wait_until` DATETIME(3) NULL,
    `decided_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `wishlist_decisions_wishlist_item_id_idx`(`wishlist_item_id`),
    UNIQUE INDEX `wishlist_decisions_wishlist_item_id_decision_round_key`(`wishlist_item_id`, `decision_round`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `auth_tokens` ADD CONSTRAINT `auth_tokens_users_id_fkey` FOREIGN KEY (`users_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consumption_analysis_reports` ADD CONSTRAINT `consumption_analysis_reports_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_wishlist_item_id_fkey` FOREIGN KEY (`wishlist_item_id`) REFERENCES `wishlist_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `intervention_answers` ADD CONSTRAINT `intervention_answers_record_id_fkey` FOREIGN KEY (`record_id`) REFERENCES `consumption_records`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `intervention_answers` ADD CONSTRAINT `intervention_answers_question_id_fkey` FOREIGN KEY (`question_id`) REFERENCES `intervention_questions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consumption_records` ADD CONSTRAINT `consumption_records_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wishlist_items` ADD CONSTRAINT `wishlist_items_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wishlist_decisions` ADD CONSTRAINT `wishlist_decisions_wishlist_item_id_fkey` FOREIGN KEY (`wishlist_item_id`) REFERENCES `wishlist_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
