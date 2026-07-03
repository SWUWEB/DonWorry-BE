ALTER TABLE `auth_tokens`
    ADD COLUMN `failed_attempt_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN `blocked_until` DATETIME(3) NULL;
