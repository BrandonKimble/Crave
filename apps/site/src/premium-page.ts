import type { SiteConfig } from './config';
import { clerkBrowserScriptUrl } from './clerk-frontend-api';

/**
 * THE WEB CHECKOUT ENTRY (business/business-model.md "Margin lever";
 * owner ruling 2026-08-01/08-03).
 *
 * Strava's dual-button pattern puts the WEB rail out-of-app on purpose: the
 * app's primary paywall button sends you here, this page signs you in and
 * asks the api for a hosted Stripe Checkout URL, and the browser follows it.
 * ~97% net instead of ~85%, Apple-commission-free because the purchase never
 * happens inside the app (April 2025 Epic v. Apple contempt ruling).
 *
 * WHAT THIS PAGE DOES NOT DO, and must never start doing:
 *  - It does not know the price. `POST /billing/checkout-session` takes an
 *    optional priceId and REFUSES anything but the configured premium price
 *    (single-product law). We send no priceId at all, so there is nothing
 *    here to get wrong.
 *  - It does not choose the success/cancel URLs. Those come from the api's
 *    STRIPE_CHECKOUT_SUCCESS_URL / STRIPE_CHECKOUT_CANCEL_URL. The DTO
 *    deliberately stopped accepting them from the client — a client-supplied
 *    redirect is an open redirect wearing a feature's clothes. /premium/success
 *    and /premium/cancelled exist to BE those configured URLs, not to be
 *    passed as them.
 *  - It does not grant anything. Access arrives only through the Stripe
 *    webhook -> access-grant ledger. Landing on /premium/success is a
 *    redirect, not a receipt, and the page says so.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const SHELL_STYLE = `
 :root { color-scheme: light dark; }
 * { margin:0; padding:0; box-sizing:border-box; }
 body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
 min-height:100vh; display:flex; flex-direction:column;
 background:#0e0f12; color:#f5f5f4; }
 main { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center;
 text-align:center; padding:48px 24px; }
 .logo { font-size:40px; font-weight:800; letter-spacing:-0.03em;
 background:linear-gradient(135deg,#ff6b4a,#ff3d68); -webkit-background-clip:text;
 background-clip:text; color:transparent; margin-bottom:16px; }
 h1 { font-size:clamp(22px,4vw,30px); font-weight:600; max-width:560px; line-height:1.3; margin-bottom:14px; }
 p.sub { color:#a3a3a0; font-size:17px; max-width:480px; line-height:1.55; margin-bottom:28px; }
 button.cta { padding:14px 28px; border-radius:14px; border:0; font-size:16px; font-weight:600;
 color:#fff; background:linear-gradient(135deg,#ff6b4a,#ff3d68); cursor:pointer; }
 button.cta[disabled] { opacity:.55; cursor:default; }
 .status { margin-top:18px; font-size:14px; color:#a3a3a0; min-height:20px; max-width:480px; }
 .status.error { color:#ff8a72; }
 #clerk-signin { margin-top:8px; }
 footer { display:flex; gap:24px; justify-content:center; padding:28px 16px 40px; flex-wrap:wrap; }
 footer a { color:#8a8a88; text-decoration:none; font-size:14px; }
 footer a:hover { color:#f5f5f4; }
 @media (prefers-color-scheme: light) {
 body { background:#fafaf9; color:#1c1917; }
 p.sub, .status { color:#78716c; }
 footer a { color:#a8a29e; } footer a:hover { color:#1c1917; }
 }
`;

function shell(title: string, bodyHtml: string, headExtra = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="robots" content="noindex">
<style>${SHELL_STYLE}</style>
${headExtra}
</head>
<body>
<main>
${bodyHtml}
</main>
<footer>
 <a href="/">Home</a>
 <a href="/privacy">Privacy Policy</a>
 <a href="/terms">Terms of Service</a>
 <a href="/support">Support</a>
</footer>
</body>
</html>
`;
}

/** Rendered when API_ORIGIN / CLERK_PUBLISHABLE_KEY are missing. Served 503:
 *  an unconfigured checkout is broken, and must LOOK broken to a monitor. */
export function renderPremiumUnconfigured(missing: string[]): string {
  return shell(
    'Crave Premium — unavailable',
    ` <div class="logo">Crave</div>
 <h1>Checkout is temporarily unavailable.</h1>
 <p class="sub">We could not start a checkout session. Nothing was charged.
 Please try again shortly, or contact
 <a href="mailto:support@craveapp.ai" style="color:inherit">support@craveapp.ai</a>.</p>
 <!-- Missing configuration: ${escapeHtml(missing.join(', '))} -->`
  );
}

export function renderPremium(config: SiteConfig): string {
  const publishableKey = config.clerkPublishableKey as string;
  const apiOrigin = config.apiOrigin as string;
  const scriptUrl = clerkBrowserScriptUrl(publishableKey);

  // Injected as JSON literals, never interpolated bare into JS.
  const boot = [
    `const CLERK_PUBLISHABLE_KEY = ${JSON.stringify(publishableKey)};`,
    `const CHECKOUT_URL = ${JSON.stringify(apiOrigin + '/api/v1/billing/checkout-session')};`,
    `const JWT_TEMPLATE = ${JSON.stringify(config.clerkJwtTemplate)};`,
  ].join('\n');

  const script = `
${boot}

const statusEl = () => document.getElementById('status');
const ctaEl = () => document.getElementById('cta');
const signInEl = () => document.getElementById('clerk-signin');

function setStatus(text, isError) {
  const el = statusEl();
  if (!el) return;
  el.textContent = text || '';
  el.className = isError ? 'status error' : 'status';
}

async function startCheckout() {
  const cta = ctaEl();
  if (cta) cta.disabled = true;
  setStatus('Starting secure checkout…', false);
  try {
    // The api verifies aud against CLERK_JWT_AUDIENCE and refuses anything
    // else, so this MUST be a template token, not the raw session token.
    const token = await window.Clerk.session.getToken({ template: JWT_TEMPLATE });
    if (!token) throw new Error('Could not read your session token.');
    const res = await fetch(CHECKOUT_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      // Empty body on purpose: Premium is the only product and the api owns
      // the price, so there is no price identifier for this page to get wrong.
      body: '{}',
    });
    if (!res.ok) {
      throw new Error('Checkout is unavailable right now (' + res.status + ').');
    }
    const data = await res.json();
    if (!data || typeof data.url !== 'string') {
      throw new Error('Checkout did not return a payment page.');
    }
    // The hosted Stripe Checkout page. This is the whole product of the call.
    window.location.href = data.url;
  } catch (err) {
    if (cta) cta.disabled = false;
    setStatus(
      (err && err.message ? err.message : 'Something went wrong.') +
        ' Nothing was charged.',
      true,
    );
  }
}

// The Clerk bundle is loaded async, so it may execute BEFORE or AFTER
// window 'load'. Neither event is a reliable trigger on its own — wait for
// the global itself, with a bounded deadline so a blocked CDN surfaces as a
// message instead of a page that sits there forever.
function whenClerkReady() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 15000;
    (function poll() {
      if (window.Clerk) return resolve(window.Clerk);
      if (Date.now() > deadline) return reject(new Error('Sign-in did not load.'));
      setTimeout(poll, 50);
    })();
  });
}

async function boot() {
  try {
    await whenClerkReady();
  } catch (err) {
    setStatus('Sign-in is unavailable right now. Nothing was charged.', true);
    return;
  }
  try {
    await window.Clerk.load();
  } catch (err) {
    setStatus('Sign-in is unavailable right now. Nothing was charged.', true);
    return;
  }
  if (window.Clerk.user) {
    const cta = ctaEl();
    if (cta) {
      cta.hidden = false;
      cta.addEventListener('click', startCheckout);
    }
    setStatus('Signed in as ' + (window.Clerk.user.primaryEmailAddress?.emailAddress || 'your account') + '.', false);
    return;
  }
  setStatus('Sign in to continue.', false);
  window.Clerk.mountSignIn(signInEl(), { afterSignInUrl: '/premium', afterSignUpUrl: '/premium' });
}

boot();
`;

  const head =
    `<script async crossorigin="anonymous" ` +
    `data-clerk-publishable-key="${escapeHtml(publishableKey)}" ` +
    `src="${escapeHtml(scriptUrl)}" type="text/javascript"></script>`;

  return shell(
    'Crave Premium',
    ` <div class="logo">Crave</div>
 <h1>Crave Premium</h1>
 <p class="sub">Unlock the full dish-level ranking. Checkout is handled by
 Stripe — we never see your card details.</p>
 <div id="clerk-signin"></div>
 <button id="cta" class="cta" type="button" hidden>Continue to secure checkout</button>
 <div id="status" class="status"></div>
 <script>${script}</script>`,
    head
  );
}

/** Must match the api's STRIPE_CHECKOUT_SUCCESS_URL. Deliberately does NOT
 *  claim the purchase succeeded — only the webhook grants access. */
export function renderPremiumSuccess(): string {
  return shell(
    'Crave Premium — thank you',
    ` <div class="logo">Crave</div>
 <h1>Thanks — your payment is being confirmed.</h1>
 <p class="sub">Premium unlocks in the app as soon as Stripe confirms the
 charge, usually within a few seconds. Open Crave and pull to refresh. If it
 has not appeared in a few minutes, email
 <a href="mailto:support@craveapp.ai" style="color:inherit">support@craveapp.ai</a>.</p>`
  );
}

/** Must match the api's STRIPE_CHECKOUT_CANCEL_URL. Per the paywall doctrine:
 *  never re-prompt a decliner with a second, different offer. */
export function renderPremiumCancelled(): string {
  return shell(
    'Crave Premium — checkout cancelled',
    ` <div class="logo">Crave</div>
 <h1>Checkout cancelled.</h1>
 <p class="sub">You were not charged. Crave is still yours to use for free.</p>`
  );
}
