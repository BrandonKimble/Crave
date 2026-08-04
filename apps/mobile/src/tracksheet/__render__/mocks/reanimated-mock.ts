// ─── react-native-reanimated mock (render lane) ──────────────────────────────
//
// Reactive-enough shared values: a write notifies every registered reaction
// (skipping writes where Object.is says nothing changed, so reactions that
// write their own shared values converge instead of looping). This stubs the
// UI-thread machinery only — the reactions that run are the HOST'S, verbatim.

import React from 'react';

type Reaction = {
  prepare: () => unknown;
  react: (current: unknown, previous: unknown) => void;
  last: unknown;
  started: boolean;
};

const reactions = new Set<Reaction>();
let notifyDepth = 0;

const notifyAll = () => {
  if (notifyDepth > 25) {
    throw new Error('reanimated-mock: reaction cascade did not converge');
  }
  notifyDepth += 1;
  try {
    for (const reaction of [...reactions]) {
      const current = reaction.prepare();
      const previous = reaction.last;
      reaction.last = current;
      reaction.react(current, reaction.started ? previous : null);
      reaction.started = true;
    }
  } finally {
    notifyDepth -= 1;
  }
};

export type SharedValue<T> = { value: T };

const makeMutable = <T>(initial: T): SharedValue<T> => {
  let current = initial;
  return {
    get value() {
      return current;
    },
    set value(next: T) {
      if (Object.is(current, next)) {
        return;
      }
      current = next;
      notifyAll();
    },
  };
};

export const useSharedValue = <T>(initial: T): SharedValue<T> => {
  const ref = React.useRef<SharedValue<T> | null>(null);
  if (ref.current == null) {
    ref.current = makeMutable(initial);
  }
  return ref.current;
};

export const useDerivedValue = <T>(fn: () => T): SharedValue<T> => {
  const fnRef = React.useRef(fn);
  fnRef.current = fn;
  const ref = React.useRef<SharedValue<T> | null>(null);
  if (ref.current == null) {
    ref.current = {
      get value() {
        return fnRef.current();
      },
      set value(_next: T) {
        // derived values are read-only
      },
    };
  }
  return ref.current;
};

export const useAnimatedReaction = (
  prepare: () => unknown,
  react: (current: never, previous: never) => void,
  _deps?: unknown[]
): void => {
  const reactionRef = React.useRef<Reaction | null>(null);
  if (reactionRef.current == null) {
    reactionRef.current = {
      prepare,
      react: react as Reaction['react'],
      last: undefined,
      started: false,
    };
  }
  reactionRef.current.prepare = prepare;
  reactionRef.current.react = react as Reaction['react'];
  const reaction = reactionRef.current;
  React.useEffect(() => {
    reactions.add(reaction);
    if (!reaction.started) {
      const current = reaction.prepare();
      reaction.last = current;
      reaction.started = true;
      reaction.react(current, null);
    }
    return () => {
      reactions.delete(reaction);
    };
  }, [reaction]);
};

export const useAnimatedScrollHandler = (
  handlers: Record<string, (event: never) => void>,
  _deps?: unknown[]
): Record<string, (event: never) => void> => handlers;

export const useAnimatedStyle = (
  _fn: () => unknown,
  _deps?: unknown[]
): Record<string, unknown> => ({});

export const runOnJS =
  <A extends unknown[]>(fn: (...args: A) => void) =>
  (...args: A): void =>
    fn(...args);

export const withTiming = (value: number, _config?: unknown): number => value;

export const interpolate = (
  value: number,
  input: readonly number[],
  output: readonly number[],
  _mode?: unknown
): number => {
  if (value <= input[0]) return output[0];
  if (value >= input[input.length - 1]) return output[output.length - 1];
  return output[0];
};

export const Easing = {
  out: <T>(fn: T): T => fn,
  cubic: (x: number): number => x,
};

const Reanimated = {
  View: 'Reanimated.View',
  Text: 'Reanimated.Text',
  ScrollView: 'Reanimated.ScrollView',
  createAnimatedComponent: <T>(component: T): T => component,
};

export const createAnimatedComponent = Reanimated.createAnimatedComponent;

export default Reanimated;
