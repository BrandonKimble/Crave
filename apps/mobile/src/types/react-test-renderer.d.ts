/**
 * Ambient types for `react-test-renderer` (F1791).
 *
 * WHY THIS FILE EXISTS: react-test-renderer 19.1.0 ships no `.d.ts`, and
 * DefinitelyTyped's `@types/react-test-renderer` was deprecated at React 19
 * (the package is no longer published for this major). With `noImplicitAny`,
 * every render-spec that imported it was a TS7016 error — which is why
 * `yarn tsc:specs` reported 16 of its 26 errors from this one missing module.
 *
 * WHY IT IS NOT `declare module 'react-test-renderer';`: that one-liner types
 * the whole module as `any`, which does not FIX the check — it deletes it. A
 * spec harness typed `any` is a type check that cannot fail, the exact class of
 * defect this audit exists to remove. So the surface the repo actually uses is
 * typed for real, and anything beyond it is still a compile error (which is the
 * correct prompt to extend this file deliberately).
 */
declare module 'react-test-renderer' {
  import type { ReactElement } from 'react';

  export type ReactTestInstance = {
    instance: unknown;
    type: ElementType;
    props: Record<string, unknown>;
    parent: ReactTestInstance | null;
    children: Array<ReactTestInstance | string>;
    find(predicate: (node: ReactTestInstance) => boolean): ReactTestInstance;
    findAll(
      predicate: (node: ReactTestInstance) => boolean,
      options?: { deep?: boolean }
    ): ReactTestInstance[];
    findByType(type: ElementType): ReactTestInstance;
    findAllByType(type: ElementType, options?: { deep?: boolean }): ReactTestInstance[];
    findByProps(props: Record<string, unknown>): ReactTestInstance;
    findAllByProps(
      props: Record<string, unknown>,
      options?: { deep?: boolean }
    ): ReactTestInstance[];
  };

  type ElementType = string | ((...args: never[]) => unknown) | object;

  export type ReactTestRendererJSON = {
    type: string;
    props: Record<string, unknown>;
    children: Array<ReactTestRendererJSON | string> | null;
  };

  export type ReactTestRenderer = {
    root: ReactTestInstance;
    toJSON(): ReactTestRendererJSON | ReactTestRendererJSON[] | null;
    toTree(): unknown;
    unmount(nextElement?: ReactElement): void;
    update(nextElement: ReactElement): void;
    unstable_flushSync<T>(fn: () => T): T;
  };

  export type TestRendererOptions = {
    createNodeMock?: (element: ReactElement) => unknown;
    unstable_isConcurrent?: boolean;
  };

  export function create(
    nextElement: ReactElement,
    options?: TestRendererOptions
  ): ReactTestRenderer;

  export function act(callback: () => void | undefined): void;
  export function act(callback: () => Promise<void | undefined>): Promise<void>;

  const TestRenderer: {
    create: typeof create;
    act: typeof act;
  };
  export default TestRenderer;
}
