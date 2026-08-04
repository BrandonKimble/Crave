import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import {
  resolveRequestLocale,
  type LocaleAwareRequest,
} from './request-locale';
import type { SupportedLocale } from './supported-locales';

/**
 * M1 — `@RequestLocale() locale: SupportedLocale`.
 *
 * The ONE way a controller learns which language to render in. It always
 * returns a supported locale (never undefined, never a raw header string), so
 * no call site ever has to write a fallback of its own — a per-call-site
 * default is how a "mostly English" product happens.
 */
export const RequestLocale = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): SupportedLocale =>
    resolveRequestLocale(ctx.switchToHttp().getRequest<LocaleAwareRequest>()),
);
