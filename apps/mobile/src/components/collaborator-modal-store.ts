// Imperative store for the list-detail COLLABORATOR modal (§8.1), exactly the
// score-info-store / option-selector-store pattern: the surface calls
// showCollaboratorModal(payload) (idempotent — calling again UPDATES the open
// modal's payload, e.g. roster refetch after a kick, inviteState 'copied'), and
// the root CollaboratorModalHost renders the ONE sheet viewport-anchored. A
// panel-local OverlayModalSheet mount is WRONG by construction — absoluteFill
// anchors to the scrollable body's CONTENT box, so on a long list the sheet
// lands at content-bottom, offscreen (leg-12 sim RED on ListDetail).

import type { FavoriteListCollaborators, FavoriteListViewerRole } from '../services/favorite-lists';

export type CollaboratorModalPayload = {
  roster: FavoriteListCollaborators;
  viewerRole: FavoriteListViewerRole | undefined;
  myUserId: string | null;
  inviteState: 'idle' | 'copied' | 'unavailable';
  onCopyInvite: () => void;
  /** W3: opens the universal share modal for the list (NO join intent —
   *  the invite row keeps the ?join=1 collaborator semantics). */
  onShareList: () => void;
  onOpenProfile: (userId: string) => void;
  onKick: (userId: string) => void;
  onLeave: () => void;
  /** The OWNING surface's close handler — the host routes backdrop/swipe
   *  dismissal here so the surface's own visible-state stays the authority. */
  onRequestClose: () => void;
};

type Listener = () => void;

let currentPayload: CollaboratorModalPayload | null = null;
const listeners = new Set<Listener>();

const emit = (): void => {
  listeners.forEach((listener) => listener());
};

export const showCollaboratorModal = (payload: CollaboratorModalPayload): void => {
  currentPayload = payload;
  emit();
};

export const closeCollaboratorModal = (): void => {
  if (currentPayload == null) {
    return;
  }
  currentPayload = null;
  emit();
};

export const getCollaboratorModalPayload = (): CollaboratorModalPayload | null => currentPayload;

export const subscribeCollaboratorModal = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
