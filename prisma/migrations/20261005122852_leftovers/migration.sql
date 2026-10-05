-- AlterTable
ALTER TABLE "PlannedMeal" ADD COLUMN     "leftoversOf" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "PlannedMeal_leftoversOf_idx" ON "PlannedMeal"("leftoversOf");

-- AddForeignKey
ALTER TABLE "PlannedMeal" ADD CONSTRAINT "PlannedMeal_leftoversOf_fkey" FOREIGN KEY ("leftoversOf") REFERENCES "PlannedMeal"("date") ON DELETE CASCADE ON UPDATE CASCADE;
