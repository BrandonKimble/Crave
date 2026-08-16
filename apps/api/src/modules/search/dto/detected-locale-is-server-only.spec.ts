/**
 * A0 R2: `detectedLocale` IS THE SERVER'S ANSWER, NOT THE CALLER'S.
 *
 * The field answers "what language did this query turn out to be", and its
 * value is written to the on-demand queue, the `on_demand_ask` signal and the
 * residue row — evidence later read to decide which languages are worth
 * spending collection and vocabulary budget on. `POST /search/run` and `POST
 * /search/plan` take this DTO straight from the request body with no analyzer
 * in front of them, so until this test existed a caller could post
 * `detectedLocale: 'vi'` on an English query and mint Vietnamese demand.
 *
 * Driven through the app's REAL ValidationPipe config, so what is proven is
 * what production does with a wire payload — not what a hand-called
 * transformer does in isolation.
 */
import 'reflect-metadata';
import { ArgumentMetadata } from '@nestjs/common';
import { createValidationPipeConfig } from '../../../shared/pipes/validation.config';
import { SearchQueryRequestDto } from './search-query.dto';
import {
  normalizeDetectedLocaleTag,
  normalizeLocaleTag,
} from '../../../shared/locale';

const METADATA: ArgumentMetadata = {
  type: 'body',
  metatype: SearchQueryRequestDto,
};

async function throughThePipe(
  body: Record<string, unknown>,
): Promise<SearchQueryRequestDto> {
  const pipe = createValidationPipeConfig(false);
  return (await pipe.transform(body, METADATA)) as SearchQueryRequestDto;
}

describe('detectedLocale is server-derived (A0 R2)', () => {
  it('a well-formed client value is IGNORED — the request still runs', async () => {
    // 'vi' is well-formed and plausible, which is what made this dangerous:
    // nothing downstream could tell it from an analyzer answer.
    const result = await throughThePipe({
      entities: {
        items: [{ normalizedName: 'chicken sandwich', entityIds: ['e1'] }],
      },
      detectedLocale: 'vi',
    });
    // Ignored, not rejected: sending it is not an error, it is simply not
    // the caller's fact to state.
    expect(result.detectedLocale).toBeUndefined();
    expect(result.entities.items?.[0]?.normalizedName).toBe('chicken sandwich');
  });

  it('garbage values are ignored the same way — no 500, no free text', async () => {
    for (const garbage of [
      'not a locale at all',
      'es_MX',
      '../../etc/passwd',
      'x'.repeat(400),
      'und',
      '',
    ]) {
      const result = await throughThePipe({
        entities: { items: [{ normalizedName: 'tacos', entityIds: ['e1'] }] },
        detectedLocale: garbage,
      });
      expect(result.detectedLocale).toBeUndefined();
    }
  });

  it('the field is not settable through any casing/aliasing of the body', async () => {
    // `whitelist` drops unknown-shaped keys and `forbidNonWhitelisted`
    // rejects them, so a near-miss spelling cannot sneak past either.
    await expect(
      throughThePipe({
        entities: { items: [{ normalizedName: 'pho', entityIds: ['e1'] }] },
        detected_locale: 'vi',
      }),
    ).rejects.toBeTruthy();
  });
});

describe('what the SERVER writes is a real BCP-47 tag (A0 R2)', () => {
  it('canonicalizes what it keeps', () => {
    expect(normalizeDetectedLocaleTag('ES')).toBe('es');
    expect(normalizeDetectedLocaleTag('pt-br')).toBe('pt-BR');
    expect(normalizeDetectedLocaleTag('  vi  ')).toBe('vi');
    expect(normalizeDetectedLocaleTag('zh-hant')).toBe('zh-Hant');
  });

  it('an undecidable or malformed answer is NULL, never free text', () => {
    // The old normalizer trimmed and truncated to 35 chars, so every one of
    // these landed in the column as-is — a row the `locale = ANY(chain)`
    // match filter can never match, collected against at real cost.
    for (const bad of [
      'es_MX',
      'not a locale at all',
      'und',
      '',
      '   ',
      null,
      undefined,
      'x'.repeat(400),
    ]) {
      expect(normalizeDetectedLocaleTag(bad)).toBeNull();
    }
  });

  it('agrees with the shared locale normalizer — one dialect, two return shapes', () => {
    for (const tag of ['es', 'pt-BR', 'vi', 'zh-Hant', 'xx-klingon']) {
      expect(normalizeDetectedLocaleTag(tag)).toBe(normalizeLocaleTag(tag));
    }
  });
});
