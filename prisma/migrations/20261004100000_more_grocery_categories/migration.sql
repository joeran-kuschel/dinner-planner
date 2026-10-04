-- AlterEnum
-- Placed so the database order matches the schema: Dairy, Pasta/rice, Pantry, Herbs/spices, Frozen.
ALTER TYPE "GroceryCategory" ADD VALUE 'PASTA_RICE' BEFORE 'PANTRY';
ALTER TYPE "GroceryCategory" ADD VALUE 'HERBS_SPICES' BEFORE 'FROZEN';
