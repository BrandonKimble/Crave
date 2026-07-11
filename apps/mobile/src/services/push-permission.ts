import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

/**
 * §8.9 push-permission moment: the OS prompt fires after the user's FIRST
 * CONTRIBUTION (poll vote/endorsement, comment or poll created, photo posted,
 * DM sent) — NEVER at first launch. This module owns the one ask:
 *
 * - `requestPushPermissionIfEligible()` — fire-and-forget, called AFTER a
 *   contribution succeeds. Prompts at most once ever (persisted flag); once
 *   asked — granted OR denied — we never ask again (the OS owns re-prompts
 *   via Settings).
 * - AuthProvider's registrar NEVER prompts: it registers the token only when
 *   permission is already granted (getPermissionsAsync), and re-runs on the
 *   grant signal below.
 */

const ASKED_FLAG_KEY = 'crave.pushPermission.asked.v1';

// In-memory mirror so concurrent contribution hooks can't double-prompt
// while AsyncStorage reads are in flight.
let askInFlight = false;
let askedThisSession = false;

// Grant signal → AuthProvider's registrar effect re-runs and registers the
// token (useSyncExternalStore version counter; no store dependency).
let grantVersion = 0;
const grantListeners = new Set<() => void>();

const notifyGranted = (): void => {
  grantVersion += 1;
  grantListeners.forEach((listener) => listener());
};

const subscribeGrant = (listener: () => void): (() => void) => {
  grantListeners.add(listener);
  return () => {
    grantListeners.delete(listener);
  };
};

const readGrantVersion = (): number => grantVersion;

/** Bumps when the contribution-moment prompt is GRANTED — include in the
 *  token-registrar effect deps so registration happens immediately. */
export const usePushPermissionGrantVersion = (): number =>
  React.useSyncExternalStore(subscribeGrant, readGrantVersion, readGrantVersion);

/**
 * The §8.9 contribution-moment ask. Fire-and-forget (`void` it) — never
 * blocks or fails the contribution that triggered it.
 */
export const requestPushPermissionIfEligible = (): void => {
  if (askInFlight || askedThisSession) {
    return;
  }
  askInFlight = true;
  void (async () => {
    try {
      if (!Constants.isDevice) {
        return; // simulators can't receive push — mirror the registrar's gate
      }
      const current = await Notifications.getPermissionsAsync();
      if (current.status === 'granted') {
        askedThisSession = true;
        return; // nothing to ask; the registrar already covers this state
      }
      if (!current.canAskAgain) {
        askedThisSession = true;
        return; // OS-level denied — only Settings can change it
      }
      const asked = await AsyncStorage.getItem(ASKED_FLAG_KEY);
      if (asked != null) {
        askedThisSession = true;
        return; // asked in a previous session — never ask twice
      }
      const result = await Notifications.requestPermissionsAsync();
      askedThisSession = true;
      await AsyncStorage.setItem(ASKED_FLAG_KEY, new Date().toISOString());
      if (result.status === 'granted') {
        notifyGranted();
      }
    } catch (error) {
      console.warn('[PushPermission] Contribution-moment ask failed', error);
    } finally {
      askInFlight = false;
    }
  })();
};
