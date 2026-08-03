/**
 * Clerk's browser bundle must be loaded FROM THE INSTANCE'S OWN FRONTEND API
 * HOST, not from a generic CDN — that host is what the publishable key
 * encodes, and loading it from anywhere else means the script and the key
 * can disagree about which Clerk instance you are talking to.
 *
 * The key's shape is `pk_(test|live)_<base64url(frontendApi + "$")>`. This is
 * a pure decode: no network call, no Clerk SDK on the server, nothing secret.
 * We derive it here rather than adding a fourth env var, because a
 * hand-typed host that disagrees with the key is a class of outage we can
 * simply not have.
 */
export function clerkFrontendApiFromPublishableKey(publishableKey: string): string {
  const match = /^pk_(test|live)_([A-Za-z0-9_-]+=*)$/.exec(publishableKey.trim());
  if (!match) {
    throw new Error(
      `CLERK_PUBLISHABLE_KEY is not a Clerk publishable key ` +
        `(expected pk_test_… or pk_live_…). Refusing to guess a frontend ` +
        `API host: a wrong host silently signs visitors into the wrong ` +
        `Clerk instance, and the api then rejects every token.`
    );
  }
  const decoded = Buffer.from(match[2], 'base64').toString('utf8');
  if (!decoded.endsWith('$')) {
    throw new Error(
      `CLERK_PUBLISHABLE_KEY decoded to ${JSON.stringify(decoded)}, which ` +
        `does not end in the "$" terminator Clerk appends. The key is ` +
        `truncated or corrupted.`
    );
  }
  const host = decoded.slice(0, -1);
  // A host with a slash or scheme would let a malformed key inject a path
  // into the <script src>. Only a hostname is ever valid here.
  if (!/^[A-Za-z0-9.-]+$/.test(host)) {
    throw new Error(
      `CLERK_PUBLISHABLE_KEY decoded to a non-hostname ` +
        `${JSON.stringify(host)}; refusing to build a script URL from it.`
    );
  }
  return host;
}

export function clerkBrowserScriptUrl(publishableKey: string): string {
  const host = clerkFrontendApiFromPublishableKey(publishableKey);
  return `https://${host}/npm/@clerk/clerk-js@5/dist/clerk.browser.js`;
}
