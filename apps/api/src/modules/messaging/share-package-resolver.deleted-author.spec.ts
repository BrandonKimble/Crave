import { SharedEntityKind } from '@prisma/client';
import { SharePackageResolverService } from './share-package-resolver.service';

// THE GRACE-WINDOW LEAK (found by the deleted-identity red-team, 2026-08-07):
// a grace-deleted user's row still holds their real name until purge, and the
// shared-comment card rendered it straight off the row. The byline must be
// "Deleted user" the moment deletedAt is set; the contribution itself stays
// shareable (Reddit-model ruling). Reverting the deletedAt branch in the
// comment arm reds the first test.
describe('share package byline for a grace-deleted author', () => {
  const VIEWER = '11111111-1111-1111-1111-111111111111';
  const COMMENT_ID = '22222222-2222-2222-2222-222222222222';

  function makeService(user: {
    username: string | null;
    displayName: string | null;
    deletedAt: Date | null;
  }) {
    const prisma = {
      pollComment: {
        findUnique: jest.fn().mockResolvedValue({
          body: 'best birria in town, fight me',
          deletedAt: null,
          userId: '33333333-3333-3333-3333-333333333333',
          pollId: '44444444-4444-4444-4444-444444444444',
          user,
        }),
      },
    };
    const blocks = { isBlockedPair: jest.fn().mockResolvedValue(false) };
    return new SharePackageResolverService(
      prisma as never,
      blocks as never,
      {} as never,
      {} as never,
    );
  }

  it('renders "Deleted user", NEVER the real name still sitting in the row', async () => {
    const service = makeService({
      username: 'alice_atx',
      displayName: 'Alice Realname',
      deletedAt: new Date('2026-08-01T00:00:00Z'),
    });

    const preview = (await service.resolve(
      SharedEntityKind.comment,
      COMMENT_ID,
      VIEWER,
    )) as { unavailable?: boolean; subtitle?: string | null; title?: string };

    // The contribution stays shareable (not unavailable)…
    expect(preview.unavailable).not.toBe(true);
    // …but nothing in the preview may carry the real identity.
    const rendered = JSON.stringify(preview);
    expect(rendered).not.toContain('Alice Realname');
    expect(rendered).not.toContain('alice_atx');
    expect(rendered).toContain('Deleted user');
  });

  it('a live author still gets their display name', async () => {
    const service = makeService({
      username: 'alice_atx',
      displayName: 'Alice Realname',
      deletedAt: null,
    });

    const preview = await service.resolve(
      SharedEntityKind.comment,
      COMMENT_ID,
      VIEWER,
    );
    expect(JSON.stringify(preview)).toContain('Alice Realname');
  });
});
