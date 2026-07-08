DROP INDEX `auth_tokens_token_family_id_idx` ON `auth_tokens`;

CREATE INDEX `auth_tokens_token_family_type_used_idx`
    ON `auth_tokens`(`token_family_id`, `token_type`, `used_at`);
