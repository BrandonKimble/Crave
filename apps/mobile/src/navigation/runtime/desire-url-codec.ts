// S-E (plans/trigger-nav-ideal-verdict.md — addressability): THE one parser+serializer
// pair making Desire ⇄ URL total. Search desires (query/shortcut/entity/list), scenes
// (poll, restaurant, user profile), and the already-emitted /l/<shareSlug> share links all
// speak ONE path vocabulary, valid under both the custom scheme (crave://…) and the share
// host (https://crave-search.app/…):
//
//   /r/<restaurantId>                       restaurant world        (legacy: /restaurant/<id>)
//   /e/<entityType>/<entityId>?label=…      entity desire (skip-LLM)
//   /u/<userId>                             user profile push
//   /l/<shareSlug>                          SHARED list (async getShared resolution)
//   /list/<listId>?type=…&title=…           list world by LIVE id (internal/notification links)
//   /q/<query>                              natural search desire
//   /s/<dishes|restaurants>                 viewport shortcut desire
//   /p/<pollId>?market=…    and  /polls?market=…
//
// Custom-scheme gotcha handled here once: `new URL('crave://l/abc')` puts the first segment
// in HOSTNAME, not pathname — the resolver folds hostname into the segment list for
// non-http(s) schemes. (This is why the old pathname-only restaurant parse never fired on
// real crave:// links.)
//
// OS-level registration for the https host (associated domains entitlement + hosted AASA)
// is an infra/release item — until it lands, https share links open the browser and only
// crave:// reaches the app. The codec is ready for both.

import type { EntityRefAction } from './entity-ref-action-policy';

export type ParsedDesireLink =
  | { kind: 'entityAction'; action: EntityRefAction }
  | { kind: 'sharedList'; shareSlug: string }
  | { kind: 'naturalSearch'; query: string }
  | { kind: 'shortcutSearch'; shortcutTab: 'dishes' | 'restaurants' }
  | { kind: 'polls'; marketKey?: string | null; pollId?: string | null }
  | { kind: 'none' };

const ENTITY_DESIRE_TYPES = ['food', 'food_attribute', 'restaurant_attribute'] as const;
type EntityDesireType = (typeof ENTITY_DESIRE_TYPES)[number];
const isEntityDesireType = (value: string): value is EntityDesireType =>
  (ENTITY_DESIRE_TYPES as readonly string[]).includes(value);

const resolveSegments = (parsed: URL): string[] => {
  const pathSegments = parsed.pathname
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
  const isWebScheme = parsed.protocol === 'http:' || parsed.protocol === 'https:';
  // Custom schemes park the first segment in hostname (crave://l/abc → host 'l').
  return isWebScheme || !parsed.hostname ? pathSegments : [parsed.hostname, ...pathSegments];
};

// RT-1 (red-team 2026-07-10): WHATWG URL accepts a stray '%' in the path but
// decodeURIComponent THROWS on it — and this codec runs inside the Linking event listener
// (a throw = crash) and the cold-launch getInitialURL chain (a throw = the intent silently
// lost). Malformed encodings fold to the raw segment: a garbled link degrades to a harmless
// lookup miss instead of taking the app down.
const safeDecode = (segment: string): string => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

export const parseDesireLink = (url: string): ParsedDesireLink => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: 'none' };
  }
  const segments = resolveSegments(parsed);
  const params = parsed.searchParams;
  const [head, a, b] = segments;
  switch (head) {
    case 'r':
    case 'restaurant':
      return a
        ? {
            kind: 'entityAction',
            action: {
              kind: 'restaurantWorld',
              restaurantId: safeDecode(a),
              restaurantName: params.get('name') ?? '',
            },
          }
        : { kind: 'none' };
    case 'e':
      return a && b && isEntityDesireType(a)
        ? {
            kind: 'entityAction',
            action: {
              kind: 'entityDesire',
              entityType: a,
              entityId: safeDecode(b),
              label: params.get('label') ?? '',
            },
          }
        : { kind: 'none' };
    case 'u':
      return a
        ? {
            kind: 'entityAction',
            action: {
              kind: 'pushScene',
              scene: 'userProfile',
              params: { userId: safeDecode(a) },
            },
          }
        : { kind: 'none' };
    case 'l':
      return a ? { kind: 'sharedList', shareSlug: safeDecode(a) } : { kind: 'none' };
    case 'list':
      return a
        ? {
            kind: 'entityAction',
            action: {
              kind: 'listWorld',
              listId: safeDecode(a),
              listType: params.get('type') === 'dish' ? 'dish' : 'restaurant',
              label: params.get('title') ?? '',
            },
          }
        : { kind: 'none' };
    case 'q':
      return a ? { kind: 'naturalSearch', query: safeDecode(a) } : { kind: 'none' };
    case 's':
      return a === 'dishes' || a === 'restaurants'
        ? { kind: 'shortcutSearch', shortcutTab: a }
        : { kind: 'none' };
    case 'p':
      return a
        ? { kind: 'polls', pollId: safeDecode(a), marketKey: params.get('market') }
        : { kind: 'none' };
    case 'polls':
      return { kind: 'polls', marketKey: params.get('market'), pollId: params.get('poll') };
    default:
      return { kind: 'none' };
  }
};

// ─── Serializer (the other half of the bijection) ────────────────────────────────────────

const encodeSegment = (value: string): string => encodeURIComponent(value);

/** Serialize a parsed desire link back to a PATH (+query). Total over every ParsedDesireLink
 *  except 'none'. Prefix with a base (crave:/ or the share host) at the call site. */
export const serializeDesireLinkToPath = (
  link: Exclude<ParsedDesireLink, { kind: 'none' }>
): string => {
  switch (link.kind) {
    case 'entityAction': {
      const action = link.action;
      switch (action.kind) {
        case 'restaurantWorld': {
          const name = action.restaurantName
            ? `?name=${encodeURIComponent(action.restaurantName)}`
            : '';
          return `/r/${encodeSegment(action.restaurantId)}${name}`;
        }
        case 'entityDesire': {
          const label = action.label ? `?label=${encodeURIComponent(action.label)}` : '';
          return `/e/${action.entityType}/${encodeSegment(action.entityId)}${label}`;
        }
        case 'pushScene':
          return `/u/${encodeSegment(action.params.userId)}`;
        case 'listWorld': {
          const title = action.label ? `&title=${encodeURIComponent(action.label)}` : '';
          return `/list/${encodeSegment(action.listId)}?type=${action.listType}${title}`;
        }
      }
      break;
    }
    case 'sharedList':
      return `/l/${encodeSegment(link.shareSlug)}`;
    case 'naturalSearch':
      return `/q/${encodeSegment(link.query)}`;
    case 'shortcutSearch':
      return `/s/${link.shortcutTab}`;
    case 'polls': {
      if (link.pollId) {
        const market = link.marketKey ? `?market=${encodeURIComponent(link.marketKey)}` : '';
        return `/p/${encodeSegment(link.pollId)}${market}`;
      }
      const market = link.marketKey ? `?market=${encodeURIComponent(link.marketKey)}` : '';
      return `/polls${market}`;
    }
  }
  // Exhaustive above; TypeScript narrows, this satisfies the return type.
  throw new Error('[DESIRE-URL] unreachable serializer arm');
};
