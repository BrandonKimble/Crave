-- AlterTable
ALTER TABLE "collection_subreddits"
ADD COLUMN     "viewport_ne_latitude" DECIMAL(11,8),
ADD COLUMN     "viewport_ne_longitude" DECIMAL(11,8),
ADD COLUMN     "viewport_sw_latitude" DECIMAL(11,8),
ADD COLUMN     "viewport_sw_longitude" DECIMAL(11,8);
