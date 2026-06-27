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

export const dismissAppModal = (): void => {
  if (currentConfig != null) {
    currentConfig = null;
    emit();
  }
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
