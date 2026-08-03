// Imperative store for the ONE listEdit panel (wave-3 charter §4 — the registry's
// `listEdit`): a single create-vs-edit surface for a list's metadata
// (name / description / visibility), opened from
//   • the Lists home header plus  → listEdit(create) — the home popup form is DEAD,
//   • the per-list ellipsis "Edit" → listEdit(edit, prefilled) — "Rename" is renamed.
// Root-host pattern (score-info-store / collaborator-modal-store): panels call
// showListEdit(); the root ListEditHost renders the sheet viewport-anchored.

import type { UserListType, UserListVisibility } from '../services/user-lists';
import { createSingletonSurfaceStore } from './singleton-surface-store';

export type ListEditPayload =
  | {
      mode: 'create';
      /** The side the new list belongs to (the home toggle's current side). */
      listType: UserListType;
    }
  | {
      mode: 'edit';
      listId: string;
      /** Prefill. */
      name: string;
      description: string | null;
      visibility: UserListVisibility;
    };

const store = createSingletonSurfaceStore<ListEditPayload>();

export const listEditStore = store;

export const showListEdit = (payload: ListEditPayload): void => store.show(payload);

/** F880: identity-scoped close from the shared factory. */
export const closeListEdit = (payload?: ListEditPayload): void => store.close(payload);

export const getListEditPayload = (): ListEditPayload | null => store.getSnapshot();

export const subscribeListEdit = (listener: () => void): (() => void) => store.subscribe(listener);
