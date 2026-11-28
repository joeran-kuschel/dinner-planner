-- The shop sections become rows the user can change (issue #29). The enum becomes a table of the same name, so the old
-- type is renamed out of the way first (a table and a type share one name space), the ten values become rows in enum
-- order with a fixed id (`cat_<key in lower case>`), every ingredient and grocery entry keeps its section through that
-- id, and the enum goes. Tick state does not change: a line's key never contained the category.

-- Out of the way
ALTER TYPE "GroceryCategory" RENAME TO "GroceryCategory_old";

-- CreateTable
CREATE TABLE "GroceryCategory" (
    "id" TEXT NOT NULL,
    "key" TEXT,
    "name" TEXT,
    "position" INTEGER NOT NULL,

    CONSTRAINT "GroceryCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GroceryCategory_key_key" ON "GroceryCategory"("key");

-- The ten sections the app had, in the order of the enum (a walk through the shop). They have no name: they stay translated.
INSERT INTO "GroceryCategory" ("id", "key", "position") VALUES
    ('cat_produce', 'PRODUCE', 0),
    ('cat_bakery', 'BAKERY', 1),
    ('cat_meat_fish', 'MEAT_FISH', 2),
    ('cat_dairy_eggs', 'DAIRY_EGGS', 3),
    ('cat_pasta_rice', 'PASTA_RICE', 4),
    ('cat_pantry', 'PANTRY', 5),
    ('cat_herbs_spices', 'HERBS_SPICES', 6),
    ('cat_frozen', 'FROZEN', 7),
    ('cat_drinks', 'DRINKS', 8),
    ('cat_other', 'OTHER', 9);

-- AlterTable
ALTER TABLE "Ingredient" ADD COLUMN "categoryId" TEXT;
UPDATE "Ingredient" SET "categoryId" = 'cat_' || lower("category"::text);
ALTER TABLE "Ingredient" ALTER COLUMN "categoryId" SET NOT NULL;
ALTER TABLE "Ingredient" DROP COLUMN "category";

-- AlterTable
ALTER TABLE "GroceryEntry" ADD COLUMN "categoryId" TEXT;
UPDATE "GroceryEntry" SET "categoryId" = 'cat_' || lower("category"::text);
ALTER TABLE "GroceryEntry" ALTER COLUMN "categoryId" SET NOT NULL;
ALTER TABLE "GroceryEntry" DROP COLUMN "category";

-- DropEnum
DROP TYPE "GroceryCategory_old";

-- CreateIndex
CREATE INDEX "Ingredient_categoryId_idx" ON "Ingredient"("categoryId");

-- CreateIndex
CREATE INDEX "GroceryEntry_categoryId_idx" ON "GroceryEntry"("categoryId");

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "GroceryCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroceryEntry" ADD CONSTRAINT "GroceryEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "GroceryCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
