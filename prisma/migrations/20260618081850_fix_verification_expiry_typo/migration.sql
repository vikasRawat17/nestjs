/*
  Warnings:

  - You are about to drop the column `verificationnTokenExpiry` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "verificationnTokenExpiry",
ADD COLUMN     "verificationTokenExpiry" TIMESTAMP(3);
