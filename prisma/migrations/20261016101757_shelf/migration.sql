-- CreateTable
CREATE TABLE "ShelfItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "category" "GroceryCategory" NOT NULL DEFAULT 'OTHER',
    "boughtOn" TIMESTAMP(3) NOT NULL,
    "sourceWeek" TIMESTAMP(3),
    "sourceKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShelfItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShelfItem_name_idx" ON "ShelfItem"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ShelfItem_sourceWeek_sourceKey_key" ON "ShelfItem"("sourceWeek", "sourceKey");
