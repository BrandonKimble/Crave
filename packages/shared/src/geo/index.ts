/**
 * Shared geo law (header subject-store design): pure bbox primitives
 * (place-geo), the §2 read-time subjecthood/header law (subjects), and the
 * sliding-slice seam vocabulary (slice). Consumed by BOTH apps/api and
 * apps/mobile — no Nest, no Prisma, no IO, ever.
 */
export * from './place-geo';
export * from './ground';
export * from './subjects';
export * from './slice';
