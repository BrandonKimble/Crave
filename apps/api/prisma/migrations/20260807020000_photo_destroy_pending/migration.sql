-- F9470: a Cloudinary destroy that throws used to leave the row `removed`
-- while the asset lived on forever (billed storage + a privacy leak — the
-- deterministic publicId URL stayed reachable). New `destroy_pending` state:
-- the row is invisible to readers but the reconciliation sweep keeps retrying
-- destroyAsset until it succeeds, then marks `removed`. No asset outlives its
-- row. Lightweight enum add — no table rewrite, no parallel-worker guard.
ALTER TYPE "PhotoStatus" ADD VALUE IF NOT EXISTS 'destroy_pending';
