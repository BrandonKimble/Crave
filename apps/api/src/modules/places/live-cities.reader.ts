import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface LiveCity {
  placeId: string;
  name: string;
}

/**
 * WHAT IS A LIVE CITY — stated once (D40 §1.4).
 *
 * A live city is a place with COLLECTION sources anchored to it
 * (`sources.anchor_place_id`, `platform <> 'poll_surface'` — poll_surface rows
 * are the per-place poll mouth, minted at any granularity, not corpus
 * coverage). Never a hardcoded list.
 *
 * This lived inside `CuratedListBuilderService.liveCities()`. It moved out for
 * one reason: the ONBOARDING answer path now has to resolve the user's chosen
 * city to a place id, and "resolve a city" implemented twice is how the
 * name-match join became a silent zero in the first place. The write path and
 * the build path must agree on which places are live by construction, not by
 * two queries that happen to look alike today.
 *
 * NAME MATCHING lives here too, and it is deliberately confined to ONE call
 * site: the completion write, where the user's typed/selected city becomes a
 * KEY. After that write, every reader joins on the uuid and a rename can no
 * longer empty anybody's lists. A miss returns null and the caller is
 * required to say so out loud.
 */
@Injectable()
export class LiveCitiesReader {
  constructor(private readonly prisma: PrismaService) {}

  async liveCities(): Promise<LiveCity[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ place_id: string; name: string }>
    >(Prisma.sql`
      /*live_cities*/
      SELECT DISTINCT s.anchor_place_id AS place_id, p.name
      FROM sources s
      JOIN places p ON p.place_id = s.anchor_place_id
      WHERE s.anchor_place_id IS NOT NULL
        AND s.platform <> 'poll_surface'
      ORDER BY p.name ASC
    `);
    return rows.map((row) => ({ placeId: row.place_id, name: row.name }));
  }

  /**
   * The city NAME → place id resolution, at the one moment it is allowed to
   * happen. Case-insensitive and trimmed, because the input is a display
   * string; anything looser would be inventing a match.
   *
   * Returns null when the name is not a live city — a waitlist city, a typo,
   * a renamed place. That is a real and expected outcome (the waitlist flow
   * depends on it), so it is a value, not an exception; the caller records it.
   */
  async resolvePlaceIdByName(name: string | null): Promise<string | null> {
    const trimmed = (name ?? '').trim();
    if (!trimmed) {
      return null;
    }
    const cities = await this.liveCities();
    const match = cities.find(
      (city) => city.name.toLowerCase() === trimmed.toLowerCase(),
    );
    return match?.placeId ?? null;
  }
}
