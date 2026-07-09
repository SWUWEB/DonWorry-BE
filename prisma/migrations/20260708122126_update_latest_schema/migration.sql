-- RenameIndex
ALTER TABLE `auth_tokens` RENAME INDEX `auth_tokens_token_family_type_used_idx` TO `auth_tokens_token_family_id_token_type_used_at_idx`;
