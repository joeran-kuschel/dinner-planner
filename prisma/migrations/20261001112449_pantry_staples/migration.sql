-- CreateTable
CREATE TABLE "PantryStaple" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "PantryStaple_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PantryStaple_name_key" ON "PantryStaple"("name");
