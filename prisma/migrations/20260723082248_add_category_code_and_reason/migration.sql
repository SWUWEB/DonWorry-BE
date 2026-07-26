
ALTER TABLE `wishlist_items` 
  ADD COLUMN `category_code` VARCHAR(50) NULL,
  ADD COLUMN `reason` VARCHAR(255) NULL;

UPDATE `wishlist_items` 
  SET `category_code` = 'ETC' 
  WHERE `category_code` IS NULL;

ALTER TABLE `wishlist_items` 
  MODIFY COLUMN `category_code` VARCHAR(50) NOT NULL;

-- RenameIndex
ALTER TABLE `auth_tokens` RENAME INDEX `auth_tokens_token_family_type_used_idx` TO `auth_tokens_token_family_id_token_type_used_at_idx`;