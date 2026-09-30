/*
  Warnings:

  - You are about to drop the `consumption_analysis_reports` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `consumption_analysis_reports` DROP FOREIGN KEY `consumption_analysis_reports_user_id_fkey`;

-- DropTable
DROP TABLE `consumption_analysis_reports`;
