-- CreateTable
CREATE TABLE "RecipePhoto" (
    "recipeId" TEXT NOT NULL,
    "full" BYTEA NOT NULL,
    "fullWidth" INTEGER NOT NULL,
    "fullHeight" INTEGER NOT NULL,
    "thumb" BYTEA NOT NULL,
    "alt" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecipePhoto_pkey" PRIMARY KEY ("recipeId")
);

-- AddForeignKey
ALTER TABLE "RecipePhoto" ADD CONSTRAINT "RecipePhoto_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
