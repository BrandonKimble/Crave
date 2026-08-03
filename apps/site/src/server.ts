import { createServer } from 'node:http';
import { readConfig, missingCheckoutConfig } from './config';
import { handle } from './router';

/**
 * apps/site — craveapp.ai. Four static pages plus the web checkout entry.
 *
 * NO FRAMEWORK, NO DEPENDENCIES. This is a landing page with one fetch on it.
 * The shape it replaces (the whole source base64-encoded inside a Railway
 * startCommand) was unreviewable, not undersized; the fix is to put it in the
 * repo, not to put a framework under it. The workspace has ZERO entries in
 * `dependencies` on purpose — adding it to the monorepo must not touch
 * yarn.lock or slow anyone's install down.
 *
 * RUNTIME: `node:http`, which runs unchanged on Node and on Bun. The service
 * it replaces was a Bun function; this is deliberately one step more
 * portable, so the same server that ships is the one the tests exercise
 * (bun is not installed on the dev machine, and a test that cannot run is
 * not a test).
 */
const config = readConfig(process.env);

const missing = missingCheckoutConfig(config);
if (missing.length > 0) {
  // Loud, but NOT fatal: the landing page, privacy policy and terms must
  // keep serving. /premium answers 503 and names this same list.
  console.warn(
    `[site] web checkout is DISABLED — missing ${missing.join(', ')}. ` +
      `Static pages still serve; /premium will answer 503.`
  );
}

const server = createServer((request, response) => {
  // GET/HEAD only. The site takes no input — every mutation lives in the
  // api, behind Clerk.
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { allow: 'GET, HEAD' });
    response.end('Method Not Allowed');
    return;
  }
  const { pathname } = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const result = handle(pathname, config);
  response.writeHead(result.status, result.headers);
  response.end(request.method === 'HEAD' ? undefined : result.body);
});

// Bind dual-stack so both IPv4 and IPv6 health probes land, same reason as
// the api's `app.listen(port, '::')`.
server.listen(config.port, '::', () => {
  console.log(`[site] listening on :${config.port}`);
});
