/**
 * §5 poll_surface source rows — every place's poll surface IS a source (the
 * calibration room): graduated threads are its documents, its poll audience
 * is its A. Rows are created LAZILY on first need (first graduation of a
 * place-keyed poll) and carry NO engineId — the field is reddit-class only
 * (§5: poll evidence reaches collection only as demand through the ledger,
 * never as corpus).
 */
import { Injectable } from '@nestjs/common';
import { Prisma, Source } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export const POLL_SURFACE_PLATFORM = 'poll_surface';

/** The source handle doubles as the SourceDocument.community stamp. */
export function pollSurfaceHandle(placeId: string): string {
  return `poll_surface:${placeId}`;
}

@Injectable()
export class PollSurfaceSourceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Idempotent lazy create: one poll_surface source per place, ever. */
  async ensureForPlace(placeId: string): Promise<Source> {
    const handle = pollSurfaceHandle(placeId);
    const existing = await this.prisma.source.findUnique({
      where: {
        platform_handle: { platform: POLL_SURFACE_PLATFORM, handle },
      },
    });
    if (existing) {
      return existing;
    }
    try {
      return await this.prisma.source.create({
        data: {
          platform: POLL_SURFACE_PLATFORM,
          handle,
          anchorPlaceId: placeId,
          // engineId deliberately never set for poll_surface (§5).
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return this.prisma.source.findUniqueOrThrow({
          where: {
            platform_handle: { platform: POLL_SURFACE_PLATFORM, handle },
          },
        });
      }
      throw error;
    }
  }
}
