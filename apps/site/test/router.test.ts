import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readConfig } from '../src/config';
import { handle, STATIC_PAGES } from '../src/router';
import { clerkFrontendApiFromPublishableKey } from '../src/clerk-frontend-api';

// A structurally-valid publishable key for a fake instance. NOT a secret and
// not a real key: publishable keys are base64 of the frontend API host, so
// this is just "fake-clerk.example.com$" encoded. No vendor is ever contacted.
const FAKE_PK = 'pk_test_' + Buffer.from('fake-clerk.example.com$').toString('base64');

const CONFIGURED = readConfig({
  API_ORIGIN: 'https://api.example.com/',
  CLERK_PUBLISHABLE_KEY: FAKE_PK,
});
const UNCONFIGURED = readConfig({});

test('the four pre-existing pages all still serve', () => {
  for (const path of Object.keys(STATIC_PAGES)) {
    const res = handle(path, UNCONFIGURED);
    assert.equal(res.status, 200, `${path} must be 200`);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.body, /<!DOCTYPE html>/i);
  }
});

test('the preserved pages kept their copy and lost the Cloudflare injection', () => {
  assert.match(handle('/', UNCONFIGURED).body, /Find the best dishes near you/);
  assert.match(handle('/privacy', UNCONFIGURED).body, /Crave Privacy Policy/);
  assert.match(handle('/terms', UNCONFIGURED).body, /Crave Terms of Service/);
  assert.match(handle('/support', UNCONFIGURED).body, /Crave Support/);
  for (const path of ['/privacy', '/terms', '/support']) {
    const body = handle(path, UNCONFIGURED).body;
    assert.doesNotMatch(body, /cdn-cgi|__cf_email__/, `${path} still proxied`);
    assert.match(body, /mailto:support@craveapp\.ai/, `${path} lost its email`);
  }
});

test('static pages serve even when checkout is unconfigured', () => {
  // The whole point of the 503-on-/premium split: a billing misconfiguration
  // must never take the privacy policy or terms offline.
  assert.equal(handle('/terms', UNCONFIGURED).status, 200);
});

test('/premium wires sign-in and the checkout POST', () => {
  const res = handle('/premium', CONFIGURED);
  assert.equal(res.status, 200);
  // Clerk sign-in, loaded from the host the publishable key itself encodes.
  assert.match(res.body, /fake-clerk\.example\.com\/npm\/@clerk\/clerk-js@5/);
  assert.match(res.body, /mountSignIn/);
  assert.match(res.body, /data-clerk-publishable-key="pk_test_/);
  // The api call: exact path, bearer, template token.
  assert.match(res.body, /https:\/\/api\.example\.com\/api\/v1\/billing\/checkout-session/);
  assert.match(res.body, /'Bearer ' \+ token/);
  assert.match(res.body, /getToken\(\{ template: JWT_TEMPLATE \}\)/);
  assert.match(res.body, /JWT_TEMPLATE = "mobile"/);
  // ...and the redirect to the hosted Stripe page it returns.
  assert.match(res.body, /window\.location\.href = data\.url/);
});

test('/premium never names a price or a redirect URL', () => {
  // Single-product law + the open-redirect the DTO deliberately stopped
  // accepting. If either ever appears in this page, it is a regression.
  const body = handle('/premium', CONFIGURED).body;
  assert.doesNotMatch(body, /priceId/);
  assert.doesNotMatch(body, /successUrl|cancelUrl/);
  assert.match(body, /body: '\{\}'/);
});

test('/premium is 503 (not a broken 200) when unconfigured', () => {
  const res = handle('/premium', UNCONFIGURED);
  assert.equal(res.status, 503);
  assert.match(res.body, /API_ORIGIN, CLERK_PUBLISHABLE_KEY/);
  assert.match(res.body, /Nothing was charged/);
});

test('success and cancelled pages exist and make no false claim', () => {
  const success = handle('/premium/success', CONFIGURED);
  assert.equal(success.status, 200);
  // Only the webhook grants access; the redirect is not a receipt.
  assert.match(success.body, /being confirmed/);
  const cancelled = handle('/premium/cancelled', CONFIGURED);
  assert.equal(cancelled.status, 200);
  assert.match(cancelled.body, /not charged/);
});

test('unknown paths redirect home', () => {
  for (const path of ['/nope', '/premium/whatever', '/wp-admin']) {
    const res = handle(path, CONFIGURED);
    assert.equal(res.status, 302, `${path} must redirect`);
    assert.equal(res.headers.location, '/');
  }
});

test('trailing slashes and case do not 302 a real page away', () => {
  assert.equal(handle('/privacy/', UNCONFIGURED).status, 200);
  assert.equal(handle('/Privacy', UNCONFIGURED).status, 200);
  assert.equal(handle('/PREMIUM/Success', CONFIGURED).status, 200);
});

test('/healthz answers without any config at all', () => {
  const res = handle('/healthz', UNCONFIGURED);
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(res.body).status, 'ok');
});

test('API_ORIGIN trailing slash does not become a double slash', () => {
  assert.equal(
    readConfig({ API_ORIGIN: 'https://api.example.com///' }).apiOrigin,
    'https://api.example.com'
  );
});

test('a malformed publishable key is refused, never guessed', () => {
  // A wrong frontend-API host signs visitors into the wrong Clerk instance
  // and the api then rejects every token — fail loudly instead.
  assert.throws(
    () => clerkFrontendApiFromPublishableKey('not-a-key'),
    /not a Clerk publishable key/
  );
  assert.throws(
    () =>
      clerkFrontendApiFromPublishableKey(
        'pk_live_' + Buffer.from('no-terminator').toString('base64')
      ),
    /terminator/
  );
  assert.throws(
    () =>
      clerkFrontendApiFromPublishableKey(
        'pk_live_' + Buffer.from('evil.com/x$').toString('base64')
      ),
    /non-hostname/
  );
});
