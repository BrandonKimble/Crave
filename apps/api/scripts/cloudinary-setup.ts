import 'dotenv/config';
import { v2 as cloudinary } from 'cloudinary';

/**
 * One-time (idempotent) Cloudinary account setup — the account-side half of
 * plans/images-ideal-shape.md. Run after the CLOUDINARY_* keys land, and
 * re-run any time; every operation upserts.
 *
 *   yarn ts-node scripts/cloudinary-setup.ts
 *
 * Creates:
 * 1. The four NAMED transformations (allowlisted under strict
 *    transformations; f_auto/q_auto are chained inline at delivery, not
 *    baked in — f_auto is inert inside named transformations).
 * 2. The SIGNED upload preset `crave_ugc_photo`: pins the incoming
 *    downscale, allowed formats, Rekognition moderation, metadata + quality
 *    extraction. Clients can override nothing that isn't in the ticket.
 *
 * MANUAL (Console, one time each — no API exists):
 * - Settings -> Security -> "Strict transformations": ENABLE, then allow
 *   the four t_crave_* named transformations.
 * - Add-ons -> register "Amazon Rekognition AI Moderation" (free tier).
 */
const TRANSFORMATIONS: Record<string, string> = {
  // geometry + crop only; f_auto,q_auto ride inline at delivery
  crave_thumb: 'c_fill,g_auto,h_160,w_160',
  crave_card: 'c_fill,g_auto,h_360,w_480',
  crave_gallery: 'c_limit,h_1080,w_1080',
  crave_full: 'c_limit,h_2048,w_2048',
};

async function main(): Promise<void> {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } =
    process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error('CLOUDINARY_* env keys are not set');
  }
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true,
  });

  for (const [name, transformation] of Object.entries(TRANSFORMATIONS)) {
    try {
      await cloudinary.api.create_transformation(name, transformation);
      process.stdout.write(`✅ transformation ${name} created\n`);
    } catch (error) {
      const code = (error as { error?: { http_code?: number } }).error
        ?.http_code;
      if (code === 409) {
        await cloudinary.api.update_transformation(name, {
          unsafe_update: transformation,
        });
        process.stdout.write(`♻️  transformation ${name} updated\n`);
      } else {
        throw error;
      }
    }
    // Deliverable under STRICT transformations (the whole allowlist).
    await cloudinary.api.update_transformation(name, {
      allowed_for_strict: true,
    });
  }

  const presetName = process.env.CLOUDINARY_UPLOAD_PRESET || 'crave_ugc_photo';
  const presetSettings = {
    unsigned: false,
    folder: '', // public_id carries the full crave/{env}/photos/ path
    allowed_formats: 'jpg,png,heic,webp,avif',
    // Cap stored originals (storage credits) — delivery variants are the
    // workhorse; media_metadata must be verified to survive this (E2E).
    transformation: [{ width: 2560, height: 2560, crop: 'limit' }],
    moderation: 'aws_rek',
    media_metadata: true,
    quality_analysis: true,
    overwrite: false,
    unique_filename: false,
  };
  try {
    await cloudinary.api.create_upload_preset({
      name: presetName,
      ...presetSettings,
    });
    process.stdout.write(`✅ upload preset ${presetName} created\n`);
  } catch (error) {
    const code = (error as { error?: { http_code?: number } }).error?.http_code;
    if (code === 409) {
      await cloudinary.api.update_upload_preset(presetName, presetSettings);
      process.stdout.write(`♻️  upload preset ${presetName} updated\n`);
    } else {
      throw error;
    }
  }

  const avatarSettings = {
    unsigned: false,
    folder: '',
    allowed_formats: 'jpg,png,heic,webp,avif',
    // Square-crop at ingest; ONE asset per user (overwrite on re-upload).
    transformation: [
      { width: 512, height: 512, crop: 'fill', gravity: 'auto' },
    ],
    moderation: 'aws_rek',
    overwrite: true,
    invalidate: true,
    unique_filename: false,
  };
  try {
    await cloudinary.api.create_upload_preset({
      name: 'crave_avatar',
      ...avatarSettings,
    });
    process.stdout.write('✅ upload preset crave_avatar created\n');
  } catch (error) {
    const code = (error as { error?: { http_code?: number } }).error?.http_code;
    if (code === 409) {
      await cloudinary.api.update_upload_preset('crave_avatar', avatarSettings);
      process.stdout.write('♻️  upload preset crave_avatar updated\n');
    } else {
      throw error;
    }
  }

  process.stdout.write(
    '\nREMINDERS (Console, manual):\n' +
      '  1. Security -> enable STRICT TRANSFORMATIONS; allow t_crave_thumb/card/gallery/full\n' +
      '  2. Add-ons -> register Amazon Rekognition AI Moderation (free tier)\n',
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
