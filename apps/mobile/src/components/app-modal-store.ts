import React from 'react';

/**
 * Shareable in-app modal — a styled replacement for native `Alert.alert`.
 *
 * `showAppModal(config)` mirrors `Alert.alert(title, message, buttons)` so migrating a
 * call is mechanical, but it renders an in-app modal (`AppModalHost`, mounted once at
 * the app root) styled to match the app rather than the OS alert. Imperative API so it
 * drops into the same event handlers `Alert.alert` was called from.
 */

export type AppModalActionStyle = 'default' | 'cancel' | 'destructive';

export type AppModalAction = {
  label: string;
  onPress?: () => void;
  style?: AppModalActionStyle;
  testID?: string;
};

export type AppModalConfig = {
  title: string;
  message?: string;
  /** Defaults to a single dismissing "OK" when omitted. */
  actions?: AppModalAction[];
};

let currentConfig: AppModalConfig | null = null;
const listeners = new Set<() => void>();

const emit = (): void => {
  listeners.forEach((listener) => listener());
};

export const showAppModal = (config: AppModalConfig): void => {
  currentConfig = config;
  emit();
};

/**
 * Dismisses the modal. Pass the config being dismissed so a dismissal that raced a
 * newer `showAppModal` (e.g. the sheet's frame-deferred close after a swipe while an
 * async flow opened the next alert) can't kill the modal it never showed. Omitting the
 * argument dismisses unconditionally.
 */
export const dismissAppModal = (config?: AppModalConfig): void => {
  if (currentConfig == null) {
    return;
  }
  if (config !== undefined && config !== currentConfig) {
    return;
  }
  currentConfig = null;
  emit();
};

/**
 * THE UNIFORM FAILURE ANNOUNCEMENT (owner spec, 2026-07-08): every online failure in
 * the app announces through this one modal — identical copy and surface everywhere, so
 * no per-surface failure design exists. ONE action ("Try again" when a retry is
 * provided, "OK" otherwise); the swipe/backdrop dismiss is the implicit "not now".
 * Offline it announces NOTHING: offline is the universal hang — the black system
 * banner explains, skeletons persist, loaded content stays.
 *
 * `isOffline` is injected lazily to keep this store dependency-free; wired once at app
 * boot from the system status store.
 */
let readIsOffline: (() => boolean) | null = null;

export const wireFailureAnnouncerOfflineRead = (read: () => boolean): void => {
  readIsOffline = read;
};

export const announceFailureIfOnline = (options?: { onRetry?: () => void }): void => {
  if (readIsOffline?.() === true) {
    return;
  }
  showAppModal({
    title: 'Something went wrong',
    message: "We couldn't complete that. Please try again.",
    actions: [
      options?.onRetry != null
        ? {
            label: 'Try again',
            style: 'default',
            testID: 'app-modal-try-again',
            onPress: options.onRetry,
          }
        : { label: 'OK', style: 'default', testID: 'app-modal-dismiss' },
    ],
  });
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = (): AppModalConfig | null => currentConfig;

export const useAppModalConfig = (): AppModalConfig | null =>
  React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
