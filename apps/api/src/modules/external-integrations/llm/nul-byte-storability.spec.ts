/**
 * U+0000 NEVER REACHES THE DATABASE (2026-08-31 incident).
 *
 * A model output carrying a NUL killed batch job 1eb1bff9 on the v18 replay:
 * Postgres rejects the write with 22P05, the error is deterministic, so all
 * three ingest attempts burned and the job died terminally — its documents
 * stranded. The fix strips NUL at the one chokepoint every LLM response
 * passes before parse/persist (`sanitizeJsonContent`).
 *
 * These tests drive the PRIVATE sanitizer directly rather than a mocked
 * Gemini call: the claim under test is about the sanitizer's contract, and
 * the caller trace proving the batch path reaches it
 * (parseCollectionBatchResponse → parseResponse → sanitizeJsonContent) is a
 * separate, static fact recorded in that method's comment.
 */
import { WinstonLoggerService } from '../../../shared/logging/winston-logger.service';
import { LLMService } from './llm.service';

type SanitizerHost = {
  sanitizeJsonContent(content: string): string;
  stripUnstorableNulls(content: string): string;
  logger: Pick<WinstonLoggerService, 'warn'>;
};

/** The sanitizer needs only `this.logger` — construct nothing else, so the
 *  test cannot drift with unrelated constructor churn. */
const sanitizer = (): { run: (raw: string) => string; warns: () => number } => {
  let warns = 0;
  const proto = LLMService.prototype as unknown as SanitizerHost;
  const host = {
    logger: {
      warn: (): void => {
        warns += 1;
      },
    },
    // Bound through the prototype so the helper the sanitizer calls is the
    // REAL one — a stub here would test the stub, not the fix.
    stripUnstorableNulls(this: SanitizerHost, content: string): string {
      return String(proto.stripUnstorableNulls.call(this, content));
    },
  } as unknown as SanitizerHost;
  const run = (raw: string): string =>
    String(proto.sanitizeJsonContent.call(host, raw));
  return { run, warns: () => warns };
};

const NUL = String.fromCharCode(0);

describe('LLM output sanitization — U+0000 is not storable text', () => {
  it('removes a LITERAL NUL so the parsed value can be persisted', () => {
    const { run } = sanitizer();
    const raw = `{"dish":"al pastor${NUL} taco"}`;

    const cleaned = run(raw);

    expect(cleaned).not.toContain(NUL);
    const parsed = JSON.parse(cleaned) as { dish: string };
    expect(parsed.dish).toBe('al pastor taco');
  });

  it('removes the \\u0000 ESCAPE — the form JSON.parse turns INTO a NUL', () => {
    const { run } = sanitizer();
    // This is the shape that actually killed the job: the raw bytes are
    // innocent ASCII, and the NUL only exists AFTER parsing.
    const raw = '{"dish":"birria\\u0000 ramen"}';

    const cleaned = run(raw);
    const parsed = JSON.parse(cleaned) as { dish: string };

    expect(parsed.dish).not.toContain(NUL);
    expect(parsed.dish).toBe('birria ramen');
  });

  it('leaves an ESCAPED backslash followed by u0000 alone (even-backslash rule)', () => {
    const { run } = sanitizer();
    // `\\u0000` in JSON is a literal backslash then the text 'u0000' — real
    // content, not a NUL, and it must survive untouched.
    const raw = '{"dish":"path\\\\u0000name"}';

    const parsed = JSON.parse(run(raw)) as { dish: string };

    expect(parsed.dish).toBe('path\\u0000name');
  });

  it('does not disturb ordinary content and stays silent when there is nothing to strip', () => {
    const s = sanitizer();
    const raw = '{"dish":"queso fundido","note":"100% agave"}';

    expect(JSON.parse(s.run(raw))).toEqual({
      dish: 'queso fundido',
      note: '100% agave',
    });
    expect(s.warns()).toBe(0);
  });

  it('reports each occurrence rather than removing it silently', () => {
    const s = sanitizer();

    s.run(`{"dish":"tacos${NUL}"}`);

    expect(s.warns()).toBe(1);
  });
});
