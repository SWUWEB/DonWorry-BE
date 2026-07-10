ALTER TABLE `auth_tokens`
    ADD COLUMN `token_family_id` VARCHAR(36) NULL;

CREATE INDEX `auth_tokens_token_family_id_idx` ON `auth_tokens`(`token_family_id`);
