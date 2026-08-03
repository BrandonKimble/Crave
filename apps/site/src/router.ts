import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SiteConfig } from './config';
import { missingCheckoutConfig } from './config';
import {
  renderPremium,
  renderPremiumCancelled,
  renderPremiumSuccess,
  renderPremiumUnconfigured,
} from './premium-page';

/**
 * THE ROUTE TABLE IS THE WHOLE SERVER.
 *
 * This replaces a Railway "function" whose entire source was a base64 blob
 * inside the service's startCommand — four HTML constants and an if-chain
 * that lived nowhere a diff could see it. The pages below are the SAME four
 * pages, captured byte-for-byte from the live site (the only edit: Cloudflare's
 * injected email obfuscation was undone back to plain mailto: links, so the
 * page no longer depends on a CDN script to render a support address).
 */

const PAGES_DIR = join(__dirname, 'pages');

function readPage(name: string): string {
  return readFileSync(join(PAGES_DIR, `${name}.html`), 'utf8');
}

/** The four pages that existed before this rederivation. */
export const STATIC_PAGES = {
  '/': 'index',
  '/privacy': 'privacy',
  '/terms': 'terms',
  '/support': 'support',
} as const;

export interface SiteResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

const HTML = 'text/html; charset=utf-8';

function html(body: string, status = 200): SiteResponse {
  return {
    status,
    headers: {
      'content-type': HTML,
      // No inline-script CSP here: the premium page's boot script is inline
      // by design (it carries the injected config), and a nonce-less policy
      // that forbade it would break the only page that matters.
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
    },
    body,
  };
}

function redirect(location: string): SiteResponse {
  return { status: 302, headers: { location }, body: '' };
}

/**
 * Path normalization. `/privacy/` and `/Privacy` are the same page; anything
 * unrecognized goes home rather than serving a 404 shell we would then have
 * to design and maintain.
 */
export function normalizePath(pathname: string): string {
  const lowered = pathname.toLowerCase();
  if (lowered === '/') return '/';
  return lowered.replace(/\/+$/, '');
}

export function handle(pathname: string, config: SiteConfig): SiteResponse {
  const path = normalizePath(pathname);

  // Liveness. Railway's healthcheck and the deploy smoke both need a route
  // that answers without touching Clerk, Stripe, or any config at all.
  if (path === '/healthz') {
    return {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ status: 'ok' }),
    };
  }

  const staticName = (STATIC_PAGES as Record<string, string | undefined>)[path];
  if (staticName) return html(readPage(staticName));

  if (path === '/premium') {
    const missing = missingCheckoutConfig(config);
    if (missing.length > 0) {
      // 503, not 200: an unconfigured checkout is an outage, and a monitor
      // must be able to see it. See premium-page.ts.
      return html(renderPremiumUnconfigured(missing), 503);
    }
    return html(renderPremium(config));
  }
  if (path === '/premium/success') return html(renderPremiumSuccess());
  if (path === '/premium/cancelled') return html(renderPremiumCancelled());

  return redirect('/');
}
