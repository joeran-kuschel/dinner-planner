-- CreateEnum
CREATE TYPE "GroceryCategory" AS ENUM ('PRODUCE', 'BAKERY', 'MEAT_FISH', 'DAIRY_EGGS', 'PANTRY', 'FROZEN', 'DRINKS', 'OTHER');

-- AlterTable
ALTER TABLE "GroceryEntry" ADD COLUMN     "category" "GroceryCategory" NOT NULL DEFAULT 'OTHER';

-- AlterTable
ALTER TABLE "Ingredient" ADD COLUMN     "category" "GroceryCategory" NOT NULL DEFAULT 'OTHER';
