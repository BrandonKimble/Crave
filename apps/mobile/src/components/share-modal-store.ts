import React from 'react';

import {
  serializeDesireLinkToPath,
  type ParsedDesireLink,
} from '../navigation/runtime/desire-url-codec';
import type { SharedEntityKind } from '../services/messaging';

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
   *  via favoriteListsService.enableShare (owner path, same as the W3F
   *  long-press Share action). */
  listShareSlug?: string | null;
  /** Lists only: whether the VIEWER owns the list. Enable-on-demand is an
   *  owner-only server path AND it flips a private list publicly linkable, so:
   *  owner + no slug → copy-link asks for confirmation first; non-owner + no
   *  slug → the link rows are hidden entirely (send-in-app remains). */
  listOwnedByViewer?: boolean;
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

/** Kinds with NO public URL hide the copy-link / OS-share rows entirely. */
export const shareKindHasPublicLink = (kind: SharedEntityKind): boolean => kind !== 'comment';

/** Whether THIS config can produce a public link at all: comment never; a
 *  list with no known slug only via the owner's enable-on-demand path — a
 *  non-owner has no way to mint one, so the rows hide instead of failing. */
export const shareConfigCanResolveLink = (config: ShareModalConfig): boolean => {
  if (!shareKindHasPublicLink(config.kind)) {
    return false;
  }
  if (config.kind === 'list' && config.listShareSlug == null) {
    return config.listOwnedByViewer === true;
  }
  return true;
};

let currentConfig: ShareModalConfig | null = null;
const listeners = new Set<() => void>();

const emit = (): void => {
  listeners.forEach((listener) => listener());
};

export const showShareModal = (config: ShareModalConfig): void => {
  currentConfig = config;
  emit();
};

export const dismissShareModal = (config?: ShareModalConfig): void => {
  if (currentConfig == null) {
    return;
  }
  if (config !== undefined && config !== currentConfig) {
    return;
  }
  currentConfig = null;
  emit();
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = (): ShareModalConfig | null => currentConfig;

export const useShareModalConfig = (): ShareModalConfig | null =>
  React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
