-- CreateTable
CREATE TABLE `auth_request_logs` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `request_key_hash` CHAR(64) NOT NULL,
    `request_type` ENUM('PASSWORD_RESET') NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `auth_request_logs_key_type_created_idx`(`request_key_hash`, `request_type`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
