/**
 * THE SOURCE DECLARES ITS LANGUAGE (multilingual spine, step 4).
 *
 * Collection reads words off a subreddit and banks them as surface forms, and
 * until now it recorded nothing about WHICH LANGUAGE those words were in — so
 * every form landed untagged, and the extraction banking sites said so in
 * their own comments: a fabricated language tag is worse than none.
 *
 * The tag stops being a fabrication once it comes from a fact we already
 * hold. We CHOOSE which communities to collect from, so a community's
 * language is configuration, not inference. These tests pin that the document
 * takes its language from its community row and from nowhere else — in
 * particular that nothing here sniffs the text, which is the failure mode
 * this design exists to avoid.
 */
import { CollectionEvidenceService } from './collection-evidence.service';

/** The slice of the createMany argument these tests read. */
interface CreateManyCall {
  data: Array<{ language: string }>;
}

describe('persistSourceDocuments — the document takes its language from its source', () => {
  function harness(communityRow: { language: string } | null) {
    const createMany = jest
      .fn<Promise<{ count: number }>, [CreateManyCall]>()
      .mockResolvedValue({ count: 1 });
    const findUnique = jest.fn().mockResolvedValue(communityRow);
    const prisma = {
      sourceDocument: {
        createMany,
        // The read-back that maps source ids to document ids; irrelevant here.
        findMany: jest.fn().mockResolvedValue([]),
      },
      collectionCommunity: { findUnique },
    };
    // A full-shaped logger: onModuleInit boot-arms the reconciler on a
    // worker runtime, and its failure path logs through `error` (CI 2026-09-04:
    // a stub without `error` turned that path into an unhandled rejection).
    const logger = {
      setContext: jest.fn().mockReturnThis(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    const service = new CollectionEvidenceService(
      prisma as never,
      {} as never,
      logger as never,
      { emit: jest.fn() } as never,
    );
    service.onModuleInit();
    return { service, createMany, findUnique };
  }

  /** One minimal post — the flattener needs only these fields to emit a row. */
  const post = {
    id: 'abc123',
    title: 'bún đậu ở đâu ngon',
    selftext: 'ai biết chỗ nào không',
    created_utc: 1_700_000_000,
    permalink: '/r/x/comments/abc123/',
    score: 12,
    comments: [],
  };

  it('stamps every document with the COMMUNITY row language, not English', async () => {
    const { service, createMany, findUnique } = harness({ language: 'vi' });

    await service.persistSourceDocuments({
      community: 'saigonfood',
      posts: [post] as never,
    });

    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { communityName: 'saigonfood' } }),
    );
    const written = createMany.mock.calls[0][0].data;
    expect(written.length).toBeGreaterThan(0);
    for (const row of written) {
      expect(row.language).toBe('vi');
    }
  });

  it('falls back to the column default when no community row names a language', async () => {
    // An unknown community is not an invitation to guess — it takes the same
    // literal the two columns default to, so the DB and the writer cannot
    // disagree about what an un-languaged source means.
    const { service, createMany } = harness(null);

    await service.persistSourceDocuments({
      community: 'not-onboarded',
      posts: [post] as never,
    });

    const written = createMany.mock.calls[0][0].data;
    expect(written.every((row) => row.language === 'en')).toBe(true);
  });

  it('never reads the community table when there is no community at all', async () => {
    const { service, createMany, findUnique } = harness(null);

    await service.persistSourceDocuments({
      community: null,
      posts: [post] as never,
    });

    expect(findUnique).not.toHaveBeenCalled();
    const written = createMany.mock.calls[0][0].data;
    expect(written.every((row) => row.language === 'en')).toBe(true);
  });

  it('does NOT infer the language from the text — Vietnamese prose in an en community stays en', async () => {
    // The whole point of sourcing the tag from configuration. If this ever
    // flips to 'vi', someone has bolted a detector onto the persist path and
    // the tag has gone back to being a guess.
    const { service, createMany } = harness({ language: 'en' });

    await service.persistSourceDocuments({
      community: 'austinfood',
      posts: [post] as never,
    });

    const written = createMany.mock.calls[0][0].data;
    expect(written.every((row) => row.language === 'en')).toBe(true);
  });
});
