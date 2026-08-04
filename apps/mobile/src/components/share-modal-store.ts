import {
  serializeDesireLinkToPath,
  type ParsedDesireLink,
} from '../navigation/runtime/desire-url-codec';
import type { SharedEntityKind } from '../services/messaging';
import { createSingletonSurfaceStore } from './singleton-surface-store';

/**
 * THE universal share modal (plans/page-registry.md §9b; W3). One surface,
 * invocable from anywhere, for every shareable object: send-in-app (messaging
 * fan-out over closeness-ranked targets), copy public link, OS share sheet.
 *
 * Same imperative store pattern as app-modal-store: `showShareModal(config)`
 * from any handler; `ShareModalHost` (mounted once at the app root) renders it
 * through the ONE OverlayModalSheet.
 */

export type ShareModalConfig = {
  kind: SharedEntityKind;
  /** list → listId, restaurant/dish → entityId, poll → pollId,
   *  comment → commentId, user_profile → userId. */
  id: string;
  /** Display name of the shared object (list name, dish name, …). */
  title?: string;
  /** Lists only: the already-known share slug (skips the enable-on-demand
   *  round-trip). Omit/null when unknown — copy-link enables share on demand
   *  via userListsService.enableShare (owner path, same as the W3F
   *  long-press Share action). */
  listShareSlug?: string | null;
  /** Lists only: whether the VIEWER owns the list. Enable-on-demand is an
   *  owner-only server path that mints a LIVE link capability (visibility is
   *  untouched — visibility canon 2026-07-12: visibility = discovery, the
   *  link = access), so: owner + no slug → copy-link asks for confirmation
   *  before minting; non-owner + no slug → the link rows are hidden entirely
   *  (send-in-app remains). */
  listOwnedByViewer?: boolean;
  /** Lists only: 'curated' = an app-curated (home) list — the public link is the
   *  /cl/<listId> lane (no slug, no enable-on-demand); absent = favorites. */
  listSource?: 'curated' | null;
  /** Curated lists only: the list's side — rides the /cl link's `type` param so the
   *  deep link reconstructs the exact listWorld composite. */
  listType?: 'restaurant' | 'dish';
};

export const SHARE_BASE_URL = process.env.EXPO_PUBLIC_SHARE_BASE_URL || 'https://crave-search.app';

/**
 * Public-link path for a shareable kind, via the desire-url-codec serializer
 * (the ONE URL vocabulary). Returns null where no public URL exists —
 * `comment` has no landing (DM-only share), and `list` needs a slug (null here
 * means "resolve on demand", not "no link kind").
 */
export const buildShareLinkPath = (config: ShareModalConfig): string | null => {
  const link = ((): Exclude<ParsedDesireLink, { kind: 'none' }> | null => {
    switch (config.kind) {
      case 'list':
        if (config.listSource === 'curated') {
          return {
            kind: 'entityAction',
            action: {
              kind: 'listWorld',
              listId: config.id,
              listType: config.listType ?? 'restaurant',
              title: config.title ?? '',
              source: 'curated',
            },
          };
        }
        return config.listShareSlug
          ? { kind: 'sharedList', shareSlug: config.listShareSlug }
          : null;
      case 'restaurant':
        return {
          kind: 'entityAction',
          action: {
            kind: 'restaurantWorld',
            restaurantId: config.id,
            restaurantName: config.title ?? '',
          },
        };
      case 'dish':
        // dish share id = the food entityId (SharePackageResolver contract).
        return {
          kind: 'entityAction',
          action: {
            kind: 'entityDesire',
            entityType: 'food',
            entityId: config.id,
            label: config.title ?? '',
          },
        };
      case 'poll':
        return { kind: 'polls', pollId: config.id };
      case 'user_profile':
        return {
          kind: 'entityAction',
          action: { kind: 'pushScene', scene: 'userProfile', params: { userId: config.id } },
        };
      case 'comment':
        return null;
    }
  })();
  return link == null ? null : serializeDesireLinkToPath(link);
};

// F892 (2026-08-03): module-local, not exported — its only reader is
// `shareConfigCanResolveLink` below. An export nothing imports is noise.
/** Kinds with NO public URL hide the copy-link / OS-share rows entirely. */
const shareKindHasPublicLink = (kind: SharedEntityKind): boolean => kind !== 'comment';

/**
 * THE ONE link-ownership verdict for a share config.
 *
 * F887 (2026-08-03): the three-clause predicate
 * `kind === 'list' && listSource !== 'curated' && !listShareSlug` was written THREE times —
 * once here (as `shareConfigCanResolveLink`, deciding whether the copy-link / OS-share rows
 * render at all) and twice in ShareModalHost (`resolveLinkUrl`, `confirmEnableShareThen`),
 * each re-deriving from raw fields the store had ALREADY evaluated. Three copies of one
 * predicate, and the host's copies fed an unreachable `throw new Error('no share path')`.
 * The store now returns a DISCRIMINANT and the host reads it:
 *
 *  - `'none'`        — no public URL exists, or minting one is not this viewer's to do
 *                      (comment is DM-only; a slug-less list can only be enabled by its
 *                      owner, so a non-owner's rows HIDE rather than fail on tap).
 *  - `'needs-enable'`— an owned, slug-less, non-curated list: the link exists only after
 *                      the owner confirms `enableShare`. Never mint silently.
 *  - `'ready'`       — `buildShareLinkPath` will produce a path right now.
 */
export type ShareLinkMode = 'none' | 'needs-enable' | 'ready';

export const resolveShareLinkMode = (config: ShareModalConfig): ShareLinkMode => {
  if (!shareKindHasPublicLink(config.kind)) {
    return 'none';
  }
  if (config.kind === 'list' && config.listSource !== 'curated' && config.listShareSlug == null) {
    return config.listOwnedByViewer === true ? 'needs-enable' : 'none';
  }
  return 'ready';
};

const store = createSingletonSurfaceStore<ShareModalConfig>();

export const shareModalStore = store;

export const showShareModal = (config: ShareModalConfig): void => store.show(config);

/** Identity-scoped by the shared factory: a deferred dismissal cannot kill a
 *  share modal that a newer `showShareModal` opened in the meantime. */
export const dismissShareModal = (config?: ShareModalConfig): void => store.close(config);

export const useShareModalConfig = (): ShareModalConfig | null => store.useValue();
