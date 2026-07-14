// Imperative store for the ONE listEdit panel (wave-3 charter §4 — the registry's
// `listEdit`): a single create-vs-edit surface for a list's metadata
// (name / description / visibility), opened from
//   • the Lists home header plus  → listEdit(create) — the home popup form is DEAD,
//   • the per-list ellipsis "Edit" → listEdit(edit, prefilled) — "Rename" is renamed.
// Root-host pattern (score-info-store / collaborator-modal-store): panels call
// showListEdit(); the root ListEditHost renders the sheet viewport-anchored.

import type { FavoriteListType, FavoriteListVisibility } from '../services/favorite-lists';

export type ListEditPayload =
  | {
      mode: 'create';
      /** The side the new list belongs to (the home toggle's current side). */
      listType: FavoriteListType;
    }
  | {
      mode: 'edit';
      listId: string;
      /** Prefill. */
      name: string;
      description: string | null;
      visibility: FavoriteListVisibility;
    };

type Listener = () => void;

let currentPayload: ListEditPayload | null = null;
const listeners = new Set<Listener>();

const emit = (): void => {
  listeners.forEach((listener) => listener());
};

export const showListEdit = (payload: ListEditPayload): void => {
  currentPayload = payload;
  emit();
};

export const closeListEdit = (): void => {
  if (currentPayload == null) {
    return;
  }
  currentPayload = null;
  emit();
};

export const getListEditPayload = (): ListEditPayload | null => currentPayload;

export const subscribeListEdit = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
