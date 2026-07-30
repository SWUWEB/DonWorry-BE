
ALTER TABLE `wishlist_items` 
  ADD COLUMN `category_code` VARCHAR(50) NULL,
  ADD COLUMN `reason` VARCHAR(255) NULL;

UPDATE `wishlist_items` 
  SET `category_code` = 'ETC' 
  WHERE `category_code` IS NULL;

ALTER TABLE `wishlist_items` 
  MODIFY COLUMN `category_code` VARCHAR(50) NOT NULL;
