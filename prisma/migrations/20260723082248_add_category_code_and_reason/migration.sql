/*
  Warnings:

  - Added the required column `category_code` to the `wishlist_items` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `wishlist_items` ADD COLUMN `category_code` VARCHAR(50) NOT NULL,
    ADD COLUMN `reason` VARCHAR(255) NULL;

-- RenameIndex
ALTER TABLE `auth_tokens` RENAME INDEX `auth_tokens_token_family_type_used_idx` TO `auth_tokens_token_family_id_token_type_used_at_idx`;
