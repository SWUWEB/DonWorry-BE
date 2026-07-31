/*
  Warnings:

  - You are about to drop the column `decision_round` on the `wishlist_decisions` table. All the data in the column will be lost.
  - You are about to drop the column `reason_alternative` on the `wishlist_decisions` table. All the data in the column will be lost.
  - You are about to drop the column `reason_detail` on the `wishlist_decisions` table. All the data in the column will be lost.
  - You are about to drop the column `reason_need` on the `wishlist_decisions` table. All the data in the column will be lost.
  - You are about to drop the column `reason_recent_buy` on the `wishlist_decisions` table. All the data in the column will be lost.
  - You are about to drop the column `reason_type` on the `wishlist_decisions` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `wishlist_decisions` DROP FOREIGN KEY `wishlist_decisions_wishlist_item_id_fkey`;

-- DropIndex
DROP INDEX `wishlist_decisions_wishlist_item_id_decision_round_key` ON `wishlist_decisions`;

-- AlterTable
ALTER TABLE `wishlist_decisions` DROP COLUMN `decision_round`,
    DROP COLUMN `reason_alternative`,
    DROP COLUMN `reason_detail`,
    DROP COLUMN `reason_need`,
    DROP COLUMN `reason_recent_buy`,
    DROP COLUMN `reason_type`;
