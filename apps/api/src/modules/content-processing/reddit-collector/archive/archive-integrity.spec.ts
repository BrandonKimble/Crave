import { writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ArchiveIngestionService } from './archive-ingestion.service';
import { ArchiveZstdDecompressor } from './archive-zstd-decompressor.service';
import {
  isRedditSubmission,
  RedditComment,
  RedditSubmission,
} from '../reddit-data.types';

/**
 * Archive integrity — the Phase-2 "first move": prove the derive-or-refuse
 * laws with synthetic malformed fixtures (F451, F452, F471, F453). Every
 * assertion here can show RED — it did, against the pre-fix code:
 *  - F451: isRedditSubmission rejected string created_utc → the string
 *    fixture never survived.
 *  - F452: id-less records were minted a Math.random() id → they survived
 *    (and duplicated on re-run) instead of being dropped.
 *  - F471: a NaN/absent created_utc became now() → the record survived with
 *    fabricated maximal recency instead of being dropped.
 *  - F453: a truncated .zst RESOLVED success with partial counts instead of
 *    rejecting.
 */

function makeLogger() {
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  return {
    logger,
    loggerService: { setContext: jest.fn().mockReturnValue(logger) },
  };
}

const PROCESSING_RESULT = {
  success: true,
  metrics: {
    totalLines: 0,
    validLines: 0,
    errorLines: 0,
    processingTime: 1,
    memoryUsage: { initial: 0, peak: 0, final: 0 },
    averageLineProcessingTime: 0,
  },
  errors: [],
};

describe('F451: isRedditSubmission accepts the created_utc shapes its type declares', () => {
  const base = {
    id: 't3_ok',
    title: 'a title',
    author: 'someone',
    subreddit: 'food',
    url: 'https://reddit.com/x',
  };

  it('accepts a numeric-string created_utc (not only a number)', () => {
    expect(isRedditSubmission({ ...base, created_utc: '1700000000' })).toBe(
      true,
    );
    expect(isRedditSubmission({ ...base, created_utc: 1700000000 })).toBe(true);
  });

  it('still rejects a non-numeric created_utc', () => {
    expect(isRedditSubmission({ ...base, created_utc: 'nope' })).toBe(false);
  });
});

describe('F452/F471: archive ingestion drops unusable identity / timestamp', () => {
  function buildService(
    submissions: Array<Partial<RedditSubmission>>,
    comments: Array<Partial<RedditComment>>,
  ) {
    const { logger, loggerService } = makeLogger();
    const streamProcessor = {
      processZstdNdjsonFile: jest.fn(
        async (
          filePath: string,
          cb: (data: unknown, line: number) => Promise<void> | void,
          validator?: (data: unknown) => boolean,
        ) => {
          const records = filePath.includes('submissions')
            ? submissions
            : comments;
          let line = 0;
          for (const rec of records) {
            line += 1;
            if (!validator || validator(rec)) {
              await cb(rec, line);
            }
          }
          return PROCESSING_RESULT;
        },
      ),
    };
    const configService = { get: jest.fn((_k: string, d?: unknown) => d) };
    const service = new ArchiveIngestionService(
      configService as never,
      streamProcessor as never,
      loggerService as never,
      {} as never,
    );
    service.onModuleInit();
    return { service, logger };
  }

  async function load(service: ArchiveIngestionService) {
    return (
      service as unknown as {
        loadArchivePosts: (
          subreddit: string,
          correlationId: string,
        ) => Promise<{ posts: Array<{ id: string; created_at: string }> }>;
      }
    ).loadArchivePosts('food', 'corr');
  }

  const goodComment = (linkId: string): Partial<RedditComment> => ({
    id: `t1_c_${linkId}`,
    body: 'tasty',
    author: 'diner',
    created_utc: 1700000000,
    subreddit: 'food',
    link_id: linkId,
  });

  it('keeps a valid submission and one with a numeric-STRING created_utc (F451 end to end)', async () => {
    const { service } = buildService(
      [
        {
          id: 'num1',
          title: 't',
          author: 'a',
          created_utc: 1700000000,
          subreddit: 'food',
          url: 'u',
        },
        {
          id: 'str1',
          title: 't',
          author: 'a',
          created_utc: '1700000000',
          subreddit: 'food',
          url: 'u',
        },
      ],
      [goodComment('t3_num1'), goodComment('t3_str1')],
    );
    const { posts } = await load(service);
    expect(posts.map((p) => p.id).sort()).toEqual(['t3_num1', 't3_str1']);
  });

  it('DROPS an id-less submission — never a random id (F452 idempotence)', async () => {
    const { service, logger } = buildService(
      [
        {
          id: 'ok1',
          title: 't',
          author: 'a',
          created_utc: 1700000000,
          subreddit: 'food',
          url: 'u',
        },
        {
          id: '', // passes isRedditSubmission (string), no derivable id
          title: 't',
          author: 'a',
          created_utc: 1700000000,
          subreddit: 'food',
          url: 'u',
        },
      ],
      [goodComment('t3_ok1')],
    );
    const { posts } = await load(service);
    // only the derivable-id post survives; the id-less one is gone, and no
    // random t3_<hash> id was minted for it.
    expect(posts.map((p) => p.id)).toEqual(['t3_ok1']);
    expect(posts.some((p) => /^t3_[0-9a-f]{10}$/.test(p.id))).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('unusable identity or timestamp'),
      expect.objectContaining({ identityDroppedSubmissions: 1 }),
    );
  });

  it('DROPS a submission whose created_utc is unparseable — never now() (F471)', async () => {
    const { service, logger } = buildService(
      [
        {
          id: 'nan1',
          title: 't',
          author: 'a',
          created_utc: Number.NaN, // typeof number → passes the guard
          subreddit: 'food',
          url: 'u',
        },
      ],
      [goodComment('t3_nan1')],
    );
    const { posts } = await load(service);
    expect(posts).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('unusable identity or timestamp'),
      expect.objectContaining({ timestampDroppedSubmissions: 1 }),
    );
  });

  it('DROPS a comment whose created_utc is unparseable — never now() (F471)', async () => {
    const { service, logger } = buildService(
      [
        {
          id: 'ok1',
          title: 't',
          author: 'a',
          created_utc: 1700000000,
          subreddit: 'food',
          url: 'u',
        },
      ],
      [
        goodComment('t3_ok1'),
        {
          id: 't1_bad',
          body: 'x',
          author: 'a',
          created_utc: Number.NaN,
          subreddit: 'food',
          link_id: 't3_ok1',
        },
      ],
    );
    const { posts } = await load(service);
    // the good comment keeps the post alive; the NaN comment is dropped
    expect(posts).toHaveLength(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('unusable identity or timestamp'),
      expect.objectContaining({ timestampDroppedComments: 1 }),
    );
  });
});

describe('F453: a truncated .zst rejects, never resolves partial success', () => {
  it('rejects a truncated zstd frame', async () => {
    const { loggerService } = makeLogger();
    const decompressor = new ArchiveZstdDecompressor(loggerService as never);
    decompressor.onModuleInit();

    // A valid zstd magic number (0x28 0xB5 0x2F 0xFD) followed by nothing —
    // the system `zstd -dc` exits non-zero on this truncated frame.
    const dir = mkdtempSync(join(tmpdir(), 'zst-trunc-'));
    const file = join(dir, 'truncated.zst');
    writeFileSync(file, Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x00, 0x00]));

    await expect(
      decompressor.streamDecompressFile(file, () => undefined, {
        timeout: 10000,
      }),
    ).rejects.toThrow();
  });
});
