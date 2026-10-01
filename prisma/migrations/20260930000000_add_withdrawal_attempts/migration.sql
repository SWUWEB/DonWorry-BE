CREATE TABLE `withdrawal_attempts` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `kakao_user_id` VARCHAR(100) NOT NULL,
    `reason_type` ENUM('LOW_FREQUENCY', 'MISSING_FEATURE', 'INCONVENIENT', 'PRIVACY_CONCERN', 'SWITCHING_SERVICE', 'OTHER') NULL,
    `status` ENUM('UNLINK_PENDING', 'UNLINKED') NOT NULL DEFAULT 'UNLINK_PENDING',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `withdrawal_attempts_user_id_key`(`user_id`),
    INDEX `withdrawal_attempts_status_created_at_idx`(`status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
