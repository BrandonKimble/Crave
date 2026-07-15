import React from 'react';
import { Linking } from 'react-native';

import { invokeLifecycleHarnessVerb } from './lifecycle-harness-registry';

/**
 * Deep-link listener for the lifecycle harness (Phase-3 Leg 1). URL shape:
 *   crave://lifecycle-harness?verb=<name>&id=<correlationId>&payload=<uriencoded JSON>
 * Dev-only by mount site. Unlike the perf-scenario command channel, harness
 * verbs need NO active scenario — the harness is a standalone bus.
 */
const HARNESS_HOST = 'lifecycle-harness';

const parseHarnessUrl = (
  url: string | null
): { verb: string; id: string; payload: Record<string, unknown> } | null => {
  if (!url) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  // Custom-scheme URLs park the first segment in hostname (desire-url-codec
  // lesson) — accept host or first path segment.
  const target = parsed.hostname || parsed.pathname.replace(/^\//, '').split('/')[0];
  if (target !== HARNESS_HOST) {
    return null;
  }
  const verb = parsed.searchParams.get('verb');
  if (!verb) {
    return null;
  }
  const id = parsed.searchParams.get('id') ?? `noid-${verb}`;
  let payload: Record<string, unknown> = {};
  const rawPayload = parsed.searchParams.get('payload');
  if (rawPayload) {
    try {
      payload = JSON.parse(rawPayload) as Record<string, unknown>;
    } catch {
      payload = { __parseError: rawPayload };
    }
  }
  return { verb, id, payload };
};

export const LifecycleHarnessCoordinator: React.FC = () => {
  React.useEffect(() => {
    let disposed = false;
    const handle = (url: string | null): void => {
      const command = parseHarnessUrl(url);
      if (!command || disposed) {
        return;
      }
      void invokeLifecycleHarnessVerb(command);
    };
    Linking.getInitialURL()
      .then(handle)
      .catch(() => undefined);
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handle(url);
    });
    return () => {
      disposed = true;
      subscription.remove();
    };
  }, []);
  return null;
};
